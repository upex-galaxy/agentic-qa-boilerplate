# Master Test Plan Generator

Generate or update the Master Test Plan — a business-derived test roadmap that answers one question: **what to test in this application, and why does it matter?**

**Where it lives**: the `## Master Test Plan` section of the `QA Master Test Plan` Epic description in Jira (`qa.qa_epics.master_test_plan_epic` in `.agents/project.yaml`). Jira is the source of truth; `bun run jira:sync-issues` caches the section at `.context/PBI/qa-artifacts/master-test-plan.md` (gitignored, never hand-edited). This mode writes the Epic, never a local file. Decision record: `.context/ADR/ADR-0007-mtp-in-jira.md`.

**Target**: $ARGUMENTS (project path, module filter, or leave blank for full system)

---

## What this produces

A conversational, senior-QA-voice document that sits **on top of** the data map (`business-data-context`) and the E2E map (`business-e2e-context`) and converts them into a ranked testing strategy.

The output contains:
- Executive risk map (top critical flows, ranked)
- Per-flow testing rationale (what breaks the business, what breaks user trust)
- State machines that matter (financial / legal / operational impact only)
- Silent killers — automated processes that fail without visible feedback
- External-integration failure points and acceptable degradations
- Dependency cascade between flows
- Developer-forgotten edge cases
- Priority-ordered pre-release checklist
- Explicit out-of-scope section (to stop scope creep)

This is **NOT** a flow description (→ `business-data-context`), a journey or feature inventory (→ `business-e2e-context`), nor a test case list (→ TMS via `/test-documentation`). It is the **test-strategy layer** above those maps.

---

## Sources (use ALL available)

| Source | Status | What to extract | Tool |
|--------|--------|----------------|------|
| `business-data-context` map | **HARD REQUIREMENT** | Critical flows, state machines, automatic processes, integrations, business rules | `bun run context:map business-data-context` |
| `business-e2e-context` map | Optional — warn if missing | Journeys, feature catalog, CRUD matrix, feature flags, high-risk tags, QA relevance matrix | `bun run context:map business-e2e-context` |
| Discovery risk seed | If available | The HIGH risks `project-discovery` recorded in its Phase 1 assessment and carried in its handoff (severity, evidence path) | The `## Project Assessment (Phase 1)` block in `.agents/instructions/agent-project.md` (`AGENTS.md` on a project discovered before the move), or the handoff the user pastes |
| `infra-context` map | If available | NFR sections (`nfr-<slug>`: performance, security, reliability, observability budgets), external services, environments | `bun run context:map infra-context` (`--list`, then `--section nfr-<slug>`) |
| Domain vocabulary | If available | Business terms, so flows and risks are named the way the business names them | `bun run context:map business-domain-context` |
| Legacy `.context/risk-assessment.md` (input only) | Only when a project still holds one | Earlier risk findings, merged into the discovery seed | Read file; never delete or rewrite it |
| Git history | If signals needed | Recently changed modules (breakage-likelihood indicator) | `git log --oneline -90 --stat` |
| Incident / bug tracker | If helpful | Historical pain points that feed "why it matters" per flow | `[ISSUE_TRACKER_TOOL]` |
| Legacy local MTP `.context/master-test-plan.md` | Only when it exists and is not a placeholder | Seed for the Epic on CREATE (see "Seeding from a legacy local MTP") | Read file |

**Golden rule**: ground every priority claim in evidence from the maps. "This flow is high-risk because…" must cite either a data-map flow, an E2E-map journey or QA-relevance row, a discovery HIGH risk, an infra-map NFR section, or a named external dependency. No hand-wave prioritization.

---

## Mode detection

Load `/acli` first. Resolve the MTP Epic (Step 1 of "Write to Jira" below), then refresh the cache from it:

```
bun run jira:sync-issues get <MTP-KEY>
Does .context/PBI/qa-artifacts/master-test-plan.md exist now?
  → NO:  CREATE mode — the Epic has no `## Master Test Plan` section yet.
         A non-placeholder legacy `.context/master-test-plan.md` exists?
           → offer to SEED from it (see "Seeding from a legacy local MTP").
           → otherwise generate from scratch.
  → YES: UPDATE mode — read the cache as the current plan, generate the new
         version, show the diff summary, WAIT for explicit approval before
         writing the Epic. NEVER auto-overwrite.
```

---

## Altitude and budget

The MTP is the PRODUCT altitude of the planning ladder (`agentic-qa-core/references/planning-ladder.md`): strategy for the whole system. Feature depth belongs one rung down, in each feature's FTP (`FTP: {EPIC-KEY}: {feature}`, parented to the same MTP Epic). That split is also what keeps the plan inside Jira's description cap.

**The cap counts serialized ADF JSON, not visible text.** Jira Cloud rejects a description whose ADF document serializes past 32,767 characters, and markdown converted to ADF grows by a factor that depends on its structure (tables and short lists grow the most). Measurements behind this: ADR-0007.

**Size check on EVERY write** (CREATE and UPDATE, not only the first):

```
# the FULL description as it will be stored: the text outside the section + the new section
bun .agents/skills/acli/scripts/md-to-adf.ts <description.md> <description.adf.json>
jq -c . <description.adf.json> | wc -m        # must stay at or under 30000
```

Over 30,000 → **STOP before writing**. Propose which sections move to which FTP (per-flow rationale, state-machine detail and edge cases of feature X → `FTP: {EPIC-KEY}: X`), with the size each move saves, and wait for the user's decision. A Jira rejection for content length (`CONTENT_LIMIT_EXCEEDED`) is the same STOP: never truncate, never split the section across two fields.

---

## Discovery phases

### Phase 1 — Validation gate

#### 1.1 Data map check (HARD)

If `bun run context:map business-data-context` prints the placeholder notice (or the skill is missing) → **STOP** with:

> This mode needs the `business-data-context` map to reason about risk. Run `project-context` mode `data` first, then re-invoke mode `test-plan`.

Do not proceed with assumptions.

#### 1.2 E2E map check (SOFT)

If the `business-e2e-context` map is a placeholder → **WARN and proceed**. Log in §10 Discovery Gaps:

> The E2E map was not available at generation time. This plan reflects the data map only. Angles missed: journey risk, CRUD-coverage gaps, feature-flag risk, per-feature QA-relevance tagging. Run `project-context` mode `e2e` and re-run mode `test-plan` for the complete picture.

#### 1.3 Read and extract

From the data-map: flows, state machines, automatic processes, external integrations, business rules.
From the E2E map (if generated): the highest-risk journeys, high-risk features, CRUD gaps (⚠️ / ❌), feature flags, QA-coverage deficits, third-party dependencies.
From the discovery risk seed (if present): every HIGH risk, each one scored below like any flow and never dropped silently. A legacy `.context/risk-assessment.md`, when a project still holds one, is merged into the seed.
From the infra map (if generated): the NFR budgets that make a flow performance-, security- or reliability-critical, and the external services a flow depends on.

### Phase 2 — Risk scoring

Apply this rubric to every flow / feature / automatic process. The rubric is **internal** — the output document shows conclusions, not the scoring table.

| Factor | H (3) | M (2) | L (1) |
|--------|-------|-------|-------|
| **Business Impact** | Revenue, legal, security, compliance | User trust, operational efficiency | Convenience, polish |
| **Breakage Likelihood** | Recent changes, complex logic, external deps, flaky history | Moderate complexity, stable integration | Simple CRUD, rarely changes |
| **Blast Radius** | Affects all users / other flows break / hard to roll back | Affects a segment / isolated | One user action, easy rollback |

Composite score = product of the three. Map:
- `≥ 18` → **CRITICAL**
- `8–17` → **HIGH**
- `3–7` → **MEDIUM**
- `< 3` → **LOW**

### Phase 3 — Dependency mapping

For every CRITICAL and HIGH item, trace which downstream flows break if it fails. This feeds §6 (cascade graph) in the output.

### Phase 4 — Silent-killer detection

Identify automatic processes (crons, webhooks, DB triggers) with **no UI feedback path**. Score their likelihood separately — even LOW-frequency silent failures are CRITICAL because they rot unnoticed.

---

## Output structure

Compose the body of the `## Master Test Plan` section with this structure (use `###` for its sub-sections, so the section boundary stays intact). Every section stays at product altitude: a line that only makes sense for one feature goes to that feature's FTP.

**Tone**: conversational, senior-QA voice, second person ("you'll want to verify…"). Assume the reader is a QA engineer onboarding to the project — guide them, don't lecture. Use the same flow names as the data-map.

**What NOT to include**: flow diagrams (live in data-map), journeys and feature catalogs (live in the E2E map), test case definitions (live in TMS), payload / fixture snippets.

### 1. Visual header

ASCII box with project name + one-line intent ("What to test in this system, and why").

### 2. Executive risk map

A short narrative paragraph framing the system's most fragile areas, followed by:

```markdown
| Priority  | Flow                       | Why it matters                   | Depends on / Affects         |
|-----------|----------------------------|----------------------------------|------------------------------|
| CRITICAL  | Checkout & payment         | Revenue / fraud exposure         | Inventory, notifications     |
| HIGH      | Auth & session management  | Security, locks out every flow   | Everything gated by login    |
```

CRITICAL and HIGH flows only. Anything below HIGH goes to §8 as a short list.

### 3. What to test first and why

One short paragraph per CRITICAL / HIGH flow: why it matters (business impact, customer-facing wording) and what commonly breaks. The per-flow depth (dependencies in detail, what an experienced QA would check, scenarios) is feature altitude: it goes to that feature's FTP, and this paragraph names the FTP when one exists.

Prose, not code. No payloads, no fixtures.

### 4. State machines that matter

Only the state machines with financial, legal, or operational impact. Per machine, one line: the business consequence of an illegal transition, and whether corruption would be visible. Transition tables and forbidden-state lists go to the owning feature's FTP.

### 5. Silent killers — automated processes

Crons, webhooks, DB triggers that fail without visible UI feedback. Per process:
- What it does and which flow depends on it
- What breaks if it misses a run, runs twice, or runs out of order
- How failure is detected (logs? alerts? none?)
- Recommended QA strategy (synthetic probe, log assertion, scheduled audit)

This section is usually the most undertested area of a system.

### 6. External integrations — failure points

Per third-party service (Stripe, SendGrid, Auth0, etc.):
- Which business flow stops if the service is down
- Critical timeouts and retry boundaries
- Acceptable degradation (what still works, what is hard-fail)
- Known quirks (rate limits, eventual consistency, sandbox vs prod drift)

### 7. Dependency cascade between flows

ASCII cascade graph plus narrative of the 2–3 most critical chains:

```
Checkout ──► Payment ──► Inventory ──► Notifications ──► ERP sync
    │           │            │              │               │
    └ fails here = no revenue, no stock decrement, no email, no ERP sync
```

Point is: testing flow A in isolation hides breakage that only surfaces in `A → B → C`.

### 8. Edge cases developers commonly forget

Grouped by theme, not by flow: concurrency, data limits, timezone / DST, permission boundaries, orphaned states, idempotency. For each theme, one line naming the project flow most at risk; the cases themselves go to that feature's FTP.

### 9. Pre-release checklist (priority-ordered)

Short, action-oriented, sized to fit the Epic's description budget. Ordered CRITICAL first, then HIGH. Each line is one check phrased as "Verify X does Y under Z". No TC IDs (those live in the TMS).

### 10. What is NOT in this plan

Explicit delegation to stop scope creep:

```markdown
- Flow-level diagrams and state-machine transition tables → the `business-data-context` map
- Journeys, feature catalog, CRUD matrix, feature flags → the `business-e2e-context` map
- API endpoint inventory / contracts → `bun run api:sync` + `project-context` mode `api` (when available)
- Detailed test case definitions and traceability → TMS (see `/test-documentation`)
- Sprint-level execution order → the sprint's **STP** in Jira (see `/sprint-testing` sprint-wide mode)
```

### 11. Discovery gaps

MANDATORY, kept short (one line per gap). List anything you could not ground in evidence:
- Flows mentioned in the data-map with no clear business owner
- Integrations without documented SLAs or failure modes
- State machines where transitions are implied by code but not documented
- If §1.2 triggered the E2E-map warning, restate the limitation here

"I could not verify X" is better than inventing an answer.

---

## Write to Jira — the MTP Epic

Runs after the section body is composed (in UPDATE mode: after the user approved the diff). Load `/acli` before any `[ISSUE_TRACKER_TOOL]` call; rich text goes through `acli/scripts/md-to-adf.ts` (see `/acli` "Publishing rich text").

### Step 1 — Find-or-create the Epic

Cached key in `.agents/project.yaml` → `qa.qa_epics.master_test_plan_epic.key`: use it. Otherwise search by name:

```
[ISSUE_TRACKER_TOOL] Search Issues:
  - jql: project = {{PROJECT_KEY}} AND type = Epic AND summary ~ "{qa.qa_epics.master_test_plan_epic.name}"
```

Not found → create it:

```
[ISSUE_TRACKER_TOOL] Create Issue:
  - type: Epic
  - summary: {qa.qa_epics.master_test_plan_epic.name}     # "QA Master Test Plan"
  - labels: {qa.qa_artifact_label}                        # QA-Artifact — mandatory identity label
  - assignee: self                                        # artifact-lifecycle §2
```

Cache the discovered/created key into `.agents/project.yaml` → `qa.qa_epics.master_test_plan_epic.key`.

### Step 2 — Write the section (read-first, never clobber)

Read the Epic `description` FIRST (`[ISSUE_TRACKER_TOOL] View Issue` with the description field). QA owns only the `## Master Test Plan` section: replace its content (append the heading when absent) and keep every other section, PO or human text included, verbatim. An old `## Master Test Plan (mirror)` section from the previous file-first model is replaced by this one, not kept beside it.

Assemble the full description, run the size check from "Altitude and budget", and only then write:

```
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: <MTP-KEY>
  description: <the full description, as ADF>
```

### Step 3 — Cross-link the 3 sibling QA epics

Ensure a `relates to` link from the MTP Epic to each sibling (resolve by name from `qa.qa_epics.*`): **QA Test Repository**, **QA Test Artifacts**, **QA Defect Management**. Idempotent — skip links that already exist. A sibling that does not exist yet is NOT created here (its owning skill creates it); note it in the report instead.

### Step 4 — Read it back (Critical Rule #16)

```
bun run jira:sync-issues get <MTP-KEY>
```

Read `.context/PBI/qa-artifacts/master-test-plan.md` and confirm it carries the new plan. The write's success code is not the proof; the cache is.

---

## Seeding from a legacy local MTP

Projects that ran this mode before the MTP moved to Jira have a committed `.context/master-test-plan.md`. On CREATE (the Epic has no `## Master Test Plan` section), when that file exists and is not the placeholder:

1. Offer to seed the Epic from it. Nothing is written without the user's approval.
2. On approval, take its content as the section body, run the size check, and on overflow present the FTP move proposal before anything is written (a plan generated under the file-first model is usually over budget: its per-flow sections are feature altitude).
3. Write through Steps 2-4 above.
4. NEVER delete the local file. Tell the user it is now superseded by the Jira Epic and its cache, that no skill reads it any more, and that removing it from git is their call.

---

## After generation

- In UPDATE mode: show diff summary, wait for explicit confirmation before writing the Epic.
- Report:
  - CRITICAL flows identified: N
  - HIGH flows identified: N
  - Silent killers flagged: N
  - Integration failure points mapped: N
  - Discovery gaps open: N
  - MTP Epic: {key} (created | updated), description size {ADF JSON chars} / 30,000, sibling links ensured (note any missing sibling)
  - Sections moved to FTPs this run (if any), with their target FTP
  - Cache read back: `.context/PBI/qa-artifacts/master-test-plan.md` (yes / no)
- If §1.2 warned, remind the user to run `project-context` mode `e2e` and re-run mode `test-plan`.
- If a project-owned context skill sits over the master test plan (the project names the aspect): offer to run `project-context` mode `context-skill <aspect>` in UPDATE now. The methodology index itself (`iql-context`) is shipped upstream and is NOT updated from a map: a local rule goes to its `references/project-overrides.md`.
