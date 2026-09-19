/**
 * @fileoverview Unresolved-doctrine ledger for `AGENTS.md`.
 *
 * THE PROBLEM. A drift row on a watched file fires ONCE per upstream change:
 * `detectProtectedDrift` stamps a sha marker and the row retires. For most
 * watched files that is right — they are project identity, and the operator's
 * `keep project` is a real answer. `AGENTS.md` is not like them. It is the
 * instruction file EVERY session loads, and skills cite rules by name. Answer
 * `keep project` to a doctrine hunk and the row retires FOREVER while the rule
 * is still absent, so the skills keep citing a rule the project does not have
 * and nothing ever says so again.
 *
 * THE LEDGER. Doctrine debt is tracked by CONTENT, not by the sha marker: a
 * section upstream has and this project does not is recorded in
 * `.template/doctrine-ledger.json` and re-surfaces on every run until the
 * section is actually THERE. Stamping the marker no longer retires it; writing
 * the doctrine does.
 *
 * PROPORTIONATE, because nagging is real and the one-shot design exists for a
 * reason:
 *
 *  - ONE aggregated row for the whole file, never one per section, never the
 *    full diff again. It is a line naming the absent sections and how many runs
 *    they have been absent.
 *  - Informational, never blocking. It never stops a sync.
 *  - Only sections upstream ADDED and the project entirely LACKS. A section
 *    present with different wording is the project's own prose on a rule it
 *    does have; the ordinary drift row already covers that, once.
 *  - It clears itself with no ceremony: write the section, and the next run
 *    finds it and drops it from the ledger.
 *
 * SCOPED TO `AGENTS.md` ONLY. The argument for the ledger is that this one file
 * is loaded by every session and cited by every skill, so its divergence is
 * silent and compounding. No other watched file has that property: a KATA base,
 * a CI workflow or an MCP registry diverges loudly, at the point of use. A
 * ledger on those would be nagging with none of the justification.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { markdownSectionDelta } from './updater-parity';

/** The one file this ledger is scoped to (see the file header). */
export const DOCTRINE_FILE = 'AGENTS.md';

/**
 * Where the ledger lives: the updater's per-developer marker store, beside the
 * sha markers it deliberately does not use, so it sits beside them rather than
 * among them: `.template/upstream-sha/` is documented as one marker per synced
 * entry, and a ledger is not a marker. It carries its own `.gitignore` line — it
 * is runtime state of one machine, never repo content.
 */
export const DOCTRINE_LEDGER_FILE = '.template/doctrine-ledger.json';

export interface DoctrineLedgerEntry {
  /** How many runs have seen this section absent, this one included. */
  runs: number
  /** ISO date of the first run that saw it absent, for a row that can say "since". */
  since: string
}

/** Section heading -> its debt record. Absent file, or unreadable, means no debt yet. */
export type DoctrineLedger = Record<string, DoctrineLedgerEntry>;

export function readDoctrineLedger(repoRoot: string): DoctrineLedger {
  try {
    const raw = fs.readFileSync(path.join(repoRoot, DOCTRINE_LEDGER_FILE), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) { return {}; }
    const out: DoctrineLedger = {};
    for (const [heading, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== 'object' || value === null) { continue; }
      const { runs, since } = value as Record<string, unknown>;
      if (typeof runs !== 'number' || typeof since !== 'string') { continue; }
      out[heading] = { runs, since };
    }
    return out;
  }
  catch {
    return {}; // missing or corrupt: the ledger rebuilds itself from the content
  }
}

/** Write the ledger, or delete it when the debt is cleared (no empty file left behind). */
export function writeDoctrineLedger(repoRoot: string, ledger: DoctrineLedger): void {
  const filePath = path.join(repoRoot, DOCTRINE_LEDGER_FILE);
  if (Object.keys(ledger).length === 0) {
    try { fs.rmSync(filePath, { force: true }); }
    catch { /* nothing to clear */ }
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf-8');
}

export interface DoctrineDebt {
  /** The ledger as it stands after this run. */
  ledger: DoctrineLedger
  /** Sections still absent, oldest debt first. */
  outstanding: string[]
  /** Sections that were in the ledger and are now present: cleared this run. */
  resolved: string[]
}

/**
 * Reconcile the ledger against the two copies of the file. A section upstream
 * has and the project lacks is carried (its run count incremented) or opened; a
 * ledgered section the project now has is dropped.
 *
 * Pure: the caller persists the returned ledger. `today` is injected so a row
 * can say "since" without the function reaching for the clock.
 */
export function reconcileDoctrineLedger(
  project: string,
  upstream: string,
  previous: DoctrineLedger,
  today: string,
): DoctrineDebt {
  const absent = new Set(markdownSectionDelta(project, upstream).added);
  const ledger: DoctrineLedger = {};
  const resolved: string[] = [];
  for (const [heading, entry] of Object.entries(previous)) {
    if (absent.has(heading)) { ledger[heading] = { runs: entry.runs + 1, since: entry.since }; }
    else { resolved.push(heading); }
  }
  for (const heading of absent) {
    if (!(heading in ledger)) { ledger[heading] = { runs: 1, since: today }; }
  }
  // Oldest debt first: the section that has been missing longest leads the row.
  const outstanding = Object.keys(ledger).sort((a, b) => ledger[b].runs - ledger[a].runs);
  return { ledger, outstanding, resolved };
}

/**
 * The one-line evidence for the aggregated row, or null when there is no debt.
 * It leads with the count and the oldest entry's age, because that is the part
 * that should feel uncomfortable after the fifth run, and it names how to clear
 * the row: write the section. There is no other way, on purpose.
 */
export function doctrineDebtEvidence(debt: DoctrineDebt, ledger: DoctrineLedger = debt.ledger): string | null {
  if (debt.outstanding.length === 0) { return null; }
  const oldest = ledger[debt.outstanding[0]];
  const listed = debt.outstanding.slice(0, 8).map(h => `"${h}"`).join(', ');
  const more = debt.outstanding.length > 8 ? `, +${debt.outstanding.length - 8} more` : '';
  return [
    `informational: ${debt.outstanding.length} doctrine section(s) upstream has that ${DOCTRINE_FILE} here does not`,
    `unresolved for ${oldest.runs} run(s), since ${oldest.since}`,
    `every session loads this file and skills cite these rules by name, so a missing one fails silently: ${listed}${more}`,
    'this row is tracked by CONTENT, not by the usual one-nudge-per-upstream-change marker — it clears itself on the run that finds the section present, and answering "keep project" does not retire it',
  ].join('; ');
}

/**
 * Read both copies, reconcile, persist (unless `dryRun`) and return the row's
 * evidence. `null` when there is no debt, when either copy is missing, or when
 * the project tracks upstream verbatim.
 */
export function runDoctrineLedger(
  repoRoot: string,
  upstreamDir: string,
  opts: { dryRun?: boolean, today?: string } = {},
): string | null {
  const localPath = path.join(repoRoot, DOCTRINE_FILE);
  const upstreamPath = path.join(upstreamDir, DOCTRINE_FILE);
  if (!fs.existsSync(localPath) || !fs.existsSync(upstreamPath)) { return null; }
  let project: string;
  let upstream: string;
  try {
    project = fs.readFileSync(localPath, 'utf-8');
    upstream = fs.readFileSync(upstreamPath, 'utf-8');
  }
  catch {
    return null;
  }
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const previous = readDoctrineLedger(repoRoot);
  const debt = reconcileDoctrineLedger(project, upstream, previous, today);
  // A dry run writes nothing AND reports the counts as they stand: previewing
  // the debt must not age it, or three previews would read as three runs of
  // being ignored.
  if (opts.dryRun === true) {
    return doctrineDebtEvidence(debt, { ...debt.ledger, ...previous });
  }
  writeDoctrineLedger(repoRoot, debt.ledger);
  return doctrineDebtEvidence(debt);
}
