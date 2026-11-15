# Discovery-driven doctrine: scopes, the anchor of a Test with no Story, the oracle, and what PASSED means

> Cited by: `sprint-testing` (the observation rule and the blocking ladder, §5), `exploratory-testing`
> (the oracle rule, the outcomes, the coverage anchor), `test-documentation`
> (scopes, the coverage anchor, the oracle rule, risk vs ROI), `test-automation` (scopes, `automated`
> on the production branch), `stage-gates.md`, `artifact-lifecycle.md`, `traceability-linking.md`,
> `session-management.md`. Companions: `./decision-protocol.md` (who decides an expected result),
> `./test-design-doctrine.md` (how cases are derived), `./artifact-lifecycle.md` (statuses).
>
> Each rule is defined once, here. The owning skills carry the binding copy in their Compact Rules
> and cite the section. This file adds no stage, no conductor skill and no new work type.

The pipeline in `./stage-gates.md` runs from a Story and its acceptance criteria forward. A product
already in production has a second kind of work that the ladder does not start: behaviour that runs every
day, has no Story and has no test. This file names that work and fixes the rules that keep it from
producing false coverage.

---

## 1. Two flows

| | Story-driven (flow 1) | Discovery-driven (flow 2) |
|---|---|---|
| Starts from | a Story and its ACs | behaviour already in production, with no Story |
| Expected result comes from | the ACs, refined at Shift-Left | a person's answer about observed behaviour (§4) |
| Coverage edge points at | the Story | a coverage Tech Story (§3) |
| Ends | regression, then the next Story | regression, then the gap list is recomputed and compared |

Discovery-driven is the inverse cycle. Its steps, by role:

```
inventory      behaviour minus tests, per module, ordered by MTP risk (§7)
   |           -> one coverage Tech Story per gap or per module, approved by a person (§3)
   v
explore        characterize what the product does, mark it `oracle: observed` (§4)
   |           this runs in the Execution stage; no new stage
   v
confirm        a person answers "is this intended?" for each observed behaviour (§4)
   v
document       ROI per scenario, Candidate / Manual / Deferred (`test-documentation`)
   v
automate       a discovery-driven work package (`test-automation`)
   v
regression     the RTP grows; recompute the inventory and compare it with the first one
```

`automate` takes only TCs that already exist in the TMS with a signed `Candidate` verdict. A gap with
no signed Test goes back to `document`, and automation never creates the Test (the TC source gate of
`test-automation`, a hard gate in `./stage-gates.md`).

`exploratory-testing` owns `explore` and `confirm`, the ticket-free entry into the Execution stage
(`./stage-gates.md` §"The stages, by name"). `document` and `automate` run through `test-documentation`
and `test-automation` in their `discovery-driven` scope (§2). `project-context` mode `coverage` owns
`inventory` (`../../project-context/references/coverage.md`).

---

## 2. Scope vocabulary: origin and granularity

A scope has two independent properties, which the old names mixed.

- **Origin** names the scope: what started the work and where its expected result comes from.
- **Granularity** sizes one work package: how much of the system it covers.

### 2.1 Origins (the canonical scope names)

| Scope | Origin | Anchor (coverage edge) | Session `<scope>` id | Accepted by |
|---|---|---|---|---|
| `ticket-driven` | a sprint coverable whose behaviour QA approved | the Story (or other coverable) | `<JIRA-KEY>` | `test-documentation`, `test-automation` |
| `bug-driven` | a closed bug with a verified fix | the bug's covering issue | `<JIRA-KEY>` | `test-documentation`, `test-automation` |
| `module-driven` | the already-validated behaviour of one module, batched | each coverable of the module | `<module-slug>` | `test-documentation`, `test-automation` |
| `discovery-driven` | behaviour with no Story, found by the inventory or by exploration | a coverage Tech Story (§3) | `<TECHSTORY-KEY>`, or `<module-slug>` for a per-module Tech Story | `test-documentation`, `test-automation` |
| `ad-hoc` | notes from an exploratory session not yet tied to a gap or a Story | whichever coverable they turn out to belong to; with none, they become `discovery-driven` | `<YYYY-MM-DD>-adhoc` | `test-documentation` |

A module batch documents behaviour some Story or validation already settled. A discovery batch documents
behaviour nobody specified, so every scenario passes the oracle rule (§4) first.

### 2.2 Granularity (size labels, never scope names)

| Label | One work package covers | Typical origins |
|---|---|---|
| Macro | a module | `module-driven`; `discovery-driven` per module |
| Medium | one coverable | `ticket-driven`; `discovery-driven` per gap |
| Micro | one TC | `bug-driven`; `discovery-driven` for a single-test gap |

### 2.3 Old names, mapped

| Old name | Where it lived | Canonical |
|---|---|---|
| Module-driven / Ticket-driven / Bug-driven / Ad-hoc | `test-documentation` scope table | unchanged: `module-driven` / `ticket-driven` / `bug-driven` / `ad-hoc` |
| Module (Macro) / Ticket (Medium) | `test-automation` scope table | `module-driven` (Macro) / `ticket-driven` (Medium) |
| Regression-driven (Micro) | `test-automation`, `sdet` trunk naming (legacy alias) | `bug-driven` (Micro), or `discovery-driven` (Micro) for a one-test gap |
| gap-driven | `test-automation` planning playbook | `discovery-driven` (Micro or Medium) |
| Discovery origin of a work package | `test-automation` batch fleet | `discovery-driven` |

The canonical definitions live here. The scope tables in `test-documentation` and `test-automation`
show the subset each skill accepts and cite this section. A new scope is added here first.

---

## 3. The coverage anchor of a Test with no Story

A Test with no Story has a parent (QA Test Repository) and no coverage edge, so the tooling treats it
as an orphan: the sync parks it under `epics/_orphans/tests/` and `repair-traceability` repairs it.
That is right for flow 1. For flow 2 the anchor is a **coverage Tech Story**.

| Property | Value |
|---|---|
| Work type | `tech_story`, a coverable type (check its `coverable` key in `.agents/jira-required.yaml`) |
| Grain | one per gap, or one per module; the person who approves the gap list picks the grain |
| Parent | **QA Test Repository** (`qa.qa_epics.test_repository_epic`), never a product Epic |
| Components | the product module |
| Label | `coverage-gap` |
| Title | `Coverage: {module}: {gap}` |
| Created by | QA, only after a person approves it: creating tracker issues is an outward write |
| Lifecycle | `artifact-lifecycle.md` §1, row "Coverage Tech Story" |

It is wired exactly like a Story. Its `ATS: {TECHSTORY-KEY}: {title}` Test Set carries the `test`
edge (`traceability-linking.md` §3), and TC titles use its key as `{US_ID}`. The "one ATS per Story"
rule is untouched: the Tech Story is its own coverable with its own ATS.

**What the sync does with it** (read from `scripts/sync-jira-issues.ts`). A Test is an orphan only when
it has no issue link to any `coverable: true` type and no membership in an `ATS:*` Set that itself links
a coverable. A Test anchored this way is therefore not an orphan, even when Tech Stories are not pulled.
It materializes locally, under `tech-stories/`, only when the pull includes the type. A plain `pull`
sweeps only the types whose `sync` key in `.agents/jira-required.yaml` says `default`, so unless
`tech_story` is one of them, a project running discovery adds it with `--types` or `JIRA_SYNC_TYPES`.

---

## 4. The oracle rule: characterize, mark `observed`, ask a person

On behaviour with no AC, what the application does is not evidence of what it should do. An agent that
writes the observed behaviour into a test as the expected result freezes whatever defect it observed.

1. **Characterize.** Record what the product did, where (environment), with which data and role, and
   how you reached it. The techniques of `./test-design-doctrine.md` Part 2 still apply, to the code,
   the schema and the observed behaviour instead of an AC.
2. **Mark it `oracle: observed`.** Observed is not intended. The mark travels with the scenario into
   documentation.
3. **Ask a person.** "Is this behaviour intended?" is product behaviour, escalation kind 1 of
   `./decision-protocol.md` §5. Docs and code are evidence you show with the question, and never the
   answer to it.
4. **Record the answer.** `oracle: confirmed` with who answered, where and when; or `not intended`,
   which turns the scenario into a proposed defect (`./defect-management-doctrine.md`).

No ROI verdict, Candidate or Manual, is signed while a scenario is `oracle: observed`. The verdict needs
a confirmed expected result: a Manual regression Test with an unconfirmed expected result freezes the
same defect, only run by hand. An observed scenario waits, unscored.

How the questions reach the person follows `AGENTS.md` §2, which picks the instrument by the weight of
the decision, not by the number of questions. A single question goes on the coverage Tech Story or through
the question tool. A batch of observed behaviours to react to point by point is a report, and goes in the
`mkd` decision deck (`./decision-elicitation-doctrine.md`). With no person at the keyboard, the
unconfirmed scenarios stay `observed` and are listed in the run report as open items
(`./decision-protocol.md` §5).

---

## 5. Execution outcomes and the observation rule

### 5.1 The outcome vocabulary

Every stage, report and board uses these words for the result of executing one case.

| Outcome | Means | Recorded as |
|---|---|---|
| `PASSED` | observed doing what the expected result says | the instance's pass status |
| `FAILED` | observed doing something else | the instance's fail status |
| `NOT RUN` | not observed in the environment the precondition names | the instance's not-executed status (Xray `TODO`, jira-native `NOT RUN`), never `FAILED` |

A `NOT RUN` carries exactly one reason:

| Reason | Means | Written as |
|---|---|---|
| `BLOCKED` | the ladder (§5.3) is still open | `BLOCKED — <reason>` |
| `DEFERRED (execution)` | QA deferred it and recorded the follow-up | `DEFERRED (execution) <date> by QA decision: <reason>; follow-up <KEY>` |

Where an instance defines a `BLOCKED` run status, a `BLOCKED` case may use it, and the reason line is
still required: the enum value is a filter, the line is what a reader needs.

`DEFERRED (execution)` is not the ROI `Deferred` verdict. The ROI verdict says a scenario does not
enter the regression repository; the execution reason says a case was not observed yet. Write the
qualifier every time.

**Mapping another vocabulary.** A board, a sync or an importer that holds its own status list maps it
onto this table. `BLOCKED` and `DEFERRED` (meaning `DEFERRED (execution)`) are `NOT RUN` with a reason:
they are not separate outcomes for counting purposes and never the ROI verdict. A status the mapping
does not know fails loudly, and is never counted as one of the three.

### 5.2 The rule

A case is `PASSED` or `FAILED` only when it was observed in the environment its precondition names.
A unit test on the deployed commit, a green CI run, reading the code, a local stack, a lower environment
or a shared local database are evidence about the system. They are not an execution, and the case stays
`NOT RUN`.

Measured, then rule: two sessions given the same data reached opposite verdicts on the same case, because
one counted indirect evidence as a pass and the other did not. One definition of PASSED removes the choice.

### 5.3 The blocking ladder

A `NOT RUN` case does not wait. It climbs this ladder, in this order:

1. **Recreate** the precondition in the test environment: a fixture identity or a reset path the product
   already has (`./test-design-doctrine.md` "Unreachable preconditions", outcomes 1 and 2).
2. **QA defers, on its own authority**, when it cannot be recreated: write the `DEFERRED (execution)` line
   and open a follow-up task, a subtask on the coverable, `[QA] Deferred (execution): {TC_KEY}: {what is missing}`,
   assigned to the acting QA user and naming who must provide what. With no subtask level on the instance, the
   follow-up is a comment on the coverable. When the cause is a product or test-environment gap worth its
   own ticket, an `Improvement` is proposed as well (`./defect-management-doctrine.md`), and its filing keeps
   the stage's signature.
3. **Developers** provide what the follow-up names. Its resolution reopens the case, which then runs and is
   observed.
4. **The owner**, only when QA is unsure whether the deferral is acceptable.

The ladder prevents false coverage (PASSED on indirect evidence) and `BLOCKED` limbo (a case that waits
with nobody assigned to unblock it).

### 5.4 Reporting with deferrals

- A Story is reportable when no case is `BLOCKED`. An open `BLOCKED` keeps it at `in_test`.
- `qa_sign_off` is allowed when every case is `PASSED` or `DEFERRED (execution)` with its record, and none
  is `FAILED` (a FAIL recalibrated to GO-with-debt per `sprint-testing/references/reporting-templates.md`
  §5.0 counts as not FAILED). The QA comment lists every deferral. The person who signs the transition sees
  that list: the deferral is QA's call, the signature is still the person's (`./stage-gates.md` §"Contract table").
- The acceptance Test Execution closes once every non-terminal run carries its `DEFERRED (execution)` line.
- When every case is deferred and none was observed, QA does not sign off on its own. That is ladder step 4,
  and the owner decides.
- A bug retest is never closed on a deferral: `retest_passed` requires the repro case observed PASSED.

---

## 6. `automated` means the code is on the production branch

A TC moves `pull_request` -> `automated` (transition `merged`) only when its test code is on
`git_strategy.branches.production` in `.agents/project.yaml`, with CI green there. A merge into
`branches.integration`, or into a suite trunk matching `branches.ephemeral_pattern`, is not `automated`:
the TC stays at `pull_request` and its labels stay as they are.

Strategies without an integration branch or a trunk (`solo-main`, `github-flow`, `trunk-based`) merge into
the production branch directly, so the rule changes nothing there. Where one exists (`sdet`,
`main-integration`, `enterprise`, `gitflow`, `gitlab-flow`), the rule keeps the TMS from reporting a test as
automated before it is on the branch the regression suite runs.

**Who fires `merged` after a promotion.** Under a strategy with an integration branch, the promotion merge
into the production branch owes one post-promotion pass: every TC at `pull_request` whose spec file is now
present on `origin/<production>` gets `merged`, fired through `test-documentation` + `[ISSUE_TRACKER_TOOL]`.
`git-flow-master` hands that pass off when the promotion lands and does not touch the TMS itself. Presence is
checked by path (`git cat-file -e origin/<production>:<spec path>`), not by commit ancestry, because a squash
promotion (`git_strategy.decisions.promote_method`) rewrites the commits. A tracker automation that fires
`merged` must filter on base branch = the production branch. The `test-automation` light stage verifier is the
backstop: no TC at `pull_request` whose spec is already on the production branch.

---

## 7. Risk orders the gaps, ROI decides per Test

Two scales exist and stay separate:

| Scale | Owner | Decides |
|---|---|---|
| MTP risk (the levels `project-context` mode `test-plan` defines) | `project-context` mode `test-plan` | the order of the gap list and of the exploration queue |
| ROI score | `test-documentation` | the verdict per scenario: Candidate / Manual / Deferred |

There is no translation between them. A high-risk gap can still end with every scenario Deferred, and
that drop is explicit in the prioritization report. Unifying the scales is a separate project.

---

## 8. Porting a rule from another project

Rules seen in another project enter this repo one at a time, each one re-earned:

- **Measured, then rule.** Write the generic measurement ("two sessions with the same data reached opposite
  verdicts") and the rule it justifies, never the source project's instance: no names, products, domains,
  ticket keys, people, dates or data. The figures, when worth keeping, go to the forensic ledger
  (`.context/ADR/ADR-0006-forensic-measurements-ledger.md`), and the doctrine keeps the why.
- **Code before doctrine.** A rule a script can check ships as the check. Prose is for what no check can see.
- **A size cap per skill.** A new skill's `SKILL.md` body is capped at 500 lines, following Anthropic's
  skill-authoring guidance, and detail moves into `references/`, one topic per file.
- A lesson noticed during a session is proposed and never applied, per `./skill-refinement-protocol.md`.

---

## 9. What this prevents

Tests that freeze defects, orphans by design, false coverage, blocked limbo, two names for one scope,
and a TC shown as automated before its code reaches the branch the suite runs.
