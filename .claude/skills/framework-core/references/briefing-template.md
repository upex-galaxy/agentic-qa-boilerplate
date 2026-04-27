# Subagent Briefing Template

> Cited by: workflow skills (`sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `project-discovery`) when they delegate to a subagent.
> Format: every dispatch MUST fill the 6 components below.

## The 6 components

1. **Goal** — one sentence. What outcome the subagent must achieve.
2. **Context docs** — files the subagent reads before acting. Absolute paths.
3. **Skills to load** — skill triggers (e.g. `/acli`, `/xray-cli`, `/playwright-cli`) the subagent must invoke before issuing tool calls. The orchestrator never inlines tool syntax — that lives in the owning skill.
4. **Exact instructions** — numbered steps. No ambiguity. Each step names the tool / skill action.
5. **Report format** — what the subagent returns to the orchestrator. Either a JSON object with named fields, or a bullet list with explicit headings. Avoid free-form prose.
6. **Rules** — constraints (relevant Critical Rules from `AGENTS.md`, project-specific guardrails, Git rules, env-selection rules).

## Filled template (skeleton)

```
Goal: <one sentence>

Context docs:
  - /abs/path/file1.md
  - /abs/path/file2.ts

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
```

---

## Examples (one per pattern)

### Parallel — Download 3 CI artifacts in regression-testing

When a CI run finishes in `regression-testing` Stage 6, the orchestrator fans out THREE subagents in parallel — one per artifact type. They are independent (different artifact, different output dir), so Parallel is correct.

```
Goal: Download the Allure report artifact for run <<RUN_ID>> and unpack it into the local reports directory.

Context docs:
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/.github/workflows/regression.yml
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/.claude/skills/regression-testing/SKILL.md

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
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/.github/workflows/regression.yml

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

Goal: Produce a feature-level test plan and an implementation plan for ticket <<ISSUE_KEY>> under .context/PBI/<<MODULE>>/<<ISSUE_KEY>>-<<SLUG>>/.

Context docs:
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/.context/master-test-plan.md
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/.context/PBI/<<MODULE>>/module-context.md
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/.context/PBI/<<MODULE>>/test-specs/ROADMAP.md
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/tests/components/TestFixture.ts
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/.claude/skills/test-automation/references/planning-playbook.md

Skills to load: /acli (to fetch the ticket), /xray-cli (to read existing TCs)

Exact instructions:
  1. Load the ticket via [ISSUE_TRACKER_TOOL] Get Issue: <<ISSUE_KEY>>.
  2. Read every doc in Context docs above.
  3. Determine fixture type per the rules in planning-playbook.md (api / ui / hybrid).
  4. List ATCs needed (one per equivalence partition).
  5. Write spec.md (test-level plan) and implementation-plan.md (code-level plan) into the PBI folder.
  6. List the existing API/UI components that already cover any of these ATCs (no duplicates).

Report format:
  - specPath: absolute path to spec.md
  - implementationPlanPath: absolute path to implementation-plan.md
  - atcsListed: [{ id, name, fixture, equivalencePartition }]
  - reusedComponents: [{ path, atcsCovered }]
  - openQuestions: [...]

Rules:
  - Critical Rule #2 (Plan Before Coding): no test code yet. Stop after writing the plans.
  - Critical Rule #1 (Login Credentials): if the plan needs credentials, reference .env keys, never hardcode.
  - KATA: ATC = mini-flow, NOT single interaction. ATCs do not call other ATCs.
```

(The Code agent and Review agent each receive the same shape, with different Goal / Skills / Instructions / Report fields. The orchestrator dispatches them ONE AT A TIME and feeds Stage N's report into Stage N+1's Context docs.)

### Single — One-shot file edit + verification

Sometimes there is exactly one task with no fan-out and no follow-up. Use Single when the task is non-trivial enough to deserve isolation but small enough not to need staging.

```
Goal: Add the standard Dependencies block to .claude/skills/test-documentation/SKILL.md and verify the markdown still renders cleanly.

Context docs:
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/.claude/skills/framework-core/SKILL.md
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/.claude/skills/test-documentation/SKILL.md

Skills to load: (none)

Exact instructions:
  1. Read test-documentation/SKILL.md.
  2. Insert the Dependencies block (per framework-core/SKILL.md §"Dependency declaration for downstream skills") immediately after the frontmatter, before the first H1.
  3. Run: bun run lint:agents (must exit 0).
  4. Run: bun run type-check (must exit 0).

Report format:
  - filesChanged: [.claude/skills/test-documentation/SKILL.md]
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
- **Memory reads/writes** — orchestrator owns memory. Subagents must not read or write `CLAUDE.md` / `AGENTS.md` / persistent memory.
- **Task tracking** (TaskCreate / TaskUpdate / progress files) — orchestrator owns tasks.
- **Asking the user for input** — only the orchestrator can prompt the user. Subagents that hit a question must STOP and report.
- **Planning / decision-making** — the orchestrator decides what to do next. Subagents execute pre-decided steps.
- **Sleeping / polling** — if you would `sleep`, you probably wanted Background pattern instead.
- **Running tests on someone else's behalf** — verification is part of the same agent that made the change. Don't fan out a "verify" agent for a 1-step edit.

---

## Error protocol (mirrors AGENTS.md §Orchestration Mode)

If a subagent fails:

1. **STOP** — do not auto-retry.
2. Report full context to the orchestrator: which step failed, the error message, the partial output if any.
3. The orchestrator surfaces options to the user: **retry / skip / abort**.
4. Do NOT auto-fix without approval. The user may need to fix env config, restore credentials, or re-scope the task.
5. Pre-existing files written by failed subagents are NOT cleaned up automatically. The orchestrator decides whether to restore.

This protocol mirrors `AGENTS.md` §"Orchestration Mode (Subagent Strategy)". When in doubt, the live `AGENTS.md` is canonical.
