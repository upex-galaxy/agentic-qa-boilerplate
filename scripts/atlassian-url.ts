#!/usr/bin/env bun
/**
 * atlassian-url.ts — print the ACTIVE Atlassian instance host, for shell use.
 *
 * WHY THIS EXISTS
 * ---------------
 * `ATLASSIAN_URL` is no longer a local variable (it is not in `.env` and not in
 * `.env.example`). The host lives in `.agents/project.yaml` ->
 * `issue_tracker.atlassian_url`, a versioned file that shows up in a diff.
 *
 * TypeScript callers import `cli/lib/atlassian-instance.ts` directly. Everything
 * that needs the host from a SHELL — the `curl` recipes in `.agents/skills/acli`,
 * CI steps, ad-hoc terminal work — calls this instead of interpolating an env
 * var that may be a stale copy inherited from whatever spawned the session.
 *
 * TWO FORMS, because both are needed and they are not interchangeable:
 *
 *   bun run jira:url            ->  https://acme.atlassian.net    (REST base URL)
 *   bun run jira:url --slug     ->  acme.atlassian.net            (acli --site)
 *
 * `acli jira auth login --site` rejects a value carrying a scheme; a REST call
 * requires one. Conflating them is the bug this script removes: the old recipes
 * derived the slug with `${ATLASSIAN_URL#https://}`, which no-ops on an
 * `http://` value and leaves a trailing slash behind.
 *
 * CONTRACT
 * --------
 *   - stdout carries the value and NOTHING else: no banner, no color, no
 *     trailing prose. Safe inside `$(...)`.
 *   - Diagnostics go to stderr.
 *   - Exit 0 on success; exit 1 when the instance cannot be resolved, so
 *     `set -e` and `||` fallbacks work as written.
 *
 * A yaml/env mismatch prints its warning to stderr and still resolves (the yaml
 * wins) — a shell pipeline should not die because some ancestor shell carries a
 * stale export, but the operator must see it.
 */

import {
  formatInstanceMismatchWarning,
  resolveAtlassianInstance,
  toSiteSlug,
} from '../cli/lib/atlassian-instance.ts';

type OutputForm = 'base' | 'slug';

const USAGE = `Usage: bun run jira:url [--slug | --base] [--quiet]

  (default)   https://acme.atlassian.net    REST base URL, scheme, no trailing slash
  --slug      acme.atlassian.net            bare host, for \`acli --site\`
  --site                                    alias of --slug
  --quiet     suppress the stderr mismatch warning
  --help      this text

Source: .agents/project.yaml -> issue_tracker.atlassian_url
        (ATLASSIAN_URL env var is a fallback only, for a repo not yet set up)`;

function main(): void {
  const argv = process.argv.slice(2);
  let form: OutputForm = 'base';
  let quiet = false;

  for (const arg of argv) {
    switch (arg) {
      case '--slug':
      case '--site':
        form = 'slug';
        break;
      case '--base':
      case '--url':
        form = 'base';
        break;
      case '--quiet':
      case '-q':
        quiet = true;
        break;
      case '--help':
      case '-h':
        process.stdout.write(`${USAGE}\n`);
        process.exit(0);
        break;
      default:
        process.stderr.write(`atlassian-url: unknown argument '${arg}'.\n\n${USAGE}\n`);
        process.exit(1);
    }
  }

  let resolved;
  try {
    resolved = resolveAtlassianInstance();
  }
  catch (err) {
    process.stderr.write(`atlassian-url: ${(err as Error).message}\n`);
    process.exit(1);
    return;
  }

  const warning = formatInstanceMismatchWarning(resolved);
  if (warning !== null && !quiet) {
    process.stderr.write(`atlassian-url: WARNING — ${warning}\n`);
  }

  const value = form === 'slug' ? toSiteSlug(resolved.baseUrl) : resolved.baseUrl;
  process.stdout.write(`${value}\n`);
}

main();
