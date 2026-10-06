#!/usr/bin/env bun
/**
 * env-set.ts — the one sanctioned way for an agent to write a value into `.env`.
 *
 *   bun run env:set KEY=value [KEY2=value2 ...]
 *
 * Critical Rule #1 keeps secrets by NAME: the agent never opens `.env`, and the
 * harness deny rules (`Read(.env)` in `.claude/settings.json`) also refuse an
 * edit of the file. The owner still lets the agent write a NON-sensitive value
 * (a URL, a project key, a flag, a port) when asked, so that one write path
 * lives here instead of in ad-hoc shell. A key is refused when ANY of these hold:
 *
 *   - the varlock schema (`.env.schema` + `.env.core.schema`) does not declare
 *     it: nothing shows it is non-sensitive, so the default is refuse;
 *   - the schema marks it `@sensitive`;
 *   - its NAME reads as a secret (PASSWORD, SECRET, TOKEN, API_KEY, ...). The
 *     project schema defaults to `@defaultSensitive=false`, so a project
 *     variable that forgot the decorator would otherwise slip through;
 *   - the manifest says its value does not live in `.env` (`ATLASSIAN_URL`
 *     comes from `.agents/project.yaml`) or marks it `secret`.
 *
 * Sensitivity comes from `varlock load --format json-full --agent`, read in this
 * process with every value discarded. Nothing printed carries a value: not the
 * new one, not any other line of the file. Every active `KEY=` line of the key
 * is replaced in place, keeping its inline `# comment`; a key with no active
 * line is appended. Comment lines and every other line stay byte-identical.
 *
 * A secret is the human's to type, in a terminal or the secret manager.
 *
 * Exit code: 0 when every pair was written, 1 when any was refused (nothing is
 * written then), 2 on a usage error.
 */

import type { VarlockOverrides } from '../cli/lib/env-drift.ts';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadVarlockMetadata } from '../cli/lib/env-drift.ts';
import { parseDotEnvPairs, valueSourceOf, VAR_MANIFEST } from '../cli/lib/variables-manifest.ts';

const KEY_RE = /^[A-Z_][A-Z0-9_]*$/;

/** Names that read as a credential whatever the schema says. */
export const SECRET_NAME_RE = /PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|ACCESS_KEY|PRIVATE_KEY|CREDENTIAL/;

/** Why a key may not be written, or null when it may. */
export function refusalFor(name: string, schema: VarlockOverrides | null): string | null {
  if (!KEY_RE.test(name)) { return `'${name}' is not an UPPER_SNAKE_CASE variable name`; }
  const spec = VAR_MANIFEST.find(s => s.name === name);
  if (spec?.secret || schema?.sensitive.has(name) || SECRET_NAME_RE.test(name)) {
    return `'${name}' is a secret: the human types it into .env (or the secret manager), never the agent`;
  }
  if (spec && valueSourceOf(spec) !== 'env-file') {
    return `'${name}' is not read from .env (value source: ${valueSourceOf(spec)}); write it where that source lives`;
  }
  if (schema === null) {
    return `the varlock schema did not load, so '${name}' cannot be shown to be non-sensitive. Run \`bunx varlock load --agent\` to see why`;
  }
  if (!schema.declared.has(name)) {
    return `'${name}' is not declared in .env.schema / .env.core.schema, so it cannot be shown to be non-sensitive. Declare it in .env.schema or let the human set it`;
  }
  return null;
}

/** Renders a value as a `.env` line value, quoting it when a loader would split or strip it. */
export function formatValue(value: string): string {
  if (value === '' || /^[\w.:/@+,=-]+$/.test(value)) { return value; }
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * The inline comment after a `.env` value, with the whitespace before it, or ''.
 * A quoted value ends at its closing quote; an unquoted one at the first `#`
 * preceded by whitespace, so `https://h/#frag` keeps its `#`.
 */
export function inlineCommentOf(afterEquals: string): string {
  const lead = /^\s*/.exec(afterEquals)?.[0] ?? '';
  const rest = afterEquals.slice(lead.length);
  const quote = rest[0];
  if (quote === '"' || quote === '\'' || quote === '`') {
    let i = 1;
    while (i < rest.length && rest[i] !== quote) { i += rest[i] === '\\' && quote === '"' ? 2 : 1; }
    const tail = rest.slice(i + 1);
    return /^\s*#/.test(tail) ? tail : '';
  }
  const m = /\s#/.exec(rest);
  return m === null ? '' : rest.slice(m.index);
}

/**
 * Upserts `name` in `.env` content. Replaces every active (uncommented) line of
 * the key, keeping an `export ` prefix and an inline `# comment`; appends one
 * line when none exists.
 */
export function upsertEnvLine(content: string, name: string, value: string): string {
  const line = `${name}=${formatValue(value)}`;
  const active = new RegExp(`^(\\s*export\\s+)?${name}\\s*=`);
  let replaced = false;
  const lines = content.split('\n').map((raw) => {
    const m = active.exec(raw);
    if (m === null) { return raw; }
    replaced = true;
    return `${m[1] ?? ''}${line}${inlineCommentOf(raw.slice(m[0].length))}`;
  });
  if (replaced) { return lines.join('\n'); }
  const base = content === '' || content.endsWith('\n') ? content : `${content}\n`;
  return `${base}${line}\n`;
}

/** Parses `KEY=value` arguments. The value may itself contain `=`. */
export function parsePairs(args: string[]): Array<{ name: string, value: string }> | string {
  if (args.length === 0) { return 'usage: bun run env:set KEY=value [KEY2=value2 ...]'; }
  const pairs: Array<{ name: string, value: string }> = [];
  for (const arg of args) {
    const eq = arg.indexOf('=');
    if (eq <= 0) { return `'${arg}' is not KEY=value`; }
    const value = arg.slice(eq + 1);
    if (/[\r\n]/.test(value)) { return `the value for '${arg.slice(0, eq)}' spans lines; .env takes one line per key`; }
    pairs.push({ name: arg.slice(0, eq), value });
  }
  return pairs;
}

/** Runs the command against `<root>/.env`. Returns the exit code. */
export function run(
  args: string[],
  root: string,
  schema: (root: string) => VarlockOverrides | null = loadVarlockMetadata,
  out: (line: string) => void = console.log,
): number {
  const pairs = parsePairs(args);
  if (typeof pairs === 'string') { out(`env:set: ${pairs}`); return 2; }

  const meta = schema(root);
  const refusals = pairs.map(p => refusalFor(p.name, meta)).filter((r): r is string => r !== null);
  if (refusals.length > 0) {
    for (const r of refusals) { out(`env:set: REFUSED ${r}.`); }
    out('env:set: nothing written.');
    return 1;
  }

  const envPath = join(root, '.env');
  if (!existsSync(envPath)) {
    out('env:set: no .env in this checkout. Create it from the template first (cp .env.example .env), then retry.');
    return 1;
  }

  let content = readFileSync(envPath, 'utf8');
  for (const { name, value } of pairs) { content = upsertEnvLine(content, name, value); }
  writeFileSync(envPath, content);
  out(`env:set: wrote ${pairs.map(p => p.name).join(', ')} to .env (non-sensitive per the varlock schema). Restart the agent session for a running MCP server to see it.`);
  const local = parseDotEnvPairs(join(root, '.env.local'));
  const shadowed = pairs.map(p => p.name).filter(name => local.has(name));
  if (shadowed.length > 0) {
    out(`env:set: note, .env.local also sets ${shadowed.join(', ')} and wins over .env; the human edits that file.`);
  }
  return 0;
}

if (import.meta.main) {
  process.exit(run(process.argv.slice(2), join(import.meta.dir, '..')));
}
