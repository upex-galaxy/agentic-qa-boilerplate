---
name: test-automation
description: "Plan, write, and review automated tests following KATA (Component Action Test Architecture) on Playwright + TypeScript. Use when writing E2E or API/integration tests, creating Page or Api components, designing ATCs, parameterizing test data, registering fixtures, or reviewing test code for KATA compliance. Triggers on: write test, automate test, create E2E test, create API test, integration test, KATA, page object, API component, implementation plan, ATC, automated test case, review test code, automate module, automate ticket, add regression test. Always load before writing any test code -- KATA fixture selection, inline-locator rule, ATC-identity rule, and import-alias requirements differ from standard Playwright conventions. Do NOT use for running suites (regression-testing), documenting TCs in Jira/Xray (test-documentation), onboarding a repo (project-discovery), or orchestrating sprint-wide testing (sprint-testing)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
complementary_categories: [testing-e2e, testing-api, testing-component, automation-cli, accessibility]
---

## Forbidden invocations

**NEVER invoke `/sdd-*` skills from this workflow.** SDD is an optional
user-installed ceremony; this skill ships self-contained and does not chain
SDD under any condition. If you need to refactor KATA, fixtures, cli/,
scripts/, or api/schemas/ pipeline, exit this skill first and invoke
`/framework-development` — which itself runs Plan → Code → Verify → Archive
natively (no SDD required).

This boundary is mechanical, not advisory: `scripts/lint-skills.ts` rejects
any `/sdd-` mention outside this section. See:
`.claude/skills/agentic-qa-core/references/skill-composition-strategy.md` §4
(governs users who manually install SDD).

# Test Automation — Plan, Code, Review

Produce KATA-compliant automated tests for an existing Playwright + TypeScript project. Three phases, always in this order: **Plan → Code → Review**. Never jump straight to code.

KATA (Component Action Test Architecture) rewires the usual Page Object pattern. If you write tests the "standard" way, most will be rejected at review. Load the relevant reference before writing code in that area.

---

## Subagent Dispatch Strategy

> **Orchestration & Session contracts**: this skill follows `./orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `./session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional.

This skill is **per-scope**: `<scope>` = `<JIRA-KEY>` (ticket-driven / regression-driven) or `<module-slug>` (module-driven). Session state lives at `.session/test-automation/<scope>/{plan.md, progress.md}` per `agentic-qa-core/references/session-management.md` §3 + §9. The session `plan.md` is a thin INDEX that cites the canonical domain artifacts (`spec.md`, `automation-plan.md`, `atc/*.md`) under the Epic's `test-specs/` tree (`.context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/<scope>/`) — domain content stays in the existing PBI tree, not duplicated.

This skill is compliant with the doctrine in `CLAUDE.md` §"Orchestration Mode (Subagent Strategy)" and the session contract in `.claude/skills/agentic-qa-core/references/session-management.md`. Every dispatch follows the 6-component briefing format defined in `.claude/skills/agentic-qa-core/references/briefing-template.md`, and the pattern selected per phase matches the decision guide in `.claude/skills/agentic-qa-core/references/dispatch-patterns.md`. The Plan, Code, and Review phases each carry distinct context-isolation needs — Plan keeps KATA architectural reads out of the orchestrator, Code isolates multi-file edits, Review fans out three independent verifiers in parallel.

| Stage                                          | Pattern              | Subagent role                                                                                                                  |
|------------------------------------------------|----------------------|--------------------------------------------------------------------------------------------------------------------------------|
| Plan (`spec.md` + `automation-plan.md`)        | Single               | one Plan subagent returns the two artifacts; protects orchestrator from KATA architectural reads                                |
| Code (writing E2E or API tests)                | Sequential           | one Code subagent per scope (module = 1 subagent per TC; ticket = 1 subagent total); edits-many-files inside isolates context  |
| Review — `bun run test`                        | Parallel (sub-stage) | one Verifier subagent runs the test suite                                                                                       |
| Review — `bun run types:check`                  | Parallel (sub-stage) | one Verifier subagent runs typecheck                                                                                            |
| Review — `bun run lint:check`                        | Parallel (sub-stage) | one Verifier subagent runs lint                                                                                                 |
| Review aggregation + merge/reject decision    | Single               | inline — orchestrator reads the 3 Verifier reports and decides                                                                  |

- **Code phase scope rule**: each Code subagent edits multiple files in isolation, returns a list of changed files + a one-line summary per file. The orchestrator never reads the diffs — only the summary. If the user wants to see actual diffs, the orchestrator runs `git diff` inline after the subagent returns.
- **On any Verifier failure**: STOP, return the failing report verbatim to the user, do NOT auto-fix the test code, do NOT re-dispatch the Code phase without user approval. See `.claude/skills/agentic-qa-core/references/orchestration-doctrine.md`.
- **MANDATORY context doc for Plan + Code briefings**: include `kata-manifest.json` (root) in the "Context docs" component (item 2 of the 6-component briefing). Without it the subagent will scan `tests/components/**` directly, burn tokens, and risk proposing duplicates. See Critical Rule #12 in `CLAUDE.md`.

---

## Inputs — read these first, in this order

Canonical reading order for any AI starting cold on a test-automation workflow. Read in order; stop earlier when later inputs add no signal for the scope at hand.

1. `kata-manifest.json` (root) — authoritative registry of every Component (`api[]`, `ui[]`) and every `@atc('TICKET-ID')` ID. Anti-duplication gate per Critical Rule #12 in `CLAUDE.md`. MUST load before proposing any new `Page`, `Api`, `Steps` module, or `@atc` ID.
2. `.claude/skills/test-automation/references/kata-architecture.md` + `.claude/skills/test-automation/references/typescript-patterns.md` — full doctrine for KATA layers (TestContext / Base / Domain / Fixture), ATC identity, fixture selection, import-alias rules, params contracts.
3. `tests/components/` — existing Api / Page / Steps shape on disk. Establishes naming, helper-vs-ATC split, fixture registration patterns to follow.
4. The Story's `implementation-plan.md` (dev plan) + the ATP under `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/` — Jira-synced, READ-ONLY caches. Jira is source of truth; NEVER hand-write these. Materialize via `bun run jira:sync-issues get <STORY-KEY> --include-comments`, then **read the ENTIRE synced Story folder** — every per-field `.md` (`story.md`, `acceptance-criteria.md`, scope, business rules, etc.) **plus `comments.md`** — not just one field. Omitting ACs, scope, business rules, or comment context produces incomplete ATCs. The **ATP read is modality-aware** (resolve via `.agents/project.yaml` `testing.tms_cli`, same gate as `/test-documentation` §Phase 0):
   - **Modality jira-native**: ATP = Story field `{{jira.acceptance_test_plan}}` → synced `acceptance-test-plan.md` in the Story folder (from the same `jira:sync-issues get <STORY-KEY> --include-comments`).
   - **Modality jira-xray**: ATP = Test Plan issue `description` → `bun run jira:sync-issues get <ATP_KEY>` → `test-plans/TESTPLAN-<KEY>-<slug>.md`; per-TC run results come from `[TMS_TOOL]` (xray-cli), not the sync.

   The dev `implementation-plan.md` carries the implementation approach + (when produced by `/test-documentation`) the per-TC candidate verdict and component mapping. Cite from the session `plan.md` rather than duplicating. NOTE: this is the Story-folder *dev* `implementation-plan.md` — do NOT confuse it with the hand-authored *automation* plan (`test-specs/<scope>/automation-plan.md`) you write in Phase 1.
5. The Story's AC (acceptance criteria) — source of truth for scenarios that become ATCs. Read from the same synced `.md` files (`acceptance-criteria.md` / `story.md`) produced by `bun run jira:sync-issues get <STORY-KEY> --include-comments`. NEVER use `[ISSUE_TRACKER_TOOL]` `view` for these custom fields — `view` returns `null` for `customfield_*`. If a field is absent from the instance, the sync emits a pointer stub and the content lives in comments/description per `.agents/jira-required.yaml` `fallback:`. Resolve the issue key from the scope picker. **TC note**: a TC body = the `Test` issue `description` (synced both modalities via `bun run jira:sync-issues get <TEST-KEY>`); the Xray Gherkin / Test-Steps plugin field is NOT synced — it mirrors the description, so read the synced TC `.md` for Gherkin/steps.
6. `api/schemas/` — OpenAPI-derived TypeScript types. Refresh via `bun run api:sync` if stale. Required for any Api component touching a new endpoint.
7. `.env` — credentials (`LOCAL_USER_EMAIL`, `STAGING_USER_PASSWORD`, etc.) read via `config.testUser` from `@variables`. Never hardcode; never guess.

---

## Phase 0 — Resume check (MANDATORY, inline)

Before picking the planning scope, run the session resume contract from `agentic-qa-core/references/session-management.md` §4:

1. Determine the prospective `<scope>` from the invocation context (ticket key, regression-driven TC, or module slug — see "Pick the planning scope first" below).
2. Check `.session/test-automation/<scope>/progress.md`.
3. If it does NOT exist → proceed to scope picker + Phase 1.
4. If it DOES exist:
   - Read `plan.md` (thin index) + the tail of `progress.md`.
   - Read the cited canonical `spec.md` / `automation-plan.md` / `atc/*.md` under `.context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/<scope>/` for the domain content.
   - Surface to the user: last completed phase (Plan / Code / Review) + next phase + open Review findings if any.
   - Offer **resume / restart / abort**. On `restart`, archive to `.session/.archive/<YYYY-MM-DD>-test-automation-<scope>-aborted/` before proceeding.

Phase 0 is inline (no subagent). It runs in <1 minute on a cold cache.

---

## Pick the planning scope first

Every automation session starts by choosing one of three planning scopes. Pick once, then follow the Plan → Code → Review pipeline.

| Scope | Input | Output | Use when |
|-------|-------|--------|----------|
| **Module-driven** (Macro) | A module name + list of candidate TCs | One module spec + N ATC specs | Batch-automating an entire module (10+ tests). First pass on a new area. |
| **Ticket-driven** (Medium) | A single ticket/story ID with scenarios | One implementation plan for that ticket | Automating one user story end-to-end. Default for sprint work. |
| **Regression-driven** (Micro) | One specific TC (often after a bug fix) | One ATC implementation plan | Adding a single regression test after a fix. Smallest unit of work. |

When in doubt, ask the user which scope. Never assume "module" just because multiple TC IDs appear in the briefing.

**These scopes consume the `Candidate` verdicts from `/test-documentation`** (Stage 4) — only `Candidate` TCs reach automation; `Manual` / `Deferred` are terminal. The mapping from that skill's 4 documentation scopes: `Module (Macro) ← module-driven`, `Ticket (Medium) ← ticket-driven`, `Regression-driven (Micro) ← bug-driven`. Candidates from an `ad-hoc / exploratory` documentation session enter under whichever fits — a module batch, or regression-driven for a single TC.

---

## Workflow — Plan → Code → Review

```
Phase 1: Plan         -> Phase 2: Code             -> Phase 3: Review
(spec / plan)            (component + test file)      (KATA compliance)
        |                         |                             |
  .context/PBI/epics/        tests/components/**         Review checklist
    EPIC-<KEY>-<slug>/       tests/e2e/** or                (pass/fail)
    test-specs/<scope>/      tests/integration/**
    spec.md
    automation-plan.md
    atc/*.md                 Register in fixture
```

Each phase has a gate. Do not start Code before the Plan is written and approved. Do not close out a ticket until Review passes.

### Phase 1 — Plan

**MUST-load before any planning**: `kata-manifest.json` (root). It lists every Component and every ATC currently in the codebase. Use it to identify reuse, avoid duplicate `Page`/`Api` classes, and avoid minting an `@atc('TC-XXX')` ID that is already taken. This is enforced by Critical Rule #12 in `CLAUDE.md` and by the husky pre-commit gate.

**Pre-flight checklist** (anti-duplication — run before writing the plan):

- Load `kata-manifest.json`. Cross-check every proposed TC ID against `components.api[].atcs[].id` and `components.ui[].atcs[].id`. If a match exists, the TC is already automated — re-scope or reuse.
- Cross-check every proposed Component name against `components.api[].name` and `components.ui[].name`. If a match exists, extend the existing class — do not create a new one.
- If reuse opportunity exists (same flow already covered by a Steps method or ATC), adapt the plan to extend rather than rebuild.

Write the canonical domain plan file(s) for the chosen scope under the Epic's `test-specs/` tree, `.context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/<scope>/` (`spec.md`, `automation-plan.md`, `atc/*.md`). These are NON-Jira hand-authored files (committed to git). The automation `automation-plan.md` is distinct from the Story-folder dev `implementation-plan.md` (Jira-synced, read-only). The plan answers:

- Which scenarios from the ticket become tests, which become ATCs, which are shared preconditions (Steps)?
- Which components already exist (`tests/components/api/*Api.ts`, `tests/components/ui/*Page.ts`) and which need to be created?
- What test data is required? Classify by Discover / Modify / Generate (never assume data exists in staging).
- Which fixture will the test use -- `{api}`, `{ui}`, `{test}`, or `{steps}`?
- Which ATC IDs (from the TMS) map to which component methods?

**Also write the session index `plan.md`** at `.session/test-automation/<scope>/plan.md` per `agentic-qa-core/references/session-management.md` §6. This is a THIN INDEX — Goal, Inputs (cites the canonical artifacts above), Approach, Phase breakdown table, Risks, Verification checklist, Cross-references. It does NOT duplicate the domain content; it points to it.

Use the dispatch defined in §Subagent Dispatch Strategy: **Single**. Full briefing in `references/planning-playbook.md` §Plan dispatch.

Present the plan to the user. Wait for approval before coding. After approval, the orchestrator appends `## Phase 1 — Plan — <ts>` with `status: completed`, `artifacts_touched: [list of domain + session files]`, `next: Phase 2 — Code` to `.session/test-automation/<scope>/progress.md`.

### Phase 2 — Code

Use the dispatch defined in §Subagent Dispatch Strategy: **Sequential** (one subagent per scope unit). The subagent loads `references/e2e-patterns.md` and `references/api-patterns.md` per scope.

**Skills to load in every Code subagent (mandatory)**: `/playwright-best-practices` (community, project-installed) for upstream Playwright/TypeScript patterns — flaky-test fixes, POM vs fixtures, axe-core, auth/OAuth, fixtures lifecycle, perf budgets, i18n, component testing. Load **alongside** `/test-automation` (this skill, project-authored) — the two are complementary: KATA-specific rules (ATC identity, inline locators, fixture selection) come from here; generic Playwright craft comes from `/playwright-best-practices`. Add `/playwright-cli` only when the subagent also needs to drive a real browser session (snapshot/trace/record) during code-time exploration.

Implement in this order:

1. **Types** at top of component file (payloads, responses, domain DTOs).
2. **Component class** extending `ApiBase` or `UiBase`. Helpers first (no decorator), ATCs second (`@atc('TICKET-ID')`).
3. **Register** the component in `tests/components/ApiFixture.ts`, `UiFixture.ts`, or `StepsFixture.ts` as appropriate.
4. **Test file** under `tests/e2e/{module}/` or `tests/integration/{module}/`, using the correct fixture.
5. **Run + verify**, in this exact order -- do not skip steps:

```bash
bun run test <path/to/new.test.ts>   # does it pass?
bun run types:check                   # tsc --noEmit, no errors
bun run lint:check                         # ESLint, no errors
```

If any step fails, fix before moving to Review.

**Progress checkpoint**: after each Code subagent returns (per scope unit — one per TC for module-driven, one total for ticket-driven), the orchestrator appends a phase entry to `.session/test-automation/<scope>/progress.md` per `agentic-qa-core/references/session-management.md` §7. For module-driven scope, mid-batch resume reads the entries and skips already-coded ATCs.

#### AI-readable verification (optional, recommended)

For the test you just wrote, run Allure 3 in **agent mode** to get a markdown report you can read directly without parsing HTML:

```bash
bun allure:agent           # runs `bunx allure agent -- bun test`
```

Allure 3 lives as a devDep — `bunx allure` resolves to the local `node_modules/.bin/allure`, no global install required. Use this when:

- The Code subagent needs to confirm the test actually exercised the expected ATC (the markdown summary lists each `@atc('TICKET-ID')` block + its status).
- You want a quick scope check before opening Phase 3 — Review.
- You are debugging a fixture/locator mismatch and want a structured failure read instead of a raw stack.

For human review of the same run, switch to:

```bash
bun allure:run             # bunx allure run -- bun test  (full HTML report)
bun allure:open            # serve the last generated report locally
```

See `regression-testing` for CI / suite-level reporting (`bun allure:generate`, `bun allure:watch`).

### Phase 3 — Review

Use the dispatch defined in §Subagent Dispatch Strategy: **Parallel** (3 simultaneous Verifiers). Full briefings in `references/review-checklists.md` §Parallel verification dispatch.

Run the review checklist on the new/modified files. Treat every failed item as a blocker. A clean review is the merge gate. See `references/review-checklists.md` for the full lists (E2E and API have overlapping but distinct checklists).

**Optional adversarial gate** — for high-risk changes (new fixtures, shared Page/Api base modifications, refactors touching multiple ATCs), invoke `/judgment-day` before commit. Runs two blind judges in parallel against the diff and only approves when both agree. See `.claude/skills/judgment-day/SKILL.md`. Not invoked automatically — user opts in per ticket.

**Progress checkpoint + Archive**: after Phase 3 returns ACCEPT (all 3 Verifiers exit 0), the orchestrator appends `## Phase 3 — Review — <ts>` with `status: completed`, `next: stop` to `.session/test-automation/<scope>/progress.md`, then runs Archive per `agentic-qa-core/references/session-management.md` §8: moves `.session/test-automation/<scope>/` to `.session/.archive/<YYYY-MM-DD>-test-automation-<scope>/` (two-file dir preserved) and calls `mem_session_summary` including the archive path. On REJECT, archive does NOT run — the working directory stays for debug.

#### Git & TMS handoff (sdet integration-trunk suites)

This skill stops at a clean local review. It does **not** create branches, push, or open PRs — that is `/git-flow-master`'s job. When the repo's git strategy is `sdet` (the standing mode for chained test-automation suites), each ticket flows through the per-ticket loop in `.claude/skills/git-flow-master/references/sdet-integration-trunk.md`:

- The Phase 3 ACCEPT gate (3 Verifiers green: `test` / `types:check` / `lint:check`) is the skill's **local validation gate**. Under `sdet` it must pass on **both** the `local` and `staging` environments before push — re-run the suite against each (`active_env` per `.agents/project.yaml`). The Verifiers are local-only; Sanity CI on the branch is owned by `/git-flow-master` + `/regression-testing`, never by this skill.
- After ACCEPT, surface the explicit handoff — _"Local gate green. Ready for `/git-flow-master`: cut `test/{KEY}-{slug}` from the integration trunk, push, Sanity-CI, PR into the trunk, merge `--no-ff`."_ Do not auto-invoke git operations.
- **Append the Git Ledger line** to the suite's `progress.md` after each branch action (orchestrator-written, append-only) so a resuming session knows how the trunk was left: trunk name + SHA, last ticket merged, pending tickets, sync-gate / final-PR state. Schema in `../agentic-qa-core/references/session-management.md` §7 "The Git Ledger"; what-to-write detail in `.claude/skills/git-flow-master/references/sdet-integration-trunk.md` §Resume.
- **TC lifecycle anchors to the ticket-branch PR, not the final `trunk → main` PR**: TCs → In Review when the ticket PR opens into the trunk; they flip to Automated only after the final suite PR merges to `main` and CI is green there. Execute transitions via `/test-documentation` + `[ISSUE_TRACKER_TOOL]`; cross-check status names against `.agents/jira-workflows.json`. Merging into the trunk is NOT "Automated".

---

## Fixture selection (inline — load-bearing every invocation)

The fixture you pick determines whether a browser opens. Wrong fixture = slow API tests or missing UI context.

| Test type | Fixture | Browser opens? | Use when |
|-----------|---------|----------------|----------|
| API only (integration) | `{ api }` | No (lazy) | Pure API testing. No UI needed. |
| UI only | `{ ui }` | Yes | UI-focused testing. No backend setup via API. |
| Hybrid (UI + API setup) | `{ test }` | Yes | Setup data via API, drive flow via UI, verify via API. |
| Reusable precondition chains | `{ steps }` | Depends on steps used | 3+ ATCs repeated across 3+ files. |

Rules:

- Integration tests (`tests/integration/**`) almost always use `{ api }`.
- E2E tests (`tests/e2e/**`) use `{ ui }` if no API setup needed, otherwise `{ test }`.
- Never request `{ ui }` for a test that never interacts with the UI -- it opens a browser for nothing.

---

## Gotchas (inline — the most common rejection reasons)

1. **ATC = complete test case, not a single click.** `clickLoginButton()` is not an ATC. `loginWithValidCredentials(credentials)` is. If the method is one-line-wrapping `page.click()`, delete it.
2. **TC Identity Rule: Precondition + Action = 1 TC.** All expected results from the same precondition and same action are assertions of the same TC, not separate TCs. Do not split a TC across panels, endpoints, or UI sections.
3. **Equivalence Partitioning.** Same expected output = one parameterized ATC. Three ATCs all returning HTTP 401 for invalid login are wrong -- merge into one `loginWithInvalidCredentials(payload)`.
4. **ATCs do not call ATCs.** ATCs are atomic. For reusable chains, use the Steps module (`tests/components/steps/*Steps.ts`). Steps are NOT decorated with `@atc`.
5. **Locators inline.** No `locators/*.ts` files. Put the selector in the ATC. If the same locator is used in 2+ ATCs of the same component, extract it to a `private readonly` arrow function in the class -- not to a separate file.
6. **Helpers vs ATCs.** A read-only GET is a helper (no `@atc`, optionally `@step`). An action that changes state is an ATC (`@atc('TICKET-ID')`). A GET inside an ATC that verifies the action succeeded is fine -- but the GET alone is not an ATC.
7. **Fixed assertions go inside ATCs.** Status code, required fields, URL redirect checks. Test-level assertions (flow outcomes) go in the test file.
8. **Max 2 positional parameters.** 3+ parameters must use an object parameter (`fn(args: Args)`). Named object parameters beat positional lists for maintainability and autocomplete.
9. **Import aliases are mandatory.** `@api/`, `@ui/`, `@utils/`, `@variables`, `@TestContext`, `@schemas/`. No relative imports (`../../../`). Lint will reject them.
10. **No hardcoded waits.** Never `page.waitForTimeout(3000)`. Wait for a specific condition: `waitForSelector`, `waitForResponse`, `waitForLoadState('networkidle')`, or `data-loaded="true"` attributes.
11. **No retries by default.** `retries: 0` in `playwright.config.ts`. If a test passes on retry, it is flaky, not passing. Investigate.
12. **Credentials from `.env`, never hardcoded.** `LOCAL_USER_EMAIL` / `STAGING_USER_EMAIL` and their passwords. Read via `config.testUser` from `@variables`.
13. **Each test generates its own data.** No shared state between tests. Use `TestContext.generateUserData()` or faker helpers for unique values.
14. **Ticket ID prefix in every `test()`.** Format: `test('TICKET-ID: should {behavior} when {condition}', ...)`. The `describe` block may also include the ticket ID when the file is tied to a single ticket.
15. **One component per file, one file per feature.** Components follow `{Resource}Api.ts` or `{Page}Page.ts`. Test files follow `{verb}{Feature}.test.ts` (e.g., `applyDiscount.test.ts`, never `discount.test.ts`).
16. **Don't propose components or ATCs without consulting the manifest.** `kata-manifest.json` is the registry. Skipping it produces (a) duplicate Pages — proposing `LoginPage` when `LoginPage.ts` already exists; (b) duplicate ATC IDs — minting `@atc('TC-90')` twice; (c) missed reuse — creating `getBookingById` when `BookingsApi.getById` already does it. Always start the Plan phase by loading the manifest. The husky pre-commit gate enforces freshness; Critical Rule #12 in `CLAUDE.md` enforces consultation.

---

## Minimal templates (inline — small, load-bearing)

### KATA component signatures

```typescript
// API component — Layer 3
export class UsersApi extends ApiBase {
  constructor(options: TestContextOptions) { super(options); }

  // Helper (read-only)
  @step
  async getUserById(id: string): Promise<[APIResponse, UserResponse]> {
    return this.apiGET<UserResponse>(`/users/${id}`);
  }

  // ATC (state-changing)
  @atc('TICKET-ID')
  async createUserSuccessfully(payload: UserPayload): Promise<[APIResponse, UserResponse, UserPayload]> {
    const [response, body, sent] = await this.apiPOST<UserResponse, UserPayload>('/users', payload);
    expect(response.status()).toBe(201);
    expect(body.id).toBeDefined();
    return [response, body, sent];
  }
}
```

```typescript
// UI component — Layer 3
export class LoginPage extends UiBase {
  constructor(options: TestContextOptions) { super(options); }

  @atc('TICKET-ID')
  async loginWithValidCredentials(data: LoginData): Promise<void> {
    await this.page.goto('/login');
    await this.page.locator('#email').fill(data.email);
    await this.page.locator('#password').fill(data.password);
    await this.page.locator('button[type="submit"]').click();
    await expect(this.page).toHaveURL(/.*dashboard.*/);
  }
}
```

### Test file skeleton

```typescript
import { test, expect } from '@TestFixture';
import usersData from '@data/fixtures/users.json';

test.describe('TICKET-ID: Apply Discount Code', () => {
  test('TICKET-ID: should apply percentage discount when code is valid', async ({ api }) => {
    const order = await api.orders.createOrderSuccessfully(orderData);
    const totals = await api.orders.getTotals({ orderId: order.id });
    expect(totals.finalAmount).toBe(totals.baseAmount - totals.discountAmount);
  });
});
```

### Fixture registration (excerpt)

```typescript
// tests/components/UiFixture.ts
export class UiFixture extends TestContext {
  readonly login: LoginPage;
  readonly checkout: CheckoutPage;

  constructor(options: TestContextOptions) {
    super(options);
    this.login = new LoginPage(options);
    this.checkout = new CheckoutPage(options);
  }
}
```

---

## Quality gates (must pass before merge)

| Gate | Command | Must be |
|------|---------|---------|
| Tests pass | `bun run test {path}` | All green, zero retries used |
| Types | `bun run types:check` | No errors |
| Lint | `bun run lint:check` | No errors |
| Fixture registered | visual | Component is in `ApiFixture` / `UiFixture` / `StepsFixture` |
| ATC IDs linked | visual | Every `@atc('X')` matches a real TMS test case ID |
| Naming | visual | Files PascalCase for components, camelCase verb for test files |

---

## Anti-patterns — NEVER do these

**T1.** NEVER auto-generate tests for TCs that `/test-documentation` flagged as Deferred or Manual — only `Candidate` (`to_be_automated`) verdicts proceed to automation. Skipping the ROI verdict produces flaky, low-value suites.

**T2.** NEVER skip the Plan phase. Even for a "simple" regression test, write `spec.md` / `automation-plan.md` (or the per-ATC plan under `.context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/<scope>/`) BEFORE writing any test code. Plan → Code → Review is non-negotiable.

**T3.** NEVER collapse the KATA layers (TestContext / ApiBase + UiBase / Domain Api+Page+Steps / Fixture). Full doctrine in `references/kata-architecture.md`. Tests that flatten layers are rejected at Review.

**T4.** NEVER call one ATC from inside another ATC. ATCs are atomic mini-flows. Reusable chains live in the Steps module (`tests/components/steps/*Steps.ts`), which is NOT decorated with `@atc`.

**T5.** NEVER use relative imports (`../../../`). This repo uses path aliases (`@api/`, `@ui/`, `@schemas/`, `@utils/`, `@TestContext`, `@variables`, `@TestFixture`). Lint rejects relative paths.

**T6.** NEVER hardcode credentials. Read from `.env` via `config.testUser` from `@variables` (`LOCAL_USER_*` / `STAGING_USER_*`). Never inline a password, token, or API key in a spec, fixture, or test data file.

**T7.** NEVER hardcode `customfield_NNNNN` in spec files, test data, or test config. Resolve Jira fields via `{{jira.<slug>}}` against `.agents/jira-fields.json` + `.agents/jira-required.yaml` so test code survives workspace rotations.

**T8.** NEVER mix test code and product code in the same PR. Test PRs follow the `test/*` branch convention with title format `{type}({ISSUE-KEY}): {description}` — see `.claude/skills/git-flow-master/references/pr-test-automation.md`. Under the `sdet` strategy, adjacent non-test work never rides a `test/*` ticket branch either — it goes on a Plus Branch (`docs/*`/`chore/*`/`fix/*` → integration trunk). See `.claude/skills/git-flow-master/references/sdet-integration-trunk.md`.

---

## Which reference to read

Not every invocation needs every reference. Load the specific file when the task matches.

- **KATA architecture, fixture selection, ATC rules, Steps module mechanics** → `references/kata-architecture.md`
- **TypeScript conventions (params, imports, types, errors, DRY by layer)** → `references/typescript-patterns.md`
- **Naming, tagging, folder structure, anti-patterns, quality gates** → `references/automation-standards.md`
- **Writing a Playwright `Page` component, locator strategy, data-testid rules, UI waits** → `references/e2e-patterns.md`
- **Writing an `Api` component, OpenAPI type facades, HTTP helper usage, schema imports** → `references/api-patterns.md`
- **Designing test data (Discover → Modify → Generate), fixtures JSON, faker** → `references/test-data-management.md`
- **`@atc` / `@step` decorators, NDJSON results, TMS sync mechanics** → `references/atc-tracing.md`
- **Writing the Plan (module / ticket / ATC scopes and templates)** → `references/planning-playbook.md`
- **Running the review checklist (E2E or API)** → `references/review-checklists.md`
- **Configuring Playwright, CI integration, projects, sharding** → `references/ci-integration.md`
- **Session resume contract, plan.md/progress.md schemas, archive policy, Engram per-phase checkpoint** → `../agentic-qa-core/references/session-management.md` (Phase 0 + Phase 1 + Archive of this skill)

Tool resolution: use `[AUTOMATION_TOOL]` for browser work (Playwright CLI or MCP — load `/playwright-cli` when available), `[API_TOOL]` for OpenAPI exploration, `[DB_TOOL]` for verifying test data in the database, `[TMS_TOOL]` for TMS sync (load `/xray-cli` when available), `[ISSUE_TRACKER_TOOL]` for ticket work. Split the issue-tracker access by operation: **detailed reads** of a Story (ACs, ATP, dev implementation-plan, custom fields) → `bun run jira:sync-issues get <KEY> --include-comments` (or `jql "<query>"`) then read the synced `.md` — NEVER `acli workitem view` for custom fields; **writes** (comment automated-test status back to the Story, transitions) → `/acli`; **trivial summary/status/key-list lookups** → `/acli` `workitem view`/`search` is fine. See `agentic-qa-core/references/acli-integration.md` §"Reads vs writes". Resolve tags via the project's CLAUDE.md Tool Resolution table.

---

## Quick reference

```bash
# Planning outputs (hand-authored, NON-Jira; Epic-level test-specs/)
# .context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/<scope>/spec.md
# .context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/<scope>/automation-plan.md
# .context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/<scope>/atc/*.md
# (the Story-folder implementation-plan.md is the Jira-synced DEV plan — read-only input, not written here)

# Code locations
# tests/components/api/{Resource}Api.ts
# tests/components/ui/{Page}Page.ts
# tests/components/steps/{Domain}Steps.ts
# tests/integration/{module}/{verbFeature}.test.ts
# tests/e2e/{module}/{verbFeature}.test.ts

# Local validation loop
bun run test <path>
bun run types:check
bun run lint:check
bun run kata:manifest               # regenerate registry if components/ATCs changed
git add kata-manifest.json          # stage so the freshness gate passes
bun run kata:manifest:check         # confirm gate would pass (husky runs this on commit)

# Env + TMS sync
cp .env.example .env                # populate test credentials
bun run api:sync                    # regenerate OpenAPI schema types
```
