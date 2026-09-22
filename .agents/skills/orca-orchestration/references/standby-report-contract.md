# Standby report contract — what a session emits when it stops

> Loaded by: any session that goes to standby, stops on human-in-the-loop, or reaches a final
> status. Conductor and worker alike. **Not mid-flight** — a report at every stage boundary is a
> heartbeat wearing a suit, and `references/worker-contract.md` rule 4 forbids those.
>
> This is the GENERAL form. A workflow skill that needs domain vocabulary (test-case states, a
> tracker envelope) writes its own instance at `<skill>/references/standby-report-contract.md` and
> cites this file for the shape. Nothing here names a product.

**Why it exists.** The audience is two readers at once: the human scanning a terminal with five of
these open, and the next agent session picking up the state. Hard rule 23 is the one-line version —
**a report is a COUNT, not a narrative** — and the reader is DECIDING, not reading.

---

## The six parts, in order

**1 · One-line verdict, above everything.** Someone with five reports open must triage which to
open without opening any. It states the count, whether the thing moves, and who is holding it.

> *25 of 30 pass. Does not transition. Blocked on three different people, zero replies in 2 days.*

**2 · Metrics table.** At most nine rows, every value a number or a yes/no, no prose. It answers
"how far from done" without the second table. Three rows earn their place and are usually missing:

| Row | Why it is load-bearing |
|---|---|
| **Needed to finish** | the only number that answers "how close are we" |
| **Waiting since** | two days and twenty minutes read identically without it |
| **Replies on the thread** | zero says the *channel* is dead, which is a different problem from the question being hard |

**3 · Detail table**, one row per blocked item, with two columns that are not optional:

- **`Blocker` is a CLOSED vocabulary**, never free text: `no-data`, `no-access`, `no-permission`,
  `partial`, `defect`. Without it, two rows both reading "not run" hide that one is three assertions
  out of four and the other cannot reach the fixture at all. Closed tags also let a reader collapse
  five rows into one problem on sight.
- **`Who unblocks it` is a named role or person**, never "the team". An unnamed owner is not
  actionable, and finding out who is exactly the work the report was supposed to save.

**4 · Root cause line, always present — including when there is none.** The single most valuable
sentence is the one that collapses five rows into one problem. Its absence is also information:
*"no single root cause, three distinct ones"* tells the reader they need three conversations.

**5 · Unblock options, numbered and self-contained.** Any one of them unblocks the set. If they are
not interchangeable, say which unblocks what.

**6 · The explicit negative.** *"Nothing failed — these are assertions that are not executable with
the current fixture."* Without it, a reader sees "not run" and assumes something broke.

---

## Three envelopes, same numbers

Box drawing reads well in a terminal and is destroyed everywhere else — the same failure mode as a
pipe table flattened by a document tool. `AGENTS.md` §2 already says plain ASCII over Unicode when
the target terminal is unknown.

| Destination | Shape |
|---|---|
| a terminal, for the operator | box drawing |
| a comment on a tracker artifact (Jira, a PR) | bullets with a separator, never pipe tables |
| a chat or a document surface | whatever that surface renders natively |

**A session that emits the terminal form and pastes it into a tracker comment has produced
garbage.** That is the mistake this section exists to prevent, and it is why the contract names
envelopes at all rather than just a format.

---

## Where it meets the session footer

This contract and `agentic-qa-core/references/session-footer-contract.md` fire at the same moment
and are not the same thing. The footer says **what the session USED** (skills, MCPs, CLIs, testing
levels, screenshots) — provenance, for the record. This says **why the work STOPPED and who
unblocks it** — a decision, for a human about to make one. A session that closes with one and not
the other has told half the story; when both apply, the standby report goes first, because the
operator is triaging before they are auditing.

---

## What this is not

- **Not a progress table.** A progress table answers "how is the whole thing going" across units,
  for a channel. This answers "why is THIS one stopped and who unblocks it", for a terminal at a
  decision moment. Both exist; neither replaces the other. **If the two ever disagree on a status
  vocabulary, the progress table wins**, because it is the one a human posts publicly.
- **Not a heartbeat.** See the loading note above.
- **Not a narrative.** Hard rule 23. Prose that is accurate and unusable for the decision in front
  of the reader has failed, and it fails most often when the writer knows the material best.
