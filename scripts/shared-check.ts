#!/usr/bin/env bun
/**
 * @fileoverview Keeps the files shared by agentic-qa-boilerplate and
 * agentic-dev-boilerplate byte-identical (installer-ui owner answer Q8).
 *
 *   bun run shared:check                    every listed file matches its hash in shared-files.json
 *   bun run shared:check --sibling <path>   ... and is byte-identical in the sibling checkout
 *   bun run shared:check --write            re-hash the listed files (after changing one of them)
 *
 * How a change travels (QA -> Dev in the same wave): a change to a shared file
 * is made in one repo, `--write` re-hashes the manifest, and the SAME files
 * plus the SAME manifest are copied to the sibling repo and committed there in
 * the same wave. `shared:check --sibling ../<other repo>` proves it before the
 * push. The manifest is itself shared, so a repo that received the change and
 * not the port fails here, and so does one that edited a shared file without
 * re-hashing. Repo differences never go in a shared file: they go in
 * `cli/lib/ui/brand.ts` (or another file this manifest does not list).
 *
 * The check also fails on a file under `cli/lib/ui/` the manifest does not
 * list, so a new page module cannot be forgotten by the port.
 *
 * Inert outside the boilerplate's own checkout (`contractsEnforced`, the same
 * test the documentation contracts make): a project has no sibling repo, and
 * the manifest lists boilerplate tests that never reach it. It exits 0 there,
 * so a `repo:check` that still calls it stays green.
 *
 * Shared file: byte-identical in agentic-qa-boilerplate and agentic-dev-boilerplate.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { contractsEnforced } from './lib/doc-contracts.ts';

const toPosix = (p: string): string => p.replace(/\\/g, '/');

const ROOT = resolve(import.meta.dir, '..');
const MANIFEST = join(ROOT, 'scripts', 'shared-files.json');
/** Every file below this directory is shared, except the ones in LOCAL_ONLY. */
const SHARED_DIR = 'cli/lib/ui';
const LOCAL_ONLY = new Set(['cli/lib/ui/brand.ts']);

interface Manifest {
  description: string
  files: Record<string, string>
}

function sha(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { out.push(...walk(p)); }
    else { out.push(toPosix(relative(ROOT, p))); }
  }
  return out;
}

function readManifest(): Manifest {
  return JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
}

function main(): void {
  if (!contractsEnforced(ROOT)) {
    process.stdout.write('shared:check: inert outside the boilerplate\'s own checkout (contractsEnforced).\n');
    return;
  }
  const argv = process.argv.slice(2);
  const manifest = readManifest();
  const listed = Object.keys(manifest.files).sort();

  if (argv.includes('--write')) {
    const files: Record<string, string> = {};
    for (const f of listed) {
      if (!existsSync(join(ROOT, f))) { process.stderr.write(`shared:check: ${f} is listed but missing; remove it from ${toPosix(relative(ROOT, MANIFEST))} first.\n`); process.exit(1); }
      files[f] = sha(join(ROOT, f));
    }
    for (const f of walk(join(ROOT, SHARED_DIR))) {
      if (!LOCAL_ONLY.has(f) && !(f in files)) { files[f] = sha(join(ROOT, f)); }
    }
    const sorted = Object.fromEntries(Object.keys(files).sort().map(k => [k, files[k]]));
    writeFileSync(MANIFEST, `${JSON.stringify({ description: manifest.description, files: sorted }, null, 2)}\n`);
    process.stdout.write(`shared:check: ${Object.keys(sorted).length} file(s) hashed. Copy them and the manifest to the sibling repo in this same wave.\n`);
    return;
  }

  const problems: string[] = [];
  for (const f of listed) {
    const p = join(ROOT, f);
    if (!existsSync(p)) { problems.push(`missing: ${f}`); continue; }
    if (sha(p) !== manifest.files[f]) { problems.push(`changed without re-hashing: ${f} (run \`bun run shared:check --write\`, then port it to the sibling repo)`); }
  }
  for (const f of walk(join(ROOT, SHARED_DIR))) {
    if (!LOCAL_ONLY.has(f) && !(f in manifest.files)) { problems.push(`not listed: ${f} (shared files under ${SHARED_DIR}/ must be in the manifest; \`--write\` adds it)`); }
  }

  const i = argv.indexOf('--sibling');
  if (i >= 0) {
    const sibling = resolve(argv[i + 1] ?? '');
    if (!existsSync(join(sibling, 'scripts', 'shared-files.json'))) {
      problems.push(`sibling ${sibling} has no scripts/shared-files.json`);
    }
    else {
      for (const f of [...listed, 'scripts/shared-files.json']) {
        const theirs = join(sibling, f);
        if (!existsSync(theirs)) { problems.push(`sibling lacks: ${f}`); continue; }
        if (sha(theirs) !== sha(join(ROOT, f))) { problems.push(`differs from the sibling: ${f}`); }
      }
    }
  }

  if (problems.length > 0) {
    process.stderr.write(`shared:check failed (${problems.length}):\n${problems.map(p => `  - ${p}`).join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write(`shared:check: ${listed.length} shared file(s) intact${i >= 0 ? ', identical in the sibling' : ''}.\n`);
}

main();
