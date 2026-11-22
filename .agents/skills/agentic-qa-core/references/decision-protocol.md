# Decision protocol: search the record, decide the technical call, escalate four kinds

> Cited by: `AGENTS.md` §2 (the asking paragraph), `./decision-elicitation-doctrine.md` §6,
> `./stage-gates.md` §"Contract table". This file decides whether a question reaches a person, and
> what the agent does when it does not. How to ask, once a question does reach a person, is
> `./decision-elicitation-doctrine.md`. Autonomy levels per stage live in `./stage-gates.md`; this file
> moves none of them.

A QA agent almost always works inside a plan a person already approved: the ATP, `spec.md` +
`automation-plan.md`, the regression scope, the batch of Stories handed to Shift-Left. Inside that
plan, a technical call is the agent's to make: which technique fires on an AC, how many cases it explodes
into, which surface (UI, API, DB) carries a check, which seed data, which locator, how to batch the
dispatches. Asking a person to confirm any of these moves the agent's own work onto the person's queue
and stalls the stage behind it.

Two things stay with a person: what the product should do, and the four kinds of question in §5.
Everything else is decided in the order below, and reported.

Deciding is not picking silently, and `AGENTS.md` §2 asks for the same. A call made under this protocol
appears in the stage report as DECIDED, with the option it beat and one line of why. That keeps it
reviewable: a wrong technical call surfaces in review, not as a question asked before it.

---

## 1. The order

```
  a question or a fork appears
        |
        v
  1. SEARCH THE RECORD (§2) ---- settled ----> 2. FOLLOW IT, CITE IT (§3)
        |
        | not settled
        v
  3. one of the four kinds? (§5) ---- yes ---> ESCALATE, INFORMED (§5)
        |                                            |
        | no                                         | answer arrives
        v                                            v
  4. DECIDE IT (§4, panel optional)          5. WRITE IT DOWN (§6)
        |                                            ^
        +--------------------------------------------+
```

The search comes first because reasoning from scratch about a settled question produces a second
answer, not a second opinion. In a test suite that means two oracles for one behaviour, and a suite
asserting both fails one of them forever.

---

## 1.1 A batch of questions

One Story, or one batch of Stories, can raise many questions at once (Shift-Left refinement is the usual
case). The order in §1 holds for the batch as a whole: no question is asked when another answer in the
same batch already decides it, and what reaches a person is only what the record cannot resolve, in as
few rounds as possible. Three steps, in order. The research that feeds them, and the check on a DECIDED answer before it is
applied, are `./question-research.md` and `./adversarial-verification.md` §6.

### Admission

Before a question joins the batch, drop or reshape it:

- It changes nothing: no AC, outline, scope line or expected result would differ by its answer. Drop it.
- The record already answers it (§2): follow and cite the source (§3). It is not asked.
- It duplicates a question already open in the batch, on the Story or on a sibling. Keep one, and list
  every place it applies.
- A `Pending:` note whose answer is now in the record is removed silently, without a question.
- It mixes a part the record decides with a part it does not. Split it: follow the decided part, and ask
  only the open one.

### Dependency graph

Each surviving question carries `dependsOn`: the IDs of the questions whose answer could change it or make
it moot. Order the batch topologically, roots first.

- A cycle is one compound question, asked once.
- A written tie counts as a dependency even when nobody declared it: a `Pending:` note, an outline that
  reads "depending on the answer to...", a question that quotes another's option.

### Per graph level

Take one level at a time: search (§2), decide (§4) or escalate (§5), apply, then cascade before the next
level.

- The cascade re-evaluates every question that depends on what was just settled: it may now be followed,
  decided or moot. A moot question is dropped, not asked.
- Escalation goes in rounds by graph level, extending `./decision-elicitation-doctrine.md` §7: a round
  holds only questions whose roots are already answered, and the sweep's own rounds follow that order,
  not the order the questions appeared in.

---

## 2. Search the record first

Before deciding, before dispatching and before drafting any question for a person, check whether the
question is already answered. Sources, nearest first:

| # | Source | How to read it |
|---|---|---|
| 1 | This run's own record | the session's `plan.md` and `progress.md` (`./session-management.md`); in a fleet, the brief, the shared brief and every conductor reply in the mailbox |
| 2 | Owner decision files | `.session/decisions/*.json` in the primary checkout. Read the whole file whose topic matches, not only the id you expect |
| 3 | Test-architecture records | `.context/ADR/` (`./adr-doctrine.md`): runner, fixtures, isolation, auth-in-tests, selector contract, flake policy |
| 4 | The ticket and its neighbours | through the synced cache, never `acli view` for content: `bun run jira:sync-issues get <KEY> --include-comments`, then the Story's `comments.md`, `acceptance-criteria.md`, `acceptance-test-plan.md`, the Epic's `module-context.md`, and the sibling Stories. A PO or Dev answer to a Shift-Left question lives in a comment, and a ruling on a sibling usually governs the whole batch |
| 5 | AI rulings on the SUT's tickets | read with source 4; handled by §3.1 |
| 6 | Engram | `mem_search` with two or three keywords from the shape of the question (search is lexical: `AGENTS.md` §12): cross-session conventions and gotchas |
| 7 | The owning skill | its `SKILL.md` and the `references/` for the stage you are in |

Search for the shape of the question, not its wording: "which role runs this case" and "whose login does
the browser use" are one question that no single grep matches.

A settled answer outranks fresh reasoning about the same question, including reasoning that has not
happened yet. One adequate answer beats two well-argued contradictory ones.

`.session/decisions/` is gitignored and exists only in the checkout that wrote it, so a decision another
machine or person needs is also recorded where §6 says.

---

## 3. Settled: follow it and cite it

Apply it, and cite it (where, and which entry) in the plan or report so the next reader follows the same
chain. Re-deriving it, re-running the analysis as a "sanity check" or asking anyone to reconfirm it
repeats work the record already did.

Asking a settled question again is itself the defect, even when a person is asked. Asked cold, a person
answers from the same blank slate the agent had, and the reply looks more authoritative while resting on
less. It supersedes nothing.

When the settled answer looks wrong, that is a supersession, and it is explicit:

- name the prior decision (its source and entry);
- state the NEW evidence: an AC edited in Jira after the ruling, a behaviour the ruling did not know
  about, a failed run. A different preference is not evidence;
- get it decided under §4 or §5, by its kind;
- record it next to the original, citing it. Append; never rewrite or delete the prior entry.

A silent second answer is a contradiction, not a supersession.

### 3.1 AI rulings in the record

A SUT built with the agentic dev boilerplate under `decision_authority.product: decide` has no human
product owner in its loop: an AI rules on product questions and publishes each ruling on the ticket under
a heading naming the deciding profile (`## AI Product Owner — Decision: <question>`). QA meets those
comments in source 4 and treats them as record, within three limits:

- The attribution travels with the ruling. An ATP case, an ATR line or a bug that relies on one cites it
  as an AI ruling (heading and date), not as PO sign-off and not as "per the AC".
- A ruling settles what the product was built to do, not what it should do. QA tests against it as the
  stated expected result. A conflict between a ruling and an AC, a business rule or an evident user need
  is a finding for a person (§5 kind 1), raised through the stage; QA does not pick a side.
- QA authors no product ruling of its own. There is no `decide` setting on this side, by design: QA's
  value is an oracle independent of whoever built the product, and an agent that decides what the product
  should do becomes the author of its own expected results.

---

## 4. Not settled, technical, inside the plan: decide it

The plan is the boundary. At an autonomy-2 stage a person approves the plan or the batch; every call
inside it is the agent's. A call that changes the plan itself (adds or drops an AC, a Story, a surface
the plan excluded, an environment, a role) is a plan change and goes back to the person the stage names.
At an autonomy-3 stage the stated limits are the plan.

| The agent decides (technical) | Not the agent's (goes to §5) |
|---|---|
| which technique fires and how far an AC explodes (`./test-design-doctrine.md`) | what the AC means when it is ambiguous about behaviour |
| UI, API or DB leg for a check; seed data; which existing role runs a case | adding a role, an environment or a surface the plan left out |
| Bug, Defect or Improvement by `./defect-management-doctrine.md`; severity by its derivation | filing the issue at all, and any security severity recalibration (the person signs both) |
| KATA shape inside the approved `automation-plan.md`: locator, component, fixture choice | the plan before a line of code, and the merge |
| how to investigate a red test before classifying it | the CAUTION verdict |

Most calls need only a choice and one line of why in the report.

Three stop rules guard the calls made at this level:

- A justification that needs "probably" or "we assume" is not a decision. Escalate it.
- A person's answer that departs from the proposal on the person's own inference, and not on a source, is
  a contradiction with the proposal. Escalate with both readings side by side, and apply neither.
- One decision per decision. Anything the proposal did not bring is a separate question, with its own
  admission and place in the graph.

A scored panel is optional, for a call that is close and either hard to reverse or a precedent other
sessions will copy (an ATC naming scheme for a module, a data-isolation approach a whole suite inherits).
Run three independent subagents in Parallel (`./dispatch-patterns.md`) with the same options and evidence
and a different lens each. They score and justify; the agent decides. Lenses that load QA decisions:

| Lens | Asks |
|---|---|
| Oracle independence | does the option keep the expected result outside the agent's own reasoning? |
| Evidence survival | what proof is left on disk or in the tracker if the session dies halfway? |
| Blast radius | what breaks on the shared environment, the tracker or the suite if this is wrong? |
| Reversibility | what does undoing it cost once other tests or artifacts depend on it? |
| Precedent | what will every later session now do because this one did it? |

State the weighting before reading the scores. Record a near tie as close, so a later supersession
knows it is pushing on a weak decision.

---

## 5. Escalate only these four kinds

The list is exhaustive, and a question outside it is the agent's.

1. Product behaviour: the expected result itself. What the feature should do, whether an observed
   behaviour is intended, an AC ambiguous about behaviour, the Story's scope. In QA this is the oracle,
   and an agent that guesses it ends up testing its own assumption. Route it through the stage: at
   Shift-Left an open question to PO or Dev; in-sprint a question on the ticket or to the owner; a
   suspected defect is proposed per `./defect-management-doctrine.md`. How to test an agreed behaviour is
   §4 work.
2. A security posture no existing rule covers. Applying the established doctrine
   (`./browser-sessions.md`, `./evidence-conventions.md`, `./api-testing-doctrine.md`) is implementation.
   A new way to obtain a session, publishing evidence that may carry session material, testing a
   production surface with anything but its dedicated account, or accepting a risk nobody accepted
   before escalates.
3. Irreversible or outward with no undo. Deleting tracker issues or test data, a destructive write on
   a shared environment's database, a production action with no rollback, a merge, a history rewrite or a
   force push, a message to someone outside the session, spending money. A write the approved plan
   already names (creating the ATP, firing a mapped transition) is the plan, not an escalation.
4. What a person signs, or reserved. The "The person signs" column of `./stage-gates.md`
   §"Contract table", for the stage being run, plus every standing instruction from the operator: a line
   in the brief, a Critical Rule that requires confirmation (Rule #5 under `confirm`), an owner decision
   that reserves a class of question.

Escalate informed: show what the record already says (with its sources), the options with their value
and cost, and one recommendation, because a bare open question pulls a person into re-deciding what they
already decided. The instrument (harness prompt or `mkd` deck) is `./decision-elicitation-doctrine.md`
§1. Who receives it is §0 there: a session launched by another session escalates to its launcher, which
relays.

No person at the wheel (an unattended routine, CI). Technical calls are decided and recorded as above.
A question of the four kinds is not the routine's to decide: it parks the affected item (leaves it
untouched, assumes no answer), records it as an open item in the run report, and continues with the
work that does not depend on it. A run that parks everything and changes nothing is a correct outcome.

---

## 6. Write it down, when it is made

A decision that is not recorded did not happen: the next agent searches §2, finds nothing, and asks
again. Record it when it is made, not at session end, because a session that runs out of room cannot
write up what it decided.

| Scope of the decision | Where it goes |
|---|---|
| this session only | the session's `progress.md` entry (`./session-management.md` §7) |
| one ticket, needed by the team or another machine | the artifact the stage already writes for that ticket: the ATP, the ATR, the QA comment. Jira is the shared record; `.session/` alone is not |
| a fleet task | the worker's report to the conductor, which keeps the run's decision file |
| an owner decision batch | `.session/decisions/<topic>-<date>.json`, the file §2 source 2 reads |
| a test-architecture decision that passes the three gates of `./adr-doctrine.md` §1 | an ADR as well (`./adr-doctrine.md`): the log says a call was made, the ADR records the invariant |
| a lesson for future sessions | Engram `mem_save` |

Each entry is append-only and carries the question in the shape a later search would use, the decision as
an instruction someone can follow, the options considered and why the loser lost, its scope and how long it
stands, and the entry it supersedes, if any.

A batch ends with one notification block, one line per question: `ID · FOLLOWED|DECIDED|ESCALATED ·
decision · basis · rejected: <option>, why · applied in <fields>`. Under it: the fields touched, what stays
outside the session's reach, how to revert, and the gate state.

Every call the agent decided itself also appears in the stage report, as decided, with its one line of
why, so "the agent chose" becomes "the agent chose and said so".

---

## 7. What this prevents

- Re-asking a settled question. The asking agent never opened the record that settled it, and the person,
  asked cold, answered the opposite: two rules for one question in one project.
- Two oracles. A fresh expected result reasoned up mid-sprint beside the one the PO already gave in a
  comment. One of the two tests is wrong from the day it is written.
- Stop-on-everything. A stop rule written against "ambiguity" fires on technical ambiguity too, which is
  most of it, and turns an approved plan back into a stream of confirmations. The four kinds name the
  kind of question, never ambiguity as such.
- Grants that never reach the executor. A rule stated once in conversation binds nobody who did not hear
  it. It binds a dispatched executor only through its briefing (`./orchestration-doctrine.md`, "Rule
  reachability").
