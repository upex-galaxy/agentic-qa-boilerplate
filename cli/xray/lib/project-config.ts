/**
 * Xray CLI - Project Config Module
 *
 * Best-effort reads of `.agents/project.yaml` for advisory output. Nothing in
 * here gates a command: a missing/blank yaml simply degrades the advice (e.g.
 * the `exec create` environment warning names no suggested value).
 *
 * The extraction is pure (parsed yaml in, value out) so it is testable without
 * the filesystem; `readSuggestedEnvironment` owns fs.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';

/** `cli/xray/lib/` -> repo root. */
const REPO_ROOT = join(import.meta.dir, '..', '..', '..');
const PROJECT_YAML_PATH = join(REPO_ROOT, '.agents', 'project.yaml');

function asNonBlankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Pull the environment the session should be testing against from a parsed
 * `project.yaml` document: `testing.active_env` (a session override, when a
 * project records one) wins over `testing.default_env` (the shipped default).
 * Returns null when neither is a usable string — the boilerplate ships them
 * `null` on purpose.
 */
export function extractSuggestedEnvironment(parsed: unknown): string | null {
  if (parsed === null || typeof parsed !== 'object') {
    return null;
  }
  const testing = (parsed as Record<string, unknown>).testing;
  if (testing === null || typeof testing !== 'object') {
    return null;
  }
  const t = testing as Record<string, unknown>;
  return asNonBlankString(t.active_env) ?? asNonBlankString(t.default_env);
}

/**
 * Read `.agents/project.yaml` and extract the suggested Test Environment.
 * Returns null when the file is missing, unparseable, or holds no value —
 * never throws, because every caller is advisory-only.
 */
export function readSuggestedEnvironment(yamlPath: string = PROJECT_YAML_PATH): string | null {
  if (!existsSync(yamlPath)) {
    return null;
  }
  try {
    return extractSuggestedEnvironment(parseYaml(readFileSync(yamlPath, 'utf8')));
  }
  catch {
    return null;
  }
}
