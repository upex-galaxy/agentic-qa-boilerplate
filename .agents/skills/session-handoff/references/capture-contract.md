# Capture contract: the ten sections of a handoff

Every handoff has these ten sections, in this order, with these numbers. A section with nothing to say gets an explicit `none` line and a reason. It is never dropped, because an omitted section and a forgotten one look identical to the successor, which has no way to ask which happened.

The order has a purpose. The successor reads top to bottom under time pressure, so the file opens with the one thing to do and closes with the things that are always true.

---

## §0 · Your FIRST task

One task, not a menu and not a priority list. It is the single thing the successor does before anything else, written as an instruction to a person who has already agreed to do it.

If the owner stated acceptance criteria, quote them, numbered, in their original intent. Paraphrase is where requirements quietly shrink.

Close the section with what "done" looks like and what happens next.

*Failure mode*: a successor that opens with a menu spends its first minutes re-deciding what the predecessor already decided, and often picks differently.

## §1 · Identity and authority

Who the owner is, how they decide, what they have delegated and what they have reserved. Include the harness, the worktree, the session label and the commit-trailer values. Write the push policy as its resolved value, not the name of the variable that holds it.

Anything the owner said once and will not repeat goes here verbatim.

*Failure mode*: a successor that re-asks a delegated decision burns the owner's patience; one that assumes an authority it does not have does damage.

## §2 · What was built

What landed, with SHAs, PR numbers and paths. Write one paragraph per unit of work, because the successor needs enough to reason about the change without opening every file and a bare commit list gives it nothing.

State what is pushed and what is only local.

*Failure mode*: work redone because the successor could not tell it was already finished.

## §3 · Decisions, each with its why

Every decision the session made, the alternatives it rejected, and the reason. The reason is the half that carries weight: a decision without its why gets re-litigated the moment it becomes inconvenient, and the successor has no standing to defend it.

Mark who made each one: the owner, or the session under delegated authority.

*Failure mode*: silent drift, where the successor reverses a deliberate choice believing it was an oversight.

## §4 · Gotchas and observations

What the session learned the hard way. Label each one `measured` or `read`: measured means this session ran it and saw the output, read means it came from a document and was believed.

Include the version or date the measurement holds for. A gotcha about a tool is a gotcha about a tool at a version.

*Failure mode*: the successor pays the same cost twice. This is the highest-value section of the file and the one most often written thin.

## §5 · Skills, tools and MCPs used

A table with kind, name, what it was used for, and a `Load next session?` column answered per row with a reason, not a bare yes.

Cover skills, CLIs, MCP servers, harness tools and any auto-memory paths.

*Failure mode*: the successor either reloads everything and burns the window it was just given, or loads nothing and guesses syntax it should have looked up.

## §6 · Files to read, in order

A numbered reading list with absolute paths, ordered by what the successor needs first. Say what each file is for and, for a long file, which sections to read.

*Failure mode*: an unordered list is a search problem. The predecessor already solved it and should hand over the answer.

## §7 · Live state you inherit

The perishable section. It holds everything still in motion: running workers, open mailboxes, in-flight PRs, live runs, unreleased dispatches, resumable sessions.

Rules specific to this section:

- Every item carries the wall-clock time it was last measured and the mark `PERISHABLE`.
- Every item states the exact command that re-verifies it. The instruction is to re-verify, then act.
- Ids are copied verbatim, in backticks: run, task, dispatch, terminal handle, session id, PR number, tracker key, SHA.
- A predicted branch ("if it refuses, do X") is labelled `predicted`, because nobody observed it.

If an item needs attention before §8's priority order, say so in the item itself. Perishable beats priority, and the successor cannot infer that.

*Failure mode*: this is where handoffs break. State measured at write time has already changed by read time, and a successor that trusts it literally acts on a world that no longer exists.

## §8 · Pending work, in priority order

Lettered items, in the order the owner ranked them. Each one says what it is, the exact next step and what it depends on.

Separate the items the owner has decided from the items awaiting an owner decision, and say plainly which is which. A successor with nobody to ask does the first group and reports the second.

*Failure mode*: a successor that starts with the interesting item instead of the important one.

## §9 · Conventions the owner cares about

The standing ones: how decisions get presented, what gets announced before it happens, language rules, register, memory protocol, delegation preferences.

Close with the handoff instruction itself: the threshold at which the successor writes its own `-handoff-NN+1` and launches its own successor. The lineage has to perpetuate itself, or it ends at the first session that forgets.

*Failure mode*: the successor relearns preferences by getting them wrong first.

---

## Two checks before writing the file

1. List the handoff directory (`<<PRIMARY_ROOT>>/.session/handoffs/`, the primary checkout's, also from a worktree). `NN` is the next number in the lineage, not a guess. Two handoffs with the same number make a lineage that cannot be read.
2. Re-verify everything going into §7. A measurement from an hour ago does not belong in the section whose purpose is freshness. Re-run the check, then write the result and the time.
