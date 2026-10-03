# Orchestration Doctrine

> **Mirror**: this file mirrors `AGENTS.md` §3 "Orchestration Mode — Permanently Active".
> If you change the doctrine, update both files. The root AGENTS.md is the canonical source.
> Rationale: subagents need to load this without pulling the full AGENTS.md into their context.

## Orchestration Mode — Permanently Active

> **Main conversation = command center. Subagents = executors.** Active EVERY session. Not optional.

**USE SUBAGENTS FOR**: reading/writing multiple files, MCP operations, research across repos, git operations, verification (tests/types/lint), multi-file edits, long-running tasks.

**DO NOT USE SUBAGENTS FOR**: quick lookups, memory reads/writes, task tracking, asking user, planning.

**TWO EXECUTORS**: one-shot subagents are the DEFAULT and nothing below changes for them. A second, OPTIONAL executor exists: the **supervised worker** — a persistent agent session coordinated through `/orca-orchestration` (conductor ↔ worker mailbox), gated on the orchestration binary AND a reachable runtime. When the gate fails the repo says NOTHING about it and the work runs on subagents plus the launch lines a human pastes.

| | One-shot subagent (default) | Supervised worker (optional) |
|---|---|---|
| Lifetime | inside the turn | until it is explicitly closed |
| Context | lost when it reports | persists; you keep talking to it |
| Communication | none until it finishes | ask / reply / send at any moment, both ways |
| Git | the orchestrator's index | own worktree, or the shared checkout under declared file ownership |
| Best for | reading, mapping, verifying; one-shot tasks | writing + integrating alone, a whole story, work the owner wants to step into |

The conductor keeps using SUBAGENTS for its own reads and verifications — that is what keeps the coordinating context clean. A supervised worker is warranted when the unit of work is a whole scope (one story, one module) that writes and integrates by itself. Every action on a worker is written as `[ORCHESTRATION_TOOL] <verb>: …` pseudocode; the HOW lives in `orca-orchestration/references/coordinator-playbook.md` and `orca-orchestration/references/worker-contract.md`.

**7-COMPONENT BRIEFING (MANDATORY every dispatch)**:

1. **Goal** — one sentence
2. **Context docs** — files to read first
3. **Project Standards (auto-resolved)** — compact rules pulled from `.agents/skills/REGISTRY.md` (built by `bun run skills:registry`). Subagents trust these as authoritative for listed conventions and DO NOT re-read full SKILL.md unless explicitly told to. Protocol: `agentic-qa-core/references/skill-resolver.md`
4. **Skills to load** — explicit (e.g. `/playwright-cli`)
5. **Exact instructions** — step-by-step, not vague goals
6. **Report format** — what to return (files changed, tests passed, blockers)
7. **Rules** — relevant Critical Rules to follow

**EXECUTION PATTERNS**:

| Pattern | When | Example |
|---|---|---|
| Parallel | Independent tasks | Read 3 context files at once |
| Sequential | Dependent tasks | Plan → Code → Test |
| Background | Long-running | Test suite + plan next ticket |
| Single | Simple task | One file edit + verification |

**VALUE PROVENANCE**: Rule #11 (scripts come from `package.json`) holds for EVERY project value. A claim about this project's configuration (an env URL, a Jira field id or transition slug, a git policy, a `playwright.config.ts` setting, a TMS modality) names the file it was read from, in the same turn. A value seen in a skill reference, a template, a worked example or another project's file is illustrative: never report it, brief it or test against it as this project's state. This is what keeps an orchestrator from briefing a worker with the example yaml of a reference instead of the project's own; it composes with Rule #16 (verify at the destination) and Rule #17 (prose names the source).

**RULE REACHABILITY**: an executor sees its briefing, the compact rules the resolver pasted into it, and the files the briefing names. It does NOT browse `references/`. A rule that must BIND the executor (a prohibition, a gate, a credential or evidence duty, a cleanup duty) therefore lives in all three places:

| Where | Why |
|---|---|
| owning `references/*.md` | the full text, with its reason and its edge cases |
| owning `SKILL.md` `## Compact Rules` | `bun run skills:registry` copies it into `REGISTRY.md`, so the resolver can paste it into a briefing (`./skill-resolver.md`) |
| component 7 (Rules) of the briefing | the dispatch that can trigger it carries it, even when its skill is not in component 3 |

A rule that exists only in a reference is documentation, not a constraint: the executor that needed it never read it. A new skill proves this at creation (`./skill-scaffold.md` §5).

**FAIL-CLOSED GATES**: a gate that opens on a value the gated agent wrote itself (a label it added in an earlier stage, a failure class it picked, a status it set) is open by construction: the agent passes its own gate by writing something plausible. A QA gate therefore opens on EVIDENCE, cited next to the value, that the agent cannot produce in the same run:

| A gate opens only when | It stays closed (the expensive path runs) when |
|---|---|
| the value comes with a citation a reader can check: a synced Jira body, a log line, run ids from CI history, an issue key, a test marker | the citation is missing, empty, a stub, or points at something this run created to satisfy the gate |
| the citation is the work product itself or comes from outside the gate's own decision (the ATP body an earlier stage published, CI, a person, a ticket that predates the run) | the only proof is a marker claiming the work happened (a label, a status, the agent's summary) |
| the actor writing the value is allowed to decide it | the decision belongs to another stage or to a person (the "person signs" column of `./stage-gates.md`): the agent may write only the closed value and hand the decision over |

The closed value is always the one that costs more work or blocks: the full planning flow instead of the short-circuit, REGRESSION instead of a non-blocking class. A closed gate that should have opened costs a re-run; an open gate that should have stayed closed ships an untested story or a regression, silently. Two QA gates written this way: the Shift-Left short-circuit (`sprint-testing/references/acceptance-test-planning.md` §0.0) and failure classification (`regression-testing/SKILL.md` Phase 2 Step 4). Several others were evidence-bearing from the start (FLAKY needs at least 5 runs of history, an ATR carries its Test Environment, a 1:N collapse needs a written justification). A new gate is reviewed against the table above before it ships, and as a binding rule it follows RULE REACHABILITY.

**SESSION MATERIAL IN A DISPATCH**: QA logs in on purpose (several roles, several environments), so it does not ban session material from disk: its sanctioned store is `.auth/`, gitignored, `chmod 600`, one writer per fleet (`./browser-sessions.md` §3, §7; tokens: `./api-testing-doctrine.md`). What the contract adds is accountability per dispatch:

- A dispatch that logs in, loads a state file, captures traffic (HAR, trace, network log) or dumps a database returns `secrets_materialized` and `cleaned` in its report (field values: `./briefing-template.md` component 6).
- Material written anywhere but `.auth/` (the session scratch, the evidence folder, the repo tree, a temp dir) is deleted before the report, or the report says `cleaned: no` with the reason, and the orchestrator surfaces that as a blocker.
- Material is never echoed into a report, plan, commit, PR or tracker comment.
- A trace or HAR attached as evidence is scrubbed first (`./evidence-conventions.md` §1): a Playwright trace carries request headers, cookies, storage and every typed value.

**ERROR PROTOCOL**: On subagent error → STOP, report full context, DO NOT fix without approval, offer retry/skip/abort.

**WORKFLOW SKILL COMPLIANCE**: every skill marked `metadata.stage_owner: true` in its frontmatter MUST have a `## Subagent Dispatch Strategy` section using the 7-component briefing. Every other skill (reference / utility / generator) is EXEMPT (no dispatch table needed); the split mirrors `AGENTS.md` §3.

**DEEP DETAIL** (further references):

- `.agents/skills/agentic-qa-core/references/briefing-template.md` — 7-component briefing examples per pattern
- `.agents/skills/agentic-qa-core/references/dispatch-patterns.md` — when to Single / Parallel / Sequential / Background
