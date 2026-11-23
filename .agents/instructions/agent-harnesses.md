---
id: harnesses
title: 'Host harnesses: one source, every harness'
load_when: 'harness files (CLAUDE.md, .claude/, .codex/, .opencode/, .pi/, MCP configs), which harnesses a project uses (harnesses:), hooks, husky, the updater (bun sync), cli/, root configs, the project schema'
triggers: ['\bharness', 'CLAUDE\.md', '\bopencode\b', '\bcodex\b', '\.pi/', '\bpi\s+(?:adapter|extensions?|mcp|workers?|trust)\b', '\b(?:works?|runs?|running)\s+(?:\w+\s+)?(?:in|on)\s+pi\b', '\.mcp\.json', '\bMCPs?\b.*\bconfigur', '\bconfigur\w*\b.*\bMCPs?\b', '\bhooks?\b', '\bhusky\b', '\bbun (?:run )?(?:sync|up)\b', '\bupdater\b', '\bparity\b', '\bagents:(compat|schema)', 'project\.schema\.yaml', '\beslint\.config', '\btsconfig', 'AGENTS\.md', '\b(?:instructions?|router)\b.*\b(?:sections?|triggers?|rows?)\b']
paths: ['CLAUDE.md', '.claude/', '.codex/', '.opencode/', '.pi/', '.mcp.json', 'opencode.jsonc', '.husky/', 'cli/', '.agents/hooks/', 'eslint.config.base.js', '.oxlintrc.json', '.oxlintrc.base.json', 'kata-eslint-plugin.js', 'tsconfig.base.json', 'config/variables.core.ts', '.agents/project.schema.yaml', '.agents/instructions/']
---

# Host harnesses

## 4.5. HOST HARNESSES: ONE SOURCE, EVERY HARNESS

This repo runs on Claude Code, OpenCode, Codex (CLI and Desktop) and Pi. There is one copy of every instruction and every skill. Where the harnesses really differ (MCP file format, hook API) each keeps a thin versioned adapter, and nothing else is duplicated. Read this section before touching harness files, hooks, husky, the updater, `cli/` or a root config.

### Instructions and surfaces

`AGENTS.md` plus the section files it routes to under `.agents/instructions/` are the only instruction body. OpenCode, Codex and Pi load `AGENTS.md` natively. Claude Code loads `CLAUDE.md`, which is exactly `@AGENTS.md` plus one newline: a documented import rather than a symlink, so it survives a Windows checkout. Operational prose written into `CLAUDE.md` is structural drift and `agents:compat:check` fails on it. (enforced: `bun run agents:compat:check`)

| Surface | Claude Code | OpenCode | Codex CLI + Desktop | Pi |
|---|---|---|---|---|
| Instructions | `CLAUDE.md` → `@AGENTS.md` **[generated shim]** | `AGENTS.md` (native) | `AGENTS.md` (native) | `AGENTS.md` (native) |
| Skills | `.claude/skills` **[generated alias]** | `.agents/skills/` (native) | `.agents/skills/` (native) | `.agents/skills/` (native) |
| Commands | none: `/<skill> <mode>` (the skill slash, through `.claude/skills`) | none: name the skill and mode in prose | none: name the skill and mode in prose | none: `/skill:<name> <mode>` |
| Hook | `.claude/settings.json` → `UserPromptSubmit` + `SessionStart` (`compact`, `clear`) + `PostToolUse` (route pending, doc contracts) | `.opencode/plugins/personality-reinject.js` | `.codex/hooks.json` → `UserPromptSubmit` + `SessionStart` (`compact`, `clear`) + `PostToolUse` (doc contracts) | `.pi/extensions/agentic-qa.js` |
| MCP | `.mcp.json` | `opencode.jsonc` | `.codex/config.toml` | `.pi/mcp.json` |

### The `harnesses:` list decides what is checked (ADR-0012)

A project that runs on one or two harnesses deletes the files of the others. Every compatibility gate (`agents:compat:check`, `setup:doctor`, the installer, `bun sync`) then checks only the harnesses in use, as answered once by `declaredHarnesses(root)` in `cli/lib/harness-selection.ts`.

- The top-level `harnesses:` list in `.agents/project.yaml` wins. Absent or `null` means detect from the files present (`HARNESS_FILES`): a harness is in use while any of its files exists, so deleting one file of a harness in use is still drift and fails.
- The boilerplate itself (`isSchemaOwner`) always checks every harness. Pi's files are `.pi/mcp.json` and the adapter only, so runtime state under `.pi/` never puts it in use (ADR-0026).
- MCP parity compares only the configs in use, against Claude's `.mcp.json` while Claude is in use and otherwise against the first declared harness's file. The hook adapter, the route re-arm and the Codex 32 KB cap bind their own harness only. The `CLAUDE.md` shim and the `.claude/skills` alias are required only with Claude. Each harness left out prints one `NOTE:` line, never an error.
- `bun setup` writes the agents it configures into `harnesses:` as a union and never removes one (dropping a harness is an edit to the yaml), then offers to delete the files of each harness left out, default keep. `bun sync` neither delivers, watches nor reports a harness not in use (`HARNESS_SYNC_PATHS`).
- Tests that read the OpenCode plugin or the Codex files skip when the checkout lacks them, and the plugin is imported dynamically, so `types:check` never needs a dropped harness.

### Generated files versus versioned files

The `[generated]` cells above are output. Edit the source (`AGENTS.md`, `.agents/skills/`, `.agents/hooks/`) and regenerate. Hand edits to `CLAUDE.md`, `.claude/skills` (gitignored, never committed) or the values of `.agents/project.schema.yaml` (its comments are the one hand-edited part) are overwritten and flagged. (enforced: `bun run agents:compat:check`)

| Generated artifact | Its source | Regenerate |
|---|---|---|
| `CLAUDE.md` (one-line `@AGENTS.md` shim, never prose) | `AGENTS.md` | `bun run agents:compat` |
| `.claude/skills` (POSIX symlink / Windows junction) | `.agents/skills/` | `bun run agents:compat` |
| `.husky/framework-gates.sh` (the gates upstream owns; each hook sources it in one guarded block) | upstream, synced by `bun sync` | never hand-edit it downstream; your own gates and their ordering go in the hooks |
| `.agents/project.schema.yaml` (the documented TEMPLATE a project's own yaml is compared against; comments hand-written, values synced from the yaml in the boilerplate only; SYNCED downstream) | `.agents/project.yaml` (values) | `bun run agents:schema` |

### `.agents/project.yaml` is compared against a schema

The file is `bootstrapOnly`: the sync never overwrites it because it holds project identity, yet upstream keeps adding blocks, so an older project never learns it lacks one. One schema-driven hook back-fills every key, so a new block needs no hook of its own.

The yaml holds values only and the schema carries every comment (ADR-0025): the yaml is imported into every Claude Code session start, the schema into none. A new key goes in both files, the schema with its comment and the yaml with the value only. `bun run agents:schema` syncs the schema's values down from this repo's yaml, which is filled for dogfooding, so the command:

- blanks every identity leaf back to `null` (`IDENTITY_PATHS` in `cli/lib/agents-schema.ts`: project, stacks, tracker, environments, cached QA epic keys), keeps the methodology defaults, and replaces this repo's own git-strategy values (its standing push authorization, its dates) with the safe ones in `GENERIC_RULES`;
- refuses to emit the file when a real date, ruleset, Atlassian host or one of this repo's own URLs or issue keys survives, in a value or a comment.

Every seed and insertion into a project's yaml strips the comments (`stripYamlComments`, twinned in the scaffolder). The yaml's first line is a `MAINTAINER COPY:` sentinel, its only comment. A repo made with GitHub "Use this template" inherits the filled file; `bun run agents:setup` detects the sentinel and reseeds from the schema after one confirm, and `setup:doctor` warns on it. `bun run agents:schema:check` gates the pair in `repo:check` and pre-commit: the schema must be a fixpoint (regenerating changes nothing), so a key on one side only, or a value out of sync, fails the commit by name. `agents:schema` runs only in the boilerplate: downstream the schema is a plainly synced file, and regenerating it would write the project's own values over the template.

Three consumers read the difference, at three severities. `bun sync` offers to insert what a project lacks: insert-only, one prompt per top-level block, and with `--auto` only a whole missing block, with the schema's values and none of its comments (it lists the leaves missing from a block the project has). `bun run setup:doctor` and `bun run agents:schema --project` only diagnose. `repo:check` never fails on it: being behind upstream is not a broken repo, and a red CI on every upstream key addition is how a team learns `--no-verify`.

Keys are compared to full depth with `environments.*` wildcarded, so a project running `uat` and no `qa` is not nagged. Values are never written back: a methodology value the project changed is only listed (`<path>: yours <x>, upstream default <y>`) by `bun sync` and `setup:doctor`, with identity, `GENERIC_RULES` leaves and the blocks of `CHANGED_DEFAULTS_EXEMPT` excluded. Project-only keys are silent, and an unparseable yaml says so. A project that deliberately deleted a block silences it with `updater.schema_exempt: [<block>]` in its own yaml.

Every write is a parser-located string splice, re-parsed to verify. Do not call `parseDocument(...).toString()` on a file under `.agents/`: it rewraps folded scalars and rewrites `[main]` as `[ main ]`, and on `jira-required.yaml` it grows the file by kilobytes while changing nothing (ADR-0006). `.agents/jira-required.yaml` keeps its two hand-written back-fill hooks and the 2-level walk, because its shape is richer. (Rule #8)

### The compatibility check

`bun run agents:compat:check` validates the whole contract for the harnesses in use: shim bytes, alias target, no harness command named like a skill, hook adapters, MCP parity, and the eslint block wiring. It runs in `repo:check`, in `pre-push`, and conditionally in `pre-commit`. Both it and `setup:doctor` print the alias status line and group errors per surface (`COMPATIBILITY_GROUP_ORDER` in `cli/lib/agent-compatibility.ts`).

### A skill is invoked by name plus mode

The boilerplate ships no `.claude/commands/` or `.opencode/commands/`: a skill plus a mode is the one invocation form on every harness (§5). A project may keep its own command files there; they are plain harness commands it edits by hand, and nothing generates or validates their body. The one refusal is a command whose name equals a repo skill. Claude Code registers both under one slash name and the command body wins, hiding the skill. `agents:compat:check` fails on it, and `bun run agents:compat` (also run by `bun sync` and `bun setup`) moves it to `.backups/shadowing-commands/<same path>`, recoverable and never deleted. The old overlay `.agents/compatibility/command-aliases.project.json` is inert: nothing reads it, and the updater names it once in an informational row.

### Instruction sections sync; `agent-project.md` stays the project's

The `instructions` component syncs `.agents/instructions/` like the skills, except `agent-project.md`. That file is delivered once from `agent-project.md.template` (the generic stub, behind a leak gate in `bun run instructions:check`) and never from the boilerplate's own overlay. `AGENTS.md` stays on the watchlist, and a pre-split monolith gets one parity row mapping its old headings to their sections. The ownership table is in `.agents/instructions/README.md`.

### Updater end of run

`bun sync` closes with one per-surface status table and one parity prompt, saved to `.agents/prompts/parity-plan.md`. When handed that prompt, present the table and wait for a per-row decision (`keep project`, `take upstream` or `merge`), apply only the chosen rows, then run tests, types, lint. Suggest `take upstream` only where the project lacks the content entirely: a row naming project-only servers, keys, headings or edits says `merge`, because `take upstream` there deletes project content. Row semantics, the protected watchlist, abort cases, the `.claude/settings.json` merge, `CONFIG_BLOCK_READERS` / `PATH_PREREQUISITES` and the `AGENTS.md` doctrine ledger are in `agentic-qa-core/references/updater-parity.md`.

When nobody is present to choose (a worker or a routine), the launcher's brief holds the gate. Without a brief that covers the rows, apply none, leave `.agents/prompts/parity-plan.md` for the person and report that it is waiting. `agentic-qa-core/references/decision-protocol.md` says which decisions may reach a person.

### `cli/` is import-closed (binding invariant)

Nothing under `cli/` may import from a sibling top-level directory (`scripts/`, `config/`, `tests/`, `api/`, `packages/`), directly or through an `@alias`. `cli/` is the updater's self-update component: `runUpdate` refreshes those files in place and re-execs the process before any other component is synced, so the new `cli/` runs against the target repo's own, old copy of everything else. An escaping import therefore bricks `bun sync` for anyone jumping more than one release. The failure is at module load, so it also takes down `bun sync --rollback`, `setup` and `setup:doctor`.

Shared code goes in `cli/lib/`, and a `scripts/` file that needs it imports from `cli/`. That direction is safe because `scripts/` is synced later and never re-exec'd mid-run. The `no-restricted-imports` block scoped to `cli/**`, defined as `CLI_IMPORT_CLOSURE` in `eslint.config.base.js` and spread by `eslint.config.js`, enforces it, so `lint:check` catches a violation in CI, pre-push and `repo:check`. (enforced: `bun run lint:check`)

### Hook: one emitter, one adapter per harness

`.agents/hooks/personality-reinject.mjs` is the per-prompt emitter. Claude and Codex run it as a command hook (stdout becomes developer context on both). OpenCode imports it from a thin plugin and Pi from one extension that hands the lines over as a hidden message. The output contract is not re-injected: §2 and the user-level output style already load once per session. It injects:

- one `AGENT IDENTITY:` line per prompt (worktree, session label, harness), the value `git-flow-master` copies into the `Worktree:` and `Session:` commit trailers of Rule #3;
- one extra line naming `/agent-orchestration`, only when the orchestration binary is present on the machine. No binary means no line, which is the silence rule of the optional executor (§3);
- the instruction routing: it classifies each prompt against the ROUTER of `AGENTS.md` and the frontmatter of `.agents/instructions/*.md`, and adds one `ROUTE: read <file>` line per file the session has not been routed to yet, at most a few per prompt with the rest on one `ROUTE-OPTIONAL:` line. The LOAD PROTOCOL makes those lines binding.

On Claude Code a `PostToolUse` hook runs the same emitter and re-surfaces an unread route once (`ROUTE-PENDING:`); Pi's `tool_result` does the same. `SessionStart` hooks with matchers `compact` and `clear` (Claude, Codex), `experimental.session.compacting` (OpenCode 1), the session `compaction` hook (OpenCode 2) and `session_compact` (Pi) re-arm the per-session state. The OpenCode plugin classifies the prompt in `chat.message` on OpenCode 1 and in the session `prompt` hook on OpenCode 2. One OpenCode service serves every project from whatever directory it started in, so the plugin takes the checkout from its context (`ctx.location.project.directory` on 2, `ctx.worktree` on 1), never from the server's working directory. The identity names a linked worktree after its own directory and anything else `primary`, decided by the checkout and never by an inherited `ORCA_WORKTREE_ID`. The classifier rules are in `.agents/instructions/README.md`.

There is one emitter, with no second personality hook file and no per-harness copy of the text. `cli/lib/agent-compatibility-contracts.ts` enforces it: no absolute personal paths, no duplicated hook file, and OpenCode mutates `output.system` in place. Codex's adapter carries `commandWindows` for PowerShell and resolves the repo via `git rev-parse --show-toplevel`.

### Hook: edit-time documentation contracts (ADR-0016)

A second, separate hook, `.agents/hooks/doc-contracts.mjs`, runs as a `PostToolUse` command hook on file edits in Claude Code (matcher `Edit|Write|MultiEdit`) and Codex (matcher `Edit|Write`, which Codex matches on its `apply_patch` edits although the hook input names the tool `apply_patch`). When an edit lands inside a `LINT.IfChange(<label>)` region it adds one `DOCS:` line naming the pages its `LINT.ThenChange(...)` lists, once per session per label. OpenCode and Pi register no adapter (OpenCode's model context from `tool.execute.after` is unverified) and rely on the gate. It is silent outside the boilerplate's own checkout. `agents:compat:check` holds both registrations there (`validateDocContractHooks`).

### Husky: one synced gates file, project-owned hooks

`.husky/pre-commit` and `.husky/pre-push` are on the protected watchlist, so the project's own gates and their ordering survive every sync. The gates upstream owns live in `.husky/framework-gates.sh`, which is synced, and each hook sources it and calls one function (`framework_gates_pre_commit` or `framework_gates_pre_push`). That is the only way a new upstream gate reaches an older project, since a never-overwritten hook cannot grow one (ADR-0006).

- `lint-staged` stays in the hook, above the call: it rewrites staged files and must finish before anything reads the staged list. It also stages what its tasks modify in every tracked file they touch, so a file with unstaged changes gets those changes committed too. In a checkout other sessions share, commit those edits first or keep them in a separate worktree.
- The source is `[ -f ]`-guarded because `.husky/_/h` runs hooks under `sh -e`, and a rollback or half-applied sync can leave the gates file gone.
- A hook that predates the split gets a parity row with the exact block to paste.
- `.husky/commit-msg` follows the same split (watched, delivered once when missing, `framework_gates_commit_msg "$1"`). It runs the forensic-trailer check of Rule #3 (`scripts/check-commit-trailers.ts`, one copy shared byte-identical with the dev boilerplate) in warn-only mode: a commit missing `Worktree:` or `Session:`, or carrying `Claude-Session:`, prints a warning and still lands.
- Documentation contracts follow the same tiers. `framework_gates_pre_commit` warns when a staged change touches a marked region without its pages. `framework_gates_pre_push` blocks (`scripts/lint-doc-contracts.ts --push`, escape `Docs-Checked: <label> <reason>` in a commit of the push) and runs `docs:check` on every push. `build.yml` runs both on every PR.

### Root configs and the variables module ship in halves

`tsconfig.base.json` and `eslint.config.base.js` are synced and hold the path aliases, the `cli/` import-closure rule (`CLI_IMPORT_CLOSURE`) and the KATA alias-import rule that forbids `./` and `../` under `tests/**` (`KATA_IMPORT_ALIASES`), and the KATA enforcement blocks (`KATA_RULES`, `KATA_SHAPE`, `KATA_PLAYWRIGHT`, severity from `KATA_ENFORCEMENT_LEVEL`) that `validateEslintBlockWiring` requires the project `eslint.config.js` to spread. `tsconfig.json` and `eslint.config.js` stay project-owned and extend or spread them. The Oxlint half follows the same split (ADR-0028): `.oxlintrc.base.json` and `kata-eslint-plugin.js` (the `kata` plugin, loaded by both linters) are synced, `.oxlintrc.json` is project-owned (delivered once when missing by the `oxlint-config` component, then never overwritten) and `extends` the base, and `validateOxlintWiring` fails `agents:compat:check` when it does not. `bun sync` installs nothing and keeps the project's `lint-staged`, so it leaves two parity rows: run `bun install` (dependencies added this run) and switch `lint-staged` to `oxlint -c .oxlintrc.json`. `config/variables.core.ts` has the same shape: synced resolver and framework blocks, with the project-owned environment and URL map in `config/variables.ts`. In a consumer repo, edit the project half and leave every `*.base.*` and `*.core.ts` file alone.

The asymmetry makes a synced rule fail quietly. The base is synced, but `eslint.config.js` is project-owned and never overwritten, so a block upstream adds arrives on disk while the wiring that activates it does not. `validateEslintBlockWiring` (`cli/lib/agent-compatibility-contracts.ts`) fails `agents:compat:check` when `eslint.config.js` does not name every scoped block `eslint.config.base.js` exports. Without it, a shipped rule enforces nothing and `lint:check` stays green.

### Two linters: Oxlint at commit, ESLint as the gate (ADR-0028)

`lint-staged` runs `oxlint -c .oxlintrc.json` on staged code, about 0.2 s against about 5 s for ESLint on the same files, with the KATA plugin, the Playwright rules, the import blocks and `max-params`/`max-lines` active. ESLint stays the gate in `lint:check`, `repo:check`, `pre-push` and CI, because it alone runs the type-aware `ts/*` rules and the antfu style set. Pre-commit no longer autofixes style: `lint:fix` does, and `pre-push` catches the rest. ESLint runs every stock rule: `eslint-plugin-oxlint` was tried and dropped, because it switches off 93 core rules (`no-control-regex`, `no-empty-pattern`) on the assumption that Oxlint runs them, and our `.oxlintrc.json` keeps the `correctness` category off, so nothing would. Oxlint reads `./**` and `../**` where ESLint reads `./*` and `../*`: the shorter form misses `../data/X` there. `lint:cached` and `lint:fix` use `--cache`; `lint:check` does not, because a cached run keeps a stale verdict on type-aware rules when an imported file changes. (enforced: `bun run agents:compat:check`, `bun test scripts/oxlint-config.test.ts`)

### MCP: one declared set, one file per host, semantic parity

The canonical server set is whatever `.mcp.json` declares (the first declared harness's file when Claude is not in use). Every server there must exist in the other configs in use (`opencode.jsonc`, `.codex/config.toml`, `.pi/mcp.json`) with the same `.env` dependencies and the same literal env settings. A server present in one host only fails, naming the server and the host.

A project scopes parity in `checks.mcp_parity` of `.agents/project.yaml` (documented in `.agents/project.schema.yaml`): `mode: local-only` for a per-machine `.mcp.json` that a committed `.gitignore` ignores, `relay` for a Pi that reaches every stdio server through one tracked project launcher, and `unrelayed` for the servers that launcher cannot carry, http, disabled or taking a value from the host (warned by name, never silent). Absent, parity runs strict as described here.

Parity normalizes each native format (JSON, JSONC, TOML; Pi's own `exposure`, `toolExposure` and `description` keys are ignored) into a common shape (transport, command, args, url, `.env` dependencies, literal env, enabled) and compares. The servers the boilerplate ships (`KNOWN_MCP_IDS` in `cli/lib/agent-compatibility-contracts.ts`, every one a local stdio server) also get a strict per-host shape check whenever the project declares them. Any other server gets the generic check only, so a downstream project may drop or add servers freely. Parity compares the real values but never prints one: a message shows each literal value as `<redacted>` (or the `${VAR}` it references) and names the keys whose values differ, and a parser error loses its quoted fragments (`cli/lib/ui/redaction.ts`).

Remote servers whose only project-side content was an API key (web search, Postman) are not committed. They run at harness level (a claude.ai connector, a user-scope MCP, the OpenCode, Codex or Pi user config), skills resolve them by capability, and `cli/lib/harness-level-mcps.ts` is the one list of them (ADR-0005). A downstream project that keeps one sees a parity row, never an overwrite. The same holds for a local server upstream retired (`RETIRED_MCPS` in `cli/lib/updater-parity.ts`: the browser MCP, retired because browser automation is `/playwright-cli` only).

`.env` values reach a server through one loader on every host (ADR-0011). Every stdio server that needs them starts as `bun x -p varlock@<pin> varlock run --no-redact-stdout --inject vars --filter A,B -- <server>` (`MCP_ENV_LOADER_COMMAND`, `MCP_ENV_LOADER_HEAD` and `mcpEnvLoaderArgs()` in `cli/lib/agent-compatibility-contracts.ts`; `bun x` rather than `bunx` because Windows loses the `bunx` invocation name when varlock spawns it, which makes it run as plain `bun` instead). The loader reads the varlock schema plus `.env` and `.env.local` (or the secret manager the schema names) from the project root at spawn time, however the harness was launched, so no plaintext copy of a credential is written anywhere.

- `--filter` hands the server only its own names: an inherited schema key outside the list is stripped and validation is scoped to the list.
- `--inject vars` skips the `__VARLOCK_ENV` blob.
- `--no-redact-stdout` keeps the JSON-RPC stream intact.
- The `--filter` list is the server's `.env` dependency set that parity compares across hosts, so nothing beside the loader takes names from the host (no `${VAR}`, `{env:}`, `{file:}` or `env_vars`).
- A server that needs no value (context7) has no loader.

A stdio server that needs `.env` values and skips the loader on any host, or also takes names from the host, fails `agents:compat:check` in the boilerplate. Downstream it is a warning naming the exact launch, because the MCP configs are bootstrap-only or protected and a sync can never deliver the fix. `bun run harness:env` no longer generates anything: it retires the plaintext copies its older version wrote (the `.claude/settings.local.json` env block and `.auth/opencode/`). Critical Rule #10 applies to all of them. Per-MCP decision rules are in §5.

### Harness-specific gotchas

- Codex trust has two gates. Project `.codex/` config and hooks load only in a trusted project (`[projects."<path>"] trust_level = "trusted"` in the user's Codex config), and each project hook must be trusted too: interactive `codex` stops on "Hooks need review" for a new or changed hook (review, trust all, or continue without them), and `codex exec` skips an untrusted hook silently, so no `AGENT IDENTITY:`, `ROUTE:` or `DOCS:` line reaches the model. `--dangerously-bypass-hook-trust` runs them for one invocation, for vetted automation only. `bun run setup:doctor` reads both gates from Codex's own `config.toml` (read only; `codexTrustStatus` in `cli/doctor.ts`) and warns. A hook edited after it was trusted still reads as trusted there, because Codex compares a hash the doctor does not compute.
- Codex in a linked worktree loads the primary checkout's `.codex/` and takes the primary's trust: a `.codex/hooks.json` edit in the worktree has no effect until it reaches the primary checkout. The hook commands still resolve `git rev-parse --show-toplevel` in the worktree, so they run the worktree's own emitter.
- Codex Desktop consumes the same repository config as the CLI, with no second convention and no extra directory.
- The OpenCode hook API (`experimental.chat.system.transform` on OpenCode 1, the session `prompt`, `context` and `compaction` hooks on OpenCode 2) is official but experimental, so re-verify on OpenCode upgrades. Claude and Codex sit on stable hook APIs.
- Open a harness bare (`claude`, `opencode`, `codex`, `pi`, or the desktop app), and never inside a loader (`varlock run -- <harness>`, or a `package.json` script that does it). A loader exports every `.env` value into the AI's own process (Rule #1, ADR-0014). Every MCP server loads `.env` through its own loader. `scripts/launch.ts` serves the `test*` scripts only, refuses a harness binary, and warns (names and lengths only, then goes on) when an inherited variable differs from `.env.local` over `.env`. A variable the human exported in their own shell still wins over `.env` for whatever starts there, MCP servers included, and `bun run vars:env:check` names it (§7).
- Pi trust: project trust gates `.agents/skills`, `.pi/mcp.json` and `.pi/extensions`, while `AGENTS.md` loads regardless. Untrusted, a session has no skills, no MCP and no adapter, and print and RPC modes skip them under the default `ask`. `bun run setup:doctor` reports it apart from file correctness, from `trust.json` and `defaultProjectTrust`. A machine that runs workers trusts the parent folder, because a launch passes no flags (`agentic-qa-core/references/fleet-provisioning.md` §4).
- Pi has no deny config and no approvals: bypass is its only state, so `permission_modes.conductor: auto` cannot be honoured there. The adapter's `tool_call` block stands in for Rule #1's deny entries, and it is a seatbelt: shell variants (`cat .env`) pass, `pi-subagents` background children are untested, and an untrusted session has no adapter and so no block (ADR-0026). Pi does not ship subagents, a question tool or plan mode; `orchestration-doctrine.md` and `decision-elicitation-doctrine.md` §7 name the fallbacks. The adapter registers no `question` tool, because a second registration stops Pi from starting.
- Pi MCP exposure: every server in `.pi/mcp.json` is `exposure: "deferred"`, found through `tool_search`. Pi's default `codemode` declares no tool to the model, which breaks resolving a capability by suffix. A tool name replaces every other character with `_` (§6). `.pi/` is a `.gitignore` allowlist, so package state never reaches a commit.
- Pi on Windows is unverified.

Pi facts measured on 1.4.0 and 1.5.0, 2026-11-04. The OpenCode 2 hooks were measured on OpenCode 2.3.2, and the Codex trust gates, the `apply_patch` matcher and the worktree config source on Codex 0.171, both 2026-11-23. <!-- volatile-ok: harness facts carry the version they were measured on -->
