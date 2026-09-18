# Capture contract — the ten sections of a handoff

Every handoff has these ten sections, in this order, with these numbers. A section with nothing to say is written with an explicit `none` line and a reason. It is never dropped: an omitted section and a forgotten section look identical to the successor, and it has no way to ask which happened.

The ordering is not decorative. The successor reads top to bottom under time pressure, so the file opens with the one thing to do and closes with the things that are always true.

---

## §0 · Your FIRST task

**One task. Not a menu, not a priority list.** The single thing the successor does before anything else, written as an instruction to a person who has already agreed to do it.

If the owner stated acceptance criteria, quote them, numbered, in their original intent rather than a paraphrase. Paraphrase is where requirements quietly shrink.

Close the section with what "done" looks like and what happens next.

*Failure mode this prevents*: a successor that opens with a menu spends its first minutes re-deciding what the predecessor already decided, and often picks differently.

## §1 · Identity and authority

Who the owner is, how they decide, what they have already delegated and what they have explicitly reserved. The harness, the worktree, the session label, the commit-trailer values. Push policy, resolved to its actual value, not to the name of the variable that holds it.

Anything the owner said once and will not repeat belongs here verbatim.

*Failure mode*: a successor that re-asks a delegated decision burns the owner's patience; one that assumes an authority it does not have does damage.

## §2 · What was built

What actually landed, with SHAs, PR numbers and paths. One paragraph per unit of work, not one line: the successor needs enough to reason about the change without opening every file, and a bare commit list gives it nothing.

State what is pushed and what is only local.

*Failure mode*: work redone because the successor could not tell it was already finished.

## §3 · Decisions, each with its why

Every decision the session made, the alternatives it rejected, and the reason. The reason is the load-bearing half: a decision without its why gets re-litigated the moment it becomes inconvenient, and the successor has no standing to defend it.

Mark who made each one: the owner, or the session under delegated authority.

*Failure mode*: silent drift, where the successor reverses a deliberate choice believing it was an oversight.

## §4 · Gotchas and observations

What the session learned the hard way. **Label each one `measured` or `read`.** Measured means this session ran it and saw the output; read means it came from a document and was believed.

Include the version or date the measurement holds for. A gotcha about a tool is a gotcha about a tool *at a version*.

*Failure mode*: the successor pays the same cost twice. This section is the highest-value part of the file and it is the one most often written thin.

## §5 · Skills, tools and MCPs used

A table: kind, name, what it was used for, and a **`Load next session?`** column answered per row with a reason, not a yes.

Cover skills, CLIs, MCP servers, harness tools and any auto-memory paths.

*Failure mode*: the successor either reloads everything (and burns the window it was just given) or loads nothing (and flies blind on syntax it will guess wrong).

## §6 · Files to read, in order

A numbered reading list, absolute paths, ordered by what the successor needs first. Say what each file is for and, where the file is long, which sections to read.

*Failure mode*: an unordered list is a search problem. The predecessor already solved it and should hand over the answer.

## §7 · Live state you inherit

**The perishable section.** Everything still in motion: running workers, open mailboxes, in-flight PRs, live runs, unreleased dispatches, sessions that can be resumed.

Rules specific to this section:

- every item carries the wall-clock time it was last measured
- every item is marked `PERISHABLE`
- every item states the exact command that re-verifies it, and the instruction is **re-verify, then act**, never act
- ids are copied verbatim and in backticks: run, task, dispatch, terminal handle, session id, PR number, tracker key, SHA
- a predicted branch ("if it refuses, do X") is labelled `predicted`, because it was not observed

If anything here needs attention **before** §8's priority order, say so in the item itself. Perishable beats priority, and the successor cannot infer that.

*Failure mode*: this is where handoffs actually break. State measured at write time is state that has already changed by read time, and a successor that trusts it literally acts on a world that no longer exists.

## §8 · Pending work, in priority order

Lettered items, ordered the way the owner ordered them. Each one: what it is, what the exact next step is, and what it depends on.

Separate the items the owner has decided from the items awaiting an owner decision, and say plainly which is which.

*Failure mode*: a successor that starts with the interesting item instead of the important one.

## §9 · Conventions the owner cares about

The standing ones: how decisions get presented, what gets announced before it happens, language rules, register, memory protocol, delegation preferences.

Close with the handoff instruction itself: at what threshold the successor writes its own `-handoff-NN+1` and launches its own successor. The lineage has to be self-perpetuating or it ends at the first session that forgets.

*Failure mode*: the successor relearns preferences by getting them wrong first.

---

## Two things to check before writing the file

1. **List the handoff directory.** `NN` is the next number in the lineage, not a guess. Two handoffs with the same number is a lineage that cannot be read.
2. **Re-verify anything going into §7.** Do not copy a measurement taken an hour ago into a section whose entire purpose is freshness. Re-run the check, then write the number and the time.
