# Orchestration Doctrine

> **Mirror**: this file mirrors `AGENTS.md` §3 "Orchestration Mode — Permanently Active".
> If you change the doctrine, update both files. The root AGENTS.md is the canonical source.
> Rationale: subagents need to load this without pulling the full AGENTS.md into their context.

## Orchestration Mode — Permanently Active

> **Main conversation = command center. Subagents = executors.** Active in every session.

Use subagents for reading or writing multiple files, MCP operations, research across repos, git operations, verification (tests, types, lint), multi-file edits and long-running tasks. Keep quick lookups, memory reads and writes, task tracking, questions to the user and planning in the main conversation.

**A harness without subagents** (Pi ships none) runs the work inline, or uses a supervised worker when its gate allows. A brief that says "dispatch" still binds what the dispatch would have done, its report format included.

**Two executors.** One-shot subagents are the default, and nothing below changes for them. A second, optional executor is the supervised worker: a persistent agent session coordinated through `/agent-orchestration` (a conductor and worker mailbox), available only when the orchestration binary exists and a runtime is reachable. When that gate fails the repo says nothing about it, and the work runs on subagents plus the launch lines a human pastes.

| | One-shot subagent (default) | Supervised worker (optional) |
|---|---|---|
| Lifetime | inside the turn | until it is explicitly closed |
| Context | lost when it reports | persists; you keep talking to it |
| Communication | none until it finishes | ask / reply / send at any moment, both ways |
| Git | the orchestrator's index | own worktree, or the shared checkout under declared file ownership |
| Best for | reading, mapping, verifying; one-shot tasks | writing and integrating alone, a whole story, work the owner wants to step into |

The conductor keeps using subagents for its own reads and verifications, which keeps the coordinating context clean. A supervised worker earns its cost when the unit of work is a whole scope (one story, one module) that writes and integrates by itself. Every action on a worker is written as `[ORCHESTRATION_TOOL] <verb>: …` pseudocode. The how lives in `/agent-orchestration` (conductor cycle) and `/agent-orchestration` worker contract.

**7-COMPONENT BRIEFING (every dispatch has all seven)**:

1. **Goal**: one sentence
2. **Context docs**: files to read first
3. **Project Standards (auto-resolved)**: compact rules pulled from `.agents/skills/REGISTRY.md` (built by `bun run skills:registry`). Subagents trust these as authoritative for the conventions they list and do not re-read the full SKILL.md unless the briefing says to. Protocol: `agentic-qa-core/references/skill-resolver.md`
4. **Skills to load**: named explicitly (e.g. `/playwright-cli`)
5. **Exact instructions**: step by step, not vague goals
6. **Report format**: what to return (files changed, tests passed, blockers)
7. **Rules**: the relevant Critical Rules

**Execution patterns**:

| Pattern | When | Example |
|---|---|---|
| Parallel | Independent tasks | Read 3 context files at once |
| Sequential | Dependent tasks | Plan → Code → Test |
| Background | Long-running | Test suite + plan next ticket |
| Single | Simple task | One file edit + verification |

**VALUE PROVENANCE.** Rule #11 (scripts come from `package.json`) holds for every project value. A claim about this project's configuration (an env URL, a Jira field id or transition slug, a git policy, a `playwright.config.ts` setting, a TMS modality) names the file it was read from, in the same turn. A value seen in a skill reference, a template, a worked example or another project's file is illustrative: do not report it, brief it or test against it as this project's state. This keeps an orchestrator from briefing a worker with the example yaml of a reference instead of the project's own. It composes with Rule #16 (verify at the destination) and Rule #17 (prose names the source).

**Rule reachability.** An executor sees its briefing, the compact rules the resolver pasted into it, and the files the briefing names. It does not browse `references/`. A rule that must bind the executor (a prohibition, a gate, a credential or evidence duty, a cleanup duty) therefore lives in all three places:

| Where | Why |
|---|---|
| owning `references/*.md` | the full text, with its reason and its edge cases |
| owning `SKILL.md` `## Compact Rules` | `bun run skills:registry` copies it into `REGISTRY.md`, so the resolver can paste it into a briefing (`./skill-resolver.md`) |
| component 7 (Rules) of the briefing | the dispatch that can trigger it carries it, even when its skill is not in component 3 |

A rule that exists only in a reference is documentation, not a constraint, because the executor that needed it never read it. A new skill proves this at creation (`./skill-scaffold.md` §5).

**FAIL-CLOSED GATES.** A gate that opens on a value the gated agent wrote itself (a label it added in an earlier stage, a failure class it picked, a status it set) is open by construction: the agent passes its own gate by writing something plausible. A QA gate opens on evidence, cited next to the value, that the agent cannot produce in the same run:

| A gate opens only when | It stays closed (the expensive path runs) when |
|---|---|
| the value comes with a citation a reader can check: a synced Jira body, a log line, run ids from CI history, an issue key, a test marker | the citation is missing, empty, a stub, or points at something this run created to satisfy the gate |
| the citation is the work product itself or comes from outside the gate's own decision (the ATP body an earlier stage published, CI, a person, a ticket that predates the run) | the only proof is a marker claiming the work happened (a label, a status, the agent's summary) |
| the actor writing the value is allowed to decide it | the decision belongs to another stage or to a person (the "person signs" column of `./stage-gates.md`): the agent writes only the closed value and hands the decision over |

The closed value is the one that costs more work or blocks: the full planning flow instead of the short-circuit, REGRESSION instead of a non-blocking class. A closed gate that should have opened costs a re-run. An open gate that should have stayed closed ships an untested story or a regression, silently.

Two QA gates are written this way: the Shift-Left short-circuit (`sprint-testing/references/acceptance-test-planning.md` §0.0) and failure classification (`regression-testing/SKILL.md` Phase 2 Step 4). Several others carried evidence from the start (FLAKY needs at least 5 runs of history, an ATR carries its Test Environment, a 1:N collapse needs a written justification). Review a new gate against the table above before it ships, and when it is a binding rule, place it by RULE REACHABILITY.

**SESSION MATERIAL IN A DISPATCH.** QA logs in on purpose (several roles, several environments), so the doctrine does not ban session material from disk. Its sanctioned store is `.auth/`, gitignored, `chmod 600`, one writer per fleet (`./browser-sessions.md` §3, §7; tokens: `./api-testing-doctrine.md`). What the contract adds is accountability per dispatch:

- A dispatch that logs in, loads a state file, captures traffic (HAR, trace, network log) or dumps a database returns `secrets_materialized` and `cleaned` in its report (field values: `./briefing-template.md` component 6).
- Material written anywhere but `.auth/` (the session scratch, the evidence folder, the repo tree, a temp dir) is deleted before the report. When it is not, the report says `cleaned: no` with the reason, and the orchestrator surfaces that as a blocker.
- Material stays out of every report, plan, commit, PR and tracker comment.
- A trace or HAR attached as evidence is scrubbed first (`./evidence-conventions.md` §1): a Playwright trace carries request headers, cookies, storage and every typed value.

**Error protocol.** When a subagent errors, stop and report the full context. Do not fix anything without approval, and offer retry, skip or abort. With no person present, the conductor's brief answers the offer when it covers it. Otherwise the run reports the error and does nothing outward or irreversible (`./decision-protocol.md`).

**Workflow skill compliance.** Every skill marked `metadata.stage_owner: true` in its frontmatter has a `## Subagent Dispatch Strategy` section using the 7-component briefing. Every other skill (reference, utility, generator) is exempt and needs no dispatch table. The split mirrors `AGENTS.md` §3.

**Deep detail** (further references):

- `.agents/skills/agentic-qa-core/references/briefing-template.md`: 7-component briefing examples per pattern
- `.agents/skills/agentic-qa-core/references/dispatch-patterns.md`: when to use Single, Parallel, Sequential or Background
