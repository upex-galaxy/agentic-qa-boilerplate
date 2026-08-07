/**
 * Where Playwright keeps its downloaded browsers, per OS.
 *
 * Shared by `cli/install.ts` and `cli/doctor.ts` so the two cannot drift: they
 * previously disagreed, with doctor checking only the Linux path and therefore
 * reporting browsers as missing forever on Windows and macOS.
 *
 * Node built-ins only — `cli/doctor.ts --preflight` runs before `bun install`
 * and must not pull in a third-party dependency through this module.
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Every directory Playwright may have installed browsers into, most specific
 * first. `PLAYWRIGHT_BROWSERS_PATH=0` means "next to the package" rather than a
 * path, so it is not a candidate.
 */
export function playwrightCacheCandidates(): string[] {
  const override = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const home = homedir();
  return [
    ...(override && override !== '0' ? [override] : []),
    join(home, '.cache', 'ms-playwright'), // Linux, WSL
    join(home, 'Library', 'Caches', 'ms-playwright'), // macOS
    join(home, 'AppData', 'Local', 'ms-playwright'), // Windows
  ];
}

/**
 * Presence of a cache directory as a proxy for "browsers installed". Cheaper
 * than spawning `bunx playwright --version`, which only proves the npm package
 * is present, not the browser binaries.
 */
export function playwrightBrowsersInstalled(): boolean {
  return playwrightCacheCandidates().some(p => existsSync(p));
}
