# Session Management — Long-Skill Resume Contract

> Cited by: every long/medium official workflow skill in this repo. Loaded on demand at the start of every retrofitted skill (Phase 0 resume check) and at the end (Phase N archive).
> Sibling references: `./orchestration-doctrine.md` (mandatory subagent dispatch), `./briefing-template.md` (7-component briefing format), `./dispatch-patterns.md` (Single / Sequential / Parallel / Background). Topic-key conventions (file-first artifact tagging, Engram mirror) are inlined in §15 of this document.

## 1. Purpose & scope

Long official workflow skills (project-discovery, test-automation, sprint-testing, regression-testing, test-documentation, shift-left-testing, framework-development, etc.) regularly run for 30 minutes to several hours. Without a persistent resume contract, mid-execution interruption (terminal close, network drop, MCP failure, user pause) costs the entire run — the AI has to restart phases, re-prompt the user, or reverse-engineer state from artifact existence checks.

This document is the **single source of truth** for the session contract that every retrofitted skill follows:

1. **Plan first.** Before executing any phase, the skill writes its execution plan to disk.
2. **Document per milestone.** As each phase or sub-phase completes, the skill appends a progress entry to a single file.
3. **Resume cleanly.** Every skill invocation runs a mandatory Phase 0 check that reads the progress file and offers resume / restart / abort when prior state exists.
4. **Archive on completion.** When the skill finishes successfully, the orchestrator moves the working directory to a dated archive so the next run starts fresh.

The pattern composes with — does not replace — the existing orchestration doctrine. Subagent dispatch remains mandatory per `./orchestration-doctrine.md`; this layer adds a persistent contract around it so dispatches survive interruption.

## 2. Relationship to existing doctrine

| Concern | Source of truth | What this doc adds |
|---|---|---|
| Subagent dispatch (when, why, anti-patterns) | `./orchestration-doctrine.md` | Per-phase progress checkpoints around each dispatch |
| Briefing format (7 components per dispatch) | `./briefing-template.md` | An 8th implied component: "Session artifact path" — the orchestrator passes the absolute path to `plan.md` / `progress.md` so the subagent can read prior state |
| Pattern selection (Single / Sequential / Parallel / Background) | `./dispatch-patterns.md` | Each phase's pattern is recorded in `plan.md` §"Phase breakdown" so resume preserves the originally chosen pattern |
| Artifact persistence (file-first + Engram mirror) | §15 (this doc) | A new top-level topic prefix `session/...` (see §11) alongside the existing `framework/...` |

When in doubt, the sibling doctrine doc is canonical for its concern. This file owns the lifecycle (Phase 0 resume → Phase 1 plan → per-phase progress → archive) and the file schemas (`plan.md`, `progress.md`).

## 3. Storage layout

Every retrofitted skill writes its session state under a single tree at the repo root:

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
- `<scope>` is invocation-specific (see §9 for the naming convention per skill). Project-scope skills omit it entirely — files live directly at `.session/<skill-slug>/{plan.md, progress.md}`.
- `.session/` is **gitignored** in both repos. The contents are work-in-progress orchestration scaffolding, not committed deliverables. Audit history lives in (a) Engram observations under the `session/...` topic prefix, (b) the canonical domain artifacts each skill already commits to `.context/...`.
- `.session/.archive/` is also gitignored. The archive exists for local resume-replay and human inspection during the same session; long-term audit is delegated to Engram.
- A skill MUST NOT write anywhere else under `.session/`. Sibling directories under `.session/` are reserved for future use.

## 4. Phase 0 — Resume contract (MANDATORY)

Every retrofitted skill runs Phase 0 as the **first** thing it does, before any subagent dispatch, before any user prompt beyond the initial trigger. The decision tree is:

1. Resolve `<scope>` for this invocation (see §9 for the skill's rule).
2. Check whether `.session/<skill-slug>/<scope>/progress.md` exists.
3. If it does NOT exist → proceed to Phase 1 (write a new `plan.md`).
4. If it DOES exist:
   1. Read `.session/<skill-slug>/<scope>/plan.md` in full.
   2. Read the tail of `.session/<skill-slug>/<scope>/progress.md` (last ~3 phase entries).
   3. Surface to the user, in a compact summary:
      - The plan's Goal (one sentence)
      - The last completed phase + timestamp
      - The next planned phase
      - Any blocking notes from the last entry
   4. Present three options and WAIT for user input:
      - **resume** → skip Phase 1, jump to the next planned phase, reuse the existing plan
      - **restart** → archive the current `.session/<skill-slug>/<scope>/` to `.session/.archive/<YYYY-MM-DD>-<skill-slug>-<scope>-aborted/` (note the `-aborted` suffix), then proceed to Phase 1 fresh
      - **abort** → leave the directory untouched, stop the skill

Phase 0 is **inline** (no subagent). It is one short orchestrator decision; dispatching a subagent for it would be pure overhead.

The Phase 0 check is NOT optional — even on first invocation the orchestrator runs steps 1 and 2 to confirm the directory does not exist. This makes resume-vs-fresh disambiguation deterministic.

### Skills that opt out

A small set of short skills bypass Phase 0 because they have no meaningful interruption point. These are explicitly excluded:

- Command-driven CLI cookbooks: `acli`, `xray-cli`
- Atomic operators: `git-flow-master`
- Informational walkthroughs: `agentic-qa-onboard`
- Within-session-only operators: `judgment-day`
- Meta / reference-only: `agentic-qa-core`

A skill in this list MUST state its opt-out explicitly in its SKILL.md so future readers don't expect a `.session/` directory.

## 5. Phase 1 — Plan-first contract

After Phase 0 confirms no prior session exists (or after restart was chosen), the skill runs Phase 1 to write `plan.md`. The plan is the contract every subsequent phase reads on resume; it MUST be written before any execution-phase subagent is dispatched.

Dispatch options for Phase 1:

| Approach | When |
|---|---|
| **Inline** | Skill is short enough that the orchestrator drafts the plan directly from the user's trigger + context docs (typical for skills with ≤3 phases) |
| **Single subagent** | Plan requires reading many context files or external systems (typical for project-discovery, regression-testing) |

The choice is recorded in the skill's SKILL.md "Subagent Dispatch Strategy" table — not redecided per invocation.

### Special cases

Some skills have a canonical plan artifact that already lives outside `.session/` and is committed to git (e.g. `test-automation`'s `.context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/<ID>/automation-plan.md` — a `[COMMIT]` file per `.context/PBI/README.md`, versioned with the test code). For those skills:

- The committed artifact stays canonical.
- `.session/<skill-slug>/<scope>/plan.md` MAY be omitted; the skill writes only `progress.md`.
- `progress.md` §"Cross-references" cites the canonical plan by path.

See §13 for the explicit list of skills that adopt this progress-only variant.

## 6. `plan.md` schema

Every `plan.md` follows the same shape so any subagent (including a different agent on resume) reads it deterministically.

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
- `status` lifecycle: `draft` on write → `approved` when the user accepts the plan → `superseded` if the orchestrator rewrites the plan mid-session (rare; an append-only changelog at the bottom of the file is preferred over rewriting).
- `capture_prompt: true` for the initial plan write. The user's intent matters and Engram should preserve it.

### Body — fixed H2 order

Subagents read the plan by H2 header, so the order and exact spelling are required:

1. `## Goal` — one sentence. What outcome the skill must produce.
2. `## Inputs` — files, URLs, Jira refs, env vars the plan was built from.
3. `## Approach` — narrative explanation of why this approach was chosen. Names the composable skills loaded (e.g. `/playwright-cli`, `/acli`).
4. `## Phase breakdown` — table. Four columns are REQUIRED and keep this spelling and order: `Phase | Pattern | Dispatch payload pointer | Exit condition`. See "Queue columns" below when the table is also a work queue.
5. `## Risks & open questions` — bulleted list. Each item names the risk and the mitigation.
6. `## Verification checklist` — bulleted list of observable signals that mean "done" before Archive.
7. `## Cross-references` — sibling artifacts this session reads or writes (e.g. `.context/PBI/epics/EPIC-UPEX-100-<slug>/stories/STORY-UPEX-123-<slug>/implementation-plan.md`, `DESIGN.md`).

A plan with all seven headers (even if a section is empty) is valid. Missing a header fails the lint check.

### Queue columns (optional, for a `## Phase breakdown` that is also a work queue)

Some skills run a LIST of units of work rather than a fixed pipeline — one nested sub-scope per issue, per module, per environment. For those, the Phase breakdown table doubles as the queue AND the assignment board, and four columns cannot carry that. Rather than let each skill invent its own spelling, these four are standard:

| Column | Meaning |
|---|---|
| `#` | Execution order inside the current group. The orchestrator picks the lowest-numbered unit still queued. |
| `Wave` | Group label, when the queue is executed in ordered batches (wave 1 before wave 2). Omit when there is only one group. |
| `Priority` | The unit's own priority, carried from its source of record (a Jira field, a risk score). Never re-derived. |
| `Owner` | Who took this unit. `unassigned` until someone does. This is what makes the table shareable in a team. |

Rules that keep the extension from becoming drift:

- **Append, never reorder.** The four required columns keep their spelling and relative order; queue columns sit around them. A subagent reading by column NAME must not break.
- **Take all four or take none of the ones you need.** Adding `Owner` without `#` produces a board nobody can execute in order.
- **`Exit condition` carries status.** Do not add a `Status` column: the required column already holds it (queued → the terminal state the unit reached). A second status column is a second source of truth.
- Any column beyond these six needs a one-line justification in the table's preamble, so the next reader can tell a decision from an accident.

### Changelog (optional, append-only)

If the plan needs to be revised mid-session (user adds a new risk, scope shifts after Phase 2 discovers a blocker), append a `## Changelog` H2 at the bottom with a timestamped bullet per revision. Never edit the prior body sections in place — that breaks resume's assumption that the plan reflects the agreement at session start.

## 7. `progress.md` schema

`progress.md` is **append-only**. Rewriting it is forbidden because resume relies on "what is the last completed phase?" as its single source of truth — and rewriting destroys that signal.

### Frontmatter

```yaml
---
topic_key: session/<skill-slug>/<scope>/progress
skill: <skill-slug>
scope: <scope or "project">
---
```

### Body — one block per phase entry

Each phase emits one H2 block when it starts and one when it ends (status transitions written as separate entries). The orchestrator appends; subagents never write to `progress.md` directly.

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

- `status`: `started` at dispatch, then a second entry with `completed` / `failed` / `skipped` after the subagent returns. Two entries per phase is the norm.
- `dispatched_as`: the pattern used. Resume preserves the pattern even if context changed.
- `subagent_report`: short inline summary (<200 chars) OR a reference to the full report (e.g. an Engram observation ID, a path to a report file). Long reports do not belong in `progress.md`.
- `artifacts_touched`: absolute paths of files the phase created or modified. Used by Archive and by post-session audits.
- `next`: name of the next planned phase, or `stop` if this entry is the final phase.
- `git`: optional append-only one-liner recording the **version-control state the phase left behind** — useful when the work spans branches/PRs that a resuming session must not lose track of. Omit when the phase touched no git state. Most relevant under the `sdet` strategy, where it forms the **Git Ledger** (see below).
- `notes`: one line, optional but encouraged. Captures the kind of context that helps a future resume ("rate-limited by Jira, retried after 90s", "user chose Path B over Path C").

### The Git Ledger (`sdet` integration-trunk suites)

For a chained test-automation suite running the `sdet` strategy (`.agents/skills/git-flow-master/references/sdet-integration-trunk.md`), git state lives across many branches and multiple `/test-automation` invocations. The `git:` field turns `progress.md` into an **append-only ledger** of where the suite's branches stand, so a different session (or a different agent) resuming via Phase 0 reads the tail and knows exactly how the integration trunk was left — without re-deriving it from `git log`.

Each ledger line is one append-only snapshot at a phase boundary or branch action. Recommended shape:

```
- git: trunk <test/<module>-suite>@<short-sha> | merged <test/{KEY}> --no-ff | pending: <KEY..KEY> | sync-gate: <no|done> | final-PR: <none|#NN>
```

Because the field is append-only like every other line, the **latest** `git:` entry in the tail is the current truth; earlier ones are history. Never rewrite a prior `git:` line — append a new phase entry. This is the resume signal for "how did the SDET branches end up?" that the strategy depends on (reinforces it even if a later session forgets the flow).

### Why append-only

If a phase fails and the user retries, the retry emits NEW entries — it does not overwrite the failure. The resulting `progress.md` is a full execution audit: started → failed → restarted → completed. This is the data resume needs to behave correctly across multiple invocations.

## 8. Archive policy

When the skill's final phase emits a `completed` entry AND the orchestrator confirms the Verification checklist (§6 plan.md item 6) passes, the orchestrator runs Archive **inline** as the closing action of that final phase:

1. Compute `<archive-name>` as `<YYYY-MM-DD>-<skill-slug>-<scope>` (use `project` literal when no scope).
2. Move the entire directory: `mv .session/<skill-slug>/<scope>/ .session/.archive/<archive-name>/`.
3. Call Engram's `mem_session_summary` with the session summary template (see §11). Include the archive path in the summary so future search can find it.
4. Report the archive path to the user in the closing summary.

### What NOT to archive

- **Failed sessions.** If the final phase is `failed`, the orchestrator leaves the working directory in place. The user needs the artifacts to debug. The user (or a later resume) decides when to discard.
- **User-cancelled sessions.** If the user picked `abort` at Phase 0, nothing moves.

### Why preserve the two-file directory (not concatenate)

The archive keeps both `plan.md` and `progress.md` as a directory rather than concatenating them into a single `.md` file. This preserves the ability to rewind to a specific completed phase and re-execute (a future feature). Concatenation would friendlier for `git diff` but `.session/.archive/` is gitignored — git diff is not a relevant audience.

## 9. Scope-naming convention

The shape of `<scope>` is decided per skill, not per invocation. Each retrofitted skill records its scope rule in its SKILL.md "Subagent Dispatch Strategy" section. The cross-skill conventions are:

| Skill | Scope shape | Identifier source |
|---|---|---|
| `sprint-testing` | `<JIRA-KEY>` (single-issue); `sprint-<N>` (sprint-wide — a scope in its own right, holding one nested `<JIRA-KEY>/` sub-scope per issue) | Jira issue key or sprint number |
| `test-automation` | `<JIRA-KEY>` (ticket-driven, regression-driven); `<module-slug>` (module-driven) | Jira ticket or module name from scope-picker |
| `test-documentation` | `<JIRA-KEY>` (ticket / bug); `<module-slug>` (module); `<YYYY-MM-DD>-adhoc` (ad-hoc) | Scope-picker output |
| `framework-development` | `<change-name>` (kebab-case) | User-provided at session start |
| `regression-testing` | `<env>-<YYYY-MM-DD>` (e.g. `staging-2026-05-20`) | Invocation env + date |
| `shift-left-testing` | `<YYYY-MM-DD>-<descriptor>` | Session init |
| `project-discovery` | (none — project scope) | — |

A skill MUST validate its `<scope>` matches its declared shape before writing the directory. Mismatch is a lint failure.

### Nested scopes

A scope MAY itself contain sub-scopes when the skill genuinely runs at two altitudes. Today only `sprint-testing` does: `sprint-<N>` is a scope AND the parent of one `<JIRA-KEY>/` sub-scope per issue in the sprint.

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

- **Both altitudes use the SAME schemas** — §6 for `plan.md`, §7 for `progress.md`. There is no second file format, and no bespoke tracker file beside them. What differs is only what a "phase" means: at issue altitude a phase is a stage of the skill, at sprint altitude a phase is one issue in the queue.
- **Phase 0 runs at both altitudes** — once on the parent scope when the sprint run is entered, then once per sub-scope as the loop enters that issue. Per-issue resume stays fine-grained; the parent resume answers "where was this sprint left?".
- **Archive is bottom-up** (§8) — a sub-scope archives when its own final phase completes; the parent archives only when the queue is exhausted. Moving the parent moves any sub-scope still inside it, so never archive the parent while an issue is mid-flight.
- **The scope-shape regex in §14 check 3 applies to the immediate child of `.session/<skill-slug>/` only.** A nested sub-scope is validated by the skill, not by the lint.

## 10. Orchestration enforcement banner

Every retrofitted SKILL.md MUST include this banner at the top of its "Subagent Dispatch Strategy" section (or a new "Session & Dispatch" section if none exists). The banner is checked verbatim by `scripts/lint-skills.ts`:

> **Orchestration & Session contracts**: this skill follows `agentic-qa-core/references/orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `agentic-qa-core/references/session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional.

The banner anchors both doctrines side by side so a skill author cannot adopt one without the other. The two contracts are designed to compose: orchestration says HOW to dispatch; session says HOW to persist around the dispatch.

Skills that adopt the progress-only variant (§13) replace the banner's last sentence with:

> Phase 0 (resume check) is NOT optional. Phase 1 plan is delegated to the canonical artifact at `<path>`; this skill writes only `progress.md`.

## 11. Composition with Engram

The session pattern is **file-first**: resume works correctly even when Engram is unavailable. Engram acts as a best-effort cross-session search index on top of the files.

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

`capture_prompt: false` because the auto-emitted checkpoint is not a human decision; the user's intent was captured at Phase 1's plan approval.

### Session summary at archive

When Archive runs (§8 step 3), the orchestrator calls `mem_session_summary` with the standard template. The session summary MUST include the archive path so `mem_search "session <skill-slug> <scope>"` can navigate back to the full artifacts.

### Behavior when Engram is unavailable

- `mem_save` failure → log the failure inline and continue. The phase still completes; resume still works.
- `mem_session_summary` failure → same. The user sees a warning in the closing summary, not an abort.

The file-side state is always sufficient to resume.

### Topic-key prefix

`session/...` joins `framework/...` as a top-level prefix. See §15 for the registered prefixes.

## 12. Composition with `briefing-template.md`

The 7-component briefing format in `./briefing-template.md` gets an implied 8th component for any dispatch that runs inside a session context: the orchestrator passes the absolute path of the session directory so the subagent can read prior state if it needs to.

```
Goal: <one sentence>

Context docs:
  - /abs/path/file1.md
  - /abs/path/file2.ts
  - .session/<skill-slug>/<scope>/plan.md           ← session artifact path
  - .session/<skill-slug>/<scope>/progress.md       ← session artifact path

... (remaining 5 components per briefing-template.md)
```

The subagent treats `plan.md` and `progress.md` as read-only context. Only the orchestrator writes to them.

## 13. Migration & exceptions

### Skills retrofitted with the full pattern (plan.md + progress.md)

`test-automation`, `sprint-testing`, `project-discovery`, `regression-testing`, `test-documentation`, `shift-left-testing`.

### Skill that pioneered the pattern

`framework-development`. The original implementation used `.scratch/framework-changes/<change>/{plan.md, apply-progress.md}`. Migrated to this doctrine at `.session/framework-development/<change>/{plan.md, progress.md}`. The `.scratch/` path is grandfathered for one release so in-flight local state does not vanish on upgrade.

### Skills explicitly excluded

See §4 "Skills that opt out".

## 14. Lint checks

`scripts/lint-skills.ts` enforces three checks on top of the existing skill-registry lints:

1. **Banner present.** Every retrofitted SKILL.md (per §13) contains the §10 banner verbatim. Missing banner → ERROR.
2. **Phase 0 present.** Every retrofitted SKILL.md has a section titled `## Phase 0` (or `## Phase -1` for skills with a pre-existing `## Phase 0` like `test-documentation`) that mentions `.session/` path read. Missing Phase 0 → ERROR.
3. **Scope shape valid.** When a session directory exists under `.session/<skill-slug>/`, its name matches the regex registered for that skill in §9. Mismatch → WARN.

## 15. Topic-key conventions

Engram topic keys are **file-first artifact tags**: the file on disk is canonical, and the Engram observation mirrors it for cross-session search. Keys are stable, lowercase, slash-separated; the same evolving artifact keeps the same key (upsert), and different artifacts never share one.

Registered top-level prefixes in this repo:

| Prefix | Shape | Producer |
|---|---|---|
| `session/` | `session/<skill-slug>/<scope>/<artifact>` where `<artifact>` is `plan`, `progress`, or `phase-<N>` (§6, §7, §11) | Every retrofitted skill listed in §13 |
| `framework/` | `framework/<change-name>/<phase>` | `framework-development` (Plan / Code / Verify / Archive artifacts) |

Rules:

- `<skill-slug>` and `<scope>` match the values used for the `.session/` directory (§3, §9), so any key maps back to its file deterministically.
- A new top-level prefix MUST be registered in this table before first use — unregistered prefixes fragment cross-session search.
- Prefixes never cross families: a `session/...` save never upserts a `framework/...` observation, and vice versa.

## Cross-references

Pointers to sibling doctrine and supporting surfaces.

- **Producers** (skills that emit session state): see §13 for the per-repo list. Each cited skill's `SKILL.md` "Subagent Dispatch Strategy" section names this doc.
- **Sibling doctrine**: `./orchestration-doctrine.md`, `./briefing-template.md`, `./dispatch-patterns.md`. All three loaded on demand alongside this one. Topic-key conventions are inlined in §15.
- **Engram MCP surface used**: `mem_save` (per-phase checkpoints), `mem_session_summary` (at archive), `mem_search` + `mem_get_observation` (for resume discovery from other sessions).
