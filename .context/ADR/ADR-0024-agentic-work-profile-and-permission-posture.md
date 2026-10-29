# ADR-0024 — Agentic work runs in three tiers with one profile in `orchestration:`; a launched session escalates to its launcher, and workers run in bypass

- **Status:** Accepted (by the owner, on the decision deck of 2026-10-29 and the sweep of 2026-10-28 for the doctrine-alignment stage 1 plan)
- **Date:** 2026-10-29
- **Deciders:** framework owner (boilerplate maintainer). Decisions S1, S2, S3 were answered in a structured-question sweep on 2026-10-28; D1 to D5 and the plan approval (R1) on an `mkd` decision deck on 2026-10-29. The record is `.session/decisions/doctrine-alignment-2026-10-28.json`, which is gitignored, so every decision is restated below.
- **Tags:** orchestration, fleets, permissions, security, models, project-yaml
- **Supersedes:** —
- **Superseded by:** —

---

## Context

The repo runs agentic work at three depths, and until now only one of them had any configuration. A human types into a session; that session may launch persistent worker sessions through the orchestrator (Orca), and any session may dispatch one-shot subagents inside a turn. A launched session may itself be a conductor (a "middle conductor") with workers of its own.

Four gaps showed up in the gap analysis of the doctrine-alignment plan (`.session/orchestration/doctrine-alignment/gap-analysis.md` §C and §D, local session material):

1. **Who asks the human was undefined for launched sessions.** The sweep (ADR-0018) and the decision deck bind "the session the human types into", but a middle conductor or a worker had no rule, so two sessions could ask the human in parallel and the upper conductor never learned the answer.
2. **A worker's name did not carry its terminal handle.** The harness session name, the orchestrator tab title, the roster key and the `Session:` commit trailer used different strings, so a commit could not be traced to the terminal that wrote it.
3. **The permission doctrine contradicted what was measured.** The orchestration skill's hard rule said workers run in the classifier mode (`--permission-mode auto`) and never in edits-only. But a worker that stops on a prompt nobody watches is stalled, and the classifier mode does prompt (below). And the owner measured on 2026-10-28 that Orca 1.4.240's default Claude Code launch already carries `--dangerously-skip-permissions`.
4. **The `orchestration:` block had one model and one effort.** There was no conductor model, no subagent model, no per-topic choice and no permission mode per tier. `default_model: ''` meant "the harness default", which is an alias, and gotcha G29 (`orca-orchestration/references/gotchas.md`) forbids aliases because an alias changes model between rounds.

Harness facts this decision rests on, with the date and version they were read (they move; the launch line is always confirmed against `<harness> --help` on the machine):

- **Claude Code** (code.claude.com/docs/en/permission-modes and /cli-reference, read 2026-10-28): `--dangerously-skip-permissions` equals `--permission-mode bypassPermissions` and never prompts (except a first-run dialog until `skipDangerousModePermissionPrompt: true` is set in user settings, explicit `ask` rules, and recognised critical-path `rm` / `rmdir` removals), and "deny rules block in every mode, including `bypassPermissions`" (re-read 2026-10-29). `--permission-mode auto` runs a classifier that blocks exfiltration, `curl | bash`, force pushes, `reset --hard`, production deploys and token printing, and **after 3 consecutive or 20 total blocks it pauses and prompts the user**; when the classifier is unavailable for the model or organisation it starts in manual mode. Subagents inherit the parent session's mode.
- **Codex CLI** (Codex approvals and security docs and `codex-rs` at tag `rust-v0.165.0`, read 2026-10-28): `-a never -s workspace-write` never prompts but keeps `.git` read-only and the network off, so a worker cannot commit or call Jira; `--dangerously-bypass-approvals-and-sandbox` is the full bypass; `--approve-for-me` lets a reviewer model answer approvals.
- **OpenCode** (opencode.ai/docs/permissions and /docs/cli, source at v1.19.5 and v2.2.0, read 2026-10-28): `--auto` or `"permission": {"*": "allow"}` never prompts; no classifier mode exists.
- **Pi** (earendil-works/pi `packages/coding-agent/docs/security.md`, v1.4.0, read 2026-10-28): no approval system at all; `--approve` skips the project-trust prompt.
- **Orca** (measured by the owner and in this repo's sessions, Orca 1.4.240, 2026-10-28): the native supervised launch (`worker-start`) takes a model and an effort but no argv, so a worker's permission mode comes from the app's per-agent default arguments (Settings, Agents); `ORCA_TERMINAL_HANDLE` is set in a dispatched worker's own environment.

The full per-harness translation table is owned by `.agents/skills/orca-orchestration/references/orca-machine-setup.md` §3.1, not by this ADR.

## Decision

We will run agentic work in three tiers configured from one profile inside the existing `orchestration:` block of `.agents/project.yaml`:

1. **Tiers.** A *conductor* is the session the human types into, or a middle conductor launched by another session. A *worker* is a session a conductor launched. A *subagent* is a one-shot dispatch inside a turn.
2. **Who asks the human (S1).** A session is "launched by another session" when its prompt carries the fleet token `/<skill> <label> fleet worker`; every session a conductor launches (a worker, or a middle conductor) carries it. Such a session never asks the human: no structured-question tool, no decision deck, no sweep. Everything meant for the human (the four escalation kinds of `agentic-qa-core/references/decision-protocol.md` §5, and every error or blocker it cannot clear inside its brief) goes to the session that launched it, which relays. Exception: the human typed the request into that session directly, or the brief grants it in writing; the session then tells its launcher what was asked and answered. Only the session the human types into asks the human: the sweep for small items, the deck for heavy ones.
3. **Worker name (D1).** `<label>--<handle>`, where `label` is `[<KEY>-]<slug>` in kebab-case with single hyphens, and `--` appears only before the orchestrator terminal handle (`term_<uuid>`). It is parsed by splitting on the LAST `--term_`. Example: `TK-123-add-google-auth--term_7235f5a5-0fce-495c-9474-7c4370fdefa6`. The same string is the harness session name, the tab title, the roster key and the `Session:` trailer. Who sets it: on Claude Code the identity hook composes it from the fleet token plus `ORCA_TERMINAL_HANDLE`, and the worker renames its OWN tab as its first action (a CLI call, legal for a worker); the conductor re-issues the tab rename in every liveness sweep. On Codex, OpenCode v2.2 and Pi the conductor types the harness's rename verb once the worker is ready and reads it back on the status bar. A harness that cannot be renamed (OpenCode v1, whose `/rename` opens a dialog): the roster maps name to handle, the trailer carries the roster name, and the conductor says so once in the run report.
4. **Permission posture per tier (D2, D3, S2).** Conductor `auto`, worker `bypass`, subagent `inherit`. The profile declares the expectation; a supervised worker's real mode is set in the orchestrator's per-agent default arguments, and the conductor verifies it at readiness (the status bar, or the process argv) before dispatching work. A mismatch is fixed before the worker gets its brief.
5. **Profile shape (D4, hybrid).** The existing flat leaves stay. New flat leaves `conductor_model`, `conductor_effort` and `subagent_model` (each a template variable by the flat-key rule), a `permission_modes` map and a `model_overrides` list (both read by path, not template variables). `default_model` keeps its name and stays the worker model.
6. **Vocabulary (D5).** A mode is written in the repo vocabulary `bypass | auto | ask | inherit`, never in a harness's own flag spelling; one table in `orca-machine-setup.md` §3.1 translates it per harness.
7. **Models (S3).** `default_model` and `conductor_model` are full provider model ids, never aliases. `''` is allowed only when the conductor reads the model off the worker's screen at readiness and records it in the roster. `subagent_model` is written in the harness's subagent vocabulary (Claude Code's Agent tool: `sonnet | opus | haiku | fable`), because that tool takes no full id.

## Consequences

- **Positive:** a worker runs to completion without stopping on a prompt nobody sees. One string traces a commit to the terminal that wrote it. The human hears from one session, and the upper conductor learns every decision taken under it. A project changes model, effort or permission mode per tier by editing one block, and the per-topic overrides let a security or migration brief get a stronger model without a code change.
- **Negative / trade-offs:** **worker bypass removes the last runtime check on what a worker does.** An instruction injected through content the worker reads (a page of the application under test, a tracker comment, a fetched document) runs with the owner's rights, files and network, with no classifier in the way. QA workers read exactly that kind of content, so this is a real exposure, not a theoretical one. Mitigations, none of which closes it: on Claude Code the repo's `permissions.deny` list in `.claude/settings.json` still blocks under bypass (the permission-modes docs, re-read 2026-10-29); a Codex, OpenCode or Pi worker never reads that file, so there only the harness's own deny rules apply (OpenCode has `deny`; the others, per `orca-machine-setup.md` §3.1); the conductor verifies each worker's mode at readiness, so a worker never runs in a mode nobody chose; and the choice is per tier in the profile, so a project that cannot accept the exposure sets `worker: auto` or `ask` and accepts stalls instead. Running workers in a container or VM (what the Claude Code docs advise for bypass) is outside this repo's setup.
- **Neutral / follow-ups:** the readers of the profile (the orchestration skill's defaults, the coordinator playbook, the launch template, the brief template, the sprint conductor) are updated in the same plan; until they reference the new leaves, `vars:check` reports `CONDUCTOR_MODEL`, `CONDUCTOR_EFFORT` and `SUBAGENT_MODEL` as declared but unused (a warning). A downstream project receives the new keys through an interactive `bun sync` (insert-only); with `--auto` they are listed, not inserted, because the block already exists. A project that had `default_model: ''` keeps it until someone sets it.

## Alternatives considered

- **A middle conductor asks the human directly (vs S1).** Two sessions would ask in parallel, and the upper conductor would never learn the decision it is accountable for.
- **Stricter subagents than their worker (vs S2).** It needs a permission mode per subagent definition, and a subagent that hits a prompt stalls the turn that dispatched it.
- **Keep `default_model: ''` (vs S3).** The harness default is an alias, the thing G29 forbids.
- **The conductor sets the whole name after launch (vs D1).** A `/rename` typed into a busy session is queued, and typing into a starting session damages the label. **Handle only in the tab or the roster (vs D1):** the session name and the commit trailer would still not carry it.
- **Workers in `auto` (vs D2).** The classifier pauses and prompts after 3 consecutive or 20 total blocks (Claude Code docs, read 2026-10-28), and a worker that prompts with no human watching is stalled; it also has no equivalent on OpenCode or Pi. **Split the mode by topic (vs D2):** `worker-start` takes no argv, so the mode cannot vary per launch.
- **Conductors in `bypass` (vs D3).** The conductor has the largest blast radius (it launches and steers every worker) and the human is there to answer a prompt, so it keeps the classifier. **Leave the conductor mode undeclared:** the conductor could not verify its own posture.
- **A nested `tiers:` map (vs D4).** Nested leaves are not template variables, and it would duplicate `default_*`. **Flat leaves only:** per-topic overrides need a list anyway.
- **Harness-native values in the profile (vs D5).** Every project would carry one spelling per harness, and switching `default_agent` would silently leave the mode in the wrong spelling.

## References

- `.agents/project.yaml` (`orchestration:` block) and `.agents/README.md` §"`orchestration` (block inside `project.yaml`)": the keys.
- `.agents/skills/orca-orchestration/references/orca-machine-setup.md` §3.1: the per-harness translation table.
- `.agents/skills/agentic-qa-core/references/decision-protocol.md` §5 and `decision-elicitation-doctrine.md`: what reaches a person and how it is asked.
- ADR-0018 (the sweep), ADR-0006 (the forensic measurements ledger).
- Owner decisions: `.session/decisions/doctrine-alignment-2026-10-28.json` (gitignored; restated above). Plan: `.session/orchestration/doctrine-alignment/plan.md` steps 6 to 8 (local session material).
