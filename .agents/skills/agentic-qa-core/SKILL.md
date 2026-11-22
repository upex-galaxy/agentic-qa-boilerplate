---
name: agentic-qa-core
description: "Shared doctrine host for the QA skills. A skill loads the references/ files its ## Dependencies block names."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode, pi]
complementary_categories: [meta-skill]
metadata:
  kind: core
---

# Agentic QA Core: foundation reference host

`agentic-qa-core` is the shared reference library the workflow skills in this repo cite. Doctrine (briefing template, dispatch patterns, orchestration rules, skill composition tiers) lives here once instead of being copied into every `SKILL.md`.

A workflow skill (`shift-left-testing`, `sprint-testing`, `test-automation` and the rest) pulls the `references/*.md` files it needs on demand, and declares them in a `## Dependencies` block at its top so the AI knows what to load.

The skill is passive. It does not orchestrate workflows, generate files or bootstrap a target repo. The framework (skills, foundation files, scripts) ships as one repo and is adopted whole, as "Install model" below explains.

## Compact Rules

<!--
  Strategy A for scripts/build-skill-registry.ts, and load-bearing for
  correctness: without this section the builder falls through to Strategy B,
  which scrapes bare bullets and cannot see the `agentic-qa-core does not:`
  sentence that governs "Out of scope", so every prohibition below would ship
  into REGISTRY.md as a permission and from there into subagent briefings.
  Keep each rule self-contained: a rule that needs a preceding sentence to mean
  what it says will eventually be extracted without it.
-->

- Do not create, modify or delete any file while acting as `agentic-qa-core`. It is a passive reference library with no write path of its own.
- Do not write `.context/` artifacts here (that is `/project-discovery`), scaffold tests, fixtures or KATA components (`/test-framework-adaptation` and `/test-automation`), adapt the framework to a stack (`/test-framework-adaptation`), or sync OpenAPI schemas (`bun run api:sync`).
- Do not orchestrate a workflow or bootstrap a target repo from this skill. It hosts doctrine and the workflow skills execute it.
- When a workflow skill cites `agentic-qa-core/references/*.md`, load only the files that skill's `## Dependencies` block names, and never preload the whole reference set.
- When deriving test cases or coverage from acceptance criteria in any testing skill, read `references/test-design-doctrine.md` first.
- When filing any bug, defect or improvement, read `references/defect-management-doctrine.md` first.
- Use every credential, token or session file by name only (Critical Rule #1). Never open `.env*` (except `.env.example` and the committed `.env*.schema` files), `.auth/**` or `.claude/settings.local.json`. Never run `printenv`, `env`, `echo $SECRET`, `set -x` or `curl -v`. Check presence with `bunx varlock load --agent` and only against the committed schemas (`vars:schema:check` green; a scratch schema is banned, since `--agent` redacts only `@sensitive` items). Write a non-sensitive value the human asked for only with `bun run env:set KEY=value`, never by editing `.env`, and leave every secret value for the human to type. Forms, presence check and leak protocol: `references/secret-hygiene.md`.
- When dispatching a subagent, use the 7-component briefing in `references/briefing-template.md` and pick the pattern with `references/dispatch-patterns.md`. A subagent that must answer the user directly also loads `references/behavioral-layer.md`, because it inherits no register from the orchestrator.
- When a turn would end with small open items for the human (a decision, an unconfirmed assumption, an item left for later), the session the human types into (a top-level conductor, a super-conductor, an independent worker) asks all of them with the harness's own structured-question tool, in rounds at the tool's per-call limit until done, each with a recommended option, a free-text way out and a "Later" option. No tool, or a refused call, falls back to a numbered list. Heavy decisions (tradeoffs, architecture, larger changes) go to the `mkd` deck: weight decides, never the count. A session launched by another session (its prompt carries the fleet token `/<skill> <label> fleet worker`: a worker, or a middle conductor) never asks the human: no question tool, no `mkd` deck, no sweep. It sends the four escalation kinds and every blocker it cannot clear to its launcher (`ask`, `escalation`, or a `BLOCKED: ` status without a dispatch), which relays, unless the human typed that request into its own terminal or its brief grants it in writing (then it tells its launcher what it asked and the answer). Subagents and routines never ask: they list pendings in their report. Full: `references/decision-elicitation-doctrine.md` §0 and §7.
- When closing a workflow stage, verify that stage's Definition of Done in `references/stage-gates.md` before advancing.
- When about to ask a person to decide, or to pick between defensible options, run `references/decision-protocol.md` first. Search the record (session plan, `.session/decisions/`, ADRs, the synced ticket comments, Engram) and follow what is settled; decide a technical call inside the approved plan and report it as decided; escalate only product behaviour, a new security posture, an irreversible or outward action, and what the stage's "The person signs" column lists. An unattended routine parks those four and never assumes them.
- When a rule changes, edit the owning skill's `references/*.md`, then run `bun run skills:registry`, then refresh the deck under `packages/decks/agentic-qa-core/`. That order keeps prose, registry and decks from drifting.
- Treat this boilerplate as clone-in-full. A single skill copied in isolation lacks the foundation files it depends on and will not function.

**Read full SKILL.md when**: you need the full table of hosted references and who cites each one, the deck-hosting details, or the exact `## Dependencies` block shape to add to a skill.

---

## References hosted

| File | Cited by | Purpose |
|------|----------|---------|
| `references/test-design-doctrine.md` | `shift-left-testing`, `sprint-testing`, `test-documentation`, `test-automation` | Canonical doctrine for deriving test cases and ATCs from acceptance criteria: the 5 principles (AC-verify is not testing; the AC is a floor, not a ceiling; criterion vs test case; 1:N explode by default, justify a collapse; risk outside the criterion), the redefined coverage model, and the formal techniques (EP, BVA, State-Transition, Decision Tables, Pairwise, Error Guessing, Risk-based) with their triggers and the Test-Design Checklist gate. |
| `references/briefing-template.md` | `shift-left-testing`, `sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `project-discovery` | The 7-component subagent briefing template, with concrete filled examples per dispatch pattern. |
| `references/dispatch-patterns.md` | All workflow skills with a "Subagent Dispatch Strategy" section | Decision table + heuristic for picking Single / Sequential / Parallel / Background. |
| `references/stage-gates.md` | All workflow skills (`shift-left-testing`, `sprint-testing`, `exploratory-testing`, `test-documentation`, `test-automation`, `regression-testing`) | Definition-of-Done checklist per workflow stage. The orchestrator verifies each stage's DoD (planning stages include the Test-Design Checklist) before appending the progress checkpoint and advancing, which makes the doctrine an enforced gate. |
| `references/discovery-driven-doctrine.md` | `sprint-testing`, `exploratory-testing`, `test-documentation`, `test-automation`, `stage-gates.md`, `artifact-lifecycle.md` | The shared vocabulary for work with no Story: scope names (origin) vs Macro / Medium / Micro (size), the coverage Tech Story as the anchor of a Test with no Story, the oracle rule (`oracle: observed` never becomes Candidate), the execution outcomes PASSED / FAILED / NOT RUN with the observation rule and the blocking ladder, `automated` only on the production branch, MTP risk vs ROI, and how rules from another project are ported. |
| `references/adversarial-verification.md` | `exploratory-testing`, `sprint-testing` (`references/exploration-patterns.md`) | The refute mandate (a verifier tries to explain a finding away), the own-invariant check, executing competing hypotheses side by side, the main-thread tie-break, and the false-positive trap categories, and §6, the verifier that tries to refute a DECIDED answer before it is applied. |
| `references/orchestration-doctrine.md` | Subagents that need orchestration rules without pulling the whole `AGENTS.md` | Cacheable mirror of `AGENTS.md` §3 (Orchestration Mode). |
| `references/behavioral-layer.md` | Subagents that must answer the user directly, in any workflow skill | Cacheable mirror of `AGENTS.md` §2: Butler granularity, PM Voice register, Visual Mapping. A dispatched subagent inherits none of that from the orchestrator, so its report reads in a different voice unless it pulls this. |
| `references/skill-composition-strategy.md` | `framework-development`, every workflow skill | T1-T4 tier model, SDD boundary and composition contract. |
| `references/skill-resolver.md` | Skills that resolve composable skills at runtime via the registry | Skill Resolver Protocol used by sub-agent launches. Companion: `scripts/build-skill-registry.ts`, which writes `.agents/skills/REGISTRY.md`. |
| `references/preflight-gate.md` | `shift-left-testing`, `sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `framework-development` | Readiness Preflight Gate doctrine: probe tools, MCPs, CLIs and credentials and surface a user checklist before a skill starts its real work. Owns the secret and token handling and the OpenAPI `api-login`, then RESTART flow. |
| `references/mcp-capabilities.md` | `AGENTS.md` Rule #10 / §5 / §6, `preflight-gate.md` §8, every skill declaring `metadata.requires_capabilities` | The MCP capability vocabulary (`web-search`, `library-docs`, `db`, `api-schema`): tool-name suffixes that provide each one (a prefix is a server, a suffix is the capability, so a claude.ai connector or a user-level server qualifies), the committed `.mcp.json` server, how to enable a missing one per host, the frontmatter declaration + correspondence rule, and the point-of-use STOP (never a silent fallback). Mirrored by the `CAPABILITY-VOCAB` and `CAPABILITY-UNDECLARED` checks in `scripts/lint-skills.ts`. |
| `references/adr-doctrine.md` | `project-discovery`, `framework-development`, `sprint-testing`, `test-automation` | When a test-architecture decision earns an ADR (three-gate test: hard to reverse, surprising without context, a real trade-off), plus the detect, draft, record procedure. Test architecture = runner/framework choice, Page-Object vs Screenplay, fixture/data strategy, isolation & parallelization, auth-in-tests, selector contract, exploratory-vs-scripted boundary, reporting/CI sharding, flake-retry policy. |
| `references/api-testing-doctrine.md` | `sprint-testing`, `test-automation`, `test-documentation` | Canonical API-testing maneuver (agentic level, not KATA code): the three-tool split. The OpenAPI MCP reads the schema only (discover endpoints and schemas); `bun run api:login` only mints a token (into `.auth/tokens.env` as env var `API_TOKEN_<ROLE>_<ENV>` and `.auth/tokens.json` keyed `<ROLE>_<ENV>`; `--profile <name>` isolates both under `.auth/profiles/<name>/`); curl runs the authenticated call. Covers the schema-drift caveat (dev/latest vs target env), token-freshness checks, and the rule that shell env vars do not persist across the agent's Bash calls, so `source` per curl call. |
| `references/db-testing-doctrine.md` | `sprint-testing` (trifuerza DB leg), `test-automation` | Canonical DB-testing maneuver, sibling of the API one: DBHub MCP as `[DB_TOOL]` (tools named `{tool}_{source_id}`, so `execute_sql_primary` / `search_objects_primary`), `dbhub.toml` interpolating `${DBHUB_*}` from the launch environment, the `DBHUB_*` vars `.env.example` declares, the validation query cookbook (orphans, duplicates, numeric mismatch, timestamp windows, four strategies, checklist) and connection troubleshooting. |
| `references/mcp-atlassian-optin.md` | `acli`, `agentic-qa-onboard`, anyone enabling MCP-level Jira access or debugging `agents:compat:check` | The opt-in Atlassian MCP block for Claude / OpenCode / Codex / Pi (literal `JIRA_URL` from `bun run --silent jira:url`, secrets through the `.env` loader's `--filter` on every host) and the MCP parity contract (what the check compares and why nothing takes names from the host beside the loader). |
| `references/planning-ladder.md` | `sprint-testing`, `regression-testing`, `project-context`, `test-documentation`, the sync scripts | The ratified QA Planning Ladder: altitudes (MTP / FTP / STP / ATP / RTP and their Runs), the `{ACRONYM}: {scope}: {desc}` title grammar, the four QA-process Epics, items-over-fields, with the RTP/RTR amendments. |
| `references/defect-management-doctrine.md` | `sprint-testing`, `test-documentation`, `test-automation`, `regression-testing` | Canonical doctrine for filing and owning quality issues: Bug / Defect / Improvement classified by the FEATURE's lifecycle stage (not by where it was found), QA Assignee self-set and never overwritten, mandatory Components, the three-axis model (parent is the QA process epic, link is the source Story, components are the product module), the mandatory field matrix and the Severity to Priority derivation. |
| `references/traceability-linking.md` | `shift-left-testing`, `sprint-testing`, `test-documentation`, `regression-testing` | Turning declared traceability into real Jira issue links: Story to test-artifact coverage, Story to Bug causation, Story to Bug blocking, the `TC → ATS → Story` cascade, and the post-create verification recipe. Local declarations document intent; these links are what a consumer walking `issuelinks` actually reads. |
| `references/session-management.md` | Every long/medium workflow skill (Phase 0 resume check, Phase N archive) | The long-skill resume contract: plan-first persistence under `.session/<skill-slug>/<scope>/`, the per-stage progress checkpoint, resume detection after an interruption, and the topic-key conventions for artifact tagging. |
| `references/session-footer-contract.md` | Every skill explicitly marked in its metadata as the owner of a stage (`metadata.stage_owner: true`) | The chat-facing close-out contract: the two blocks the AI surfaces unprompted at session end (captured evidence paths; skills / MCPs / CLIs used + testing-pyramid levels touched, "none" stated per untouched level). Chat only, never a Jira comment or ATR body. |
| `references/evidence-conventions.md` | `sprint-testing`, `bug-screenshot-annotation`, `regression-testing`, and any subagent briefed to capture evidence | The shared three-bucket model for every file produced while testing, plus the naming contract. Prevents the two recurring failures: stray artifacts at the repo root, and "evidence" claimed in a report that never existed on disk. |
| `references/evidence-page.md` | old links only | A one-line pointer: the evidence page (pack format, build, publish, retest, privacy) is the `evidence-artifact` skill (ADR-0022). |
| `references/browser-sessions.md` | `sprint-testing`, `test-automation`, `bug-screenshot-annotation`, a fleet worker (`fleet-launch-seam.md` §5), any subagent that opens a browser with `/playwright-cli` | Canon for every browser session: the question before the first `open` (anonymous / SUT test user per role / owner's persistent profile / Agentic Pair Testing in the human's Chrome), named in-memory sessions, one state file per environment and role (`.auth/<env>-<role>.json`, credentials `<ENV>_<ROLE>_*`), owner profiles outside every repo as the only disk profiles (no per-ticket or per-worker profile), `testing.browser.pair_mode`, session material as a secret, the measured fleet mechanics (workspace scoping, `kill-all`, shared tabs on attach), and the cleanup of leftover daemon profiles (`bun run browser:profiles`). `/playwright-cli` owns the verbs; this owns which session and whose login. |
| `references/acli-integration.md` | Every skill that resolves `[ISSUE_TRACKER_TOOL]` / `[TMS_TOOL]` to `/acli` | The QA-side plug for the tool-agnostic `acli` skill: which slug, which status, which custom field, which modality. Load it before the tool surface: `acli/SKILL.md` answers how the binary works, this answers what to send it here. |
| `references/jira-publishing-gotchas.md` | Any skill about to publish to a Jira rich-text field (Story / Bug / Test body or custom field) | The Markdown to ADF conversion edges that produce an HTTP 400 at publish time, and how to pre-empt them. This is what breaks; `acli/references/adf-authoring-style.md` is what reads well. |
| `references/skill-refinement-protocol.md` | Every skill marked `metadata.stage_owner: true` in its frontmatter (session close), `skill-scaffold.md` | How a session PROPOSES a lesson for a skill instead of editing it: the four criteria (stable, not regenerable, changes behaviour, paid for), the `refinements.md` block schema, the apply matrix per skill owner, and the human gate per entry. |
| `references/skill-scaffold.md` | `framework-development` (the change IS a skill), `project-context` mode `context-skill` | The contract every new T1 skill is born with: frontmatter incl. `metadata.kind`, per-kind files + suffix + mandatory sections, the three-question test for context skills (`.context/` holds facts, the skill holds judgment, cite never copy), the minimal context-skill template and the Definition of Done. |
| `references/upstream-feedback.md` | Every skill marked `metadata.stage_owner: true` in its frontmatter (failure / blocker path), `skill-refinement-protocol.md` §4 | Filing a skill problem against the boilerplate: repo resolution order (`UPEX_TEMPLATE_REPO` → installer lock → local), the redacted draft, explicit OK before `gh issue create`, verification with `gh issue view`, the manual-filing fallback. |
| `references/artifact-lifecycle.md` | `shift-left-testing`, `sprint-testing`, `test-documentation`, `test-automation`, `regression-testing` | Which status every harness artifact is created in, which stage moves it where through which transition slug, and its terminal status. Covers assignee-at-create on every QA artifact, the unmapped-status fallback (list the live transitions, one question, fire the live id, recommend `bun run jira:sync-workflows`) and the light stage verifier every stage closes with. Load before firing any transition. |
| `references/decision-protocol.md` | `AGENTS.md` §2, `decision-elicitation-doctrine.md` §6, `stage-gates.md` §"Contract table", any skill about to ask a person to decide | Whether a question reaches a person: search the record first (QA sources: session plan, `.session/decisions/`, ADRs, synced ticket comments, Engram), follow what is settled, decide technical calls inside the approved plan and report them, escalate only four kinds (the fourth is the "The person signs" column of `stage-gates.md`), write every decision down. Also how QA treats AI product rulings found on a SUT's tickets: attributed record, never PO sign-off. |
| `references/question-research.md` | `decision-protocol.md` §1.1, `shift-left-testing` | The brief for a Question Research subagent that runs delegated: two profiles (product for the PO, technical for the Dev) with reading lists, the sources and `path:line` rule, and the `open-questions.json` shape with the `follow` / `decide` / `escalate` tiers. |
| `references/decision-elicitation-doctrine.md` | `agentic-qa-onboard`, `decision-protocol.md` §5, any skill that must ask the user to decide | How the harness asks a human to decide: the ladder from harness prompt to `mkd` decision deck to plan mode, the threshold (weight, never count: small decisions are swept in rounds with the harness question tool, heavy ones get a deck), the sweep (SPD) with its tool per harness and fallback, the non-silent gate and its fallback, and how to read the returned contract (a "did not understand" note means do not execute that item). |
| `references/secret-hygiene.md` | `AGENTS.md` Rule #1, every skill or subagent that touches a credential, token, `.env` or `.auth/**` | Canon for Critical Rule #1 (credentials by name, never by value): what counts as a secret, the files the AI never opens, the commands that print a value and their safe forms, the redacted presence check (`bunx varlock load --agent`), who writes which values into `.env` (the AI only through `bun run env:set`), the per-host deny rules with their measured limits, and the leak protocol. |
| `references/volatile-facts.md` | Every skill that writes or reviews committed prose (`framework-development`, `test-framework-adaptation`, `project-context`, `pr-review-lead`), `AGENTS.md` Rule #17, the two linters | Canon for Critical Rule #17: committed prose names the source of truth, never its current value. The five volatile categories (count, enumeration, `file:line`, current-state claim, edit-history narration) with one test each, the stable vocabulary that passes, the exemptions where a snapshot is the point, the forensic-note split (the why stays, the figure and date go to ADR-0006 or a dated ledger), and the `volatile-ok: <reason>` escape hatch the `FILE-LINE` / `CURRENT-STATE` lint checks honour. |

A skill that cites one of these files declares an `agentic-qa-core` Dependencies block at its top (shape below), so the AI loads this skill first.

---

## Core reference decks (visual, human-facing)

`agentic-qa-core` hosts the canonical presentations below under `packages/decks/agentic-qa-core/` (published on the GitHub Pages hub; see `agentic-qa-onboard` for the opening protocol):

| File | Teaches | Language |
|------|---------|----------|
| `naming-conventions.es.html` | The Naming Codex: every test-artifact title format across the seven layers (CASE · GROUP · CONTAINER · CODE · JIRA · GIT · FILESYSTEM), plus a coverage audit of open naming gaps. | Spanish (technical terms in English) |
| `skills-io-flow.es.html` | The E2E flow (Story, Refinement, Dev, Testing) seen through each skill's inputs and outputs: what every phase reads (stdin), which skills it loads (deps), what it produces (stdout), and which Jira fields and transitions it touches. Mac-terminal UI with one tab per phase. | Spanish (technical terms in English) |
| `output-style.es.html` | The chat-output contract the AI speaks under: the layer split (Butler granularity, PM Voice register, Visual Mapping form), what each layer owns, and the suspension triggers that switch the register to technical. | Spanish (technical terms in English) |

They mirror, for humans, rules that live in prose across the workflow skills' `references/*.md`. The Naming Codex answers "how is this artifact named", the skills-io deck "what does this skill need and emit", the output-style deck "why does the AI talk like that". Navigate with arrow keys (naming deck: `O` for overview, `F` for fullscreen; skills-io deck: tabs and `1-9`). Offer the matching deck when a user asks about naming or about how the skills chain together end to end.

The prose is the source. When a rule changes, edit the owning skill's `references/*.md`, regenerate `REGISTRY.md` (`bun run skills:registry`), then refresh the deck in `packages/decks/agentic-qa-core/`.

---

## Dependency declaration for downstream skills

A workflow skill that cites `agentic-qa-core/references/*.md` declares it so the AI knows what to load on demand. Add this block near the top of the skill's `SKILL.md`:

```markdown
## Dependencies
Requires `agentic-qa-core`. Loads on demand:
- agentic-qa-core/references/briefing-template.md
- agentic-qa-core/references/dispatch-patterns.md
```

The block is documentation: the AI reads it and pulls the cited files. Nothing wires it automatically, because skills are markdown, not code.

---

## Install model

The boilerplate is cloned in full. The workflow skills under `.agents/skills/` depend on foundation files at the repo root (`AGENTS.md`, `.agents/`, `scripts/`, `package.json`, `tests/`) and on the shared references here, so a skill directory copied alone lacks what it needs and will not function.

Someone who has only the skills clones the full repository and integrates it as one unit. This skill offers no per-skill scaffolding, because the skill set is inseparable from the foundation.

---

## Out of scope

`agentic-qa-core` does not:

- Create or modify any files.
- Create or modify `.context/` files (`/project-discovery`).
- Generate or scaffold tests, fixtures or KATA components (`/test-framework-adaptation` and `/test-automation`).
- Adapt the framework to a specific stack (`/test-framework-adaptation`).
- Sync AI-critical documents or project-specific facts in `AGENTS.md` (the docs follow-through of `/framework-development` in the boilerplate, `/test-framework-adaptation` Phase 9.3 in a project).
- Sync OpenAPI or API schemas (`bun run api:sync`).

Framework evolution (KATA bases, fixtures, `cli/`, `scripts/`, the `api/schemas/` pipeline) belongs to `/framework-development`.
