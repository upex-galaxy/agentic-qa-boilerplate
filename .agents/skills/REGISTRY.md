# Skill Registry (auto-generated)

> Generated: `2026-11-15T08:45:13.764Z`
> Generator: `bun scripts/build-skill-registry.ts`
> Protocol: `.agents/skills/agentic-qa-core/references/skill-resolver.md`

This file is the per-session compact-rules cache for the Skill Resolver protocol.
The orchestrator copies one or more `## Skill: <slug>` blocks below into every subagent briefing under `## Project Standards (auto-resolved)`.
Subagents trust those compact rules and only read the full SKILL.md when explicitly instructed.

Skills indexed: 29

---
## Skill: acli

**Purpose**: Atlassian CLI (`acli`) for Jira, Confluence and org admin from a terminal or CI.

**Compact Rules**:
- Pass `--paginate` (or an explicit `--limit`) on any search whose result is counted, iterated or decided on. Pagination is opt-in and truncation is silent: there is no warning.
- Exit 0 does not prove a subcommand exists. An unknown subcommand falls back to the parent help and exits 0, so check that the help body actually changed. Every multi-word flag is kebab-case; do not invent flags.
- Verify auth status before any bulk mutation (`acli jira auth status`). Auth is per product (jira, confluence, admin and global are separate sessions), and a silent expiry leaves the batch half-applied with no clean rollback (T4).
- Pass the non-interactive confirmation flag on every mutating command in CI, or the command hangs waiting on stdin.
- Author rich text in Markdown, convert it with `scripts/md-to-adf.ts` and pass the ADF (T1). The CLI never converts Markdown and stores the literal characters, and hand-written ADF trips the combined-marks bug.
- Let the converter's validation gate run on every ADF document before publishing, and read the field back after writing. The gate catches node-level errors; only the read-back catches Jira's silent server-side coercion.
- Measure the serialized ADF of every rich-text value (description, comment, rich-text custom field) before writing it: `jq -c . <file>.adf.json | wc -m` must stay at or under 30000 (T5). Jira's cap counts the ADF JSON, which is several times longer than the Markdown. Over budget means stop and propose which sections move where; truncating, or splitting one value across two fields or comments, is off the table. Detail: "Size budget" under "Publishing rich text".
- `workitem edit` takes no custom-field values. It hard-rejects every shape with exit 1, so editing a custom field on an existing item works only through the REST PUT path (T3).
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

**Purpose**: Walks new users through this repo's QA flow — Playwright + KATA + Allure + Xray stack, Jira QA state machine (statuses read from `.agents...

**Compact Rules**:
- DO: act as a guided tour, not an executor. The tour ends the moment the user knows which skill to call; hand off there and step back.
- DO NOT: do the downstream work yourself. Pre-sprint refinement is `/shift-left-testing`, per-ticket QA `/sprint-testing`, TMS authoring `/test-documentation`, automated tests `/test-automation`, suite runs `/regression-testing`, a new target repo `/project-discovery`, KATA adaptation `/test-framework-adaptation`.
- WHEN someone is lost or asks how a skill works: suspend the terse working register for the whole explanation — full sentences, warm tone, and each technical term defined the first time it appears. Resume the normal register once they are oriented.
- DO: mirror the user's language in the explanation. The visual decks ship in Spanish only (technical terms stay English) — say so before opening one for an English speaker.
- WHEN the goal is unclear: ask ONE question first (testing a ticket, or understanding the whole flow?). Never dump every stage on someone who asked about one.
- DO: name a stage by its word (Shift-Left, Planning, Execution, Reporting, Documentation, Automation, Regression, Observation), never by number. A "Stage N" in an older doc resolves through `agentic-qa-core/references/stage-gates.md`; the why behind the stages is `iql-context`.
- WHEN someone asks about running several sessions at once ("parallelize the sprint", "one session per story", "orquestar", "lanza workers"): explain the two executors in plain words — a one-shot subagent lives inside the current turn and is the default for almost everything, a supervised worker is a persistent session you keep talking to — then hand off to `/orca-orchestration`. Its deck is `packages/decks/orca-orchestration/how-it-works.es.html`.
- DO: explain the concept in plain words, and why it matters, BEFORE any command, flag, or file path.
- DO NOT: open a how-it-works deck without asking — it launches the user's default browser. Open exactly ONE, then let them come back with questions before offering the next.
- WHEN opening a deck: prefer the published GitHub Pages URL over the local file, because a project scaffolded from this boilerplate may not carry the HTML. Use the local copy only offline or on explicit request.
- DO: route a brand-new project through the ordered 4-phase setup path (foundation → Jira catalogs → discovery + adapt → git Strategy Setup). The joining-an-adapted-project checklist covers phase 1 only and is not a substitute.
- DO NOT: state a Jira status or transition from memory. `.agents/jira-workflows.json` is authoritative — if a status is not in there, it does not exist in the instance.
- DO: point library-docs questions at Context7 and troubleshooting at the `web-search` capability (a harness-level server); ticket WRITES at `/acli`, and detailed ticket READS (custom fields, ACs, ATP/ATR, comments) at the Jira sync script, whose synced `.md` is what you read.
- DO NOT: suggest swapping the stack. Playwright + KATA + Allure + TypeScript + bun is locked, and KATA is Playwright-specific — a project needing another runner should not start from this boilerplate.

**Read full SKILL.md when**: walking the full 4-phase new-project setup, listing env vars or MCPs in detail, or answering which deck covers a given topic.

> Source: `.agents/skills/agentic-qa-onboard/SKILL.md` · phase: `bootstrap` · kind: `workflow` · extraction strategy: A

---

## Skill: bug-screenshot-annotation

**Purpose**: Turns a raw bug screenshot into a QA-style annotated evidence image — circles/ovals around the broken region, arrows, callout text boxes,...

**Compact Rules**:
- DO NOT route a QA screenshot through ANY external image service, generative or otherwise — real product/customer data is in the frame. Explicit user authorization in chat does NOT lift this; everything renders locally over a loopback HTTP server and a local browser capture.
- WHEN a bug is visual or positional (overlap, misalignment, wrong date/offset on an axis, an element in the wrong place) and a raw screenshot would need a paragraph to explain: annotate it. DO NOT use this skill to file the bug itself, or on before/after shots that already read clearly raw.
- DO: work from a screenshot that already exists on disk. This skill overlays shapes on an existing image; it never generates or edits an image from a text description.
- DO: produce exactly ONE evidence file — the final annotated PNG in the ticket's `evidence/` folder, named `{KEY}-BUG-{BUG-KEY}-annotated.png`. The crop and the annotation HTML are scratchpad working files, never written to `evidence/` and never cited from a ticket.
- DO: copy the commented overlay blocks from `references/shapes.html` instead of designing from scratch, and keep both its z-index scale (base image → shapes → callout boxes → corner badge topmost) and its utf-8 meta tag; a copied block that drops either produces a hidden badge or mojibake.
- DO NOT: load the annotation HTML over `file://` — the browser-automation CLI refuses it before rendering. Serve over loopback HTTP, and kill that server before the session ends.
- DO: size the capture viewport equal to or larger than the HTML canvas. A smaller viewport clips callouts.
- DO: read the rendered PNG back and expect at least one adjustment pass (move a circle, rewrap callout text, nudge the badge out of a collision). It is not one-shot.
- DO: state the final PNG's repo-relative path in chat the moment it lands, unprompted, and repeat it leading the "Bug annotations" group in the session-close screenshot list.
- WHEN embedding the annotated PNG into the bug issue: offer it and let the human confirm first; once published it leads the bug's Evidence section, ahead of the raw capture.
- DIRECTION: the evidence page (the `evidence-artifact` skill) keeps marks as data on one page per ticket and per bug; when a ticket has one, link it and keep this PNG only where a tracker needs an inline image.

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

**Purpose**: What the system under test IS at the data level: business entities and why they exist, their relationships, state machines, automatic pro...

**Compact Rules**:
- DO: read the map through `bun run context:map business-data-context` (or `--section <id>` for one entity or flow). NEVER read `references/business-data-map.html` raw: its SVG is most of the bytes and none of the facts.
- DO: treat a placeholder map as "no map". Say so and hand the user `project-context` mode `data`; never answer data questions as if the system were empty.
- DO: cite a fact with its section id and `data-updated` date. A section older than the code it describes is a hypothesis to check with `[DB_TOOL]`, not an answer.
- WHEN a session observes something that contradicts a section: PROPOSE the one-section edit with its evidence to the user (or to the conductor when you are a supervised worker), apply it only on approval. Procedure: `references/refresh.md`.
- DO NOT: write anywhere but this skill's own `references/`. No Jira, no `.context/`, no other skill, no product code.
- DO NOT: copy map content into this SKILL.md. Judgment (a rule for READING the data) goes in `## Rules` or `references/gotchas.md`, dated and measured.
- Before a step that uses `db` (verifying a section) or `diagrams` (redrawing a figure), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8.

**Read full SKILL.md when**: building a briefing for a DB-level dispatch, deciding whether a section is stale, or proposing an edit to the map.

> Source: `.agents/skills/business-data-context/SKILL.md` · phase: `unknown` · kind: `context` · extraction strategy: A

---

## Skill: business-domain-context

**Purpose**: The vocabulary and the business of the system under test: what the product is for, who pays and why, and what every domain term means (th...

**Compact Rules**:
- DO: read the map through `bun run context:map business-domain-context` (or `--section term-<slug>` for one term). NEVER read `references/business-domain-map.html` raw.
- DO: treat a placeholder map as "no glossary". Say so and hand the user `project-discovery` Phase 1; never name test cases or rewrite ACs in invented vocabulary.
- DO: use the business term the map gives, and quote the UI label when a step talks about the screen. The code identifier belongs in code and selectors, never in a TC title or a bug summary.
- WHEN a session observes a term the map lacks, or a label or meaning that contradicts a section: PROPOSE the one-section edit with its evidence to the user (or to the conductor when you are a supervised worker), apply it only on approval. Procedure: `references/refresh.md`.
- DO NOT: write anywhere but this skill's own `references/`. No Jira, no `.context/`, no other skill, no test code, no product code.
- DO NOT: copy map content into this SKILL.md. Judgment goes in `## Rules` or `references/gotchas.md`, dated and measured.
- Figures are optional here: the glossary is tables. Before a step that draws one, run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8.

**Read full SKILL.md when**: building a briefing for an ATP, TC naming or AC refinement dispatch, deciding whether a term is stale, or proposing an edit to the map.

> Source: `.agents/skills/business-domain-context/SKILL.md` · phase: `unknown` · kind: `context` · extraction strategy: A

---

## Skill: business-e2e-context

**Purpose**: How people actually use the system under test end to end: the personas, the user journeys first (entry point, steps, branches, where mone...

**Compact Rules**:
- DO: read the map through `bun run context:map business-e2e-context` (or `--section <id>` for one journey or feature). NEVER read `references/business-e2e-map.html` raw: its SVG is most of the bytes and none of the facts.
- DO: treat a placeholder map as "no map". Say so and hand the user `project-context` mode `e2e`; never plan E2E coverage as if the product had no journeys.
- DO: start from the journey, then the feature. A story is tested inside the journey that reaches it; the feature catalog answers "what exists", the journeys answer "what a user does and where it breaks".
- WHEN a session observes something that contradicts a section (a step, a branch, a state the UI shows): PROPOSE the one-section edit with its evidence to the user (or to the conductor when you are a supervised worker), apply it only on approval. Procedure: `references/refresh.md`.
- DO NOT: write anywhere but this skill's own `references/`. No Jira, no `.context/`, no other skill, no test code, no product code.
- DO NOT: copy map content into this SKILL.md. Judgment goes in `## Rules` or `references/gotchas.md`, dated and measured.
- Before a step that uses `diagrams` (redrawing a figure), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8.

**Read full SKILL.md when**: building a briefing for a UI or E2E dispatch, scoping a smoke or regression run, deciding whether a section is stale, or proposing an edit to the map.

> Source: `.agents/skills/business-e2e-context/SKILL.md` · phase: `unknown` · kind: `context` · extraction strategy: A

---

## Skill: evidence-artifact

**Purpose**: Turns a ticket's test evidence into ONE private claude.ai page (an Artifact) that a developer or PM can open and read: a verdict header,...

**Compact Rules**:
- DO: load this skill in any dispatch whose stage captures evidence (sprint-testing Stage 2) or reports it (Stage 3, filing a bug), and append every proof to `<PBI>/evidence/evidence-pack.json` AS you test, never reconstructed at the end.
- DO: take marks from the element's box via `playwright-cli eval` (`coords: "px"`); do NOT read a screenshot back to place a mark unless no element reaches it.
- DO NOT: mask with a mark. Personal data on screen goes in the image's `redact` boxes, which the build burns into the pixels.
- DO NOT: put a trace, a HAR, a token, a cookie or an `.auth` file in a pack. Credentials in API/SQL text are written as `<redacted>`; the build refuses the rest and names the field.
- DO: give a bug its own pack (`evidence-pack-<BUG>.json`, `kind: "bug"`, a `repro` case) once the bug issue exists, and build and publish bug pages BEFORE the story page: a story's `RETEST PASSED` / `RETEST FAILED` bug card is refused unless the bug's own pack confirms it.
- DO: build with `bun run evidence build --pack <pack>`; it needs Python 3.9+ and Pillow and names the one thing to install when either is missing.
- DO: publish with the Artifact tool; when the pack already has `artifact.url`, run `Artifact action: "read"` on it first and publish with that `url`. Omitting `url` mints a second page and orphans every link.
- DO: record the URL with `bun run evidence record --pack <pack> --url <url>` and on the board (`bun run board evidence-artifact <KEY> <url> [--bug <BUG>] --by worker`), add it to the issue with `bun run evidence link --pack <pack>`, then link it from the ATR, the bug description, the QA comment footer and each TC's notes.
- DO: embed a bug's ONE thumbnail with `bun run evidence attach --pack <bug pack>` (`--dry-run` first prints every call), after the bug page link is in its Description; write "(image embedded below)" and pass `bun run board bug ... --evidence-embedded` only once a live run printed `read-back OK` (a dry run never does).
- DO NOT: run `bun run evidence attach --replace` without a person's OK: it deletes the bug's earlier thumbnail attachment, which cannot be undone. `attach` refuses on its own when an earlier thumbnail (same name, other bytes) is there.
- DO: on a retest, keep every earlier case and item with its `round`, set `currentRound` and `rounds[]`, append the retest case, and republish to the SAME URL. A retest never passes on a DEFERRED case.
- DO: report the URLs as published private for the owner to share; when the Artifact tool is unavailable, report the pack path instead (the conductor publishes).
- DO NOT: send evidence to any external image service, whatever the chat authorises.

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/evidence-artifact/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: A

---

## Skill: exploratory-testing

**Purpose**: Ticket-free exploratory testing of a critical flow, a module or the whole product, across UI, API and DB together, in the Execution stage.

**Compact Rules**:
- Ticket-free entry into the Execution stage: the scope is a flow, a module or a sweep, never a ticket key (a named ticket routes to `sprint-testing`). Mode from the first `$ARGUMENTS` token (`flow` | `module` | `sweep`), or from a request that clearly names one flow, one module or a sweep (args-as-answers); otherwise ASK.
- Five steps, always in order: Charter (main thread) -> Recon (Parallel) -> Refute (Parallel) -> Tie-break (main thread) -> Handoff (main thread). Planning and tie-breaks are never delegated. The charter is presented and confirmed before any Recon dispatch, unless the request already named the scope and said go.
- Build the coverage view BEFORE Recon: the gap list of `project-context` mode `coverage` when it exists, else `coverage-view.json` from `kata-manifest.json` + the TMS Tests read by `bun run context:coverage collect` (never by `jira:sync-issues`: Tests are `sync: never`); a TMS not read is stated `TMS not read` and no manual cover counts. Every candidate is marked NEW / WEAK / COVERED; only a counted `exercises` cover makes COVERED; a `weak`, stale or unverified cover never dedupes a candidate away.
- Compare at least 2-3 rows plus a control group before calling anything anomalous, and state the detection query verbatim.
- Refute mandate: every Medium+ anomaly gets a Parallel verifier told to REFUTE it (join fan-out, data quirk, intended behaviour, harness artifact); it survives only if it cannot be explained away. Check a row's own invariant, not just that it differs from another row; execute competing hypotheses side by side, never infer them. Canon: `agentic-qa-core/references/adversarial-verification.md`.
- Verifier disagreement goes to a main-thread tie-break: a decisive query plus a direct read of the live code path. Never a third verifier, never an average, never one agent's verdict alone on a data-integrity, money or security finding.
- Oracle: behaviour with no AC is `oracle: observed`; "is this intended?" goes to a person (decision-protocol kind 1), a batch through the `mkd` deck, a single question through the question tool. `oracle: confirmed` (who, where, when) makes the observation PASSED; `not intended` makes it FAILED and a proposed defect. Canon: `agentic-qa-core/references/discovery-driven-doctrine.md` §4.
- A candidate is PASSED or FAILED only when observed in the environment its precondition names; a code read, unit test, green CI or another environment leaves it NOT RUN with exactly one reason, BLOCKED or DEFERRED (execution), and it climbs the blocking ladder; with no coverable yet, its follow-up lives on the coverage Tech Story once approved, and until then as an item of the Handoff deck. Canon: `agentic-qa-core/references/discovery-driven-doctrine.md` §5.
- Never call anything that sends, notifies or pushes downstream; reads and previews are fine. A project's own list (`## Never-call endpoints` in `agent-project.md`) is carried verbatim in briefing component 7.
- Mutations only to set up a precondition, within the charter's budget. Every created row goes into `created_rows` the moment it exists; cleanup re-reads each one (a delete's response code is not proof).
- Person-signed writes: every bug (`sprint-testing/references/reporting-templates.md` §1, gate §1.12, classified per `defect-management-doctrine.md` Part 1), every coverage Tech Story (`discovery-driven-doctrine.md` §3), every module-context write. This skill creates no Test and scores no ROI.
- Evidence that reaches a person goes through the `evidence-artifact` skill; raw captures stay in the session `evidence/` until a coverable exists.
- On any subagent failure: STOP, report which surface or finding failed, offer retry / skip-surface / abort; a skipped surface is recorded "not covered this round", never dropped silently. A skill that itself broke is reported upstream per `agentic-qa-core/references/upstream-feedback.md`.

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
- Never force-push, `--force-with-lease`, `--no-verify`, amend or rebase a pushed commit, or otherwise rewrite pushed history, unless the user explicitly authorizes it AND the branch is unshared.
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

**Purpose**: How the system under test is built, run and deployed: its architecture and external services, the backend and frontend stacks with their...

**Compact Rules**:
- DO: read the map through `bun run context:map infra-context` (or `--section backend`, `--section environments`, ...). NEVER read `references/infra-map.html` raw: its SVG is most of the bytes and none of the facts.
- DO: treat a placeholder map as "no infra map". Say so and hand the user `project-discovery` Phases 2-3; never guess a run command, an environment URL or an auth flow.
- DO: take environment URLs from `.agents/project.yaml` and credentials from `.env`. The map says which environments exist and how they differ; it never holds a secret or a value that has its own source.
- WHEN a session observes something that contradicts a section (a command that no longer runs, a pipeline step, an auth request that changed): PROPOSE the one-section edit with its evidence to the user (or to the conductor when you are a supervised worker), apply it only on approval. Procedure: `references/refresh.md`.
- DO NOT: write anywhere but this skill's own `references/`. No Jira, no `.context/`, no CI files, no other skill, no product code.
- DO NOT: copy map content into this SKILL.md. Judgment goes in `## Rules` or `references/gotchas.md`, dated and measured.
- Before a step that uses `diagrams` (redrawing the architecture figure), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8. A table is fine where it says it better.

**Read full SKILL.md when**: building a briefing for framework adaptation, an environment or CI change, an auth-in-tests decision or a non-functional check; deciding whether a section is stale; or proposing an edit to the map.

> Source: `.agents/skills/infra-context/SKILL.md` · phase: `unknown` · kind: `context` · extraction strategy: A

---

## Skill: iql-context

**Purpose**: The methodology index of this repo: how the IQL (Integrated Quality Lifecycle) is structured, why the QA process runs as eight named stag...

**Compact Rules**:
- DO: answer "why is the process shaped this way" from the index below, then point at the canonical reference for the procedure; never restate a DoD, a transition table or a link catalog that a reference already owns.
- DO: name stages by word (Shift-Left, Planning, Execution, Reporting, Documentation, Automation, Regression, Observation), never by number; a numbered "Stage N" in an older doc resolves through `agentic-qa-core/references/stage-gates.md`.
- DO: read `.agents/project.yaml` → `qa.methodology` before saying which stages a project runs or how strict its gates are; the shipped values are a default, not a decision.
- DO: read `references/project-overrides.md` for the project's own rules and exceptions; they win over this index for THAT project, and only there.
- DO NOT: resolve a web-vs-repo disagreement on your own. The repo's executable doctrine (`agentic-qa-core/references/*`) is what the skills enforce; the website is the public narrative. State both readings and cite both.
- DO NOT: treat this skill as SUT knowledge. Entities, endpoints, infra and Jira content live in `.context/` maps and the project's `<aspect>-context` skills.
- DO NOT: edit this SKILL.md or its synced references in a consumer project; propose a refinement per `agentic-qa-core/references/skill-refinement-protocol.md` (project-owned prose goes in `references/project-overrides.md`).
- WHEN a question is about ONE aspect (phases and steps, the agentic contract, the eight approaches, the thirteen invariants): load only that reference from §"References".

**Read full SKILL.md when**: building a briefing that must explain the methodology to a subagent, answering "why" questions about the ladder or the stages, or checking which invariant a proposed shortcut violates.

> Source: `.agents/skills/iql-context/SKILL.md` · phase: `unknown` · kind: `context` · extraction strategy: A

---

## Skill: jira-administration

**Purpose**: Run bounded Jira administration workflows for project Components or Atlassian instance migration.

**Compact Rules**:
- Exactly ONE mode per run: `components` (`references/components.md`) or `instance-migration` (`references/instance-migration.md`). Load only that mode's reference. Never combine the two, never fall through into the other.
- Mode unclear → ASK. Do not infer one from a bare "fix Jira" / "sync Jira" request.
- Load `/acli` before any Jira operation. Load other tool-owner skills only when the selected reference requires them.
- Missing MCP or Jira credentials = HARD STOP (`AGENTS.md` Critical Rule #10). Name the exact env var, point at `.env` / `.env.example`, ask for an agent-session restart. No workaround, no partial run.
- Read-first on every mutation: inspect the live state before authoring any plan. Nothing is created, applied, deleted, or repointed without the user's explicit approval given inside the same run.
- `components`: derive and inspect → author the plan file → dry-run → WAIT for explicit approval → only then `--apply`.
- `instance-migration`: resolve and confirm BOTH instances → audit and verify reachability → WAIT for explicit approval → only then change files or the `acli` session. That session lives at `~/.config/acli` and is machine-global: re-login repoints every repo on the host, not just this one.
- The Atlassian host lives in `.agents/project.yaml` → `issue_tracker.atlassian_url` and NOWHERE else locally. A stale `ATLASSIAN_URL` in `.env` or the process environment is contamination to DELETE, never to update — a second copy is what goes stale.
- Template-repo carve-out: if `.agents/project.yaml` → `project.project_name` is `null`, the repo is an un-onboarded template. Leave `atlassian_url` and `project_key` `null`, say so in the report, and never manufacture a commit to hide the emptiness.
- Run only the selected reference's verification steps. Never run the other mode's.
- Mode from `$ARGUMENTS`: when its first token matches a mode in the Mode routing table, that token IS the mode and the rest is forwarded to it unchanged. No matching first token → ASK which mode.

**Read full SKILL.md when**: the mode is ambiguous, a dry-run diff or migration audit looks wrong, or you need the selected reference's step-by-step phases and verification list.

> Source: `.agents/skills/jira-administration/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: A

---

## Skill: judgment-day

> ⚠ LOW-CONFIDENCE (extraction strategy B): bullets scraped without context — read the full SKILL.md before relying on any rule below.

**Purpose**: Trigger: judgment day, dual review, adversarial review, juzgar.

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

**Purpose**: Acts as a QA Lead / QA Architect reviewing a pull request's test-automation work against this repo's KATA doctrine (or the target repo's...

**Compact Rules**:
- DO: run the strictness preflight (Flexible / Standard / Strict) before reading a single line of diff — unless the invocation already answered it, in which case do not re-ask what was given.
- WHEN strictness is Flexible or Standard: doctrine-pattern deviations are observations framed as a comparison, never errors, and they must not move the score the way a Real/Reliability defect does. Strict widens what counts as a finding; it still does not turn a pattern note into an error.
- DO: load the target repo's OWN doctrine in full before analyzing when it ships one — an external repo forked from this boilerplate may have evolved its conventions. Only when it has none do this repo's KATA conventions become the reference standard, and say so explicitly in the output.
- DO NOT: state a "best practice" as if the repo required it without a file:section citation. An ungrounded call is labeled as opinion, in those words.
- DO: bucket every finding into exactly one of Real/Reliability, Pattern/Doctrine-deviation, or Positive, with a severity tier (Critical/Major/Minor/Trivial) mirroring the user's language.
- DO: always populate the Positive bucket. A review with zero positives on a PR that clearly has some is uncalibrated, not rigorous.
- DO: read the actual diffs, never the PR description. On a PR too large for a single diff, page the per-file patches; check the commit headlines first so an unrelated bulk-sync or vendor-update commit is not reviewed line by line.
- DO: present the findings table + positives + a score out of 10 as a CHECKPOINT, then let the user triage and re-classify on the spot. The user's context decides what ships; do not defend the first-pass severity.
- WHEN the user has not specified tone or structure: draft praise → constructive → praise, with a real strength at each end, not a token compliment wrapped around a list of complaints.
- DO NOT: post anything to GitHub without an explicit go-ahead at the final step. Approval given earlier in the same session for a DIFFERENT PR does not carry over, and silence is not approval.
- DO NOT: delegate drafting or posting the feedback to a subagent — tone decisions and externally-visible actions stay with the orchestrator.
- WHEN a PR under review genuinely needs framework-level process: say so and point at `/framework-development`. Do not chain SDD skills from this workflow.
- DO: default the posted comment to English per the repo-artifact language rule, unless the user asked for another language for that specific artifact.

**Read full SKILL.md when**: applying the severity rubric or score weighting, probing an external repo for its doctrine, or drafting the posting flow itself.

> Source: `.agents/skills/pr-review-lead/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: A

---

## Skill: project-context

**Purpose**: Generate or refresh the business context maps (the HTML maps inside business-data-context, business-api-context and business-e2e-context)...

**Compact Rules**:
- Exactly ONE mode per run: `data` · `e2e` (synonym `features`) · `api` · `test-plan` · `refresh-all` · `context-skill` · `coverage`. Load only that mode's reference; never open a second one in the same pass.
- `context-skill` scaffolds a project-owned `<aspect>-context` for an aspect the shipped context map skills (`CONTEXT_MAP_SKILLS`) do not cover (`../agentic-qa-core/references/skill-scaffold.md` §3): it cites its sources and never copies them. `refresh-all` never includes it. Its router row goes in the `## Project context skills` table of `.agents/instructions/agent-project.md`, its trigger phrases in that file's `triggers:`; NEVER in `agent-skills-and-mcps.md`, which `bun sync` overwrites.
- `coverage` reads the maps, the KATA manifest and the TMS and buckets every behaviour (`automated` · `manual-only` · `weak` · `uncovered`); `refresh-all` never includes it. It writes only `<<PRIMARY_ROOT>>/.session/project-context/coverage/` (companion files: this skill opts out of the session Phase 0) and never edits a test or a map. The `weak` verdict and the risk level are agent judgments with one evidence line per row; the buckets, order and diff are `bun run context:coverage classify`. Coverage Tech Stories are created only after a person approves the gap list, picked by weight (`mkd` deck for per-item choices, the question tool for one yes/no).
- Mode → reference → output: see the Mode routing table. A map mode writes ONLY its own skill's `references/<map>.html`; the legacy markdown files a project may hold (the skill's `legacy` list in `CONTEXT_MAP_SKILLS`, `cli/lib/context-maps.ts`) are read as input and never deleted. Domain vocabulary and architecture come from the maps `project-discovery` generates: `bun run context:map business-domain-context` and `bun run context:map infra-context`, never a `.context/` file. `test-plan` → `references/test-plan.md` → the `## Master Test Plan` section of the `QA Master Test Plan` Epic description in Jira (cached by the sync at `.context/PBI/qa-artifacts/master-test-plan.md`; never a local file).
- User did not name a mode → ASK. NEVER infer `refresh-all` from a generic "refresh the context" request.
- `refresh-all` runs strictly `data` → `e2e` → `api` → `test-plan`, one at a time. Each reference's own validation and approval gate must close before the next is loaded. Never skip ahead.
- Artifact missing (or a placeholder map) = CREATE mode: may write once the analysis completes. Artifact exists = UPDATE mode: generate a candidate (for a map: only its stale sections), show the diff summary, WAIT for explicit approval. NEVER overwrite an existing artifact without that approval, and NEVER regenerate a whole generated map.
- Stop the run on a hard dependency failure or a rejected overwrite. A missing SOFT dependency is not a stop: record it as a Discovery Gap and continue, exactly as the selected reference defines.
- NEVER invent business facts. Read every source the selected reference requires; anything unverified belongs under the output's mandatory discovery-gaps section, not asserted in the body.
- After a successful artifact write, add the pointer to `.agents/instructions/agent-project.md` ONLY when that pointer is missing. NEVER write it into `AGENTS.md` (boilerplate-owned, size-budgeted) or add operational prose to `CLAUDE.md`. Placement per `framework-development/references/instructions-doctrine.md` §4, then `bun run instructions:check`; any other instruction change is `/framework-development` mode `instructions`.
- Mode from `$ARGUMENTS`: when its first token matches a mode in the Mode routing table, that token IS the mode and the rest is forwarded to it unchanged (`/project-context data` on Claude Code, "project-context mode data" in prose on OpenCode and Codex, `/skill:project-context data` on Pi). No matching first token → ASK which mode.
- Before any step that uses a declared capability (`metadata.requires_capabilities`: `db`, `api-schema`, `diagrams` for the maps' figures), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8: resolve by tool-name suffix, and when no available tool provides it STOP and name the capability + how to enable it, never a silent fallback.

**Read full SKILL.md when**: the requested mode is ambiguous, a `refresh-all` chain fails mid-sequence, or you need the selected reference's own analysis steps and validation gate.

> Source: `.agents/skills/project-context/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: A

---

## Skill: project-discovery

**Purpose**: Onboard a project through four discovery phases: Constitution, Architecture, Infrastructure, and Specification.

**Compact Rules**:
- DO: run the four phases in order (Constitution → Architecture → Infrastructure → Specification), each gated on the previous. Show the output paths and wait for an explicit "Phase N complete" before continuing — never auto-chain.
- DO NOT: write anything into the target repo. Discovery is read-only on it. The write targets are `.context/project-config.md`, `.context/ADR/`, and the maps of `business-domain-context` and `infra-context` (their `references/<map>.html`), nothing else (plus the Phase 1 `## Project Assessment (Phase 1)` block in `.agents/instructions/agent-project.md`); modifying the boilerplate itself is `test-framework-adaptation`.
- DO: act as the GENERATOR of those two maps, per `agentic-qa-core/references/business-context-maps.md` (anatomy §2, reading §3, CREATE/UPDATE §4, staleness §5). Map absent or placeholder → CREATE every section. Map generated → UPDATE only the stale sections (§5 staleness check), show a section-level diff, WAIT for approval. Never regenerate a whole generated map.
- DO: read a project's old `.context/business/`, `.context/SRS/` and `.context/infrastructure/` markdown files (the `legacy` list of `business-domain-context` and `infra-context` in `CONTEXT_MAP_SKILLS`, `cli/lib/context-maps.ts`) as INPUT when present, cite them in `data-migrated-from` on the sections they seed, and never delete or rewrite them.
- DO: before drawing a figure, run the point-of-use check for capability `diagrams` (`agentic-qa-core/references/business-context-maps.md` §7). Figures are optional where a table says it better: the glossary is tables; the architecture overview usually earns a figure.
- DO NOT: invent business entities, flows, requirements, or Jira/Xray field IDs and status names. Anything not verifiable from the source goes in the map's `discovery-gaps` section (or the `## Discovery Gaps` block of `project-config.md`).
- DO: describe what the system DOES, not what product wants it to do. Discovery is reverse-engineering; a "to-be" PRD/SRS is out of scope — point the user at their own product workflow.
- DO: lock the target repo path(s) before Phase 1 and block on ambiguity. A repo that is not cloned locally cannot be discovered from a URL — ask for the clone first.
- WHEN the layout is split sibling repos: run the Phase 1 sub-steps once per repo and merge into ONE `project-config.md`, never interleaved. WHEN it is a monorepo: Phase 1 once project-wide, Phases 2-3 per package.
- DO NOT: fill the `business-data-context`, `business-api-context` or `business-e2e-context` maps, and do not write personas, journeys, the feature catalog or the master test plan here. Those are `project-context` modes, which own their diff and overwrite approval. Exact API types are `bun run api:sync`.
- DO NOT: create per-ticket PBI content or copy the backlog. Phase 4 is a connection check and writes no file; the committed `README.md` and `templates/` under `.context/PBI/` stay untouched.
- DO NOT: paste credentials or a detected secret into any discovery output. Reference the `.env` key or the file path only; a hardcoded-secret hit is recorded as a HIGH risk (path only) in the Phase 1 assessment.
- WHEN Phase 2 or 3 settles a test-architecture decision that is architectural AND hard to reverse (runner, isolation/parallelization, fixture and test-data strategy, auth-in-tests, selector contract, CI sharding): record it as an append-only ADR under `.context/ADR/`, drafted `Proposed` for the human to accept. In a brownfield repo the decision was DISCOVERED, not made here: write it `Proposed`, mark it discovered (where it was found), and have the human confirm it at that phase's completion checkpoint, which flips it to `Accepted`.
- DO NOT: mix a discovery session with `test-framework-adaptation`, and do not use this skill for incremental map refreshes — the write boundaries differ.
- DO NOT: skip Phase 1 or its domain glossary on a fresh start. Downstream skills load `business-domain-context` as a precondition for ATP authoring and TC naming.
- WHEN both a DB schema/migrations and ORM models exist: prefer the schema or migrations. ORM definitions drift from the live schema.
- DO: mention the IQL methodology only if the user asks why the discovery is structured this way — never lecture someone who just wants the artifact.
- DO: before any step that uses a declared capability (`metadata.requires_capabilities`: `db`, `api-schema`, `diagrams`), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8: resolve by tool-name suffix, and when no available tool provides it STOP and name the capability + how to enable it, never a silent fallback.

**Read full SKILL.md when**: running any phase's sub-steps, applying a completion gate's content checks, or resolving the pre-`test-framework-adaptation` prerequisite list.

> Source: `.agents/skills/project-discovery/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: A

---

## Skill: regression-testing

**Purpose**: Execute regression test suites via CI/CD, analyze results, classify failures, and produce GO/NO-GO release decisions.

**Compact Rules**:
- DO: run Execute → Analyze → Report in that order. Never skip analysis and jump to a report, and never classify a failure without reading its logs.
- DO: clear the readiness preflight before triggering anything — `gh` authenticated, the suite's workflow file present, GitHub Actions secrets set, Allure resolvable, active env confirmed. A long run that 401s mid-way is the expensive failure.
- DO: persist `RUN_ID` the moment the trigger returns, before anything else. Resume re-attaches to a live run instead of re-triggering CI; a trigger that landed without the id saved costs the whole run again.
- DO NOT: mark a failure REGRESSION without checking its history first — the single most common misclassification. A first-ever failure with no history is NEW TEST, unverified, not a regression.
- DO: classify every failure into exactly one of KNOWN-BLOCKED / KNOWN ISSUE / ENVIRONMENT / NEW TEST / FLAKY / REGRESSION, and assess severity on a separate axis — a FLAKY test on checkout is still CRITICAL. Classification is fail-closed: every class but REGRESSION cites its evidence (the `@blocked:{BUG-KEY}` marker; a ticket created BEFORE the run; the matching log line plus the other failures on that host; the empty history query; the ids and results of at least 5 runs on an unchanged build). No citation, or a ticket this session filed, = REGRESSION.
- DO: exclude `@blocked:{BUG-KEY}` tests from the gating pass-rate and report their count with each blocking key. They are parked behind an already-filed bug: never REGRESSION, and never a new bug.
- DO NOT: use ENVIRONMENT as a scapegoat. Many unrelated tests failing on one host is environment; one test failing on an endpoint other tests reach fine is more likely a REGRESSION.
- DO NOT: call a test FLAKY on fewer than 5 runs of history. Label the failure INSUFFICIENT HISTORY and count it as REGRESSION for the verdict (fail-closed), then re-evaluate on the next run. When several classes match, the order is KNOWN-BLOCKED > KNOWN ISSUE > ENVIRONMENT > NEW TEST > FLAKY > REGRESSION: FLAKY wins only with its citation, REGRESSION is what is left.
- DO: take the run's counts (total, passed, failed, skipped, pass-rate) from `reports/test-outcomes.json`. Allure is the source for each failure's detail and for the history behind FLAKY, and the fallback for counts only when the file is missing from the downloaded artifacts (always so for smoke and sanity runs; say so in the report).
- DO NOT: emit GO while any REGRESSION-class failure stands. Hard vetoes regardless of score: any `@critical` test failing, any HIGH/CRITICAL-severity regression, or a pass rate below 90%.
- DO: file only CONFIRMED product failures — the REGRESSION class, plus a NEW TEST failure once manually confirmed to be a real defect. FLAKY, ENVIRONMENT and KNOWN ISSUE get no issue at all. Triage decides WHETHER to file; the defect-management doctrine decides the type and the fields.
- DO NOT: open a GitHub issue for a quality failure. It is filed in the issue tracker, parented to the QA Defect Management process epic and linked to the source Story — never to a product or dev epic.
- DO: create the RTR (Regression Test Results, a Test Execution: `RTR: {scope-id}: Regression Testing`, parent QA Test Artifacts, Test Environment set, assignee self, `testPlan` → RTP) BEFORE triggering CI, persist its key beside `RUN_ID`, and pass it as the `execution_key` dispatch input. One RTR per verdict. The STR is created or completed ONLY when the run is the sprint close (then it links to both the STP and the RTP).
- DO NOT: import a regular regression run into the sprint STR, and never let smoke or sanity write into a regression execution: they import only when an execution key is passed explicitly.
- DO: close the RTR (or the sprint-close STR) via `complete` only AFTER the verdict comment is posted on it, and leave the RTP at its ready status: a suite run never completes the plan it ran from.
- DO NOT: invent a sprint number. The RTR needs none (its scope-id is `{env}-{YYYY-MM-DD}` or a release tag). `N` matters only for the sprint-close STR: take it from the user or from the STP's own scope-id, and ask before creating anything at sprint altitude.
- DO NOT: skip the artifact download on a red build (evidence vanishes after the retention window), and never merge smoke and regression results into one pass-rate — their SLOs differ.
- DO: inspect traces and screenshots with `/playwright-cli` (`[AUTOMATION_TOOL]`); it is the only browser path, no MCP backs it.

**Read full SKILL.md when**: driving the CI commands, applying the GO/CAUTION/NO-GO scoring table, resolving a borderline classification, wiring the TMS artifacts, or writing the report.

> Source: `.agents/skills/regression-testing/SKILL.md` · phase: `unknown` · kind: `workflow` · stage owner · extraction strategy: A

---

## Skill: session-handoff

> ⚠ LOW-CONFIDENCE (extraction strategy B): bullets scraped without context — read the full SKILL.md before relying on any rule below.

**Purpose**: Compact an entire agent session into a handoff document so a NEW session resumes exactly where this one stopped, as if the context window...

**Compact Rules**:
- the context window is past the owner's threshold (~500k tokens unless the owner names a different one; it is a per-owner judgement about where this model starts degrading, not project configuration, so it stays in the conversation and not in a yaml key) <!-- volatile-ok: owner-stated judgement threshold, explicitly not config -->
- the session is about to end with work still in flight
- the session is about to do something that will itself consume a large slice of the window (a big harvest, a long file read) and the remaining budget will not cover the work after it
- the owner asks
- **Capture.** Walk `.agents/skills/session-handoff/references/capture-contract.md` section by section. Every section is mandatory; a section with nothing in it is written as an explicit `none` line, never omitted. Omission is indistinguishable from forgetting, and the successor cannot tell which happened.
- **Write.** Fill `.agents/skills/session-handoff/templates/handoff.md` to `<<PRIMARY_ROOT>>/.session/handoffs/<session-name>-handoff-NN.md`. Naming contract below.
- **Launch the successor.** Follow `.agents/skills/session-handoff/references/successor-launch.md`. With a runtime, this session launches it. Without one, this session prints the line and the human pastes it.
- `.session/` is gitignored, and a handoff is disposable by design: it describes one session's state, it is not a project record, and committing it would put a decaying snapshot under version control.
- It lives in the PRIMARY checkout, `<<PRIMARY_ROOT>>` (`.agents/README.md` §"Checkout roots"), even when the session runs in a linked worktree. A handoff written inside a worktree dies with the worktree, and two worktrees of one lineage would each count `NN` from their own empty directory. The successor still launches in the SAME worktree as the predecessor; only the file lives in the primary. A handoff written into a worktree's own `.session/` by mistake is rescued by `bun run worktree:audit --rescue` before the worktree goes.
- `NN` is zero-padded, two digits, starting at `01`, incrementing across the whole lineage. List `<<PRIMARY_ROOT>>/.session/handoffs/` before choosing; never assume, and never count from a worktree's own `.session/`.
- **The successor's session name is the handoff file's basename without the extension.** That is the entire naming rule, and it makes the lineage readable from the file list alone: `<base>`, then `<base>-handoff-01`, then `<base>-handoff-01-handoff-02`. Long names are the point; a lineage you cannot read is a lineage you cannot audit.
- `<predecessor-session-name>` is the `session=` value of the `AGENT IDENTITY:` line the prompt hook injects (the same label the commit trailers carry), with spaces and parentheses replaced by `-`. When it reads `unknown`, ask the owner for a name rather than inventing one.
- A durable fact that outlives the session does not belong in the handoff. It belongs in Engram, in the repo, or in the tracker. The handoff cites it.
- **Label every claim `measured`, `read` or `predicted`.** The predecessor's guesses about what the successor will find are useful and are also the first thing to go stale. A predicted branch stated as fact sends the successor down a path that no longer exists. Measured means: this session ran it and read the output. Read means: it came from a document and was believed.
- **Mark perishable state `PERISHABLE`, with the wall-clock time it was measured.** Running workers, open mailboxes, in-flight PRs and live runs decay between writing and reading. The successor's instruction for anything marked perishable is: re-verify before acting, not act then discover.
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

**Purpose**: Boot, run and resume the sprint QA conductor: one session that conducts a fleet of sprint-testing workers (one per ticket) on Orca and wa...

**Compact Rules**:
- Orca is REQUIRED (owner decision, the one exception to the orchestrator-silence rule): run the gate of `orca-orchestration` (binary + reachable runtime) before anything else. It fails → say ONE line and stop, writing nothing: "/sprint-conductor runs on Orca and no reachable Orca runtime is on this machine; run the sprint with /sprint-testing sprint-wide and N executors, which writes paste-ready launch lines." Every other workflow skill keeps its silence unchanged.
- Split of duties: this skill owns the MANEUVER (boot, watch pass, round close, resume); `sprint-testing/references/fleet-conductor.md` owns the fleet WHAT (briefs, launch.txt, rounds, claims, the sprint record); `sprint-testing/references/sprint-board.md` owns the board (commands per stage, the worker block, the four channels, the sentinel wake table); `orca-orchestration` owns the transport HOW. Cite them, never restate them.
- Ask the owner only what the board, the tracker and the files cannot decide: the sprint when the CURRENT board and the tracker disagree or no board exists, and the worker cap when the ticket count exceeds it and the owner named none (held for this session, never persisted as a new default). Everything else is decided and reported.
- The conductor never tests and never investigates a ticket. The line is fixture versus finding: seeding data, verifying with ONE query that a fixture exists and belongs to whom the brief says, and creating an owner-approved fixture user are conductor work; what a case asserts, the code behind it and any id the test needs are the worker's.
- Conductor-owned pre-flight, before EVERY launch (a watch-pass launch included): tokens and browser states minted by the conductor only, refreshed when stale; a credential proven with the cheap API login before any browser login, stopping after 3 failed attempts; the sibling-repo fetch is a GATE (non-zero exit stops and escalates, never falls through to the counts) and its two drift counts go into every brief; the schema sync runs from a current checkout or is skipped with the skip written into every brief. Full: `references/boot-and-resume.md` §2.
- The sentinel is armed at boot and re-armed after EVERY wake, as a background task, one per board, with the same `--baseline` file. Never a homemade monitor, never a scheduled pass when background tasks exist, never mailbox polling.
- Every watch pass records each decision with `bun run board arrival <KEY> launched|held|skipped "<why>"`, so a missed pass costs nothing. The deploy check is never skipped: a tracker status is a hint, the deployed build is the truth. Fixture gaps are asked at triage, before launch. The cap counts every live worker, an ad-hoc retest included, and a collision is checked against the LIVE workers, not the round plan.
- A finished worker's final ticket status is read back by the CONDUCTOR itself, with a bounded poll for the expected value; a worker's or a subagent's "verified" is never the proof (Critical Rule #16). The round close is ONE subagent per finished worker that verifies the artifacts, never the report; closes whose workers touched the same Epic run one after another, never in parallel, so only one of them publishes that Epic's `## Module Context (QA)` section at a time.
- A redeploy while workers are live: fetch only (never fast-forward a sibling repo while a worker is live), then tell EVERY live worker once, with the repo, the old and new build and whether its own change's files moved.
- Never message a developer without the owner's explicit order for that message, never commit, never print a credential. Reports to the owner are counts and tables that name who must answer, never a narrative.
- Resume after a reboot or a session resume: find the workers by the label in their tab title, the part before the last `--term_` (the handle after it is stale), and re-issue each tab rename and each session rename (the harness rename verb, Claude Code included) with the new handle, restart the board, re-arm the sentinel with the same baseline, replay the owner's actions with `listen --since`, read the mailbox, send ONE resume message per live worker, and launch nothing until every live worker confirmed. Full: `references/boot-and-resume.md` §4.
- On any subagent failure: STOP, report which pass or ticket failed with full context, offer retry / skip / abort, never auto-fix. A skill that itself broke is reported upstream per `agentic-qa-core/references/upstream-feedback.md`.

**Read full SKILL.md when**: booting a conductor cold, resuming one after a reboot, or deciding whether a

> Source: `.agents/skills/sprint-conductor/SKILL.md` · phase: `unknown` · kind: `workflow` · stage owner · source: frontmatter `compact_rules` (verbatim)

---

## Skill: sprint-testing

**Purpose**: Orchestrates in-sprint manual QA per issue across Stages 1 (Planning), 2 (Execution) and 3 (Reporting).

**Compact Rules**:
- AC-pass is the FLOOR, not the goal. Coverage = AC-conformance + risk-beyond-AC (boundaries, errors, states, anomalies). Never report "% of ACs verified" as completeness. (Canon: `agentic-qa-core/references/test-design-doctrine.md`.)
- 1:N is the default: explode every non-trivial AC into multiple cases (EP partitions + boundaries + states + contexts). Collapsing an AC to one case requires a written "trivially atomic" justification.
- Apply techniques by trigger: EP always; BVA wherever a range / limit / length / date-window exists; State-Transition for stateful entities; Decision Table when 2+ conditions interact; Pairwise when 3+ combinable factors (log the reduction); Error-Guessing charters for experience-based risk.
- A criterion is a business assertion; a test case is a concrete exploration of it. Run the Test-Design Checklist before finalizing the ATP.
- CLASSIFY before filing — stop hardcoding "Bug". **Bug** = affected feature already live above Staging (end-user visible); **Defect** = feature still pre-release (Staging or below), the normal output of sprint testing; **Improvement** = not a broken AC (an enhancement, or an under-specified/absent AC surfaced by a test-beyond-AC). Classification follows the FEATURE's lifecycle stage, not where the problem was found. (Canon: `agentic-qa-core/references/defect-management-doctrine.md` Part 1.)
- `qa_assignee` (`{{jira.qa_assignee}}`) = the record of the QA who followed the Story, filled in Shift-Left and kept for its whole life; set it (authenticated session user) at `start_testing` only when still empty, and on every filed Bug / Defect / Improvement. NEVER-OVERWRITE an existing owner (read-before-write). The native `assignee` follows the dev model (it moves to the QA at Ready For QA) and the harness never restores a previous owner (Part 2).
- `components` (native, MANDATORY) = the affected product module/Epic, must pre-exist in the Jira Components module (Part 3).
- Three-axis model: **parent** = QA Defect Management process epic (`qa.qa_epics.defect_epic`, found-or-created — NEVER a product/dev epic, NEVER the Story); **issue link** = the source Story (traceability); **components** = product module (Part 4).
- `priority` (native) is auto-derived from `{{jira.severity}}` (critica→Highest, mayor→High, moderada→Medium, menor→Low, trivial→Lowest); override with a 1-line justification (Part 5.1).
- Mode from `$ARGUMENTS`: a first token naming a mode (`single-issue`, `sprint-wide`) IS the mode and the rest is forwarded; otherwise ASK the mode question, never infer it.
- Three stages, always in order: Stage 1 Planning → Stage 2 Execution → Stage 3 Reporting. Hand off Stages 4/5/6 to `test-documentation` / `test-automation` / `regression-testing`.
- **QTU (optional audit aid)**: when Stage 3 approves a Story (`qa_sign_off` to `{{jira.status.story.qa_approved}}`), write `{{jira.quality_token_usage}}` if the harness shows the tokens (K = input plus output, cache reads reported separately) or a human enters them; empty is a valid stated N/A and never fails a verifier; field absent → structured Jira comment. CUMULATIVE: when the Story returns to QA (retest, `back_from_qa_approved`, fix loops) read the current value first, add this cycle's measured delta, never overwrite, and post one comment `QTU cycle N: +x K (total y K) source=<harness|human>`; current value empty → write just this cycle's delta. NEVER estimate or invent a number.
- Jira is source of truth. Read tickets via `bun run jira:sync-issues get <KEY> --include-comments`, then the synced `.md`. NEVER `acli workitem view` for custom fields (returns `null`).
- Bugs run the veto + triage + risk-score decision tree BEFORE any ATP is written.
- Stage 1's Shift-Left short-circuit is fail-closed: the `shift-left-reviewed` + dated labels alone run the FULL flow. Phases 1-3 are skipped only on cited evidence: a pre-sprint ATP body in the synced `acceptance-test-plan.md` (or its `## Acceptance Test Plan (ATP)` fallback comment), a dated label under 30 days old, refined ACs that still match the Story. Stage 1 never writes those labels or that field before the check (`references/acceptance-test-planning.md` §0.0).
- Execution = smoke pass first, then trifuerza (UI/API/DB) exploration; capture evidence under the PBI folder.
- A TC is PASSED or FAILED only when observed in the environment its precondition names; a unit test, green CI, a code read or another environment leaves it NOT RUN. NOT RUN runs the blocking ladder (recreate -> QA defers with a follow-up task -> developers -> owner if unsure) and is never recorded FAILED. Canon: `agentic-qa-core/references/discovery-driven-doctrine.md` §5.
- API testing = three-tool maneuver: OpenAPI MCP for schema (READ-ONLY) → `bun run api:login` for the token (→ `.auth/tokens.env`) → **curl** for authenticated requests. NEVER execute via the OpenAPI MCP. Canon: `agentic-qa-core/references/api-testing-doctrine.md`.
- Every role signs in through the app's own login only (UI form → `.auth/<env>-<role>.json`, or `bun run api:login --role <role>`). NEVER obtain a session through a service-role / admin key, an admin user-management API, a server-generated magic link or reset token, a locally signed JWT or a database session row; seeding test DATA through API / DB stays allowed. An auth story runs end to end through a real inbox (`/resend-cli`); `production` = dedicated synthetic QA accounts only. A check that seems to need a shortcut is a blocker to report. Canon: `agentic-qa-core/references/browser-sessions.md` §4.
- Consult `business-domain-context` (`bun run context:map business-domain-context`) before authoring the ATP, refined ACs, and TC outlines.
- On any subagent failure: STOP, report partial state, offer retry / skip-stage / abort. No auto-fix, no auto-rollback. A skill that itself broke (a wrong step, a missing verifier, a stale rule) is reported upstream per `../agentic-qa-core/references/upstream-feedback.md`: drafted and redacted locally, filed only on explicit OK, verified with `gh issue view`.
- Stage 1 Set-first order (Modality jira-xray — AUTHORITATIVE): the Story's coverage backbone is its **ATS** (`ATS: {US_ID}: {story title}` — mandatory per Story, even with a single TC; parent: QA Test Artifacts epic; components inherited from the Story). Create the sprint `Test` issues, put ALL of them in the ATS, and link **ATS→Story** via the `test` slug (Story `is tested by` ATS) — the PRIMARY coverage-bearing edge (fills the Xray coverage panel); a direct TC→Story link is the only other coverage-bearing edge (last resort, valid only when no ATS can exist); Story↔ATP and Story↔ATR links are administrative traceability with ZERO coverage.
- The ATP item is find-or-created FROM the `{{jira.acceptance_test_plan}}` field (where shift-left authored it) — pre-sprint the ATP lives ONLY in that field; Stage 1 is where the Test Plan item is born (parent: QA Master Test Plan epic).
- Derive, never re-list: the ATP's and the ATR Execution's test lists are DERIVED from the ATS membership — never maintained as independent id lists (three hand-maintained lists drift silently and corrupt coverage).
- ATR always with environment (HARD GATE): create the ATR / retest Execution ALWAYS carrying the Test Environment resolved from `active_env` in `.agents/project.yaml` (or the session env switch). No ATR without environment — an environment-less Execution fails the Stage-1 DoD gate (`agentic-qa-core/references/stage-gates.md`).
- TC∈ATS membership is ALWAYS a TC→ATS `test` issue link, in both modalities; Modality jira-xray also writes the Xray-internal membership (GraphQL), never instead (`agentic-qa-core/references/traceability-linking.md` §9). TC∈ATP / TC∈ATR stay Xray-internal. Do NOT link TCs directly to the Story (last-resort only, for instances with no Test Set work type).
- Bug retest (Modality jira-xray): ONE repro `Test` by default, created at fix-verification time (Stage 2), linked Bug↔Test via the `test` slug and executed in the retest Execution (`ReTest: {BUG_KEY}: {summary}`); 1:N only with a written test-design justification. Modality jira-native: no in-sprint TCs (the bug is the immediate retest case) — persistent-Test decisions defer to Stage 4.
- STP find-or-create fires on the sprint's FIRST ticket: `STP: Sprint#{N}: {objective}` (Test Plan item, parent: QA Master Test Plan; a LIVING planner — append each tested ticket, keep progress current). The sprint recap Execution `STR: Sprint#{N}: Regression Testing` (parent: QA Test Artifacts) is created at sprint close. RTRs recorded during the sprint (`RTR: {scope-id}: Regression Testing`, one per regression verdict) belong to `/regression-testing`; the STR remains the sprint-close run and links to both the STP and the RTP (dual `testPlan` membership).
- Two modes, ASKED at Session Start, never inferred: **sprint-wide** (the whole sprint's QA backlog) or **single-issue** (one issue from it). Only `sprint-wide` creates/updates the STP and the sprint session pair; `single-issue` creates neither.
- Mode is a SCOPE, and scope is only one axis: **scope** (single-issue | sprint-wide) × **executors** (1 | N). One executor is the default and is unchanged in every detail. N>1 ("fleet mode") is sprint-wide ONLY, fires when the user answers the executors question with N (`orchestration.max_workers` in `.agents/project.yaml` is a round cap, never a switch); the orchestration gate then decides only who opens the sessions (pass → Orca launches/supervises; fail → the human pastes the same launch lines), and never changes what an issue's pipeline does — only who runs it. Canon: `sprint-testing/references/fleet-conductor.md`.
- Fleet mode invariants: the launch file is written ALWAYS (gate or no gate — without the gate the human pastes its N lines) and when the gate fails the orchestration tool is NEVER named to the user; a worker = single-issue mode, detected from the prompt token `fleet worker` plus its brief (env vars are an optional extra signal on the human-paste path only), no checkpoints, preflight MCP probes NOT skippable, zero sprint-altitude writes, no write to its Epic's `## Module Context (QA)` section (it stages `## Module Learnings (candidate)` in its `test-session-memory.md`; the conductor publishes once per module), runs to `worker_done` without returning to its prompt; **rounds** (concurrency groups) are NOT **waves** (Jira-status buckets).
- `sprint-wide` is a REAL session scope, not a folder: `.session/sprint-testing/sprint-<N>/{plan.md, progress.md}` per `agentic-qa-core/references/session-management.md` §6/§7, holding one nested `<JIRA-KEY>/` sub-scope per issue. `plan.md` is the local STP (queue + waves + assignment); `progress.md` is the append-only sprint log, one entry per issue close. There is NO local sprint tracker file — anything the team needs lives in the STP in Jira.
- Sprint scope is a JQL QUERY, never a hardcoded issue-type list: take the work types declared `coverable: true` in `.agents/jira-required.yaml`, resolve each one's `jira_issue_type` (`A | B | C` = ordered alternatives, first the instance has wins), intersect with `.agents/jira-workflows.json`. A declared type the instance lacks is SKIPPED WITH A NOTE, never a blocker.
- STP maintenance parity (concurrent testers): `plan.md` ↔ the STP issue DESCRIPTION — rewritten wholesale, so ONE writer (whoever plans the sprint), read-first before writing. `progress.md` ↔ the STP issue COMMENTS — append-only on both sides, one comment per issue close, so two testers never clobber each other. Where the comment log and a Story's ATR disagree, the **ATR wins** — it is the artifact of record.

**Read full SKILL.md when**: starting a sprint cold, resuming a session, or handling a bug-triage / sprint-wide flow not covered by the rules above.

> Source: `.agents/skills/sprint-testing/SKILL.md` · phase: `unknown` · kind: `workflow` · stage owner · source: frontmatter `compact_rules` (verbatim)

---

## Skill: test-automation

**Purpose**: Plan, write, and review automated tests following KATA (Komponent Action Test Architecture) on Playwright + TypeScript, or explain existi...

**Compact Rules**:
- "All ACs covered" is the FLOOR, not the success bar. The ATC set must also cover risk-beyond-AC: invalid/boundary inputs, auth/error paths, state transitions, and anomalies the AC is silent on.
- 1:N is the default: one AC maps to multiple ATCs. EP-merge collapses same-behavior inputs INSIDE one partition into a parameterized ATC — it must NEVER collapse across distinct partitions, boundaries, or states. BVA cases are required wherever a range/limit/length/date-window exists (EP alone misses off-by-one).
- Apply techniques by trigger: EP always; BVA on ranges/limits; State-Transition for stateful flows; Decision Table when 2+ conditions interact; Pairwise when 3+ combinable factors (log the reduction).
- Parametrize for artifact economy: same-behavior data variants → ONE parameterized `@atc` (fixture / data-factory rows iterated by the test) per partition, NOT N ATCs; split only when action / outcome / state differs. (Canon: doctrine §"Part 2.5".)
- An AC is the business assertion; an ATC is its concrete exploration (Precondition + Action + Assertions). Run the Test-Design Checklist before finalizing the plan.
- Plan → Code → Review, always in order, behind the TC source gate (also first on every resume): in scope = the Tests at `candidate` whose `Verdict signed:` ROI comment has Jira `created` AND `updated` older than this run's start; Manual and recorded-Deferred Tests are listed out of scope. STOP and route to `/test-documentation` only on a named TC that is not a signed Candidate, a Test with no verdict, or zero signed Candidates; never sign or wait inside the run. This skill never creates a Test, scores ROI or fires a verdict transition. Signed ROI is a hard gate, never collapsed.
- A TC reaches `automated` (labels `+automated -automation-candidate`) only when its code is on the production branch (`git_strategy.branches.production`); a merge into an integration branch or a suite trunk is not `automated`. Canon: `agentic-qa-core/references/discovery-driven-doctrine.md` §6.
- Fixture selection: API-only → `{ api }` (no browser); UI-only → `{ ui }`; hybrid → `{ test }`.
- ATC = atomic mini-flow; NEVER calls another ATC. Reusable chains → a Steps module.
- Max 2 positional params (3+ → object param). Locators inline (extract only at 2+ uses). Imports via aliases (`@api/`, `@schemas/`, `@utils/`) — no relative imports.
- Public methods fail fast; utilities silent-fail (return null). Validate against `kata-manifest.json` before adding components/ATCs (anti-duplication gate).
- Mode from `$ARGUMENTS`: a first token matching a mode in Mode routing (`explain`, `automate`) IS the mode and the rest is forwarded; otherwise `automate` for plain automation work, ASK when it could be either.
- Before any step that uses a declared MCP capability (`metadata.requires_capabilities`: `db`, `api-schema`), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8: resolve by tool-name suffix, and when no available tool provides it STOP and name the capability + how to enable it, never a silent fallback.

**Read full SKILL.md when**: writing KATA component code, choosing fixtures for a hybrid flow, or applying the Phase 3 review checklist.

> Source: `.agents/skills/test-automation/SKILL.md` · phase: `unknown` · kind: `workflow` · stage owner · extraction strategy: A

---

## Skill: test-documentation

**Purpose**: Analyze, prioritize, and document test cases in TMS (Jira/Xray), repair an existing Story-ATS-ATP-ATR-TC cascade through a sealed explici...

**Compact Rules**:
- Documenting an AC→TC map is the FLOOR (≥1 TC per AC is a minimum, never a target). Coverage = AC-conformance + risk-beyond-AC; the TC set must include boundary / negative / state / anomaly cases the AC is silent on. (Canon: `agentic-qa-core/references/test-design-doctrine.md`.)
- 1:N applies to DERIVATION (consider many cases by technique), not to the REGRESSION repository. Only regression-worthy scenarios (Candidate/Manual) are persisted there; most are Deferred. jira-native: Stage 4 CREATES `Test`s for those only (Deferred = report-only). jira-xray: sprint `Test`s already exist (Stage 1) — Stage 4 PROMOTES the regression-worthy into the Test Plan + enriches them. Document because it will be re-run, never to hit a count.
- Apply techniques by trigger: EP always; BVA wherever a range/limit/length/date-window exists; State-Transition for stateful entities; Decision Table when 2+ conditions interact; Pairwise when 3+ combinable factors.
- Parametrize for artifact economy: same-behavior data variants → ONE Test (`Scenario Outline` + `Examples` rows) per partition, NOT N separate Tests; split only when action / outcome / status / state differs. (Canon: doctrine §"Part 2.5".)
- Cross-cutting characteristics (XSS, perf, a11y) deferred to app-level suites are an EXPLICIT handoff, not a silent drop — name the receiving suite or file the gap.
- Documents already-validated behavior only (in a discovery-driven scope: behaviour a person confirmed, `oracle: confirmed`) — not an exploration tool (exploration belongs to `/sprint-testing` per ticket and `/exploratory-testing` per module, flow or sweep).
- TC identity = Precondition + Action + verifiable outcome. Naming (TC): `{US_ID}: TC#: should <expected outcome> [<connector> <condition>] [given <precondition>]`; `Validate <feature>` is reserved for the GROUPING layer (Test Set summary / `describe()`). Reject `"Login test"`, `"Login - error"`, `"TC1: Test form"`.
- ROI formula → one of three verdicts per TC: Candidate (feeds test-automation), Manual, Deferred. Prioritize by risk.
- No ROI verdict (Candidate or Manual) while a scenario is `oracle: observed`: a characterized behaviour needs a person's answer to "is this intended?" first (decision-protocol kind 1), and waits unscored until then. Canon: `agentic-qa-core/references/discovery-driven-doctrine.md` §4.
- A Candidate or Manual verdict is fired only after a person signs it (a batch through the `mkd` deck, one verdict through the question tool), and the TC's ROI comment then carries `Verdict signed: <who>, <where>, <when>`, `<where>` a checkable record (the person's own comment id, or the saved mkd result / decision record path), the line `/test-automation`'s TC source gate reads. Only an attended session writes it; a subagent, worker or routine lists the verdicts as pending. Format + the sign-only pass: `references/tms-conventions.md` §9.
- Discovery intake (`references/discovery-intake.md`): a COVERED candidate is dropped with a line, a WEAK one becomes a strengthen proposal for the existing test (never a new Test), a NEW one runs the full pipeline anchored to its coverage Tech Story; the >50% alarm is computed per chunk.
- `PASSED` / `FAILED` only from a run observed in the environment the TC's precondition names, else `NOT RUN` with its reason (doctrine §5); `automated` (`merged`) only once the spec is on the production branch, through mode `post-promotion` (doctrine §6).
- Cardinality: US→TC is 1:N; AC→TC is N:1 or N:M. Resolve TMS modality (Xray vs Jira-native) in Phase 0 before documenting.
- Mode from `$ARGUMENTS`: a first token matching a mode in Mode routing (`repair-traceability`, `post-promotion`, `document`) IS the mode and the rest is forwarded; otherwise `document` for plain documentation work, ASK when it could be either.
- Bug-driven (GOLDEN RULE): not every bug is a regression TC, but a regression-worthy bug MUST end with a Test — REUSE the existing failed Test if it came from one, else CREATE one (both modalities). A non-qualifying bug is treated like a failed test → Deferred, no new Test.
- ATS is MANDATORY per Story (`ATS: {US_ID}: {story title}`, even with a single TC): a `Test Set` holding ALL the Story's TCs, parented to the QA Test Artifacts epic, `components` INHERITED from the Story (mandatory — the components exemption applies ONLY to the optional feature-level `TS:` grouping sets).
- Set-first creation order: find-or-create the ATS, ATP and ATR BEFORE the first TC (module-driven pre-creates the containers because parallel TC sharding needs the targets to exist); add each TC to the ATS, THEN derive the ATP's and the Execution's test lists FROM the ATS membership — never three independent id lists.
- Coverage truth (`xray-cli/SKILL.md` §Direction): coverage comes from the ATS→Story `is tested by` link (primary) OR a direct TC→Story link (last resort, valid only when no ATS can exist). Story↔ATP and Story↔ATR links are administrative traceability and contribute ZERO coverage — keep them, never count them as coverage.
- Membership: TC∈ATS is ALWAYS a TC→ATS `test` issue link, in both modalities (never in the TC title); Modality jira-xray also writes the Xray-internal membership (GraphQL, via `/xray-cli`), never instead. TC∈ATP / TC∈ATR stay Xray-internal. Test Set work type absent → no ATS (canon: `../agentic-qa-core/references/traceability-linking.md` §9).
- Direct TC→Story links are the cascade's LAST RESORT (valid only when no ATS can exist — e.g. jira-native without the Test Set work type), not the default. The defect is a TC with NO path to its Story, not the direct link itself.

**Read full SKILL.md when**: resolving TMS modality, computing ROI, writing Gherkin, or wiring US-ATP-ATR-TC traceability links.

> Source: `.agents/skills/test-documentation/SKILL.md` · phase: `unknown` · kind: `workflow` · stage owner · source: frontmatter `compact_rules` (verbatim)

---

## Skill: test-framework-adaptation

> ⚠ LOW-CONFIDENCE (extraction strategy B): bullets scraped without context — read the full SKILL.md before relying on any rule below.

**Purpose**: Adapt this boilerplate's KATA test architecture, auth, schemas, variables, env schema, fixtures, CI, MCPs, and reporting to a project alr...

**Compact Rules**:
- This skill has one mode, `adapt`. Forward `$ARGUMENTS` unchanged and load `references/adaptation-workflow.md`.
- The reference owns the complete idempotent Phase 0-9 workflow. Its boundary is mandatory: Phases 0-2 are analysis and planning only; Phase 3 begins only after explicit approval of `.context/reports/test-framework-adaptation-plan.md`. Never bypass its genericness scan, credential stops, or ordered verification gate.

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/test-framework-adaptation/SKILL.md` · phase: `unknown` · kind: `workflow` · extraction strategy: B

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
- Three steps need a person's confirmation: the `link delete` itself, applying an import or restore after its dry-run, and the credential fix above. With a person present, ask. With a supervised worker, the conductor holds the gate. In a routine with nobody, the delegating brief is the approval when it names the action; otherwise do the read-only and dry-run work, stop before the delete, import or restore, and report. `agentic-qa-core/references/decision-protocol.md` has the full rule.

**Read full SKILL.md when**: composing a specific command, wiring the canonical end-to-end Story flow, running backup/restore or a cross-site migration, or enriching the synced PBI cache.

> Source: `.agents/skills/xray-cli/SKILL.md` · phase: `unknown` · kind: `utility` · extraction strategy: A
