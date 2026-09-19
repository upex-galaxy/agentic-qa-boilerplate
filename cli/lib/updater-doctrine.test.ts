import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';
import {
  DOCTRINE_FILE,
  DOCTRINE_LEDGER_FILE,
  doctrineDebtEvidence,
  readDoctrineLedger,
  reconcileDoctrineLedger,
  runDoctrineLedger,
  writeDoctrineLedger,
} from './updater-doctrine';

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'updater doctrine '));
  temporaryRoots.push(root);
  return root;
}

function write(root: string, relativePath: string, contents: string): void {
  const destination = join(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) { rmSync(root, { recursive: true, force: true }); }
});

describe('the unresolved-doctrine ledger tracks content, not the sha marker', () => {
  test('a section upstream has and the project lacks opens an entry and keeps ageing', () => {
    const project = '# Memory\n\n## 1. RULES\n\nstuff\n';
    const upstream = '# Memory\n\n## 1. RULES\n\nstuff\n\n## 9. DOCTRINE\n\nnew rule\n';

    const first = reconcileDoctrineLedger(project, upstream, {}, '2026-01-01');
    expect(first.outstanding).toEqual(['9. DOCTRINE']);
    expect(first.ledger['9. DOCTRINE']).toEqual({ runs: 1, since: '2026-01-01' });

    // A later run with the section STILL absent ages the debt rather than
    // retiring it: this is the whole point, the sha marker would have stamped.
    const second = reconcileDoctrineLedger(project, upstream, first.ledger, '2026-02-02');
    expect(second.ledger['9. DOCTRINE']).toEqual({ runs: 2, since: '2026-01-01' });
    expect(doctrineDebtEvidence(second)).toContain('unresolved for 2 run(s), since 2026-01-01');
  });

  test('writing the section clears the entry, with no ceremony', () => {
    const upstream = '# Memory\n\n## 9. DOCTRINE\n\nnew rule\n';
    const before = reconcileDoctrineLedger('# Memory\n', upstream, {}, '2026-01-01');
    expect(before.outstanding).toEqual(['9. DOCTRINE']);

    // The project writes its own wording under the same heading. Present is
    // present: the ledger is about the rule existing, not about matching prose.
    const after = reconcileDoctrineLedger(
      '# Memory\n\n## 9. DOCTRINE\n\nour own wording for this rule\n',
      upstream,
      before.ledger,
      '2026-02-02',
    );
    expect(after.outstanding).toEqual([]);
    expect(after.resolved).toEqual(['9. DOCTRINE']);
    expect(doctrineDebtEvidence(after)).toBeNull();
  });

  test('a section the project already has never enters the ledger', () => {
    const debt = reconcileDoctrineLedger(
      '## 1. RULES\n\nmine\n',
      '## 1. RULES\n\ntheirs, worded differently\n',
      {},
      '2026-01-01',
    );
    // A body that differs is the project's own prose on a rule it DOES have.
    // The ordinary drift row covers that, once; the ledger stays out of it.
    expect(debt.outstanding).toEqual([]);
  });

  test('the row is one aggregated line: oldest first, capped list, and how to clear it', () => {
    const headings = Array.from({ length: 11 }, (_, i) => `## S${i}\n\nx\n`).join('\n');
    const debt = reconcileDoctrineLedger('# Memory\n', `# Memory\n\n${headings}`, { S0: { runs: 40, since: '2025-01-01' } }, '2026-01-01');
    const evidence = doctrineDebtEvidence(debt)!;
    expect(debt.outstanding[0]).toBe('S0'); // the oldest debt leads
    expect(evidence).toContain('11 doctrine section(s)');
    expect(evidence).toContain('unresolved for 41 run(s), since 2025-01-01');
    expect(evidence).toContain('+3 more'); // 8 listed, the rest counted
    expect(evidence).toContain('clears itself on the run that finds the section present');
    expect(evidence).toContain('"keep project" does not retire it');
  });

  test('the ledger round-trips on disk, and deletes itself once the debt is gone', () => {
    const root = temporaryRoot();
    writeDoctrineLedger(root, { A: { runs: 2, since: '2026-01-01' } });
    expect(readDoctrineLedger(root)).toEqual({ A: { runs: 2, since: '2026-01-01' } });
    writeDoctrineLedger(root, {});
    expect(existsSync(join(root, DOCTRINE_LEDGER_FILE))).toBe(false);
    // Corrupt or absent reads as no debt yet; the content rebuilds it.
    write(root, DOCTRINE_LEDGER_FILE, '{ not json');
    expect(readDoctrineLedger(root)).toEqual({});
  });

  test('runDoctrineLedger persists across runs and a dry run neither writes nor ages', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    write(root, DOCTRINE_FILE, '# Memory\n\n## 1. RULES\n\nmine\n');
    write(upstream, DOCTRINE_FILE, '# Memory\n\n## 1. RULES\n\nmine\n\n## 9. DOCTRINE\n\nnew\n');

    expect(runDoctrineLedger(root, upstream, { today: '2026-01-01' })).toContain('unresolved for 1 run(s)');
    expect(runDoctrineLedger(root, upstream, { today: '2026-01-02' })).toContain('unresolved for 2 run(s)');
    // A preview must not age the debt it is only previewing, and must not write.
    expect(runDoctrineLedger(root, upstream, { today: '2026-01-03', dryRun: true })).toContain('unresolved for 2 run(s)');
    expect(readDoctrineLedger(root)['9. DOCTRINE'].runs).toBe(2);

    // Adopt the rule: the next run clears the row and removes the ledger file.
    write(root, DOCTRINE_FILE, '# Memory\n\n## 1. RULES\n\nmine\n\n## 9. DOCTRINE\n\nadopted\n');
    expect(runDoctrineLedger(root, upstream, { today: '2026-01-04' })).toBeNull();
    expect(existsSync(join(root, DOCTRINE_LEDGER_FILE))).toBe(false);
  });

  test('a missing copy on either side is silence, never a row', () => {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    expect(runDoctrineLedger(root, upstream)).toBeNull();
    write(upstream, DOCTRINE_FILE, '# Memory\n\n## 9. DOCTRINE\n\nnew\n');
    expect(runDoctrineLedger(root, upstream)).toBeNull();
  });
});
