#!/usr/bin/env bun
import type { Stats } from 'node:fs';
import type { Redactor } from './redact.ts';

import { spawnSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { collectSecretValues, createRedactor, HIDDEN } from './redact.ts';

export const USAGE = `Usage: bun run report:scrub [--results <dir>] [--then-generate] [-- <command...>]

Replaces secrets in the text attachments of a directory of Allure results, in place, before a report
is generated or uploaded. It knows secrets by shape, by the name beside them and by the values this
machine holds (.env*, MCP configs, .auth/, secret-named environment variables).

  --results <dir>   default: $ALLURE_RESULTS_DIR, else allure-results
  --then-generate   run "bunx allure generate <dir>" after a successful scrub
  -- <command...>   run the command first; its exit code is returned after the scrub

Zip files (traces), images and videos are left as they are.`;

export const WITHHELD = '[withheld: this attachment could not be scrubbed]\n';

const ATTACHMENT = /-attachment(?:\.[\w-]+)?$/;

export interface ScrubReport {
  scanned: number
  changed: number
  left: number
}

function textOf(bytes: Buffer): string | null {
  if (bytes.includes(0) || bytes.subarray(0, 4).toString('latin1') === 'PK\x03\x04') { return null; }
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { return null; }
}

function scrubText(content: string, redactor: Redactor): string {
  const whole = redactor.text(content);
  if (whole !== HIDDEN) { return whole; }
  // One block that cannot be cleaned must not cost the reader the whole attachment.
  return content.split(/(\n{2,})/).map(block => redactor.text(block)).join('');
}

export function scrubResults(dir: string, redactor: Redactor): ScrubReport {
  const report: ScrubReport = { scanned: 0, changed: 0, left: 0 };
  for (const name of readdirSync(dir)) {
    if (!ATTACHMENT.test(name)) { continue; }
    const path = join(dir, name);
    const info = lstatSync(path);
    // An upload follows a link, and a link can point at any file on the machine.
    if (info.isSymbolicLink()) {
      rmSync(path);
      report.changed++;
      continue;
    }
    if (!info.isFile()) { continue; }
    try {
      const content = textOf(readFileSync(path));
      if (content === null) {
        report.left++;
        continue;
      }
      report.scanned++;
      const clean = scrubText(content, redactor);
      if (clean !== content) {
        writeFileSync(path, clean, 'utf-8');
        report.changed++;
      }
    }
    catch {
      writeFileSync(path, WITHHELD, 'utf-8');
      report.changed++;
    }
  }
  return report;
}

export interface ScrubContext {
  cwd: string
  env: Record<string, string | undefined>
  log: (line: string) => void
  error: (line: string) => void
  spawn: (command: string[]) => number
}

interface ScrubArgs {
  help: boolean
  results: string
  generate: boolean
  command: string[]
}

export function parseScrubArgs(argv: string[], fallback: string): ScrubArgs {
  const split = argv.indexOf('--');
  const own = split === -1 ? argv : argv.slice(0, split);
  const args: ScrubArgs = { help: false, results: fallback, generate: false, command: split === -1 ? [] : argv.slice(split + 1) };
  for (let i = 0; i < own.length; i++) {
    if (own[i] === '--help' || own[i] === '-h') { args.help = true; }
    else if (own[i] === '--then-generate') { args.generate = true; }
    else if (own[i] === '--results' && own[i + 1] !== undefined) { args.results = own[++i]; }
    else { throw new Error(`unknown or incomplete argument: ${own[i]}`); }
  }
  return args;
}

function statOf(path: string): Stats | null {
  try { return lstatSync(path); }
  catch { return null; }
}

export function runScrub(argv: string[], context: ScrubContext): number {
  let args: ScrubArgs;
  try { args = parseScrubArgs(argv, context.env.ALLURE_RESULTS_DIR || 'allure-results'); }
  catch (error) {
    context.error(`[scrub] ${error instanceof Error ? error.message : 'bad arguments'}\n\n${USAGE}`);
    return 2;
  }
  if (args.help) {
    context.log(USAGE);
    return 0;
  }

  const code = args.command.length > 0 ? context.spawn(args.command) : 0;
  const dir = resolve(context.cwd, args.results);
  const info = statOf(dir);
  // A publisher follows the link, so passing here would upload results nothing scrubbed.
  if (info?.isSymbolicLink()) {
    context.error(`[scrub] failed, do not publish these results: ${dir} is a symbolic link, so nothing was scrubbed. Point --results at the real directory.`);
    return code || 1;
  }
  if (!info?.isDirectory()) {
    context.log(`[scrub] no results directory at ${dir}: nothing to scrub`);
    return code;
  }

  try {
    const values = collectSecretValues(context.cwd, context.env);
    const report = scrubResults(dir, createRedactor(values));
    context.log(`[scrub] ${report.changed} of ${report.scanned} text attachments changed, ${report.left} binary files left as they are, ${values.length} local secret values known`);
  }
  catch (error) {
    context.error(`[scrub] failed, do not publish these results: ${error instanceof Error ? error.name : 'unknown error'}`);
    return code || 1;
  }

  const generated = args.generate ? context.spawn(['bunx', 'allure', 'generate', dir]) : 0;
  return code || generated;
}

function spawnInherited([bin, ...args]: string[]): number {
  // Windows `bunx --bun` misresolves the Playwright worker entry, as in the launcher.
  const safe = process.platform === 'win32' && bin === 'bunx' && args[0] === '--bun' ? args.slice(1) : args;
  return spawnSync(bin, safe, { stdio: 'inherit' }).status ?? 1;
}

if (import.meta.main) {
  process.exit(runScrub(process.argv.slice(2), { cwd: process.cwd(), env: process.env, log: console.log, error: console.error, spawn: spawnInherited }));
}
