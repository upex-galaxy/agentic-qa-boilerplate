/**
 * Xray CLI - Issue Link Commands
 *
 * Commands: create
 *
 * The coverage write-path. Xray's requirement-coverage panel reads the Jira
 * issue link whose type carries the `is tested by` semantics — an edge the
 * GraphQL API cannot create (membership mutations are Xray-internal). This
 * command writes that Jira-layer edge via REST `POST /rest/api/3/issueLink`.
 *
 * The link type is addressed by SLUG, resolved against
 * `.agents/jira-required.yaml` -> `link_types` (required + optional tiers).
 * The display name is never hardcoded: workspaces rename their link types, and
 * the yaml is the versioned catalog tracking those names.
 */

import type { Flags } from '../types/index.js';
import { createIssueLink } from '../lib/jira.js';
import { extractLinkType, listLinkTypeSlugs, loadLinkTypeCatalog } from '../lib/link-types.js';
import { log } from '../lib/logger.js';
import { getFlag } from '../lib/parser.js';

// ============================================================================
// CREATE
// ============================================================================

export async function create(flags: Flags, positional: string[]): Promise<void> {
  const fromKey = positional[0] || getFlag(flags, 'from');
  const toKey = positional[1] || getFlag(flags, 'to');
  if (!fromKey || !toKey) {
    throw new Error(
      'Two issue keys required. Usage: xray link create <FROM_KEY> <TO_KEY> [--type <slug>]\n'
      + 'FROM is the OUTWARD party, TO the INWARD one. Coverage example:\n'
      + '  xray link create <ATS_KEY> <STORY_KEY> --type test   # Story ends up "is tested by" the Set',
    );
  }

  const slug = getFlag(flags, 'type', 'test') as string;

  const catalog = loadLinkTypeCatalog();
  if (catalog === null) {
    throw new Error(
      'Cannot read .agents/jira-required.yaml — the link-type catalog that maps slugs to this '
      + 'instance\'s link-type names. Run from the repo root, or restore the file.',
    );
  }

  const linkType = extractLinkType(catalog, slug);
  if (!linkType) {
    const available = listLinkTypeSlugs(catalog);
    const availableHint = available.length > 0
      ? ` Available: ${available.join(', ')}`
      : ' The catalog defines no link types.';
    throw new Error(`Unknown link-type slug '${slug}' in .agents/jira-required.yaml -> link_types.${availableHint}`);
  }

  log.dim(`Creating '${linkType.name}' link: ${fromKey} ${linkType.outward} ${toKey} / ${toKey} ${linkType.inward} ${fromKey}...`);

  let created: true | null;
  try {
    created = await createIssueLink(linkType.name, fromKey, toKey);
  }
  catch (err) {
    // A 404 on the TYPE is indistinguishable from a missing issue in Jira's
    // response shape; when the catalog declares a fallback slug, surface it.
    if (linkType.fallback) {
      log.warn(`If the instance lacks the '${linkType.name}' link type, retry with the catalog fallback: --type ${linkType.fallback} (direction semantics may degrade).`);
    }
    throw err;
  }

  if (created === null) {
    throw new Error(
      'Jira credentials are required for `link create` (issue links live on the Jira layer, '
      + 'separate from the Xray GraphQL API). Run \'bun xray auth login --jira-url --jira-email --jira-token\' first.',
    );
  }

  log.success(`Link created: ${fromKey} —[${linkType.name}]→ ${toKey}`);
  console.log(`  ${fromKey} ${linkType.outward} ${toKey}`);
  console.log(`  ${toKey} ${linkType.inward} ${fromKey}`);
}
