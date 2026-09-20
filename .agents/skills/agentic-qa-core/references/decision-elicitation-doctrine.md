# Decision-elicitation doctrine

**How this harness asks a human to decide.** Canonical, binding, cited by every skill that reaches a
point where the AI must not choose alone.

The rule is not "use the fancy tool". It is: **match the instrument to the shape of the ask**, and never
let the instrument cost more than the decision is worth.

---

## 1 · The ladder

| The ask | Instrument | Why |
|---|---|---|
| One question, at most four options, needed to continue THIS turn | the harness's own question prompt | fastest path, no context switch, answer arrives in-turn |
| Two or three simple questions | the same, one round | still cheaper than a browser |
| **More than three decision points** | **`mkd` decision deck** | a terminal prompt caps at roughly four questions of four options and cannot hold written tradeoffs |
| **One decision whose tradeoff cannot be stated honestly in two sentences** | **`mkd`** | the count is not the only trigger. Density is. A single decision carrying a real cost deserves the space to state it |
| A long report or plan the human should react to point by point | **`mkd`** report items | anchors each reaction to the exact section instead of a prose reply the AI has to guess-map back |
| Row-by-row verdicts over tabular data | **`mkd`** table item | one answer per row, not a paragraph about rows |
| The approach itself is unsettled and needs exploring before anything is built | plan mode | this is not a decision yet |
| No human is at the wheel (CI, an unattended routine) | none of the above | state the assumption, proceed, and record it in the report. Never block a routine on a question nobody will see |

**The threshold to remember**: more than three decisions, OR one dense one. Below that, a deck is
ceremony, and ceremony is how a good instrument gets abandoned.

---

## 2 · What makes a deck worth the round trip

A deck that just lists options is worse than a terminal prompt, because it costs more and delivers the
same thing. The value is entirely in what a terminal cannot hold:

- **Every option carries a written justification: what it buys AND what it costs.** The skill's own
  validator rejects an option without one. Do not fight it, write the justification.
- **At most one option is recommended, and its justification says WHY it wins**, not merely that it is
  recommended.
- **The problem is stated in plain language**, for someone without the full technical context. Jargon and
  internal names go inside the collapsible context balloons, which exist for exactly that.
- **Context balloons carry how things work TODAY.** A reader who does not know the current state cannot
  weigh a change to it.
- Skipping an item means *decide later*. It is never a rejection, and it must not be read as one.

An unexplained option list is the failure this instrument exists to eliminate. If the deck does not
explain, use the terminal prompt and save everyone the tab.

---

## 3 · The gate, and the fallback

`mkd` is a USER-level skill, installed globally by this repo's installer
(`cli/install.ts`, `USER_LEVEL_SKILLS`). A machine that ran the installer has it.

| State | What happens |
|---|---|
| **installed** | use it when the ladder says so |
| **not installed** | say ONE line offering to install it, then fall back to the harness prompt and continue. Never block on the offer |

This gate is NOT silent, and that is a deliberate difference from the orchestration gate
(`orca-orchestration/SKILL.md` §The gate), which stays silent because it depends on a separate
application. Here the absence means our own installer did not run or drifted, the fix is one command, and
the user benefits from knowing. Say it once per session, never twice.

**The fallback is always available and always acceptable.** A decision taken through the harness prompt
is a real decision. The deck is a better container, not a different authority.

---

## 4 · Delivery, and the part that closes the loop

By default the CLI renders the deck, opens a browser and EXITS. The human answers whenever they want and
pastes the result back. Non-blocking, which is right when the answer is not needed this turn.

**When the answer IS needed in this turn**, serve it and wait: the result returns to the agent directly,
on its own, with nothing pasted by hand.

**With an orchestration runtime, open the deck in a worktree-bound browser tab** rather than the system
browser (`orca-orchestration/references/html-surfaces.md`). Measured 2026-09-19: the page renders, its
browser storage works, and the submit returns the result to the agent with no copy step at all. The tab
sits beside the terminals that produced it and is reachable from the owner's phone.

Two rules that follow from how browser storage works, both measured:

1. **One copy, or the answers split.** The same deck open in the system browser and in a worktree tab
   keeps two separate sets of answers that never merge. Open one, say which is live, close the other.
2. **Check before moving a half-answered deck.** Read its storage key first; moving it to a different
   origin loses everything already answered.

---

## 5 · Reading the result

The returned JSON is the **execution contract**. Execute what it says.

- A skipped item is *decide later*. Re-ask it later; never treat it as a no.
- A custom answer is executed as written, or questioned if something does not add up. It is not silently
  normalised into the nearest listed option.
- **Always read each item's note.** A note saying *"I did not understand this question"* is the single
  most important signal a deck can return: it means the answer is not informed consent. Do NOT execute
  that item. Re-explain it in plain language and ask again. Measured 2026-09-19: this happened, and
  executing that item would have shipped a change the owner never actually approved.
- Quoted phrases the human highlighted weigh more than the rest of their free text. They chose those
  words on purpose.

---

## 6 · What this is not for

- **Not for a decision the AI should simply make.** A routine judgement call with an obvious default is
  not a decision point; making the human confirm it is noise disguised as diligence.
- **Not for gathering requirements.** That is a conversation.
- **Not for a decision already taken.** Re-opening a settled question through a nicer interface is still
  re-opening it.
- **Not for an unattended routine.** Nobody is watching.
