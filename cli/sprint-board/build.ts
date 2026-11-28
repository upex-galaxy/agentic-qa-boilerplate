/**
 * Builds the page: app/main.ts (+ model.ts) into one classic IIFE script, and
 * app/styles.css as is. Cached until a source file changes. The same bundle is
 * served live and inlined into snapshots, so both run identical code.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const APP = join(import.meta.dir, 'app');
let cache: { key: string, js: string, css: string } | null = null;

function sourceKey(): string {
  const files = [...readdirSync(APP).map(f => join(APP, f)), join(import.meta.dir, 'model.ts'), join(import.meta.dir, 'merge.ts'), join(import.meta.dir, 'sweep.ts')];
  return files.map(f => `${f}:${statSync(f).mtimeMs}`).join('|');
}

export async function buildApp(): Promise<{ js: string, css: string }> {
  const key = sourceKey();
  if (cache?.key === key) { return cache; }
  const out = await Bun.build({ entrypoints: [join(APP, 'main.ts')], target: 'browser', format: 'iife', minify: false });
  if (!out.success) { throw new Error(out.logs.map(l => String(l)).join('\n')); }
  const js = await out.outputs[0].text();
  const css = readFileSync(join(APP, 'styles.css'), 'utf8');
  cache = { key, js, css };
  return cache;
}

/** Opens a URL in the default browser: `open` (macOS), `start` (Windows), `xdg-open` (elsewhere). */
export function openInBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? ['open', url] : process.platform === 'win32' ? ['cmd', '/c', 'start', '', url] : ['xdg-open', url];
  try { Bun.spawn(cmd, { stdout: 'ignore', stderr: 'ignore' }); }
  catch { console.log(`open ${url} in a browser`); }
}
