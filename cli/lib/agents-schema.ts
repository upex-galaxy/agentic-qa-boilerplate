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
 * WHICH FILE CARRIES WHAT (ADR-0025). `.agents/project.yaml` is imported into
 * every Claude Code session start (`@.agents/project.yaml` in the ROUTER), so it
 * carries VALUES ONLY. `.agents/project.schema.yaml` is the documented template:
 * its header and every explanatory comment are authored there, by hand. What
 * flows between the two is values, downward: `generateSchema` splices the
 * maintainer's methodology values into the schema's commented skeleton, blanks
 * identity, substitutes the git-strategy safety values, and leaves every comment
 * where it is. A project's yaml is seeded and back-filled from the schema with
 * the comments stripped (`stripYamlComments`).
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

/** The project's real, filled identity file, values only. Never overwritten by the sync. */
export const SCHEMA_SOURCE = '.agents/project.yaml';

/**
 * The documented, committed template the diff compares a project against: its
 * comments are authored here, its values synced from `SCHEMA_SOURCE`.
 */
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
// THE MAINTAINER COPY — the one route the schema does not cover
// ============================================================================

/**
 * The line that marks `.agents/project.yaml` as the BOILERPLATE's own filled
 * copy, in the file's leading comment block.
 *
 * Every route but one delivers a project the blank template: the scaffolder
 * seeds from `.agents/project.schema.yaml`, and the updater never walks
 * `.agents/project.yaml`. GitHub "Use this template" copies the tree as it is,
 * `package.json` name included, so neither `isSchemaOwner` nor anything else
 * inside the copy can tell it from the original. Without this line such a
 * repo carries the maintainers' project identity AND their chosen standing
 * push authorization, and `git-flow-master` never offers Strategy Setup.
 *
 * It is the first line of the maintainer copy and the only comment that file
 * keeps. The schema has its own hand-authored header, and every seed writes
 * `CONSUMER_YAML_HEADER`, so neither the template nor a consumer's yaml ever
 * carries it. The leak gate refuses a schema that does.
 */
export const MAINTAINER_SENTINEL = '# MAINTAINER COPY:';

/** Whether the yaml's leading comment block carries `MAINTAINER_SENTINEL`. */
export function isMaintainerCopy(yamlText: string): boolean {
  for (const line of yamlText.split('\n')) {
    if (line.startsWith(MAINTAINER_SENTINEL)) { return true; }
    if (!line.startsWith('#') && line.trim() !== '') { return false; }
  }
  return false;
}

/**
 * Whether a git `origin` URL points at the boilerplate itself (any owner, so a
 * contributor's fork counts) rather than at a repo made from it.
 */
export function originIsUpstream(originUrl: string | null): boolean {
  if (!originUrl) { return false; }
  const name = originUrl.trim().replace(/\/+$/, '').replace(/\.git$/, '').split(/[/:]/).pop();
  return name === UPSTREAM_PACKAGE;
}

/**
 * What kind of `.agents/project.yaml` this checkout holds.
 *
 *  - `consumer`         a project's own file; nothing to do.
 *  - `maintainer`       the boilerplate's filled copy, in the boilerplate (or a fork).
 *  - `copied-template`  the boilerplate's filled copy in someone else's repo:
 *                       reseed it from the schema before anything reads it.
 *
 * No `origin` at all is read as `copied-template`: the boilerplate itself and
 * every fork of it has one, and the cost of the wrong call is one declined
 * prompt, while the cost of the other wrong call is a project pushing to
 * `main` under someone else's authorization.
 */
export type YamlOrigin = 'consumer' | 'maintainer' | 'copied-template';

export function classifyProjectYaml(yamlText: string, originUrl: string | null): YamlOrigin {
  if (!isMaintainerCopy(yamlText)) { return 'consumer'; }
  return originIsUpstream(originUrl) ? 'maintainer' : 'copied-template';
}

/**
 * The header a CONSUMER's `.agents/project.yaml` opens with. Twin of the one
 * in `packages/create-agentic-qa/src/prepare.ts`, which is a separately
 * published package and cannot import from here: keep the two identical.
 */
export const CONSUMER_YAML_HEADER = `# Project configuration read by AI agents. VALUES ONLY: every key is documented in
# .agents/project.schema.yaml, the template this file was seeded from. Edit by hand or
# run \`bun run agents:setup\`. \`bun run agents:schema --project\` lists keys added upstream.
`;

/**
 * A consumer's `.agents/project.yaml`, seeded from the schema: the schema's
 * banner swapped for `CONSUMER_YAML_HEADER`, every comment stripped, every value
 * verbatim. Same transform as `seedProjectYamlFromSchema` in the scaffolder.
 * `null` when the text is not the shape the schema has (a leading comment
 * banner, then content), or when stripping would change a value.
 */
export function seedFromSchema(schemaText: string): string | null {
  const lines = schemaText.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].startsWith('#')) { i += 1; }
  while (i < lines.length && lines[i].trim() === '') { i += 1; }
  if (i === 0 || i >= lines.length) { return null; }
  const body = lines.slice(i).join('\n');
  const lean = stripYamlComments(body);
  if (!sameValues(body, lean)) { return null; }
  return `${CONSUMER_YAML_HEADER}\n${lean}`;
}

// ============================================================================
// THE COMMENT STRIPPER — schema text in, values-only text out
// ============================================================================
// LINT.IfChange(strip-yaml-comments)

/**
 * The index where a YAML comment starts on `line`, or -1. A `#` opens a comment
 * only at the start of the line or after whitespace, and never inside a quoted
 * scalar; a quote opens a scalar only where a token can start, so the
 * apostrophe in `it's` is not one.
 */
function commentStart(line: string): number {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote !== null) {
      if (quote === '"' && ch === '\\') { i += 1; continue; }
      if (ch === quote) {
        // `''` inside a single-quoted scalar is an escaped quote, not the end.
        if (quote === '\'' && line[i + 1] === '\'') { i += 1; continue; }
        quote = null;
      }
      continue;
    }
    const prev = i === 0 ? ' ' : line[i - 1];
    if ((ch === '"' || ch === '\'') && /[\s[{,:]/.test(prev)) { quote = ch; continue; }
    if (ch === '#' && /\s/.test(prev)) { return i; }
  }
  return -1;
}

/**
 * YAML text with every comment removed and its values untouched: whole-line
 * comments dropped, trailing comments cut with the whitespace before them,
 * block scalars (`>` / `|`) passed through verbatim, blank lines kept only as
 * one separator before each top-level key. Line-based and dependency-free on
 * purpose: the scaffolder package has no `yaml` dependency and carries a twin
 * (`stripYamlComments` in `packages/create-agentic-qa/src/prepare.ts`, kept
 * identical by a test). Callers here verify the result with `sameValues`.
 */
export function stripYamlComments(text: string): string {
  const out: string[] = [];
  let scalarIndent = -1;
  let pendingBlanks = 0;
  for (const line of text.split('\n')) {
    const indent = line.length - line.trimStart().length;
    if (scalarIndent >= 0) {
      if (line.trim() === '') { pendingBlanks += 1; continue; }
      if (indent > scalarIndent) {
        for (; pendingBlanks > 0; pendingBlanks -= 1) { out.push(''); }
        out.push(line);
        continue;
      }
      scalarIndent = -1;
    }
    pendingBlanks = 0;
    const cut = commentStart(line);
    const kept = (cut === -1 ? line : line.slice(0, cut)).trimEnd();
    if (kept.trim() === '') { continue; }
    if (indent === 0 && /^[\w"']/.test(kept) && out.length > 0) { out.push(''); }
    out.push(kept);
    if (/:\s*[|>][-+\d]*$/.test(kept) || /^\s*-\s+[|>][-+\d]*$/.test(kept)) { scalarIndent = indent; }
  }
  return `${out.join('\n')}${text.endsWith('\n') ? '\n' : ''}`;
}
// LINT.ThenChange(packages/create-agentic-qa/src/prepare.ts)

/**
 * Whether two YAML texts hold the same data. The stripper's proof: removing a
 * comment may never change a value, so every caller compares before it writes.
 */
export function sameValues(a: string, b: string): boolean {
  const parse = (text: string): string | null => {
    try {
      const doc = parseDocument(text);
      return doc.errors.length > 0 ? null : JSON.stringify(doc.toJS());
    }
    catch { return null; }
  };
  const left = parse(a);
  return left !== null && left === parse(b);
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
 *  - `blank`   the value becomes `null`.
 *  - `keep`    the value travels untouched.
 *  - `generic` upstream supplies a replacement, because this repo's own
 *              answer is meaningless or misleading downstream.
 *
 * Two tables and a DEFAULT decide it. `GENERIC_RULES` first, then
 * `IDENTITY_PATHS` (this repo's own project, always `blank`), then the
 * default: a leaf already `null` is a field the consumer fills (`blank`, a
 * no-op), and a non-null leaf is methodology that the consumer should inherit
 * (`keep`). The split is the one `prepare.ts` already makes by hand: identity
 * blanks, methodology keeps.
 */
export type RuleKind = 'blank' | 'keep' | 'generic';

export interface GenericRule {
  /** Raw YAML text for the value, spliced in place of the current one. */
  value: string
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
    why: 'this repo grants itself standing push authorization; a fresh project has authorized nothing',
  },
  'git_strategy.policy.admin_bypass': {
    value: 'false',
    why: 'a fact about this repo\'s admin credential, and a dangerous default for a project that has none',
  },
  'git_strategy.policy.require_pr_reviews': {
    value: '1',
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
    why: 'the shipped comment records the maintainer\'s own 2026-08-21 confirmation',
  },
};

/**
 * Blocks that are each project's own CONFIGURATION, not methodology, so a
 * value that differs from upstream's is not reported by `changedDefaults`.
 * Owner decision 4 (ADR-0025) warns on METHODOLOGY leaves; these hold the
 * project's push policy, its protected files, its secret manager, its
 * harnesses, its sprint board and its cached QA epics, and a warning on every
 * `bun sync` about them would be noise that teaches people to ignore the rest.
 *
 * A pattern matches the path it names and everything below it (`board.*`
 * covers `board.statuses.tickets.in_test`), segment by segment.
 */
export const CHANGED_DEFAULTS_EXEMPT: readonly string[] = [
  'updater.*',
  'secrets.*',
  'git_strategy.*',
  'harnesses',
  'board.*',
  'testing.browser.*',
  'qa.qa_epics.*',
];

/** Whether a leaf sits under a `CHANGED_DEFAULTS_EXEMPT` pattern. */
export function isChangedDefaultExempt(path: string): boolean {
  const segments = path.split('.');
  return CHANGED_DEFAULTS_EXEMPT.some((pattern) => {
    const depth = pattern.split('.').length;
    return segments.length >= depth && matchesPattern(segments.slice(0, depth).join('.'), pattern);
  });
}

/**
 * The leaves that are THIS repo's identity, blanked whatever value they hold.
 * A segment of `*` matches any one key name.
 *
 * The null/non-null default only works while the boilerplate's own yaml stays
 * empty, and it does not: the maintainers dogfood the boilerplate, so this
 * file carries a real project name, Jira host, environment URLs and cached
 * QA epic keys. Under the default alone a filled Atlassian host tripped the
 * leak gate and refused to generate, and a filled project name or URL passed
 * the gate and shipped silently to every consumer. So identity is DECLARED
 * here, by block, and blanked back to the template's `null`.
 *
 * Declared by block rather than by leaf on purpose: a key added later under
 * `project:` or `environments.<env>:` is identity from the day it lands,
 * without anyone remembering to list it. A key added to a MIXED block
 * (`testing`, `qa`) is not covered, which is what `distinctiveValues` and the
 * leak gate are for.
 */
export const IDENTITY_PATHS: readonly string[] = [
  'project.*',
  'backend.*',
  'frontend.*',
  'database.*',
  'issue_tracker.*',
  'testing.default_env',
  'testing.tms_cli',
  'qa.qa_epics.*.key',
  'environments.*.*',
  // Which harnesses THIS repo runs on: the boilerplate checks every harness, a
  // project declares its own or leaves it null to detect (ADR-0012).
  'harnesses',
  // The sprint modules' block (ADR-0019) is MIXED: its source choice, tickets
  // file, test status map and evidence hosts are methodology and travel; the
  // query, the status buckets (this repo's workflow slugs), people and brand
  // are this project's own.
  'board.jql',
  'board.bug_jql',
  'board.ticket_key_pattern',
  'board.timezone',
  'board.statuses.tickets.*',
  'board.statuses.bugs.*',
  'board.people',
  'board.brand.*',
];

/** Whether a dotted path matches one `IDENTITY_PATHS` pattern, segment by segment. */
function matchesPattern(path: string, pattern: string): boolean {
  const have = path.split('.');
  const want = pattern.split('.');
  return have.length === want.length && want.every((seg, i) => seg === WILDCARD || seg === have[i]);
}

/** Whether a leaf is identity the schema must never carry. */
export function isIdentityPath(path: string): boolean {
  return IDENTITY_PATHS.some(pattern => matchesPattern(path, pattern));
}

/** The rule for one leaf: the tables first, then the null/non-null default. */
export function ruleFor(path: string, value: unknown): RuleKind {
  if (path in GENERIC_RULES) { return 'generic'; }
  if (isIdentityPath(path)) { return 'blank'; }
  return value === null ? 'blank' : 'keep';
}

/**
 * The values in the source that could only ever be THIS repo's: an absolute
 * URL that is not loopback, a bare hostname, an issue key, a relative path out
 * of the repo. None of them can appear in the template legitimately (the
 * template's examples are `myproject.com`, `company.atlassian.net`,
 * `PROJ-100`, `../my-backend`, which are written into comments, not values).
 *
 * This is the net under `IDENTITY_PATHS`: a filled key added to a mixed block
 * and never declared survives blanking, and its value is then found here.
 * Deliberately narrow: a project NAME or KEY is not distinctive enough to scan
 * for (`UPEX` is one of the template's own examples), which is why those are
 * blanked by declaration instead.
 */
export function distinctiveValues(sourceText: string): string[] {
  const walk = yamlLeafWalk(sourceText);
  if (!walk) { return []; }
  const found = new Set<string>();
  for (const value of walk.entries.values()) {
    if (typeof value !== 'string') { continue; }
    const v = value.trim();
    const url = /^https?:\/\/(?!localhost\b|127\.0\.0\.1\b)\S+$/.test(v);
    const host = /^[a-z\d-]+(?:\.[a-z\d-]+)+$/i.test(v) && /[a-z]/i.test(v.split('.').pop() ?? '');
    const issueKey = /^[A-Z][A-Z\d]+-\d+$/.test(v);
    const outOfRepo = /^\.\.\//.test(v);
    if (url || host || issueKey || outOfRepo) { found.add(v); }
  }
  return [...found];
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
  'testing.browser.pair_mode': 'asked once, the first time an agentic browser session starts (agentic-qa-core/references/browser-sessions.md, Agentic Pair Testing)',
  'secrets.onepassword.vault': 'the secret-manager choice of `bun setup` (cli/lib/secret-providers.ts; null while secrets.provider is local)',
  'secrets.onepassword.account': 'the secret-manager choice of `bun setup` (optional: null = the 1Password CLI default account)',
  'harnesses': 'the agent selection of `bun setup` (`recordHarnessSelection` in cli/install.ts; null = detect from the files present, ADR-0012)',
  ...Object.fromEntries([
    'board.jql',
    'board.bug_jql',
    'board.ticket_key_pattern',
    'board.timezone',
    'board.statuses.tickets.not_ready',
    'board.statuses.tickets.in_test',
    'board.statuses.tickets.tested',
    'board.statuses.tickets.blocked',
    'board.statuses.tickets.dropped',
    'board.statuses.bugs.open',
    'board.statuses.bugs.fixed',
    'board.statuses.bugs.resolved',
    'board.statuses.bugs.discarded',
    'board.people',
    'board.brand.name',
    'board.brand.logo',
  ].map(path => [path, 'by hand when the project adopts the sprint board; `bun run board:check` names each key still missing (ADR-0019)'])),
};

// ============================================================================
// IDENTITY LEAK GATE
// ============================================================================

/**
 * Patterns that must never appear in the schema, in a value or in a comment.
 * This is the gate that catches the NEXT leak, the one no rule anticipated: a
 * maintainer pastes a real date or a real host into a schema comment, the
 * values sync happily, and the number ships to every consumer.
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
  { name: 'the maintainer-copy sentinel (it belongs in the source header only)', re: /MAINTAINER COPY:/ },
];

export interface IdentityLeak {
  line: number
  pattern: string
  text: string
}

/**
 * Every line of the generated schema that still carries one of this repo's
 * distinctive values (`distinctiveValues`), in a value or in a comment.
 */
export function findValueLeaks(schemaText: string, values: readonly string[]): IdentityLeak[] {
  const leaks: IdentityLeak[] = [];
  const lines = schemaText.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    for (const value of values) {
      if (lines[i].includes(value)) { leaks.push({ line: i + 1, pattern: `a value this repo filled in (${value})`, text: lines[i].trim() }); }
    }
  }
  return leaks;
}

/**
 * The bare identity TOKENS this repo's yaml implies, for a schema COMMENT that
 * names the project without quoting a whole value: the project name (5+
 * characters, any case), the project key (exact case, whole word), and the
 * project's own host labels (6+ characters: `upexbunkai` out of
 * `staging-upexbunkai.vercel.app` and `upexbunkai.vercel.app`). A host's last
 * label is its TLD and, on a host of three labels or more, the one before it
 * is the provider's domain (`vercel`, `atlassian`), which the template's own
 * examples name; neither is a token. Loopback hosts are skipped.
 *
 * Deliberately not every identity leaf: an environment name (`staging`), a
 * CLI (`bun xray`) or a loopback URL is template vocabulary the schema's
 * examples use, and a gate that refused the clean template would be routed
 * around.
 */
export function identityTokens(sourceText: string): Array<{ token: string, re: RegExp }> {
  const walk = yamlLeafWalk(sourceText);
  if (!walk) { return []; }
  const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const word = (text: string, flags: string): RegExp => new RegExp(`(?<![\\w-])${escape(text)}(?![\\w-])`, flags);
  const tokens = new Map<string, RegExp>();
  const name = walk.entries.get('project.project_name');
  if (typeof name === 'string' && name.trim().length >= 5) { tokens.set(name.trim(), word(name.trim(), 'i')); }
  const key = walk.entries.get('project.project_key');
  if (typeof key === 'string' && key.trim() !== '') { tokens.set(key.trim(), word(key.trim(), '')); }
  for (const [path, value] of walk.entries) {
    if (typeof value !== 'string' || !isIdentityPath(path)) { continue; }
    const v = value.trim();
    let host: string | null = null;
    if (/^https?:\/\//.test(v)) {
      try { host = new URL(v).hostname; }
      catch { host = null; }
    }
    else if (/^[a-z\d-]+(?:\.[a-z\d-]+)+$/i.test(v)) { host = v; }
    if (host === null || host === 'localhost' || /^[\d.]+$/.test(host)) { continue; }
    const labels = host.split('.');
    const own = labels.length >= 3 ? labels.slice(0, -2) : labels.slice(0, -1);
    for (const label of own) {
      if (label.length >= 6) { tokens.set(label, word(label, 'i')); }
    }
  }
  return [...tokens].map(([token, re]) => ({ token, re }));
}

/** Every line of the schema that names one of `identityTokens`, in a value or a comment. */
export function findTokenLeaks(schemaText: string, tokens: ReadonlyArray<{ token: string, re: RegExp }>): IdentityLeak[] {
  const leaks: IdentityLeak[] = [];
  const lines = schemaText.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    for (const { token, re } of tokens) {
      if (re.test(lines[i])) { leaks.push({ line: i + 1, pattern: `an identity token of this repo (${token})`, text: lines[i].trim() }); }
    }
  }
  return leaks;
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
// GENERATION — values flow down into the documented skeleton
// ============================================================================

export interface GenerateResult {
  schema: string
  /** Placeholder paths: `null` in the schema, for the consumer to fill. */
  blanked: string[]
  /** Paths whose value comes from `GENERIC_RULES`, not from this repo. */
  generic: string[]
  /** Paths whose value this run spliced into the schema (empty = already in sync). */
  changed: string[]
  /** Key paths `project.yaml` has and the schema does not document. */
  undocumented: string[]
  /** Key paths the schema documents and `project.yaml` lacks. */
  unseeded: string[]
  /** Set when generation refused: a parse failure, a key mismatch, a bad splice, or a leak. */
  error: string | null
  leaks: IdentityLeak[]
}

/** The YAML text of a path's segments, for `locateLeaf`. */
function segments(path: string): string[] {
  return path.split('.');
}

/** The parsed value of a raw YAML value text, as `GENERIC_RULES` writes it. */
function parseRuleValue(raw: string): unknown {
  return (parseDocument(`v: ${raw}\n`).toJS() as { v: unknown }).v;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Sync the schema's VALUES from the real `.agents/project.yaml`, leaving every
 * comment, the header and the formatting of untouched values exactly as the
 * schema has them (ADR-0025).
 *
 * The schema is the documented skeleton: keys and comments are authored there.
 * The values still come DOWN from the maintainer's yaml, because the
 * methodology defaults have one home: hand-maintaining them in the schema too
 * would recreate the drift one level up, with nothing to sync the two. So each
 * schema leaf gets `null` (identity, or a null in the source), the
 * `GENERIC_RULES` safety value, or the source's own value; a leaf is spliced
 * only when its parsed value differs, which is what keeps a clean run a no-op.
 *
 * Key parity is LITERAL in both directions, `environments` included: the
 * schema's environments mirror the maintainer's, and a wildcard would hide a
 * dropped one. A key on one side only refuses generation with the path, since
 * an undocumented key is exactly what this split exists to prevent.
 */
export function generateSchema(sourceText: string, schemaText: string): GenerateResult {
  const fail = (error: string, extra: Partial<GenerateResult> = {}): GenerateResult => ({
    schema: '',
    blanked: [],
    generic: [],
    changed: [],
    undocumented: [],
    unseeded: [],
    leaks: [],
    ...extra,
    error,
  });

  const source = yamlLeafWalk(sourceText);
  if (!source) { return fail(`${SCHEMA_SOURCE} does not parse as a YAML mapping`); }
  const skeleton = yamlLeafWalk(schemaText);
  if (!skeleton) { return fail(`${SCHEMA_FILE} does not parse as a YAML mapping`); }

  const undocumented = [...source.entries.keys()].filter(k => !skeleton.entries.has(k));
  const unseeded = [...skeleton.entries.keys()].filter(k => !source.entries.has(k));
  if (undocumented.length > 0 || unseeded.length > 0) {
    const parts = [
      undocumented.length > 0 ? `${undocumented.length} key path(s) in ${SCHEMA_SOURCE} that ${SCHEMA_FILE} does not document (${undocumented.slice(0, 5).join(', ')})` : '',
      unseeded.length > 0 ? `${unseeded.length} key path(s) in ${SCHEMA_FILE} that ${SCHEMA_SOURCE} lacks (${unseeded.slice(0, 5).join(', ')})` : '',
    ].filter(Boolean);
    return fail(parts.join('; '), { undocumented, unseeded });
  }

  const edits: SpliceEdit[] = [];
  const blanked: string[] = [];
  const generic: string[] = [];
  const changed: string[] = [];
  const containers = new Set(skeleton.containers);

  for (const [path, have] of skeleton.entries) {
    if (containers.has(path)) { continue; }
    const value = source.entries.get(path);
    const kind = ruleFor(path, value);
    if (kind === 'generic') { generic.push(path); }
    const want = kind === 'blank' ? null : kind === 'generic' ? parseRuleValue(GENERIC_RULES[path].value) : value;
    if (want === null) { blanked.push(path); }
    if (sameJson(have, want)) { continue; }

    const located = locateLeaf(schemaText, segments(path));
    if (!located) { return fail(`cannot locate ${path} in ${SCHEMA_FILE}`); }
    let text: string;
    if (kind === 'keep') {
      // The source's own spelling, from just past its colon: a block
      // collection keeps its line break and indent, a scalar its leading space.
      const from = locateLeaf(sourceText, segments(path));
      if (!from) { return fail(`cannot locate ${path} in ${SCHEMA_SOURCE}`); }
      text = sourceText.slice(from.afterKey, from.value[1]);
    }
    else {
      text = ` ${kind === 'blank' ? 'null' : GENERIC_RULES[path].value}`;
    }
    // From just past the key's colon, so a value that used to be a block
    // collection comes back onto the key's line instead of leaving a lonely
    // `[]` beneath it. The comment on the KEY's line is the schema's
    // documentation and must survive the splice in every shape:
    //  - schema block (`key: # doc` + items below): the range starts at the
    //    colon and would swallow `# doc`, so it is put back;
    //  - schema inline (`key: [] # doc`) becoming a block: the comment would
    //    land after the block's last item, so it is moved onto the key's line;
    //  - inline to inline: the comment sits after the range and stays.
    const lineEnd = schemaText.indexOf('\n', located.afterKey);
    const valueOnLaterLine = lineEnd !== -1 && located.value[0] > lineEnd;
    let range: TextRange = [located.afterKey, located.value[1]];
    let keyComment: string | null = null;
    if (valueOnLaterLine) {
      const tail = schemaText.slice(located.afterKey, lineEnd);
      const hash = commentStart(tail);
      if (hash !== -1) { keyComment = tail.slice(hash).trimEnd(); }
    }
    else if (text.startsWith('\n') && located.trailingComment) {
      keyComment = schemaText.slice(...located.trailingComment).trimEnd();
      range = [located.afterKey, located.trailingComment[1]];
    }
    if (keyComment !== null) {
      text = text.startsWith('\n') ? ` ${keyComment}${text}` : `${text} ${keyComment}`;
    }
    edits.push({ range, text });
    changed.push(path);
  }

  let schema: string;
  try { schema = applySplices(schemaText, edits); }
  catch (err) { return fail(err instanceof Error ? err.message : String(err)); }

  // Re-parse to verify: invariant 1's second half. A splice that produced text
  // which no longer parses, lost a key, or did not land the value it meant to
  // is a corrupted template and must never reach disk.
  const after = yamlLeafWalk(schema);
  if (!after) { return fail('the generated schema does not parse — splice produced invalid YAML'); }
  const lost = [...skeleton.entries.keys()].filter(k => !after.entries.has(k));
  if (lost.length > 0) { return fail(`the generated schema lost ${lost.length} key path(s): ${lost.slice(0, 5).join(', ')}`); }
  for (const path of changed) {
    const kind = ruleFor(path, source.entries.get(path));
    const want = kind === 'blank' ? null : kind === 'generic' ? parseRuleValue(GENERIC_RULES[path].value) : source.entries.get(path);
    if (!sameJson(after.entries.get(path), want)) { return fail(`the splice at ${path} did not produce the intended value`); }
  }

  const leaks = [
    ...findIdentityLeaks(schema),
    ...findValueLeaks(schema, distinctiveValues(sourceText)),
    ...findTokenLeaks(schema, identityTokens(sourceText)),
  ];
  if (leaks.length > 0) {
    const first = leaks[0];
    return fail(`${SCHEMA_FILE} would carry ${leaks.length} identity leak(s); first at line ${first.line}: ${first.pattern}`, { leaks });
  }

  return { schema, blanked, generic, changed, undocumented: [], unseeded: [], leaks: [], error: null };
}

// ============================================================================
// THE GATE — schema vs source
// ============================================================================

/**
 * The comparable shape of a schema: key paths plus whether each is a `null`
 * placeholder the consumer must fill.
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
  /** Key paths `project.yaml` has and the schema does not document. */
  undocumented: string[]
  /** Key paths the schema documents and `project.yaml` lacks. */
  unseeded: string[]
  /** Leaf paths whose committed value differs from what the source dictates. */
  stale: string[]
  error: string | null
}

/**
 * Whether the committed schema is a FIXPOINT of generation: regenerating it
 * from the source changes nothing. Comments are the schema's own, so a
 * rewording never fires; a key on one side only, or a value out of sync with
 * the source (a methodology default changed in one file, an identity value
 * typed into the template), does.
 */
export function checkSchema(sourceText: string, committedSchema: string): SchemaGateResult {
  const generated = generateSchema(sourceText, committedSchema);
  if (generated.error) {
    return { ok: false, undocumented: generated.undocumented, unseeded: generated.unseeded, stale: [], error: generated.error };
  }
  return { ok: generated.changed.length === 0, undocumented: [], unseeded: [], stale: generated.changed, error: null };
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
 * Values are never compared HERE (a changed methodology default is listed by
 * `changedDefaults`, never treated as a gap). Every value in a real project file is either its
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
// CHANGED DEFAULTS — a project's methodology values vs upstream's, warn only
// ============================================================================

export interface ChangedDefault {
  path: string
  yours: unknown
  upstream: unknown
}

/**
 * The methodology leaves where a project's value differs from upstream's
 * default, for `bun sync` and `setup:doctor` to LIST. Owner decision
 * (2026-11-02): a changed default is reported, never written back, because the
 * project may have chosen it on purpose, and the insert-only promise of
 * `applyInsertions` covers existing values too.
 *
 * Only `keep` leaves count, judged by upstream's value: identity (blanked in
 * the template), `GENERIC_RULES` leaves and the per-project configuration in
 * `CHANGED_DEFAULTS_EXEMPT` are the project's own answer by design, and a
 * `null` upstream value is a placeholder, not a default. A key
 * the project lacks is a gap (`projectDelta`), not a change, and a block in
 * `updater.schema_exempt` is silent here as well.
 */
export function changedDefaults(projectText: string, schemaText: string): { changed: ChangedDefault[], error: string | null } {
  const project = yamlLeafWalk(projectText);
  if (!project) { return { changed: [], error: `the project's ${SCHEMA_SOURCE} does not parse; nothing was compared` }; }
  const schema = yamlLeafWalk(schemaText);
  if (!schema) { return { changed: [], error: `${SCHEMA_FILE} does not parse; nothing was compared` }; }

  const exempt = new Set(schemaExemptions(projectText));
  const containers = new Set(schema.containers);
  const changed: ChangedDefault[] = [];
  for (const [path, upstream] of schema.entries) {
    if (containers.has(path) || !project.entries.has(path)) { continue; }
    if (exempt.has(schema.blockOf.get(path) ?? '')) { continue; }
    if (isChangedDefaultExempt(path)) { continue; }
    if (ruleFor(path, upstream) !== 'keep') { continue; }
    const yours = project.entries.get(path);
    if (!sameJson(yours, upstream)) { changed.push({ path, yours, upstream }); }
  }
  return { changed, error: null };
}

/** One value as a reader writes it in YAML: `null`, `auto`, `4`, `[a, b]`. */
function showValue(value: unknown): string {
  if (value === null || value === undefined) { return 'null'; }
  if (Array.isArray(value) && value.every(v => v === null || typeof v !== 'object')) { return `[${value.map(showValue).join(', ')}]`; }
  if (typeof value === 'object') { return JSON.stringify(value); }
  return String(value);
}

/** `<path>: yours <x>, upstream default <y>`, the line both reports print. */
export function describeChangedDefault(change: ChangedDefault): string {
  return `${change.path}: yours ${showValue(change.yours)}, upstream default ${showValue(change.upstream)}`;
}

// ============================================================================
// INSERTION — at the schema's position, never at EOF
// ============================================================================

/**
 * The full text of one pair: its leading comment block through the newline
 * after its trailing comment. This is the unit that gets lifted out of the
 * schema (and stripped of its comments before it reaches a project).
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
): InsertionPlan {
  const project = yamlLeafWalk(projectText);
  if (!project) { return { edits: [], inserted: [], skipped: [], error: `the project's ${SCHEMA_SOURCE} does not parse; nothing was planned` }; }
  if (!yamlLeafWalk(schemaText)) { return { edits: [], inserted: [], skipped: [], error: `${SCHEMA_FILE} does not parse; nothing was planned` }; }

  const edits: SpliceEdit[] = [];
  const inserted: string[] = [];
  const skipped: Array<{ path: string, reason: string }> = [];
  const anchors = new Map<number, string[]>();

  // The diff reports LEAVES. A leaf whose parent container is missing too
  // (`testing.browser.pair_mode` in a project that has `testing:` but no
  // `browser:`) has no parent to anchor to, so it is lifted to the highest
  // missing ancestor whose own parent the project HAS, and that ancestor's
  // whole block is inserted once. Without the lift, a new sub-block inside
  // an existing block could never be inserted at all.
  const lifted: string[] = [];
  for (const target of paths) {
    const parts = target.split('.');
    let top = target;
    for (let depth = parts.length - 1; depth >= 1; depth -= 1) {
      const ancestor = parts.slice(0, depth).join('.');
      if (project.entries.has(ancestor)) { break; }
      top = ancestor;
    }
    if (!lifted.includes(top)) { lifted.push(top); }
  }

  for (const target of lifted) {
    const extent = pairExtent(schemaText, target.split('.'));
    if (!extent) { skipped.push({ path: target, reason: `not found in ${SCHEMA_FILE}` }); continue; }
    // Values only (ADR-0025): the schema's comments document the key there,
    // and are never copied into the project's values-only file. Stripping may
    // never change what the block holds; a block it would change is skipped.
    const documented = schemaText.slice(extent.start, extent.end);
    let block = stripYamlComments(documented);
    if (!sameValues(documented, block)) { skipped.push({ path: target, reason: 'stripping its comments would change a value' }); continue; }

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
