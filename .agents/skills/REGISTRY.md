# Skill Registry (auto-generated)

> Generated: `2026-11-16T01:07:08.891Z`
> Generator: `bun scripts/build-skill-registry.ts`
> Protocol: `.agents/skills/agentic-qa-core/references/skill-resolver.md`

This file is the per-session compact-rules cache for the Skill Resolver protocol.
The orchestrator copies one or more `## Skill: <slug>` blocks below into every subagent briefing under `## Project Standards (auto-resolved)`.
Subagents trust those compact rules and only read the full SKILL.md when explicitly instructed.

Skills indexed: 29

---
## Skill: acli

**Purpose**: Atlassian CLI (`acli`) for Jira, Confluence and org admin from a terminal.

**Compact Rules**:
- Pass `--paginate` (or an explicit `--limit`) on any search whose result is counted, iterated or decided on. Pagination is opt-in and truncation is silent: there is no warning.
- Exit 0 does not prove a subcommand exists. An unknown subcommand falls back to the parent help and exits 0, so check that the help body actually changed. Every multi-word flag is kebab-case; do not invent flags.
- Verify auth status before any bulk mutation (`acli jira auth status`). Auth is per product (jira, confluence, admin and global are separate sessions), and a silent expiry leaves the batch half-applied with no clean rollback (anti-pattern T4).
- Pass the non-interactive confirmation flag on every mutating command in CI, or the command hangs waiting on stdin.
- Author rich text in Markdown, convert it with `scripts/md-to-adf.ts` and pass the ADF (anti-pattern T1). The CLI never converts Markdown and stores the literal characters, and hand-written ADF trips the combined-marks bug.
- Let the converter's validation gate run on every ADF document before publishing, and read the field back after writing. The gate catches node-level errors; only the read-back catches Jira's silent server-side coercion.
- Measure the serialized ADF of every rich-text value (description, comment, rich-text custom field) before writing it: `jq -c . <file>.adf.json | wc -m` must stay at or under 30000 (T5). Jira's cap counts the ADF JSON, which is several times longer than the Markdown. Over budget means stop and propose which sections move where; truncating, or splitting one value across two fields or comments, is off the table. Detail: "Size budget" under "Publishing rich text".
- `workitem edit` takes no custom-field values. It hard-rejects every shape with exit 1, so editing a custom field on an existing item works only through the REST PUT path (anti-pattern T3).
- `workitem edit` does not set COMPONENTS either: there is no flag and no `--from-json` key, so the edit succeeds and leaves components untouched without saying so. Set them at create time, or change them through the same REST PUT path.
- The vendor's own `--help` examples are not safe to copy. Several omit the subcommand the flags live on (`workitem comment --key …` instead of `workitem comment create --key …`) and fail with `unknown flag`. The forms in this skill's references are the tested ones.
- Resolve a `customfield_NNNNN` id through the host project's slug catalog instead of hardcoding it in a script or generated output (T2). Ids differ per workspace; slugs travel.
- The Atlassian host lives in `.agents/project.yaml` under `issue_tracker.atlassian_url` and is read through the accessor. An environment copy goes stale and points scripts at the wrong site.
- Creating an issue link: `--out` and `--in` are empirically inverted against Jira's semantics. `--out` takes the prerequisite, `--in` the dependent. List the link afterwards to verify the direction, and delete and recreate it with swapped flags if it landed backwards.
- Capture and surface the trace id from any backend failure. It is the only debug signal, and Atlassian Support needs it.
- Known blind spots (enumerating custom fields, editing custom-field values, workflows, issue types, versions, components, attachments, watchers, adding an item to a sprint) go through REST or the opt-in Atlassian MCP, not through forcing the CLI.
- A REST fallback that needs `ATLASSIAN_EMAIL` and `ATLASSIAN_API_TOKEN` runs inside the `.env` loader (`bunx varlock run --filter ATLASSIAN_EMAIL,ATLASSIAN_API_TOKEN -- sh -c '...'`) or through a bundled script that loads `.env` itself (`scripts/jira-attach-media.ts`). Exporting them, running `source .env` or printing them in the agent's shell is off the table.
- Prefer API-token auth in scripted contexts, and pin the binary to an explicit version in production pipelines: tracking `latest` has caused same-day mass failures.

**Read full SKILL.md when**: composing a specific command, publishing rich text, running the REST PUT workaround, or working any surface outside Jira work items.

> Source: `.agents/skills/acli/SKILL.md` · phase: `unknown` · kind: `utility` · extraction strategy: A

---

## Skill: agentic-qa-core

**Purpose**: Shared doctrine host for the QA skills.

**Compact Rules**:
- Do not create, modify or delete any file while acting as `agentic-qa-core`. It is a passive reference library with no write path of its own.
- Do not write `.context/` artifacts here (that is `/project-discovery`), scaffold tests, fixtures or KATA components (`/test-framework-adaptation` and `/test-automation`), adapt the framework to a stack (`/test-framework-adaptation`), or sync OpenAPI schemas (`bun run api:sync`).
- Do not orchestrate a workflow or bootstrap a target repo from this skill. It hosts doctrine and the workflow skills execute it.
- When a workflow skill cites `agentic-qa-core/references/*.md`, load only the files that skill's `## Dependencies` block names, and never preload the whole reference set.
- When deriving test cases or coverage from acceptance criteria in any testing skill, read `references/test-design-doctrine.md` first.
- When filing any bug, defect or improvement, read `references/defect-management-doctrine.md` first.
- Use every credential, token or session file by name only (Critical Rule #1). Never open `.env*` (except `.env.example` and the committed `.env*.schema` files), `.auth/**` or `.claude/settings.local.json`. Never run `printenv`, `env`, `echo $SECRET`, `set -x` or `curl -v`. Check presence with `bunx varlock load --agent` and only against the committed schemas (`vars:schema:check` green; a scratch schema is banned, since `--agent` redacts only `@sensitive` items). Write a non-sensitive value the human asked for only with `bun run env:set KEY=value`, never by editing `.env`, and leave every secret value for the human to type. Forms, presence check and leak protocol: `references/secret-hygiene.md`.
- When dispatching a subagent, use the 7-component briefing in `references/briefing-template.md` and pick the pattern with `references/dispatch-patterns.md`. A subagent that must answer the user directly also loads `references/behavioral-layer.md`, because it inherits no register from the orchestrator.
- When a turn would end with small open items for the human (a decision, an unconfirmed assumption, an item left for later), the session the human types into (a top-level conductor, a super-conductor, an independent worker) asks all of them with the harness's own structured-question tool, in rounds at the tool's per-call limit until done, each with a recommended option, a free-text way out and a "Later" option. No tool, or a refused call, falls back to a numbered list. Heavy decisions (tradeoffs, architecture, larger changes) go to the `mkd` deck: weight decides, never the count. A session launched by another session (its prompt carries the fleet token `/<skill> <label> fleet worker`: a worker, or a middle conductor) never asks the human: no question tool, no `mkd` deck, no sweep. It sends the four escalation kinds and every blocker it cannot clear to its launcher (blocking `ask`, `escalation`, or a `BLOCKED: ` status without a dispatch), which relays, unless the human typed that request into its own terminal or its brief grants it in writing (then it tells its launcher what it asked and the answer). Subagents and routines never ask: they list pendings in their report. Full: `references/decision-elicitation-doctrine.md` §0 and §7.
- When closing a workflow stage, verify that stage's Definition of Done in `references/stage-gates.md` before advancing.
- When about to ask a person to decide, or to pick between defensible options, run `references/decision-protocol.md` first. Search the record (session plan, `.session/decisions/`, ADRs, the synced ticket comments, Engram) and follow what is settled; decide a technical call inside the approved plan and report it as decided; escalate only product behaviour, a new security posture, an irreversible or outward action, and what the stage's "The person signs" column lists. An unattended routine parks those four and never assumes them.
- When a rule changes, edit the owning skill's `references/*.md`, then run `bun run skills:registry`, then refresh the deck under `packages/decks/agentic-qa-core/`. That order keeps prose, registry and decks from drifting.
- Treat this boilerplate as clone-in-full. A single skill copied in isolation lacks the foundation files it depends on and will not function.

**Read full SKILL.md when**: you need the full table of hosted references and who cites each one, the deck-hosting details, or the exact `## Dependencies` block shape to add to a skill.

> Source: `.agents/skills/agentic-qa-core/SKILL.md` · phase: `unknown` · kind: `core` · extraction strategy: A

---

## Skill: agentic-qa-onboard

**Purpose**: Onboards a newcomer to this QA repo: the stack, the IQL stages, MCPs and env vars, then hands off to the right skill.

**Compact Rules**:
- The skill is a tour, not an executor. It ends the moment the user knows which skill to call; hand off there and step back.
- Leave the downstream work to its owner: pre-sprint refinement is `/shift-left-testing`, per-ticket QA `/sprint-testing`, TMS authoring `/test-documentation`, automated tests `/test-automation`, suite runs `/regression-testing`, a new target repo `/project-discovery`, KATA adaptation `/test-framework-adaptation`.
- When someone is lost or asks how a skill works, drop the terse working register for the whole explanation: full sentences, a warm tone, each technical term defined the first time it appears. Go back to the normal register once they are oriented.
- Explain in the user's language. The visual decks are Spanish (technical terms stay English); every deck also has an English twin, `<name>.en.html`, next to the Spanish file (same slides, same shell). For an English speaker, offer the twin.
- When the goal is unclear, ask one question first (testing a ticket, or understanding the whole flow?). Someone who asked about one stage does not need all of them.
- Name a stage by its word (Shift-Left, Planning, Execution, Reporting, Documentation, Automation, Regression, Observation), never by number. A "Stage N" in an older doc resolves through `agentic-qa-core/references/stage-gates.md`; the why behind the stages is `iql-context`.
- When someone asks about running several sessions at once ("parallelize the sprint", "one session per story", "fleet", "launch workers"), explain the two executors in plain words (a one-shot subagent lives inside the current turn and is the default for almost everything; a supervised worker is a persistent session you keep talking to), then hand off to `/orca-orchestration`. Its deck is `packages/decks/orca-orchestration/how-it-works.es.html` (English twin: `how-it-works.en.html`).
- Explain the concept and why it matters before any command, flag or file path.
- Ask before opening a how-it-works deck, because it launches the user's default browser. Open exactly one, then let them come back with questions before offering the next.
- Prefer the published GitHub Pages URL over the local file: a project scaffolded from this boilerplate may not carry the HTML. Use the local copy offline or on explicit request.
- Route a brand-new project through the ordered 4-phase setup path (foundation, Jira catalogs, discovery + adapt, git Strategy Setup). The joining-an-adapted-project checklist covers phase 1 only.
- State a Jira status or transition only from `.agents/jira-workflows.json`. A status that is not in that file does not exist in the instance.
- Library-docs questions go to Context7, troubleshooting to the `web-search` capability (a harness-level server), ticket WRITES to `/acli`, and detailed ticket READS (custom fields, ACs, ATP/ATR, comments) to the Jira sync script, whose synced `.md` is what you read.
- Leave the stack as it is. Playwright + KATA + Allure + TypeScript + bun is locked, and KATA is Playwright-specific: a project that needs another runner should not start from this boilerplate.

**Read full SKILL.md when**: walking the full 4-phase new-project setup, listing env vars or MCPs in detail, or answering which deck covers a given topic.

> Source: `.agents/skills/agentic-qa-onboard/SKILL.md` · phase: `bootstrap` · kind: `workflow` · extraction strategy: A

---

## Skill: bug-screenshot-annotation

**Purpose**: Annotates a bug screenshot with circles, arrows, callouts and a corner badge, rendered locally.

**Compact Rules**:
- Keep every QA screenshot off external image services, generative or not: real product and customer data is in the frame. A user's authorization in chat does not lift this. Everything renders locally, over a loopback HTTP server and a local browser capture.
- Annotate when a bug is visual or positional (overlap, misalignment, wrong date or offset on an axis, an element in the wrong place) and a raw screenshot would need a paragraph to explain it. Do not use this skill to file the bug, or on before/after shots that already read clearly raw.
- Work from a screenshot that already exists on disk. The skill overlays shapes; it never generates or edits an image from a text description.
- Produce exactly one evidence file: the final annotated PNG in the ticket's `evidence/` folder, named `{KEY}-BUG-{BUG-KEY}-annotated.png`. The crop and the annotation HTML are scratchpad working files, never written to `evidence/` and never cited from a ticket.
- Copy the commented overlay blocks from `references/shapes.html` instead of designing from scratch, and keep its z-index scale (base image, shapes, callout boxes, corner badge topmost) and its utf-8 meta tag. A copied block that drops either produces a hidden badge or mojibake.
- Serve the annotation HTML over loopback HTTP, never `file://` (the browser-automation CLI refuses it before rendering), and kill that server before the session ends.
- Size the capture viewport equal to or larger than the HTML canvas. A smaller viewport clips callouts.
- Read the rendered PNG back and expect at least one adjustment pass (move a circle, rewrap callout text, nudge the badge out of a collision). It is not one-shot.
- State the final PNG's repo-relative path in chat the moment it lands, unprompted, and repeat it leading the "Bug annotations" group in the session-close screenshot list.
- Offer the annotated PNG for the bug issue and let the human confirm before publishing. Once published it leads the bug's Evidence section, ahead of the raw capture.
- When the ticket has an evidence page (the `evidence-artifact` skill), the page keeps marks as data, one page per ticket and per bug. Link it, and keep this PNG only where a tracker needs an inline image.

**Read full SKILL.md when**: building the annotation HTML, choosing shape types, or handling a case the local render cannot cover (e.g. a photo of physical signage that would need anonymization).

> Source: `.agents/skills/bug-screenshot-annotation/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: A

---

## Skill: business-api-context

**Purpose**: The business meaning of the system's API: endpoint groups, callers, auth, flows, errors, integrations.

**Compact Rules**:
- Read the map through `bun run context:map business-api-context` (or `--section <id>` for one endpoint group). Skip `references/business-api-map.html` raw: its SVG is most of the bytes and none of the facts.
- A placeholder map means there is no map. Say so and hand the user `project-context` mode `api`, so nobody mistakes an empty map for an empty API.
- Take field names, types and required flags from the schema (`[API_TOOL]` schema read, `api/schemas/`) and the meaning from the map. When they conflict, the schema wins for shape and the running API wins for behaviour.
- When a session observes something that contradicts a section (a status, a field, an auth rule), propose the one-section edit with its evidence to the user, or to the conductor when you are a supervised worker, and apply it only on approval. Procedure: `references/refresh.md`.
- Write only inside this skill's own `references/`. Jira, `.context/`, other skills, `api/schemas/` and product code are out of scope, because this skill owns one map and nothing else.
- Keep map content out of this SKILL.md. Judgment goes in `## Rules` or `references/gotchas.md`, dated and measured.
- Before a step that uses `api-schema` (verifying a section) or `diagrams` (redrawing a figure), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8.

**Read full SKILL.md when**: building a briefing for an API-level dispatch, deciding whether a section is stale, or proposing an edit to the map.

> Source: `.agents/skills/business-api-context/SKILL.md` · phase: `unknown` · kind: `context` · extraction strategy: A

---

## Skill: business-data-context

**Purpose**: The system under test at the data level: entities, relationships, state machines, triggers, cron jobs, webhooks, integrations.

**Compact Rules**:
- Read the map through `bun run context:map business-data-context` (or `--section <id>` for one entity or flow). Skip `references/business-data-map.html` raw: its SVG is most of the bytes and none of the facts.
- A placeholder map means there is no map. Say so and hand the user `project-context` mode `data`, so nobody mistakes an empty map for an empty system.
- Cite a fact with its section id and `data-updated` date. A section older than the code it describes is a hypothesis to check with `[DB_TOOL]`, not an answer.
- When a session observes something that contradicts a section, propose the one-section edit with its evidence to the user, or to the conductor when you are a supervised worker, and apply it only on approval. Procedure: `references/refresh.md`.
- Write only inside this skill's own `references/`. Jira, `.context/`, other skills and product code are out of scope, because this skill owns one map and nothing else.
- Keep map content out of this SKILL.md. A rule for reading the data goes in `## Rules` or `references/gotchas.md`, dated and measured.
- Before a step that uses `db` (verifying a section) or `diagrams` (redrawing a figure), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8.

**Read full SKILL.md when**: building a briefing for a DB-level dispatch, deciding whether a section is stale, or proposing an edit to the map.

> Source: `.agents/skills/business-data-context/SKILL.md` · phase: `unknown` · kind: `context` · extraction strategy: A

---

## Skill: business-domain-context

**Purpose**: Business vocabulary of the system under test: what the product is for, who pays, and what each domain term means.

**Compact Rules**:
- Read the map through `bun run context:map business-domain-context`, or add `--section term-<slug>` for one term. The raw `references/business-domain-map.html` is generated markup, so the reader is the only way in.
- A placeholder map means there is no glossary. Say so and hand the user `project-discovery` Phase 1. Test cases and ACs named in invented vocabulary mislead the whole team.
- Use the business term the map gives, and quote the UI label when a step talks about the screen. The code identifier belongs in code and selectors, not in a TC title or a bug summary.
- When a session observes a term the map lacks, or a label or meaning that contradicts a section, propose the one-section edit with its evidence to the user (to the conductor when you are a supervised worker) and apply it only on approval. Procedure: `references/refresh.md`.
- Write only inside this skill's own `references/`: no Jira, no `.context/`, no other skill, no test code, no product code.
- Keep map content out of this SKILL.md. Judgment goes in `## Rules` or `references/gotchas.md`, dated and measured.
- Figures are optional here because the glossary is tables. Before a step that draws one, run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8.

**Read full SKILL.md when**: building a briefing for an ATP, TC naming or AC refinement dispatch, deciding whether a term is stale, or proposing an edit to the map.

> Source: `.agents/skills/business-domain-context/SKILL.md` · phase: `unknown` · kind: `context` · extraction strategy: A

---

## Skill: business-e2e-context

**Purpose**: Knowledge of how people use the product end to end: personas, user journeys, the feature catalog and cross-feature flows.

**Compact Rules**:
- Read the map through `bun run context:map business-e2e-context` (or `--section <id>` for one journey or feature). Do not read `references/business-e2e-map.html` raw: its SVG is most of the bytes and none of the facts.
- A placeholder map counts as no map. Say so and hand the user `project-context` mode `e2e`; do not plan E2E coverage as if the product had no journeys.
- Start from the journey, then the feature. A story is tested inside the journey that reaches it; the feature catalog answers "what exists", the journeys answer "what a user does and where it breaks".
- When a session observes something that contradicts a section (a step, a branch, a state the UI shows), propose the one-section edit with its evidence to the user, or to the conductor when you are a supervised worker, and apply it only on approval. Procedure: `references/refresh.md`.
- Write only inside this skill's own `references/`: no Jira, no `.context/`, no other skill, no test code, no product code.
- Keep map content out of this SKILL.md. Judgment goes in `## Rules` or `references/gotchas.md`, dated and measured.
- Before a step that uses `diagrams` (redrawing a figure), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8.

**Read full SKILL.md when**: building a briefing for a UI or E2E dispatch, scoping a smoke or regression run, deciding whether a section is stale, or proposing an edit to the map.

> Source: `.agents/skills/business-e2e-context/SKILL.md` · phase: `unknown` · kind: `context` · extraction strategy: A

---

## Skill: evidence-artifact

**Purpose**: Builds a ticket's test evidence into one private claude.ai page (an Artifact) from a JSON evidence pack.

**Compact Rules**:
- Load this skill in any dispatch whose stage captures evidence (sprint-testing Stage 2) or reports it (Stage 3, filing a bug). Append every proof to `<PBI>/evidence/evidence-pack.json` as you test, because a pack rebuilt from memory at the end loses what the screen showed.
- Take marks from the element's box via `playwright-cli eval` (`coords: "px"`). Read a screenshot back to place a mark only when no element reaches it.
- A mark does not mask anything, since viewers can toggle marks off. Personal data on screen goes in the image's `redact` boxes, which the build burns into the pixels.
- Keep a trace, a HAR, a token, a cookie and an `.auth` file out of every pack. Write credentials in API/SQL text as `<redacted>`; the build refuses the rest and names the field.
- Give a bug its own pack (`evidence-pack-<BUG>.json`, `kind: "bug"`, a `repro` case) once the bug issue exists. Build and publish bug pages before the story page: a story's `RETEST PASSED` / `RETEST FAILED` bug card is refused unless the bug's own pack confirms it.
- Build with `bun run evidence build --pack <pack>`. It needs Python 3.9+ and Pillow and names the one thing to install when either is missing.
- Publish with the Artifact tool. When the pack already has `artifact.url`, run `Artifact action: "read"` on it first and publish with that `url`; omitting `url` mints a second page and orphans every link.
- Record the URL with `bun run evidence record --pack <pack> --url <url>` and on the board (`bun run board evidence-artifact <KEY> <url> [--bug <BUG>] --by worker`), add it to the issue with `bun run evidence link --pack <pack>`, then link it from the ATR, the bug description, the QA comment footer and each TC's notes.
- Embed a bug's ONE thumbnail with `bun run evidence attach --pack <bug pack>` (`--dry-run` first prints every call), after the bug page link is in its Description. Write "(image embedded below)" and pass `bun run board bug ... --evidence-embedded` only once a live run printed `read-back OK`; a dry run never does.
- Run `bun run evidence attach --replace` only with a person's OK. It deletes the bug's earlier thumbnail attachment, which cannot be undone, and `attach` refuses on its own when an earlier thumbnail (same name, other bytes) is there.
- On a retest, keep every earlier case and item with its `round`, set `currentRound` and `rounds[]`, append the retest case, and republish to the SAME URL. A retest never passes on a DEFERRED case.
- Report the URLs as published private for the owner to share. When the Artifact tool is unavailable, report the pack path instead and the conductor publishes.
- Send evidence to no external image service, whatever the chat authorises (`references/privacy.md`).

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/evidence-artifact/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: A

---

## Skill: exploratory-testing

**Purpose**: Exploratory testing of a flow, a module or the whole app without a ticket, hunting bugs and test candidates across UI, API and DB.

**Compact Rules**:
- Entry is by scope, never by ticket: a flow, a module or a sweep. A named ticket key routes to `sprint-testing`. The mode comes from the first `$ARGUMENTS` token (`flow` | `module` | `sweep`), or from a request that clearly names one flow, one module or a sweep (args-as-answers); otherwise ask.
- Five steps in this order: Charter (main thread), Recon (Parallel), Refute (Parallel), Tie-break (main thread), Handoff (main thread). Planning and tie-breaks stay on the main thread. Present the charter and get it confirmed before any Recon dispatch, unless the request already named the scope and said go.
- Build the coverage view before Recon: the gap list of `project-context` mode `coverage` when it exists, else `coverage-view.json` from `kata-manifest.json` plus the TMS Tests read by `bun run context:coverage collect` (not by `jira:sync-issues`, because Tests are `sync: never`). A TMS that was not read is stated as `TMS not read`, and no manual cover counts. Mark every candidate NEW, WEAK or COVERED. Only a counted `exercises` cover makes COVERED; a `weak`, stale or unverified cover never dedupes a candidate away.
- Compare at least 2-3 rows plus a control group before calling anything anomalous, and state the detection query verbatim.
- Refute mandate: every Medium+ anomaly gets a Parallel verifier told to REFUTE it (join fan-out, data quirk, intended behaviour, harness artifact). It survives only if it cannot be explained away. Check a row's own invariant, not just that it differs from another row, and execute competing hypotheses side by side instead of inferring them. Canon: `agentic-qa-core/references/adversarial-verification.md`.
- Verifier disagreement goes to a main-thread tie-break: a decisive query plus a direct read of the live code path. Never settle it with a third verifier or an average, and never let one agent's verdict stand alone on a data-integrity, money or security finding.
- Oracle: behaviour with no AC is `oracle: observed`. "Is this intended?" goes to a person (decision-protocol kind 1): a batch through the `mkd` deck, a single question through the question tool. `oracle: confirmed` (who, where, when) makes the observation PASSED; `not intended` makes it FAILED and a proposed defect. Canon: `agentic-qa-core/references/discovery-driven-doctrine.md` §4.
- A candidate is PASSED or FAILED only when observed in the environment its precondition names. A code read, unit test, green CI or another environment leaves it NOT RUN with exactly one reason, BLOCKED or DEFERRED (execution), and it climbs the blocking ladder. With no coverable yet, its follow-up lives on the coverage Tech Story once approved, and until then as an item of the Handoff deck. Canon: `agentic-qa-core/references/discovery-driven-doctrine.md` §5.
- Never call anything that sends, notifies or pushes downstream; reads and previews are fine. A project's own list (`## Never-call endpoints` in `agent-project.md`) goes verbatim into briefing component 7.
- Mutate only to set up a precondition, within the charter's budget. Record every created row in `created_rows` the moment it exists; cleanup re-reads each one (a delete's response code is not proof).
- A person signs every write: each bug (`sprint-testing/references/reporting-templates.md` §1, gate §1.12, classified per `defect-management-doctrine.md` Part 1), each coverage Tech Story (`discovery-driven-doctrine.md` §3), each module-context write. This skill creates no Test and scores no ROI.
- Evidence that reaches a person goes through the `evidence-artifact` skill; raw captures stay in the session `evidence/` until a coverable exists.
- On any subagent failure, stop, report which surface or finding failed, and offer retry, skip-surface or abort. A skipped surface is recorded as "not covered this round", never dropped silently. A skill that itself broke is reported upstream per `agentic-qa-core/references/upstream-feedback.md`.

**Read full SKILL.md when**: starting a round cold, resuming a session, or handling a sweep, a tie-break or a Handoff not covered by the rules above.

> Source: `.agents/skills/exploratory-testing/SKILL.md` · phase: `unknown` · kind: `workflow` · stage owner · source: frontmatter `compact_rules` (verbatim)

---

## Skill: framework-development

**Purpose**: Evolve the QA boilerplate itself: KATA bases, fixtures, installer, scripts, OpenAPI pipeline, skills and instruction files.

**Compact Rules**:
- Use this skill for the architectural surface only. Test writing is `/test-automation`, manual QA is `/sprint-testing`, TMS docs are `/test-documentation`, suite runs are `/regression-testing`.
- Clear the readiness preflight, then run the Phase 0 path self-check against `references/kata-invariants.md` §10 before dispatching anything. A FORBIDDEN path aborts and redirects to the skill named in its row. A path in neither table is asked about, not assumed.
- When one change spans ALLOWED and FORBIDDEN paths, split it. This skill changes the base; `/test-automation` migrates the consuming specs in a follow-up.
- Run Plan, Code, Verify, Archive in order for every non-trivial framework change. The pipeline is the gate, and "it is a quick refactor" is not an exemption: skipping it for `ApiBase.ts`, `UiBase.ts`, `TestContext.ts`, fixtures, the installer or the OpenAPI pipeline reliably ships undetected regressions.
- Leave per-ticket tests alone: the specs under `tests/e2e/` and `tests/integration/` and the per-module Page, Api and Steps components are `/test-automation` surface. The KATA bases (`TestContext.ts`, `ApiBase.ts`, `UiBase.ts`) and the fixture files are yours (`references/kata-invariants.md` §10.1).
- Keep the KATA layers (TestContext, Base, Domain, Fixture) intact, whatever the simplicity argument. They are framework architecture, not speculative abstraction.
- A new fixture API comes with the matching fixture file (`tests/components/TestFixture.ts`, `ApiFixture.ts` or `UiFixture.ts`), an updated `kata-manifest.json`, and at least one existing test that consumes it. Orphan fixtures rot, and the manifest is the anti-duplication gate (Critical Rule #12).
- A major bump of Playwright, Bun or TypeScript needs a regression run on a representative E2E suite first. Lockstep upgrades hide breaks in fixture lifecycle, locator engines and type emit.
- A change to `cli/install.ts` is exercised through the full install flow on a clean clone. Checking on an already-installed repo proves nothing, and the installer is where a bug ships silently to every new user.
- When the chosen approach reshapes test architecture (KATA layers, a fixture API, the runner, the isolation or parallelization model, the OpenAPI/type pipeline) and passes all three gates (hard to reverse, surprising without context, a real trade-off; `agentic-qa-core/references/adr-doctrine.md`), record an ADR under `.context/ADR/` after plan approval and before coding. The plan approval is the decision, so the ADR is written `Accepted` and cites it; it is never handed back for acceptance. `Proposed` is only for a question still open. ADRs are append-only: supersede, do not rewrite.
- Verify with all four checks (test, types, lint, skills) and treat any non-zero exit as REJECT: present retry, skip-and-document or abort, and do not auto-fix. A skill that itself broke (a wrong step, a missing verifier, a stale rule) is reported upstream per `../agentic-qa-core/references/upstream-feedback.md`: drafted and redacted locally, filed only on explicit OK, verified with `gh issue view`.
- When the change is a skill (a new or restructured `.agents/skills/<slug>/`), scaffold it per `../agentic-qa-core/references/skill-scaffold.md` (frontmatter including `metadata.kind`, per-kind files and sections, Definition of Done). Write the skill text with the `writing-for-agents` and `humanizer` skills (see "Writing a skill"), `skill-creator` (T3, installed at project level) is always the builder: it makes the draft, the test prompts, the evals and the description pass. When `skill-creator` is missing, scaffold from the reference's template and say so. Consumer SUT context skills are not this skill's job: `project-context` mode `context-skill` owns them.
- `progress.md` is orchestrator-only. Code subagents return one-line summaries per task, and the orchestrator does not read their diffs.
- Close every change that adds, renames or retires a skill, a `package.json` script or a doc path, or that changes a behaviour a page describes, with the docs follow-through (Phase 3): patch `.agents/instructions/agent-context-map.md`, `.agents/instructions/agent-skills-and-mcps.md`, `README.md`, `INSTALLER.md`, `CONTEXT.md`, the `docs/core/` pages, the decks (`packages/decks/**`) and the Pages home (`packages/pages-home/**`) in the same PR. `bun run docs:check` proves the router and the quoted scripts; the prose is judgment.
- When an edit lands inside a `LINT.IfChange(<label>)` region (the hook prints a `DOCS:` line; ADR-0016), update every page its `LINT.ThenChange(...)` names in the same push. Add `Docs-Checked: <label> <reason>` to a commit message only when the documented behaviour did not change, and never by reflex or without a reason. Pre-push and CI block otherwise. A drift found later gets a new marker.
- When the change touches `cli/`, `scripts/`, `.husky/`, `AGENTS.md` or `.agents/instructions/`, run the V5 drift sweep after the four verifiers, report-only (Phase 3). It greps the doc surface for prose that describes the old behaviour and counts the `Docs-Checked:` trailers the change used.
- Archive the session directory only after all four verifiers pass. On REJECT it stays in place so the run can be debugged or resumed.
- Route every change to `AGENTS.md`, a section under `.agents/instructions/`, the ROUTER or a `triggers:` list through mode `instructions`: place each sentence with `references/instructions-doctrine.md` §2 and close with `bun run instructions:check`. Section prose does not get pasted into `AGENTS.md`, and a ROUTER row needs the ADR that decides it (`--accept-router ADR-NNNN`, ADR-0013).
- When a trigger misses or over-fires, fix the section's `triggers:` and add the prompts to `cli/lib/fixtures/instruction-router-eval.json`. A prompt is never relabelled to hide a miss.

**Read full SKILL.md when**: writing the plan artifact, batching Code-phase tasks, resuming an interrupted session, running mode `instructions`, writing a skill, or reading the ALLOWED/FORBIDDEN path tables themselves.

> Source: `.agents/skills/framework-development/SKILL.md` · phase: `unknown` · kind: `workflow` · stage owner · extraction strategy: A

---

## Skill: git-flow-master

**Purpose**: Git operator that adapts to the repo's branching strategy.

**Compact Rules**:
- Read the repo state (status, branches, diff, log, fetch, upstream, remotes) at the start of every invocation and report it before acting. A wrong guess about state is the most common git mistake.
- Resolve the branching strategy from the `git_strategy:` block in `.agents/project.yaml` first, then layout heuristics, then by asking; never pick one silently. Persist the resolution back into that block, not into a separate file and not as policy prose in `AGENTS.md`. The yaml snippets in `references/` (per-strategy field rules, policy examples) are illustrations: a claim about THIS repo's strategy, branches or policy cites `.agents/project.yaml` (or `git:policy verify` output) read in the same turn.
- When `git_strategy.meta.strategy_source` is `chosen`, the strategy is confirmed, whatever `project.project_name` holds, and there is no offer. Otherwise, when `git_strategy.strategy` is set but `project.project_name` is null, or `meta.strategy_source` is `inherited` (or absent) on a named project, the strategy came from the template and nobody chose it. Treat it as unconfirmed and offer Strategy Setup once per session. Never auto-run it, and on a "no" proceed under the inherited strategy.
- Consult `git_strategy.policy.direct_push_to_protected` before any direct push to a protected branch. `allowed` is standing authorization (asking anyway collapses it into `confirm`), `confirm` asks every time, `forbidden` refuses and routes through a PR. A missing or null block behaves as `confirm`.
- Never amend, rebase or otherwise rewrite a pushed commit (Critical Rule #6, an invariant: no authorization relaxes it). Fix forward with a new commit.
- Never force-push, `--force-with-lease` or `--no-verify` unless the user explicitly authorizes it AND the branch is unshared.
- Never run a repo-wide discard (`git restore .`, `git checkout -- .`, `git reset --hard`, untargeted `git stash`, `git clean -f`): concurrent sessions may share this working tree. Discard only explicit paths this session modified, and when ownership is unclear, stop and ask.
- Never `git add -A` or `git add .`. List explicit paths, so a secret or another session's work cannot ride along.
- One commit has one responsibility, in conventional format (`{type}({ISSUE-KEY}): {description}`). Commit messages, branch names and PR bodies are English and carry no AI attribution.
- Close every commit message, in every strategy, with the two forensic trailers `Worktree: <name|primary>` then `Session: <label>`, copied from the `AGENT IDENTITY:` line in session context (`unknown` when a value cannot be resolved). They record which tree and session produced the commit; they are forensics, not attribution, and a harness-branded trailer (`Claude-Session:`, an AI `Co-Authored-By:`) stays forbidden.
- When the pre-push or CI documentation-contract gate names a region (ADR-0016), update every page it lists in the same push. Add `Docs-Checked: <label> <reason>` above the forensic trailers only if those pages still hold, and always with the reason.
- When a pre-commit hook rejects a commit, stop, fix the underlying issue, and create a NEW commit. `--amend` would rewrite the previous, unrelated commit.
- Propose every branch name, commit set and PR body, and wait for an explicit OK before executing.
- Stop at PR creation: merging is the user's next step, not an automatic one. If the `gh` transport is missing or unauthenticated, surface the blocker instead of implying a PR was opened.
- To reconcile declared policy against the host, run the policy-verify tool once at the first push / PR / merge intent and never hand-query protection endpoints. A `404` on the classic protection endpoint does not mean unprotected, and a push that succeeded may have been a documented bypass, not permission. Report drift; never auto-correct it.
- When a planned change exceeds ~400 changed lines, run the chained-PR decision (single-pr / stacked-to-main / feature-branch-chain / size-exception) before coding, and re-run it if the real diff outgrows the estimate rather than silently up-budgeting. Return it with its trace, not a bare label: `Chain strategy: <leaf>`, each tree question answered with the reason drawn from THIS change (`Q1=No (…) · Q2=… · Q3=…`, `n/a` past the leaf), `Decided by: /git-flow-master`. Answers that do not lead to the stated leaf, or a trace that only restates the conclusion, count as no decision; a re-run replaces the trace.
- When a promotion PR into the production branch merges, hand off the post-promotion `merged` pass as `/test-documentation post-promotion` ("Promotion landed on `<production>`: run `/test-documentation post-promotion`"). The TMS is not touched from this skill. Canon: `agentic-qa-core/references/discovery-driven-doctrine.md` §6.
- When a conflict fires, diagnose and classify it first, present options ranked by safety, and prefer a safe abort over a guess. A destructive option is never picked silently.

**Read full SKILL.md when**: running Strategy Setup, resolving a specific conflict type, picking a base branch or branch prefix for an unfamiliar strategy, or setting up an isolated worktree.

> Source: `.agents/skills/git-flow-master/SKILL.md` · phase: `implementation` · kind: `workflow` · extraction strategy: A

---

## Skill: infra-context

**Purpose**: Infra context: how the system under test is built, run and deployed.

**Compact Rules**:
- Read the map through `bun run context:map infra-context`, or add `--section backend`, `--section environments` and so on. The raw `references/infra-map.html` is mostly SVG, so the reader is the only way in.
- A placeholder map means there is no infra map. Say so and hand the user `project-discovery` Phases 2-3. A guessed run command, environment URL or auth flow sends the whole session down the wrong path.
- Take environment URLs from `.agents/project.yaml` and credentials from `.env`. The map says which environments exist and how they differ; it holds no secret and no value that has its own source.
- When a session observes something that contradicts a section (a command that no longer runs, a changed pipeline step, a changed auth request), propose the one-section edit with its evidence to the user (to the conductor when you are a supervised worker) and apply it only on approval. Procedure: `references/refresh.md`.
- Write only inside this skill's own `references/`: no Jira, no `.context/`, no CI files, no other skill, no product code.
- Keep map content out of this SKILL.md. Judgment goes in `## Rules` or `references/gotchas.md`, dated and measured.
- Before a step that redraws the architecture figure (`diagrams`), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8. A table is fine where it says it better.

**Read full SKILL.md when**: building a briefing for framework adaptation, an environment or CI change, an auth-in-tests decision or a non-functional check; deciding whether a section is stale; or proposing an edit to the map.

> Source: `.agents/skills/infra-context/SKILL.md` · phase: `unknown` · kind: `context` · extraction strategy: A

---

## Skill: iql-context

**Purpose**: Methodology index of this repo: the IQL (Integrated Quality Lifecycle), its stages, artifact ladder and invariants.

**Compact Rules**:
- Answer "why is the process shaped this way" from the index below, then point at the canonical reference for the procedure. Do not restate a DoD, a transition table or a link catalog that a reference already owns; the copy drifts.
- Name stages by word (Shift-Left, Planning, Execution, Reporting, Documentation, Automation, Regression, Observation), never by number. A numbered "Stage N" in an older doc resolves through `agentic-qa-core/references/stage-gates.md`.
- Read `qa.methodology` in `.agents/project.yaml` before saying which stages a project runs or how strict its gates are. The shipped values are a default, not a decision.
- Read `references/project-overrides.md` for the project's own rules and exceptions. They win over this index for that project, and only there.
- When the website and the repo disagree, do not resolve it on your own. The repo's executable doctrine (`agentic-qa-core/references/*`) is what the skills enforce and the website is the public narrative, so state both readings and cite both.
- This skill is not SUT knowledge. Entities, endpoints, infra and Jira content live in `.context/` maps and the project's `<aspect>-context` skills.
- In a consumer project, do not edit this SKILL.md or its synced references. Propose a refinement per `agentic-qa-core/references/skill-refinement-protocol.md`, and put project-owned prose in `references/project-overrides.md`.
- A question about one aspect (phases and steps, the agentic contract, the eight approaches, the thirteen invariants) needs only that reference from §"References".

**Read full SKILL.md when**: building a briefing that must explain the methodology to a subagent, answering "why" questions about the ladder or the stages, or checking which invariant a proposed shortcut violates.

> Source: `.agents/skills/iql-context/SKILL.md` · phase: `unknown` · kind: `context` · extraction strategy: A

---

## Skill: jira-administration

**Purpose**: Administer Jira in two approval-gated modes: Components reconciliation and instance migration.

**Compact Rules**:
- Take the mode from the first token of `$ARGUMENTS`; with no match, ask, and a bare "fix Jira" or "sync Jira" picks none.
- One mode per run. Load only its reference, never combine the two or fall through into the other, and run only the selected reference's verification steps.
- Load `/acli` before any Jira operation. Load other tool-owner skills only when the selected reference requires them.
- Missing MCP or Jira credentials is a hard stop (`AGENTS.md` Critical Rule #10). Name the exact env var, point at `.env` and `.env.example`, ask for an agent-session restart. No workaround, no partial run.
- Read the live state before authoring any plan. Nothing is created, applied, deleted or repointed without the user's explicit approval given inside the same run.
- `components`: derive and inspect, author the plan file, dry-run, wait for explicit approval, then `--apply`.
- `instance-migration`: resolve and confirm both instances, audit and verify reachability, wait for explicit approval, then change files or the `acli` session. That session lives at `~/.config/acli` and is machine-global, so a re-login repoints every repo on the host, not only this one.
- The Atlassian host lives in `.agents/project.yaml` under `issue_tracker.atlassian_url` and nowhere else locally. A stale `ATLASSIAN_URL` in `.env` or the process environment is contamination: delete it, never update it, because a second copy is what goes stale.
- Template-repo carve-out: when `.agents/project.yaml` has `project.project_name` set to `null`, the repo is an un-onboarded template. Leave `atlassian_url` and `project_key` as `null`, say so in the report, and do not create a commit to hide the emptiness.

**Read full SKILL.md when**: the mode is ambiguous, a dry-run diff or migration audit looks wrong, or you need the selected reference's step-by-step phases and verification list.

> Source: `.agents/skills/jira-administration/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: A

---

## Skill: judgment-day

> ⚠ LOW-CONFIDENCE (extraction strategy B): bullets scraped without context — read the full SKILL.md before relying on any rule below.

**Purpose**: Run a blind dual review with two independent judges, fix confirmed issues, then re-judge.

**Compact Rules**:
- `/test-automation` — Review phase, as one of the two ways to satisfy its MANDATORY separate verifier (this skill OR `/pr-review-lead`), for every change, not only high-risk ones. That Review step counts as the explicit request above.
- `/git-flow-master` — OPTIONAL pre-PR gate when the diff is large or touches shared fixtures / base classes
- The diff / files / PR / architecture slice under review — the literal target the user named.
- `AGENTS.md` — repo conventions, Critical Rules, behavioral layer (the judges must score against these, not generic best-practice).
- `.agents/skills/REGISTRY.md` — skill registry; resolve which project skills apply to the target's file paths + task type, and inject the same `Skills to load before work` block into both judge prompts.
- The change's spec / PR description / Jira ticket — the stated intent. Judges score against intent, not their imagined intent.
- `references/prompts-and-formats.md` — judge prompts, fix prompts, warning rubric, verdict table format.
- Prior judge outputs from earlier rounds (Round 2+ only) — to detect regressions or stale findings vs. new ones.
- Resolve project skills before launching agents: read skill registry, match skill paths by target files/task, and inject the same `Skills to load before work` block into both judge prompts and fix prompts.
- Launch **two blind judges in parallel** with identical target and criteria; never review the code yourself.
- Wait for both judges before synthesis; never accept a partial verdict.
- Classify warnings as `WARNING (real)` only if normal intended use can trigger them; otherwise downgrade to INFO as `WARNING (theoretical)`.
- Ask before fixing Round 1 confirmed issues.
- After any fix agent runs, immediately re-launch both judges in parallel before commit/push/done/session summary.
- Terminal states are only `JUDGMENT: APPROVED` or `JUDGMENT: ESCALATED`.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/judgment-day/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: B

---

## Skill: orca-orchestration

**Purpose**: Run a conductor plus a fleet of persistent worker sessions through the Orca runtime.

**Compact Rules**:
- Gate on the binary plus a reachable runtime, never on whether a vendor skill is installed. Three states: A no binary, B binary with unreachable runtime, C ready. In a workflow skill, states A and B are total silence: do not name the orchestrator, do not list it as a prerequisite, do not mention it in an ATR or a blocked-token sweep. The one-line install recommendation belongs to THIS skill and fires only because the user asked for orchestration. One workflow skill is the declared exception: `/sprint-conductor` exists to run on Orca, so when the gate fails it stops with one line naming it (owner decision); every other workflow skill keeps the silence.
- Write the launch file always, with or without a runtime, and keep the PROMPT identical on both paths, byte for byte, opening with `/<workflow-skill> <label> fleet worker` and carrying the no-stopping sentence. A worker's name is `<label>--<handle>` everywhere (harness session, tab, roster, `Session:` trailer), where `<label>` is `[<TICKET-KEY>-]<slug>` with a slug of 3 or 4 words. The hook composes the session name on Claude Code and the adapter on Pi, the conductor types the rename verb on the other harnesses, and the conductor renames the tab right after the worker starts and again every sweep. Orca's default tab name (`worker-<task id>`) and a harness-generated title are not acceptable names. The launch line is for a human to paste; the prompt is the payload both paths share, and a paraphrased prompt is the failure this rule prevents.
- Do not copy the vendor command grammar into this repo. Load the stubs listed in `orchestration.orchestrator_skills` (`.agents/project.yaml`) alongside this skill, for conductor and worker alike (they are small), and ask the binary only for the deep topics a stub points at.
- One-shot subagents are the default executor (AGENTS.md §3, unchanged). A supervised worker is the declared exception: persistent, addressable, owns a scope end to end.
- No periodic heartbeats, even though the injected preamble asks for them: each one wakes the conductor to read the word "alive". A worker sends exactly three things: `worker_done` (once, with an explicit outcome), `ask` (blocking), `escalation`. The brief prohibits heartbeats in writing.
- A worker does not use the harness's own agent-to-agent messaging or user-question tools: from an isolated worktree the conductor is not addressable and nobody watches a user prompt. The channel is the orchestration mailbox, and a question that does not block goes out as a message while the worker keeps going on everything that does not depend on the answer.
- Every error, blocker and decision a worker cannot take inside its brief goes to the session that launched it, never to the human: the four kinds of `agentic-qa-core/references/decision-protocol.md` §5 and every error or blocker it cannot clear go out as a blocking `ask`, an `escalation` or a `BLOCKED: ` status, never guessed. A worker uses no structured-question tool, no `mkd` deck, no sweep. A technical call inside the brief is the worker's, reported as DECIDED. Exception: the human typed into the worker's own session or the brief grants it in writing, and the worker tells its conductor. The conductor decides a technical call inside the plan, relays the rest to the human (sweep small, deck heavy), replies by message id and records it in the run's decision file. Canon: `references/worker-contract.md` rule 16.
- The channel is an assignment, not a preference. `orchestration send` carries every message between sessions and is byte-intact; anything longer than a couple of sentences goes in a file with a one-line pointer. `terminal send` drives a terminal (commands, CLI calls, harness slash-commands, keystrokes) and nothing else, because it truncates silently, keeps only the tail and still reports success. The one exception is the launch handoff prompt of a supervised worker, which has no argv to travel in: keep it short and point it at a file.
- Acknowledge every mailbox batch, verified, in the same command that re-arms the wait, and never inside a compound command whose exit code can be swallowed. An unacknowledged batch replays forever and hides what is queued behind it. Roll the wait in windows of at most 540 s, because the harness kills a foreground command at 600 s. One waiter per Run, never a shell background job, never a self-built monitor: the runtime notifies the conductor on its own.
- Launch a supervised worker natively (the runtime starts the agent: task, worktree, agent, model, effort) and send its prompt as the immediate next step. A terminal created with our own command line can never be supervised (the runtime recognizes only agents it started); custom argv is the human-paste and deliberately-unsupervised shape.
- Verify credentials on the worker's own screen before dispatching work to it. The native launch has no argv: every MCP server reads the worktree's own `.env` through the `.env` loader in the MCP configs, and every other process loads its own config (Bun autoload, `acli` stored auth, `varlock run` for a raw `curl`); no secret is exported into the worker's shell. Evidence is its MCP servers connected (`/mcp` on Claude Code) and its worktree holding `.env`; without them the worker fails much later at its first authenticated call.
- Tell every worker, in the prompt and in the brief, to run every stage without returning to the prompt until `worker_done` is sent: a stage boundary is not a checkpoint. Name the one `ask` that is mandatory: when a worker's own measurement contradicts a conductor instruction, it stops and asks with both readings and the evidence, never silent compliance, never silent deviation.
- Create, launch, name and brief are one indivisible operation. Verify a few minutes later that the brief actually landed (a created terminal reports success when the text was delivered, not when it ran). Readiness is not completion.
- Close a finished worker in the same turn, and read its cost footer off its screen first: its token and context usage dies with the terminal. Release the supervised worker by its dispatch; without a dispatch, count the terminals in that worktree before closing anything, because the stop verb's radius is the whole worktree. `worker-release` closes the agent terminal only: the worktree, its `Setup` terminal and its local branch survive it and pile up on disk. So after the orphan audit (everything gitignored inside the worktree dies with it) the conductor removes the worktree in the same turn (`orca worktree rm --run-hooks`) and confirms with `git worktree list`. A worktree stays only with a written reason and an owner in `roster.md`.
- Pick the topology by what the work writes: manual QA and backlog grooming run as a fleet in the SAME checkout (state lives in the tracker); anything that writes code gets one Orca worktree per worker, because two sessions in one checkout collide on the git index even when they never touch the same file. Never two workers owning the same module.
- Declare a claim before touching shared fixture data or a shared credential, with one of three intents (`read`, `write`, `enumerate`; a listing that exposes siblings' entities is never an assertion target). A claim already listed in the brief is pre-granted: the worker announces it and works. Only a claim discovered mid-run waits, and the conductor arbitrates it: first message wins, it keeps the ledger and broadcasts the grant. Conductor-only operations (login and token minting, schema sync, tracker pull and push) are never delegated.
- Provision a fresh worktree before launching. A missing step disguises itself as something else: an absent env file reads as "the tool does not exist", absent dependencies as "a broken import".
- `.agents/project.yaml` `orchestration` holds defaults only (worker cap, agent, model and effort per tier, permission mode per tier, model overrides by topic). An explicit user instruction in the conductor session overrides them for that run; the defaults apply only when the user said nothing.
- Brakes for automations and workers: a run's output passes automated checks, a cold review by a reader that did not write it, and a person's review after the run ends, which never blocks the run. Add one automatic trigger at a time, throttled; cap any loop at a few tries, then report `BLOCKED: `. A fix run never chains: a failure inside a fix run's own work triggers no further run. Canon: the body section "Brakes".
- An unattended or long worker keeps a decision log with one row per decision, evidence as a pointer (`/show-me-your-work`, or its six columns by hand when it is not installed). Canon: the body section "Decision log".
- When running as an unattended routine (AUTOMATION mode), take the routine's lock first (`<<PRIMARY_ROOT>>/.session/orchestration/automations/<routine>/lock.json`, created no-clobber, then read back), because a manual fire bypasses the precheck and can overlap a scheduled one. A live lock means exit with a one-line report, never wait or queue; a lock older than the prompt's `stale_after_minutes` is reclaimed and the reclamation reported; a prompt with no window fails closed. Delete the lock as the run's last step. Canon: `references/automations.md` §2.
- When running as an unattended routine, open at most `orchestration.max_workers` workers in total, in one round (lower if the prompt says so), and list the rest as deferred. Nothing eligible is a correct outcome: do not pick a marginal item to fill the report. Write the run report at every step boundary, never only at the end, and select a Story for testing only after the deploy check says its merge is on the target environment. The deployed environment is truth, the tracker is a hint.
- A commit produced by any session carries the forensic trailers (`Worktree:` then `Session:`), which are mandatory and are NOT AI attribution. Canon: `/git-flow-master`.

**Read full SKILL.md when**: starting a fleet cold, arbitrating a claim, choosing a topology, recovering a Run from a previous session, or writing an unattended automation.

> Source: `.agents/skills/orca-orchestration/SKILL.md` · phase: `unknown` · kind: `workflow` · source: frontmatter `compact_rules` (verbatim)

---

## Skill: pr-review-lead

**Purpose**: Reviews a colleague's test-automation pull request as a QA lead, citing doctrine or code for every finding.

**Compact Rules**:
- Run the strictness preflight (Flexible, Standard or Strict) before reading any diff. If the invocation already answered it, do not ask again.
- At Flexible and Standard, a doctrine-pattern deviation is an observation framed as a comparison, never an error, and it does not move the score. Strict widens what counts as a finding; it does not turn a pattern note into an error.
- When the target repo ships its own doctrine, load it in full before analyzing: a repo forked from this boilerplate may have evolved its conventions. Only when it has none is this repo's KATA the reference standard, and the output says so.
- State a "best practice" as a repo requirement only with a file:section citation. An ungrounded call is labeled as opinion, in those words.
- Put every finding in exactly one bucket (Real/Reliability, Pattern/Doctrine-deviation, Positive) with a severity tier (Critical, Major, Minor, Trivial) in the user's language.
- Fill the Positive bucket. A review with no positives on a PR that clearly has some is uncalibrated, not rigorous.
- Read the actual diffs. On a PR too large for one diff, page the per-file patches, and check the commit headlines first so an unrelated bulk-sync or vendor-update commit is not read line by line.
- Review on two axes, Spec and Standards, each by its own reviewer in a fresh context when the PR has a spec to check, and check the tests for lying tests (LT-1 and LT-2 with Spec, LT-3 with Standards). The checks live in `test-automation/references/review-checklists.md`.
- Present the findings table, the positives and a score out of 10 as a checkpoint, then let the user triage and re-classify. Their context decides what ships; do not defend the first-pass severity.
- When the user gave no tone or structure, draft praise, then constructive points, then praise, with a real strength at each end.
- Post to GitHub only after an explicit go-ahead at the final step. Approval for a different PR does not carry over, and silence is not approval.
- Drafting and posting stay with the orchestrator, because tone and an outward action are not for a subagent.
- When a PR under review needs framework-level process, say so and point at `/framework-development`. Do not chain SDD skills from this workflow.
- Write the posted comment in English unless the user asked for another language for that artifact.

**Read full SKILL.md when**: applying the severity rubric or score weighting, probing an external repo for its doctrine, or drafting the posting flow itself.

> Source: `.agents/skills/pr-review-lead/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: A

---

## Skill: project-context

**Purpose**: Generate or refresh the business context maps and the master test plan.

**Compact Rules**:
- One mode per run: `data`, `e2e` (synonym `features`), `api`, `test-plan`, `refresh-all`, `context-skill` or `coverage`. Load only that mode's reference, and open a second one only when `refresh-all` reaches it.
- `context-skill` scaffolds a project-owned `<aspect>-context` for an aspect the shipped context map skills (`CONTEXT_MAP_SKILLS`) do not cover (`../agentic-qa-core/references/skill-scaffold.md` §3). It cites its sources and copies nothing from them. `refresh-all` never includes it. Its router row goes in the `## Project context skills` table of `.agents/instructions/agent-project.md` and its trigger phrases in that file's `triggers:`; `agent-skills-and-mcps.md` is the wrong place, because `bun sync` overwrites it.
- `coverage` reads the maps, the KATA manifest and the TMS, and puts every behaviour in one bucket (`automated`, `manual-only`, `weak`, `uncovered`). `refresh-all` never includes it. It writes only `<<PRIMARY_ROOT>>/.session/project-context/coverage/` (companion files: this skill opts out of the session Phase 0) and edits no test and no map. The `weak` verdict and the risk level are agent judgments with one evidence line per row; the buckets, order and diff come from `bun run context:coverage classify`. Coverage Tech Stories are created only after a person approves the gap list, picked by weight (`mkd` deck for per-item choices, the question tool for one yes/no).
- A map mode writes only its own skill's `references/<map>.html`. The legacy markdown files a project may hold (the skill's `legacy` list in `CONTEXT_MAP_SKILLS`, `cli/lib/context-maps.ts`) are read as input and are never deleted. Domain vocabulary and architecture come from the maps `project-discovery` generates (`bun run context:map business-domain-context` and `bun run context:map infra-context`), not from a `.context/` file. `test-plan` writes the `## Master Test Plan` section of the `QA Master Test Plan` Epic description in Jira (cached by the sync at `.context/PBI/qa-artifacts/master-test-plan.md`), never a local file.
- When the user did not name a mode, ask. A generic "refresh the context" is not `refresh-all`.
- `refresh-all` runs `data`, `e2e`, `api`, `test-plan` in that order, one at a time. Each reference's own validation and approval gate closes before the next one loads.
- A missing artifact (or a placeholder map) is CREATE mode: write once the analysis completes. An existing artifact is UPDATE mode: generate a candidate (for a map, only its stale sections), show the diff summary and wait for explicit approval. Overwriting an existing artifact without that approval, or regenerating a whole generated map, loses work the maps' readers depend on.
- Stop the run on a hard dependency failure or a rejected overwrite. A missing soft dependency is a Discovery Gap: record it and continue, as the selected reference defines.
- Business facts come from sources. Read every source the selected reference requires; what stays unverified goes under the output's mandatory `## Discovery Gaps`, not into the body. In `coverage` the gap list is a recomputed session file, so the approval gate applies to the tracker write it proposes.
- After a successful artifact write, add the pointer to `.agents/instructions/agent-project.md` when it is missing, and only there: `AGENTS.md` is boilerplate-owned and size-budgeted, and `CLAUDE.md` takes no operational prose. Placement follows `framework-development/references/instructions-doctrine.md` §4, then `bun run instructions:check`; any other instruction change is `/framework-development` mode `instructions`.
- Mode from `$ARGUMENTS`: when its first token matches a mode in the Mode routing table, that token is the mode and the rest is forwarded to it unchanged (`/project-context data` on Claude Code, "project-context mode data" in prose on OpenCode and Codex, `/skill:project-context data` on Pi). No matching first token: ask which mode.
- Before a step that uses a declared capability (`metadata.requires_capabilities`: `db`, `api-schema`, `diagrams` for the maps' figures), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8. It resolves the capability by tool-name suffix; when no available tool provides it, stop and name the capability and how to enable it.

**Read full SKILL.md when**: the requested mode is ambiguous, a `refresh-all` chain fails mid-sequence, or you need the selected reference's own analysis steps and validation gate.

> Source: `.agents/skills/project-context/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: A

---

## Skill: project-discovery

**Purpose**: Onboard a project by reverse-engineering its code into a domain map and an infra map.

**Compact Rules**:
- Run the four phases in order (Constitution, Architecture, Infrastructure, Specification), each gated on the previous. Show the output paths and wait for an explicit "Phase N complete" before continuing, because each phase builds on facts the human has just confirmed. Never auto-chain.
- Discovery is read-only on the target repo. The write targets are `.context/project-config.md`, `.context/ADR/`, and the maps of `business-domain-context` and `infra-context` (their `references/<map>.html`), plus the Phase 1 `## Project Assessment (Phase 1)` block in `.agents/instructions/agent-project.md`. Nothing else. Modifying the boilerplate itself is `test-framework-adaptation`.
- You are the generator of those two maps, per `agentic-qa-core/references/business-context-maps.md` (anatomy §2, reading §3, CREATE/UPDATE §4, staleness §5). Map absent or placeholder: CREATE every section. Map generated: UPDATE only the stale sections (§5 staleness check), show a section-level diff and wait for approval. Never regenerate a whole generated map.
- Read a project's old `.context/business/`, `.context/SRS/` and `.context/infrastructure/` markdown files (the `legacy` list of `business-domain-context` and `infra-context` in `CONTEXT_MAP_SKILLS`, `cli/lib/context-maps.ts`) as input when present. Cite them in `data-migrated-from` on the sections they seed, and leave them in place untouched.
- Before drawing a figure, run the point-of-use check for capability `diagrams` (`agentic-qa-core/references/business-context-maps.md` §7). Figures are optional where a table says it better: the glossary is tables, the architecture overview usually earns a figure.
- Describe what the system does, not what product wants it to do. Discovery is reverse-engineering; a to-be PRD or SRS is out of scope, so point the user at their own product workflow. Do not invent business entities, flows, requirements, or Jira and Xray field IDs and status names: anything you cannot verify goes in the map's `discovery-gaps` section (or the `## Discovery Gaps` block of `project-config.md`). Field IDs come from `bun run jira:sync-fields --force` and are referenced as `{{jira.<slug>}}` through the slug catalog in `.agents/jira-required.yaml`.
- Lock the target repo path(s) before Phase 1 and stop on ambiguity. A repo that is not cloned locally cannot be discovered from a URL, so ask for the clone first.
- Split sibling repos: run the Phase 1 sub-steps once per repo and merge into one `project-config.md`, never interleaved. Monorepo: Phase 1 once project-wide, Phases 2-3 per package.
- Do not fill the `business-data-context`, `business-api-context` or `business-e2e-context` maps, and do not write personas, journeys, the feature catalog or the master test plan here. Those are `project-context` modes, which own their diff and overwrite approval. Exact API types are `bun run api:sync`.
- Do not create per-ticket PBI content or copy the backlog. Phase 4 is a connection check and writes no file; the committed `README.md` and `templates/` under `.context/PBI/` stay untouched.
- Do not paste credentials or a detected secret into any discovery output. Reference the `.env` key or the file path only; a hardcoded-secret hit is recorded as a HIGH risk (path only) in the Phase 1 assessment.
- When Phase 2 or 3 settles a test-architecture decision that passes the three-gate test of `agentic-qa-core/references/adr-doctrine.md` (hard to reverse, surprising without context, a real trade-off), record it as an append-only ADR under `.context/ADR/`, drafted `Proposed` for the human to accept. In a brownfield repo the decision was discovered, not made here: write it `Proposed`, mark it discovered (where it was found), and have the human confirm it at that phase's completion checkpoint, which flips it to `Accepted`.
- Keep discovery sessions separate from `test-framework-adaptation` sessions, and do not use this skill for incremental refreshes of the other maps: the write boundaries differ.
- Do not skip Phase 1 or its domain glossary on a fresh start. Later phases assume the project's values and stack are fixed, and downstream skills load `business-domain-context` as a precondition for ATP authoring and TC naming.
- When a DB schema or migrations and ORM models both exist, prefer the schema or migrations: ORM definitions drift from the live schema.
- Before any step that uses a declared capability (`metadata.requires_capabilities`: `db`, `api-schema`, `diagrams`), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8: resolve by tool-name suffix, and when no available tool provides it, stop and name the capability and how to enable it. No silent fallback.

**Read full SKILL.md when**: running any phase's sub-steps, applying a completion gate's content checks, or resolving the pre-`test-framework-adaptation` prerequisite list.

> Source: `.agents/skills/project-discovery/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: A

---

## Skill: regression-testing

**Purpose**: Run regression, smoke or sanity suites through CI and decide GO / CAUTION / NO-GO.

**Compact Rules**:
- Read a failure's logs before classifying it, and analyze before reporting.
- Clear the readiness preflight before triggering anything (`gh` authenticated, workflow file present, GitHub Actions secrets set, Allure resolvable, active env confirmed): a long run that 401s halfway is the expensive failure.
- Persist `RUN_ID` the moment the trigger returns, so resume re-attaches to a live run instead of re-triggering CI.
- Check a failure's history before marking it REGRESSION; skipping that is the most common misclassification. A first-ever failure with no history is NEW TEST, unverified, not a regression.
- Classify every failure into exactly one of KNOWN-BLOCKED / KNOWN ISSUE / ENVIRONMENT / NEW TEST / FLAKY / REGRESSION, and give severity on a separate axis (a FLAKY test on checkout is still CRITICAL). Classification fails closed: every class but REGRESSION cites its evidence (the `@blocked:{BUG-KEY}` marker; a ticket created BEFORE the run; the matching log line plus the other failures on that host; the empty history query; the ids and results of at least 5 runs on an unchanged build). No citation, or a ticket this session filed, means REGRESSION.
- Exclude `@blocked:{BUG-KEY}` tests from the gating pass-rate and report their count with each blocking key. They are parked behind a bug that is already filed: never REGRESSION, never a new bug.
- Use ENVIRONMENT only with evidence. Many unrelated tests failing on one host is environment; one test failing on an endpoint other tests reach fine is more likely a REGRESSION.
- Call a test FLAKY only with at least 5 runs of history. With fewer, label the failure INSUFFICIENT HISTORY and count it as REGRESSION for the verdict (fail-closed), then re-evaluate on the next run. When several classes match, the order is KNOWN-BLOCKED > KNOWN ISSUE > ENVIRONMENT > NEW TEST > FLAKY > REGRESSION: FLAKY wins only with its citation, and REGRESSION is what is left.
- Take the run's counts (total, passed, failed, skipped, pass-rate) from `reports/test-outcomes.json`. Allure supplies each failure's detail and the history behind FLAKY, and the counts only when that file is missing from the downloaded artifacts (always for smoke and sanity runs; say so in the report).
- Do not emit GO while any REGRESSION-class failure stands. Hard vetoes regardless of score: any `@critical` test failing, any HIGH/CRITICAL-severity regression, or a pass rate below 90%.
- A borderline failure may be diagnosed with `diagnosing-bugs`, never fixed: no product-code instrumentation and no fix.
- File only CONFIRMED product failures: the REGRESSION class, plus a NEW TEST failure once manually confirmed as a real defect. FLAKY, ENVIRONMENT and KNOWN ISSUE get no issue at all. Triage decides WHETHER to file; the defect-management doctrine decides the type and the fields.
- Do not open a GitHub issue for a quality failure. File it in the issue tracker, parented to the QA Defect Management process epic and linked to the source Story, never to a product or dev epic.
- Create the RTR (Regression Test Results, a Test Execution) BEFORE triggering CI, persist its key beside `RUN_ID`, and pass it as the `execution_key` dispatch input; Phase 1 has its fields. One RTR per verdict. The STR is created or completed only when the run is the sprint close (then it links to both the STP and the RTP).
- Do not import a regular regression run into the sprint STR. Smoke and sanity never write into a regression execution: they import only when an execution key is passed explicitly.
- Close the RTR (or the sprint-close STR) via `complete` only AFTER the verdict comment is posted on it, and leave the RTP at its ready status: a suite run never completes the plan it ran from.
- Do not invent a sprint number. The RTR needs none (its scope-id is `{env}-{YYYY-MM-DD}` or a release tag); only the sprint-close STR takes `N`, from the user or the STP's own scope-id. Ask before creating anything at sprint altitude.
- Download the artifacts even on a red build (evidence vanishes after the retention window), and keep smoke and regression results in separate pass-rates because their SLOs differ.
- Inspect traces and screenshots with `/playwright-cli` (`[AUTOMATION_TOOL]`). It is the only browser path; no MCP backs it.

**Read full SKILL.md when**: driving the CI commands, applying the GO/CAUTION/NO-GO scoring table, resolving a borderline classification, wiring the TMS artifacts, or writing the report.

> Source: `.agents/skills/regression-testing/SKILL.md` · phase: `unknown` · kind: `workflow` · stage owner · extraction strategy: A

---

## Skill: session-handoff

> ⚠ LOW-CONFIDENCE (extraction strategy B): bullets scraped without context — read the full SKILL.md before relying on any rule below.

**Purpose**: Hand a whole session to a fresh successor through a handoff file, so work continues as if the context window had been extended.

**Compact Rules**:
- The context window is past the owner's threshold (about 500k tokens unless the owner names another). It is a per-owner judgement about where this model starts degrading, not project configuration, so it stays in the conversation and not in a yaml key. <!-- volatile-ok: owner-stated judgement threshold, explicitly not config -->
- The session is about to end with work still in flight.
- The next step will consume a large slice of the window and what remains would not cover the work after it.
- The owner asks.
- **Capture.** Walk `.agents/skills/session-handoff/references/capture-contract.md` section by section. Every section is mandatory. A section with nothing in it gets an explicit `none` line, because an omitted section looks the same as a forgotten one and the successor cannot ask which it was.
- **Write.** Fill `.agents/skills/session-handoff/templates/handoff.md` into `<<PRIMARY_ROOT>>/.session/handoffs/<session-name>-handoff-NN.md`, following the naming contract below. Finish the file before the next step: a successor that starts first reads a file that does not exist yet.
- **Launch the successor.** Follow `.agents/skills/session-handoff/references/successor-launch.md`. With a reachable runtime, this session launches it. Without one, this session prints the launch line and the owner pastes it.
- `.session/` is gitignored, and a handoff is disposable: it describes one session's state and is not a project record. Committing it would put a decaying snapshot under version control.
- The file lives in the primary checkout, `<<PRIMARY_ROOT>>` (`.agents/README.md` §"Checkout roots"), even when the session runs in a linked worktree. A handoff written inside a worktree dies with the worktree, and two worktrees of one lineage would each count `NN` from their own empty directory. The successor still launches in the same worktree as the predecessor. A handoff written into a worktree's own `.session/` by mistake is rescued by `bun run worktree:audit --rescue` before the worktree goes.
- `NN` is zero-padded to two digits, starts at `01` and increments across the whole lineage. List `<<PRIMARY_ROOT>>/.session/handoffs/` before choosing, and never count from a worktree's own `.session/`.
- The successor's session name is the handoff file's basename without the extension. That makes the lineage readable from the file list alone: `<base>`, then `<base>-handoff-01`, then `<base>-handoff-01-handoff-02`.
- `<predecessor-session-name>` is the `session=` value of the `AGENT IDENTITY:` line the prompt hook injects (the label the commit trailers carry), with spaces and parentheses replaced by `-`. When it reads `unknown`, ask the owner for a name. With nobody to ask (a worker or routine), take the name from the launching brief; if the brief has none, write the handoff under `unnamed-session` and say in the report that the name was a stand-in.
- A durable fact that outlives the session belongs in Engram, the repo or the tracker. The handoff cites it.
- Label every claim `measured`, `read` or `predicted`. Measured means this session ran it and read the output. Read means it came from a document and was believed. A predecessor's guess about what the successor will find goes stale first, and a predicted branch stated as fact sends the successor down a path that no longer exists.
- Mark perishable state `PERISHABLE`, with the wall-clock time it was measured. Running workers, open mailboxes, in-flight PRs and live runs decay between writing and reading, so the successor re-verifies, then acts.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/session-handoff/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: B

---

## Skill: shift-left-testing

**Purpose**: Shift-left QA: refine acceptance criteria on a batch of backlog Stories before they enter a sprint.

**Compact Rules**:
- ACs are the floor. Push past the happy path and surface the boundaries, exceptions, states and anomalies the Story is silent on.
- 1:N is the default: a non-trivial AC implies several outlines (valid partition, each distinct invalid input, boundaries, states). One outline for an AC needs a written "trivially atomic" justification.
- Tag each gap to a technique: ranges to BVA, status or lifecycle fields to State-Transition, two or more interacting conditions to Decision Table, three or more combinable factors to Pairwise.
- A refined AC (Given/When/Then) is the business assertion; the outline (`Should <behavior> <condition>`) is its exploration. Keep them distinct.
- Stories only, in Backlog, Shift-Left QA or Ready For Dev. Bugs are reactive and have no upstream ACs.
- The output is refined ACs, gap and ambiguity questions, the pre-sprint ATP in `{{jira.acceptance_test_plan}}` (outline names and a coverage estimate; no test code, no execution, no Test Plan item, which `/sprint-testing` Stage 1 creates from the field), the closed `[QA] Shift-Left Review` subtask and the batch report.
- Each accepted Story gets a `[QA] Shift-Left Review` subtask: find or create it in Phase 1 with assignee = self (`create` lands it in `{{jira.status.subtask.active}}`), close it in Phase 3 with `{{jira.transition.subtask.complete}}` (to `{{jira.status.subtask.close}}`). Its status names are `ACTIVE` and `Close`. Long annotations go on the subtask to keep the Story clean. No subtask work type in `.agents/jira-workflows.json` means skip with a warning, never block.
- Phase 2 is the heart of the skill: edge cases, ambiguities and gaps the Story leaves out. They reach PO and Dev as questions and as derived outlines.
- On first QA pickup set `qa_assignee` to self, read before writing, never overwriting an existing owner (`defect-management-doctrine.md` Part 2).
- On completion add the label `shift-left-reviewed` and transition Backlog to Shift-Left QA to Ready For Dev.
- AI Effort is binding: in Phase 3 set `{{jira.ai_effort}}` (Low / Medium / High) on every refined Story with `references/ai-effort-checklist.md`. It sizes the whole item in an agentic workflow, implementing and verifying it, never a time or token forecast. `High` only warns: the handoff comment says the Story may need splitting, and it still moves to Ready For Dev. A PO may split and re-refine; the agent never splits or creates Stories. Whoever resolves a split may add one optional label (`split-accepted`, `split-edited`, `split-rejected`). With the field absent, write a structured `## AI Effort` comment, never block. DTU and QTU (`{{jira.development_token_usage}}`, `{{jira.quality_token_usage}}`) are written later by dev and QA, never here.
- Each interview step has a path for runs with nobody at the keyboard (`## With nobody at the keyboard`): record the questions and continue.

**Read full SKILL.md when**: running the batch grooming pipeline, writing the per-Story `shift-left-refinement.md`, or handling the PO/Dev handoff.

> Source: `.agents/skills/shift-left-testing/SKILL.md` · phase: `unknown` · kind: `workflow` · stage owner · extraction strategy: A

---

## Skill: sprint-conductor

**Purpose**: Conduct a sprint QA fleet on Orca from the Sprint Board, one sprint-testing worker per ticket.

**Compact Rules**:
- Orca is required (owner decision, the one exception to the orchestrator-silence rule): run the gate of `orca-orchestration` (binary and reachable runtime) before anything else. When it fails, say ONE line and stop, writing nothing: "/sprint-conductor runs on Orca and no reachable Orca runtime is on this machine; run the sprint with /sprint-testing sprint-wide and N executors, which writes paste-ready launch lines." Every other workflow skill keeps its silence unchanged.
- Split of duties: this skill owns the maneuver (boot, watch pass, round close, resume); `sprint-testing/references/fleet-conductor.md` owns the fleet, `sprint-testing/references/sprint-board.md` the board, `orca-orchestration` the transport. Cite them, do not restate them.
- Ask the owner only what the board, the tracker and the files cannot decide: the sprint when the CURRENT board and the tracker disagree or no board exists, and the worker cap when the ticket count exceeds it and the owner named none (held for this session, never persisted as a new default). Everything else is decided and reported.
- The conductor does not test and does not investigate a ticket. The line is fixture versus finding: seeding data, verifying with ONE query that a fixture exists and belongs to whom the brief says, and creating an owner-approved fixture user are conductor work; what a case asserts, the code behind it and any id the test needs are the worker's.
- Conductor-owned pre-flight, before EVERY launch (a watch-pass launch included): the conductor alone mints tokens and browser states and refreshes them when stale; a credential is proven with the cheap API login before any browser login, stopping after 3 failed attempts; the sibling-repo fetch is a gate (a non-zero exit stops and escalates, it never falls through to the counts) and its two drift counts go into every brief; the schema sync runs from a current checkout or is skipped with the skip written into every brief. Full: `references/boot-and-resume.md` §2.
- The sentinel is armed at boot and re-armed after EVERY wake, as a background task, one per board, with the same `--baseline` file. No homemade monitor, no scheduled pass when background tasks exist, no mailbox polling.
- Every watch pass records each decision with `bun run board arrival <KEY> launched|held|skipped "<why>"`, so a missed pass costs nothing. The deploy check always runs: a tracker status is a hint, the deployed build is the truth. Fixture gaps are asked at triage. The cap counts every live worker, an ad-hoc retest included, and collisions are checked against the LIVE workers, not the round plan.
- The CONDUCTOR reads back a finished worker's final ticket status itself, with a bounded poll for the expected value; a worker's or a subagent's "verified" is not proof (Critical Rule #16). The round close is ONE subagent per finished worker that verifies the artifacts, not the report; closes whose workers touched the same Epic run one after another, so only one of them publishes that Epic's `## Module Context (QA)` section at a time.
- A redeploy while workers are live: fetch only (do not fast-forward a sibling repo while a worker is live), then tell EVERY live worker once, with the repo, the old and new build and whether its own change's files moved.
- Message a developer only on the owner's explicit order for that message, never commit, never print a credential. Reports to the owner are counts and tables that name who must answer, not a narrative.
- Resume after a reboot or a session resume: find the workers by the label in their tab title, the part before the last `--term_` (the handle after it is stale), and re-issue each tab rename and each session rename (the harness rename verb, Claude Code included) with the new handle, restart the board, re-arm the sentinel with the same baseline, replay the owner's actions with `listen --since`, read the mailbox, send ONE resume message per live worker, and launch nothing until every live worker confirmed. Full: `references/boot-and-resume.md` §4.
- On any subagent failure: STOP, report which pass or ticket failed with full context, offer retry, skip or abort, and do not auto-fix. A skill that itself broke is reported upstream per `agentic-qa-core/references/upstream-feedback.md`.

**Read full SKILL.md when**: booting a conductor cold, resuming one after a reboot, or deciding whether a

> Source: `.agents/skills/sprint-conductor/SKILL.md` · phase: `unknown` · kind: `workflow` · stage owner · source: frontmatter `compact_rules` (verbatim)

---

## Skill: sprint-testing

**Purpose**: Runs in-sprint manual QA per issue: plan, execute and report.

**Compact Rules**:
- AC-pass is the floor, not the goal. Coverage is AC-conformance plus risk beyond the ACs (boundaries, errors, states, anomalies), so never report "% of ACs verified" as completeness. (Canon: `agentic-qa-core/references/test-design-doctrine.md`.)
- 1:N is the default: explode every non-trivial AC into several cases (EP partitions, boundaries, states, contexts). Collapsing an AC to one case needs a written "trivially atomic" justification.
- Apply techniques by trigger: EP always; BVA wherever a range / limit / length / date-window exists; State-Transition for stateful entities; Decision Table when 2+ conditions interact; Pairwise when 3+ combinable factors (log the reduction); Error-Guessing charters for experience-based risk.
- A criterion is a business assertion; a test case is a concrete exploration of it. Run the Test-Design Checklist before finalizing the ATP.
- Classify before filing; do not default to "Bug". A Bug is a feature already live above Staging (end-user visible). A Defect is a feature still pre-release (Staging or below), the normal output of sprint testing. An Improvement is not a broken AC (an enhancement, or an under-specified or absent AC surfaced by a test-beyond-AC). Classification follows the feature's lifecycle stage, not where the problem was found. (Canon: `agentic-qa-core/references/defect-management-doctrine.md` Part 1.)
- `qa_assignee` (`{{jira.qa_assignee}}`) records the QA who followed the Story: Shift-Left fills it and it stays for the Story's whole life. Set it (authenticated session user) at `start_testing` only when still empty, and on every filed Bug / Defect / Improvement. Read before write and never overwrite an existing owner. The native `assignee` follows the dev model (it moves to the QA at Ready For QA) and the harness never restores a previous owner (Part 2).
- `components` (native, mandatory) is the affected product module or Epic and must already exist in the Jira Components module (Part 3).
- Three axes: the parent is the QA Defect Management process epic (`qa.qa_epics.defect_epic`, found-or-created; never a product or dev epic, never the Story); the issue link is the source Story (traceability); components is the product module (Part 4).
- `priority` (native) is derived from `{{jira.severity}}` (critica = Highest, mayor = High, moderada = Medium, menor = Low, trivial = Lowest); override with a one-line justification (Part 5.1).
- Mode comes from `$ARGUMENTS`: a first token naming a mode (`single-issue`, `sprint-wide`) is the mode and the rest is forwarded. Otherwise ask the mode question; never infer it.
- Three stages, always in order: Stage 1 Planning, Stage 2 Execution, Stage 3 Reporting. Stages 4, 5 and 6 go to `test-documentation`, `test-automation` and `regression-testing`.
- QTU (optional audit aid): when Stage 3 approves a Story (`qa_sign_off` to `{{jira.status.story.qa_approved}}`), write `{{jira.quality_token_usage}}` if the harness shows the tokens (K = input plus output, cache reads reported separately) or a human enters them. Empty is a valid, stated N/A and never fails a verifier; when the field is absent, use a structured Jira comment. The value is cumulative: when the Story returns to QA (retest, `back_from_qa_approved`, fix loops), read the current value first, add this cycle's measured delta, never overwrite, and post one comment `QTU cycle N: +x K (total y K) source=<harness|human>`; an empty current value gets just this cycle's delta. Never estimate or invent a number.
- Jira is the source of truth. Read tickets with `bun run jira:sync-issues get <KEY> --include-comments`, then the synced `.md`. Never use `acli workitem view` for custom fields (it returns `null`).
- Bugs run the veto, triage and risk-score decision tree before any ATP is written.
- Stage 1's Shift-Left short-circuit is fail-closed: the `shift-left-reviewed` and dated labels alone run the full flow. Phases 1-3 are skipped only on cited evidence: a pre-sprint ATP body in the synced `acceptance-test-plan.md` (or its `## Acceptance Test Plan (ATP)` fallback comment), a dated label under 30 days old, and refined ACs that still match the Story. Stage 1 writes neither those labels nor that field before the check (`references/acceptance-test-planning.md` §0.0).
- Execution is a smoke pass first, then trifuerza (UI/API/DB) exploration; capture evidence under the PBI folder.
- A TC is PASSED or FAILED only when observed in the environment its precondition names; a unit test, green CI, a code read or another environment leaves it NOT RUN. NOT RUN runs the blocking ladder (recreate, then QA defers with a follow-up task, then developers, then the owner if unsure) and is never recorded FAILED. Canon: `agentic-qa-core/references/discovery-driven-doctrine.md` §5.
- API testing is a three-tool maneuver: the OpenAPI MCP for the schema (read-only), `bun run api:login` for the token (written to `.auth/tokens.env`), and **curl** for authenticated requests. Never execute through the OpenAPI MCP. Canon: `agentic-qa-core/references/api-testing-doctrine.md`.
- Every role signs in through the app's own login only (UI form to `.auth/<env>-<role>.json`, or `bun run api:login --role <role>`). Never obtain a session through a service-role or admin key, an admin user-management API, a server-generated magic link or reset token, a locally signed JWT or a database session row; seeding test DATA through API or DB stays allowed. An auth story runs end to end through a real inbox (`/resend-cli`); `production` uses dedicated synthetic QA accounts only. A check that seems to need a shortcut is a blocker to report. Canon: `agentic-qa-core/references/browser-sessions.md` §4.
- Consult `business-domain-context` (`bun run context:map business-domain-context`) before authoring the ATP, refined ACs and TC outlines.
- On any subagent failure: stop, report the partial state, offer retry / skip-stage / abort. No auto-fix, no auto-rollback. A skill that itself broke (a wrong step, a missing verifier, a stale rule) is reported upstream per `../agentic-qa-core/references/upstream-feedback.md`: drafted and redacted locally, filed only on explicit OK, verified with `gh issue view`.
- Stage 1 Set-first order (Modality jira-xray, authoritative): the Story's coverage backbone is its **ATS** (`ATS: {US_ID}: {story title}`, mandatory per Story even with one TC; parent: QA Test Artifacts epic; components inherited from the Story). Create the sprint `Test` issues, put all of them in the ATS, and link ATS to Story via the `test` slug (Story `is tested by` ATS): the primary coverage-bearing edge, which fills the Xray coverage panel. A direct TC to Story link is the only other one (last resort, only when no ATS can exist). Story-to-ATP and Story-to-ATR links are administrative and carry zero coverage.
- The ATP item is find-or-created from the `{{jira.acceptance_test_plan}}` field (pre-sprint the ATP lives only there; Stage 1 is where the Test Plan item is born, parent: QA Master Test Plan epic). The ATP's and the ATR Execution's test lists are derived from the ATS membership, never kept as independent id lists (three hand-kept lists drift and corrupt coverage).
- ATR always with environment (hard gate): create the ATR or retest Execution carrying the Test Environment resolved from `active_env` in `.agents/project.yaml` (or the session env switch). An Execution without environment fails the Stage-1 DoD gate (`agentic-qa-core/references/stage-gates.md`).
- TC in ATS membership is always a TC to ATS `test` issue link, in both modalities; jira-xray also writes the Xray-internal membership (GraphQL), never instead (`agentic-qa-core/references/traceability-linking.md` §9). TC in ATP and TC in ATR stay Xray-internal. Link TCs directly to the Story only as a last resort, for instances with no Test Set work type.
- Bug retest (Modality jira-xray): one repro `Test` by default, created at fix-verification time (Stage 2), linked Bug to Test via the `test` slug and executed in the retest Execution (`ReTest: {BUG_KEY}: {summary}`); 1:N only with a written test-design justification. Modality jira-native: no in-sprint TCs (the bug is the immediate retest case); persistent-Test decisions defer to Stage 4.
- STP find-or-create fires on the sprint's first ticket: `STP: Sprint#{N}: {objective}` (Test Plan item, parent: QA Master Test Plan; a living planner, so append each tested ticket and keep progress current). The sprint recap Execution `STR: Sprint#{N}: Regression Testing` (parent: QA Test Artifacts) is created at sprint close and links to both the STP and the RTP (dual `testPlan` membership). RTRs recorded during the sprint (`RTR: {scope-id}: Regression Testing`, one per regression verdict) belong to `/regression-testing`.
- Two modes, asked at Session Start and never inferred: `sprint-wide` (the whole sprint's QA backlog) or `single-issue` (one issue from it). Only `sprint-wide` creates or updates the STP and the sprint session pair; `single-issue` creates neither.
- Scope (single-issue or sprint-wide) is one axis; executors (1 or N) is the other. One executor is the default and unchanged in every detail. N>1 ("fleet mode") is sprint-wide only and fires when the user answers the executors question with N (`orchestration.max_workers` in `.agents/project.yaml` is a round cap, never a switch). The orchestration gate decides only who opens the sessions (pass: Orca launches and supervises; fail: the human pastes the same launch lines), never what an issue's pipeline does. Canon: `sprint-testing/references/fleet-conductor.md`.
- Fleet mode invariants: the launch file is always written (without the gate the human pastes its N lines), and when the gate fails the orchestration tool is never named to the user. A worker is single-issue mode, detected from the prompt token `fleet worker` plus its brief (env vars are an optional extra signal on the human-paste path only). A worker has no checkpoints, cannot skip its preflight MCP probes, makes zero sprint-altitude writes, never writes its Epic's `## Module Context (QA)` section (it stages `## Module Learnings (candidate)` in its `test-session-memory.md`; the conductor publishes once per module), and runs to `worker_done` without returning to its prompt. **Rounds** (concurrency groups) are not **waves** (Jira-status buckets).
- `sprint-wide` is a real session scope, not a folder: `.session/sprint-testing/sprint-<N>/{plan.md, progress.md}` per `agentic-qa-core/references/session-management.md` §6/§7, holding one nested `<JIRA-KEY>/` sub-scope per issue. `plan.md` is the local STP (queue, waves, assignment); `progress.md` is the append-only sprint log, one entry per issue close. There is no local sprint tracker file; anything the team needs lives in the STP in Jira.
- Sprint scope is a JQL query, never a hardcoded issue-type list: take the work types declared `coverable: true` in `.agents/jira-required.yaml`, resolve each one's `jira_issue_type` (`A | B | C` is an ordered list of alternatives, the first the instance has wins), and intersect with `.agents/jira-workflows.json`. A declared type the instance lacks is skipped with a note, never a blocker.
- STP maintenance parity (concurrent testers): `plan.md` mirrors the STP issue description, which is rewritten wholesale, so one writer (whoever plans the sprint) and read first before writing. `progress.md` mirrors the STP issue comments, append-only on both sides, one comment per issue close, so two testers never clobber each other. Where the comment log and a Story's ATR disagree, the ATR wins: it is the artifact of record.

**Read full SKILL.md when**: starting a sprint cold, resuming a session, or handling a bug-triage / sprint-wide flow not covered by the rules above.

> Source: `.agents/skills/sprint-testing/SKILL.md` · phase: `unknown` · kind: `workflow` · stage owner · source: frontmatter `compact_rules` (verbatim)

---

## Skill: test-automation

**Purpose**: Plan, write and review KATA tests on Playwright and TypeScript, or explain existing automated tests read-only.

**Compact Rules**:
- "All ACs covered" is the floor, not the success bar. The ATC set also covers risk beyond the AC: invalid and boundary inputs, auth and error paths, state transitions, and anomalies the AC is silent on.
- 1:N is the default: one AC maps to several ATCs. EP-merge collapses same-behavior inputs inside one partition into a parameterized ATC; it never collapses across distinct partitions, boundaries or states. BVA cases are required wherever a range, limit, length or date window exists, because EP alone misses off-by-one.
- Apply techniques by trigger: EP always; BVA on ranges and limits; State-Transition for stateful flows; Decision Table when 2+ conditions interact; Pairwise when 3+ combinable factors (log the reduction).
- Same-behavior data variants become ONE parameterized `@atc` per partition, not N ATCs; split only when the action, outcome or state differs (doctrine §"Part 2.5"). Run the Test-Design Checklist before finalizing the plan.
- Plan, Code, Review always run in order, even for a one-test regression, behind the TC source gate (also first on every resume). Only `Candidate` TCs are automated. In scope are the Tests at `candidate` whose `Verdict signed:` ROI comment has Jira `created` AND `updated` older than this run's start. Manual and recorded-Deferred Tests are listed out of scope. Stop and route to `/test-documentation` only on a named TC that is not a signed Candidate, a Test with no verdict, or zero signed Candidates. The run never signs, never waits for a signature, never creates a Test, never scores ROI and never fires a verdict transition. Signed ROI is a hard gate and never collapses.
- A TC reaches `automated` (labels `+automated -automation-candidate`) only when its code is on the production branch (`git_strategy.branches.production`). A merge into an integration branch or a suite trunk is not `automated`. Canon: `agentic-qa-core/references/discovery-driven-doctrine.md` §6.
- Fixtures: API-only uses `{ api }` (no browser), UI-only `{ ui }`, hybrid `{ test }`. An ATC never calls another ATC; a reusable chain goes in a Steps module. At most 2 positional params (3+ take an object param). Locators stay inline until 2+ uses. Imports go through aliases, never relative paths. Public methods fail fast; utilities fail silently (return null).
- Check `kata-manifest.json` before adding a component or an ATC (the anti-duplication gate).
- Mode comes from `$ARGUMENTS` (see Mode routing): `explain` or `automate`; ask when it could be either.
- Before a step that uses a declared MCP capability (`metadata.requires_capabilities`: `db`, `api-schema`), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8: when no available tool provides it, stop and name the capability and how to enable it. No silent fallback.
- Review runs on two axes besides the three verifiers: spec compliance and standards, checked by separate subagents, with a lying-test check on every new assertion (Phase 3).

**Read full SKILL.md when**: writing KATA component code, choosing fixtures for a hybrid flow, or applying the Phase 3 review checklist.

> Source: `.agents/skills/test-automation/SKILL.md` · phase: `unknown` · kind: `workflow` · stage owner · extraction strategy: A

---

## Skill: test-documentation

**Purpose**: Document already-validated tests in the TMS: ROI verdicts, TCs, ATP and ATR.

**Compact Rules**:
- An AC-to-TC map is the floor: at least one TC per AC is a minimum, never a target. Coverage is AC conformance plus risk beyond the AC, so the set includes the boundary, negative, state and anomaly cases the AC is silent on. Canon: `agentic-qa-core/references/test-design-doctrine.md`.
- 1:N applies to derivation, not to the regression repository. Only regression-worthy scenarios (Candidate or Manual) are persisted; most are Deferred. jira-native: Stage 4 creates `Test`s for those only (Deferred is report-only). jira-xray: Stage 1 already made the sprint `Test`s, so Stage 4 promotes the regression-worthy ones into the Test Plan and enriches them. Document because it will be re-run, never to hit a count.
- Techniques by trigger: EP always; BVA for a range, limit, length or date window; State-Transition for stateful entities; Decision Table when 2+ conditions interact; Pairwise when 3+ factors combine.
- Parametrize: same-behavior data variants are ONE Test (`Scenario Outline` + `Examples` rows) per partition. Split only when action, outcome, status or state differs. Canon: doctrine §"Part 2.5".
- Cross-cutting characteristics (XSS, perf, a11y) deferred to app-level suites are an explicit handoff: name the receiving suite or file the gap.
- Document already-validated behavior only (discovery-driven: `oracle: confirmed`). Exploration belongs to `/sprint-testing` and `/exploratory-testing`.
- TC identity is Precondition + Action + verifiable outcome. Naming: `{US_ID}: TC#: should <expected outcome> [<connector> <condition>] [given <precondition>]`; `Validate <feature>` is reserved for the grouping layer. Reject `"Login test"`, `"Login - error"`, `"TC1: Test form"`.
- ROI gives each TC one verdict: Candidate (feeds test-automation), Manual, Deferred. Prioritize by risk.
- No ROI verdict while a scenario is `oracle: observed`: it needs a person's answer to "is this intended?" first (decision-protocol kind 1). Canon: `agentic-qa-core/references/discovery-driven-doctrine.md` §4.
- A Candidate or Manual verdict is fired only after a person signs it (a batch through the `mkd` deck, one verdict through the question tool). The ROI comment then carries `Verdict signed: <who>, <where>, <when>` with a checkable `<where>`, the line the TC source gate of `/test-automation` reads. Only an attended session writes it; a subagent, worker or routine lists verdicts as pending. Format: `references/tms-conventions.md` §9.
- Discovery intake (`references/discovery-intake.md`): a COVERED candidate is dropped with a line, a WEAK one becomes a strengthen proposal for the existing test (never a new Test), a NEW one runs the full pipeline anchored to its coverage Tech Story. The >50% alarm is computed per chunk.
- `PASSED` or `FAILED` only from a run observed in the environment the TC's precondition names, else `NOT RUN` with its reason (doctrine §5). `automated` (`merged`) only once the spec is on the production branch, through mode `post-promotion` (doctrine §6).
- Cardinality: US to TC is 1:N; AC to TC is N:1 or N:M. Resolve the TMS modality (Xray or Jira-native) in Phase 0 first.
- Mode from `$ARGUMENTS`: a first token matching a mode in Mode routing (`repair-traceability`, `post-promotion`, `document`) is the mode and the rest is forwarded. Otherwise `document` for plain documentation work; ask when it could be either.
- Bug-driven (golden rule): a regression-worthy bug must end with a Test. Reuse the existing failed Test if the bug came from one, else create one (both modalities). A non-qualifying bug is treated like a failed test: Deferred, no new Test.
- The ATS is mandatory per Story (`ATS: {US_ID}: {story title}`, even with one TC): a `Test Set` holding all the Story's TCs, parented to the QA Test Artifacts epic, with `components` inherited from the Story. Components are mandatory here; the exemption covers only the optional feature-level `TS:` sets.
- Create sets first: find or create the ATS, ATP and ATR before the first TC (module-driven pre-creates them because parallel TC sharding needs the targets). Add each TC to the ATS, then derive the ATP's and the Execution's test lists from the ATS membership, never three independent id lists.
- Coverage truth (`xray-cli/SKILL.md` §Direction): coverage comes from the ATS-to-Story `is tested by` link (primary) or a direct TC-to-Story link (last resort, only when no ATS can exist). Story-to-ATP and Story-to-ATR links are administrative and contribute zero coverage: keep them, never count them.
- Membership: TC in ATS is always a TC-to-ATS `test` issue link, in both modalities (never in the TC title). jira-xray also writes the Xray-internal membership (GraphQL, via `/xray-cli`), never instead. TC in ATP and TC in ATR stay Xray-internal. Test Set work type absent means no ATS (canon: `../agentic-qa-core/references/traceability-linking.md` §9).
- Direct TC-to-Story links are the last resort (only when no ATS can exist, such as jira-native without the Test Set work type), not the default. The defect is a TC with no path to its Story, not the direct link itself.

**Read full SKILL.md when**: resolving TMS modality, computing ROI, writing Gherkin, or wiring US-ATP-ATR-TC traceability links.

> Source: `.agents/skills/test-documentation/SKILL.md` · phase: `unknown` · kind: `workflow` · stage owner · source: frontmatter `compact_rules` (verbatim)

---

## Skill: test-framework-adaptation

**Purpose**: Adapt this boilerplate's KATA architecture, auth, variables, fixtures, CI and MCPs to a project that project-discovery already mapped.

**Compact Rules**:
- Phases 0-2 are analysis and planning only. Phase 3 starts after explicit approval of `.context/reports/test-framework-adaptation-plan.md`; the reference says who approves when no person is present.
- Run the genericness scan every time. A repo that is already adapted gets a report and no new work.
- Stop at a missing credential or MCP value and name the variable. A secret value is typed by the user, never through the chat.
- Run the verification gate in its order and stop at the first failure.

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/test-framework-adaptation/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: A

---

## Skill: xray-cli

**Purpose**: Run Xray Cloud test management through the `bun xray` CLI.

**Compact Rules**:
- Confirm the project is in Modality jira-xray before invoking anything here. A jira-native project (no Xray plugin) routes to `/acli` instead. `/test-documentation` Phase 0 resolves the modality once and later phases inherit it; never mix the two modalities in one phase.
- Call this CLI only from this skill. Workflow skills write `[TMS_TOOL]` pseudocode and load this skill.
- Pass an explicit `--limit` above the expected count on every list command. All of them default to a small `--limit` (see `cli/xray`) and truncate silently. Read the true count from the `(N total)` header, not by counting rows; a truncated read looks exactly like data loss.
- Capture the key of anything you create from the bare `KEY <PROJ-123>` line or from `--json`, not from the decorated success line. A create whose key was not captured leaves an orphan artifact nothing downstream can link.
- Create a Manual test without inline steps, add one step per call, then verify the steps landed. Xray Cloud silently drops steps passed at creation.
- Pin every ATR execution to a Test Environment (value from `active_env`) so results stay comparable across runs. Repair an execution that slipped through without one in place.
- Keep the Set-first cascade: the per-Story ATS holds the membership, and the Plan (ATP) and Execution (ATR) derive their test lists from it instead of keeping their own.
- Fill Story coverage with the Jira-layer issue link from the ATS to the Story. Plan to Story and Execution to Story links are administrative traceability and cover nothing; a direct Test to Story link is a last resort for an instance with no Test Set work type. Plan, Execution and Set membership is Xray-internal GraphQL; membership of the Story's ATS is also a TC to ATS `test` issue link (`link create <TC> <ATS> --type test`), in both modalities (`agentic-qa-core/references/traceability-linking.md` §9).
- State the coverage direction as the raw field: on a Story, the counting edge is the `issuelinks` entry carrying the artifact under `inwardIssue`. The artifact-first argument order produces it. Verify against Xray coverage (the three-edge check or the coverage panel), never against Jira link semantics, because a Jira link list looks correct in both directions.
- Replace an inverted coverage link; do not add a corrected one on top. Jira dedupes a link between the same pair and type regardless of direction, so the create is a silent no-op until the wrong link is deleted by its own link id. Read the id first, dry-run, then delete with an explicit confirmation.
- Verify traceability with the one-call three-edge check, not from the coverage edge alone. A missing ATP to Story or ATR to Story link is a FAIL, and the same call compares the ATS membership against the Plan and Execution test lists. Sweep a whole project (several keys or a JQL query) at least once per engagement: an inverted link is invisible per Story and only shows as a pattern in aggregate.
- Treat Xray run statuses as per-instance vocabulary. `TODO`, `EXECUTING`, `PASSED` and `FAILED` are the safe floor; `ABORTED` and `BLOCKED` are Xray defaults a project may not define, and the mutation is rejected when it does not. Record a blocked case in a status the project does define and explain it in the run comment. A run left `TODO` reads as never executed.
- When a Jira-fallback path created the container without authenticated Xray, the Xray layer never registered the tests and runs come back empty. Reconcile with the per-entity sync (or the bulk repair scan) before importing results.
- Import results onto an existing Execution key, never scoped to a project. The import API cannot set a parent, so a project-scoped import mints a fresh unparented Execution on every run, outside the artifact ladder.
- Import nothing that could create or rewrite a Test. `import junit` refuses any testcase without a `test_key` / `test_id` inside its own `<properties>` (or with two keys, or with `test_summary` / `test_description` / `tags`) and `import xray` refuses `testInfo` or a missing, malformed or repeated `testKey`, naming each one. Import a KATA run per ATC with explicit keys (`bun run xray:payload`, then `import xray`), not as its `junit.xml`. A missing Test is created by `/test-documentation` behind a signed ROI verdict, never by an import.
- Build Xray JSON payloads only with this CLI, and re-authenticate once the bearer token passes its 24h TTL. A stale token produces silent 401s mid-import that read like network blips.
- Dry-run any import or backup restore before applying, and verify the target Test Plan and Test Execution keys exist first (`exec get` / `plan get`); orphan results are rejected and abort the whole import. Both commands write irreversibly across hundreds of tests and runs.
- When moving between sites, restore in sync-by-key mode (GraphQL ids are re-assigned per site, keys are not), re-authenticate between export and restore because auth holds one site at a time, and finish with the Jira instance-migration flow: field ids are reassigned and an old id silently resolves to a different field.
- Push no run results for TCs the ROI verdict marked terminal-Manual (`to_be_automated=no`). It creates audit noise and breaks the Candidate / Manual / Deferred reporting.
- When Xray credentials are missing or broken, stop per Critical Rule #10: name `XRAY_CLIENT_ID` / `XRAY_CLIENT_SECRET`, point at `.env`, and ask for a session restart. Nothing reaches the Xray GraphQL layer without them.
- Two writes are irreversible and need an approval source: applying a `backup restore` after its dry-run, and the credential fix (Critical Rule #10). With a person present, ask. With a supervised worker, the conductor holds the gate. In a routine with nobody, the delegating brief is the approval when it names the restore; otherwise do the dry-run, stop and report (`agentic-qa-core/references/decision-protocol.md`). Importing results onto an existing Execution, after the dry-run and the key check, is the stage's normal write and needs no extra confirmation. `link delete` runs with `--yes` after its dry-run, inside the repair the trace call justified.

**Read full SKILL.md when**: composing a specific command, wiring the canonical end-to-end Story flow, running backup/restore or a cross-site migration, or enriching the synced PBI cache.

> Source: `.agents/skills/xray-cli/SKILL.md` · phase: `unknown` · kind: `utility` · extraction strategy: A
