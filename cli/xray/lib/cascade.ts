/**
 * Xray CLI - Cascade Membership Module
 *
 * Pure diffing for the Set-first cascade commands (`plan add-set`,
 * `exec add-set`): given the Test Set's membership and the target container's
 * current tests, split the members into the ones that still need attaching and
 * the ones already present. Pure (arrays in, arrays out) so the skip/add split
 * is testable without Xray credentials — the command wrappers own GraphQL.
 */

export interface MembershipDiff {
  /** Source ids NOT yet in the target — the ones to attach. */
  missing: string[]
  /** Source ids already in the target — reported as skipped. */
  present: string[]
}

/**
 * Diff a source membership against a target membership.
 *
 * Duplicated source ids are collapsed to their first occurrence so a single
 * mutation never sends the same id twice; source order is preserved so the
 * report reads in the same order as the Set listing.
 */
export function diffMembership(sourceIds: string[], targetIds: string[]): MembershipDiff {
  const target = new Set(targetIds);
  const seen = new Set<string>();
  const missing: string[] = [];
  const present: string[] = [];

  for (const id of sourceIds) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    if (target.has(id)) {
      present.push(id);
    }
    else {
      missing.push(id);
    }
  }

  return { missing, present };
}
