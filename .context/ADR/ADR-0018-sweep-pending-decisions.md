# ADR-0018 — Sweep Pending Decisions (SPD): the human-facing session asks everything that waits with the harness question tool, in rounds, with a prose fallback

- **Status:** Accepted (by the owner, 2026-10-22, in the evaluation session: sweep in rounds, weight decides sweep vs deck, no verification layer, worktree-close port)
- **Date:** 2026-10-22
- **Deciders:** framework owner (boilerplate maintainer). Drafted by the `spd-evaluation` session at the request of the webapp conductor, which adopted SPD the same day (webapp `CLAUDE.md` Rule 21, `agent-decisions.md` §"SPD")
- **Tags:** decisions, multi-harness, orchestration, instructions, hooks
- **Supersedes:** —
- **Superseded by:** —

Every claim below is labelled `measured` (observed on this machine, 2026-10-22), `read` (a document or source opened, with its origin) or `predicted` (inference). Open questions for the owner are in §"Decisions the owner must take".

---

## Context

The webapp repo standardized one habit: a session about to leave something pending for the owner asks all of it at once with Claude Code's `AskUserQuestion` (max 4 questions, recommended option first, a "later" option, escalation to `mkd` when dense), and only the conductor session does it. It named it SPD, sibling of MKD (`read`: webapp `agent-decisions.md`).

This repo already holds most of the surrounding machinery (`read`, all in `.agents/skills/agentic-qa-core/references/` unless noted):

| Need | Where it already lives | What it does not say |
|---|---|---|
| WHETHER a question reaches a person | `decision-protocol.md`: search the record, decide technical calls inside the approved plan, escalate only four kinds (product behaviour, new security posture, irreversible/outward, what a person signs) | nothing about what to do at the end of a turn that still has such items |
| WHICH instrument asks | `decision-elicitation-doctrine.md` §1 ladder: harness prompt for up to three simple questions, `mkd` above three or for one dense tradeoff; last row: no human at the wheel, state the assumption | no batching rule, no "later" answer, no fallback for a harness without a question tool |
| What a person signs, per stage | `stage-gates.md` "The person signs" column | a per-stage list, not a turn-level habit |
| A batched ask in two places | `artifact-lifecycle.md` §4 and `preflight-gate.md` §5 each ask ONE `AskUserQuestion` for their own gap | local to those two flows |
| Conductor vs worker | `orca-orchestration` (worker sends `worker_done`, blocking `ask`, `escalation`); the prompt hook tells a dispatched worker "never SendMessage/AskUserQuestion" (`.agents/hooks/personality-reinject.mjs`, `ORCA_CONTEXT_LINE`) | the conductor's duty to sweep what the workers list |
| The `mkd` deck | user-level skill installed by `cli/install.ts` (`USER_LEVEL_SKILLS`), gated by the doctrine §3 | — |

So the gap is narrow and real: **nothing tells a session that the way to end a turn holding open items is one structured call, not a prose list.** A prose list is the failure SPD removes (the owner has to remember to answer, and the answers arrive unanchored).

`AskUserQuestion` is a Claude Code tool. This repo supports Claude Code, Codex and OpenCode (`agent-harnesses.md` §4.5). Per-harness reality (`read` unless marked; sources opened 2026-10-22):

| Harness | Structured-question tool | Limits | Headless | Subagents / workers |
|---|---|---|---|---|
| Claude Code 2.1.308 (`measured`: binary) | `AskUserQuestion` | 1-4 questions, 2-4 options, automatic "Other", multiselect, previews (code.claude.com/docs/en/agent-sdk/user-input) | in the SDK it goes through the host's `canUseTool`; the binary carries "tool requires user interaction; no prompt available in headless mode" (`measured`, not tied to this tool) | SDK docs say not available to Agent-tool subagents; issues contradict this for foreground subagents. Conflicting |
| Codex CLI 0.159.3 (`measured`) | `request_user_input` | 1-3 questions ("prefer 1"), 2-3 options, "Other" added by the client, no multiselect, no previews (openai/codex `request_user_input_tool.rs`) | `request_user_input is not supported in exec mode` (`measured`: binary) | unverified |
| OpenCode 2.0.20 (`measured`) | `question` (permission key `question`) | header, text, options, `multiple`, custom answer automatic; label max 30 chars (`measured`); per-call caps unverified | `opencode run` disables it (opencode issue #11899) | child sessions do not inherit `question: deny` |
| Gemini CLI (not installed here) | `ask_user` | 1-4 questions, 2-4 options, types `choice`/`text`/`yesno` (geminicli.com/docs/tools/ask-user) | denied non-interactive | unverified |

Two facts from that table drive the design: **Codex caps at three options and, by default, exposes the tool only in Plan mode** (`read`: openai/codex issue #29104, PR #12735; flag `default_mode_request_user_input`), so on Codex the prose fallback is the common path and not an edge case. And **a tool-less turn is not a failed turn**: every harness here already runs headless sessions where the tool is absent, and this repo's own measurement harness (`claude -p`, ADR-0017) is one of them.

The repo has no `Stop` hook on any harness (`measured`: `.claude/settings.json` registers `UserPromptSubmit`, `SessionStart`, `PostToolUse`; `.codex/hooks.json` the same three; the OpenCode adapter uses `experimental.chat.system.transform` and `experimental.session.compacting`).

---

## Decision

We will add the sweep as text in `AGENTS.md` §2 plus one reference section, with no new skill, no new Critical Rule and no hook. SPD sorts out HOW pendings are asked; it never widens WHAT is asked: `decision-protocol.md` still decides what reaches a person.

1. **The rule** is the paragraph "SWEEP AT THE TURN END" in `AGENTS.md` §2, harness-neutral (it names no tool). The full shape lives in `decision-elicitation-doctrine.md` §7: who sweeps (the session talking to the human, never a worker, subagent or routine), what counts (only the four kinds of `decision-protocol.md` §5), when (before any message that would leave something waiting; in plan mode before `ExitPlanMode`), the question shape (recommended first, a free-text way out, a "Later" option unless it blocks), "Later" as a recorded deferral, the answer as the execution contract, the tool per harness, and the numbered-list fallback.
2. **Rounds, no number (owner, 2026-10-22).** The sweep calls the harness tool at its own per-call limit and calls it again until every item is asked. Nine items on a four-per-call tool are rounds of four, four and one. The earlier proposal of a fixed cap of three was dropped: no limit is written in this repo, the tool's schema sets the round size.
3. **Weight decides sweep versus deck, never count.** Small decisions (A or B, a default to confirm, a deferral; each fits in two sentences) are swept, however many. Heavy ones (architecture, an implementation approach, a larger change, real tradeoffs, a long report to react to) get an `mkd` deck. A mixed batch sweeps first. This replaces the doctrine's old threshold "more than three decisions, or one dense one" (ladder §1 rewritten). The `mkd` skill lives in `agentic-user-skills`; its use table was aligned there on branch `feat/mkd-spd-alignment`.
4. **Tool per harness** is a table in the doctrine, not in `AGENTS.md`: Claude Code `AskUserQuestion`, Codex `request_user_input` (Plan mode by default), OpenCode `question`, Gemini CLI `ask_user`, any other harness its own question tool if the session's tool list shows one, otherwise the fallback. The session's tool list is the authority; the table only says what to look for.
5. **No verification layer.** The owner declined both the audit metric and a `Stop` hook. Compliance rests on the instruction alone, and this ADR records that as a known limit: the rule depends on the model following instructions. A later ADR can add a metric (`instructions:audit`) or a one-shot `Stop` reminder (Claude Code, Codex, Gemini CLI expose a blocking stop event; the OpenCode `session.idle` event is observation only in its docs).
6. **`AGENTS.md` was compacted in the same change** for the AI reader, not the human one: sections §2 and §3 and the header were rewritten denser with no rule dropped (a fidelity audit by a separate reader compared them against the committed original). The new paragraphs are included in the size.
7. **The worktree-close rule is ported** (side question below), with the resume exception.
8. **Worker rule reachability.** The ban on workers asking the human already existed in the hook line and the worker brief; it now also says where the pending goes (to the conductor, who sweeps), in `templates/COMMON.md` and `worker-contract.md`, and as a compact rule in `agentic-qa-core` so `REGISTRY.md` carries it.

### Where the IQL stages plug in

The sweep is not a stage gate; it is how a stage reports a gate. Each "The person signs" cell in `stage-gates.md` that the current run reaches becomes one question of the sweep, with its evidence attached. A stage report that used to end "waiting for your OK on X, Y, Z" in prose ends with the sweep. No stage changes its autonomy level.

### Naming

Keep **SPD / Sweep Pending Decisions**: already English, pairs with `mkd` (Make Decision, a user-level skill installed by `cli/install.ts`). The Spanish "barrido de decisiones pendientes" stays only as a trigger phrase. In running prose, "the sweep".

## Consequences

- **Positive:** open items stop leaving the turn as prose; any number of small decisions is answered in one pass; "Later" is recorded instead of forgotten; one text works on three harnesses.
- **Negative / trade-offs:** no enforcement (see 5); on Codex outside Plan mode, and in any headless run, the fallback is the normal path; the tool names and limits move with harness versions; an `AGENTS.md` that grew by the new paragraphs even after compaction.
- **Neutral / follow-ups:** the Claude 2.1.308 binary contains a newer question schema (`kind: choice|text|number`) whose relation to `AskUserQuestion` is unverified; foreground-subagent availability of the tool is documented both ways, and nothing depends on it because workers never ask. The agentic-dev boilerplate ports the same change.

## Alternatives considered

- **A fixed cap of three questions** (the first proposal). Dropped by the owner: rounds cover any count and need no number.
- **Copy the webapp wording** (a numbered Critical Rule, max 4 questions, a Claude-only tool in the always-on file). Rejected: names a tool that exists on one harness, and the Critical Rules are the break-glass list.
- **A new `sweep` skill.** Rejected: two paragraphs and a table; a skill loads when triggered, which is exactly when the habit is skipped.
- **Put the sweep inside `mkd`.** Rejected: `mkd` is user-level and optional; the sweep must work on a machine that never ran the installer.
- **A `Stop` hook or an audit metric.** Declined by the owner for now.

## Side question: the worktree-close rule (webapp commit `8342f8f5`)

Verdict (owner approved, 2026-10-22): **port it, with the resume exception this repo already documents.** Applied in `SKILL.md`, `references/coordinator-playbook.md` §6 and `references/worker-contract.md`. `read`: that commit's message and diff (webapp, 2026-10-19; `worker-release` closes the agent terminal only, five merged worktrees of about 1.8 GB each were left; I did not re-measure the cost here).

Current state in this repo (`read`): `orca-orchestration/SKILL.md` line 24 says "Remove a worktree only after the orphan audit", which allows removal but does not require it; `references/coordinator-playbook.md` §6 lists the audit and, at its item 4, tells the conductor to KEEP the worktree while a session may still be resumed. The webapp rule is blanket and puts its only exception in `roster.md`. The port should keep item 4 as one of the allowed written reasons, otherwise the two rules contradict.

Proposed wording.

`SKILL.md`, replacing the last sentence of the "DO close a finished worker" bullet (and the matching Quick start step 7):

> Release the supervised worker by its dispatch; without a dispatch, COUNT the terminals in that worktree before closing anything, because the stop verb's radius is the whole worktree. `worker-release` closes the agent terminal only: the worktree, its `Setup` terminal and its local branch survive it and pile up. So after the orphan audit the conductor removes the worktree in the same turn (`orca worktree rm --run-hooks`) and confirms with `git worktree list`. A worktree stays only with a written reason and an owner in `roster.md` (a worker session that may still be resumed is such a reason, see the playbook §6 item 4).

`coordinator-playbook.md` §6, after the audit list:

> Removing is part of closing, not a later chore. Removable when ALL hold: its HEAD is an ancestor of the integration branch, `git status --porcelain` shows nothing that is not disposable, `bun run worktree:audit` exits 0, nobody will resume the session (else write why in `roster.md`), and no terminal other than `Setup` is left in it. A worktree some other session created, one not in your roster, is not yours to remove: report it to the owner with the audit. End-of-run check before the final report: `git worktree list` shows only the primary checkout plus the worktrees `roster.md` explains; anything else is a leak, close it or name it.

`worker-contract.md`:

> A worktree YOU created for sub-work is yours to remove before `worker_done`, after copying out any gitignored evidence. Your own worktree is the conductor's to remove: leave nothing gitignored that lives only there, and say in the summary where you copied logs and evidence.

This repo holds the origin copy of the skill; the webapp receives it through `bun sync`, so the edit is made here only.

---

**Note (2026-11-18):** the orchestration doctrine moved to the user-level skill `agent-orchestration` (ADR-0029). `orca-orchestration` is a stub, so the paths this ADR cites under `.agents/skills/orca-orchestration/` no longer exist: the generic parts are in `agent-orchestration` under the same rule, worker-rule and gotcha numbers, and the parts this repo owns are in `.agents/skills/agentic-qa-core/references/fleet-launch-seam.md`, `fleet-provisioning.md` and `fleet-project-profile.md`. The worker's `ask` no longer blocks: the worker ends its turn and Orca wakes it with the answer.
