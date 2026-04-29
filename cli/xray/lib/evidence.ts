/**
 * Xray CLI - Evidence (attachment) helpers
 *
 * Reads files from disk into the AttachmentDataInput shape required by the
 * `addEvidenceToTestRun` and `addEvidenceToTestRunStep` GraphQL mutations,
 * and chunks batches to honour Xray Cloud's 20 MB request body limit.
 */

import type { AttachmentDataInput } from '../types/index.js';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

// ============================================================================
// MIME TYPES
// ============================================================================

// Minimal mime map covering the file types QA evidence sessions actually
// produce. Anything else falls through to application/octet-stream which
// Xray Cloud accepts for download even if the in-app preview is generic.
const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.log': 'text/plain',
  '.json': 'application/json',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.xml': 'application/xml',
  '.csv': 'text/csv',
  '.md': 'text/markdown',
  '.zip': 'application/zip',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

export function inferMimeType(filename: string): string {
  return MIME_BY_EXT[extname(filename).toLowerCase()] || 'application/octet-stream';
}

// ============================================================================
// FILE → ATTACHMENT
// ============================================================================

export function readFileAsAttachment(filePath: string): AttachmentDataInput {
  const buf = readFileSync(filePath);
  return {
    filename: basename(filePath),
    mimeType: inferMimeType(filePath),
    data: buf.toString('base64'),
  };
}

// ============================================================================
// DIR EXPANSION
// ============================================================================

const DIR_IGNORE = new Set(['.gitkeep', '.DS_Store', 'Thumbs.db']);

/**
 * Return every regular file directly inside `dirPath`, sorted alphabetically.
 * Subdirectories and dotfile metadata noise (.gitkeep, .DS_Store, ...) are
 * skipped silently — symlinks resolve through the stat call.
 */
export function listDirFiles(dirPath: string): string[] {
  const entries = readdirSync(dirPath);
  const files: string[] = [];
  for (const entry of entries.sort()) {
    if (DIR_IGNORE.has(entry)) {
      continue;
    }
    const full = join(dirPath, entry);
    if (statSync(full).isFile()) {
      files.push(full);
    }
  }
  return files;
}

// ============================================================================
// CHUNKING
// ============================================================================

// Xray Cloud's request body limit is 20 MB. We chunk at ~15 MB of base64
// payload to leave headroom for the GraphQL envelope and any other variables.
const DEFAULT_MAX_BATCH_BYTES = 15_000_000;

export function chunkAttachments(
  items: AttachmentDataInput[],
  maxBatchBytes: number = DEFAULT_MAX_BATCH_BYTES,
): AttachmentDataInput[][] {
  const batches: AttachmentDataInput[][] = [];
  let current: AttachmentDataInput[] = [];
  let currentBytes = 0;

  for (const item of items) {
    const itemBytes = item.data.length;
    if (current.length > 0 && currentBytes + itemBytes > maxBatchBytes) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(item);
    currentBytes += itemBytes;
  }

  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}
