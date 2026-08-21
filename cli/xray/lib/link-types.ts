/**
 * Xray CLI - Jira Link Type Catalog Module
 *
 * Resolves a link-type SLUG (e.g. `test`, `relates`, `test_execute`) into the
 * instance's display name + direction semantics from
 * `.agents/jira-required.yaml` -> `link_types`. The display name is NEVER
 * hardcoded in the CLI: a workspace may rename its link types, and the yaml is
 * the versioned catalog that tracks those names.
 *
 * The extraction is pure (parsed yaml in, resolved type out) so slug resolution
 * is testable without touching the filesystem; `loadLinkTypeCatalog` owns fs.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';

/** `cli/xray/lib/` -> repo root. */
const REPO_ROOT = join(import.meta.dir, '..', '..', '..');
const JIRA_REQUIRED_YAML_PATH = join(REPO_ROOT, '.agents', 'jira-required.yaml');

export interface ResolvedLinkType {
  slug: string
  /** Display name on the Jira instance (what REST `type.name` expects). */
  name: string
  /** Outward description — how the FROM side reads (e.g. `tests`). */
  outward: string
  /** Inward description — how the TO side reads (e.g. `is tested by`). */
  inward: string
  /** Slug to degrade to when the instance lacks this type, or null. */
  fallback: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNonBlankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Collect the `required` + `optional` slug maps under `link_types` into one
 * flat map. `required` wins on a duplicate slug (it is the canonical tier).
 */
function collectSlugEntries(parsed: unknown): Record<string, unknown> {
  const linkTypes = asRecord(asRecord(parsed)?.link_types);
  if (!linkTypes) {
    return {};
  }
  return {
    ...asRecord(linkTypes.optional),
    ...asRecord(linkTypes.required),
  };
}

/**
 * Resolve one slug from a parsed `jira-required.yaml` document.
 *
 * Returns null when the slug is absent or its entry is missing the fields a
 * link creation needs (`name`, `outward`, `inward`) — a half-filled entry must
 * fail loudly at resolution time, not as a cryptic Jira 404.
 */
export function extractLinkType(parsed: unknown, slug: string): ResolvedLinkType | null {
  const entry = asRecord(collectSlugEntries(parsed)[slug]);
  if (!entry) {
    return null;
  }
  const name = asNonBlankString(entry.name);
  const outward = asNonBlankString(entry.outward);
  const inward = asNonBlankString(entry.inward);
  if (!name || !outward || !inward) {
    return null;
  }
  return {
    slug,
    name,
    outward,
    inward,
    fallback: asNonBlankString(entry.fallback),
  };
}

/** Every slug the catalog defines, required tier first, each tier sorted. */
export function listLinkTypeSlugs(parsed: unknown): string[] {
  const linkTypes = asRecord(asRecord(parsed)?.link_types);
  if (!linkTypes) {
    return [];
  }
  const required = Object.keys(asRecord(linkTypes.required) ?? {}).sort();
  const optional = Object.keys(asRecord(linkTypes.optional) ?? {})
    .sort()
    .filter(slug => !required.includes(slug));
  return [...required, ...optional];
}

/**
 * Read and parse `.agents/jira-required.yaml`. Returns null when the file is
 * missing or unparseable — the caller surfaces the guiding error, because only
 * it knows which command the operator was running.
 */
export function loadLinkTypeCatalog(yamlPath: string = JIRA_REQUIRED_YAML_PATH): unknown | null {
  if (!existsSync(yamlPath)) {
    return null;
  }
  try {
    return parseYaml(readFileSync(yamlPath, 'utf8'));
  }
  catch {
    return null;
  }
}
