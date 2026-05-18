import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface TemplateMarker {
  template?: string
  templateBranch?: string
  minCliVersion?: string
}

/**
 * Returns true iff the given directory is already a bootstrapped agentic-qa
 * project. Detection is based on:
 *   1. .template/installer.lock.json present + matching the expected template.
 *   2. package.json present + has `scripts.setup`.
 *   3. cli/install.ts present.
 */
export function isAgenticDevRepo(dir: string, expectedTemplate: string): boolean {
  const markerPath = join(dir, '.template', 'installer.lock.json');
  if (!existsSync(markerPath)) { return false; }

  try {
    const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as TemplateMarker;
    if (marker.template !== expectedTemplate) { return false; }
  }
  catch {
    return false;
  }

  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) { return false; }
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> };
    if (!pkg.scripts || typeof pkg.scripts.setup !== 'string') { return false; }
  }
  catch {
    return false;
  }

  if (!existsSync(join(dir, 'cli', 'install.ts'))) { return false; }

  return true;
}

export function isDirectoryEmpty(dir: string): boolean {
  if (!existsSync(dir)) { return true; }
  try {
    const entries = readdirSync(dir);
    // Tolerate common metadata files left behind by the OS / editors.
    const meaningful = entries.filter(e => !['.DS_Store', 'Thumbs.db', '.git'].includes(e));
    return meaningful.length === 0;
  }
  catch {
    return false;
  }
}
