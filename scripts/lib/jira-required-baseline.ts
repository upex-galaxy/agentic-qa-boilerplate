/**
 * Upstream's declared `work_types:` set, and the comparison against a project's.
 *
 * WHY THIS FILE EXISTS
 *
 * `.agents/jira-required.yaml` is the INPUT to `jira:sync-workflows`, which
 * catalogs ONLY the work types declared in it. A project whose manifest is
 * missing a work type upstream has since added therefore regenerates a
 * TRUNCATED `.agents/jira-workflows.json` and still exits 0 — and from then on
 * every transition on that work type falls into the unmapped-status fallback,
 * permanently, with nothing anywhere saying why.
 *
 * WHY A CONSTANT AND NOT A READ OF UPSTREAM'S FILE
 *
 * `.agents/jira-required.yaml` is `bootstrapOnly` in the updater: a project owns
 * its copy and `bun run up` never overwrites it. So upstream's version only
 * exists on disk during an update run, inside the temporary clone — it is gone
 * by the time anyone runs a check. Fetching it at check time would put a network
 * call behind an offline diagnostic.
 *
 * `scripts/` is a plain synced DIRECTORY component of the updater, so this file
 * arrives with every `bun run up` and is readable offline afterwards. That is the
 * whole trick: the baseline travels in the synced tree, not in the
 * project-owned one.
 *
 * KEEPING IT HONEST
 *
 * In THIS repo the yaml IS the baseline, so the two must agree, and
 * `scripts/check-jira-baseline.test.ts` asserts it — but only when it can tell it
 * is running upstream (`package.json` name), because in a consumer repo diverging
 * from upstream is legitimate and gating on it is precisely what this design
 * rules out. `compareWorkTypes` therefore reports BOTH directions and
 * `jira:baseline` prints the upstream-side one as a NOTE, so drift is visible
 * even where the assertion is skipped. Regenerate with
 * `bun run jira:baseline --write`.
 */

/**
 * Work-type keys declared under `work_types:` in upstream's
 * `.agents/jira-required.yaml`. Order is upstream's declaration order.
 */
export const UPSTREAM_WORK_TYPE_KEYS: readonly string[] = [
  'story',
  'bug',
  'test_case',
  'epic',
  'defect',
  'improvement',
  'tech_story',
  'tech_debt',
  'test_plan',
  'test_execution',
  're_test_execution',
  'test_set',
  'precondition',
  'subtask',
];

/**
 * Top-level keys under `work_types:` in a `jira-required.yaml` body.
 *
 * Same line-walking grammar as `sync-jira-workflows.ts:loadManifestWorkTypes`
 * and `check-jira-setup.ts`'s copy of it — no YAML dependency, and what the sync
 * reads is what this compares. Declaration order is preserved.
 */
export function parseWorkTypeKeys(manifestText: string): string[] {
  const topLevelRe = /^[a-z_][\w-]*:\s*(?:#.*)?$/;
  const sectionRe = /^work_types:\s*$/;
  const headerRe = /^ {2}([a-z_][a-z0-9_]*):\s*$/;

  const keys: string[] = [];
  let inSection = false;

  for (const line of manifestText.split(/\r?\n/)) {
    if (topLevelRe.test(line)) {
      inSection = sectionRe.test(line);
      continue;
    }
    if (!inSection) { continue; }
    const header = headerRe.exec(line);
    if (header) { keys.push(header[1]); }
  }
  return keys;
}

export interface WorkTypeComparison {
  /** Declared upstream, absent locally — the case that truncates the catalog. */
  missingLocally: string[]
  /** Declared locally, absent upstream — a project addition, or upstream drift. */
  extraLocally: string[]
}

/** Set difference both ways, in each side's own declaration order. */
export function compareWorkTypes(
  localKeys: readonly string[],
  baseline: readonly string[] = UPSTREAM_WORK_TYPE_KEYS,
): WorkTypeComparison {
  const local = new Set(localKeys);
  const up = new Set(baseline);
  return {
    missingLocally: baseline.filter(k => !local.has(k)),
    extraLocally: localKeys.filter(k => !up.has(k)),
  };
}
