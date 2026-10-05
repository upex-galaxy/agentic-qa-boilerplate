/**
 * @fileoverview The labelled-prompt eval of the instruction router.
 *
 * The prompt hook (`.agents/hooks/personality-reinject.mjs`) classifies each
 * prompt against the ROUTER and the sections' `triggers:` / `paths:`, ranks
 * the fired rows and gives a binding `ROUTE:` line to the strongest few
 * (`bindingRoutes`); the rest go to one `ROUTE-OPTIONAL:` line. Three
 * numbers, each with its own floor: RECALL counts an expected id named on
 * either line (did the router reach it at all: a trigger problem), BINDING
 * RECALL only the binding lines (did the ranking keep it: a cap problem),
 * PRECISION only the binding lines (an optional line binds nothing, so it
 * costs nothing). The set
 * in `cli/lib/fixtures/instruction-router-eval.json` says what a careful reader
 * of the router would load for each prompt; this module scores the classifier
 * against it. `instructions:check` runs it on every call (the whole set costs a
 * few milliseconds), so a `triggers:` edit that drops recall or floods routes
 * fails the gate the pre-commit hook already reaches, and
 * `cli/lib/instruction-router.test.ts` asserts the same numbers.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bindingRoutes, classifyPrompt, loadInstructionRouter } from '../../.agents/hooks/personality-reinject.mjs';
import { ROUTER_EVAL_FIXTURE } from './instructions.ts';

/** Floors the fixture's own `targets` can raise but never lower. */
export const RECALL_FLOOR = 0.95;
export const PRECISION_FLOOR = 0.8;
/** Expected ids that must survive the cap onto a binding line. */
export const BINDING_RECALL_FLOOR = 0.9;
/** A section ships with at least this many labelled prompts that expect it. */
export const MIN_EVAL_PROMPTS = 3;

export interface RouterEvalFixture {
  targets?: { recall?: number, precision?: number }
  prompts: Array<{ prompt: string, expect: string[] }>
}

export interface RouterEvalResult {
  prompts: number
  truePositives: number
  falseNegatives: number
  falsePositives: number
  recall: number
  /** Expected ids on a binding line, over all expected ids. */
  bindingRecall: number
  precision: number
  targets: { recall: number, precision: number, bindingRecall: number }
  /** `prompt -> missed id, id` for every prompt that lost an expected route. */
  misses: string[]
  /** `prompt -> demoted id, id` for every expected id ranked past the cap, onto the optional line. */
  demoted: string[]
  /** Labels no router target carries (a renamed or removed section id). */
  unknownLabels: string[]
}

/** The fixture, or null when the repo does not ship it. Throws on a malformed file. */
export function readRouterEvalFixture(root: string): RouterEvalFixture | null {
  const path = join(root, ROUTER_EVAL_FIXTURE);
  if (!existsSync(path)) { return null; }
  const data = JSON.parse(readFileSync(path, 'utf8')) as RouterEvalFixture;
  if (!Array.isArray(data.prompts)) { throw new TypeError(`${ROUTER_EVAL_FIXTURE}: \`prompts\` must be a list`); }
  return data;
}

/** Fixture targets, held at or above the floors. */
export function evalTargets(fixture: RouterEvalFixture): { recall: number, precision: number, bindingRecall: number } {
  return {
    recall: Math.max(fixture.targets?.recall ?? 0, RECALL_FLOOR),
    precision: Math.max(fixture.targets?.precision ?? 0, PRECISION_FLOOR),
    bindingRecall: BINDING_RECALL_FLOOR,
  };
}

/** Score the router of `root` against the fixture, or null when the checkout has no router. */
export function evaluateRouter(root: string, fixture: RouterEvalFixture): RouterEvalResult | null {
  const router = loadInstructionRouter(root);
  if (!router) { return null; }
  const idOf = (path: string): string => router.targets.get(path)?.id || path;
  const known = new Set([...router.targets.values()].map(target => target.id || target.path));
  let truePositives = 0;
  let falseNegatives = 0;
  let falsePositives = 0;
  let bindingHits = 0;
  const demoted: string[] = [];
  const misses: string[] = [];
  const unknown = new Set<string>();
  for (const { prompt, expect } of fixture.prompts) {
    const binding = (bindingRoutes(router, prompt) as string[]).map(idOf);
    const named = (classifyPrompt(router, prompt) as string[]).map(idOf);
    const missed = expect.filter(id => !named.includes(id));
    const pushedOut = expect.filter(id => named.includes(id) && !binding.includes(id));
    truePositives += expect.length - missed.length;
    falseNegatives += missed.length;
    bindingHits += expect.length - missed.length - pushedOut.length;
    falsePositives += binding.filter(id => !expect.includes(id)).length;
    if (pushedOut.length > 0) { demoted.push(`${prompt} -> demoted ${pushedOut.join(', ')}`); }
    if (missed.length > 0) { misses.push(`${prompt} -> missed ${missed.join(', ')}`); }
    for (const id of expect) {
      if (!known.has(id)) { unknown.add(id); }
    }
  }
  const ratio = (hits: number, other: number): number => (hits + other === 0 ? 1 : hits / (hits + other));
  const bindingPositives = bindingHits;
  return {
    prompts: fixture.prompts.length,
    truePositives,
    falseNegatives,
    falsePositives,
    recall: ratio(truePositives, falseNegatives),
    bindingRecall: ratio(bindingHits, truePositives + falseNegatives - bindingHits),
    precision: ratio(bindingPositives, falsePositives),
    targets: evalTargets(fixture),
    misses,
    demoted,
    unknownLabels: [...unknown],
  };
}

/** How many labelled prompts expect each id. */
export function promptsPerLabel(fixture: RouterEvalFixture): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { expect } of fixture.prompts) {
    for (const id of new Set(expect)) { counts.set(id, (counts.get(id) ?? 0) + 1); }
  }
  return counts;
}
