# Session Management — Long-Skill Resume Contract

> Cited by: every long or medium official workflow skill in this repo. Loaded on demand at the start of every retrofitted skill (Phase 0 resume check) and at the end (Phase N archive).
> Sibling references: `./orchestration-doctrine.md` (mandatory subagent dispatch), `./briefing-template.md` (7-component briefing format), `./dispatch-patterns.md` (Single / Sequential / Parallel / Background). Topic-key conventions (file-first artifact tagging, Engram mirror) are inlined in §15 of this document.

## 1. Purpose & scope

Long official workflow skills (project-discovery, test-automation, sprint-testing, regression-testing, test-documentation, shift-left-testing, framework-development, and others) regularly run from 30 minutes to several hours. A terminal close, a network drop, an MCP failure or a user pause in the middle of one would cost the whole run unless state is on disk: the AI would restart phases, ask the user again, or rebuild state from which artifacts happen to exist.

This document is the single source of truth for the session contract every retrofitted skill follows:

1. Plan first. Before any phase runs, the skill writes its execution plan to disk.
2. Document per milestone. Each finished phase or sub-phase appends a progress entry to one file.
3. Resume cleanly. Every invocation starts with Phase 0, which reads the progress file and offers resume, restart or abort when earlier state exists.
4. Archive on completion. When the skill finishes successfully, the orchestrator moves the working directory to a dated archive so the next run starts fresh.

The contract wraps the orchestration doctrine and does not replace it. Subagent dispatch stays mandatory per `./orchestration-doctrine.md`; this layer makes the dispatches survive an interruption.

## 2. Relationship to existing doctrine

| Concern | Source of truth | What this doc adds |
|---|---|---|
| Subagent dispatch (when, why, anti-patterns) | `./orchestration-doctrine.md` | Per-phase progress checkpoints around each dispatch |
| Briefing format (7 components per dispatch) | `./briefing-template.md` | An 8th implied component, "Session artifact path": the orchestrator passes the absolute path to `plan.md` / `progress.md` so the subagent can read prior state |
| Pattern selection (Single / Sequential / Parallel / Background) | `./dispatch-patterns.md` | Each phase's pattern is recorded in `plan.md` §"Phase breakdown" so a resume keeps the pattern originally chosen |
| Artifact persistence (file-first + Engram mirror) | §15 (this doc) | A new top-level topic prefix `session/...` (see §11) alongside the existing `framework/...` |

For its own concern, the sibling doc wins. This file owns the lifecycle (Phase 0 resume, Phase 1 plan, per-phase progress, archive) and the file schemas (`plan.md`, `progress.md`).

## 3. Storage layout

Every retrofitted skill writes its session state under one tree at `<<PRIMARY_ROOT>>`, the PRIMARY checkout (`.agents/README.md` §"Checkout roots"). In the primary it is the repo root. In a linked worktree it is not the worktree's root, because everything git ignores inside a worktree is deleted with it. Every `.session/...` path in this document, and in every skill that cites it, resolves under `<<PRIMARY_ROOT>>` and goes to a subagent as an absolute path:

```
.session/
├── <skill-slug>/
│   └── <scope>/                          # may be omitted for project-scope skills
│       ├── plan.md
│       └── progress.md
└── .archive/
    └── <YYYY-MM-DD>-<skill-slug>-<scope>/
        ├── plan.md
        └── progress.md
```

Rules:

- `<skill-slug>` matches the skill's directory name under `.agents/skills/`.
- `<scope>` is invocation-specific (§9 gives the naming convention per skill). Project-scope skills omit it: their files live at `.session/<skill-slug>/{plan.md, progress.md}`.
- `.session/` is gitignored in both repos. Its contents are work-in-progress scaffolding, not committed deliverables. Audit history lives in Engram observations under the `session/...` topic prefix and in the domain artifacts each skill already commits to `.context/...`.
- `.session/.archive/` is gitignored too. It exists for local resume-replay and human inspection in the same session; long-term audit is Engram's job.
- A skill writes nowhere else under `.session/`. Sibling directories are reserved for future use, with one registered exception: `.session/orchestration/<slug>/` (below).

### Registered sibling: `.session/orchestration/<slug>/`

Fleet coordination (one conductor, several launched workers) is vocabulary shared by every workflow skill's dispatch, not one skill's scope, so it does not fit the `.session/<skill-slug>/<scope>/` shape. It lives at the top-level sibling `.session/orchestration/<slug>/`, gitignored and local like every other `.session/` path, and `/agent-orchestration` owns and documents it. It holds `run.md`, `roster.md`, `COMMON.md`, `W-<label>.md`, `launch.txt`, `claims.md`, `learnings.md`, `skill-improvements.md`, `kickoff.md` and `reports/<label>.md`. `agent-orchestration` owns the schemas and companion-file rules for that scope, not this document. `<slug>` is the run identifier a conductor picks at session start (kebab-case). The sibling is exempt from the `SESSION_RETROFITTED_SKILLS` lint (`scripts/lint-skills.ts`), which validates only the `<skill-slug>` shape: `agent-orchestration` does not write `.session/agent-orchestration/`, so its scope is not a candidate for that check.

### Companion files inside a scope

`plan.md` and `progress.md` are the contract and the only two files this doctrine governs. A scope may hold additional companion files when a skill needs state that is neither the plan nor the append-only log. They sit inside that scope directory (nothing is written elsewhere under `.session/`), and nothing outside the machine depends on one existing. They are disposable by construction, since `.session/` is gitignored and local.

Registered companions, all owned by `sprint-testing`:

| File | Altitude | What it is |
|---|---|---|
| `test-session-memory.md` | issue (`<KEY>/` or `sprint-<N>/<KEY>/`) | the domain payload shared across that issue's four stage dispatches: TMS modality, issue context, stage results, checklist |
| `<KEY>/brief.md` | issue, inside a sprint scope | the payload a conductor seeds for a launched worker before it exists |
| `roster.md` | sprint (`sprint-<N>/`) | one row per worker: label · issue · session label · handles · state |
| `launch.txt` | sprint | one self-contained launch line per issue; regenerated whole, never patched |
| `claims.md` | sprint | append-only ledger of declared read/write intents on shared fixture data |
| `reports/<label>.md` | sprint | a worker's long report, referenced from its done-message |

The four sprint-altitude ones exist only when the run has more than one executor (`sprint-testing/references/fleet-conductor.md`). A single-executor run has none of them, and a resume treats each as optional.

Any workflow skill may write two more companions inside its own scope, both governed by `agentic-qa-core/references/skill-refinement-protocol.md` and `agentic-qa-core/references/upstream-feedback.md`: `refinements.md` (append-only proposals for a skill edit, never the edit itself) and `upstream-issue-NN.md` (a redacted draft of an issue against the boilerplate, filed only on explicit OK). A resume treats both as optional.

### `## Live Progress` — the heartbeat contract

`progress.md` cannot show a long-running session working: the orchestrator writes it at phase boundaries, so while a phase is in flight it is silent, and a session running unattended (a launched worker, an unattended routine) has no orchestrator standing by to write it.

A session that must be observable while it works therefore appends one line per stage boundary to a `## Live Progress` section of its own `test-session-memory.md` (or, for a skill without that companion, of the plan-adjacent companion it already owns):

```
## Live Progress
- 14:02 Session Start done · preflight GREEN (ui, api, db)
- 14:31 Stage 1 done · ATP <KEY> · ATS <KEY> · 7 TCs
- 15:10 Stage 2 running · smoke GO · 4/7 PASSED
```

Rules:

- One line per stage boundary, prefixed `HH:MM`, append-only, in the shortest useful form. It is a liveness signal, not a report.
- A blocker goes in the line as a `BLOCKED_<REASON>` token, because the observer greps for `BLOCKED_`. Escalate through whatever channel the session uses as well: the token survives a dead channel, and the channel reinforces it.
- It is a file, not a message. Nothing pushes it anywhere; an observer reads it when it wants to. Periodic "still alive" messages to a coordinator are a different thing, and the worker contract prohibits them.
- It does not replace `progress.md` and never carries a phase entry's fields. `progress.md` stays the resume signal (§7); `## Live Progress` answers only "is this session moving, and when did it last move?". Staleness is judged from the last line's timestamp.
- For an Orca-supervised worker the timestamp is corroboration. The primary liveness signal is the on-screen spinner line, per `/agent-orchestration` (conductor cycle §5)
- It is optional by default. A skill that runs attended in the foreground has no reason to write it, and a resume never requires it.

## 4. Phase 0 — Resume contract (MANDATORY)

Every retrofitted skill runs Phase 0 first, before any subagent dispatch and before any user prompt beyond the initial trigger. The decision tree:

1. Resolve `<scope>` for this invocation (§9 has each skill's rule).
2. Check whether `<<PRIMARY_ROOT>>/.session/<skill-slug>/<scope>/progress.md` exists. When the session runs in a linked worktree (`<<REPO_ROOT>>` differs from `<<PRIMARY_ROOT>>`), say so in one line and look in the primary: a check against the worktree's own `.session/` finds nothing and silently restarts work that was already done.
3. If it does not exist, go to Phase 1 and write a new `plan.md`.
4. If it exists:
   1. Read `.session/<skill-slug>/<scope>/plan.md` in full.
   2. Read the tail of `.session/<skill-slug>/<scope>/progress.md` (the last 3 phase entries or so).
   3. Show the user a compact summary: the plan's Goal (one sentence), the last completed phase with its timestamp, the next planned phase, and any blocking notes from the last entry.
   4. Offer three options and wait for the user's answer:
      - **resume**: skip Phase 1, jump to the next planned phase, reuse the existing plan
      - **restart**: archive the current `.session/<skill-slug>/<scope>/` to `.session/.archive/<YYYY-MM-DD>-<skill-slug>-<scope>-aborted/` (note the `-aborted` suffix), then go to Phase 1 fresh
      - **abort**: leave the directory untouched and stop the skill

Phase 0 runs inline, with no subagent: it is one short orchestrator decision, and a dispatch would be pure overhead. It also runs on a first invocation, to confirm the directory does not exist, so that telling resume from fresh never depends on the orchestrator's memory.

### Without a person present

Who answers the resume / restart / abort question depends on who is running the skill (the general rule is `agentic-qa-core/references/decision-protocol.md`):

- A supervised worker asks its conductor or launcher through the channel it already reports on. A brief that names the choice is the answer.
- A routine with nobody to ask takes the delegating brief's answer when the brief covers it. With no brief, it resumes, because resuming is the reversible choice. It does not restart or abort on its own, and it says in its report that it found earlier state.

### Skills that opt out

A small set of short skills bypass Phase 0 because they have no meaningful interruption point: utility, core and single-turn skills (CLI cookbooks, atomic operators, informational walkthroughs, within-session-only operators, reference-only hosts). Each says so in its SKILL.md so a reader does not expect a `.session/` directory. `SESSION_RETROFITTED_SKILLS` in `scripts/lint-skills.ts` names the skills that do not opt out.

## 5. Phase 1 — Plan-first contract

Once Phase 0 confirms no prior session exists (or after restart was chosen), Phase 1 writes `plan.md`. Every later phase reads the plan on resume, so it is written before any execution-phase subagent is dispatched.

| Approach | When |
|---|---|
| **Inline** | The skill is short enough for the orchestrator to draft the plan from the user's trigger and the context docs (typical for skills with 3 phases or fewer) |
| **Single subagent** | The plan needs many context files or external systems read first (typical for project-discovery, regression-testing) |

The choice is recorded in the skill's SKILL.md "Subagent Dispatch Strategy" table and is not redecided per invocation.

### Special cases

Some skills have a canonical plan artifact that already lives outside `.session/` and is committed to git (for example `test-automation`'s `.context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/<ID>/automation-plan.md`, a `[COMMIT]` file per `.context/PBI/README.md`, versioned with the test code). For those skills:

- The committed artifact stays canonical.
- `.session/<skill-slug>/<scope>/plan.md` may be omitted, and the skill writes only `progress.md`.
- `progress.md` §"Cross-references" cites the canonical plan by path.

§13 points to the skills that use this progress-only variant.

## 6. `plan.md` schema

Every `plan.md` has the same shape, so any subagent (including a different agent on resume) reads it the same way.

### Frontmatter

```yaml
---
topic_key: session/<skill-slug>/<scope>/plan
skill: <skill-slug>
scope: <scope or "project">
created_at: <ISO-8601 UTC>
created_by: <model-id>
status: draft | approved | superseded
capture_prompt: true
---
```

- `topic_key` follows §11 and §15.
- `scope` is the literal `<scope>` value, or the string `project` for project-scope skills.
- `status` starts as `draft` on write, becomes `approved` when the plan is accepted, and becomes `superseded` if the orchestrator rewrites the plan mid-session (rare; an append-only changelog at the bottom is preferred to a rewrite). Who accepts: the user when one is present, the conductor for a supervised worker, the delegating brief for a routine. A routine whose brief does not cover the plan writes it as `draft` and carries on with the reversible work.
- `capture_prompt: true` for the initial plan write: the user's intent matters and Engram should keep it.

### Body — fixed H2 order

Subagents read the plan by H2 header, so the order and exact spelling matter:

1. `## Goal`: one sentence. The outcome the skill must produce.
2. `## Inputs`: files, URLs, Jira refs and env vars the plan was built from.
3. `## Approach`: why this approach was chosen, and the composable skills loaded (for example `/playwright-cli`, `/acli`).
4. `## Phase breakdown`: a table. Four columns are required, in this spelling and order: `Phase | Pattern | Dispatch payload pointer | Exit condition`. "Queue columns" below covers a table that is also a work queue.
5. `## Risks & open questions`: bulleted. Each item names the risk and the mitigation.
6. `## Verification checklist`: bulleted observable signals that mean "done" before Archive.
7. `## Cross-references`: sibling artifacts this session reads or writes (for example `.context/PBI/epics/EPIC-UPEX-100-<slug>/stories/STORY-UPEX-123-<slug>/implementation-plan.md`, `DESIGN.md`).

A plan with all seven headers is valid even when a section is empty. A missing header fails the lint check.

### Queue columns (optional, for a `## Phase breakdown` that is also a work queue)

Some skills run a list of units of work instead of a fixed pipeline: one nested sub-scope per issue, per module, per environment. For those, the Phase breakdown table is also the queue and the assignment board, which four columns cannot carry. These four are standard, so no skill invents its own spelling:

| Column | Meaning |
|---|---|
| `#` | Execution order inside the current group. The orchestrator picks the lowest-numbered unit still queued. |
| `Wave` | Group label, when the queue runs in ordered batches (wave 1 before wave 2). Omit when there is one group. |
| `Priority` | The unit's own priority, carried from its source of record (a Jira field, a risk score), never re-derived. |
| `Owner` | Who took this unit. `unassigned` until someone does, which is what makes the table shareable in a team. |

Rules that keep the extension from turning into drift:

- Append, never reorder. The four required columns keep their spelling and relative order, and queue columns sit around them, so a subagent reading by column name keeps working.
- Take all four, or none of the ones you need. `Owner` without `#` gives a board nobody can execute in order.
- `Exit condition` carries the status (queued, then the terminal state the unit reached). A `Status` column would be a second source of truth, so do not add one.
- Any column beyond these six gets a one-line justification in the table's preamble, so the next reader can tell a decision from an accident.

### Changelog (optional, append-only)

When the plan must change mid-session (the user adds a risk, or scope shifts after Phase 2 hits a blocker), append a `## Changelog` H2 at the bottom with a timestamped bullet per revision. Leave the earlier body sections as written: resume assumes the plan shows the agreement at session start.

## 7. `progress.md` schema

`progress.md` is append-only. Resume reads "what is the last completed phase?" as its single source of truth, and a rewrite would destroy that signal.

### Frontmatter

```yaml
---
topic_key: session/<skill-slug>/<scope>/progress
skill: <skill-slug>
scope: <scope or "project">
---
```

### Body — one block per phase entry

Each phase emits one H2 block when it starts and one when it ends (status transitions are separate entries). The orchestrator appends; subagents do not write to `progress.md`.

```
## Phase <N> — <name> — <ISO-8601 UTC>
- status: started | completed | failed | skipped
- dispatched_as: Single | Sequential | Parallel | Background | inline
- subagent_report: <inline summary OR engram observation ID>
- artifacts_touched: [path, path, ...]
- next: <Phase N+1 name | stop>
- git: <append-only one-liner — branch/PR state left behind; omit unless relevant>
- notes: <freeform one-liner — blockers, decisions, links>
```

Fields:

- `status`: `started` at dispatch, then a second entry with `completed`, `failed` or `skipped` after the subagent returns. Two entries per phase is normal.
- `dispatched_as`: the pattern used. A resume keeps it even if the context changed.
- `subagent_report`: a short inline summary (under 200 chars) or a reference to the full report (an Engram observation ID, a path to a report file). Long reports do not belong in `progress.md`.
- `artifacts_touched`: absolute paths of files the phase created or modified. Archive and post-session audits use it.
- `next`: the next planned phase, or `stop` when this entry is the final phase.
- `git`: an optional append-only one-liner for the version-control state the phase left behind. It helps when the work spans branches or PRs a resuming session must not lose track of. Omit it when the phase touched no git state. It matters most under the `sdet` strategy, where it forms the Git Ledger (below).
- `notes`: one line, optional but encouraged: the context that helps a future resume ("rate-limited by Jira, retried after 90s", "user chose Path B over Path C").

### The Git Ledger (`sdet` integration-trunk suites)

A chained test-automation suite on the `sdet` strategy (`.agents/skills/git-flow-master/references/sdet-integration-trunk.md`) keeps its git state across many branches and several `/test-automation` invocations. The `git:` field makes `progress.md` an append-only ledger of where the suite's branches stand, so a different session or agent resuming through Phase 0 reads the tail and knows how the integration trunk was left, without re-deriving it from `git log`.

Each ledger line is one snapshot at a phase boundary or branch action. Recommended shape:

```
- git: trunk <test/<module>-suite>@<short-sha> | merged <test/{KEY}> --no-ff | pending: <KEY..KEY> | sync-gate: <no|done> | final-PR: <none|#NN>
```

The latest `git:` entry in the tail is the current truth, and earlier ones are history. To correct one, append a new phase entry and leave the old line alone. This is the resume signal for "how did the SDET branches end up?" that the strategy depends on, and it holds even if a later session forgets the flow.

### Why append-only

When a phase fails and the user retries, the retry emits new entries and the failure stays. The resulting `progress.md` is a full execution audit (started, failed, restarted, completed), which is the data resume needs to behave correctly across several invocations.

## 8. Archive policy

When the skill's final phase emits a `completed` entry and the orchestrator confirms the Verification checklist (§6, `plan.md` item 6) passes, the orchestrator runs Archive inline as the closing action of that phase:

1. Compute `<archive-name>` as `<YYYY-MM-DD>-<skill-slug>-<scope>` (the literal `project` when there is no scope).
2. Move the whole directory: `mv .session/<skill-slug>/<scope>/ .session/.archive/<archive-name>/`.
3. Call Engram's `mem_session_summary` with the session summary template (§11), including the archive path so a later search can find it.
4. Report the archive path to the user in the closing summary.

### What NOT to archive

- Failed sessions. When the final phase is `failed`, the working directory stays in place, because the user needs the artifacts to debug. The user (or a later resume) decides when to discard.
- User-cancelled sessions. When the user picked `abort` at Phase 0, nothing moves.

### Why preserve the two-file directory (not concatenate)

The archive keeps `plan.md` and `progress.md` as a directory instead of merging them into one `.md` file. That keeps open the option to rewind to a completed phase and re-execute it (a future feature). A single file would be friendlier to `git diff`, but `.session/.archive/` is gitignored, so diff is not an audience.

## 9. Scope-naming convention

Each skill's `<scope>` shape is decided per skill, not per invocation, and the skill records its rule in its SKILL.md "Subagent Dispatch Strategy" section. The cross-skill conventions:

| Skill | Scope shape | Identifier source |
|---|---|---|
| `sprint-testing` | `<JIRA-KEY>` (single-issue); `sprint-<N>` (sprint-wide, a scope in its own right, holding one nested `<JIRA-KEY>/` sub-scope per issue) | Jira issue key or sprint number |
| `test-automation` | `<JIRA-KEY>` (ticket-driven, bug-driven, discovery-driven per gap); `<module-slug>` (module-driven, discovery-driven per module) | Jira ticket or module name from scope-picker |
| `test-documentation` | `<JIRA-KEY>` (ticket / bug / discovery per gap); `<module-slug>` (module / discovery per module); `<YYYY-MM-DD>-adhoc` (ad-hoc) | Scope-picker output |
| `framework-development` | `<change-name>` (kebab-case) | User-provided at session start |
| `regression-testing` | `<env>-<YYYY-MM-DD>` (e.g. `staging-2026-05-20`) | Invocation env + date |
| `shift-left-testing` | `<YYYY-MM-DD>-<descriptor>` | Session init |
| `exploratory-testing` | `<YYYY-MM-DD>-<scope-slug>` (the module, the flow, or `sweep`) | Session init, from the scope mode |
| `sprint-conductor` | `sprint-<N>` (the session plan and the boot and resume state only: `plan.md`, `kickoff.md`, `passes.md`, `refinements.md`; the fleet files stay in `sprint-testing`'s `sprint-<N>/`) | The sprint number at boot |
| `project-discovery` | (none, project scope) | n/a |

`agent-orchestration` is not in this table: it does not write `.session/<skill-slug>/<scope>/` at all. Its scope lives under the registered sibling `.session/orchestration/<slug>/` (§3), so it is exempt from the shape check below.

A skill validates that its `<scope>` matches its declared shape before it writes the directory. A mismatch is a lint failure.

### Nested scopes

A scope may contain sub-scopes when the skill runs at two altitudes. `sprint-testing` is the registered nested-scope skill: `sprint-<N>` is a scope and also the parent of one `<JIRA-KEY>/` sub-scope per issue in the sprint.

```
.session/sprint-testing/
├── <JIRA-KEY>/                 # single-issue mode
│   ├── plan.md
│   └── progress.md
└── sprint-<N>/                 # sprint-wide mode
    ├── plan.md                 # the sprint's queue, waves and assignment
    ├── progress.md             # append-only, one entry per issue close
    └── <JIRA-KEY>/             # one sub-scope per issue, unchanged
        ├── plan.md
        └── progress.md
```

Rules for a nested pair:

- Both altitudes use the same schemas: §6 for `plan.md`, §7 for `progress.md`. There is no second file format and no bespoke tracker file beside them. Only the meaning of "phase" differs: at issue altitude it is a stage of the skill, at sprint altitude it is one issue in the queue.
- Phase 0 runs at both altitudes: once on the parent scope when the sprint run is entered, then once per sub-scope as the loop enters that issue. Per-issue resume stays fine-grained, and the parent resume answers "where was this sprint left?".
- Archive runs bottom-up (§8). A sub-scope archives when its own final phase completes, and the parent archives only when the queue is exhausted. Moving the parent moves any sub-scope still inside it, so archive the parent only when no issue is mid-flight.
- The scope-shape regex in §14 check 3 applies to the immediate child of `.session/<skill-slug>/` only. The skill validates a nested sub-scope itself.

## 10. Orchestration enforcement banner

Every retrofitted SKILL.md includes this banner at the top of its "Subagent Dispatch Strategy" section (or a new "Session & Dispatch" section if none exists). `scripts/lint-skills.ts` checks it verbatim:

> **Orchestration & Session contracts**: this skill follows `agentic-qa-core/references/orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `agentic-qa-core/references/session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional.

The banner puts both doctrines side by side so a skill author cannot adopt one without the other. They compose: orchestration says how to dispatch, and session says how to persist around the dispatch.

Skills that adopt the progress-only variant (§13) replace the banner's last sentence with:

> Phase 0 (resume check) is NOT optional. Phase 1 plan is delegated to the canonical artifact at `<path>`; this skill writes only `progress.md`.

## 11. Composition with Engram

The session pattern is file-first: resume works even when Engram is unavailable. Engram is a best-effort cross-session search index on top of the files.

### Per-phase checkpoint

After each phase emits a `completed` entry to `progress.md`, the orchestrator calls `mem_save` once:

```
topic_key: session/<skill-slug>/<scope>/phase-<N>
type: discovery | architecture | bugfix | pattern   (per phase content)
scope: project
capture_prompt: false
content:
  What: <one line — what the phase did>
  Why: <one line — why this phase exists in the plan>
  Where: <list of artifacts_touched from progress.md>
  Learned: <gotchas, if any>
```

`capture_prompt: false` because the auto-emitted checkpoint is not a human decision. The user's intent was captured when the plan was approved in Phase 1.

### Session summary at archive

When Archive runs (§8 step 3), the orchestrator calls `mem_session_summary` with the standard template. The summary includes the archive path, so `mem_search "session <skill-slug> <scope>"` leads back to the full artifacts.

### Behavior when Engram is unavailable

- A `mem_save` failure is logged inline and the run continues. The phase still completes, and resume still works.
- A `mem_session_summary` failure is handled the same way. The user sees a warning in the closing summary, and the run does not abort.

The file-side state is always enough to resume.

### Topic-key prefix

`session/...` joins `framework/...` as a top-level prefix. §15 lists the registered prefixes.

## 12. Composition with `briefing-template.md`

The 7-component briefing in `./briefing-template.md` gets an implied 8th component for any dispatch that runs inside a session: the orchestrator passes the absolute path of the session directory, so the subagent can read prior state if it needs to.

```
Goal: <one sentence>

Context docs:
  - /abs/path/file1.md
  - /abs/path/file2.ts
  - <<PRIMARY_ROOT>>/.session/<skill-slug>/<scope>/plan.md       ← session artifact path
  - <<PRIMARY_ROOT>>/.session/<skill-slug>/<scope>/progress.md   ← session artifact path

... (remaining 5 components per briefing-template.md)
```

The subagent reads `plan.md` and `progress.md` as context only. Only the orchestrator writes to them.

## 13. Migration & exceptions

### Skills retrofitted with the full pattern (plan.md + progress.md)

The skills `SESSION_RETROFITTED_SKILLS` in `scripts/lint-skills.ts` names (the lint reads that constant).

### Skills explicitly excluded

See §4 "Skills that opt out".

## 14. Lint checks

`scripts/lint-skills.ts` enforces these session checks on top of the existing skill-registry lints:

1. Banner present. Every retrofitted SKILL.md (per §13) contains the §10 banner verbatim. A missing banner is an ERROR.
2. Phase 0 present. Every retrofitted SKILL.md has a section titled `## Phase 0` (or `## Phase -1` for skills with a pre-existing `## Phase 0` like `test-documentation`) that mentions the `.session/` path read. A missing Phase 0 is an ERROR.
3. Scope shape valid. When a session directory exists under `.session/<skill-slug>/`, its name matches the regex registered for that skill in §9. A mismatch is a WARN.

## 15. Topic-key conventions

Engram topic keys are file-first artifact tags: the file on disk is canonical, and the Engram observation mirrors it for cross-session search. Keys are stable, lowercase and slash-separated. An evolving artifact keeps the same key (an upsert), and different artifacts never share one.

Registered top-level prefixes in this repo:

| Prefix | Shape | Producer |
|---|---|---|
| `session/` | `session/<skill-slug>/<scope>/<artifact>` where `<artifact>` is `plan`, `progress`, or `phase-<N>` (§6, §7, §11) | Every retrofitted skill listed in §13 |
| `framework/` | `framework/<change-name>/<phase>` | `framework-development` (Plan / Code / Verify / Archive artifacts) |

Rules:

- `<skill-slug>` and `<scope>` match the values used for the `.session/` directory (§3, §9), so any key maps back to its file.
- Register a new top-level prefix in this table before first use, because unregistered prefixes fragment cross-session search.
- Prefixes stay in their family: a `session/...` save never upserts a `framework/...` observation, and the reverse.

## Cross-references

Pointers to sibling doctrine and supporting surfaces.

- **Producers** (skills that emit session state): §13 has the per-repo list. Each cited skill's `SKILL.md` "Subagent Dispatch Strategy" section names this doc.
- **Sibling doctrine**: `./orchestration-doctrine.md`, `./briefing-template.md`, `./dispatch-patterns.md`, all loaded on demand alongside this one. Topic-key conventions are inlined in §15.
- **Engram MCP surface used**: `mem_save` (per-phase checkpoints), `mem_session_summary` (at archive), `mem_search` + `mem_get_observation` (resume discovery from other sessions).
