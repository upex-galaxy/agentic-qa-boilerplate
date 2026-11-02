/**
 * @fileoverview Tests for the `.agents/project.yaml` schema module.
 *
 * Two kinds of test here, and the split matters. Most run against small YAML
 * literals, because a fixture that fits on screen is a test whose failure can
 * be read. A handful run against THIS REPO'S REAL `.agents/project.yaml`
 * (values only) and `.agents/project.schema.yaml` (the documented template,
 * ADR-0025), because the whole module exists to survive those files: their
 * folded scalars, flow sequences, inline comments after values, and comment
 * blocks between keys. A synthetic fixture would pass while the real file
 * corrupted. Every edit of a real file goes through `edit`, which throws when
 * it matched nothing: a fixture edit that silently no-ops is a test that passes
 * vacuously.
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
  CHANGED_DEFAULTS_EXEMPT,
  changedDefaults,
  checkSchema,
  classifyProjectYaml,
  CONSUMER_YAML_HEADER,
  describeChangedDefault,
  distinctiveValues,
  FILLED_ELSEWHERE,
  findIdentityLeaks,
  generateSchema,
  GENERIC_RULES,
  IDENTITY_PATHS,
  identityTokens,
  isChangedDefaultExempt,
  isIdentityPath,
  isMaintainerCopy,
  isSchemaOwner,
  locateLeaf,
  originIsUpstream,
  planInsertions,
  projectDelta,
  ruleFor,
  sameValues,
  SCHEMA_FILE,
  SCHEMA_SOURCE,
  schemaExemptions,
  schemaKeyPaths,
  seedFromSchema,
  stripYamlComments,
  walkGovernedFile,
  yamlLeafWalk,
} from './agents-schema.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const realSource = (): string => readFileSync(join(REPO_ROOT, SCHEMA_SOURCE), 'utf8');
const committedSchema = (): string => readFileSync(join(REPO_ROOT, SCHEMA_FILE), 'utf8');

/** `text.replace(from, to)`, refusing an edit that matched nothing. */
function edit(text: string, from: string | RegExp, to: string): string {
  const out = text.replace(from, to);
  if (out === text) { throw new Error(`fixture edit matched nothing: ${String(from)}`); }
  return out;
}

/**
 * The boilerplate's own checkout (the package name AND the maintainer sentinel,
 * the same test `contractsEnforced` makes). A scaffolded project runs this file
 * too: its yaml is its own, its schema is synced and `packages/` is pruned, so
 * the assertions about the maintainers' copy are skipped there, never failed.
 * That includes every case built on `generateSchema(realSource(), ...)`: there
 * the real source is the project's filled yaml, which generation refuses (its
 * own dates and hosts are identity leaks), so the fixture itself is empty.
 */
const MAINTAINER_CHECKOUT = isSchemaOwner(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) && isMaintainerCopy(realSource());

/**
 * The real source with EVERY identity leaf filled the way a maintainer fills
 * it: a concrete value, and the `TODO: ` prefix dropped from its comment.
 * Values are distinct per leaf so a single survivor is attributable.
 */
function fillEveryIdentityLeaf(source: string): { text: string, values: string[] } {
  const walk = yamlLeafWalk(source)!;
  const containers = new Set(walk.containers);
  const edits: Array<{ range: readonly [number, number], text: string }> = [];
  const values: string[] = [];
  let i = 0;
  for (const path of walk.entries.keys()) {
    if (containers.has(path) || !isIdentityPath(path)) { continue; }
    const located = locateLeaf(source, path.split('.'))!;
    const value = path.endsWith('.key') ? `LEAK-${900 + i}` : `https://leak-${i}.acme-corp.io`;
    values.push(value);
    edits.push({ range: located.value, text: value });
    if (located.trailingComment) {
      const comment = source.slice(...located.trailingComment);
      edits.push({ range: located.trailingComment, text: comment.replace(/^#\s*TODO:\s*/, '# ') });
    }
    i += 1;
  }
  return { text: applySplices(source, edits), values };
}

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

  test.skipIf(!MAINTAINER_CHECKOUT)('generates without refusing', () => {
    expect(generateSchema(source, committedSchema()).error).toBeNull();
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('every key path survives the splices', () => {
    const result = generateSchema(source, committedSchema());
    const before = yamlLeafWalk(source)!;
    const after = yamlLeafWalk(result.schema)!;
    expect([...after.entries.keys()].sort()).toEqual([...before.entries.keys()].sort());
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('the generated schema carries no identity leak', () => {
    expect(findIdentityLeaks(generateSchema(source, committedSchema()).schema)).toEqual([]);
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('every table entry actually fired: a stale rule is a silent no-op', () => {
    const result = generateSchema(source, committedSchema());
    expect(result.generic.sort()).toEqual(Object.keys(GENERIC_RULES).sort());
  });

  // The two safety reversals. A template that hands a brand-new project
  // standing push authorization, under a `strategy_source: inherited` that
  // says nobody chose anything, contradicts Critical Rule #5.
  test.skipIf(!MAINTAINER_CHECKOUT)('ships confirm, not this repo\'s allowed, for direct_push_to_protected', () => {
    const walk = yamlLeafWalk(generateSchema(source, committedSchema()).schema)!;
    expect(walk.entries.get('git_strategy.policy.direct_push_to_protected')).toBe('confirm');
    expect(walk.entries.get('git_strategy.policy.admin_bypass')).toBe(false);
    expect(walk.entries.get('git_strategy.meta.strategy_source')).toBe('inherited');
    expect(walk.entries.get('git_strategy.meta.policy_source')).toBe('declared');
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('methodology defaults travel unchanged', () => {
    const walk = yamlLeafWalk(generateSchema(source, committedSchema()).schema)!;
    expect(walk.entries.get('testing.tc_creation_stage')).toBe('auto');
    expect(walk.entries.get('qa.formal_blocked_gate')).toBe(true);
    expect(walk.entries.get('orchestration.max_workers')).toBe(4);
    expect(walk.entries.get('qa.qa_epics.defect_epic.name')).toBe('QA Defect Management');
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('a comment far from any rule is preserved byte-for-byte', () => {
    const { schema } = generateSchema(source, committedSchema());
    expect(schema).toContain('# Read as {{TC_CREATION_STAGE}}; unset or unrecognized is treated as `auto`.');
  });

  // Invariant 1: `parseDocument(...).toString()` rewrites `[main]` as
  // `[ main ]` and rewraps the folded scalar. A splice does neither.
  test.skipIf(!MAINTAINER_CHECKOUT)('a flow sequence is not reformatted', () => {
    expect(generateSchema(source, committedSchema()).schema).toContain('precedence: [feat, fix, refactor, test, docs, chore]');
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('the schema keeps its own documented header; nothing of the source\'s reaches it', () => {
    const { schema } = generateSchema(source, committedSchema());
    expect(schema.startsWith('# THE DOCUMENTED TEMPLATE for .agents/project.yaml.')).toBe(true);
    expect(schema).not.toContain('MAINTAINER COPY');
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('the maintainer copy is values only: one sentinel line, no other comment', () => {
    const commented = realSource().split('\n').filter(l => /(?:^|\s)#/.test(l));
    expect(commented).toHaveLength(1);
    expect(commented[0].startsWith('# MAINTAINER COPY:')).toBe(true);
  });
});

describe('identity is blanked, whatever this repo filled in', () => {
  test('IDENTITY_PATHS matches segment by segment, * being one key name', () => {
    expect(isIdentityPath('project.project_name')).toBe(true);
    expect(isIdentityPath('environments.uat.web_url')).toBe(true);
    expect(isIdentityPath('qa.qa_epics.defect_epic.key')).toBe(true);
    expect(isIdentityPath('qa.qa_epics.defect_epic.name')).toBe(false);
    expect(isIdentityPath('testing.tc_creation_stage')).toBe(false);
    expect(isIdentityPath('environments.local')).toBe(false);
  });

  test('an identity leaf blanks even when filled', () => {
    expect(ruleFor('issue_tracker.atlassian_url', 'https://acme.atlassian.net')).toBe('blank');
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('every pattern covers at least one leaf of the real file: a stale pattern is a silent no-op', () => {
    const walk = yamlLeafWalk(realSource())!;
    const leaves = [...walk.entries.keys()].filter(p => !walk.containers.includes(p));
    for (const pattern of IDENTITY_PATHS) {
      expect(leaves.some(p => isIdentityPath(p) && p.split('.').length === pattern.split('.').length)).toBe(true);
    }
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('the real source generates the committed schema byte for byte', () => {
    expect(generateSchema(realSource(), committedSchema()).schema).toBe(committedSchema());
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('filling every identity leaf changes nothing in the schema, byte for byte', () => {
    const { text, values } = fillEveryIdentityLeaf(realSource());
    const result = generateSchema(text, committedSchema());
    expect(result.error).toBeNull();
    expect(result.schema).toBe(committedSchema());
    for (const value of values) { expect(result.schema).not.toContain(value); }
  });

  // ADR-0025: values flow down into the documented skeleton; comments never move.
  test('values are synced into the skeleton, every comment and header line untouched', () => {
    const src = 'project:\n  project_name: Acme\nqa:\n  gate: true\n  list: [a, b]\n';
    const skeleton = '# the template header\n\nproject:\n  # documented above\n  project_name: null # TODO: Project name (e.g. MyProject)\nqa:\n  gate: false # the gate\n  list:\n    - a\n';
    const { schema, error, changed } = generateSchema(src, skeleton);
    expect(error).toBeNull();
    expect(changed.sort()).toEqual(['qa.gate', 'qa.list']);
    expect(schema).toBe('# the template header\n\nproject:\n  # documented above\n  project_name: null # TODO: Project name (e.g. MyProject)\nqa:\n  gate: true # the gate\n  list: [a, b]\n');
  });

  test('an identity value typed into the template is blanked back to null', () => {
    const { schema, changed } = generateSchema('project:\n  project_name: Acme\n', 'project:\n  project_name: Acme # TODO: name\n');
    expect(changed).toEqual(['project.project_name']);
    expect(schema).toBe('project:\n  project_name: null # TODO: name\n');
  });

  // Review fix D1: the comment on the KEY's line documents the key, and a
  // splice from the colon used to swallow it when the value was a block.
  test('the key-line comment survives a block value changing, in every shape', () => {
    const skeleton = 'o:\n  overrides: # e.g. [{topics: [x], effort: max}]\n    - topics: [a]\n      effort: high\n  list: [] # e.g. [a, b]\n';
    const toBlock = generateSchema('o:\n  overrides:\n    - topics: [a]\n      effort: max\n  list:\n    - a\n', skeleton);
    expect(toBlock.error).toBeNull();
    expect(toBlock.schema).toBe('o:\n  overrides: # e.g. [{topics: [x], effort: max}]\n    - topics: [a]\n      effort: max\n  list: # e.g. [a, b]\n    - a\n');
    const toInline = generateSchema('o:\n  overrides: []\n  list: []\n', skeleton);
    expect(toInline.schema).toBe('o:\n  overrides: [] # e.g. [{topics: [x], effort: max}]\n  list: [] # e.g. [a, b]\n');
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('changing the Opus override effort keeps the model_overrides example comment', () => {
    const changed = edit(realSource(), /(model: claude-opus-5-5\n {6}effort: )\w+/, '$1max');
    const { schema, changed: paths } = generateSchema(changed, committedSchema());
    expect(paths).toEqual(['orchestration.model_overrides']);
    expect(schema).toContain('\n  model_overrides: # e.g. [{topics: [security, migration], tier: worker, model: claude-opus-5-5, effort: max}]\n');
    expect(checkSchema(changed, schema).ok).toBe(true);
  });

  test('key parity is literal and both ways: an undocumented key and an unseeded one each refuse', () => {
    const undocumented = generateSchema('a: 1\nb: 2\n', 'a: 1 # doc\n');
    expect(undocumented.error).toContain('does not document');
    expect(undocumented.undocumented).toEqual(['b']);
    const unseeded = generateSchema('a: 1\n', 'a: 1 # doc\nb: 2 # doc\n');
    expect(unseeded.error).toContain('lacks');
    expect(unseeded.unseeded).toEqual(['b']);
    // Environments too: the template's environments mirror the maintainer's.
    const env = generateSchema('environments:\n  local:\n    web_url: null\n', 'environments:\n  qa:\n    web_url: null\n');
    expect(env.undocumented).toContain('environments.local.web_url');
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('a real Atlassian host no longer refuses generation: it is blanked first', () => {
    const src = edit(realSource(), /atlassian_url: [^\n]*/, 'atlassian_url: https://acme-corp.atlassian.net');
    const result = generateSchema(src, committedSchema());
    expect(result.error).toBeNull();
    expect(result.schema).not.toContain('acme-corp');
  });
});

describe('the value-leak net under IDENTITY_PATHS', () => {
  test('finds URLs, hosts, issue keys and out-of-repo paths; skips loopback and prose', () => {
    const src = 'a: https://staging.acme.io\nb: acme.io\nc: ACME-7\nd: ../acme-api\ne: http://localhost:3000\nf: QA Defect Management\ng: bun xray\nh: \'{prefix}/{kebab-slug}\'\n';
    expect(distinctiveValues(src).sort()).toEqual(['../acme-api', 'ACME-7', 'acme.io', 'https://staging.acme.io'].sort());
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('a filled key in a MIXED block that nobody declared still refuses generation', () => {
    const src = edit(realSource(), '  tc_creation_stage: auto', '  tc_creation_stage: auto\n  sut_url: https://staging.acme.io');
    const skeleton = edit(committedSchema(), '  tc_creation_stage: auto', '  tc_creation_stage: auto\n  sut_url: null # the SUT');
    const result = generateSchema(src, skeleton);
    expect(result.error).toContain('identity leak');
    expect(result.leaks.some(l => l.pattern.includes('https://staging.acme.io'))).toBe(true);
  });
});

// GitHub "Use this template" copies the maintainers' filled yaml verbatim, and
// `package.json` with it, so nothing but the header sentinel tells the copy
// from the original.
describe('the maintainer copy and the template route', () => {
  test.skipIf(!MAINTAINER_CHECKOUT)('this repo\'s own yaml carries the sentinel; the schema never does', () => {
    expect(isMaintainerCopy(realSource())).toBe(true);
    expect(isMaintainerCopy(committedSchema())).toBe(false);
    expect(committedSchema()).not.toContain('MAINTAINER COPY');
  });

  test('the sentinel counts only in the leading comment block', () => {
    expect(isMaintainerCopy('# MAINTAINER COPY: x\nproject: {}\n')).toBe(true);
    expect(isMaintainerCopy('project: {}\n# MAINTAINER COPY: x\n')).toBe(false);
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('a schema carrying the sentinel is a leak the gate refuses', () => {
    const moved = edit(committedSchema(), '\nbackend:', '\n# MAINTAINER COPY: moved\nbackend:');
    expect(generateSchema(realSource(), moved).error).toContain('identity leak');
  });

  // A comment is the schema's to carry; an identity fact pasted into one is
  // still caught, which is the leak gate's whole reason to scan comments.
  // Review fix D3: a comment naming the project without quoting a whole value.
  test('identity tokens: the project name, the key and the own host labels, never template vocabulary', () => {
    const src = 'project:\n  project_name: Acmeware\n  project_key: AW\n  webapp_domain: acmeware-app.vercel.app\nissue_tracker:\n  atlassian_url: https://acmeteam.atlassian.net\ntesting:\n  default_env: staging\nenvironments:\n  local:\n    web_url: http://localhost:3000\n';
    expect(identityTokens(src).map(t => t.token).sort()).toEqual(['AW', 'Acmeware', 'acmeteam', 'acmeware-app'].sort());
    const flagged = (line: string): boolean => identityTokens(src).some(t => t.re.test(line));
    expect(flagged('# owned by the acmeware team')).toBe(true);
    expect(flagged('# the AW board')).toBe(true);
    expect(flagged('# AWS keys, staging, http://localhost:3000, company.atlassian.net')).toBe(false);
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('a bare project name or host label pasted into a schema COMMENT refuses', () => {
    for (const token of ['Bunkai', 'upexgalaxy74', 'upexbunkai']) {
      const leaked = edit(committedSchema(), '# release / default branch', `# release / default branch of ${token}`);
      expect(checkSchema(realSource(), leaked).ok).toBe(false);
      expect(generateSchema(realSource(), leaked).error).toContain('identity leak');
    }
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('a real date pasted into a schema COMMENT refuses', () => {
    const dated = edit(committedSchema(), '# release / default branch', '# release / default branch, chosen 2026-08-21');
    expect(generateSchema(realSource(), dated).error).toContain('identity leak');
  });

  test('origin decides between the boilerplate (or a fork) and a repo made from it', () => {
    expect(originIsUpstream('https://github.com/upex-galaxy/agentic-qa-boilerplate.git')).toBe(true);
    expect(originIsUpstream('git@github.com:someone/agentic-qa-boilerplate.git')).toBe(true);
    expect(originIsUpstream('https://github.com/acme/acme-qa.git')).toBe(false);
    expect(originIsUpstream(null)).toBe(false);
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('classifyProjectYaml: maintainer here, copied-template elsewhere, consumer without the sentinel', () => {
    expect(classifyProjectYaml(realSource(), 'https://github.com/upex-galaxy/agentic-qa-boilerplate')).toBe('maintainer');
    expect(classifyProjectYaml(realSource(), 'https://github.com/acme/acme-qa.git')).toBe('copied-template');
    expect(classifyProjectYaml(realSource(), null)).toBe('copied-template');
    expect(classifyProjectYaml(seedFromSchema(committedSchema())!, 'https://github.com/acme/acme-qa.git')).toBe('consumer');
  });

  test('a reseeded copy carries no maintainer identity, and the git-flow guard fires on it', () => {
    const reseeded = seedFromSchema(committedSchema())!;
    for (const value of distinctiveValues(realSource())) { expect(reseeded).not.toContain(value); }
    const walk = yamlLeafWalk(reseeded)!;
    expect(walk.entries.get('project.project_name')).toBeNull();
    expect(walk.entries.get('project.project_key')).toBeNull();
    expect(walk.entries.get('issue_tracker.atlassian_url')).toBeNull();
    // git-flow-master §"Bootstrap trigger" case (b): strategy set, strategy_source
    // not `chosen`, project_name null -> OFFER Strategy Setup.
    expect(walk.entries.get('git_strategy.strategy')).not.toBeNull();
    expect(walk.entries.get('git_strategy.meta.strategy_source')).toBe('inherited');
    expect(walk.entries.get('git_strategy.policy.direct_push_to_protected')).toBe('confirm');
    expect(reseeded.startsWith(CONSUMER_YAML_HEADER)).toBe(true);
  });

  test('a seeded yaml is values only: the header is its one comment block', () => {
    const reseeded = seedFromSchema(committedSchema())!;
    const body = reseeded.slice(CONSUMER_YAML_HEADER.length);
    expect(body.split('\n').filter(l => /(?:^|\s)#/.test(l))).toEqual([]);
    expect(sameValues(committedSchema(), reseeded)).toBe(true);
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('the consumer header matches its twin in the scaffolder', () => {
    const prepare = readFileSync(join(REPO_ROOT, 'packages', 'create-agentic-qa', 'src', 'prepare.ts'), 'utf8');
    const twin = /const CONSUMER_YAML_HEADER = `([\s\S]*?)`;/.exec(prepare)![1].replace(/\\`/g, '`');
    expect(twin).toBe(CONSUMER_YAML_HEADER);
  });

  // The scaffolder package has no `yaml` dependency, so it carries its own
  // copy of the stripper. Dynamic import: `packages/` is pruned downstream.
  test.skipIf(!MAINTAINER_CHECKOUT)('the comment stripper matches its twin in the scaffolder', async () => {
    const twin = await import(join(REPO_ROOT, 'packages', 'create-agentic-qa', 'src', 'prepare.ts')) as { stripYamlComments: (text: string) => string };
    for (const text of [committedSchema(), realSource(), SAMPLE, 'a: \'x # y\' # z\nb: >\n  one\n\n  two\n# tail\n']) {
      expect(twin.stripYamlComments(text)).toBe(stripYamlComments(text));
    }
  });
});

describe.skipIf(!MAINTAINER_CHECKOUT)('checkSchema', () => {
  const source = realSource();
  const schema = committedSchema();

  test('the committed schema is a fixpoint of the source', () => {
    expect(checkSchema(source, schema).ok).toBe(true);
  });

  test('a key added to project.yaml and not documented in the schema fires', () => {
    const grown = edit(source, '  max_workers: 4\n', '  default_timeout: null\n  max_workers: 4\n');
    const result = checkSchema(grown, schema);
    expect(result.ok).toBe(false);
    expect(result.undocumented).toContain('orchestration.default_timeout');
  });

  test('a key documented in the schema and missing from project.yaml fires', () => {
    const grown = edit(schema, '  max_workers: 4 #', '  default_timeout: null # TODO: seconds\n  max_workers: 4 #');
    const result = checkSchema(source, grown);
    expect(result.ok).toBe(false);
    expect(result.unseeded).toContain('orchestration.default_timeout');
  });

  // The comments are the schema's own: a gate that fired on a typo fix would be
  // a gate people route around.
  test('rewording a comment does not fire', () => {
    const reworded = edit(schema, '# release / default branch', '# the release branch');
    expect(checkSchema(source, reworded).ok).toBe(true);
  });

  test('turning a placeholder into a default DOES fire', () => {
    const filled = edit(schema, '  db_type: null #', '  db_type: PostgreSQL #');
    const result = checkSchema(source, filled);
    expect(result.ok).toBe(false);
    expect(result.stale).toContain('database.db_type');
  });

  test('a methodology default changed in project.yaml fires until synced, and the sync keeps the comment', () => {
    const changed = edit(source, /default_effort: \w+/, 'default_effort: low');
    const result = checkSchema(changed, schema);
    expect(result.stale).toEqual(['orchestration.default_effort']);
    const synced = generateSchema(changed, schema).schema;
    expect(synced).toMatch(/\n {2}default_effort: low # harness effort level/);
    expect(checkSchema(changed, synced).ok).toBe(true);
  });
});

describe('projectDelta', () => {
  const source = realSource();
  const schema = committedSchema();

  test.skipIf(!MAINTAINER_CHECKOUT)('a project scaffolded before orchestration: existed sees one block', () => {
    const old = edit(source, /\norchestration:\n(?: {2}.*\n)+/, '\n');
    const delta = projectDelta(old, schema);
    expect(delta.gaps).toHaveLength(1);
    expect(delta.gaps[0].block).toBe('orchestration');
    expect(delta.gaps[0].wholeBlock).toBe(true);
    // Every leaf of the block, whatever the count: asserting a hardcoded
    // number here just breaks the day someone legitimately adds a key. A
    // nested map (`permission_modes`) is a container, not a leaf: the delta
    // lists its children, so the container path is left out here too.
    const walk = yamlLeafWalk(schema)!;
    const blockLeaves = [...schemaKeyPaths(schema)!.keys()]
      .filter(k => k.startsWith('orchestration.') && !walk.containers.includes(k));
    expect(delta.gaps[0].paths.sort()).toEqual(blockLeaves.sort());
    expect(delta.gaps[0].paths.length).toBeGreaterThan(3);
  });

  // The headline of the whole change: this path sits at depth 3, so the
  // 2-level walk could not see it at all.
  test.skipIf(!MAINTAINER_CHECKOUT)('a missing DEPTH-3 leaf is visible', () => {
    const stripped = edit(source, / {4}direct_push_to_protected: \w+\n/, '');
    const paths = projectDelta(stripped, schema).gaps.flatMap(g => g.paths);
    expect(paths).toContain('git_strategy.policy.direct_push_to_protected');
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('a key the PROJECT has and upstream does not is silent', () => {
    const extended = edit(source, '  max_workers: 4\n', '  their_own_key: 1\n  max_workers: 4\n');
    expect(projectDelta(extended, schema).gaps).toEqual([]);
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('a gap is a key path, never a value', () => {
    const filled = edit(source, / {2}project_key: [^\n]*/, '  project_key: ACME');
    expect(projectDelta(filled, schema).gaps).toEqual([]);
  });

  test('a parse failure reports and compares nothing', () => {
    const delta = projectDelta(`${source}\n: : :\n`, schema);
    expect(delta.error).toContain('does not parse');
    expect(delta.gaps).toEqual([]);
  });
});

// Owner decision (2026-11-02): a methodology value the project changed is
// listed by `bun sync` and `setup:doctor`, never written back.
describe('changedDefaults', () => {
  const upstream = [
    'project:',
    '  project_name: null # TODO: name',
    'testing:',
    '  tc_creation_stage: auto # doc',
    '  browser:',
    '    pair_mode: null # asked once',
    'orchestration:',
    '  max_workers: 4 # doc',
    '  orchestrator_skills: [orca-cli, orchestration] # doc',
    'git_strategy:',
    '  policy:',
    '    direct_push_to_protected: confirm # doc',
    'board:',
    '  source: auto # doc',
    '',
  ].join('\n');

  test('a methodology value the project changed is listed with both values', () => {
    const project = upstream.replace('max_workers: 4', 'max_workers: 6').replace('[orca-cli, orchestration]', '[]');
    const { changed, error } = changedDefaults(project, upstream);
    expect(error).toBeNull();
    expect(changed.map(describeChangedDefault)).toEqual([
      'orchestration.max_workers: yours 6, upstream default 4',
      'orchestration.orchestrator_skills: yours [], upstream default [orca-cli, orchestration]',
    ]);
  });

  test('identity, GENERIC_RULES, filled placeholders, gaps and exempt blocks are never listed', () => {
    const project = [
      'project:',
      '  project_name: Acme',
      'testing:',
      '  browser:',
      '    pair_mode: true',
      'orchestration:',
      '  max_workers: 4',
      'git_strategy:',
      '  policy:',
      '    direct_push_to_protected: allowed',
      'board:',
      '  source: none',
      'updater:',
      '  schema_exempt: [board]',
      '',
    ].join('\n');
    // tc_creation_stage is missing (a gap, not a change); orchestrator_skills too.
    expect(changedDefaults(project, upstream).changed).toEqual([]);
  });

  test('an unparseable project says so instead of listing nothing', () => {
    expect(changedDefaults('a: 1\n: : :\n', upstream).error).toContain('does not parse');
  });

  // Review fix D2: per-project configuration is not methodology.
  test('per-project configuration blocks are exempt, methodology is not', () => {
    for (const path of ['updater.protected_paths', 'secrets.provider', 'secrets.onepassword.vault', 'git_strategy.strategy', 'harnesses', 'board.statuses.tickets.in_test', 'testing.browser.pair_mode', 'qa.qa_epics.defect_epic.name']) {
      expect(isChangedDefaultExempt(path)).toBe(true);
    }
    for (const path of ['orchestration.max_workers', 'qa.methodology.gate_mode', 'qa.formal_blocked_gate', 'testing.tc_creation_stage', 'updaterx.y']) {
      expect(isChangedDefaultExempt(path)).toBe(false);
    }
    expect(CHANGED_DEFAULTS_EXEMPT).toContain('updater.*');
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('a seeded consumer that set its own protected paths, denies and secret manager hears nothing', () => {
    let project = seedFromSchema(committedSchema())!;
    project = edit(project, /^ {2}protected_paths: \[\]$/m, '  protected_paths: [scripts/x.ts]');
    project = edit(project, /^ {2}declined_denies: \[\]$/m, '  declined_denies: [\'Bash(env)\']');
    project = edit(project, /^ {2}provider: local$/m, '  provider: 1password');
    expect(changedDefaults(project, committedSchema())).toEqual({ changed: [], error: null });
    const methodology = edit(project, /^ {2}max_workers: \d+$/m, '  max_workers: 9');
    expect(changedDefaults(methodology, committedSchema()).changed.map(c => c.path)).toEqual(['orchestration.max_workers']);
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('the maintainer copy differs from its own template in no methodology value', () => {
    expect(changedDefaults(realSource(), committedSchema())).toEqual({ changed: [], error: null });
  });
});

describe('updater.schema_exempt', () => {
  const source = realSource();
  const schema = committedSchema();
  const withoutBlock = source.replace(/\norchestration:\n(?: {2}.*\n)+/, '\n');
  test.skipIf(!MAINTAINER_CHECKOUT)('the fixture really dropped the block', () => {
    expect(withoutBlock).not.toBe(source);
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('reads the declared list', () => {
    const text = withoutBlock.replace('  protected_paths: []', '  protected_paths: []\n  schema_exempt: [orchestration]');
    expect(schemaExemptions(text)).toEqual(['orchestration']);
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('an absent list is empty, not a throw', () => {
    expect(schemaExemptions(source)).toEqual([]);
  });

  test('a non-list value is ignored rather than half-honoured', () => {
    const text = source.replace('  protected_paths: []', '  protected_paths: []\n  schema_exempt: orchestration');
    expect(schemaExemptions(text)).toEqual([]);
  });

  // Without the opt-out a deliberately removed block is re-offered on every
  // run forever, and a recurring warning is one people silence wholesale.
  test.skipIf(!MAINTAINER_CHECKOUT)('an exempt block stops being reported', () => {
    const text = withoutBlock.replace('  protected_paths: []', '  protected_paths: []\n  schema_exempt: [orchestration]');
    const delta = projectDelta(text, schema);
    expect(delta.gaps).toEqual([]);
    expect(delta.exempt).toEqual(['orchestration']);
  });
});

describe('insertion', () => {
  const source = realSource();
  const schema = committedSchema();
  const stripBlock = (text: string, block: string): string =>
    edit(text, new RegExp(`\\n${block}:\\n(?:  .*\\n)+`), '\n');

  test.skipIf(!MAINTAINER_CHECKOUT)('a whole missing block returns to its schema position, not to EOF', () => {
    const old = stripBlock(source, 'orchestration');
    const plan = planInsertions(old, schema, ['orchestration']);
    const { text, error } = applyInsertions(old, plan);
    expect(error).toBeNull();
    const top = [...yamlLeafWalk(text)!.entries.keys()].filter(k => !k.includes('.'));
    // Exactly where it was: between git_strategy and updater. Appending would
    // have put it after environments, and one block further out per release.
    expect(top.slice(top.indexOf('git_strategy'), top.indexOf('git_strategy') + 3))
      .toEqual(['git_strategy', 'orchestration', 'updater']);
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('re-inserting closes the gap the diff reported', () => {
    const old = stripBlock(source, 'orchestration');
    expect(projectDelta(old, schema).gaps).toHaveLength(1);
    const { text } = applyInsertions(old, planInsertions(old, schema, ['orchestration']));
    expect(projectDelta(text, schema).gaps).toEqual([]);
  });

  // ADR-0025: the schema documents the block; the project's file is values only.
  test.skipIf(!MAINTAINER_CHECKOUT)('the block arrives as values, without one of its comments', () => {
    const old = stripBlock(source, 'orchestration');
    const { text } = applyInsertions(old, planInsertions(old, schema, ['orchestration']));
    expect(text).toContain('\n  max_workers: 4\n');
    expect(text.split('\n').filter(l => /(?:^|\s)#/.test(l) && !l.startsWith('# MAINTAINER COPY:'))).toEqual([]);
  });

  test('a single leaf arrives without its leading or trailing comment', () => {
    const miniSchema = 'kept:\n  a: 1 # doc a\n  # documents b\n  b: [x] # doc b\n';
    const project = 'kept:\n  a: 1\nother: 2\n';
    const { text, error } = applyInsertions(project, planInsertions(project, miniSchema, ['kept.b']));
    expect(error).toBeNull();
    expect(text).toBe('kept:\n  a: 1\n  b: [x]\nother: 2\n');
  });

  // The case the parent-offset bug produced: a first child has no preceding
  // sibling, so it anchors to the top of the parent's body — and a block's
  // value node starts AFTER the indent, so a naive splice lands mid-indent.
  test.skipIf(!MAINTAINER_CHECKOUT)('a first-child leaf lands at the right indent inside its parent', () => {
    const old = edit(source, / {4}direct_push_to_protected: \w+\n/, '');
    const plan = planInsertions(old, schema, ['git_strategy.policy.direct_push_to_protected']);
    const { text, error } = applyInsertions(old, plan);
    expect(error).toBeNull();
    expect(text).toContain('\n    direct_push_to_protected: confirm\n');
    expect(yamlLeafWalk(text)!.entries.get('git_strategy.policy.direct_push_to_protected')).toBe('confirm');
  });

  // The diff reports the leaf (`testing.browser.pair_mode`); its parent
  // `testing.browser` is missing too, so there was nothing to anchor to and
  // the key was skipped forever. The plan lifts it to the missing sub-block.
  test.skipIf(!MAINTAINER_CHECKOUT)('a new sub-block inside an existing block is inserted whole, under its parent', () => {
    const old = edit(source, / {2}browser:\n {4}pair_mode: null\n/, '');
    const gap = projectDelta(old, schema).gaps.find(g => g.block === 'testing');
    expect(gap?.wholeBlock).toBe(false);
    const plan = planInsertions(old, schema, gap!.paths);
    expect(plan.skipped).toEqual([]);
    expect(plan.inserted).toEqual(['testing.browser']);
    const { text, error } = applyInsertions(old, plan);
    expect(error).toBeNull();
    expect(yamlLeafWalk(text)!.entries.get('testing.browser.pair_mode')).toBeNull();
    expect(text).toContain('\n  browser:\n');
    expect(projectDelta(text, schema).gaps).toEqual([]);
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('a missing leaf takes the SCHEMA\'s value, not the maintainer\'s', () => {
    const old = edit(source, / {4}admin_bypass: true\n/, '');
    const { text } = applyInsertions(old, planInsertions(old, schema, ['git_strategy.policy.admin_bypass']));
    expect(yamlLeafWalk(text)!.entries.get('git_strategy.policy.admin_bypass')).toBe(false);
  });

  // INSERT-ONLY is the promise that makes writing to a project's identity file
  // acceptable at all. Every existing leaf keeps its value, byte for byte.
  test.skipIf(!MAINTAINER_CHECKOUT)('not one existing value changes', () => {
    const old = stripBlock(edit(source, / {2}project_key: [^\n]*/, '  project_key: ACME'), 'orchestration');
    const before = yamlLeafWalk(old)!;
    const { text, error } = applyInsertions(old, planInsertions(old, schema, ['orchestration']));
    expect(error).toBeNull();
    const after = yamlLeafWalk(text)!;
    for (const [path, value] of before.entries) {
      if (before.containers.includes(path)) { continue; }
      expect(after.entries.get(path)).toEqual(value);
    }
    expect(after.entries.get('project.project_key')).toBe('ACME');
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('several keys anchored to the same spot keep the schema\'s order', () => {
    const old = edit(edit(source, / {2}default_model: [^\n]*\n/, ''), / {2}default_effort: [^\n]*\n/, '');
    const plan = planInsertions(old, schema, ['orchestration.default_model', 'orchestration.default_effort']);
    const { text, error } = applyInsertions(old, plan);
    expect(error).toBeNull();
    // The key lines, not the bare words: the comments around them name both.
    expect(text.indexOf('  default_model:')).toBeGreaterThan(-1);
    expect(text.indexOf('  default_model:')).toBeLessThan(text.indexOf('  default_effort:'));
  });

  test.skipIf(!MAINTAINER_CHECKOUT)('a path absent from the schema is reported, never silently dropped', () => {
    const plan = planInsertions(source, schema, ['nope.not_here']);
    expect(plan.inserted).toEqual([]);
    expect(plan.skipped[0].reason).toContain('not found');
  });

  test('an unparseable project is refused before anything is planned', () => {
    const plan = planInsertions(`${source}\n: : :\n`, schema, ['orchestration']);
    expect(plan.error).toContain('does not parse');
    expect(applyInsertions(source, plan).text).toBe(source);
  });

  test('an empty plan leaves the text identical', () => {
    const plan = planInsertions(source, schema, []);
    expect(applyInsertions(source, plan).text).toBe(source);
  });
});

// The gate the spike's finding 4 actually needed. Its claim was that
// `agents-setup.ts` had drifted to 31 of 93 paths; measured against the
// schema, 54 of those 93 are methodology defaults nothing should prompt for,
// and all 8 remaining placeholders are filled by something else. So the fix is
// not to derive the field list — it is to stop the next placeholder from
// arriving with nobody to fill it.
describe.skipIf(!MAINTAINER_CHECKOUT)('every schema placeholder has somebody to fill it', () => {
  test('either agents:setup prompts for it, or FILLED_ELSEWHERE names who does', () => {
    const schema = generateSchema(realSource(), committedSchema()).schema;
    const placeholders = [...schemaKeyPaths(schema)!.entries()].filter(([, todo]) => todo).map(([p]) => p);
    const installer = readFileSync(join(REPO_ROOT, 'scripts', 'agents-setup.ts'), 'utf8');
    const prompted = new Set([...installer.matchAll(/key:\s*'([a-z_]+)'/g)].map(m => m[1]));

    const orphans = placeholders.filter(p => !prompted.has(p.split('.').pop()!) && !(p in FILLED_ELSEWHERE));
    expect(orphans).toEqual([]);
    expect(placeholders.length).toBeGreaterThan(30);
  });

  test('FILLED_ELSEWHERE carries no entry that is no longer a placeholder', () => {
    const shape = schemaKeyPaths(generateSchema(realSource(), committedSchema()).schema)!;
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
