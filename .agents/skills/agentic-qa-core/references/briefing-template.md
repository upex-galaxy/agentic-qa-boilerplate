# Subagent Briefing Template

> Cited by: workflow skills (`sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `project-discovery`) when they delegate to a subagent.
> Format: every dispatch MUST fill the 7 components below.

## The 7 components

1. **Goal** — one sentence. What outcome the subagent must achieve.
2. **Context docs** — files the subagent reads before acting. Absolute paths. The checkout's root is written as `<<REPO_ROOT>>` and the primary checkout's as `<<PRIMARY_ROOT>>` — session variables defined in `.agents/README.md` §"Checkout roots" — which the orchestrator resolves to real absolute paths at dispatch time (a subagent's cwd resets between calls, so relative paths are unsafe). Tracked files go under `<<REPO_ROOT>>`; session state (`.session/**`), evidence and other durable gitignored output go under `<<PRIMARY_ROOT>>`, so a worker in a worktree never writes state that dies with it.
3. **Project Standards (auto-resolved)** — REQUIRED. Compact rules of skills relevant to this dispatch. Pulled from `.agents/skills/REGISTRY.md` (built once per session by `bun run skills:registry`). The subagent treats this section as authoritative for the listed conventions and does NOT re-read the full SKILL.md unless explicitly told to. Context skills (`<aspect>-context`, `iql-context`) are included ONLY when the dispatch touches their aspect. Protocol: `agentic-qa-core/references/skill-resolver.md`.
4. **Skills to load** — skill triggers (e.g. `/acli`, `/xray-cli`, `/playwright-cli`) the subagent must invoke before issuing tool calls. The orchestrator never inlines tool syntax — that lives in the owning skill.
5. **Exact instructions** — numbered steps. No ambiguity. Each step names the tool / skill action.
6. **Report format** — what the subagent returns to the orchestrator. Either a JSON object with named fields, or a bullet list with explicit headings. Avoid free-form prose. For workflow-skill stage dispatches, append the mandatory session-footer fields (`skills_loaded`, `mcps_used`, `clis_used`, `testing_levels_touched`, `screenshots_captured`) per `agentic-qa-core/references/session-footer-contract.md` §Briefing snippet — the orchestrator unions them into ONE session-close footer. A dispatch that logs in, loads a state file, captures traffic (HAR, trace, network log) or dumps a database ALSO returns two session-material fields (`.agents/instructions/agent-orchestration-detail.md` "SESSION MATERIAL IN A DISPATCH"):
   - `secrets_materialized`: `none`, or the kinds and paths written (`storage state .auth/staging-admin.json`, `trace <evidence path>`), never the values.
   - `cleaned`: `yes` (nothing left outside `.auth/`), `kept-in-auth` (only the sanctioned store holds it), or `no (<reason>)`. The orchestrator treats `no` as a blocker and surfaces it; a missing field on such a dispatch counts as `no`.
7. **Rules** — constraints (relevant Critical Rules from `AGENTS.md`, project-specific guardrails, Git rules, env-selection rules). Two rules ride in component 7 of every dispatch they can bind (`AGENTS.md` §3 RULE REACHABILITY), because the executor never opens the reference that owns them:
   - **Decisions** (any dispatch that can meet a fork or a question for a person): run `agentic-qa-core/references/decision-protocol.md` before asking. Follow what the record settles, decide a technical call inside the approved plan and report it as DECIDED with the option it beat, and escalate only the four kinds of §5 (product behaviour, a new security posture, an irreversible or outward action, what the stage's "The person signs" column lists). A subagent escalates to the orchestrator, never to the user directly.
   - **Identity** (any dispatch that logs in, loads a state file or acts as a role): every role signs in through the app's own login only (UI form → `.auth/<env>-<role>.json`, or `bun run api:login --role <role>`). NEVER obtain a session through a service-role / admin key, an admin user-management API, a server-generated magic link or reset token, a locally signed JWT or a database session row; seeding test DATA through API / DB stays allowed. A check that seems to need a shortcut is a blocker to report. Canon: `agentic-qa-core/references/browser-sessions.md` §4.

## Filled template (skeleton)

```
Goal: <one sentence>

Context docs:
  - /abs/path/file1.md
  - /abs/path/file2.ts

Project Standards (auto-resolved):
  ## Skill: <slug>
  **Purpose**: <1-line>
  **Compact Rules**:
  - DO: <imperative>
  - DO NOT: <prohibition>
  - WHEN <condition>: <action>
  **Read full SKILL.md when**: <novel scenario>

  ## Skill: <other-slug>
  ... (orchestrator pastes one block per relevant skill, max 5)

Skills to load: /acli, /playwright-cli

Exact instructions:
  1. <step>
  2. <step>
  3. <step>

Report format:
  - <field>: <type>
  - <field>: <type>

Rules:
  - <Critical Rule reference>
  - <project guardrail>
  - Decisions: decision-protocol.md before any question; technical calls inside the plan are decided and reported, only the four §5 kinds escalate (to the orchestrator).
  - Identity (dispatch logs in or acts as a role): the app's own login only; never a service-role / admin key, admin user API, server-made magic link or reset token, locally signed JWT or DB session row (browser-sessions.md §4).
```

> The `Project Standards (auto-resolved)` section is built by the orchestrator from `.agents/skills/REGISTRY.md` (see `agentic-qa-core/references/skill-resolver.md` for the protocol). The subagent treats those bullets as authoritative for the listed conventions and skips re-reading full SKILL.md files unless the briefing explicitly says otherwise.

---

## Examples (one per pattern)

### Parallel — Download 3 CI artifacts in regression-testing

When a CI run finishes in `regression-testing` Stage 6, the orchestrator fans out THREE subagents in parallel — one per artifact type. They are independent (different artifact, different output dir), so Parallel is correct.

```
Goal: Download the Allure report artifact for run <<RUN_ID>> and unpack it into the local reports directory.

Context docs:
  - <<REPO_ROOT>>/.github/workflows/regression.yml
  - <<REPO_ROOT>>/.agents/skills/regression-testing/SKILL.md

Skills to load: (none — this is a pure gh CLI task)

Exact instructions:
  1. Run: gh run download <<RUN_ID>> -n allure-results -D ./allure-results-<<RUN_ID>>
  2. If the directory is empty after download, report a download failure and STOP (do not retry).
  3. Run: allure generate ./allure-results-<<RUN_ID>> -o ./allure-report-<<RUN_ID>> --clean
  4. Verify ./allure-report-<<RUN_ID>>/index.html exists.

Report format:
  {
    "artifact": "allure",
    "runId": "<<RUN_ID>>",
    "downloadDir": "./allure-results-<<RUN_ID>>",
    "reportDir": "./allure-report-<<RUN_ID>>",
    "fileCount": <number>,
    "status": "ok" | "download-failed" | "generate-failed"
  }

Rules:
  - Critical Rule #7 (Quality Verification): if generate fails, do not silently continue.
  - Do not delete prior allure-results-* directories — the orchestrator may diff runs.
```

The two sibling agents follow the same shape: one for `playwright-report` and one for `evidence/` (screenshots, traces, videos). All three dispatch in the same `<function_calls>` block so the network I/O overlaps.

### Background — Watch a GitHub Actions run in regression-testing

A regression run takes 20-60 minutes. The orchestrator dispatches ONE background subagent that blocks on `gh run watch` and notifies the main thread when the run terminates. Picked because the work is long-running, idle (no CPU on the orchestrator side), and monitorable from outside.

```
Goal: Block on `gh run watch <<RUN_ID>>` until the workflow run reaches a terminal state, then return the verdict.

Context docs:
  - <<REPO_ROOT>>/.github/workflows/regression.yml

Skills to load: (none — pure gh CLI)

Exact instructions:
  1. Capture start time as ISO-8601 (date -Iseconds).
  2. Run: gh run watch <<RUN_ID>> --exit-status (this blocks until terminal).
  3. Capture exit code (0 = success, non-zero = failure).
  4. Run: gh run view <<RUN_ID>> --json conclusion,status,startedAt,updatedAt -q '.'
  5. Compute duration in seconds (updatedAt - startedAt).
  6. Run: gh run view <<RUN_ID>> --log-failed | grep -E '^FAIL' | wc -l (best-effort failed-test count; 0 if no log).

Report format:
  {
    "runId": "<<RUN_ID>>",
    "status": "completed",
    "conclusion": "success" | "failure" | "cancelled" | "timed_out",
    "exitCode": <number>,
    "durationSeconds": <number>,
    "failedTestCount": <number>
  }

Rules:
  - Critical Rule #7: do not interpret failure types here. Classification belongs to the orchestrator's Analyze phase.
  - Do not retry the watch — if it errors, report and let the orchestrator decide.
```

### Sequential — Plan → Code → Review in test-automation

In `test-automation`, the three stages have a strict data dependency: Code reads what Plan wrote, and Review reads what Code wrote. Sequential is the only correct pattern.

```
Stage 1 — Plan agent
============================

Goal: Produce a feature-level test plan and an implementation plan for ticket <<ISSUE_KEY>> under .context/PBI/epics/EPIC-<<EPIC_KEY>>-<<EPIC_SLUG>>/stories/STORY-<<ISSUE_KEY>>-<<SLUG>>/.

Context docs:
  - <<REPO_ROOT>>/.context/PBI/qa-artifacts/master-test-plan.md
  - <<REPO_ROOT>>/.context/PBI/epics/EPIC-<<EPIC_KEY>>-<<EPIC_SLUG>>/module-context.md
  - <<REPO_ROOT>>/.context/PBI/epics/EPIC-<<EPIC_KEY>>-<<EPIC_SLUG>>/test-specs/ROADMAP.md
  - <<REPO_ROOT>>/tests/components/TestFixture.ts
  - <<REPO_ROOT>>/.agents/skills/test-automation/references/planning-playbook.md

Skills to load: /acli (to fetch the ticket), /xray-cli (to read existing TCs)

Exact instructions:
  1. Load the ticket via [ISSUE_TRACKER_TOOL] Get Issue: <<ISSUE_KEY>>.
  2. Read every doc in Context docs above.
  3. Determine fixture type per the rules in planning-playbook.md (api / ui / hybrid).
  4. List ATCs needed (one per equivalence partition).
  5. Write spec.md (test-level plan) and automation-plan.md (code-level plan) into the EPIC-level test-specs/<ID>/ folder.
  6. List the existing API/UI components that already cover any of these ATCs (no duplicates).

Report format:
  - specPath: absolute path to spec.md
  - automationPlanPath: absolute path to automation-plan.md
  - atcsListed: [{ id, name, fixture, equivalencePartition }]
  - reusedComponents: [{ path, atcsCovered }]
  - openQuestions: [...]

Rules:
  - Critical Rule #2 (Plan Before Coding): no test code yet. Stop after writing the plans.
  - Critical Rule #1 (credentials by NAME, never by value): if the plan needs credentials, reference the variable name, never open .env, print or hardcode a value.
  - KATA: ATC = mini-flow, NOT single interaction. ATCs do not call other ATCs.
```

(The Code agent and Review agent each receive the same shape, with different Goal / Skills / Instructions / Report fields. The orchestrator dispatches them ONE AT A TIME and feeds Stage N's report into Stage N+1's Context docs.)

### Single — One-shot file edit + verification

Sometimes there is exactly one task with no fan-out and no follow-up. Use Single when the task is non-trivial enough to deserve isolation but small enough not to need staging.

```
Goal: Add the standard Dependencies block to .agents/skills/test-documentation/SKILL.md and verify the markdown still renders cleanly.

Context docs:
  - <<REPO_ROOT>>/.agents/skills/agentic-qa-core/SKILL.md
  - <<REPO_ROOT>>/.agents/skills/test-documentation/SKILL.md

Skills to load: (none)

Exact instructions:
  1. Read test-documentation/SKILL.md.
  2. Insert the Dependencies block (per agentic-qa-core/SKILL.md §"Dependency declaration for downstream skills") immediately after the frontmatter, before the first H1.
  3. Run: bun run vars:check (must exit 0).
  4. Run: bun run types:check (must exit 0).

Report format:
  - filesChanged: [.agents/skills/test-documentation/SKILL.md]
  - lintExitCode: <number>
  - typeCheckExitCode: <number>
  - diff: <unified diff snippet>

Rules:
  - Critical Rule #8 (File Operations): preserve existing formatting and indentation.
  - Critical Rule #7 (Quality Verification): if either verification step fails, report and STOP — do not auto-fix.
```

---

## Anti-patterns (do NOT delegate)

- **Quick lookups (1-2 file reads)** — inline `Read` is faster, doesn't pay the subagent overhead.
- **Memory reads/writes** — orchestrator owns memory. Subagents never read or write persistent memory and never edit `AGENTS.md` or an instruction section. `AGENTS.md` (L0) loads by itself in every session; a subagent reads only the `.agents/instructions/` sections its briefing names.
- **Task tracking** (TaskCreate / TaskUpdate / progress files) — orchestrator owns tasks.
- **Asking the user for input** — only the orchestrator can prompt the user. A subagent that meets a question runs `decision-protocol.md` first: a technical call inside the approved plan is decided and reported as DECIDED with the option it beat, and only the four §5 kinds (product behaviour, a new security posture, an irreversible or outward action, what the stage or the owner reserves) stop the subagent and go back to the orchestrator.
  - Exception, supervised workers ONLY: for a §5 question, a persistent worker launched through `/orca-orchestration` sends its conductor a blocking `ask` over the run mailbox instead of stopping, and still never prompts the user (nobody is watching its terminal). Subagents keep stop-and-report for the §5 kinds.
- **Planning** — the orchestrator owns the plan and decides what to do next. Subagents execute the planned steps and decide only the technical calls inside them, reported as DECIDED.
- **Sleeping / polling** — if you would `sleep`, you probably wanted Background pattern instead.
- **Running tests on someone else's behalf** — verification is part of the same agent that made the change. Don't fan out a "verify" agent for a 1-step edit.

---

## Error protocol (mirrors AGENTS.md §3 Orchestration Mode)

If a subagent fails:

1. **STOP** — do not auto-retry.
2. Report full context to the orchestrator: which step failed, the error message, the partial output if any.
3. The orchestrator surfaces options to the user: **retry / skip / abort**.
4. Do NOT auto-fix without approval. The user may need to fix env config, restore credentials, or re-scope the task.
5. Pre-existing files written by failed subagents are NOT cleaned up automatically. The orchestrator decides whether to restore.

This protocol mirrors `AGENTS.md` §3 (Orchestration Mode). When in doubt, the live `AGENTS.md` is canonical.
