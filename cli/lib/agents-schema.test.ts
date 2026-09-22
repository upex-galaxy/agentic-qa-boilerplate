/**
 * @fileoverview Tests for the `.agents/project.yaml` schema module.
 *
 * Two kinds of test here, and the split matters. Most run against small YAML
 * literals, because a fixture that fits on screen is a test whose failure can
 * be read. A handful run against THIS REPO'S REAL `.agents/project.yaml`,
 * because the whole module exists to survive that specific file: its folded
 * scalar, its flow sequences, its inline comments after values, and its
 * comment blocks between keys. A synthetic fixture would pass while the real
 * file corrupted.
 *
 * Nothing here writes to the repo. The real file is read and spliced in
 * memory only.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import {
  applyInsertions,
  applySplices,
  checkSchema,
  FILLED_ELSEWHERE,
  findIdentityLeaks,
  generateSchema,
  GENERIC_RULES,
  isSchemaOwner,
  locateLeaf,
  planInsertions,
  projectDelta,
  ruleFor,
  SCHEMA_SOURCE,
  schemaExemptions,
  schemaKeyPaths,
  walkGovernedFile,
  yamlLeafWalk,
} from './agents-schema.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const realSource = (): string => readFileSync(join(REPO_ROOT, SCHEMA_SOURCE), 'utf8');

const SAMPLE = `top:
  a: 1
  b: null # TODO: fill me
  nested:
    deep: value
    deeper:
      leaf: 7
list: [x, y]
empty: {}
environments:
  local:
    web_url: null
    api_url: null
  qa:
    web_url: null
    api_url: null
`;

describe('yamlLeafWalk', () => {
  test('reaches every depth, not just two', () => {
    const walk = yamlLeafWalk(SAMPLE)!;
    expect([...walk.entries.keys()]).toContain('top.nested.deeper.leaf');
    expect(walk.entries.get('top.nested.deeper.leaf')).toBe(7);
  });

  test('an empty object is a leaf, not a vanished container', () => {
    const walk = yamlLeafWalk(SAMPLE)!;
    expect(walk.entries.has('empty')).toBe(true);
    expect(walk.containers).not.toContain('empty');
  });

  test('an array is a leaf: its elements are not key paths', () => {
    const walk = yamlLeafWalk(SAMPLE)!;
    expect(walk.entries.has('list')).toBe(true);
    expect([...walk.entries.keys()].some(k => k.startsWith('list.'))).toBe(false);
  });

  test('a container is reported alongside its children', () => {
    const walk = yamlLeafWalk(SAMPLE)!;
    expect(walk.containers).toContain('top.nested');
    expect(walk.entries.has('top.nested')).toBe(true);
  });

  test('blockOf attributes every depth to its top-level block', () => {
    const walk = yamlLeafWalk(SAMPLE)!;
    expect(walk.blockOf.get('top.nested.deeper.leaf')).toBe('top');
  });

  // Invariant 2. The old `configEntries` fell back to a regex scan that only
  // saw two levels, so a broken file silently produced a NARROWER key set and
  // then reported success.
  test('a parse failure is null, never a narrowed key set', () => {
    expect(yamlLeafWalk('a: 1\n: : :\n')).toBeNull();
  });

  test('a non-mapping document is null', () => {
    expect(yamlLeafWalk('- just\n- a list\n')).toBeNull();
  });
});

describe('the environments wildcard', () => {
  test('project-chosen key names collapse to *', () => {
    const walk = walkGovernedFile(SAMPLE, SCHEMA_SOURCE)!;
    const paths = [...walk.entries.keys()];
    expect(paths).toContain('environments.*');
    expect(paths).toContain('environments.*.web_url');
    expect(paths).not.toContain('environments.local.web_url');
    expect(paths).not.toContain('environments.qa.web_url');
  });

  test('a wildcarded path carries no value, because several would collide', () => {
    const walk = walkGovernedFile(SAMPLE, SCHEMA_SOURCE)!;
    expect(walk.entries.get('environments.*.web_url')).toBeUndefined();
  });

  // Without this the feature is noise on every run for every project that
  // named its environments anything but ours, and noise gets `--auto`'d away.
  test('a project running uat instead of qa is not nagged', () => {
    const theirs = SAMPLE.replace('  qa:', '  uat:');
    const delta = projectDelta(theirs, SAMPLE);
    expect(delta.error).toBeNull();
    expect(delta.gaps).toEqual([]);
  });

  test('but a MISSING leaf inside an environment is still caught', () => {
    const theirs = SAMPLE.replace(/ {2}qa:\n {4}web_url: null\n {4}api_url: null\n/, '  qa:\n    web_url: null\n');
    // `local` still declares api_url, so the leaf set is intact: the wildcard
    // compares the union, which is the honest reading of "an exemplar".
    expect(projectDelta(theirs, SAMPLE).gaps).toEqual([]);
    const stripped = SAMPLE.replace(/ {4}api_url: null\n/g, '');
    const delta = projectDelta(stripped, SAMPLE);
    expect(delta.gaps.flatMap(g => g.paths)).toContain('environments.*.api_url');
  });
});

describe('locateLeaf', () => {
  test('the value range is the value text exactly', () => {
    const loc = locateLeaf(SAMPLE, ['top', 'a'])!;
    expect(SAMPLE.slice(loc.value[0], loc.value[1])).toBe('1');
  });

  test('the trailing comment is found and stops at the newline', () => {
    const loc = locateLeaf(SAMPLE, ['top', 'b'])!;
    expect(SAMPLE.slice(loc.trailingComment![0], loc.trailingComment![1])).toBe('# TODO: fill me');
  });

  test('the leading comment block is the contiguous run at the key\'s indent', () => {
    const text = 'a:\n  # one\n  # two\n  k: 1\n';
    const loc = locateLeaf(text, ['a', 'k'])!;
    expect(text.slice(loc.leadingComment![0], loc.leadingComment![1])).toBe('  # one\n  # two\n');
  });

  test('a comment at a DIFFERENT indent is not swept into the block', () => {
    const text = 'a:\n# flush left, belongs to nobody here\n  # mine\n  k: 1\n';
    const loc = locateLeaf(text, ['a', 'k'])!;
    expect(text.slice(loc.leadingComment![0], loc.leadingComment![1])).toBe('  # mine\n');
  });

  // The bug this caught: a block sequence's range runs to where the NEXT
  // token starts, so splicing over it ate the separating newline and produced
  // `[]  branch_prefixes:` on one line.
  test('a block collection\'s value range excludes the trailing whitespace', () => {
    const text = 'a:\n  - one\n  - two\nb: 2\n';
    const loc = locateLeaf(text, ['a'])!;
    expect(text.slice(loc.value[0], loc.value[1])).toBe('- one\n  - two');
  });

  test('afterKey points just past the key\'s colon', () => {
    const text = 'a:\n  - one\n';
    const loc = locateLeaf(text, ['a'])!;
    expect(text.slice(0, loc.afterKey)).toBe('a:');
  });

  test('an absent path is null, not a throw', () => {
    expect(locateLeaf(SAMPLE, ['top', 'nope'])).toBeNull();
    expect(locateLeaf(SAMPLE, ['nope', 'deeper'])).toBeNull();
  });
});

describe('applySplices', () => {
  test('later edits do not shift earlier offsets', () => {
    const out = applySplices('abcdef', [{ range: [0, 1], text: 'XXXX' }, { range: [4, 6], text: 'Y' }]);
    expect(out).toBe('XXXXbcdY');
  });

  test('edits may be passed in any order', () => {
    const out = applySplices('abcdef', [{ range: [4, 6], text: 'Y' }, { range: [0, 1], text: 'XXXX' }]);
    expect(out).toBe('XXXXbcdY');
  });

  // A file that parses and means something else is the worst outcome, so an
  // overlap is a throw rather than a silent last-writer-wins.
  test('overlapping ranges throw', () => {
    expect(() => applySplices('abcdef', [{ range: [0, 3], text: 'x' }, { range: [2, 5], text: 'y' }])).toThrow(/overlapping/);
  });
});

describe('ruleFor', () => {
  test('a null leaf blanks (a no-op: it is already the placeholder)', () => {
    expect(ruleFor('project.project_key', null)).toBe('blank');
  });

  test('a non-null leaf keeps its value: methodology the consumer inherits', () => {
    expect(ruleFor('testing.tc_creation_stage', 'auto')).toBe('keep');
  });

  test('a path in the table is generic regardless of its value', () => {
    expect(ruleFor('git_strategy.meta.strategy_source', 'chosen')).toBe('generic');
  });
});

describe('the identity leak gate', () => {
  test('a real date in a comment is a leak', () => {
    expect(findIdentityLeaks('created: 2026-08-21 # stamped\n')).toHaveLength(1);
  });

  test('the YYYY-MM-DD placeholder is not', () => {
    expect(findIdentityLeaks('created: null # YYYY-MM-DD stamped by Strategy Setup\n')).toEqual([]);
  });

  test('a ruleset id and its name are leaks', () => {
    expect(findIdentityLeaks('x: 1 # VERIFIED against ruleset 16809531\n')).toHaveLength(1);
    expect(findIdentityLeaks('x: 1 # the ProtectPublic ruleset\n')).toHaveLength(1);
  });

  test('a concrete Atlassian host is a leak, the documented placeholder is not', () => {
    expect(findIdentityLeaks('url: https://acme-corp.atlassian.net\n')).toHaveLength(1);
    expect(findIdentityLeaks('url: null # TODO: (e.g. https://company.atlassian.net)\n')).toEqual([]);
  });
});

describe('isSchemaOwner', () => {
  // A consumer that regenerated the schema would blank ITS OWN filled yaml
  // over the template, and from then on the diff would compare the project
  // against itself and report zero gaps forever, while looking healthy.
  test('only the boilerplate package may regenerate', () => {
    expect(isSchemaOwner('{"name":"agentic-qa-boilerplate"}')).toBe(true);
    expect(isSchemaOwner('{"name":"acme-qa-automation"}')).toBe(false);
    expect(isSchemaOwner('not json')).toBe(false);
  });
});

describe('generateSchema, against the real .agents/project.yaml', () => {
  const source = realSource();

  test('generates without refusing', () => {
    expect(generateSchema(source).error).toBeNull();
  });

  test('every key path survives the splices', () => {
    const result = generateSchema(source);
    const before = yamlLeafWalk(source)!;
    const after = yamlLeafWalk(result.schema)!;
    expect([...after.entries.keys()].sort()).toEqual([...before.entries.keys()].sort());
  });

  test('the generated schema carries no identity leak', () => {
    expect(findIdentityLeaks(generateSchema(source).schema)).toEqual([]);
  });

  test('every table entry actually fired: a stale rule is a silent no-op', () => {
    const result = generateSchema(source);
    expect(result.generic.sort()).toEqual(Object.keys(GENERIC_RULES).sort());
  });

  // The two safety reversals. A template that hands a brand-new project
  // standing push authorization, under a `strategy_source: inherited` that
  // says nobody chose anything, contradicts Critical Rule #5.
  test('ships confirm, not this repo\'s allowed, for direct_push_to_protected', () => {
    const walk = yamlLeafWalk(generateSchema(source).schema)!;
    expect(walk.entries.get('git_strategy.policy.direct_push_to_protected')).toBe('confirm');
    expect(walk.entries.get('git_strategy.policy.admin_bypass')).toBe(false);
    expect(walk.entries.get('git_strategy.meta.strategy_source')).toBe('inherited');
    expect(walk.entries.get('git_strategy.meta.policy_source')).toBe('declared');
  });

  test('methodology defaults travel unchanged', () => {
    const walk = yamlLeafWalk(generateSchema(source).schema)!;
    expect(walk.entries.get('testing.tc_creation_stage')).toBe('auto');
    expect(walk.entries.get('qa.formal_blocked_gate')).toBe(true);
    expect(walk.entries.get('orchestration.max_workers')).toBe(4);
    expect(walk.entries.get('qa.qa_epics.defect_epic.name')).toBe('QA Defect Management');
  });

  test('a comment far from any rule is preserved byte-for-byte', () => {
    const { schema } = generateSchema(source);
    expect(schema).toContain('# Read as {{TC_CREATION_STAGE}}; unset or unrecognized is treated as `auto`.');
  });

  // Invariant 1: `parseDocument(...).toString()` rewrites `[main]` as
  // `[ main ]` and rewraps the folded scalar. A splice does neither.
  test('a flow sequence is not reformatted', () => {
    expect(generateSchema(source).schema).toContain('precedence: [feat, fix, refactor, test, docs, chore]');
  });

  test('the generated banner replaces the source\'s own header', () => {
    const { schema } = generateSchema(source);
    expect(schema.startsWith('# GENERATED by `bun run agents:schema`')).toBe(true);
    expect(schema).not.toContain('Edit values manually, or run `bun run agents:setup`');
  });
});

describe('checkSchema', () => {
  const source = realSource();
  const schema = generateSchema(source).schema;

  test('the committed schema matches the source', () => {
    expect(checkSchema(source, schema).ok).toBe(true);
  });

  test('a key added upstream and not regenerated fires', () => {
    const grown = source.replace('  max_workers: 4 #', '  default_timeout: null # TODO: seconds\n  max_workers: 4 #');
    const result = checkSchema(grown, schema);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('orchestration.default_timeout');
  });

  // Paths-plus-marking, never bytes: a gate that fires on a typo fix is a gate
  // people route around.
  test('rewording a comment does not fire', () => {
    const reworded = schema.replace('# release / default branch', '# the release branch');
    expect(checkSchema(source, reworded).ok).toBe(true);
  });

  test('turning a placeholder into a default DOES fire', () => {
    const filled = schema.replace('  db_type: null #', '  db_type: PostgreSQL #');
    const result = checkSchema(source, filled);
    expect(result.ok).toBe(false);
    expect(result.remarked).toContain('database.db_type');
  });
});

describe('projectDelta', () => {
  const source = realSource();
  const schema = generateSchema(source).schema;

  test('a project scaffolded before orchestration: existed sees one block', () => {
    const old = source.replace(/\norchestration:\n(?: {2}.*\n)+/, '\n');
    const delta = projectDelta(old, schema);
    expect(delta.gaps).toHaveLength(1);
    expect(delta.gaps[0].block).toBe('orchestration');
    expect(delta.gaps[0].wholeBlock).toBe(true);
    // Every leaf of the block, whatever the count: asserting a hardcoded
    // number here just breaks the day someone legitimately adds a key.
    const blockLeaves = [...schemaKeyPaths(schema)!.keys()].filter(k => k.startsWith('orchestration.'));
    expect(delta.gaps[0].paths.sort()).toEqual(blockLeaves.sort());
    expect(delta.gaps[0].paths.length).toBeGreaterThan(3);
  });

  // The headline of the whole change: this path sits at depth 3, so the
  // 2-level walk could not see it at all.
  test('a missing DEPTH-3 leaf is visible', () => {
    const stripped = source.replace('    direct_push_to_protected: allowed #', '    #x: y #');
    const paths = projectDelta(stripped, schema).gaps.flatMap(g => g.paths);
    expect(paths).toContain('git_strategy.policy.direct_push_to_protected');
  });

  test('a key the PROJECT has and upstream does not is silent', () => {
    const extended = source.replace('  max_workers: 4 #', '  their_own_key: 1 # project extension\n  max_workers: 4 #');
    expect(projectDelta(extended, schema).gaps).toEqual([]);
  });

  test('values are never compared: only key paths', () => {
    const filled = source.replace('  project_key: null #', '  project_key: ACME #');
    expect(projectDelta(filled, schema).gaps).toEqual([]);
  });

  test('a parse failure reports and compares nothing', () => {
    const delta = projectDelta(`${source}\n: : :\n`, schema);
    expect(delta.error).toContain('does not parse');
    expect(delta.gaps).toEqual([]);
  });
});

describe('updater.schema_exempt', () => {
  const source = realSource();
  const schema = generateSchema(source).schema;
  const withoutBlock = source.replace(/\norchestration:\n(?: {2}.*\n)+/, '\n');

  test('reads the declared list', () => {
    const text = withoutBlock.replace('  protected_paths: []', '  protected_paths: []\n  schema_exempt: [orchestration]');
    expect(schemaExemptions(text)).toEqual(['orchestration']);
  });

  test('an absent list is empty, not a throw', () => {
    expect(schemaExemptions(source)).toEqual([]);
  });

  test('a non-list value is ignored rather than half-honoured', () => {
    const text = source.replace('  protected_paths: []', '  protected_paths: []\n  schema_exempt: orchestration');
    expect(schemaExemptions(text)).toEqual([]);
  });

  // Without the opt-out a deliberately removed block is re-offered on every
  // run forever, and a recurring warning is one people silence wholesale.
  test('an exempt block stops being reported', () => {
    const text = withoutBlock.replace('  protected_paths: []', '  protected_paths: []\n  schema_exempt: [orchestration]');
    const delta = projectDelta(text, schema);
    expect(delta.gaps).toEqual([]);
    expect(delta.exempt).toEqual(['orchestration']);
  });
});

describe('insertion', () => {
  const source = realSource();
  const schema = generateSchema(source).schema;
  const stripBlock = (text: string, block: string): string =>
    text.replace(new RegExp(`\\n${block}:\\n(?:  .*\\n)+`), '\n');

  test('a whole missing block returns to its schema position, not to EOF', () => {
    const old = stripBlock(source, 'orchestration');
    const plan = planInsertions(old, schema, ['orchestration'], '8.5');
    const { text, error } = applyInsertions(old, plan);
    expect(error).toBeNull();
    const top = [...yamlLeafWalk(text)!.entries.keys()].filter(k => !k.includes('.'));
    // Exactly where it was: between git_strategy and updater. Appending would
    // have put it after environments, and one block further out per release.
    expect(top.slice(top.indexOf('git_strategy'), top.indexOf('git_strategy') + 3))
      .toEqual(['git_strategy', 'orchestration', 'updater']);
  });

  test('re-inserting closes the gap the diff reported', () => {
    const old = stripBlock(source, 'orchestration');
    expect(projectDelta(old, schema).gaps).toHaveLength(1);
    const { text } = applyInsertions(old, planInsertions(old, schema, ['orchestration'], '8.5'));
    expect(projectDelta(text, schema).gaps).toEqual([]);
  });

  test('the block arrives with the comments that explain it', () => {
    const old = stripBlock(source, 'orchestration');
    const { text } = applyInsertions(old, planInsertions(old, schema, ['orchestration'], '8.5'));
    expect(text).toContain('# Defaults for multi-session orchestration');
    expect(text).toContain('max_workers: 4 # concurrent workers per round');
  });

  test('the release marker names the release and sits above the block', () => {
    const old = stripBlock(source, 'orchestration');
    const { text } = applyInsertions(old, planInsertions(old, schema, ['orchestration'], '8.5'));
    const lines = text.split('\n');
    const marker = lines.findIndex(l => l.includes('# NEW in 8.5'));
    expect(marker).toBeGreaterThan(-1);
    expect(lines.slice(marker).findIndex(l => l.startsWith('orchestration:'))).toBeGreaterThan(0);
  });

  test('no release means no marker, not the string "null"', () => {
    const old = stripBlock(source, 'orchestration');
    const { text } = applyInsertions(old, planInsertions(old, schema, ['orchestration'], null));
    expect(text).not.toContain('# NEW in');
  });

  // The case the parent-offset bug produced: a first child has no preceding
  // sibling, so it anchors to the top of the parent's body — and a block's
  // value node starts AFTER the indent, so a naive splice lands mid-indent.
  test('a first-child leaf lands at the right indent inside its parent', () => {
    const old = source.replace(/ {4}direct_push_to_protected: allowed #[^\n]*\n/, '');
    const plan = planInsertions(old, schema, ['git_strategy.policy.direct_push_to_protected'], '8.5');
    const { text, error } = applyInsertions(old, plan);
    expect(error).toBeNull();
    expect(text).toContain('\n    direct_push_to_protected: confirm #');
    expect(yamlLeafWalk(text)!.entries.get('git_strategy.policy.direct_push_to_protected')).toBe('confirm');
  });

  test('a missing leaf takes the SCHEMA\'s value, not the maintainer\'s', () => {
    const old = source.replace(/ {4}admin_bypass: true #[^\n]*\n/, '');
    const { text } = applyInsertions(old, planInsertions(old, schema, ['git_strategy.policy.admin_bypass'], null));
    expect(yamlLeafWalk(text)!.entries.get('git_strategy.policy.admin_bypass')).toBe(false);
  });

  // INSERT-ONLY is the promise that makes writing to a project's identity file
  // acceptable at all. Every existing leaf keeps its value, byte for byte.
  test('not one existing value changes', () => {
    const old = stripBlock(source.replace('  project_key: null #', '  project_key: ACME #'), 'orchestration');
    const before = yamlLeafWalk(old)!;
    const { text, error } = applyInsertions(old, planInsertions(old, schema, ['orchestration'], '8.5'));
    expect(error).toBeNull();
    const after = yamlLeafWalk(text)!;
    for (const [path, value] of before.entries) {
      if (before.containers.includes(path)) { continue; }
      expect(after.entries.get(path)).toEqual(value);
    }
    expect(after.entries.get('project.project_key')).toBe('ACME');
  });

  test('several keys anchored to the same spot keep the schema\'s order', () => {
    const old = source
      .replace(/ {2}default_model: ''[^\n]*\n/, '')
      .replace(/ {2}default_effort: high[^\n]*\n/, '');
    const plan = planInsertions(old, schema, ['orchestration.default_model', 'orchestration.default_effort'], null);
    const { text, error } = applyInsertions(old, plan);
    expect(error).toBeNull();
    expect(text.indexOf('default_model')).toBeLessThan(text.indexOf('default_effort'));
  });

  test('a path absent from the schema is reported, never silently dropped', () => {
    const plan = planInsertions(source, schema, ['nope.not_here'], null);
    expect(plan.inserted).toEqual([]);
    expect(plan.skipped[0].reason).toContain('not found');
  });

  test('an unparseable project is refused before anything is planned', () => {
    const plan = planInsertions(`${source}\n: : :\n`, schema, ['orchestration'], null);
    expect(plan.error).toContain('does not parse');
    expect(applyInsertions(source, plan).text).toBe(source);
  });

  test('an empty plan leaves the text identical', () => {
    const plan = planInsertions(source, schema, [], null);
    expect(applyInsertions(source, plan).text).toBe(source);
  });
});

// The gate the spike's finding 4 actually needed. Its claim was that
// `agents-setup.ts` had drifted to 31 of 93 paths; measured against the
// schema, 54 of those 93 are methodology defaults nothing should prompt for,
// and all 8 remaining placeholders are filled by something else. So the fix is
// not to derive the field list — it is to stop the next placeholder from
// arriving with nobody to fill it.
describe('every schema placeholder has somebody to fill it', () => {
  test('either agents:setup prompts for it, or FILLED_ELSEWHERE names who does', () => {
    const schema = generateSchema(realSource()).schema;
    const placeholders = [...schemaKeyPaths(schema)!.entries()].filter(([, todo]) => todo).map(([p]) => p);
    const installer = readFileSync(join(REPO_ROOT, 'scripts', 'agents-setup.ts'), 'utf8');
    const prompted = new Set([...installer.matchAll(/key:\s*'([a-z_]+)'/g)].map(m => m[1]));

    const orphans = placeholders.filter(p => !prompted.has(p.split('.').pop()!) && !(p in FILLED_ELSEWHERE));
    expect(orphans).toEqual([]);
    expect(placeholders.length).toBeGreaterThan(30);
  });

  test('FILLED_ELSEWHERE carries no entry that is no longer a placeholder', () => {
    const shape = schemaKeyPaths(generateSchema(realSource()).schema)!;
    for (const path of Object.keys(FILLED_ELSEWHERE)) {
      expect(shape.get(path)).toBe(true);
    }
  });
});

describe('schemaKeyPaths', () => {
  test('marks a null leaf as a placeholder the consumer must fill', () => {
    const shape = schemaKeyPaths(SAMPLE)!;
    expect(shape.get('top.b')).toBe(true);
    expect(shape.get('top.a')).toBe(false);
  });

  test('a container is never a placeholder', () => {
    expect(schemaKeyPaths(SAMPLE)!.get('top.nested')).toBe(false);
  });
});
