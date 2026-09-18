/**
 * Xray CLI - Issue Link Commands
 *
 * Commands: create, delete
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
 *
 * Both confirmation lines are rendered FROM the payload actually sent (create)
 * or the id actually deleted (delete). An earlier version described the link it
 * intended rather than the one it stored, and the two disagreed for every
 * coverage link this CLI ever created.
 */

import type { IssueLinkPayload } from '../lib/jira.js';
import type { Flags } from '../types/index.js';
import { createIssueLink, deleteIssueLink } from '../lib/jira.js';
import { extractLinkType, listLinkTypeSlugs, loadLinkTypeCatalog } from '../lib/link-types.js';
import { log } from '../lib/logger.js';
import { getBoolFlag, getFlag } from '../lib/parser.js';

// ============================================================================
// CREATE
// ============================================================================

export async function create(flags: Flags, positional: string[]): Promise<void> {
  const fromKey = positional[0] || getFlag(flags, 'from');
  const toKey = positional[1] || getFlag(flags, 'to');
  if (!fromKey || !toKey) {
    throw new Error(
      'Two issue keys required. Usage: xray link create <FROM_KEY> <TO_KEY> [--type <slug>]\n'
      + 'FROM performs the link type\'s outward verb, TO receives it. Coverage example:\n'
      + '  xray link create <ATS_KEY> <STORY_KEY> --type test   # the Set tests the Story',
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

  log.dim(`Creating '${linkType.name}' link: ${fromKey} ${linkType.outward} ${toKey}...`);

  let payload: IssueLinkPayload | null;
  try {
    payload = await createIssueLink(linkType.name, fromKey, toKey);
  }
  catch (err) {
    // A 404 on the TYPE is indistinguishable from a missing issue in Jira's
    // response shape; when the catalog declares a fallback slug, surface it.
    if (linkType.fallback) {
      log.warn(`If the instance lacks the '${linkType.name}' link type, retry with the catalog fallback: --type ${linkType.fallback} (direction semantics may degrade).`);
    }
    throw err;
  }

  if (payload === null) {
    throw new Error(
      'Jira credentials are required for `link create` (issue links live on the Jira layer, '
      + 'separate from the Xray GraphQL API). Run \'bun xray auth login --jira-url --jira-email --jira-token\' first.',
    );
  }

  log.success(`Link created: ${fromKey} —[${linkType.name}]→ ${toKey}`);
  // Raw shape first: it is the only part of this output an operator can check
  // against Jira without re-deriving which description reads in which
  // direction. The verbs follow, derived from the same payload.
  console.log(`  POSTed  outwardIssue: ${payload.outwardIssue.key}  inwardIssue: ${payload.inwardIssue.key}`);
  console.log(`  ${payload.outwardIssue.key} now carries  inwardIssue: ${payload.inwardIssue.key}  in its issuelinks`);
  console.log(`  ${fromKey} ${linkType.outward} ${toKey} / ${toKey} ${linkType.inward} ${fromKey}`);
  if (slug === 'test') {
    console.log(`  Verify coverage: bun xray trace ${toKey}`);
  }
}

// ============================================================================
// DELETE
// ============================================================================

/**
 * Remove one issue link by id.
 *
 * `trace` names this command when it finds an inverted coverage link, which is
 * the only reason it exists: the corrected link cannot be created on top of the
 * wrong one, because Jira dedupes the pair+type regardless of direction. It
 * stays deliberately awkward — id only, `--yes` mandatory, `--dry-run`
 * available — because a gate whose remediation is a delete has to make the
 * operator look at what they are about to destroy first.
 */
export async function del(flags: Flags, positional: string[]): Promise<void> {
  const linkId = getFlag(flags, 'id') || positional[0];
  if (!linkId) {
    throw new Error(
      'A link id is required. Usage: xray link delete --id <LINK_ID> --yes [--dry-run]\n'
      + 'The id is the issuelinks[].id of the entry, NOT an issue key or issue id. '
      + '`bun xray trace <STORY> --json` prints it for a failing coverage edge whose link exists.',
    );
  }

  if (getBoolFlag(flags, 'dry-run')) {
    log.info(`Dry run — would delete link id ${linkId}. Re-run with --yes to apply.`);
    return;
  }

  if (!getBoolFlag(flags, 'yes')) {
    throw new Error(
      `Refusing to delete link id ${linkId} without --yes. Deleting a link is not reversible and `
      + 'Jira reports nothing when the id belongs to a different pair than you expect. '
      + 'Read it first (\'bun xray trace <STORY> --json\'), then re-run with --yes.',
    );
  }

  const deleted = await deleteIssueLink(linkId);
  if (deleted === null) {
    throw new Error(
      'Jira credentials are required for `link delete` (issue links live on the Jira layer, '
      + 'separate from the Xray GraphQL API). Run \'bun xray auth login --jira-url --jira-email --jira-token\' first.',
    );
  }

  log.success(`Link deleted: id ${linkId}`);
}
