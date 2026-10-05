# ADR-0017 — Routes the agent actually reads: a scoped, ranked and capped `ROUTE:` cue, re-surfaced once on Claude Code

- **Status:** Accepted (by the owner, 2026-10-05)
- **Date:** 2026-10-05
- **Deciders:** framework owner (boilerplate maintainer): owner decision B11 of handoff 07 (2026-10-05), "cap ROUTE lines per long prompt + stronger ROUTE cue, re-measure with instructions:audit; QA first, DEV port after". Technical calls inside it (the ranking, the cap of three, the re-surface event, the scope sentence, the eval metrics) were made by the implementing worker under that approval and are recorded below with the options they beat
- **Tags:** instructions, hooks, multi-harness, orchestration, cross-cutting-invariant
- **Supersedes:** —
- **Superseded by:** —

---

## Context

ADR-0009 made the prompt hook name the instruction sections a request needs (`ROUTE: read <file>`), and the LOAD PROTOCOL in `AGENTS.md` makes those lines binding. ADR-0013 added `bun run instructions:audit`, and its first reading said the agent rarely follows them: 28.3% of closed routes read across the live checkouts, 16.8% with removed worktrees, against a 90% target, while the router eval picks the right section on every labelled prompt. On the day of this decision the same audit read **19.1%** (13 of 68) on the live checkouts and **16.0%** (37 of 231) with removed worktrees.

Measured on this machine's transcripts for the decision (191 Claude Code sessions of this repository, last 30 days):

1. **Recall falls with the number of routes in a turn.** One route: 50.0% read (6 of 12 turns). Two: 8.3%. Three: 33.3%. Four: 16.7%. Five or more: 12.3% (22 of 179 routes, 25 turns).
2. **Worker prompts are the worst input.** Replaying the 536 real user prompts of those sessions through the hook, every one of the 116 dispatched-worker prompts fired five or more section routes, 6.84 on average. The Orca supervised preamble alone fires four sections (`Rule #1` hits `critical-rules`, `capability` hits `skills-and-mcps`, `orca` hits `tool-resolution`, `worker` and `dispatch` hit `orchestration-detail`), and the absolute paths in the task block fire more (`agentic-qa-boilerplate` matches the case-insensitive `\bQA\b` trigger of `ticket-work`, which drags `local-context-pbi` in as its row companion).
3. **The cue named a file, not an action.** `ROUTE: read <path> (<id>)` gave no size and no moment, and nothing came back if it was ignored.

## Decision

We will route fewer sections per prompt, say when to read them, and remind once. All of it lives in the one emitter, `.agents/hooks/personality-reinject.mjs`, so the three harnesses keep sharing a single classifier.

1. **Scope.** A `ROUTE-SCOPE:` sentence in the prompt (opening a line or following a sentence end, running to the end of its line) replaces the prompt for classification: each comma-separated item is a section `id`, routed directly, or words, classified; `none` routes nothing. Without one, a prompt that carries an orchestrator preamble is classified on the task block after its marker (`TASK_BLOCK_MARKERS`, the Orca `=== TASK ===` line). Absolute paths are neutralized first: one into this checkout becomes repo-relative (so `paths:` can match it), any other is blanked.
2. **Rank and cap.** Fired ROUTER rows are ranked by their anchor's strength: an `id` named in the scope, then `paths:` hits (each worth two trigger hits), then distinct `triggers:` hits, then the earliest match, then router order. Anchors come before the companions their rows bring. At most `MAX_ROUTED_SECTIONS` (three) section files get a binding line; the rest share one `ROUTE-OPTIONAL:` line, offered once per session and never recorded as routed, so a later prompt that ranks one of them in its top three still routes it. Imports (`package.json`, `.agents/project.yaml`) never count against the cap: Claude Code expands them at launch.
3. **A cue that states the action.** Each binding line reads `ROUTE: read <path> (<id>, <n> lines) before acting on this prompt`. The prefix is unchanged, so the audit, the compat contract and older transcripts keep parsing.
4. **Re-surface once, on Claude Code.** `.claude/settings.json` gains a `PostToolUse` group with no matcher running the same emitter. The prompt records its binding sections as pending; the first tool call that reads none of them, while some are unread, gets ONE `ROUTE-PENDING:` line naming them, and the turn never gets another. A subagent's call (`agent_id` in the input) is ignored. Any other event wired to the file by mistake prints nothing. `agents:compat:check` requires the group when Claude Code is a declared harness. Codex and OpenCode keep the `ROUTE:` cue only.
5. **The LOAD PROTOCOL names the three lines**: `ROUTE:` binding, `ROUTE-OPTIONAL:` read only when the task needs it, `ROUTE-PENDING:` read before the next step.
6. **Worker launch prompts end with `ROUTE-SCOPE: <section ids>`** (`orca-orchestration` `references/launch-seam.md` §2.1b, the playbook's two launch examples, a failure row in `references/brief-template.md`), and `references/worker-contract.md` gains rule 15: resolve the `ROUTE:` lines before the brief.
7. **The eval scores what the hook binds.** `scripts/lib/router-eval.ts` reports recall (an expected section named on any line: a trigger problem), binding recall (named on a binding line: a cap problem, new floor 90%) and precision (binding lines only, since an optional line binds nothing). `instructions:audit` also counts `ROUTE-PENDING:` reminders, files read after one, and `ROUTE-OPTIONAL:` lines.

The ROUTER table is untouched: lock fingerprint `f4d8c1c9bcf0` (ADR-0013) stands.

## Consequences

- **Positive, measured before and after:**
  - Router eval (61 labelled prompts): recall 100% before and after; binding recall 100% → 96.4% (four prompts lose `project-variables`, a row companion, to the optional line); precision 89.4% → 91.4%; binding lines per prompt 2.02 → 1.90.
  - Replay of the 536 real prompts: worker first prompts 6.84 → 2.37 binding section lines (none above three); interactive prompts 0.65 → 0.55; 59 optional lines offered; routing cost about 0.1 ms per prompt either way.
  - Controlled sessions (`claude -p`, Claude Code 2.1.289, the default model, no MCP servers, throwaway checkouts holding the same `AGENTS.md`, sections and settings, the old hook against the new one, the same four prompts, ten sessions per arm, transcripts scored with the audit's own parser): routes read **40.0% → 92.9%** (18 of 45 → 26 of 28). Worker prompts carrying a copy of the Orca preamble: 33.3% → 88.9% (11 of 33 → 16 of 18). A four-section story prompt: 37.5% → 100%. A two-section prompt the agent already read in full: 100% → 100%. The cap and the new cue shipped together, so this number is their joint effect. The reminder fired once in the ten new sessions, on a two-step task that finished before it could matter; its own effect is not measured yet.
- **Negative / trade-offs:** a section the eval labels as needed can now land on the optional line (binding recall below 100%, held by its floor). The re-surface costs one `node` start per tool call on Claude Code: 65.5 ms measured against 44.0 ms for a bare `node`, against tool calls that take seconds. Each binding line grows by about ten tokens. A project updated with `bun run up` receives the new emitter but not the `PostToolUse` group, because `.claude/settings.json` is delivered once; `agents:compat:check` fails until the group is added, and the parity report names it. A downstream project that adds the group without the new emitter would get the identity lines after every tool call from the old file, which treats every event as a prompt; the new emitter prints nothing for any event it does not own.
- **Neutral / follow-ups:** the live audit number moves only as new sessions run on the new hook; it is re-read after a fleet has run on it. The triggers are compiled case-insensitive, so `\bQA\b` still matches `qa` in a relative path and `\bT[1-4]\b` matches a label like `t1`: a trigger-hygiene pass (case-sensitive triggers, or a per-trigger flag) is a separate change. The agentic-dev twin ports the same emitter changes against its own router header (`Kind | Load | Also`).

## Alternatives considered

- **A cap of two.** Rejected: eight labelled prompts expect three sections, and the transcripts show no drop between two and three routes per turn large enough to pay for them (8.3% and 33.3%, on twelve and three turns).
- **Cap rows instead of files.** Rejected: a row with two sections and another with two would put four files in front of the agent, and the files are what it has to read.
- **Classify only the first lines of a long prompt.** Rejected: the Orca preamble comes FIRST and the task last, so the first lines are exactly the vendor text. The marker and the explicit scope sentence are both deterministic.
- **Re-surface on `PreToolUse`, before the first action.** Rejected for now: it fires before the agent's first read too, so a model that reads its routes first would be reminded of files it is about to open. `PostToolUse` sees the call that just ran and stays quiet when it read a route.
- **Detect reads by scanning the transcript from the hook.** Rejected: the transcript grows with the session and the hook runs on every tool call; the pending set in the per-session state file costs one small read.
- **Count an optional-line hit as a hit and drop binding recall.** Rejected: it would let the ranking push every needed section out of the binding lines without failing anything. Recall and binding recall each keep a floor.

## References

- `.agents/hooks/personality-reinject.mjs` (`routeScope`, `neutralizePaths`, `classifyPrompt`, `capRoutes`, `bindingRoutes`, `routeLines`, `pendingRouteReminder`, `MAX_ROUTED_SECTIONS`, `TASK_BLOCK_MARKERS`)
- `.claude/settings.json` (`PostToolUse`), `cli/lib/agent-compatibility-contracts.ts` (`ROUTE_RESURFACE_EVENT`)
- `scripts/lib/router-eval.ts` (`BINDING_RECALL_FLOOR`), `scripts/lint-instructions.ts` (`evalFindings`), `scripts/lib/instructions-audit.ts`, `scripts/instructions-audit.ts`
- `.agents/instructions/README.md` (scope, rank and cap, re-surface), `AGENTS.md` LOAD PROTOCOL
- `.agents/skills/orca-orchestration/references/launch-seam.md` §2.1b, `references/worker-contract.md` rule 15, `references/brief-template.md`, `references/coordinator-playbook.md`
- `.context/ADR/ADR-0009-progressive-disclosure-of-instructions.md`, `.context/ADR/ADR-0013-instructions-maintenance-locks.md`
