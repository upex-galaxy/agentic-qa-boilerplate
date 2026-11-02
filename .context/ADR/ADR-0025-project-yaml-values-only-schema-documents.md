# ADR-0025 — `.agents/project.yaml` carries values only; `.agents/project.schema.yaml` is the documented template

- **Status:** Accepted (by the owner, in the `project-yaml-lean` fleet brief of 2026-11-02)
- **Date:** 2026-11-02
- **Deciders:** framework owner (boilerplate maintainer). The three decisions below were given in the brief (conductor Run `run_50f612db9324`) and are restated here; the technical design inside them is the worker's, recorded as decided.
- **Tags:** project-yaml, schema, context-budget, installer, updater, orchestration
- **Supersedes:** —
- **Superseded by:** —

---

## Context

The `AGENTS.md` ROUTER imports `@.agents/project.yaml` and `@package.json`, so Claude Code loads both into every session start (ADR-0009, OD6). ADR-0009 measured the yaml at 20 190 B. By 2026-11-02 it had grown to 29 329 B, and 16 735 B of it (205 of 400 lines) were whole-line comments; the comments after values took several kilobytes more.

The comments had to live in `project.yaml` because `bun run agents:schema` GENERATED `.agents/project.schema.yaml` from it: the schema was the yaml with identity blanked (`IDENTITY_PATHS`), methodology kept, and the git-strategy block replaced (`GENERIC_RULES`, values and comments). Every consumer project then received the schema's comments through the scaffolder seed, and every key `bun sync` inserted arrived with its comment block plus a `# NEW in <release>` marker.

So the explanation of each key was paid for in tokens at every session start of every project, maintainers included, while nothing at runtime reads a comment.

## Decision

1. **`.agents/project.yaml` is values only.** No comment blocks, no comments after values. The maintainer copy keeps exactly one comment: its first line, the `# MAINTAINER COPY:` sentinel that `isMaintainerCopy` (and its twins in `cli/preflight.ts` and `.agents/hooks/doc-contracts.mjs`) read to tell the boilerplate's own file from a "Use this template" copy. A consumer's yaml opens with a three-line header (`CONSUMER_YAML_HEADER`) that points at the schema.
2. **`.agents/project.schema.yaml` is the documented template.** Its header and every explanatory comment are written there, by hand. Its values stay real: identity is `null`, methodology defaults stay values (gate modes, models, permission tiers, status buckets), and the `GENERIC_RULES` safety values stay (`direct_push_to_protected: confirm`, `admin_bypass: false`, `strategy_source: inherited`). It is not an all-null file.
3. **Worker efforts.** `orchestration.default_effort: medium` (Sonnet workers); the Opus `model_overrides` entry stays at `effort: high`; the conductor tier is unchanged (`claude-opus-5-5`, `high`). Same values in both files.

### Technical design (decided by the worker, with the option each beat)

- **Values flow down, comments stay put.** `generateSchema(source, schema)` takes the committed schema as the skeleton and splices only VALUES into it: `keep` leaves get the maintainer's value, identity leaves get `null`, `GENERIC_RULES` leaves get the safe value. A leaf is spliced only when its parsed value differs, so a clean run is a byte-for-byte no-op. Key parity is enforced in both directions on the literal walk (`environments` included): a key in the yaml the schema does not document, or a key the schema documents and the yaml lacks, refuses with the path. `agents:schema:check` is the fixpoint: regenerating changes nothing. The re-parse and the identity leak gate still run over the whole schema, comments included. *Beat:* a hand-authored schema checked only for keys, identity blanks and safety values. Methodology values would then live in two files with nothing to sync them, the "drift one level up" the module's own header warned about.
- **One dependency-free comment stripper** (`stripYamlComments`): line based, a `#` opens a comment only at the start of a line or after whitespace and never inside a quoted scalar, block scalars pass through verbatim, one blank line before each top-level key. The scaffolder package has no `yaml` dependency, so it carries a twin, and a test keeps the two identical on the real files. Every use in `cli/lib/agents-schema.ts` is verified with `sameValues` (same parsed data) and refuses on a mismatch. *Beat:* the `yaml` lexer, exact but unavailable to the scaffolder, which would leave two strippers to drift.
- **Seeding and back-fill are comment-free.** `seedFromSchema` (installer, `agents:setup --reseed`) and `seedProjectYamlFromSchema` (scaffolder) write the header plus the stripped schema body. `planInsertions` strips the block it lifts from the schema, and the `# NEW in <release>` marker is gone (`markRelease`, `isUnsetValue` and the `release` parameter removed): it was a comment that lied once the value was filled, and the updater's report already names every inserted key. `withHarnesses` appends a missing `harnesses:` key as one value line.
- **`agents:setup` reads field help from the schema.** `fieldHelp` takes the description and example from the schema's comment for the key, then from the project's own comment (an older, commented yaml), then a generic env-leaf help for an environment the template does not ship. It writes no comment: a new environment is inserted as values, `--reset` only nulls.
- **`model_overrides` is a block sequence** in both files. The multi-line flow form failed `eslint` (`yaml/block-sequence`, `yaml/indent`), which had left `bun run repo:check` red on `main` since the commit that introduced it.

## Consequences

- `.agents/project.yaml` drops from 29 329 B to the size `wc -c` reports after this change (5 709 B in the commit that made it), about 5.9k tokens less at every Claude Code session start (bytes / 4, no tokenizer run). The schema keeps its size; no session loads it.
- A maintainer adds a key in two places: the schema, with its comment and default, then the yaml, value only. `agents:schema:check` names whichever side is missing.
- A consumer project scaffolded before this change keeps its commented yaml: nothing strips an existing project's file. New keys reach it without comments; the explanation is one file away, in the synced schema.
- A reader of a values-only file who wants the meaning of a key reads the schema; `agents:setup` shows the same text as prompt help.

## Verification

`bun test cli/lib/agents-schema.test.ts` (fixpoint against the real files, value sync, parity both ways, comment-leak refusal, values-only seed, comment-free insertion, stripper twin), `bun test cli/update-boilerplate.test.ts` (`--auto` back-fill inserts values only), the scaffolder's `tests/smoke.test.ts`, and `bun run repo:check`.
