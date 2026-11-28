import type { AgenticCheck, Contract, Depth } from './contract.ts';

import { DEPTHS } from './contract.ts';

export function depthRank(d: Depth): number {
  return DEPTHS.indexOf(d);
}

export function maxDepth(a: Depth, b: Depth): Depth {
  return depthRank(a) >= depthRank(b) ? a : b;
}

export function globMatch(pattern: string, file: string): boolean {
  return new Bun.Glob(pattern).match(file);
}

export function fileDepth(file: string, depth: Contract['depth']): { depth: Depth, rule: number | null } {
  const i = depth.rules.findIndex(r => r.paths.some(p => globMatch(p, file)));
  return i < 0 ? { depth: depth.default, rule: null } : { depth: depth.rules[i].depth, rule: i + 1 };
}

const MAX_REASONS = 20;

export function changeDepth(files: string[], depth: Contract['depth'], raise: Depth | null = null): { depth: Depth, reasons: string[] } {
  const each = files.map(f => ({ file: f, ...fileDepth(f, depth) }));
  let d: Depth = 'none';
  for (const e of each) { d = maxDepth(d, e.depth); }
  const top = each.filter(e => e.depth === d);
  const reasons = top.slice(0, MAX_REASONS).map(e => `${e.file} -> ${e.rule === null ? 'default' : `rule ${e.rule}`} (${e.depth})`);
  if (top.length > MAX_REASONS) { reasons.push(`... and ${top.length - MAX_REASONS} more at ${d}`); }
  if (raise !== null && depthRank(raise) > depthRank(d)) {
    reasons.push(`raised to ${raise} by --depth`);
    d = raise;
  }
  return { depth: d, reasons };
}

export function raiseForGateKeys(d: { depth: Depth, reasons: string[] }, keys: string[]): { depth: Depth, reasons: string[] } {
  if (keys.length === 0 || depthRank(d.depth) >= depthRank('standard')) { return d; }
  return { depth: 'standard', reasons: [...d.reasons, `gate keys changed (${keys.join(', ')}) -> standard`] };
}

export function requiredAgentic(agentic: AgenticCheck[], depth: Depth): AgenticCheck[] {
  if (depth === 'none') { return []; }
  return agentic.filter(c => depthRank(c.min_depth) <= depthRank(depth));
}

export function gatePathsTouched(files: string[], paths: string[]): string[] {
  return files.filter(f => paths.some(p => globMatch(p, f)));
}
