# Skill Registry (auto-generated)

> Generated: `2026-09-17T23:48:24.938Z`
> Generator: `bun scripts/build-skill-registry.ts`
> Protocol: `.agents/skills/agentic-qa-core/references/skill-resolver.md`

This file is the per-session compact-rules cache for the Skill Resolver protocol.
The orchestrator copies one or more `## Skill: <slug>` blocks below into every subagent briefing under `## Project Standards (auto-resolved)`.
Subagents trust those compact rules and only read the full SKILL.md when explicitly instructed.

Skills indexed: 20

---
## Skill: acli

**Purpose**: Atlassian CLI (official `acli` binary, v1.3+ as of 2026) for Jira Cloud, Confluence Cloud, and org admin tasks from the terminal.

**Compact Rules**:
- DO: pass `--paginate` (or an explicit `--limit`) on any search whose result is counted, iterated, or decided on. Pagination is opt-in and truncation is silent — there is no warning.
- DO NOT: read exit 0 as proof a subcommand exists. An unknown subcommand falls back to the parent help and exits 0. Check that the help body actually changed, and never invent a flag — every multi-word flag is kebab-case.
- DO: verify auth status before any bulk mutation. Auth is per-product (jira / confluence / admin / global are separate sessions) and a silent expiry leaves the batch half-applied with no clean rollback.
- DO: pass the non-interactive confirmation flag on every mutating command in CI, or the command hangs waiting on stdin.
- DO NOT: hand-author raw ADF JSON, and do not pass Markdown to a rich-text flag — the CLI never converts it and stores the literal characters. Author in Markdown, convert with `scripts/md-to-adf.ts`, pass the ADF.
- DO: let the converter's validation gate run on every ADF document before publishing, and round-trip read the field after writing. The gate catches node-level errors; only the read-back catches Jira's silent server-side coercion.
- DO NOT: assume `workitem edit` takes custom-field values. It hard-rejects every shape with exit 1; editing a custom field on an EXISTING item works only through the REST PUT path.
- DO NOT: hardcode a `customfield_NNNNN` id in a script or in generated output. Resolve it through the host project's slug catalog — ids differ per workspace, slugs travel.
- DO NOT: read the Atlassian host from an environment variable. It lives in `.agents/project.yaml` under `issue_tracker.atlassian_url` and is resolved through the accessor; a stale inherited copy once pointed the sync scripts at a dead site.
- WHEN creating an issue link: `--out` / `--in` are empirically INVERTED against Jira's semantics — `--out` takes the prerequisite, `--in` the dependent. Verify the direction by listing the link afterwards, and recreate with swapped flags if it landed backwards.
- DO: capture and surface the trace id from any backend failure. It is the only debug signal, and Atlassian Support needs it.
- WHEN the operation is a known blind spot (enumerate custom fields, edit custom-field values, manage workflows / issue types / versions / components, attachments, watchers, add an item to a sprint): route through REST or the opt-in Atlassian MCP rather than forcing the CLI.
- DO: prefer API-token auth in scripted contexts, and pin the binary to an explicit version in production pipelines — tracking `latest` has caused same-day mass failures.

**Read full SKILL.md when**: composing a specific command, publishing rich text, running the REST PUT workaround, or working any surface outside Jira work items.

> Source: `.agents/skills/acli/SKILL.md` · phase: `unknown` · extraction strategy: A

---

## Skill: adapt-framework

> ⚠ LOW-CONFIDENCE (extraction strategy B): bullets scraped without context — read the full SKILL.md before relying on any rule below.

**Purpose**: Adapt this boilerplate's KATA test architecture, auth, schemas, variables, fixtures, CI, MCPs, and reporting to a project already reverse...

**Compact Rules**:
- This skill has one mode, `adapt`. Forward `$ARGUMENTS` unchanged and load `references/adaptation-workflow.md`.
- The reference owns the complete idempotent Phase 0-9 workflow. Its boundary is mandatory: Phases 0-2 are analysis and planning only; Phase 3 begins only after explicit approval of `.context/reports/adapt-framework-plan.md`. Never bypass its genericness scan, credential stops, or ordered verification gate.

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/adapt-framework/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: agentic-qa-core

**Purpose**: Foundation skill that hosts shared references cited by other workflow skills (briefing template, dispatch patterns, orchestration doctrin...

**Compact Rules**:
- DO NOT create, modify, or delete ANY file while acting as `agentic-qa-core`. It is a passive reference library with no write path of its own.
- DO NOT write `.context/` artifacts here (that is `/project-discovery`), scaffold tests / fixtures / KATA components (that is `/adapt-framework` and `/test-automation`), adapt the framework to a stack (`/adapt-framework`), sync AI-critical docs (`/sync-ai-context`), or sync OpenAPI schemas (`bun run api:sync`).
- DO NOT orchestrate a workflow or bootstrap a target repo from this skill. It hosts doctrine; the workflow skills execute it.
- WHEN a workflow skill cites `agentic-qa-core/references/*.md`: load ONLY the files that skill's `## Dependencies` block names. Never preload the whole reference set.
- WHEN deriving test cases or coverage from acceptance criteria in ANY testing skill: `references/test-design-doctrine.md` is mandatory reading first.
- WHEN filing any bug / defect / improvement: `references/defect-management-doctrine.md` is mandatory reading first.
- WHEN dispatching a subagent: use the 7-component briefing in `references/briefing-template.md` and pick the pattern via `references/dispatch-patterns.md`. A subagent that must answer the user directly also loads `references/behavioral-layer.md` — it inherits no register from the orchestrator.
- WHEN closing a workflow stage: verify that stage's Definition of Done in `references/stage-gates.md` BEFORE advancing.
- DO edit the owning skill's `references/*.md` when a rule changes, then run `bun run skills:registry`, then refresh the deck under `packages/decks/agentic-qa-core/`. That order keeps prose, registry, and decks from drifting.
- DO treat this boilerplate as clone-in-full. Copying a single skill directory in isolation leaves it without the foundation files it depends on, and it will not function.

**Read full SKILL.md when**: you need the full table of hosted references and who cites each one, the deck-hosting details, or the exact `## Dependencies` block shape to add to a skill.

> Source: `.agents/skills/agentic-qa-core/SKILL.md` · phase: `unknown` · extraction strategy: A

---

## Skill: agentic-qa-onboard

**Purpose**: Walks new users through this repo's QA flow — Playwright + KATA + Allure + Xray stack, Jira QA workflow (Backlog → Shift-Left QA → Estima...

**Compact Rules**:
- DO: act as a guided tour, not an executor. The tour ends the moment the user knows which skill to call; hand off there and step back.
- DO NOT: do the downstream work yourself. Pre-sprint refinement is `/shift-left-testing`, per-ticket QA `/sprint-testing`, TMS authoring `/test-documentation`, automated tests `/test-automation`, suite runs `/regression-testing`, a new target repo `/project-discovery`, KATA adaptation `/adapt-framework`.
- WHEN someone is lost or asks how a skill works: suspend the compressed / caveman register for the whole explanation — full sentences, warm tone, and each technical term defined the first time it appears. Resume the normal register once they are oriented.
- DO: mirror the user's language in the explanation. The visual decks ship in Spanish only (technical terms stay English) — say so before opening one for an English speaker.
- WHEN the goal is unclear: ask ONE question first (testing a ticket, or understanding the whole flow?). Never dump all six stages on someone who asked about one.
- DO: explain the concept in plain words, and why it matters, BEFORE any command, flag, or file path.
- DO NOT: open a how-it-works deck without asking — it launches the user's default browser. Open exactly ONE, then let them come back with questions before offering the next.
- WHEN opening a deck: prefer the published GitHub Pages URL over the local file, because a project scaffolded from this boilerplate may not carry the HTML. Use the local copy only offline or on explicit request.
- DO: route a brand-new project through the ordered 4-phase setup path (foundation → Jira catalogs → discovery + adapt → git Strategy Setup). The joining-an-adapted-project checklist covers phase 1 only and is not a substitute.
- DO NOT: state a Jira status or transition from memory. `.agents/jira-workflows.json` is authoritative — if a status is not in there, it does not exist in the instance.
- DO: point library-docs questions at Context7 and troubleshooting at Tavily; ticket WRITES at `/acli`, and detailed ticket READS (custom fields, ACs, ATP/ATR, comments) at the Jira sync script, whose synced `.md` is what you read.
- DO NOT: suggest swapping the stack. Playwright + KATA + Allure + TypeScript + bun is locked, and KATA is Playwright-specific — a project needing another runner should not start from this boilerplate.

**Read full SKILL.md when**: walking the full 4-phase new-project setup, listing env vars or MCPs in detail, or answering which deck covers a given topic.

> Source: `.agents/skills/agentic-qa-onboard/SKILL.md` · phase: `bootstrap` · extraction strategy: A

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

**Read full SKILL.md when**: building the annotation HTML, choosing shape types, or handling a case the local render cannot cover (e.g. a photo of physical signage that would need anonymization).

> Source: `.agents/skills/bug-screenshot-annotation/SKILL.md` · phase: `unknown` · extraction strategy: A

---

## Skill: framework-development

**Purpose**: Framework evolution mode — evolves the QA boilerplate itself (KATA, fixtures, cli/, scripts/, api/schemas/ pipeline, package.json deps).

**Compact Rules**:
- DO NOT: use this skill for per-ticket work — test writing is `/test-automation`, manual QA is `/sprint-testing`, TMS docs are `/test-documentation`, suite runs are `/regression-testing`. This skill governs the architectural surface only.
- DO: clear the readiness preflight, then run the Phase 0 path self-check against `references/kata-invariants.md` §10 before dispatching anything. A FORBIDDEN path aborts and redirects to the skill named in the row; a path in neither table is ASKED about, never assumed.
- WHEN one change spans both ALLOWED and FORBIDDEN paths: split it. This skill changes the base; `/test-automation` migrates the consuming specs in a follow-up.
- DO: run Plan → Code → Verify → Archive in order for every non-trivial framework change. The pipeline IS the gate; "it's a quick refactor" is not an exemption.
- DO NOT: edit `tests/components/` from a framework-development session — those L2/L3 KATA components are per-ticket surface.
- DO NOT: collapse the KATA layers (TestContext / Base / Domain / Fixture) under a simplicity argument. They are framework architecture, not speculative abstraction.
- DO NOT: add a new fixture API without updating the matching fixture file AND `kata-manifest.json` AND citing at least one existing test that consumes it. Orphan fixtures rot, and the manifest is the anti-duplication gate.
- DO NOT: bump a major version of Playwright / Bun / TypeScript without a regression run on a representative E2E suite — lockstep upgrades hide breaks in fixture lifecycle, locator engines, and type emit.
- DO NOT: refactor `cli/install.ts` without exercising the full install flow on a clean clone. Verification on an already-installed repo proves nothing, and the installer is the one surface where a bug ships silently to every new user.
- WHEN the chosen approach reshapes test architecture (KATA layers, a fixture API, the runner, the isolation/parallelization model, the OpenAPI/type pipeline) AND is hard to reverse: record an ADR under `.context/ADR/` after plan approval and before coding, drafted `Proposed` for the human to accept. ADRs are append-only — supersede, never rewrite.
- DO: verify with all four checks (test, types, lint, skills) and treat any non-zero exit as REJECT — present retry / skip-and-document / abort, never auto-fix.
- DO NOT: let a subagent write `progress.md`; it is orchestrator-only. Code subagents return one-line summaries per task, and the orchestrator does not read their diffs.
- DO: archive the session directory only after all four verifiers pass. On REJECT it stays in place so the run can be debugged or resumed.

**Read full SKILL.md when**: writing the plan artifact, batching Code-phase tasks, resuming an interrupted session, or reading the ALLOWED/FORBIDDEN path tables themselves.

> Source: `.agents/skills/framework-development/SKILL.md` · phase: `unknown` · extraction strategy: A

---

## Skill: git-flow-master

**Purpose**: End-to-end Git operator for any branching strategy.

**Compact Rules**:
- DO: read the repo state (status, branches, diff, log, fetch, upstream, remotes) at the start of EVERY invocation and report it before acting. Never assume repo state.
- DO: resolve the branching strategy from the `git_strategy:` block in `.agents/project.yaml` first, then layout heuristics, then by asking — never pick one silently. Persist the resolution back into that block, never into a separate file and never as policy prose in `AGENTS.md`.
- WHEN `git_strategy.strategy` is set but `project.project_name` is null, or `meta.strategy_source` is still `inherited` on a named project: the strategy was INHERITED from the template, not chosen. Treat it as unconfirmed and OFFER Strategy Setup once per session — never auto-run it, and proceed under the inherited strategy on a "no".
- DO: consult `git_strategy.policy.direct_push_to_protected` before any direct push to a protected branch — `allowed` is standing authorization (asking anyway collapses it into `confirm`), `confirm` asks every time, `forbidden` refuses and routes through a PR. A missing or null block behaves as `confirm`.
- DO NOT: force-push, `--force-with-lease`, `--no-verify`, amend or rebase a pushed commit, or otherwise rewrite pushed history, unless the user explicitly authorizes it AND the branch is unshared.
- DO NOT: run a repo-wide discard (`git restore .`, `git checkout -- .`, `git reset --hard`, untargeted `git stash`, `git clean -f`) — concurrent sessions may share this working tree. Discard only explicit paths this session modified; unclear ownership means stop and ask.
- DO NOT: `git add -A` or `git add .`. List explicit paths, so a secret or another session's work cannot ride along.
- DO: keep one commit to one responsibility, in conventional format (`{type}({ISSUE-KEY}): {description}`). Commit messages, branch names and PR bodies are English and carry NO AI attribution.
- DO: close EVERY commit message, in every strategy, with the two forensic trailers `Worktree: <name|primary>` then `Session: <label>`, copied from the `AGENT IDENTITY:` line in session context (`unknown` when a value cannot be resolved). They are forensics, not attribution — a harness-branded trailer (`Claude-Session:`, an AI `Co-Authored-By:`) stays forbidden.
- WHEN a pre-commit hook rejects a commit: stop, fix the underlying issue, and create a NEW commit. Never `--amend` the rejected one.
- DO: propose every branch name, commit set, and PR body and wait for an explicit OK before executing.
- DO: stop at PR creation — merging is the user's next step, never automatic. If the `gh` transport is missing or unauthenticated, surface the blocker instead of implying a PR was opened.
- WHEN reconciling declared policy against the host: run the policy-verify tool once at the first push / PR / merge intent, never hand-query protection endpoints. A `404` on the classic protection endpoint does not mean unprotected, and a push that succeeded may have been a documented bypass, not permission. Report drift; never auto-correct it.
- WHEN a planned change exceeds ~400 changed lines: run the chained-PR decision (single-pr / stacked-to-main / feature-branch-chain / size-exception) before coding, and re-run it if the real diff outgrows the estimate rather than silently up-budgeting.
- WHEN a conflict fires: diagnose and classify it first, present options ranked by safety, and prefer a safe abort over a guess. Never pick a destructive option silently.

**Read full SKILL.md when**: running Strategy Setup, resolving a specific conflict type, picking a base branch or branch prefix for an unfamiliar strategy, or setting up an isolated worktree.

> Source: `.agents/skills/git-flow-master/SKILL.md` · phase: `implementation` · extraction strategy: A

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
- Forward `$ARGUMENTS` unchanged.

**Read full SKILL.md when**: the mode is ambiguous, a dry-run diff or migration audit looks wrong, or you need the selected reference's step-by-step phases and verification list.

> Source: `.agents/skills/jira-administration/SKILL.md` · phase: `unknown` · extraction strategy: A

---

## Skill: judgment-day

> ⚠ LOW-CONFIDENCE (extraction strategy B): bullets scraped without context — read the full SKILL.md before relying on any rule below.

**Purpose**: Trigger: judgment day, dual review, adversarial review, juzgar.

**Compact Rules**:
- `/test-automation` — Review phase for high-risk test changes
- `/git-flow-master` — pre-PR gate when the diff is large or touches shared fixtures / base classes
- `/framework-development` — pre-archive review of framework evolution diffs
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
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/judgment-day/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: orca-orchestration

**Purpose**: Multi-session agent orchestration for this repo: one conductor session coordinating a fleet of persistent worker sessions (one per story,...

**Compact Rules**:
- DO gate on the BINARY plus a reachable RUNTIME, never on "is a vendor skill installed". Three states: A no binary, B binary with unreachable runtime, C ready. In a workflow skill, states A and B are TOTAL SILENCE: never name the orchestrator, never list it as a prerequisite, never mention it in an ATR or a blocked-token sweep. The one-line install recommendation belongs to THIS skill and fires only because the user asked for orchestration.
- DO write the launch file ALWAYS, with or without a runtime, and hand the launcher the SAME line byte for byte. A paraphrased line is the exact failure this rule exists to prevent: the two paths must be structurally incapable of diverging.
- DO NOT copy the vendor command grammar into this repo. Ask the binary for it at the moment of use (`orca skills get orchestration` for the conductor, `orca skills get orca-cli` for terminals and worktrees, nothing for a worker — its injected preamble already carries the contract). A copied grammar goes stale in silence on the next release.
- DO treat one-shot subagents as the DEFAULT executor (AGENTS.md §3, unchanged) and a supervised worker as the declared exception: persistent, addressable, owns a scope end to end. The conductor still uses subagents for its OWN reads.
- DO NOT allow periodic heartbeats, even though the injected preamble asks for them. Every heartbeat wakes the conductor to read the word "alive". A worker sends exactly three things: `worker_done` (once, with an explicit outcome), `ask` (blocking), `escalation`. The brief must prohibit heartbeats in writing.
- DO NOT use the harness's own agent-to-agent messaging or user-question tools from a worker: from an isolated worktree the conductor is not addressable and nobody is watching a user prompt. The channel is the orchestration mailbox, and a question that does not block goes out as a message while the worker keeps going on everything that does not depend on the answer.
- DO acknowledge every mailbox batch, verified, in the SAME command that re-arms the wait, and never inside a compound command whose exit code can be swallowed. An unacknowledged batch replays forever and hides everything queued behind it, and the runtime does not re-notify. One waiter per Run, never a shell background job, never a self-built monitor: the runtime notifies the conductor on its own.
- DO launch with a custom argv (a terminal created with our own command line) and THEN adopt that terminal into the Task to make it supervised. Adoption is what makes the lifecycle commands able to close that one terminal and no other; a context-only injection leaves it unsupervised on purpose.
- DO treat create + launch + brief as ONE indivisible operation, and verify a few minutes later that the brief actually landed (a created terminal reports success when the text was DELIVERED, not when it ran). Readiness is not completion.
- DO close a finished worker in the same turn. Release the supervised worker by its dispatch; without a dispatch, COUNT the terminals in that worktree before closing anything, because the stop verb's radius is the whole worktree. Remove a worktree only after the orphan audit, because everything gitignored inside it (env file, evidence, session scope) dies with it.
- DO pick the topology by what the work writes: manual QA and backlog grooming run as a fleet in the SAME checkout (state lives in the tracker); anything that writes code gets one Orca worktree per worker, because two sessions in one checkout collide on the git index even when they never touch the same file. Never two workers owning the same module.
- DO declare a claim before touching shared fixture data or a shared credential, and let the conductor arbitrate: first message wins, the conductor keeps the ledger and broadcasts the grant. Conductor-only operations (login / token minting, schema sync, tracker pull-push) are never delegated.
- DO provision a fresh worktree BEFORE launching. A missing provisioning step disguises itself as something else: an absent env file reads as "the tool does not exist", absent dependencies as "a broken import", an absent tracker cache as a worker that simply cannot see the story.
- DO keep `.agents/project.yaml` → `orchestration` as DEFAULTS only (worker cap, agent, model, effort). An explicit user instruction in the conductor session always overrides them for that run; the defaults apply only when the user said nothing.
- WHEN a commit is produced by any session: the forensic trailers (`Worktree:` then `Session:`) are mandatory and are NOT AI attribution. Canon: `/git-flow-master`.

**Read full SKILL.md when**: starting a fleet cold, arbitrating a claim, choosing a topology, recovering a Run from a previous session, or writing an unattended automation.

> Source: `.agents/skills/orca-orchestration/SKILL.md` · phase: `unknown` · source: frontmatter `compact_rules` (verbatim)

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

> Source: `.agents/skills/pr-review-lead/SKILL.md` · phase: `unknown` · extraction strategy: A

---

## Skill: project-context

**Purpose**: Generate or refresh the canonical business context maps and master test plan.

**Compact Rules**:
- Exactly ONE mode per run: `data` · `features` · `api` · `test-plan` · `refresh-all`. Load only that mode's reference; never open a second one in the same pass.
- Mode → reference → output: `data` → `references/data.md` → `.context/business/business-data-map.md` · `features` → `references/features.md` → `.context/business/business-feature-map.md` · `api` → `references/api.md` → `.context/business/business-api-map.md` · `test-plan` → `references/test-plan.md` → `.context/master-test-plan.md`.
- User did not name a mode → ASK. NEVER infer `refresh-all` from a generic "refresh the context" request.
- `refresh-all` runs strictly `data` → `features` → `api` → `test-plan`, one at a time. Each reference's own validation and approval gate must close before the next is loaded. Never skip ahead.
- Artifact missing = CREATE mode: may write once the analysis completes. Artifact exists = UPDATE mode: generate a candidate, show the diff summary, WAIT for explicit approval. NEVER overwrite an existing artifact without that approval.
- Stop the run on a hard dependency failure or a rejected overwrite. A missing SOFT dependency is not a stop: record it as a Discovery Gap and continue, exactly as the selected reference defines.
- NEVER invent business facts. Read every source the selected reference requires; anything unverified belongs under the output's mandatory `## Discovery Gaps` section, not asserted in the body.
- After a successful artifact write, add the pointer to `AGENTS.md` ONLY when that pointer is missing. Never add operational prose to `CLAUDE.md`.
- Forward `$ARGUMENTS` unchanged to the selected mode.

**Read full SKILL.md when**: the requested mode is ambiguous, a `refresh-all` chain fails mid-sequence, or you need the selected reference's own analysis steps and validation gate.

> Source: `.agents/skills/project-context/SKILL.md` · phase: `unknown` · extraction strategy: A

---

## Skill: project-discovery

**Purpose**: Onboard a project through four discovery phases: Constitution, Architecture, Infrastructure, and Specification.

**Compact Rules**:
- DO: run the four phases in order (Constitution → Architecture → Infrastructure → Specification), each gated on the previous. Show the output paths and wait for an explicit "Phase N complete" before continuing — never auto-chain.
- DO NOT: write anything into the target repo. Discovery is read-only on it; `.context/` is the only write target, and modifying the boilerplate itself is `adapt-framework`.
- DO NOT: invent business entities, flows, requirements, or Jira/Xray field IDs and status names. Anything not verifiable from the source goes in the `## Discovery Gaps` section that every output must carry.
- DO: describe what the system DOES, not what product wants it to do. Discovery is reverse-engineering; a "to-be" PRD/SRS is out of scope — point the user at their own product workflow.
- DO: lock the target repo path(s) before Phase 1 and block on ambiguity. A repo that is not cloned locally cannot be discovered from a URL — ask for the clone first.
- WHEN the layout is split sibling repos: run the Phase 1 sub-steps once per repo and merge into ONE `project-config.md`, never interleaved. WHEN it is a monorepo: Phase 1 once project-wide, Phases 2-3 per package.
- DO NOT: generate business maps, the feature catalog, or the master test plan here — those are `project-context` modes, which own their diff and overwrite approval. Exact API types are `bun run api:sync`.
- DO NOT: create per-ticket PBI content or copy the backlog. Phase 4 produces only the backlog access recipe; the committed `README.md` and `templates/` under `.context/PBI/` stay untouched.
- DO NOT: paste credentials or a detected secret into any discovery doc. Reference the `.env` key or the file path only; a hardcoded-secret hit is recorded as a HIGH risk with its path.
- WHEN Phase 2 or 3 settles a test-architecture decision that is architectural AND hard to reverse (runner, isolation/parallelization, fixture and test-data strategy, auth-in-tests, selector contract, CI sharding): record it as an append-only ADR under `.context/ADR/`, drafted `Proposed` for the human to accept.
- DO NOT: mix a discovery session with `adapt-framework`, and do not use this skill for incremental map refreshes — the write boundaries differ.
- DO NOT: skip Phase 1 or its domain glossary on a fresh start. Downstream skills read the glossary as a precondition for ATP authoring and TC naming.
- WHEN both a DB schema/migrations and ORM models exist: prefer the schema or migrations. ORM definitions drift from the live schema.
- DO: mention the IQL methodology only if the user asks why the discovery is structured this way — never lecture someone who just wants the artifact.

**Read full SKILL.md when**: running any phase's sub-steps, applying a completion gate's content checks, or resolving the pre-`adapt-framework` prerequisite list.

> Source: `.agents/skills/project-discovery/SKILL.md` · phase: `unknown` · extraction strategy: A

---

## Skill: regression-testing

**Purpose**: Execute regression test suites via CI/CD, analyze results, classify failures, and produce GO/NO-GO release decisions.

**Compact Rules**:
- DO: run Execute → Analyze → Report in that order. Never skip analysis and jump to a report, and never classify a failure without reading its logs.
- DO: clear the readiness preflight before triggering anything — `gh` authenticated, the suite's workflow file present, GitHub Actions secrets set, Allure resolvable, active env confirmed. A 20-60 minute run that 401s mid-way is the expensive failure.
- DO: persist `RUN_ID` the moment the trigger returns, before anything else. Resume re-attaches to a live run instead of re-triggering CI; a trigger that landed without the id saved costs the whole run again.
- DO NOT: mark a failure REGRESSION without checking its history first — the single most common misclassification. A first-ever failure with no history is NEW TEST, unverified, not a regression.
- DO: classify every failure into exactly one of KNOWN-BLOCKED / KNOWN ISSUE / ENVIRONMENT / NEW TEST / FLAKY / REGRESSION, and assess severity on a separate axis — a FLAKY test on checkout is still CRITICAL.
- DO: exclude `@blocked:{BUG-KEY}` tests from the gating pass-rate and report their count with each blocking key. They are parked behind an already-filed bug: never REGRESSION, and never a new bug.
- DO NOT: use ENVIRONMENT as a scapegoat. Many unrelated tests failing on one host is environment; one test failing on an endpoint other tests reach fine is more likely a REGRESSION.
- DO NOT: call a test flaky on fewer than 5 runs of history — mark "insufficient history" and re-evaluate rather than guessing.
- DO NOT: emit GO while any REGRESSION-class failure stands. Hard vetoes regardless of score: any `@critical` test failing, any HIGH/CRITICAL-severity regression, or a pass rate below 90%.
- DO: file only CONFIRMED product failures — the REGRESSION class, plus a NEW TEST failure once manually confirmed to be a real defect. FLAKY, ENVIRONMENT and KNOWN ISSUE get no issue at all. Triage decides WHETHER to file; the defect-management doctrine decides the type and the fields.
- DO NOT: open a GitHub issue for a quality failure. It is filed in the issue tracker, parented to the QA Defect Management process epic and linked to the source Story — never to a product or dev epic.
- DO: create every Test Execution with its Test Environment (from `active_env`) and `assignee` = self at create time, close the STR only AFTER the verdict is written, and leave the RTP at its ready status — a suite run never completes the plan it ran from.
- DO NOT: invent a sprint number. Take `N` from the user or from the STP's own scope-id; a guessed `N` forks a duplicate STP/STR pair. Nothing found and nothing given → ask before creating at sprint altitude.
- DO NOT: skip the artifact download on a red build (evidence vanishes after the retention window), and never merge smoke and regression results into one pass-rate — their SLOs differ.

**Read full SKILL.md when**: driving the CI commands, applying the GO/CAUTION/NO-GO scoring table, resolving a borderline classification, wiring the TMS artifacts, or writing the report.

> Source: `.agents/skills/regression-testing/SKILL.md` · phase: `unknown` · extraction strategy: A

---

## Skill: shift-left-testing

**Purpose**: Orchestrates pre-sprint Shift-Left QA on a batch of backlog Stories.

**Compact Rules**:
- ACs are the FLOOR. Refinement's job is to push past the happy-path contract: surface the boundaries, exceptions, states, and anomalies the Story is silent on.
- 1:N is the default: a non-trivial AC implies multiple outlines (valid partition + each distinct invalid + boundaries + states). A 1-outline AC requires a written "trivially atomic" justification — never the default.
- Tag each refinement gap to a technique: ranges/limits → BVA; status/lifecycle fields → State-Transition; 2+ interacting conditions → Decision Table; 3+ combinable factors → Pairwise.
- A refined AC (Given/When/Then) is the business assertion; the outline (`Should <behavior> <condition>`) is its exploration. Keep them distinct.
- Stories ONLY (no bugs — nothing to refine upstream). Entry status Backlog / Shift-Left QA / Estimation / Ready For Dev.
- Output = refined ACs + gap/ambiguity questions + the pre-sprint ATP in the `{{jira.acceptance_test_plan}}` field (outline NAMES + coverage estimate, no test code, no execution, NO Test Plan item — `/sprint-testing` Stage 1 creates the item from the field) + the closed `[QA] Shift-Left Review` subtask + the batch report.
- Tracking subtask `[QA] Shift-Left Review` per accepted Story: find-or-create in Phase 1 (assignee = self; Jira's `create` lands it in `{{jira.status.subtask.active}}`), close in Phase 3 handoff via `{{jira.transition.subtask.complete}}` (-> `{{jira.status.subtask.close}}`). The subtask workflow's status NAMES are `ACTIVE` / `Close`, not "In Progress" / "Done". Exhaustive session annotations (long analysis, refinement traces) go on the SUBTASK, keeping the Story clean. Work type + transitions resolved from `.agents/jira-workflows.json`; no subtask work type in the catalog → skip with a warning, never block.
- The heart of the skill (Phase 2) = edge cases not in story + ambiguities + gaps — feed them to PO/Dev as questions AND as derived outlines.
- On taking a Story into refinement (first QA pickup), set `qa_assignee` to self — read-before-write, never overwrite an existing owner (`agentic-qa-core/references/defect-management-doctrine.md` Part 2). This skill files NO Bug/Defect/Improvement; only the QA-Assignee hook applies.
- On completion: add label `shift-left-reviewed`; transition Backlog → Shift-Left QA → Estimation.

**Read full SKILL.md when**: running the batch grooming pipeline, writing the per-Story `shift-left-refinement.md`, or handling the PO/Dev handoff.

> Source: `.agents/skills/shift-left-testing/SKILL.md` · phase: `unknown` · extraction strategy: A

---

## Skill: sprint-testing

**Purpose**: Orchestrates in-sprint manual QA per issue across Stages 1 (Planning), 2 (Execution) and 3 (Reporting).

**Compact Rules**:
- AC-pass is the FLOOR, not the goal. Coverage = AC-conformance + risk-beyond-AC (boundaries, errors, states, anomalies). Never report "% of ACs verified" as completeness. (Canon: `agentic-qa-core/references/test-design-doctrine.md`.)
- 1:N is the default: explode every non-trivial AC into multiple cases (EP partitions + boundaries + states + contexts). Collapsing an AC to one case requires a written "trivially atomic" justification.
- Apply techniques by trigger: EP always; BVA wherever a range / limit / length / date-window exists; State-Transition for stateful entities; Decision Table when 2+ conditions interact; Pairwise when 3+ combinable factors (log the reduction); Error-Guessing charters for experience-based risk.
- A criterion is a business assertion; a test case is a concrete exploration of it. Run the Test-Design Checklist before finalizing the ATP.
- CLASSIFY before filing — stop hardcoding "Bug". **Bug** = affected feature already live above Staging (end-user visible); **Defect** = feature still pre-release (Staging or below), the normal output of sprint testing; **Improvement** = not a broken AC (an enhancement, or an under-specified/absent AC surfaced by a test-beyond-AC). Classification follows the FEATURE's lifecycle stage, not where the problem was found. (Canon: `agentic-qa-core/references/defect-management-doctrine.md` Part 1.)
- `qa_assignee` (`{{jira.qa_assignee}}`) = the authenticated session user (self-assign). Set it when a Story is TAKEN INTO TESTING (start_testing) and on every filed Bug / Defect / Improvement. NEVER-OVERWRITE an existing owner (read-before-write); distinct from the native dev `assignee` (Part 2).
- `components` (native, MANDATORY) = the affected product module/Epic, must pre-exist in the Jira Components module (Part 3).
- Three-axis model: **parent** = QA Defect Management process epic (`qa.qa_epics.defect_epic`, found-or-created — NEVER a product/dev epic, NEVER the Story); **issue link** = the source Story (traceability); **components** = product module (Part 4).
- `priority` (native) is auto-derived from `{{jira.severity}}` (critica→Highest, mayor→High, moderada→Medium, menor→Low, trivial→Lowest); override with a 1-line justification (Part 5.1).
- Three stages, always in order: Stage 1 Planning → Stage 2 Execution → Stage 3 Reporting. Hand off Stages 4/5/6 to `test-documentation` / `test-automation` / `regression-testing`.
- Jira is source of truth. Read tickets via `bun run jira:sync-issues get <KEY> --include-comments`, then the synced `.md`. NEVER `acli workitem view` for custom fields (returns `null`).
- Bugs run the veto + triage + risk-score decision tree BEFORE any ATP is written.
- Execution = smoke pass first, then trifuerza (UI/API/DB) exploration; capture evidence under the PBI folder.
- API testing = three-tool maneuver: OpenAPI MCP for schema (READ-ONLY) → `bun run api:login` for the token (→ `.auth/tokens.env`) → **curl** for authenticated requests. NEVER execute via the OpenAPI MCP. Canon: `agentic-qa-core/references/api-testing-doctrine.md`.
- Consult `domain-glossary.md` (if present) before authoring the ATP, refined ACs, and TC outlines.
- On any subagent failure: STOP, report partial state, offer retry / skip-stage / abort. No auto-fix, no auto-rollback.
- Stage 1 Set-first order (Modality jira-xray — AUTHORITATIVE): the Story's coverage backbone is its **ATS** (`ATS: {US_ID}: {story title}` — mandatory per Story, even with a single TC; parent: QA Test Artifacts epic; components inherited from the Story). Create the sprint `Test` issues, put ALL of them in the ATS, and link **ATS→Story** via the `test` slug (Story `is tested by` ATS) — the PRIMARY coverage-bearing edge (fills the Xray coverage panel); a direct TC→Story link is the only other coverage-bearing edge (last resort, valid only when no ATS can exist); Story↔ATP and Story↔ATR links are administrative traceability with ZERO coverage.
- The ATP item is find-or-created FROM the `{{jira.acceptance_test_plan}}` field (where shift-left authored it) — pre-sprint the ATP lives ONLY in that field; Stage 1 is where the Test Plan item is born (parent: QA Master Test Plan epic).
- Derive, never re-list: the ATP's and the ATR Execution's test lists are DERIVED from the ATS membership — never maintained as independent id lists (three hand-maintained lists drift silently and corrupt coverage).
- ATR always with environment (HARD GATE): create the ATR / retest Execution ALWAYS carrying the Test Environment resolved from `active_env` in `.agents/project.yaml` (or the session env switch). No ATR without environment — an environment-less Execution fails the Stage-1 DoD gate (`agentic-qa-core/references/stage-gates.md`).
- TC∈ATS / TC∈ATP / TC∈ATR membership is Xray-internal (GraphQL) — NEVER expressed as Jira issue links in Modality jira-xray. Do NOT link TCs directly to the Story (last-resort only, for instances with no Test Set work type).
- Bug retest (Modality jira-xray): ONE repro `Test` by default, created at fix-verification time (Stage 2), linked Bug↔Test via the `test` slug and executed in the retest Execution (`ReTest: {BUG_KEY}: {summary}`); 1:N only with a written test-design justification. Modality jira-native: no in-sprint TCs (the bug is the immediate retest case) — persistent-Test decisions defer to Stage 4.
- STP find-or-create fires on the sprint's FIRST ticket: `STP: Sprint#{N}: {objective}` (Test Plan item, parent: QA Master Test Plan; a LIVING planner — append each tested ticket, keep progress current). The sprint recap Execution `STR: Sprint#{N}: Regression Testing` (parent: QA Test Artifacts) is created at sprint close.
- Two modes, ASKED at Session Start, never inferred: **sprint-wide** (the whole sprint's QA backlog) or **single-issue** (one issue from it). Only `sprint-wide` creates/updates the STP and the sprint session pair; `single-issue` creates neither.
- Mode is a SCOPE, and scope is only one axis: **scope** (single-issue | sprint-wide) × **executors** (1 | N). One executor is the default and is unchanged in every detail. N>1 ("fleet mode") is sprint-wide ONLY, fires when the user answers the executors question with N (`orchestration.max_workers` in `.agents/project.yaml` is a round cap, never a switch); the orchestration gate then decides only who opens the sessions (pass → Orca launches/supervises; fail → the human pastes the same launch lines), and never changes what an issue's pipeline does — only who runs it. Canon: `sprint-testing/references/fleet-conductor.md`.
- Fleet mode invariants: the launch file is written ALWAYS (gate or no gate — without the gate the human pastes its N lines) and when the gate fails the orchestration tool is NEVER named to the user; a worker = single-issue mode + `PARALLEL_TESTING` / `PARALLEL_TICKET`, no checkpoints, preflight MCP probes NOT skippable, zero sprint-altitude writes; **rounds** (concurrency groups) are NOT **waves** (Jira-status buckets).
- `sprint-wide` is a REAL session scope, not a folder: `.session/sprint-testing/sprint-<N>/{plan.md, progress.md}` per `agentic-qa-core/references/session-management.md` §6/§7, holding one nested `<JIRA-KEY>/` sub-scope per issue. `plan.md` is the local STP (queue + waves + assignment); `progress.md` is the append-only sprint log, one entry per issue close. There is NO local sprint tracker file — anything the team needs lives in the STP in Jira.
- Sprint scope is a JQL QUERY, never a hardcoded issue-type list: take the work types declared `coverable: true` in `.agents/jira-required.yaml`, resolve each one's `jira_issue_type` (`A | B | C` = ordered alternatives, first the instance has wins), intersect with `.agents/jira-workflows.json`. A declared type the instance lacks is SKIPPED WITH A NOTE, never a blocker.
- STP maintenance parity (concurrent testers): `plan.md` ↔ the STP issue DESCRIPTION — rewritten wholesale, so ONE writer (whoever plans the sprint), read-first before writing. `progress.md` ↔ the STP issue COMMENTS — append-only on both sides, one comment per issue close, so two testers never clobber each other. Where the comment log and a Story's ATR disagree, the **ATR wins** — it is the artifact of record.

**Read full SKILL.md when**: starting a sprint cold, resuming a session, or handling a bug-triage / sprint-wide flow not covered by the rules above.

> Source: `.agents/skills/sprint-testing/SKILL.md` · phase: `unknown` · source: frontmatter `compact_rules` (verbatim)

---

## Skill: sync-ai-context

> ⚠ LOW-CONFIDENCE (extraction strategy B): bullets scraped without context — read the full SKILL.md before relying on any rule below.

**Purpose**: Synchronize AI-critical repository documents against current context, package scripts, skills, aliases, and project identity.

**Compact Rules**:
- Legacy `sync-ai-memory` invocations route to `sync` for backward compatibility. The canonical name avoids confusion with Engram persistent memory.
- Forward `$ARGUMENTS` unchanged.
- Load `references/sync.md`, patch only verified facts, preserve all protected sections, run its cross-document and security checks, then report per-file outcomes.
- This skill synchronizes repository documents. It does not read, write, merge, or replace Engram observations.

**Read full SKILL.md when**: the compact rules above are insufficient (e.g. novel scenario, debugging, or the briefing tells you to load the full skill).

> Source: `.agents/skills/sync-ai-context/SKILL.md` · phase: `unknown` · extraction strategy: B

---

## Skill: test-automation

**Purpose**: Plan, write, and review automated tests following KATA (Komponent Action Test Architecture) on Playwright + TypeScript, or explain existi...

**Compact Rules**:
- "All ACs covered" is the FLOOR, not the success bar. The ATC set must also cover risk-beyond-AC: invalid/boundary inputs, auth/error paths, state transitions, and anomalies the AC is silent on.
- 1:N is the default: one AC maps to multiple ATCs. EP-merge collapses same-behavior inputs INSIDE one partition into a parameterized ATC — it must NEVER collapse across distinct partitions, boundaries, or states. BVA cases are required wherever a range/limit/length/date-window exists (EP alone misses off-by-one).
- Apply techniques by trigger: EP always; BVA on ranges/limits; State-Transition for stateful flows; Decision Table when 2+ conditions interact; Pairwise when 3+ combinable factors (log the reduction).
- Parametrize for artifact economy: same-behavior data variants → ONE parameterized `@atc` (fixture / data-factory rows iterated by the test) per partition, NOT N ATCs; split only when action / outcome / state differs. (Canon: doctrine §"Part 2.5".)
- An AC is the business assertion; an ATC is its concrete exploration (Precondition + Action + Assertions). Run the Test-Design Checklist before finalizing the plan.
- Plan → Code → Review, always in order. Only automate `Candidate` verdicts from `/test-documentation`.
- Fixture selection: API-only → `{ api }` (no browser); UI-only → `{ ui }`; hybrid → `{ test }`.
- ATC = atomic mini-flow; NEVER calls another ATC. Reusable chains → a Steps module.
- Max 2 positional params (3+ → object param). Locators inline (extract only at 2+ uses). Imports via aliases (`@api/`, `@schemas/`, `@utils/`) — no relative imports.
- Public methods fail fast; utilities silent-fail (return null). Validate against `kata-manifest.json` before adding components/ATCs (anti-duplication gate).

**Read full SKILL.md when**: writing KATA component code, choosing fixtures for a hybrid flow, or applying the Phase 3 review checklist.

> Source: `.agents/skills/test-automation/SKILL.md` · phase: `unknown` · extraction strategy: A

---

## Skill: test-documentation

**Purpose**: Analyze, prioritize, and document test cases in TMS (Jira/Xray), or repair an existing Story-ATS-ATP-ATR-TC cascade through a sealed expl...

**Compact Rules**:
- Documenting an AC→TC map is the FLOOR (≥1 TC per AC is a minimum, never a target). Coverage = AC-conformance + risk-beyond-AC; the TC set must include boundary / negative / state / anomaly cases the AC is silent on. (Canon: `agentic-qa-core/references/test-design-doctrine.md`.)
- 1:N applies to DERIVATION (consider many cases by technique), not to the REGRESSION repository. Only regression-worthy scenarios (Candidate/Manual) are persisted there; most are Deferred. jira-native: Stage 4 CREATES `Test`s for those only (Deferred = report-only). jira-xray: sprint `Test`s already exist (Stage 1) — Stage 4 PROMOTES the regression-worthy into the Test Plan + enriches them. Document because it will be re-run, never to hit a count.
- Apply techniques by trigger: EP always; BVA wherever a range/limit/length/date-window exists; State-Transition for stateful entities; Decision Table when 2+ conditions interact; Pairwise when 3+ combinable factors.
- Parametrize for artifact economy: same-behavior data variants → ONE Test (`Scenario Outline` + `Examples` rows) per partition, NOT N separate Tests; split only when action / outcome / status / state differs. (Canon: doctrine §"Part 2.5".)
- Cross-cutting characteristics (XSS, perf, a11y) deferred to app-level suites are an EXPLICIT handoff, not a silent drop — name the receiving suite or file the gap.
- Documents already-validated behavior only — not an exploration tool (exploration belongs to `/sprint-testing`).
- TC identity = Precondition + Action + verifiable outcome. Naming (TC): `{US_ID}: TC#: should <expected outcome> [<connector> <condition>] [given <precondition>]`; `Validate <feature>` is reserved for the GROUPING layer (Test Set summary / `describe()`). Reject `"Login test"`, `"Login - error"`, `"TC1: Test form"`.
- ROI formula → one of three verdicts per TC: Candidate (feeds test-automation), Manual, Deferred. Prioritize by risk.
- Cardinality: US→TC is 1:N; AC→TC is N:1 or N:M. Resolve TMS modality (Xray vs Jira-native) in Phase 0 before documenting.
- Bug-driven (GOLDEN RULE): not every bug is a regression TC, but a regression-worthy bug MUST end with a Test — REUSE the existing failed Test if it came from one, else CREATE one (both modalities). A non-qualifying bug is treated like a failed test → Deferred, no new Test.
- ATS is MANDATORY per Story (`ATS: {US_ID}: {story title}`, even with a single TC): a `Test Set` holding ALL the Story's TCs, parented to the QA Test Artifacts epic, `components` INHERITED from the Story (mandatory — the components exemption applies ONLY to the optional feature-level `TS:` grouping sets).
- Set-first creation order: find-or-create the ATS, ATP and ATR BEFORE the first TC (module-driven pre-creates the containers because parallel TC sharding needs the targets to exist); add each TC to the ATS, THEN derive the ATP's and the Execution's test lists FROM the ATS membership — never three independent id lists.
- Coverage truth (live-verified): coverage comes from the ATS→Story `is tested by` link (primary) OR a direct TC→Story link (last resort, valid only when no ATS can exist). Story↔ATP and Story↔ATR links are administrative traceability and contribute ZERO coverage — keep them, never count them as coverage.
- Membership: Modality jira-xray → TC∈ATS/ATP/ATR is Xray-internal (GraphQL, via `/xray-cli`), NEVER a Jira issue link (and never in the TC title). Modality jira-native carve-out: with the Test Set work type present, membership IS expressed as TC→ATS issue links; work type absent → no ATS.
- Direct TC→Story links are the cascade's LAST RESORT (valid only when no ATS can exist — e.g. jira-native without the Test Set work type), not the default. The defect is a TC with NO path to its Story, not the direct link itself.

**Read full SKILL.md when**: resolving TMS modality, computing ROI, writing Gherkin, or wiring US-ATP-ATR-TC traceability links.

> Source: `.agents/skills/test-documentation/SKILL.md` · phase: `unknown` · source: frontmatter `compact_rules` (verbatim)

---

## Skill: xray-cli

**Purpose**: Xray Cloud test management via `bun xray` CLI: create/list tests, manage test executions and plans, import JUnit/Cucumber/Xray JSON resul...

**Compact Rules**:
- DO: confirm the project is in Modality jira-xray before invoking anything here; a jira-native project (no Xray plugin) routes to `/acli` instead. Modality is resolved once in `/test-documentation` Phase 0 and inherited downstream, never re-decided mid-flow.
- DO NOT: call this CLI from a workflow skill. Workflow skills write `[TMS_TOOL]` pseudocode and load this skill; only this skill owns the literal syntax.
- DO: pass an explicit `--limit` above the expected count on every list command — all of them default to 20 rows and truncate silently. Read the true count from the `(N total)` header, never by counting rows; a truncated read looks exactly like data loss.
- DO: capture the key of anything you create from the bare `KEY <PROJ-123>` line or from `--json`, never by scraping the decorated success line — a create whose key was not captured leaves an orphan artifact nothing downstream can link.
- DO NOT: pass Manual steps inline when creating a test — Xray Cloud silently drops them. Create the test first, add one step per call, then verify the steps landed.
- DO: pin every ATR execution to a Test Environment (value from `active_env`), so results stay comparable across runs. An execution that slipped through without one is repaired in place, not left.
- DO: keep the Set-first cascade: the per-Story ATS holds the membership, and the Plan (ATP) and Execution (ATR) derive their test lists from it rather than maintaining their own.
- DO: fill Story coverage with the Jira-layer issue link from the ATS to the Story. Plan→Story and Execution→Story links are administrative traceability and cover nothing; a direct Test→Story link is a last resort for an instance with no Test Set work type. Plan/Execution/Set MEMBERSHIP is Xray-internal GraphQL and is never an issue link.
- DO: verify traceability with the one-call three-edge check, never from the coverage edge alone — a missing ATP→Story or ATR→Story link is a FAIL, not a warning, and the same call compares the ATS membership against the Plan and Execution test lists.
- WHEN a Jira-fallback path created the container without authenticated Xray: the Xray layer never registered the tests and runs come back empty. Reconcile with the per-entity sync (or the bulk repair scan) before importing results.
- DO: import results onto an existing Execution key, never scoped to a project — the import API cannot set a parent, so a project-scoped import mints a fresh unparented Execution on every run, outside the artifact ladder.
- DO NOT: hand-craft Xray JSON payloads outside this CLI, or reuse a bearer token past its 24h TTL. A stale token produces silent 401s mid-import that read like network blips.
- DO: dry-run any import or backup restore before applying. Both write irreversibly across hundreds of tests and runs.
- WHEN moving between sites: restore in sync-by-key mode (GraphQL ids are re-assigned per site, keys are not), re-authenticate between export and restore because auth holds ONE site at a time, and finish with the Jira instance-migration flow — field ids are reassigned and an old id silently resolves to a different field.
- DO NOT: push run results for TCs the ROI verdict marked terminal-Manual. It creates audit noise and breaks the Candidate / Manual / Deferred reporting.
- (truncated — read full SKILL.md for the rest)

**Read full SKILL.md when**: composing a specific command, wiring the canonical end-to-end Story flow, running backup/restore or a cross-site migration, or enriching the synced PBI cache.

> Source: `.agents/skills/xray-cli/SKILL.md` · phase: `unknown` · extraction strategy: A
