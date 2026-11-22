# Question research: answer a batch before asking it

> Cited by: `./decision-protocol.md` §1.1, `shift-left-testing` (Phase 2, before the interview).
> Companions: `./briefing-template.md` (the 7 components), `./dispatch-patterns.md`,
> `./adversarial-verification.md` §6 (the verifier that checks a DECIDED answer before it is applied).

A Shift-Left refinement raises many questions for the PO or Dev. Most are answerable from the record or the
code, so a person who receives them cold re-decides what the record already says. This brief sends a
research subagent first. It turns each admitted question (`./decision-protocol.md` §1.1) into a researched
proposal, and only what it cannot resolve reaches a person.

---

## 1. The researcher always runs delegated

The Question Research subagent never asks a person and never writes to Jira. It reads, searches and
reports. Its answers are proposals: the orchestrator applies a FOLLOWED one, sends a DECIDED one through the
verifier (`./adversarial-verification.md` §6) and escalates the rest under `./decision-protocol.md` §5.

Dispatch it with the 7-component briefing. Component 7 carries the decision rule, so the researcher
escalates to the orchestrator and never to the user.

---

## 2. Two profiles, each with a mandatory reading list

| Profile | `for` | Reads before researching |
|---|---|---|
| Product | `po` | the Story and its comments, the Epic's `module-context.md`, sibling Stories, `business-domain-context` and `business-e2e-context` via `bun run context:map <slug>`, the master test plan |
| Technical | `dev` | the same Story record, plus `business-api-context` and `business-data-context`, and the code and data model read-only |

A profile's reading list is read in full before the first question is judged. A question is researched
against the profile of the person it is addressed to.

## 3. Sources and order

Sources follow `./decision-protocol.md` §2, nearest first. The technical profile adds code and the data
model. Every code claim cites `path:line` for a line the researcher actually read. A claim inferred from a
name, a shape or a similar file is not a source, and the question falls to `escalate`.

---

## 4. Output: `open-questions.json`

One entry per question:

| Field | Meaning |
|---|---|
| `id` | stable ID inside the batch |
| `tier` | `follow`, `decide` or `escalate` |
| `proposal` | the answer, written as an instruction a reader can apply |
| `basis` | why, in one or two lines, with the evidence |
| `rejected` | the option that lost and why; required with `decide` |
| `sources` | every source read, each with its location |
| `appliesTo` | the ACs, outlines or fields the answer would change |
| `dependsOn` | IDs of questions this one depends on (`./decision-protocol.md` §1.1) |
| `kind` | which of the four kinds of §5 applies; required with `escalate` |

Tiers:

- `follow`: the record settles it. The proposal is that answer, and `sources` cites it.
- `decide`: the record is silent and the call is technical or a low-risk default. `rejected` is mandatory.
- `escalate`: product behaviour or another of the four kinds, or the evidence conflicts.

A tie between `decide` and `escalate` resolves to `escalate`, and the entry says what evidence would tilt
it. The orchestrator validates the file before using it: required fields present, every `dependsOn`
resolving to an ID in the batch, no cycle left uncollapsed, no `decide` without `rejected`, no `escalate`
without `kind`. A file that fails validation goes back to the researcher.
