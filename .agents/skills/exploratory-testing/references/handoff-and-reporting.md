# Handoff and Reporting (step Handoff)

Read this to close a round: write the findings, mark each candidate scenario against existing coverage, take
the oracle questions to a person, file the bugs a person approves, propose the coverage anchors, harvest
durable module knowledge, verify cleanup and write the session record.

Everything for one round lives in the session directory, under `<<PRIMARY_ROOT>>` (the primary checkout:
a worktree's ignored files die with the worktree, `../../agentic-qa-core/references/session-management.md` §3):

```
<<PRIMARY_ROOT>>/.session/exploratory-testing/<YYYY-MM-DD>-<scope-slug>/
  plan.md  progress.md     session contract (session-management.md §6, §7)
  charter.md               step Charter (scope-and-recon-planning.md §3)
  coverage-view.json       only when no gap list existed (scope-and-recon-planning.md §4)
  recon/<surface>.json     one per Recon agent (recon-fanout.md §1)
  findings/FNN-<slug>.md   one per finding, CONFIRMED and REFUTED alike
  candidate-scenarios.md   the test-documentation handoff (§3)
  session.md               the round's summary record (§1)
  evidence/                raw captures until a coverable exists (§5)
  refinements.md           lessons proposed, never applied (skill-refinement-protocol.md)
```

The `.session/` tree is gitignored. The round's durable outputs are what a person approved into Jira: the filed
bugs, the confirmed oracle answers on the coverage anchor, the module context section and the coverage Tech
Stories.

---

## 1. `session.md` template

```markdown
# <Scope>: Exploratory Testing Round

> Mode: <Critical-Flow-Targeted | Module-Targeted | Whole-App Sweep>
> Environment: <env key>
> QA: <name> · Started: <YYYY-MM-DD>
> Coverage view: <gap list run_id | coverage-view.json>
> Evidence: evidence/ (captures) + SQL / API excerpts inline; evidence page: <URL or "none">

## Charter
<link to charter.md, and any change made to it during the round>

## Executive summary
<N-agent recon -> M-agent refutation -> tie-break on disagreements. Every headline finding has DB, code or
capture evidence.>

### CONFIRMED findings (evidence-backed)
| ID | Sev | Title | Evidence | Filed as |
|----|-----|-------|----------|----------|
| FNN | <Critical / High / ...> | <one line, with the headline number when a value is wrong> | <pointer> | <KEY or "not filed: why"> |

### Environment blockers (not bugs)
- <surface>: <why it cannot be observed right now: missing data, undeployed route>

### Refuted or corrected by verification
| ID | Was | Now | Why |
|----|-----|-----|-----|
| FNN | "<the Recon hypothesis>" | "<the verdict>" | <the refutation, or the trap category it hit> |

## Candidate scenarios
<counts by mark: NEW n · WEAK n · COVERED n · NOT RUN n; link to candidate-scenarios.md>

## Data mutations (all cleaned)
<every created_rows entry with its re-read confirmation, or "None: read-only round.">

## Observations (non-bug)
<data quirks, UX notes, contradictory copy: anything worth a line that is not a finding>
```

---

## 2. `findings/FNN-<slug>.md` template

One file per finding, REFUTED ones included: a documented false positive saves the next round from
re-investigating it.

```markdown
# FNN: <short title, with the headline number when a value is wrong>

**Severity**: <Critical | High | Medium | Low> · **Status**: <CONFIRMED | REFUTED | ENV BLOCKER | OPEN QUESTION (needs a person)>
**Surface**: <module or flow> · <sub-area>
**Found by**: <e.g. "invariants sweep -> refutation (two verifiers disagreed) -> tie-break">

## What it is
<the mechanism, one paragraph: what actually happens in the code or the data>

## Why the first verifier was wrong (omit if not applicable)
<when refutation went the wrong way before the tie-break corrected it; precedent for the next round>

## Confirmed cases
<table or list with verbatim values: ids, amounts, dates>

## Impact
<one paragraph, business-facing: data, money or security exposure, or the user-facing symptom>

## Detector / repro
<the exact SQL, curl or UI steps, AND the corrected query when the naive one over- or under-counts>
```

Severity and priority are defined in `../../sprint-testing/references/reporting-templates.md` §1.4 and §1.5;
reuse those definitions and do not restate them here.

---

## 3. `candidate-scenarios.md`: the `test-documentation` handoff

A candidate scenario is one observed behaviour turned into a testable statement. Each was executed live in the
environment it names during Recon or Refute, which satisfies `test-documentation`'s prerequisite that
documented tests describe validated behaviour once a person confirms the expected result (§4).

### 3.1 The mark against existing coverage

Each candidate gets one mark, from the coverage view the charter built:

| Mark | When | Handed to `test-documentation`? |
|---|---|---|
| `NEW` | no counted cover on the behaviour | yes |
| `WEAK` | only `weak` covers: a test runs through the behaviour, nothing it checks would fail if it broke | yes, naming each weak test so documentation turns it into a strengthen proposal for that test |
| `COVERED` | at least one counted `exercises` cover whose evidence asserts what the candidate observed | no: recorded here with the covering key, never silently dropped |

The gate fails closed: a cover that is `stale`, unverified (`TMS not read`), in design or `deprecated` does not
count, so its candidate is `NEW` or `WEAK`. A `weak` cover never dedupes a candidate away.

### 3.2 The outcome of each candidate

The vocabulary is `../../agentic-qa-core/references/discovery-driven-doctrine.md` §5.1:

- Observed live in the named environment: the candidate carries `oracle: observed` and waits for §4. After
  the answer, `oracle: confirmed` makes the observation `PASSED` against the confirmed expected result, and
  `not intended` makes it `FAILED` and a proposed defect (§6).
- Not observed (a precondition that could not be reached, an environment blocker): `NOT RUN` with exactly one
  reason, `BLOCKED — <reason>` or `DEFERRED (execution) <date> by QA decision: <reason>; follow-up <KEY>`, and
  it climbs the blocking ladder (§5.3 of the doctrine). A code read, a unit test, a green CI run or another
  environment never makes it `PASSED`.
- The follow-up of a `DEFERRED (execution)` lives on the coverable, as the ladder says. A candidate anchored
  to an existing coverable gets it there. A candidate with no anchor yet gets it on its coverage Tech Story
  once a person approves that Story (§3.4); until then the follow-up is an item of the Handoff deck, created
  only on approval, and the candidate stays `NOT RUN` with its reason line in `candidate-scenarios.md`. This
  skill opens no standalone task for it.

### 3.3 Template

```markdown
# Candidate Scenarios: <Scope>: <YYYY-MM-DD>

> Source: exploratory-testing round at .session/exploratory-testing/<YYYY-MM-DD>-<scope-slug>/
> Every scenario marked observed below was executed against <env> during this round.
> Coverage view: <gap list run_id | coverage-view.json>
> Anchor: <existing coverable KEY | coverage Tech Story KEY | "NONE: see the anchor note">

## CAND-01: Validate <core> <conditional>
- **Behaviour**: <gap id or new kebab id> (<map section, or "not in the maps">)
- **Mark**: <NEW | WEAK (weak: PROJ-7013 checks X, not Y) | COVERED (PROJ-7021 exercises it)>
- **Precondition**: <concrete setup, synthetic or fixture entity>
- **Action**: <what was done>
- **Observed**: <what the product did>
- **Executed against**: <env + role + date>
- **Outcome**: <observed, waiting for the oracle | PASSED (confirmed) | FAILED (not intended) | NOT RUN: BLOCKED / DEFERRED (execution) line>
- **Oracle**: <observed | confirmed by <who>, <where>, <when> | not intended by <who>, <where>, <when>>
- **Risk signal**: <the MTP level of its flow; ROI still decides per Test in test-documentation>
- **Related finding**: FNN-<nn> (when this scenario is also how a bug was caught)
- **Evidence**: <capture paths, verified on disk; evidence page URL when one exists>

## Anchor note
<only when the Anchor line says NONE: the coverage Tech Story proposed for these scenarios (§3.4) and its
approval state; documentation does not start on them until it exists>
```

### 3.4 The anchor: where the Tests will hang

`test-documentation` needs a coverable to hang every Test on. Resolve it per scenario and show the resolution
to the person; this skill creates no Test and scores no ROI. Every scenario is handed off with an anchor:
`ad-hoc` notes with no coverable become `discovery-driven`
(`../../agentic-qa-core/references/discovery-driven-doctrine.md` §2.1), so the NONE case proposes the coverage
Tech Story first and documentation runs once it exists. A Test created with no coverage edge is the "orphans
by design" failure of doctrine §9.

- **An existing coverable of the module** already describes the behaviour (a Story, Bug or Tech Story in
  scope): name it. Documentation runs that scope as `module-driven` or `ticket-driven`.
- **A gap of the gap list**: the anchor is its coverage Tech Story (doctrine §3). If none exists yet, the
  proposal comes from `bun run context:coverage propose --grain gap|module` (dry run, the grain the person
  picks); the Tech Story is created only after a person approves it, through
  `../../project-context/references/coverage.md` §"Step 5". Documentation runs it as `discovery-driven`.
- **A behaviour the maps do not have**: the anchor is a coverage Tech Story built with the same fields
  (doctrine §3: work type `tech_story`, parent QA Test Repository, label `coverage-gap`, title
  `Coverage: {module}: {gap}`, components = the module), proposed in the Handoff batch, created only on
  approval. Also propose the map section that is missing, to `project-context` mode `e2e` / `api` /
  `data`, so the next inventory sees it.

The TMS modality decides when the Test issue is born, and `test-documentation` creates it either way:
`testing.tc_creation_stage` in `.agents/project.yaml` resolves the timing (`../../sprint-testing/SKILL.md`
§"Which stage creates the TCs").

---

## 4. The oracle questions go to a person

Every `NEW` and `WEAK` candidate observed live carries `oracle: observed`. "Is this behaviour intended?" is
product behaviour (`../../agentic-qa-core/references/decision-protocol.md` §5, kind 1): a person answers it,
and docs or code are the evidence shown with the question, not the answer.

The instrument follows the weight of the decision (`AGENTS.md` §2,
`../../agentic-qa-core/references/decision-elicitation-doctrine.md`):

- A batch of observed behaviours to react to point by point is a report: one `mkd` decision deck with one
  item per candidate (intended / not intended / not sure, with the observation, the environment, the role and
  the evidence shown on the item).
- A single question goes through the question tool, or as a comment on the anchor coverable.

Record each answer on the candidate (`oracle: confirmed` with who, where, when; or `not intended`) and,
once an anchor exists, on the anchor's description, so `test-documentation` Gate 0 reads it from Jira on
any machine. A candidate nobody answered stays `oracle: observed` and is handed off unscored.

The same deck carries the round's other decisions, each as its own item: every finding to file or discard,
every Tech Story proposal, the module context harvest. The tie-break already decided the data-integrity,
money and security verdicts; the deck states them for the person and does not reopen them through a
subagent.

With nobody at the keyboard (a routine, or a worker the conductor does not answer for), the deck stays
unanswered and the round stays open: no oracle answer is assumed, no bug or Tech Story is filed, no
module-context write is made. A supervised worker hands the deck to its conductor, who asks it.

---

## 5. Evidence

Evidence that reaches a person goes through the `evidence-artifact` skill: the bug's evidence page, and one
story-shaped evidence pack for the round's confirmed scenarios when the person reviews them as a batch. This
skill builds no evidence code of its own.

Raw captures land in the session's `evidence/` while no coverable exists, named per
`../../agentic-qa-core/references/evidence-conventions.md` §2 with the scope slug in place of the ticket key.
Once a bug is filed or an anchor is created, the captures it cites are copied to that coverable's PBI
`evidence/` folder, and the finding and candidate files cite both the paths and the page URL. Scrub a trace
or a HAR before attaching it (`evidence-conventions.md` §1).

---

## 6. Filing bugs

A CONFIRMED finding that is a real defect, and a candidate a person marked `not intended`, is proposed as
an issue:

1. Classify it before filing (`../../agentic-qa-core/references/defect-management-doctrine.md` Part 1):
   behaviour already in production is usually a **Bug**; an absent or under-specified rule surfaced by the
   round is an **Improvement**.
2. Draft it with `../../sprint-testing/references/reporting-templates.md` §1, exactly: do not write a second
   bug template. Parent QA Defect Management, issue link to the anchor coverable when one exists,
   components = the module, `qa_assignee` = self.
3. The one difference from a sprint-filed bug is the `## Related` section:

   ```markdown
   ## Related
   - Found during exploratory-testing: <scope-slug>, <YYYY-MM-DD> (finding FNN-<nn>)
   - Affects business rule: <BR-NNN or the rule's name, when there is one>
   ```

4. The human confirmation gate (`reporting-templates.md` §1.12) holds: nothing is created before a person
   approves the draft. After filing, read it back (`bun run jira:sync-issues get <KEY>`, Critical Rule #16)
   and cross-link both ways: the new key in the finding file and in `session.md`.

Once filed, the bug re-enters the normal pipeline, and a later `sprint-testing` retest picks it up like any
other bug.

---

## 7. Module context harvest

Write back only durable, reusable facts a later session in this module would want and could not easily
re-derive: gotchas, data quirks, stable fixtures, and the instances of the false-positive trap categories
(`../../agentic-qa-core/references/adversarial-verification.md` §5) met in this module. Routine pass / fail is
not harvested, and an empty harvest is a fine outcome.

Also append a row to an `## Exploratory Sessions` table inside the module context, so a later reader sees a
round happened even when nothing else cleared the bar:

```
| Date | Mode | Findings | Candidates | Session |
|---|---|---|---|---|
| <YYYY-MM-DD> | <mode> | <n confirmed, m refuted> | <NEW n, WEAK n, COVERED n> | <scope-slug> |
```

The module context lives in the Epic description under `## Module Context (QA)`. The write follows
`../../sprint-testing/references/session-entry-points.md` §"Step 4": read first, replace only that section,
re-sync. It is a tracker write, so it is an item of the Handoff deck and runs only on approval. A sweep
touches the module context of every module a finding or candidate landed in, one write per Epic.

---

## 8. Cleanup verification (before closing)

Re-read every `created_rows` entry of every Recon and verifier report, and confirm each one is gone. A prior
delete's response code is not proof (`recon-fanout.md` §5). Record the confirmation in `session.md` under
"Data mutations", with the re-read result and not a bare claim that cleanup was done. A row that cannot be
deleted is a blocker: name it to the person, with the row id, before the round closes.

---

## 9. Close: footer and archive

1. Append the final `progress.md` entry (`session-management.md` §7).
2. Print the session footer per `../../agentic-qa-core/references/session-footer-contract.md`, in execution
   framing (the round exercised the application live): the capture paths verified on disk, bug captures
   first, then skills, MCPs and CLIs used, the testing levels touched with "none" stated for an expected
   level that was not touched, and `Refinements proposed: N -> <path>`.
3. Archive per `session-management.md` §8 once the person has answered the Handoff deck; an unanswered
   deck keeps the session open so the round can be resumed.
