# ADR-0009 — Progressive disclosure of the project instructions: an always-on L0, routed sections, a hook that names what to read

- **Status:** Accepted (by the owner, 2026-10-04)
- **Date:** 2026-10-04
- **Deciders:** framework owner (boilerplate maintainer): owner decisions OD1-OD7 on the context-tiers spike (2026-10-04, every recommended option, with binding notes on OD6 and OD7); conductor rulings of the implementation fleet on the design shared with agentic-dev (section ids, frontmatter, the Git Strategy split, the two-level budget, the generic `project.md` stub, the import-row trigger widening). Implemented by Q-U1 (#98, section split + `instructions:check`), Q-U3 (#99, the updater's `instructions` component) and Q-U2 (#100, hook router)
- **Tags:** instructions, multi-harness, hooks, cross-cutting-invariant
- **Supersedes:** —
- **Superseded by:** —

---

## Context

`AGENTS.md` was the one instruction body every host loaded whole at session start (Claude Code through the `CLAUDE.md` import, OpenCode and Codex natively). It had grown into a single file holding the critical rules, the behavioural layer, orchestration, the task-to-skill loading map, the multi-harness contract, the skill registry table, tool resolution, project variables, testing behaviour, the PBI cache doctrine, the KATA quick-reference, git policy and memory triggers. Every QA session, from a sprint-testing run to a one-line question, read all of it. Three facts made that shape untenable:

1. **Every session paid for all of it.** A question about a selector loaded the git policy, the PBI cache tiers and the harness contract. Most sections are needed in a minority of sessions.
2. **Codex was cutting it.** Codex concatenates project `AGENTS.md` files into ONE budget, `project_doc_max_bytes`, default 32 768 bytes, truncates at the byte that crosses it, and only logs a warning (measured by the agentic-dev twin of this decision in the Codex source: `codex-rs/config/src/config_toml.rs`, `DEFAULT_PROJECT_DOC_MAX_BYTES`; `codex-rs/core/src/agents_md.rs`, `data.truncate`). The old file crossed it inside §4, the context loading map, so on Codex the harness contract, the skill table, tool resolution, variables, the PBI doctrine, KATA, git and memory triggers never reached the model.
3. **An `@` import saves nothing.** Claude Code expands an imported file in full at launch (Claude Code memory docs: imported files load at launch; import parsing skips Markdown code spans and fenced code blocks); OpenCode and Codex do not expand imports at all. The only lazy mechanisms the three hosts share are the model reading a file because an instruction told it to, skills (description first, body on use), and a per-prompt hook that injects text.

## Decision

We will split the project instructions into layers and engineer recall with the existing prompt hook ("routed progressive disclosure", option C on A).

1. **L0, `AGENTS.md`, always on.** It keeps only what must bind on every turn: the header and the LOAD PROTOCOL, the binding sentence of each Critical Rule, §2 (the behavioural layer) verbatim and whole, the core of §3 (orchestration), the fixed ROUTER, and §12 (memory triggers). `CLAUDE.md` stays exactly `@AGENTS.md` plus a newline.
2. **L1, one file per section under `.agents/instructions/`, on demand.** Each section carries frontmatter (`id`, `title`, `load_when`, `triggers`, `paths`); `project.md` is the project-owned overlay and `README.md` documents the folder. Every sentence of the old file landed in L0 or a section; the headings keep their old numbers, so a `§N` citation resolves through the ROUTER's `Was` column.
3. **L2 is what already existed**: each skill's `references/`, named by the section or skill that needs them. No new tier.
4. **The ROUTER is a fixed table in L0** between `<!-- router:start -->` and `<!-- router:end -->` (`When the request involves | Read | Was | Then`). Rows are request kinds, not features, so the table does not grow with the project; sections and their `triggers:` do.
5. **The prompt hook routes.** `.agents/hooks/personality-reinject.mjs` reads the ROUTER and each section's frontmatter at runtime, classifies the prompt, and emits one `ROUTE: read <file>` line per file this session has not been routed to yet. A row fires on its anchor, the first file of its `Read` cell. A per-session state file dedupes; a `SessionStart` with matcher `compact` (Claude Code, Codex) or `experimental.session.compacting` (OpenCode 1) re-arms it. The LOAD PROTOCOL makes a `ROUTE:` line binding.
6. **Critical Rules keep their force.** Each L0 rule line is the rule's binding sentence verbatim, ending `→ 01`, the pointer to its full text in `.agents/instructions/01-critical-rules.md` under the same number and name; the ROUTER has a row for "about to break, unsure about, or asked about a Critical Rule".
7. **Two data files are Claude imports.** The ROUTER rows for project variables and for scripts write `@.agents/project.yaml` and `@package.json` as plain text, so Claude Code loads them at launch, and carry a reinforced instruction ("whenever any of these apply, read ...") that OpenCode and Codex follow.
8. **`bun run instructions:check` is the gate** (inside `repo:check` and `skills:check`): byte budget, ROUTER integrity, every section routed, frontmatter shape, triggers that compile, rule sentences verbatim, a binding carrier for every `NEVER` / `MUST` line in a section (`Rule #N`, `binding: /<skill>`, `enforced: bun run <script>`, or the sentence itself in L0), and a leak gate on the generic `project.md.template`.

**Invariant.** Section prose is edited in its section file and never pasted back into `AGENTS.md`; a rule only this project has goes in `.agents/instructions/project.md` or a project context skill. A Critical Rule changes in two places on purpose: its full text in `01-critical-rules.md` and its binding sentence in `AGENTS.md`, which stays verbatim.

### Owner decisions (2026-10-04)

| ID | Decision | Owner note |
|---|---|---|
| OD1 | C on A: L0 + sections + routing hook (not trim-only) | |
| OD2 | Name: "progressive disclosure" (Anthropic's term for the skill mechanism this extends) | |
| OD3 | Folder `.agents/instructions/` (not `.agents/context/`, not inside a skill's references) | |
| OD4 | Section files are synced from upstream; `project.md` is the project-owned overlay | |
| OD5 | An adopted app's own instruction block moves to an `<app>-context` skill with a ROUTER row | |
| OD6 | Data files load on demand through a ROUTER row | Reinforce the instruction AND write `@package.json` / `@.agents/project.yaml` in it, so Claude auto-loads them while the other hosts follow the instruction |
| OD7 | Two budgets: boilerplate L0 and L0 with project additions | L0 keeps each rule's binding sentence; a section explains the rule in full, loaded when the AI is breaking or about to break it |

### Conductor rulings recorded with this ADR

| Point | Ruling |
|---|---|
| Budget levels | Target 16 KiB (`L0_TARGET`, warning), ceiling 24 KiB (`L0_BUDGET`, error, the boilerplate's own L0), 28 KiB with project additions (`L0_PROJECT_BUDGET`, error), Codex 32 KiB (`CODEX_PROJECT_DOC_MAX_BYTES`, always an error), all in `scripts/lint-instructions.ts`. Supersedes the spike's 16 / 24 KiB pair and Q-U1's interim 18 KiB line: with §2 whole the 16 KiB target is unreachable, and the owner forbids cutting §2 |
| `## Git Strategy` | Generic doctrine to `80-git.md`; this repository's accepted divergence and standing push authorization to `project.md` `## Git Strategy (this repository)`, so no downstream project inherits them |
| The generic stub | Ships as `.agents/instructions/project.md.template` (a non-`.md` extension, so no section reader sees it). The updater writes it to `project.md` once when a project has none; the scaffolder seeds it the same way. A leak gate refuses a stub that carries this repo's identity or its own git exception |
| Router anchor | A row fires when the prompt matches its FIRST `Read` target; every target of a fired row is routed. Firing on any target dragged rows in through shared files |
| Classifier inputs | Prompt text and the paths it names only. Branch name and staged paths were dropped from the spike's list |
| Import-row triggers | `IMPORT_ROW_TRIGGERS` (the scripts row, which has no frontmatter) is generic and identical in both boilerplates; the run / corré patterns accept one optional qualifier word and the Spanish noun `regresión` |

## Measurements (2026-10-04, `main` after #100)

Bytes measured with `wc -c`; tokens are bytes / 4, an approximation (no tokenizer was run).

| What | Before (`0f1755b7`, pre-split) | After |
|---|---:|---:|
| `AGENTS.md` (always on, every host) | 107 867 B (~27.0k tok) | 18 242 B (~4.6k tok) |
| Codex sees the whole always-on file | no (cut at 32 768 B, inside §4) | yes |
| Claude Code session start: L0 + `@package.json` (6 723 B) + `@.agents/project.yaml` (20 190 B) | 107 867 B | 45 155 B (~11.3k tok) |

The two imports add 26 913 B (~6.7k tokens) on Claude Code only, more than L0 itself; `project.yaml` is most of it. They do not count against the L0 budget, which measures the file itself. A fresh Claude Code session in the split worktree reported seeing a string that exists only in `.agents/project.yaml` and one that exists only in `package.json`, and not the router markers: Claude Code strips block-level HTML comments before injection, so the hook reads the ROUTER from disk. L0 sits over the 16 KiB target on purpose (`instructions:check` warns, never fails): §2 alone is about 8.7k characters and stays whole.

Classifier eval (`cli/lib/fixtures/instruction-router-eval.json`, labelled prompts in QA vocabulary, Spanish and English, labels written before tuning; asserted by `cli/lib/instruction-router.test.ts` against the fixture's `targets`):

| Metric (prompt x target, micro) | Before tuning (55 prompts) | After trigger tuning (55) | After the import-row widening (58) | Target |
|---|---:|---:|---:|---:|
| Recall | 89.1% (90/101) | 97.0% (98/101) | 100% (107/107) | >= 95% |
| Precision | 84.1% (90/107) | 88.3% (98/111) | 89.2% (107/120) | >= 80% |

Routing cost: in-process median 0.41 ms per prompt (p95 0.78 ms); the whole hook process 68.0 ms median against 59.2 ms on `main` before routing, the difference dominated by Node start.

Not yet measured: model compliance with `ROUTE:`, the share of routed prompts after which the model reads the routed file before its first action. It needs real transcripts after merge: for each `ROUTE: read <file>` in a session's hook output, look for a read of `<file>` before the first tool call that acts on the request.

## Consequences

- **Positive:** every host loads a fraction of the old always-on text, and Codex now sees all of it. Recall no longer depends on the model remembering to consult a table: on Claude Code, Codex and OpenCode 1 a deterministic classifier names the file. Doctrine outside L0 ships as upstream-owned files instead of hand-merged parity rows (OD4), and the ROUTER rows stay fixed by design.
- **Negative / trade-offs:** recall is still soft on OpenCode 2, which exposes no per-message hook with the prompt text: it relies on the ROUTER and the LOAD PROTOCOL alone (declared degradation). A routed read costs a tool call the old file did not. The two imports make Claude Code's session start heavier than the other hosts'. A Critical Rule now lives in two places that must agree, which the lint enforces.
- **Neutral / follow-ups:** `bun run up` syncs the sections as the `instructions` component and never touches `project.md`; a project that scaffolded before the split keeps its monolith `AGENTS.md` and gets one parity row mapping its old headings to the sections. Moving an adopted app's instruction block into an `<app>-context` skill (OD5) is its own change. Triggers are tuned in section frontmatter, never in L0, and every miss is added to the labelled set. Skills that still append project facts to `AGENTS.md` (discovery, adaptation, context pointers) predate this split and should retarget `project.md`.

## Alternatives considered

- **Trim-only (one file, detail moved into skill references)** — keeps full determinism for what stays, but the file still exceeds Codex's cap unless cut hard, and every session keeps paying for the conditional sections.
- **L0 + L1 + a new L2 tier of sub-files per section** — rejected: every section already has an L2 in the skill references it cites, and a second hop is one more read the model can skip, for little saving.
- **Sections as `kind: context` skills (the harness skill listing as router)** — rejected: routing becomes model-judged from descriptions, the listing budget drops the least-used descriptions first, and Codex already shortens the skill list at its cap.
- **`@` imports for the sections** — rejected: eager on Claude Code (no saving), ignored by OpenCode and Codex.
- **Listing the sections in OpenCode's `instructions`** — rejected: loads them all eagerly, recreating the old cost on OpenCode only.
- **Path-scoped `.claude/rules/`** — rejected as a base: Claude-only, triggered by reading a path rather than by intent, and summarised away on compaction.

## References

- `AGENTS.md` (L0: LOAD PROTOCOL, ROUTER, rule sentences) and `.agents/instructions/README.md` (layers, routing, frontmatter, ownership, editing)
- `.agents/instructions/10-harnesses.md` (INSTRUCTIONS and HOOK paragraphs)
- `scripts/lint-instructions.ts`, `scripts/lib/instructions.ts` (the gate and the shared parsers)
- `.agents/instructions/project.md.template` and the updater's `instructions` component (delivery downstream)
- `.agents/hooks/personality-reinject.mjs` (`routeLines`, `IMPORT_ROW_TRIGGERS`), `.claude/settings.json` and `.codex/hooks.json` (`SessionStart` matcher `compact`), `.opencode/plugins/personality-reinject.js`
- `cli/lib/fixtures/instruction-router-eval.json`, `cli/lib/instruction-router.test.ts`, `scripts/lib/hook-router-parity.test.ts`
- Human explanation: `packages/decks/progressive-disclosure/how-it-works.es.html`
- Twin decision in agentic-dev: its ADR-0009 (same design, dev vocabulary)

## Amendments

Appended, never rewritten: the decision above stays as accepted, and each line records what changed after it.

- 2026-10-04 (Q-U5, #102): a `SessionStart` with matcher `clear` re-arms the routes too, on Claude Code and Codex (both hosts emit source `clear` after `/clear`, which drops the routed files from the context like a compaction does). Decision 5 and the hook entry under References name only `compact`; both hosts now register `compact` and `clear`, and `cli/lib/agent-compatibility-contracts.ts` (`REARM_SESSION_START_SOURCES`) fails a host that registers one without the other.
- 2026-10-04 (Q-U6): a skill the project authored is routed from the `## Project context skills` table of the project-owned `.agents/instructions/project.md` (its trigger phrases in that file's `triggers:`), never from the synced `20-skills-and-mcps.md`, which `bun run up` overwrites. The hook needed no change: it already reads `project.md`'s frontmatter like any routed section. `instructions:check` fails a row whose skill does not exist and warns on a project-local skill left in the synced section; `docs:check` counts the table's rows in its roster.
- 2026-10-04 (owner decision, ctx-q-rename): the section files lose their numeric prefix and every file in `.agents/instructions/` but `README.md` carries `agent-`, so its name says it comes from the agent setup: `01-critical-rules.md` -> `agent-critical-rules.md`, `80-git.md` -> `agent-git.md` (and the rest alike), `project.md` -> `agent-project.md`, `project.md.template` -> `agent-project.md.template`. The names above in this record are the old ones. Frontmatter `id`s did not change (`id` = the file stem without `agent-`, which `instructions:check` now enforces with the prefix), so `ROUTE:` lines keep their tags; reading order is the ROUTER's row order. The L0 rule pointer `→ 01` became `Full: agent-critical-rules.md#<n>` (the same form as the dev boilerplate). `bun run up` retires the numbered copies through `deprecatedFiles` with a `.backups/` copy first, and moves a project's `project.md` to `agent-project.md` byte for byte (`moveLegacyProjectInstructions`), never regenerating it from the stub. Router eval unchanged: 58 prompts, recall 100.0% (107/107), precision 89.2% (107/120).
