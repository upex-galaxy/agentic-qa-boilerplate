# Discovery intake: the gap list and the exploratory handoff

Load when a `discovery-driven` (or `ad-hoc`) scope starts from one of two inputs: the coverage gap list of
`project-context` mode `coverage`, or the `candidate-scenarios.md` of an `/exploratory-testing` round. It says
how each candidate enters Analyze -> Prioritize (ROI) -> Document. The ROI formula, the three outcomes and the
>50% Candidate/Manual alarm are in `../SKILL.md`; this file covers only how a discovery batch feeds them.
Canon for the vocabulary: `../../agentic-qa-core/references/discovery-driven-doctrine.md` (§3 the anchor, §4 the
oracle, §5 the outcomes, §7 risk vs ROI).

## 1. The two inputs

| Input | Where | What it gives |
|---|---|---|
| Gap list | `.session/project-context/coverage/gap-list.json` (schema 1, `../../project-context/references/coverage.md` §"`gap-list.json`") | behaviours with their `bucket`, `covered_by[]` rows, MTP `risk` and `tech_story`; `gaps` in priority order |
| Exploratory handoff | `.session/exploratory-testing/<round>/candidate-scenarios.md` (`../../exploratory-testing/references/handoff-and-reporting.md` §3) | candidates marked NEW / WEAK / COVERED, each with its observation, environment, outcome, oracle line and evidence |

Both files are `[LOCAL]` and live only on the machine that made them. Use them as the work list, then read
from Jira everything a decision rests on (§3).

## 2. Map every candidate to one mark

| Source value | Mark |
|---|---|
| gap list `bucket: automated` or `manual-only`; handoff `COVERED` | COVERED |
| gap list `bucket: weak`; handoff `WEAK` | WEAK |
| gap list `bucket: uncovered`; handoff `NEW` | NEW |

A `weak` cover never dedupes a candidate: only a counted `exercises` cover makes it COVERED.

## 3. Fail-closed reads before anything is scored

- The anchor exists. Every candidate hangs on a coverable: the gap's `tech_story`, or the handoff's
  Anchor line. Read it back: `bun run jira:sync-issues get <TECHSTORY-KEY> --types tech_story --include-comments`
  (`tech_story` is not a default sync type). When the Anchor line names an existing Story or Bug instead, the
  scope is `ticket-driven` or `module-driven` (`{US_ID}` = that key), and the rest of this file applies
  unchanged. With no anchor, or a key that does not resolve, stop for that
  candidate and propose the coverage Tech Story through `project-context` mode `coverage` Step 5. A person
  approves it; this skill does not create it. Without a person, the proposal goes in the report.
- The oracle answer is on Jira. `oracle: confirmed` counts only when the anchor's synced description or
  comments carry it (who, where, when). A local `confirmed` line with no Jira record is `oracle: observed`.
- The TMS was read. When the gap list's `sources` says the TMS was not read
  (`denominators.gaps_upper_bound`), a NEW behaviour may already have a Test: search the TMS for it before
  deriving anything.
- The cover still counts. A COVERED candidate whose covering Test is now `deprecated`, back in design or
  gone, or whose cover row is `stale` or `verified: false`, is re-marked NEW or WEAK: the same rule the
  exploratory handoff applies (`../../exploratory-testing/references/handoff-and-reporting.md` §3.1).

## 4. What each mark becomes

### COVERED: dropped with a line

Create no Test. Write one line per candidate in `PRIORITIZATION-<scope>.md` and in the mirrored Jira comment:
`<candidate> | COVERED by <KEY> (<what it asserts>)`. A cover flagged `outside_regression` (a manual Test
outside the regression repository) is still COVERED, and its line proposes promoting that Test into the
regression repository. A person decides.

### WEAK: a strengthen proposal, never a new Test

A Test already runs through the behaviour and checks nothing that would fail if it broke. The proposal names:

| Field | Content |
|---|---|
| Weak test | its TMS key, or its ATC id when the cover is automated |
| Checks now | what its assertions verify |
| Must also check | the confirmed expected result it misses |
| Evidence | the observation and its links, from the handoff |

Record it in `PRIORITIZATION-<scope>.md` and as a comment on the anchor. A person approves it, because it changes an
existing regression Test. On approval, update that Test's body, asking its owner first when someone else
owns it. When the weak cover is an automated ATC, the approved proposal is the input `/test-automation` takes
for that existing TC. A WEAK candidate still `oracle: observed` waits for the oracle like any other.

### NEW: the full pipeline

1. Analyze. Derive the scenarios by technique and validate against the source code, exactly as for a
   Story. The expected result comes from the person's answer, never from the code or the map, which are the
   evidence shown with the question. A scenario nobody observed live and nobody confirmed is not
   characterized and gets no verdict: propose an `/exploratory-testing` charter for it, or ask the person with the code
   or map shown as evidence. Dedupe each derived scenario against the gap list's `tests[].covers` (counted
   `exercises` rows only; a `weak` cover never dedupes).
2. Gate 0. Only `oracle: confirmed` scenarios are scored. `oracle: observed` waits, unscored, and stays
   listed.
3. Prioritize. Score ROI per scenario as Candidate / Manual / Deferred; the person signs each verdict
   (`tms-conventions.md` §9 "The ROI comment"). MTP risk orders the gaps and never sets a verdict.
4. Document. `{US_ID}` = the coverage Tech Story key; the Test joins that Tech Story's `ATS:` Test Set,
   parented to QA Test Repository. The expected result in the Test body is the confirmed one, with the
   `oracle: confirmed` line (who, where, when) and the evidence links.

## 5. Outcomes carried over from the round

An exploratory candidate arrives with an outcome. Record it as the round wrote it only when it was observed
in the environment the round names: `PASSED (confirmed)` or `FAILED (not intended)`. A candidate that was not
observed is `NOT RUN` with its `BLOCKED` or `DEFERRED (execution)` line, never `PASSED` on a code read, a unit
test, a green CI run or another environment (doctrine §5). A `not intended` candidate is a proposed defect and not a
Test.

## 6. Chunking a discovery batch, and the >50% alarm

A Story brings 3-8 scenarios and a module's gap list can bring dozens. One alarm over the whole batch would hide a
chunk where everything landed Candidate behind chunks where everything was Deferred.

- One chunk is one anchor. Score one coverage Tech Story at a time. A per-module Tech Story is split by gap id
  (or map section) into chunks of at most about ten scored scenarios.
- The denominator is the scored NEW scenarios of the chunk. COVERED lines, WEAK proposals and unscored
  `oracle: observed` scenarios are counted and listed, never in the denominator.
- The alarm runs per chunk. When more than half are Candidate or Manual, re-apply the Phase 0 filter to that chunk
  before anything is persisted. Report the batch total beside the per-chunk rates, not instead of them.
- Order. Work chunks in the gap list's order (risk first); the order never changes a verdict.

## 7. Report lines

`PRIORITIZATION-<scope>.md` for a discovery batch adds, per chunk: the anchor, counts by mark (NEW scored,
NEW unscored, WEAK, COVERED), the Candidate/Manual rate, and the alarm's answer. The mirrored Jira comment
carries the Deferred list as usual, plus the COVERED lines and the WEAK proposals.
