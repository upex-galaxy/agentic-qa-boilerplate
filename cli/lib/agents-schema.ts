/**
 * @fileoverview The schema half of `.agents/project.yaml`: one full-depth key
 * walk, one generated `.agents/project.schema.yaml`, and the asymmetric diff
 * that tells a downstream project which keys upstream added since it was
 * scaffolded.
 *
 * WHY THIS EXISTS. `.agents/project.yaml` is `bootstrapOnly`: the sync never
 * overwrites it, because it holds the project's identity. Upstream keeps
 * ADDING structural blocks to it, so a project scaffolded before a block
 * existed never learns it should have one. Today that is patched by one
 * hand-written back-fill hook per block in `cli/update-boilerplate.ts`, and
 * `orchestration:` is the proof the mechanism does not scale: it is the newest
 * block and nobody wrote its hook.
 *
 * THREE INVARIANTS, each paid for by a measurement:
 *
 *  1. NEVER `parseDocument(...).toString()` on a file under `.agents/`. The
 *     Document API preserves comments and silently reformats everything else:
 *     on the real `project.yaml` it rewraps the folded `git_strategy`
 *     description and rewrites `[main]` as `[ main ]`; on
 *     `jira-required.yaml` it GROWS the file by 2271 bytes while changing
 *     nothing. The parser is a LOCATOR; every write is a string splice at the
 *     offsets it reports, and the result is re-parsed to verify.
 *
 *  2. A PARSE FAILURE IS LOUD. `configEntries` in `updater-parity.ts` falls
 *     back to a regex line scan that only sees two levels, so a broken yaml
 *     silently NARROWS the diff and then reports success. Here a parse error
 *     returns `null` with the reason attached and the caller skips the file.
 *
 *  3. PROJECT-CHOSEN KEY NAMES ARE WILDCARDED. `environments:` key names are
 *     the project's (`uat`, not `qa`). A literal path diff would demand
 *     `environments.qa.web_url` from a project that deliberately has no `qa`,
 *     which turns the feature into noise on every run, and noise gets
 *     `--auto`'d away. The leaf SET is compared against each environment the
 *     project declares; the environment NAMES never are.
 *
 * The 2-level walk in `updater-parity.ts` stays exactly where it is: it is
 * right for MCP registries and permission blocks, where depth 3 really is
 * noise. It is wrong for THIS file, where 46 of 93 key paths sit at depth 3+ —
 * including `git_strategy.policy.direct_push_to_protected`, the key Critical
 * Rule #5 resolves every push against.
 */

import { isMap, isScalar, isSeq, parseDocument } from 'yaml';

// ============================================================================
// WHAT THIS MODULE GOVERNS
// ============================================================================

/** The project's real, filled identity file. Never overwritten by the sync. */
export const SCHEMA_SOURCE = '.agents/project.yaml';

/** The generated, committed template the diff compares a project against. */
export const SCHEMA_FILE = '.agents/project.schema.yaml';

/**
 * Per-file deep-walk configuration. A file ABSENT here keeps the 2-level
 * `configEntries` walk in `updater-parity.ts`, which is deliberate:
 * `.agents/jira-required.yaml` has the same drift problem but a much richer
 * shape (`required` / `optional` / `unmapped` / `work_types` / `link_types`,
 * 45 KB), and giving it a naive deep walk would produce a truncated row nobody
 * can act on. It needs its own wildcards and it is a follow-up, not a freebie.
 */
export const DEEP_WALK: Readonly<Record<string, { readonly wildcards: readonly string[] }>> = {
  [SCHEMA_SOURCE]: { wildcards: ['environments'] },
  [SCHEMA_FILE]: { wildcards: ['environments'] },
};

/** The wildcard segment written into a path whose key name is the project's. */
export const WILDCARD = '*';

/**
 * The package name that owns the GENERATOR. A fork keeps it, and a fork is an
 * upstream, so that is correct.
 */
export const UPSTREAM_PACKAGE = 'agentic-qa-boilerplate';

/**
 * Whether this checkout may REGENERATE the schema.
 *
 * This guard is not ceremony. `.agents/project.schema.yaml` is upstream's
 * template, delivered to a consumer by the sync like any other synced file. If
 * a consumer ran the generator, it would blank ITS OWN filled yaml over the
 * template — and from that moment `projectDelta` would compare the project
 * against itself and report zero gaps, forever, while looking healthy. That is
 * the same silent self-defeat invariant 2 exists to prevent, arriving through
 * a different door.
 */
export function isSchemaOwner(packageJsonText: string): boolean {
  try { return (JSON.parse(packageJsonText) as { name?: string }).name === UPSTREAM_PACKAGE; }
  catch { return false; }
}

// ============================================================================
// THE FULL-DEPTH WALK
// ============================================================================

export interface LeafWalk {
  /**
   * Every path in the file, containers included, in document order. A
   * container is present so `configKeyDelta` can report a whole new block as
   * one object rather than as a scatter of leaves.
   */
  entries: Map<string, unknown>
  /** The subset of `entries` that hold children (a block, not a leaf). */
  containers: string[]
  /** Top-level block each path belongs to, for block-level grouping. */
  blockOf: Map<string, string>
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Every key path in a YAML document, to the leaves, with the configured
 * prefixes' children collapsed to `*`.
 *
 * Returns `null` when the text does not parse or is not a mapping. That is the
 * loud failure of invariant 2: the caller reports the reason and skips the
 * file rather than comparing a silently narrowed key set.
 *
 * A path containing `*` carries `undefined` as its value, never a merged one.
 * Several environments collapse onto the same path with different values, and
 * inventing a winner there would report a value difference that does not
 * exist. The key set is the whole point; the values under a wildcard are not
 * compared by anything.
 */
export function yamlLeafWalk(text: string, wildcards: readonly string[] = []): LeafWalk | null {
  let parsed: unknown;
  try {
    const doc = parseDocument(text);
    if (doc.errors.length > 0) { return null; }
    parsed = doc.toJS();
  }
  catch {
    return null;
  }
  if (!isPlainObject(parsed)) { return null; }

  const wildcardSet = new Set(wildcards);
  const entries = new Map<string, unknown>();
  const containers: string[] = [];
  const blockOf = new Map<string, string>();

  const walk = (node: Record<string, unknown>, prefix: string, block: string): void => {
    for (const [key, value] of Object.entries(node)) {
      // The prefix decides, not the key: `environments` is the wildcard
      // holder, so it is `environments.local` that becomes `environments.*`.
      const segment = wildcardSet.has(prefix) ? WILDCARD : key;
      const currentPath = prefix === '' ? segment : `${prefix}.${segment}`;
      const currentBlock = prefix === '' ? key : block;
      const wildcarded = currentPath.includes(WILDCARD);

      if (!entries.has(currentPath)) {
        entries.set(currentPath, wildcarded ? undefined : value);
        blockOf.set(currentPath, currentBlock);
      }

      // An EMPTY object is a leaf: there is nothing below it to compare, and
      // treating it as a container would make it vanish from the key set.
      if (isPlainObject(value) && Object.keys(value).length > 0) {
        if (!containers.includes(currentPath)) { containers.push(currentPath); }
        walk(value, currentPath, currentBlock);
      }
    }
  };

  walk(parsed, '', '');
  return { entries, containers, blockOf };
}

/** The walk configured for one of the files this module governs. */
export function walkGovernedFile(text: string, filePath: string): LeafWalk | null {
  const config = DEEP_WALK[filePath];
  return yamlLeafWalk(text, config?.wildcards ?? []);
}

/** Whether a watched file gets the deep walk instead of the 2-level one. */
export function hasDeepWalk(filePath: string): boolean {
  return filePath in DEEP_WALK;
}

// ============================================================================
// LOCATOR + SPLICE — invariant 1
// ============================================================================

/** A byte range in the source text, `[start, end)`. */
export type TextRange = readonly [number, number];

export interface SpliceEdit {
  range: TextRange
  text: string
}

/**
 * Apply splices to the source. Edits are sorted and applied from the LAST
 * offset backwards so every remaining range still points where the parser
 * said it did. Overlapping ranges are a programming error and throw, because
 * the alternative is a file that parses and means something else.
 */
export function applySplices(text: string, edits: readonly SpliceEdit[]): string {
  const sorted = [...edits].sort((a, b) => a.range[0] - b.range[0]);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].range[0] < sorted[i - 1].range[1]) {
      throw new Error(`overlapping splices at ${sorted[i - 1].range[0]} and ${sorted[i].range[0]}`);
    }
  }
  let out = text;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const { range, text: replacement } = sorted[i];
    out = out.slice(0, range[0]) + replacement + out.slice(range[1]);
  }
  return out;
}

interface Located {
  /** The value's own text, exactly: `range[0]..range[1]` of the value node. */
  value: TextRange
  /** The trailing `# ...` comment after the value, or `null`. */
  trailingComment: TextRange | null
  /** The contiguous whole-line comment block directly above the key, or `null`. */
  leadingComment: TextRange | null
  /** Indentation of the key's line, for rendering a replacement comment. */
  indent: string
  /**
   * Offset just past the `:` that follows the key. A BLOCK collection's value
   * starts on the NEXT line, so splicing a one-line replacement over the value
   * alone leaves `accepted_divergences:` and `[]` on two lines. Valid YAML,
   * ugly template. Replacing from here instead puts the value back on the
   * key's own line.
   */
  afterKey: number
  /**
   * End of the pair as the parser sees it: past the trailing comment and its
   * newline. `value[1]` stops at the value; this is where the NEXT pair
   * begins, which is what an insertion needs.
   */
  nodeEnd: number
  /** Start of the pair's own line, before any leading comment block. */
  lineStart: number
}

/**
 * Find one leaf by path and report the ranges an edit may touch.
 *
 * The value range comes straight from the node (`range[0]..range[1]`). The
 * trailing comment is what sits between the value's end and the node's end
 * (`range[1]..range[2]`), minus the newline. The LEADING comment has no node
 * of its own, so it is found by walking back from the key's start over whole
 * lines that are pure comments at the same indent — the same block the parser
 * reports as `key.commentBefore`, which is used only to confirm the scan
 * found something.
 */
export function locateLeaf(text: string, path: readonly string[]): Located | null {
  let doc;
  try { doc = parseDocument(text, { keepSourceTokens: true }); }
  catch { return null; }
  if (doc.errors.length > 0) { return null; }

  const parent: unknown = path.length === 1 ? doc.contents : doc.getIn(path.slice(0, -1), true);
  if (!isMap(parent)) { return null; }
  const leafKey = path[path.length - 1];
  const pair = parent.items.find(item => isScalar(item.key) && String(item.key.value) === leafKey);
  if (!pair) { return null; }

  const valueNode = pair.value;
  if (!isScalar(valueNode) && !isSeq(valueNode) && !isMap(valueNode)) { return null; }
  const range = valueNode.range;
  if (!range) { return null; }

  const keyRange = isScalar(pair.key) ? pair.key.range : null;
  if (!keyRange) { return null; }

  // A BLOCK collection's range runs to where the next token starts, so it
  // swallows the newline that separates it from its sibling. Splicing `[]`
  // over that range produced `[]  branch_prefixes:` on one line, which is the
  // kind of corruption invariant 1's re-parse exists to catch — but it is
  // cheaper to not create it. Shrink the end back over trailing whitespace so
  // a replacement lands exactly where the VALUE was and the separator between
  // this pair and the next survives untouched.
  let valueEnd = range[1];
  while (valueEnd > range[0] && /\s/.test(text[valueEnd - 1])) { valueEnd -= 1; }

  // Trailing comment: between the value's end and the node's end, stopping at
  // the newline so the splice never eats the line break.
  let trailingComment: TextRange | null = null;
  const tail = text.slice(range[1], range[2]);
  const hash = tail.indexOf('#');
  if (hash !== -1) {
    const newline = tail.indexOf('\n', hash);
    trailingComment = [range[1] + hash, range[1] + (newline === -1 ? tail.length : newline)];
  }

  // Indent of the key's own line.
  const lineStart = text.lastIndexOf('\n', keyRange[0] - 1) + 1;
  const indent = text.slice(lineStart, keyRange[0]);

  // Leading comment block: contiguous full-line comments at the same indent.
  let leadingComment: TextRange | null = null;
  let blockStart = lineStart;
  for (;;) {
    if (blockStart === 0) { break; }
    const prevStart = text.lastIndexOf('\n', blockStart - 2) + 1;
    const prevLine = text.slice(prevStart, blockStart - 1);
    if (prevLine.trim().startsWith('#') && prevLine.startsWith(indent)) { blockStart = prevStart; continue; }
    break;
  }
  if (blockStart < lineStart) { leadingComment = [blockStart, lineStart]; }

  const colon = text.indexOf(':', keyRange[1] - 1);
  const afterKey = colon === -1 ? keyRange[2] : colon + 1;

  return { value: [range[0], valueEnd], trailingComment, leadingComment, indent, afterKey, nodeEnd: range[2], lineStart };
}

// ============================================================================
// THE RULES — what the schema keeps, blanks, or replaces
// ============================================================================

/**
 * What happens to one leaf on its way into the schema.
 *
 *  - `blank`   the value becomes `null`, the comment is kept verbatim.
 *  - `keep`    value and comment travel untouched.
 *  - `generic` upstream supplies a replacement, because this repo's own
 *              answer is meaningless or misleading downstream.
 *
 * The DEFAULT decides almost everything and needs no table: a leaf already
 * `null` is a field the consumer fills (`blank`, which is a no-op), and a
 * non-null leaf is methodology that the consumer should inherit (`keep`). The
 * split is the one `prepare.ts` already makes by hand: identity blanks,
 * methodology keeps.
 */
export type RuleKind = 'blank' | 'keep' | 'generic';

export interface GenericRule {
  /** Raw YAML text for the value, spliced in place of the current one. */
  value: string
  /** Replacement for the trailing `# ...` comment; `undefined` keeps it. */
  trailingComment?: string
  /** Replacement for the comment block above the key; `undefined` keeps it. */
  leadingComment?: string
  /** Why this repo's answer must not travel. Read by nobody; kept for the next maintainer. */
  why: string
}

/**
 * The identity that leaks through VALUES AND COMMENTS, which is the part the
 * spike did not catch. `prepare.ts` already resets the two `meta.*_source`
 * fields and strips `accepted_divergences`; it misses `description` and the
 * `require_pr_reviews` comment, both of which name this repo's GitHub ruleset
 * by id. A generated schema that carried those would ship one maintainer's
 * ruleset number to every consumer, in a file whose whole purpose is to be
 * copied.
 *
 * Every entry here is hand-authored, and that is safe ONLY because
 * `schemaKeyPaths` gates the pair: add a key under `git_strategy` and forget
 * it here and `agents:schema:check` fails naming the path. The hand-authored
 * surface is bounded to the one block that structurally cannot be derived.
 */
export const GENERIC_RULES: Readonly<Record<string, GenericRule>> = {
  'git_strategy.description': {
    value: '>\n    TODO: describe this project\'s branching strategy in prose — which branches are\n    long-lived, how work reaches the release branch, and any operational note the AI\n    needs before it runs a git command. Filled by the git-flow-master Strategy Setup\n    questionnaire, or by hand.',
    why: 'the boilerplate\'s own description narrates its admin-bypass push flow and names the ProtectPublic ruleset',
  },
  'git_strategy.protected': {
    value: '[main]',
    trailingComment: '# branches that are never force-pushed and never rewritten (AGENTS.md Critical Rule #6). Add the integration branch here too when the strategy has one.',
    why: 'the shipped comment asserts THIS repo\'s standing push authorization as if it were every project\'s',
  },
  // SAFETY. The two rules below deliberately ship a value DIFFERENT from this
  // repo's, and they are the only place in this module where that happens.
  //
  // `git_strategy.meta.strategy_source` is `inherited` in the schema: nobody
  // has chosen anything yet. Critical Rule #5 says an absent or unset
  // `git_strategy` behaves as `confirm` — ask before every push to a protected
  // branch — precisely because nobody chose. A template that hands a brand-new
  // project `direct_push_to_protected: allowed` alongside `inherited` would
  // contradict that: the AI would push to `main` without asking, under an
  // authorization the maintainer granted to HIS OWN repo and nobody granted to
  // this one. `confirm` costs one prompt and is reversible; `allowed` is the
  // default nobody notices until it has already pushed.
  //
  // `admin_bypass: true` is a FACT about this repo's credential, not a policy:
  // the push credential is an org admin and sits on the ruleset's bypass list,
  // which is why the remote's "Bypassed rule violations" line is expected here.
  // Shipping `true` to a project whose credential is not an admin tells the AI
  // to treat a genuine protection failure as routine and never open a PR.
  //
  // Strategy Setup raises both to the project's real answer when it runs.
  'git_strategy.policy.direct_push_to_protected': {
    value: 'confirm',
    trailingComment: '# forbidden | confirm | allowed. Ships `confirm` because meta.strategy_source is `inherited`: until Strategy Setup runs, nobody has authorized a direct push here.',
    why: 'this repo grants itself standing push authorization; a fresh project has authorized nothing',
  },
  'git_strategy.policy.admin_bypass': {
    value: 'false',
    trailingComment: '# true only when the push credential is on the host ruleset\'s bypass list. While false, a "Bypassed rule violations" line from the remote is a real finding, not noise.',
    why: 'a fact about this repo\'s admin credential, and a dangerous default for a project that has none',
  },
  'git_strategy.policy.require_pr_reviews': {
    value: '1',
    trailingComment: '# required approving reviews on a protected branch. Reconcile against the host with `bun run git:policy verify`.',
    why: 'the shipped comment cites this repo\'s ruleset id and the date it was verified',
  },
  'git_strategy.policy.accepted_divergences': {
    value: '[]',
    why: 'each entry names a divergence between THIS repo\'s yaml and THIS repo\'s GitHub ruleset',
  },
  'git_strategy.meta.created': {
    value: 'null',
    why: 'the date this repo ran Strategy Setup',
  },
  'git_strategy.meta.policy_verified': {
    value: 'null',
    why: 'the date this repo last reconciled against its host',
  },
  'git_strategy.meta.policy_source': {
    value: 'declared',
    why: '`accepted` is true of this repo only; a fresh project has never reconciled anything',
  },
  'git_strategy.meta.strategy_source': {
    value: 'inherited',
    leadingComment: '# Did anyone actually CHOOSE this strategy, or is it just the shipped default?\n# `strategy:` above is never null, so its value alone cannot answer that. Strategy\n# Setup flips this to `chosen` when the questionnaire actually runs.',
    why: 'the shipped comment records the maintainer\'s own 2026-08-21 confirmation',
  },
};

/** The rule for one leaf: the table first, then the null/non-null default. */
export function ruleFor(path: string, value: unknown): RuleKind {
  if (path in GENERIC_RULES) { return 'generic'; }
  return value === null ? 'blank' : 'keep';
}

/**
 * Placeholder paths that `bun run agents:setup` deliberately does NOT prompt
 * for, each with who fills it instead.
 *
 * This table exists to settle a question the spike got wrong. It reported that
 * `agents-setup.ts` fills "31 of 93" paths and concluded its field list had
 * drifted — the fix being to derive the list from the schema. Measured against
 * the generated schema, the installer covers 31 of the 39 paths that are
 * actually PLACEHOLDERS; the other 54 of 93 are methodology defaults nothing
 * should ever prompt for (`tc_creation_stage: auto`, `max_workers: 4`). Of the
 * 8 it skips, every one is filled by something else, and prompting for them
 * would be the bug.
 *
 * So the field list is not stale and deriving it wholesale would make the
 * installer worse. What was missing is the thing that keeps that true: a gate.
 * Add a placeholder upstream, and either the installer prompts for it or a line
 * lands here saying who does. Silence stops being an option.
 */
export const FILLED_ELSEWHERE: Readonly<Record<string, string>> = {
  'qa.qa_epics.master_test_plan_epic.key': 'discovered or created at runtime by the QA skills, then cached',
  'qa.qa_epics.test_repository_epic.key': 'discovered or created at runtime by the QA skills, then cached',
  'qa.qa_epics.test_artifacts_epic.key': 'discovered or created at runtime by the QA skills, then cached',
  'qa.qa_epics.defect_epic.key': 'discovered or created at runtime by the QA skills, then cached',
  'git_strategy.branches.integration': 'the git-flow-master Strategy Setup questionnaire',
  'git_strategy.branches.ephemeral_pattern': 'the git-flow-master Strategy Setup questionnaire',
  'git_strategy.meta.created': 'stamped by the git-flow-master Strategy Setup questionnaire',
  'git_strategy.meta.policy_verified': 'stamped by `bun run git:policy verify --stamp`',
};

// ============================================================================
// IDENTITY LEAK GATE
// ============================================================================

/**
 * Patterns that must never appear in the generated schema, in a value or in a
 * comment. This is the gate that catches the NEXT leak, the one no rule
 * anticipated: a maintainer pastes a real date or a real host into a comment,
 * `agents:schema` regenerates happily, and the number ships to every consumer.
 *
 * Kept deliberately small and specific. A broad pattern that fires on
 * legitimate prose gets suppressed, and a suppressed gate is not a gate.
 */
export const IDENTITY_PATTERNS: ReadonlyArray<{ name: string, re: RegExp }> = [
  { name: 'a real ISO date (use the YYYY-MM-DD placeholder in a comment, `null` in a value)', re: /\b20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/ },
  { name: 'a GitHub ruleset id', re: /\bruleset\s+\d{6,}\b/i },
  { name: 'this repo\'s ruleset name', re: /\bProtectPublic\b/ },
  // `company.atlassian.net` is the placeholder the source file's own TODO uses
  // as an example, so it has to be allowed through or the gate fires on the
  // documentation it is meant to protect.
  { name: 'a concrete Atlassian host', re: /https:\/\/(?!company\.|example\.|your-)[\w-]+\.atlassian\.net/ },
  { name: 'a GitHub owner/repo of the maintainer', re: /\bupex-galaxy\/[\w.-]+/ },
];

export interface IdentityLeak {
  line: number
  pattern: string
  text: string
}

/** Every identity pattern found in the generated schema, with its line. */
export function findIdentityLeaks(schemaText: string): IdentityLeak[] {
  const leaks: IdentityLeak[] = [];
  const lines = schemaText.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    for (const { name, re } of IDENTITY_PATTERNS) {
      if (re.test(lines[i])) { leaks.push({ line: i + 1, pattern: name, text: lines[i].trim() }); }
    }
  }
  return leaks;
}

// ============================================================================
// GENERATION
// ============================================================================

export interface GenerateResult {
  schema: string
  /** Paths whose value or comment the generator replaced. */
  blanked: string[]
  generic: string[]
  /** Set when generation refused: a parse failure, a bad splice, or a leak. */
  error: string | null
  leaks: IdentityLeak[]
}

/** The YAML text of a path's segments, for `locateLeaf`. */
function segments(path: string): string[] {
  return path.split('.');
}

/**
 * Derive the schema from the real `.agents/project.yaml`.
 *
 * Generate DOWNWARD, never upward. Hand-authoring the schema and validating
 * the real file against it gives cleaner decoupling on paper and recreates the
 * drift one level up in practice, with no gate that could catch it, because
 * nothing else would know what the true schema is. The boilerplate's yaml
 * stays the parent; what TRAVELS is the schema.
 *
 * Wildcarded blocks are NOT collapsed in the generated text: the schema keeps
 * whichever environments the boilerplate ships, because they are the exemplar
 * a human edits. The wildcard lives in the DIFF, which is where a project's
 * own environment names matter.
 */
export function generateSchema(sourceText: string): GenerateResult {
  const walk = yamlLeafWalk(sourceText);
  if (!walk) {
    return { schema: '', blanked: [], generic: [], leaks: [], error: `${SCHEMA_SOURCE} does not parse as a YAML mapping` };
  }

  const edits: SpliceEdit[] = [];
  const blanked: string[] = [];
  const generic: string[] = [];
  const containers = new Set(walk.containers);

  for (const [path, value] of walk.entries) {
    if (containers.has(path)) { continue; }
    const kind = ruleFor(path, value);
    if (kind === 'keep') { continue; }

    if (kind === 'blank') {
      // Already `null` by definition of the default rule, so there is nothing
      // to splice and no reason to pay for a locate. Recorded so the report
      // can say what the consumer must fill.
      blanked.push(path);
      continue;
    }

    const located = locateLeaf(sourceText, segments(path));
    if (!located) {
      return { schema: '', blanked: [], generic: [], leaks: [], error: `cannot locate ${path} in ${SCHEMA_SOURCE}` };
    }

    const rule = GENERIC_RULES[path];
    generic.push(path);

    // A one-line replacement for a value that used to be a block collection
    // goes back onto the key's own line, whitespace and all: replacing only
    // the value leaves `accepted_divergences:` with a lonely `[]` beneath it.
    const wasOnNextLine = sourceText.slice(located.afterKey, located.value[0]).includes('\n');
    const inline = !rule.value.includes('\n') && wasOnNextLine;
    edits.push(inline
      ? { range: [located.afterKey, located.value[1]] as TextRange, text: ` ${rule.value}` }
      : { range: located.value, text: rule.value });
    if (rule.trailingComment !== undefined && located.trailingComment) {
      edits.push({ range: located.trailingComment, text: rule.trailingComment });
    }
    if (rule.leadingComment !== undefined && located.leadingComment) {
      const indented = rule.leadingComment.split('\n').map(l => `${located.indent}${l}`).join('\n');
      edits.push({ range: located.leadingComment, text: `${indented}\n` });
    }
  }

  let schema: string;
  try { schema = applySplices(sourceText, edits); }
  catch (err) {
    return { schema: '', blanked, generic, leaks: [], error: err instanceof Error ? err.message : String(err) };
  }

  schema = withSchemaHeader(schema);

  // Re-parse to verify: invariant 1's second half. A splice that produced text
  // which no longer parses, or which lost a key, is a corrupted template and
  // must never reach disk.
  const after = yamlLeafWalk(schema);
  if (!after) {
    return { schema: '', blanked, generic, leaks: [], error: 'the generated schema does not parse — splice produced invalid YAML' };
  }
  const lost = [...walk.entries.keys()].filter(k => !after.entries.has(k));
  if (lost.length > 0) {
    return { schema: '', blanked, generic, leaks: [], error: `the generated schema lost ${lost.length} key path(s): ${lost.slice(0, 5).join(', ')}` };
  }

  const leaks = findIdentityLeaks(schema);
  if (leaks.length > 0) {
    const first = leaks[0];
    return { schema: '', blanked, generic, leaks, error: `${SCHEMA_FILE} would carry ${leaks.length} identity leak(s); first at line ${first.line}: ${first.pattern}` };
  }

  return { schema, blanked, generic, leaks: [], error: null };
}

const SCHEMA_HEADER = `# GENERATED by \`bun run agents:schema\` from ${SCHEMA_SOURCE}. DO NOT EDIT BY HAND.
#
# This is the TEMPLATE a consumer project is compared against, not a file any
# project reads at runtime. \`bun run up\` diffs a project's own
# ${SCHEMA_SOURCE} against this one and reports the key paths upstream has
# added since that project was scaffolded; \`bun run setup:doctor\` reports the
# same thing as a diagnosis. Values here are methodology defaults or \`null\`
# placeholders — never the maintainer's identity, which \`agents:schema\`
# refuses to emit.
#
# To change it: edit ${SCHEMA_SOURCE}, then run \`bun run agents:schema\`.
# \`bun run agents:schema:check\` fails the commit when the two disagree.
`;

/** Prepend the generated-file banner, replacing the source's own header. */
function withSchemaHeader(text: string): string {
  // The source opens with its own comment block addressed to a human editing
  // a real project. Replace exactly that leading run of comment lines; the
  // first non-comment line starts the content.
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length && (lines[i].startsWith('#') || lines[i].trim() === '')) { i += 1; }
  return `${SCHEMA_HEADER}\n${lines.slice(i).join('\n')}`;
}

// ============================================================================
// THE GATE — schema vs source
// ============================================================================

/**
 * The comparable shape of a schema: key paths plus whether each is a TODO
 * placeholder the consumer must fill.
 *
 * Compared as paths-plus-marking, never as bytes. A byte-exact gate is
 * brittle against comment rewording, and a gate that fires on a typo fix is a
 * gate people route around. Reword a comment freely; add or remove a key and
 * it fires.
 */
export function schemaKeyPaths(text: string): Map<string, boolean> | null {
  const walk = yamlLeafWalk(text);
  if (!walk) { return null; }
  const containers = new Set(walk.containers);
  const shape = new Map<string, boolean>();
  for (const [path, value] of walk.entries) {
    if (containers.has(path)) { shape.set(path, false); continue; }
    shape.set(path, value === null);
  }
  return shape;
}

export interface SchemaGateResult {
  ok: boolean
  /** Paths in the source that the committed schema lacks. */
  missing: string[]
  /** Paths the committed schema has that the source does not. */
  extra: string[]
  /** Paths present in both whose required/optional marking disagrees. */
  remarked: string[]
  error: string | null
}

/** Whether the committed schema still matches what the source would generate. */
export function checkSchema(sourceText: string, committedSchema: string): SchemaGateResult {
  const generated = generateSchema(sourceText);
  if (generated.error) { return { ok: false, missing: [], extra: [], remarked: [], error: generated.error }; }
  const want = schemaKeyPaths(generated.schema);
  const have = schemaKeyPaths(committedSchema);
  if (!want || !have) { return { ok: false, missing: [], extra: [], remarked: [], error: `${SCHEMA_FILE} does not parse` }; }
  const missing = [...want.keys()].filter(k => !have.has(k));
  const extra = [...have.keys()].filter(k => !want.has(k));
  const remarked = [...want.keys()].filter(k => have.has(k) && have.get(k) !== want.get(k));
  return { ok: missing.length === 0 && extra.length === 0 && remarked.length === 0, missing, extra, remarked, error: null };
}

// ============================================================================
// THE ASYMMETRIC DIFF — schema vs a consumer project
// ============================================================================

export interface ProjectGap {
  /** Top-level block the missing paths belong to, the unit a human decides on. */
  block: string
  /** Leaf paths the schema has and the project lacks, in schema order. */
  paths: string[]
  /** True when the project lacks the whole block, not just some leaves. */
  wholeBlock: boolean
}

export interface ProjectDelta {
  gaps: ProjectGap[]
  /** Blocks the project silenced through `updater.schema_exempt`. */
  exempt: string[]
  /** Loud parse failure (invariant 2): nothing was compared. */
  error: string | null
}

/**
 * Blocks a project has deliberately removed and does not want re-offered.
 * Without this the warning recurs on every run forever, and a recurring
 * warning is one people silence wholesale — which costs them the real gaps
 * too. With it, a project can silence a genuine gap, which is a trade worth
 * making: the alternative is the feature being turned off entirely.
 */
export function schemaExemptions(projectText: string): string[] {
  const walk = yamlLeafWalk(projectText);
  const raw = walk?.entries.get('updater.schema_exempt');
  if (!Array.isArray(raw)) { return []; }
  return raw.filter((v): v is string => typeof v === 'string');
}

/**
 * What the schema has and a consumer project lacks, grouped by top-level
 * block. ASYMMETRIC on purpose: a path the PROJECT has and the schema does not
 * is silent, because that is the project's own extension and reporting it
 * would read as an instruction to delete it.
 *
 * Values are never compared. Every value in a real project file is either its
 * identity or its chosen methodology, and both are the project's business.
 */
export function projectDelta(projectText: string, schemaText: string): ProjectDelta {
  const project = walkGovernedFile(projectText, SCHEMA_SOURCE);
  if (!project) { return { gaps: [], exempt: [], error: `the project's ${SCHEMA_SOURCE} does not parse; nothing was compared` }; }
  const schema = walkGovernedFile(schemaText, SCHEMA_FILE);
  if (!schema) { return { gaps: [], exempt: [], error: `${SCHEMA_FILE} does not parse; nothing was compared` }; }

  const exempt = new Set(schemaExemptions(projectText));
  const containers = new Set(schema.containers);
  const byBlock = new Map<string, string[]>();

  for (const path of schema.entries.keys()) {
    if (containers.has(path)) { continue; }
    if (project.entries.has(path)) { continue; }
    const block = schema.blockOf.get(path) ?? path.split('.')[0];
    if (exempt.has(block)) { continue; }
    const list = byBlock.get(block) ?? [];
    list.push(path);
    byBlock.set(block, list);
  }

  const gaps: ProjectGap[] = [];
  for (const [block, paths] of byBlock) {
    gaps.push({ block, paths, wholeBlock: !project.entries.has(block) });
  }
  return { gaps, exempt: [...exempt], error: null };
}

// ============================================================================
// INSERTION — at the schema's position, never at EOF
// ============================================================================

/**
 * The full text of one pair: its leading comment block through the newline
 * after its trailing comment. This is the unit that gets lifted out of the
 * schema and spliced into a project, because a key without the comment that
 * explains it is a key nobody fills.
 */
export function pairExtent(text: string, path: readonly string[]): { start: number, end: number } | null {
  const located = locateLeaf(text, path);
  if (!located) { return null; }
  const start = located.leadingComment ? located.leadingComment[0] : located.lineStart;
  // `nodeEnd` stops at the value for a block collection, so walk to the end of
  // the line either way.
  let end = located.nodeEnd;
  if (end > 0 && text[end - 1] !== '\n') {
    const newline = text.indexOf('\n', end);
    end = newline === -1 ? text.length : newline + 1;
  }
  return { start, end };
}

/** The sibling keys of `path` inside the schema, in document order. */
function schemaSiblings(schemaText: string, path: string): string[] {
  const walk = yamlLeafWalk(schemaText);
  if (!walk) { return []; }
  const parts = path.split('.');
  const parentPrefix = parts.slice(0, -1).join('.');
  const depth = parts.length;
  return [...walk.entries.keys()].filter((k) => {
    if (k.split('.').length !== depth) { return false; }
    return parts.length === 1 ? !k.includes('.') : k.startsWith(`${parentPrefix}.`);
  });
}

export interface InsertionPlan {
  edits: SpliceEdit[]
  /** Paths whose text will be spliced in, in the order they were planned. */
  inserted: string[]
  /** Paths the plan could not place, with the reason. Never silently dropped. */
  skipped: Array<{ path: string, reason: string }>
  error: string | null
}

/**
 * Where a new key goes, and the text that goes there.
 *
 * AT THE SCHEMA'S POSITION, NOT AT EOF. The four hand-written hooks this
 * replaces all append, and appending is semantically lossless and structurally
 * lossy: measured, a re-inserted `orchestration:` lands after `environments:`
 * instead of before `updater:`, and on the next release the next block lands
 * after that, until a file whose sections are grouped by comment headers stops
 * being grouped. Offset insertion costs the same and does not have this
 * problem — proven by a strip-and-reinsert that reconstructed the original
 * file byte for byte.
 *
 * The algorithm: walk the schema's sibling order backwards from the missing
 * key; the first sibling the PROJECT also has is the anchor, and the text goes
 * immediately after it. No preceding sibling matches -> the text goes at the
 * top of the parent's body. No parent either -> append, which is the old
 * behaviour and the honest fallback for a block whose neighbours are all
 * absent too.
 */
export function planInsertions(
  projectText: string,
  schemaText: string,
  paths: readonly string[],
  release: string | null = null,
): InsertionPlan {
  const project = yamlLeafWalk(projectText);
  if (!project) { return { edits: [], inserted: [], skipped: [], error: `the project's ${SCHEMA_SOURCE} does not parse; nothing was planned` }; }
  const schema = yamlLeafWalk(schemaText);
  if (!schema) { return { edits: [], inserted: [], skipped: [], error: `${SCHEMA_FILE} does not parse; nothing was planned` }; }

  const edits: SpliceEdit[] = [];
  const inserted: string[] = [];
  const skipped: Array<{ path: string, reason: string }> = [];
  const anchors = new Map<number, string[]>();

  for (const target of paths) {
    const extent = pairExtent(schemaText, target.split('.'));
    if (!extent) { skipped.push({ path: target, reason: `not found in ${SCHEMA_FILE}` }); continue; }
    let block = schemaText.slice(extent.start, extent.end);
    if (release) { block = markRelease(block, release); }

    const siblings = schemaSiblings(schemaText, target);
    const index = siblings.indexOf(target);
    let offset: number | null = null;
    for (let i = index - 1; i >= 0; i -= 1) {
      if (!project.entries.has(siblings[i])) { continue; }
      const anchor = pairExtent(projectText, siblings[i].split('.'));
      if (anchor) { offset = anchor.end; break; }
    }
    if (offset === null) {
      const parent = target.split('.').slice(0, -1).join('.');
      if (parent === '') { offset = projectText.length; }
      else {
        const parentLoc = locateLeaf(projectText, parent.split('.'));
        if (!parentLoc) { skipped.push({ path: target, reason: `parent block \`${parent}\` is absent from the project too` }); continue; }
        // The START OF THE LINE holding the parent's first child, not the
        // child's own offset: a block's value node begins at the first token
        // AFTER the indent, and splicing a whole line there lands it
        // mid-indent and breaks the file.
        offset = projectText.lastIndexOf('\n', parentLoc.value[0] - 1) + 1;
      }
    }

    // A top-level block is separated from its neighbour by a blank line in
    // every hand-formatted section of this file. Insert one when the anchor
    // does not already end in one, or the sections stop reading as sections.
    if (!target.includes('.') && offset > 1 && !projectText.slice(0, offset).endsWith('\n\n')) {
      block = `\n${block}`;
    }

    // Several keys anchored to the same spot keep the schema's order, and one
    // splice carries them all: two edits at the same offset would overlap.
    const bucket = anchors.get(offset) ?? [];
    bucket.push(offset === projectText.length && !projectText.endsWith('\n') ? `\n${block}` : block);
    anchors.set(offset, bucket);
    inserted.push(target);
  }

  for (const [offset, blocks] of anchors) {
    const isAppend = offset === projectText.length;
    edits.push({ range: [offset, offset], text: isAppend ? `\n${blocks.join('')}` : blocks.join('') });
  }

  return { edits, inserted, skipped, error: null };
}

/**
 * Stamp the release that brought a key, above its first line.
 *
 * The version comes from UPSTREAM'S `package.json` — the copy being applied —
 * because the marker answers "which release brought this key", which is an
 * upstream fact. The project's own version and the lock cursor are different
 * numbers that answer different questions.
 *
 * The marker is a courtesy for whoever reads the diff. It is NOT the
 * machine-checkable state, because the moment someone fills the value without
 * deleting the comment it lies. The durable signal is the TODO-plus-null pair,
 * which `bun run agents:schema --project` reads.
 */
function markRelease(block: string, release: string): string {
  const firstContent = block.split('\n').find(l => l.trim() !== '') ?? '';
  const indent = /^(\s*)/.exec(firstContent)?.[1] ?? '';
  return `${indent}# NEW in ${release} — added by \`bun run up\`, unset. See .agents/README.md.\n${block}`;
}

/**
 * Apply an insertion plan and PROVE the result before it reaches disk.
 *
 * Insert-only is the promise the four existing hooks made and kept, and it is
 * the reason this feature is allowed to write at all: a CI-mode updater that
 * silently rewrites a project's identity file is a trust failure that ends the
 * feature. So the verification is not "does it still parse" but "did any
 * EXISTING path change". Nothing may be lost, and nothing may be re-valued.
 */
export function applyInsertions(projectText: string, plan: InsertionPlan): { text: string, error: string | null } {
  if (plan.error) { return { text: projectText, error: plan.error }; }
  if (plan.edits.length === 0) { return { text: projectText, error: null }; }

  let next: string;
  try { next = applySplices(projectText, plan.edits); }
  catch (err) { return { text: projectText, error: err instanceof Error ? err.message : String(err) }; }

  const before = yamlLeafWalk(projectText);
  const after = yamlLeafWalk(next);
  if (!before || !after) { return { text: projectText, error: 'the insertion produced YAML that does not parse' }; }

  // Containers are checked for EXISTENCE only. A block's value is the object
  // holding its children, so adding a child necessarily changes it — that is
  // the insertion working, not the insertion misbehaving. Every LEAF must
  // still be byte-identical in meaning, which is the promise that matters.
  const containers = new Set(before.containers);
  for (const [path, value] of before.entries) {
    if (!after.entries.has(path)) { return { text: projectText, error: `the insertion lost the existing key \`${path}\`` }; }
    if (containers.has(path)) { continue; }
    const now = after.entries.get(path);
    if (JSON.stringify(value ?? null) !== JSON.stringify(now ?? null)) {
      return { text: projectText, error: `the insertion changed the existing value at \`${path}\`` };
    }
  }
  return { text: next, error: null };
}

/** One sentence naming what a project is missing, for the parity row. */
export function describeProjectDelta(delta: ProjectDelta): string | null {
  if (delta.error) { return `schema diff skipped: ${delta.error}`; }
  if (delta.gaps.length === 0) { return null; }
  const total = delta.gaps.reduce((n, g) => n + g.paths.length, 0);
  const blocks = delta.gaps
    .map(g => (g.wholeBlock ? `${g.block} (whole block, ${g.paths.length})` : `${g.block} (${g.paths.length})`))
    .join(', ');
  return `upstream has ${total} key path${total === 1 ? '' : 's'} this project lacks, in ${delta.gaps.length} block${delta.gaps.length === 1 ? '' : 's'}: ${blocks}`;
}
