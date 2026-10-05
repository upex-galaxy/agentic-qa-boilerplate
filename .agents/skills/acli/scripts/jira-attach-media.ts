#!/usr/bin/env bun
/**
 * Embed an uploaded image / video inline in a Jira Cloud ADF field.
 *
 * Bundled with the acli skill. ADF media is NOT plain Markdown — `![](path)`
 * does not work, because a media node needs the opaque media-services UUID of an
 * uploaded file, which the public attachments API does not return directly. This
 * helper performs the verified 3-step recipe so callers do not have to:
 *
 *   1. Upload the file as a Jira attachment
 *        POST /rest/api/3/issue/{key}/attachments  (header X-Atlassian-Token: no-check)
 *      → returns a NUMERIC attachment id (unusable in a media node) + a `content` URL.
 *   2. Resolve the media-services UUID
 *        GET {content-url} with redirect disabled → the 302 `Location` is
 *        https://api.media.atlassian.com/file/<UUID>/binary?... → extract <UUID>.
 *   3. Build the ADF node
 *        mediaSingle > media{ type:"file", id:<UUID>, collection:"", width, height }
 *      Jira ignores the `collection` input and stores it as "" — verified empirically.
 *
 * Image dimensions are auto-detected for PNG / JPEG / GIF (zero-dependency header
 * reads); pass --width / --height to override or for formats / videos we cannot size.
 *
 * Credentials (ATLASSIAN_EMAIL · ATLASSIAN_API_TOKEN) are loaded by THIS process,
 * never exported into the calling shell: the process environment first (Bun's
 * own `.env` autoload, `bunx varlock run`),
 * then the repo root's `.env.local` and `.env`, so it works from any cwd. A
 * secret-manager project (`secrets.provider` != local) keeps no value in `.env`:
 * run it as `bunx varlock run -- bun <this file> ...`.
 *
 * The INSTANCE HOST does not: it is read from `.agents/project.yaml` ->
 * issue_tracker.atlassian_url, with ATLASSIAN_URL as fallback only. See
 * cli/lib/atlassian-instance.ts for why (a stale env host attaches evidence to
 * the wrong Atlassian site).
 *
 * CLI:
 *   bun jira-attach-media.ts <ISSUE-KEY> <file>                 # print the mediaSingle node JSON
 *   bun jira-attach-media.ts <ISSUE-KEY> <file> --doc           # wrap in a full ADF doc
 *   bun jira-attach-media.ts <ISSUE-KEY> <file> --publish       # post a comment with the image
 *   bun jira-attach-media.ts <ISSUE-KEY> <file> --publish --caption "Repro step 3"
 *   bun jira-attach-media.ts <ISSUE-KEY> <file> --width 800 --height 600 --layout wide
 *   bun jira-attach-media.ts <ISSUE-KEY> <file> --dry-run       # resolve host + credentials, no request
 *
 * Module:
 *   import { uploadAttachment, resolveMediaId, buildMediaNode } from "./jira-attach-media.ts";
 */

import { join } from "node:path";
import {
  formatInstanceMismatchWarning,
  resolveAtlassianInstance,
} from "../../../../cli/lib/atlassian-instance";
import { parseDotEnvPairs } from "../../../../cli/lib/variables-manifest";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..", "..");
const CREDENTIALS = ["ATLASSIAN_EMAIL", "ATLASSIAN_API_TOKEN"] as const;

type MediaNode = {
  type: "mediaSingle";
  attrs: { layout: string };
  content: Array<{ type: "media"; attrs: Record<string, unknown> }>;
};

type Attachment = { id: string; content: string; filename: string; mimeType: string };

/**
 * One credential, by name: the process environment, then `<root>/.env.local`,
 * then `<root>/.env` (the precedence varlock and Bun use). The value stays in
 * this process; nothing is exported, printed or written. Null when unset.
 */
function readCredential(
  name: string,
  processEnv: Record<string, string | undefined> = process.env,
  root: string = REPO_ROOT,
): string | null {
  const fromProcess = processEnv[name];
  if (fromProcess) return fromProcess;
  for (const file of [".env.local", ".env"]) {
    const value = parseDotEnvPairs(join(root, file)).get(name);
    if (value) return value;
  }
  return null;
}

function env(name: string): string {
  const v = readCredential(name);
  if (!v) {
    throw new Error(
      `missing ${name}: set it in .env (or run through \`bunx varlock run -- bun <this file> ...\` when a secret manager holds it) and retry`,
    );
  }
  return v;
}

/**
 * Instance host, resolved from `.agents/project.yaml` -> issue_tracker.atlassian_url
 * FIRST and only falling back to `ATLASSIAN_URL`. This helper UPLOADS files and
 * POSTS comments, so a stale env host would push bug evidence into whatever issue
 * happens to carry the same key on the other Atlassian site. Resolved once per
 * process; the mismatch warning is printed at most once.
 * Rationale: cli/lib/atlassian-instance.ts.
 */
let instanceCache: string | null = null;
function instanceUrl(): string {
  if (instanceCache !== null) return instanceCache;
  const resolved = resolveAtlassianInstance();
  const warning = formatInstanceMismatchWarning(resolved);
  if (warning) console.error(`⚠ ${warning}`);
  instanceCache = resolved.baseUrl;
  return instanceCache;
}

function authHeader(): string {
  return "Basic " + btoa(`${env("ATLASSIAN_EMAIL")}:${env("ATLASSIAN_API_TOKEN")}`);
}

// Zero-dependency intrinsic-size read for the common raster formats. Returns null
// when the format is unknown (video, SVG, etc.) — the caller then omits width/height.
function imageSize(buf: Uint8Array): { width: number; height: number } | null {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // PNG: \x89PNG, IHDR width@16 height@20 (big-endian uint32)
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  // GIF: GIF8, width@6 height@8 (little-endian uint16)
  if (buf.length >= 10 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
  }
  // JPEG: scan for a Start-Of-Frame marker, height@+5 width@+7 (big-endian)
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) {
        off++;
        continue;
      }
      const marker = buf[off + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: dv.getUint16(off + 7), height: dv.getUint16(off + 5) };
      }
      off += 2 + dv.getUint16(off + 2);
    }
  }
  return null;
}

async function uploadAttachment(issueKey: string, filePath: string): Promise<Attachment> {
  const base = instanceUrl();
  const bytes = new Uint8Array(await Bun.file(filePath).arrayBuffer());
  const name = filePath.split("/").pop() || "attachment";
  const form = new FormData();
  form.append("file", new File([bytes], name));
  const res = await fetch(`${base}/rest/api/3/issue/${issueKey}/attachments`, {
    method: "POST",
    headers: { Authorization: authHeader(), "X-Atlassian-Token": "no-check" },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`attachment upload failed: HTTP ${res.status} — ${await res.text()}`);
  }
  const arr = (await res.json()) as Attachment[];
  if (!Array.isArray(arr) || !arr[0]?.content) {
    throw new Error(`unexpected attachments response: ${JSON.stringify(arr)}`);
  }
  return arr[0];
}

// Follow (without downloading) the attachment content URL to read the media-services
// UUID out of the 302 redirect to api.media.atlassian.com.
async function resolveMediaId(contentUrl: string): Promise<string> {
  const res = await fetch(contentUrl, {
    method: "GET",
    headers: { Authorization: authHeader() },
    redirect: "manual",
  });
  const loc = res.headers.get("location");
  if (!loc) {
    throw new Error(`no redirect from ${contentUrl} (HTTP ${res.status}) — cannot resolve media id`);
  }
  const m = /\/file\/([0-9a-f-]+)\//i.exec(loc);
  if (!m) {
    throw new Error(`could not parse media UUID from redirect Location: ${loc}`);
  }
  return m[1];
}

function buildMediaNode(
  mediaId: string,
  opts: { width?: number; height?: number; alt?: string; layout?: string } = {},
): MediaNode {
  const attrs: Record<string, unknown> = { type: "file", id: mediaId, collection: "" };
  if (opts.width) attrs.width = opts.width;
  if (opts.height) attrs.height = opts.height;
  if (opts.alt) attrs.alt = opts.alt;
  return {
    type: "mediaSingle",
    attrs: { layout: opts.layout || "center" },
    content: [{ type: "media", attrs }],
  };
}

export { uploadAttachment, resolveMediaId, buildMediaNode, imageSize, readCredential };

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i !== -1 ? argv[i + 1] : undefined;
  };
  const has = (name: string) => argv.includes(name);
  const positional = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
  const [issueKey, filePath] = positional;

  if (!issueKey || !filePath) {
    console.error("usage: bun jira-attach-media.ts <ISSUE-KEY> <file> [--publish] [--doc] [--caption TEXT] [--width N --height N --layout center|wide|full-width]");
    process.exit(2);
  }

  const bytes = new Uint8Array(await Bun.file(filePath).arrayBuffer());
  const detected = imageSize(bytes);
  const width = flag("--width") ? Number(flag("--width")) : detected?.width;
  const height = flag("--height") ? Number(flag("--height")) : detected?.height;

  // Everything the upload needs, resolved without a single request: the host,
  // and each credential as `set` / `missing` (never its value).
  if (has("--dry-run")) {
    const credentials = Object.fromEntries(CREDENTIALS.map(name => [name, readCredential(name) ? "set" : "missing"]));
    process.stdout.write(JSON.stringify({ issueKey, host: instanceUrl(), credentials, file: filePath, width: width ?? null, height: height ?? null }, null, 2) + "\n");
    process.exit(Object.values(credentials).includes("missing") ? 1 : 0);
  }

  const att = await uploadAttachment(issueKey, filePath);
  const mediaId = await resolveMediaId(att.content);
  const node = buildMediaNode(mediaId, {
    width,
    height,
    alt: flag("--alt") || att.filename,
    layout: flag("--layout"),
  });

  const caption = flag("--caption");
  const docContent: unknown[] = [];
  if (caption) docContent.push({ type: "paragraph", content: [{ type: "text", text: caption }] });
  docContent.push(node);
  const doc = { type: "doc", version: 1, content: docContent };

  if (has("--publish")) {
    const res = await fetch(`${instanceUrl()}/rest/api/3/issue/${issueKey}/comment`, {
      method: "POST",
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ body: doc }),
    });
    if (!res.ok) {
      console.error(`comment publish failed: HTTP ${res.status} — ${await res.text()}`);
      process.exit(1);
    }
    console.error(`✓ published image comment on ${issueKey} (attachment ${att.id}, media ${mediaId})`);
  } else if (has("--doc")) {
    process.stdout.write(JSON.stringify(doc, null, 2));
  } else {
    process.stdout.write(JSON.stringify(node, null, 2));
  }
}
