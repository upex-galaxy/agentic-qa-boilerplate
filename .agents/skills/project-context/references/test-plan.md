# Master Test Plan Generator

This mode generates or updates the Master Test Plan: a business-derived test roadmap that answers one question, what to test in this application and why it matters.

**Where it lives**: the `## Master Test Plan` section of the `QA Master Test Plan` Epic description in Jira (`qa.qa_epics.master_test_plan_epic` in `.agents/project.yaml`). Jira is the source of truth; `bun run jira:sync-issues` caches the section at `.context/PBI/qa-artifacts/master-test-plan.md` (gitignored, never hand-edited). This mode writes the Epic and no local file. Decision record: `.context/ADR/ADR-0007-mtp-in-jira.md`.

**Target**: $ARGUMENTS (project path, module filter, or leave blank for full system)

---

## What this produces

A conversational, senior-QA-voice document that sits on top of the data map (`business-data-context`) and the E2E map (`business-e2e-context`) and converts them into a ranked testing strategy.

It holds a ranked risk map with per-flow rationale, the state machines and silent killers that matter, integration failure points, the dependency cascade, forgotten edge cases, a pre-release checklist, and an explicit out-of-scope list (the sections are under "Output structure").

It is the test-strategy layer above the maps. Flow descriptions live in `business-data-context`, the journey and feature inventory in `business-e2e-context`, and test case lists in the TMS via `/test-documentation`.

---

## Sources (use all available)

| Source | Status | What to extract | Tool |
|--------|--------|----------------|------|
| `business-data-context` map | Hard requirement | Critical flows, state machines, automatic processes, integrations, business rules | `bun run context:map business-data-context` |
| `business-e2e-context` map | Optional, warn if missing | Journeys, feature catalog, CRUD matrix, feature flags, high-risk tags, QA relevance matrix | `bun run context:map business-e2e-context` |
| Discovery risk seed | If available | The HIGH risks `project-discovery` recorded in its Phase 1 assessment and carried in its handoff (severity, evidence path) | The `## Project Assessment (Phase 1)` block in `.agents/instructions/agent-project.md` (`AGENTS.md` on a project discovered before the move), or the handoff the user pastes |
| `infra-context` map | If available | NFR sections (`nfr-<slug>`: performance, security, reliability, observability budgets), external services, environments | `bun run context:map infra-context` (`--list`, then `--section nfr-<slug>`) |
| Domain vocabulary | If available | Business terms, so flows and risks are named the way the business names them | `bun run context:map business-domain-context` |
| Legacy `.context/risk-assessment.md` (input only) | Only when a project still holds one | Earlier risk findings, merged into the discovery seed | Read file; leave it untouched |
| Git history | If signals needed | Recently changed modules (breakage-likelihood indicator) | `git log --oneline -90 --stat` |
| Incident / bug tracker | If helpful | Historical pain points that feed "why it matters" per flow | `[ISSUE_TRACKER_TOOL]` |
| Legacy local MTP `.context/master-test-plan.md` | Only when it exists and is not a placeholder | Seed for the Epic on CREATE (see "Seeding from a legacy local MTP") | Read file |

Ground every priority claim in evidence from the maps. "This flow is high-risk because..." must cite a data-map flow, an E2E-map journey or QA-relevance row, a discovery HIGH risk, an infra-map NFR section, or a named external dependency.

---

## Mode detection

Load `/acli` first. Resolve the MTP Epic (Step 1 of "Write to Jira" below), then refresh the cache from it:

```
bun run jira:sync-issues get <MTP-KEY>
Does .context/PBI/qa-artifacts/master-test-plan.md exist now?
  → NO:  CREATE mode: the Epic has no `## Master Test Plan` section yet.
         A non-placeholder legacy `.context/master-test-plan.md` exists?
           → offer to SEED from it (see "Seeding from a legacy local MTP").
           → otherwise generate from scratch.
  → YES: UPDATE mode: read the cache as the current plan, generate the new
         version, show the diff summary, wait for explicit approval before
         writing the Epic. Never overwrite automatically.
```

Every approval wait in this mode (the UPDATE diff, the seed offer, the over-budget FTP proposal) follows one path: a person present decides; a supervised worker reports to its launcher, which holds the gate; a routine with nobody needs a delegating brief that covers the decision. Without one it composes the section, runs the size check, stops before the Jira write, and reports. General rule: `../../agentic-qa-core/references/decision-protocol.md`.

---

## Altitude and budget

The MTP is the product altitude of the planning ladder (`agentic-qa-core/references/planning-ladder.md`): strategy for the whole system. Feature depth belongs one rung down, in each feature's FTP (`FTP: {EPIC-KEY}: {feature}`, parented to the same MTP Epic). That split also keeps the plan inside Jira's description cap, which counts serialized ADF JSON, not visible text: Jira Cloud rejects a description whose ADF document serializes past 32,767 characters, and markdown grows in ADF by a factor that depends on structure (tables and short lists most). Measurements: ADR-0007.

Run the size check on every write, CREATE and UPDATE alike:

```
# the FULL description as it will be stored: the text outside the section + the new section
bun .agents/skills/acli/scripts/md-to-adf.ts <description.md> <description.adf.json>
jq -c . <description.adf.json> | wc -m        # must stay at or under 30000
```

Over 30,000: stop before writing. Propose which sections move to which FTP (per-flow rationale, state-machine detail and edge cases of feature X go to `FTP: {EPIC-KEY}: X`), with the size each move saves, and wait for the user's decision. A Jira rejection for content length (`CONTENT_LIMIT_EXCEEDED`) is the same stop. Do not truncate and do not split the section across two fields.

---

## Discovery phases

### Phase 1: validation gate

#### 1.1 Data map check (hard)

If `bun run context:map business-data-context` prints the placeholder notice (or the skill is missing), stop with:

> This mode needs the `business-data-context` map to reason about risk. Run `project-context` mode `data` first, then re-invoke mode `test-plan`.

Do not proceed on assumptions.

#### 1.2 E2E map check (soft)

If the `business-e2e-context` map is a placeholder, warn and proceed. Log in §10 Discovery Gaps:

> The E2E map was not available at generation time. This plan reflects the data map only. Angles missed: journey risk, CRUD-coverage gaps, feature-flag risk, per-feature QA-relevance tagging. Run `project-context` mode `e2e` and re-run mode `test-plan` for the complete picture.

#### 1.3 Read and extract

Pull from each source in the table what it holds for risk: flows, state machines, automatic processes, integrations and rules from the data map; high-risk journeys, CRUD gaps (⚠️ / ❌), flags and coverage deficits from the E2E map; NFR budgets and external services from the infra map. Every HIGH risk in the discovery seed is scored below like any flow, and none is dropped silently. A legacy `.context/risk-assessment.md` is merged into the seed.

### Phase 2: risk scoring

Apply this rubric to every flow, feature and automatic process. The rubric is internal: the output document shows conclusions, not the scoring table.

| Factor | H (3) | M (2) | L (1) |
|--------|-------|-------|-------|
| **Business Impact** | Revenue, legal, security, compliance | User trust, operational efficiency | Convenience, polish |
| **Breakage Likelihood** | Recent changes, complex logic, external deps, flaky history | Moderate complexity, stable integration | Simple CRUD, rarely changes |
| **Blast Radius** | Affects all users / other flows break / hard to roll back | Affects a segment / isolated | One user action, easy rollback |

Composite score = product of the three. Map:
- `≥ 18`: CRITICAL
- `8–17`: HIGH
- `3–7`: MEDIUM
- `< 3`: LOW

### Phase 3: dependency mapping

For every CRITICAL and HIGH item, trace which downstream flows break if it fails. This feeds §7 (cascade graph) in the output.

### Phase 4: silent-killer detection

Identify automatic processes (crons, webhooks, DB triggers) with no UI feedback path. Score their likelihood separately: even low-frequency silent failures are CRITICAL because they rot unnoticed.

---

## Output structure

Compose the body of the `## Master Test Plan` section with this structure, using `###` for its sub-sections so the section boundary stays intact. Every section stays at product altitude: a line that only makes sense for one feature goes to that feature's FTP.

**Tone**: conversational, senior-QA voice, second person ("you'll want to verify..."). Assume the reader is a QA engineer onboarding to the project: guide them, don't lecture. Use the same flow names as the data map.

Leave out flow diagrams, journeys and feature catalogs, test case definitions, and payload or fixture snippets: each has a home (see §10).

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

One short paragraph per CRITICAL / HIGH flow: why it matters (business impact, customer-facing wording) and what commonly breaks. The per-flow depth (dependencies in detail, what an experienced QA would check, scenarios) is feature altitude and goes to that feature's FTP; this paragraph names the FTP when one exists.

Prose only.

### 4. State machines that matter

Only the state machines with financial, legal, or operational impact. Per machine, one line: the business consequence of an illegal transition, and whether corruption would be visible. Transition tables and forbidden-state lists go to the owning feature's FTP.

### 5. Silent killers: automated processes

Crons, webhooks, DB triggers that fail without visible UI feedback. Per process:
- What it does and which flow depends on it
- What breaks if it misses a run, runs twice, or runs out of order
- How failure is detected (logs? alerts? none?)
- Recommended QA strategy (synthetic probe, log assertion, scheduled audit)

This is usually the most undertested area of a system.

### 6. External integrations: failure points

Per third-party service (Stripe, SendGrid, Auth0, etc.):
- Which business flow stops if the service is down
- Critical timeouts and retry boundaries
- Acceptable degradation (what still works, what is hard-fail)
- Known quirks (rate limits, eventual consistency, sandbox vs prod drift)

### 7. Dependency cascade between flows

ASCII cascade graph plus narrative of the 2-3 most critical chains:

```
Checkout ──► Payment ──► Inventory ──► Notifications ──► ERP sync
    │           │            │              │               │
    └ fails here = no revenue, no stock decrement, no email, no ERP sync
```

Testing flow A in isolation hides breakage that only surfaces in `A → B → C`.

### 8. Edge cases developers commonly forget

Grouped by theme, not by flow: concurrency, data limits, timezone / DST, permission boundaries, orphaned states, idempotency. For each theme, one line naming the project flow most at risk; the cases themselves go to that feature's FTP.

### 9. Pre-release checklist (priority-ordered)

Short, action-oriented, sized to fit the Epic's description budget. Ordered CRITICAL first, then HIGH. Each line is one check phrased as "Verify X does Y under Z". No TC IDs (those live in the TMS).

### 10. What is not in this plan

Explicit delegation to stop scope creep:

```markdown
- Flow-level diagrams and state-machine transition tables → the `business-data-context` map
- Journeys, feature catalog, CRUD matrix, feature flags → the `business-e2e-context` map
- API endpoint inventory / contracts → `bun run api:sync` + `project-context` mode `api` (when available)
- Detailed test case definitions and traceability → TMS (see `/test-documentation`)
- Sprint-level execution order → the sprint's **STP** in Jira (see `/sprint-testing` sprint-wide mode)
```

### 11. Discovery gaps

Always present, kept short (one line per gap). List anything you could not ground in evidence:
- Flows mentioned in the data map with no clear business owner
- Integrations without documented SLAs or failure modes
- State machines where transitions are implied by code but not documented
- If §1.2 triggered the E2E-map warning, restate the limitation here

"I could not verify X" is better than inventing an answer.

---

## Write to Jira: the MTP Epic

This runs after the section body is composed (in UPDATE mode, after the diff is approved). Load `/acli` before any `[ISSUE_TRACKER_TOOL]` call; rich text goes through `acli/scripts/md-to-adf.ts` (see `/acli` "Publishing rich text").

### Step 1: find or create the Epic

Cached key in `.agents/project.yaml` → `qa.qa_epics.master_test_plan_epic.key`: use it. Otherwise search by name:

```
[ISSUE_TRACKER_TOOL] Search Issues:
  - jql: project = {{PROJECT_KEY}} AND type = Epic AND summary ~ "{qa.qa_epics.master_test_plan_epic.name}"
```

Not found, so create it:

```
[ISSUE_TRACKER_TOOL] Create Issue:
  - type: Epic
  - summary: {qa.qa_epics.master_test_plan_epic.name}     # "QA Master Test Plan"
  - labels: {qa.qa_artifact_label}                        # QA-Artifact — mandatory identity label
  - assignee: self                                        # artifact-lifecycle §2
```

Cache the discovered or created key into `.agents/project.yaml` → `qa.qa_epics.master_test_plan_epic.key`.

### Step 2: write the section (read first, keep the rest)

Read the Epic `description` first (`[ISSUE_TRACKER_TOOL] View Issue` with the description field). QA owns only the `## Master Test Plan` section: replace its content (append the heading when absent) and keep every other section, PO or human text included, verbatim. An old `## Master Test Plan (mirror)` section from the previous file-first model is replaced by this one, not kept beside it.

Assemble the full description, run the size check from "Altitude and budget", and only then write:

```
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: <MTP-KEY>
  description: <the full description, as ADF>
```

### Step 3: cross-link the 3 sibling QA epics

Ensure a `relates to` link from the MTP Epic to each sibling (resolve by name from `qa.qa_epics.*`): QA Test Repository, QA Test Artifacts, QA Defect Management. Skip links that already exist. A sibling that does not exist yet is not created here (its owning skill creates it); note it in the report.

### Step 4: read it back (Critical Rule #16)

```
bun run jira:sync-issues get <MTP-KEY>
```

Read `.context/PBI/qa-artifacts/master-test-plan.md` and confirm it carries the new plan. The write's success code is not the proof; the cache is.

---

## Seeding from a legacy local MTP

Projects that ran this mode before the MTP moved to Jira have a committed `.context/master-test-plan.md`. On CREATE (the Epic has no `## Master Test Plan` section), when that file exists and is not the placeholder:

1. Offer to seed the Epic from it. Nothing is written without approval.
2. On approval, take its content as the section body and run the size check. On overflow, present the FTP move proposal before anything is written (a plan generated under the file-first model is usually over budget, because its per-flow sections are feature altitude).
3. Write through Steps 2-4 above.
4. Leave the local file in place. Tell the user it is now superseded by the Jira Epic and its cache, and that removing it from git is their call.

---

## After generation

- In UPDATE mode, show the diff summary and get the approval described under "Mode detection" before writing the Epic.
- Report: counts of CRITICAL flows, HIGH flows, silent killers, integration failure points and open discovery gaps; the MTP Epic key (created | updated) with description size {ADF JSON chars} / 30,000; sibling links ensured (note any missing sibling); sections moved to FTPs this run, with their target FTP; whether the cache `.context/PBI/qa-artifacts/master-test-plan.md` was read back.
- If §1.2 warned, remind the user to run `project-context` mode `e2e` and re-run mode `test-plan`.
- If a project-owned context skill sits over the master test plan (the project names the aspect), offer to run `project-context` mode `context-skill <aspect>` in UPDATE now. The methodology index itself (`iql-context`) is shipped upstream and is not updated from a map: a local rule goes to its `references/project-overrides.md`.
