# Decision-elicitation doctrine

**How this harness asks a human to decide.** Canonical, binding, cited by every skill that reaches a
point where the AI must not choose alone.

The rule is not "use the fancy tool". It is: **match the instrument to the shape of the ask**, and never
let the instrument cost more than the decision is worth.

---

## 0 · Who may ask the human

One rule for every instrument in this file: the harness's question tool, the sweep (§7) and the `mkd`
deck (§2-5). **Only the session the human types into asks the human.**

| Session | Asks the human? | Where its pendings go |
|---|---|---|
| a top-level conductor; a super-conductor (a conductor whose workers are conductors); an independent worker (launched top-level, its prompt carries no fleet token) | yes: the sweep for small items, the deck for heavy ones (§1) | to the human |
| a session launched by another session: its prompt carries the fleet token `/<skill> <label> fleet worker` (a worker, or a middle conductor started with `agent launch`) | never: no structured-question tool, no `mkd` deck, no sweep | to the session that launched it |
| a subagent, an unattended routine, CI | never | listed in its report; a routine parks the item (`./decision-protocol.md` §5) |

**A launched session escalates to its launcher.** It sends the four kinds of `./decision-protocol.md`
§5, and every error or blocker it cannot clear inside its brief, to the session that launched it: a
blocking `ask`, an `escalation`, or, when it was launched without a dispatch, a `status` message whose
subject starts with `BLOCKED: ` (`orca-orchestration/references/worker-contract.md` rules 2, 3 and 8).
A pending that does not block it goes in a plain message or its report, and it keeps working on what
does not depend on the answer. The launcher relays the item to the human with the instrument §1 picks
or, if it was itself launched, sends it up one more level the same way. A middle conductor never sweeps:
it escalates its workers' pendings together with its own.

**Why.** A question prompt in a terminal nobody watches waits forever (gotcha G36 in
`orca-orchestration/references/gotchas.md`), and inside Orca the `mkd` deck opens a tab and blocks its
session until someone presses Send.

**The exception is per request.** A launched session may ask the human directly when the human typed
that request into its own terminal, or when its brief grants it in writing. It asks with the instrument
§1 picks, then tells its launcher what it asked and what the answer was, so the decision lands in the run
record (`./decision-protocol.md` §6). The fleet token in its first prompt stays: the next request that
did not come from the human goes back to its launcher.

**How a session knows.** Its first prompt says what it is (the fleet token, or none); the request in
front of it says who is asking now. Unsure → treat yourself as launched and escalate: a needless relay
costs one hop, a prompt nobody sees costs the run.

---

## 1 · The ladder

The ladder is for a session §0 lets ask the human; a launched session sends its asks to its launcher.

| The ask | Instrument | Why |
|---|---|---|
| One small decision needed to continue THIS turn | the harness's own question tool | fastest path, no context switch, answer arrives in-turn |
| **Any number of small decisions** (A or B, a default to confirm, a deferral: each fits in two sentences) | **the sweep (§7)**: the harness's question tool, called in rounds until every item is asked | the count never moves a small decision to a deck; the tool's per-call cap only sets the round size |
| **A decision with real tradeoffs or weight** (architecture, an implementation approach, a larger change, anything whose cost cannot be stated honestly in two sentences) | **`mkd` decision deck** | a terminal prompt cannot hold written tradeoffs and context. Weight is the trigger, never the count |
| A long report or plan the human should react to point by point | **`mkd`** report items | anchors each reaction to the exact section instead of a prose reply the AI has to guess-map back |
| Row-by-row verdicts over tabular data | **`mkd`** table item | one answer per row, not a paragraph about rows |
| The approach itself is unsettled and needs exploring before anything is built | plan mode | this is not a decision yet |
| No human is at the wheel (CI, an unattended routine) | none of the above | state the assumption, proceed, and record it in the report. Never block a routine on a question nobody will see |

**The threshold to remember**: weight, not count. Nine small decisions are one sweep; one heavy decision
is a deck. A deck for a small decision is ceremony, and ceremony is how a good instrument gets abandoned.
A mixed batch splits: sweep the small ones first, deck only the heavy ones.

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
- **Context balloons carry how things work as they stand.** A reader who does not know the current state cannot
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
| **installed** | use it when the ladder says so. Loading it then needs no permission: this doctrine is its named loader (`skill-composition-strategy.md` §3.2) |
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
browser (`orca-orchestration/references/html-surfaces.md`). Measured (see ADR-0006): the page renders, its
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
  that item. Re-explain it in plain language and ask again. Measured (see ADR-0006): this happened, and
  executing that item would have shipped a change the owner never actually approved.
- Quoted phrases the human highlighted weigh more than the rest of their free text. They chose those
  words on purpose.

---

## 6 · What this is not for

This file picks the instrument. WHETHER a question reaches a person at all is decided first, by
`./decision-protocol.md`: search the record, follow what is settled, decide the technical call inside the
approved plan, and escalate only its four kinds (§5 there).

- **Not for a decision the AI should simply make.** A technical call inside an approved plan is the
  agent's (`./decision-protocol.md` §4); making the human confirm it is noise disguised as diligence.
- **Not for gathering requirements.** That is a conversation.
- **Not for a decision already taken.** Re-opening a settled question through a nicer interface is still
  re-opening it. Search the record before drafting the deck (`./decision-protocol.md` §2), and when an
  item exists only to supersede a prior ruling, show that ruling inside it.
- **Not for an unattended routine.** Nobody is watching. The assumption a routine may state and proceed
  on (§1, last row) is a technical one; a question of the four kinds is parked and reported, never
  assumed (`./decision-protocol.md` §5).
- **Write the answers down** where `./decision-protocol.md` §6 says, as soon as they arrive, so the
  next session finds them in its search instead of asking again.

---

## 7 · The sweep (SPD, Sweep Pending Decisions)

The sweep closes a turn that still holds small open items. It is the sibling of the deck (`mkd`): **the
sweep takes small decisions, the deck takes heavy ones** (§1, weight not count). A turn holding both: a blocking item is
asked at once, by whichever instrument fits; at the close, heavy items go to the deck first, then the sweep
takes every remaining small item.

**Who sweeps.** Only a session §0 lets ask the human: a top-level conductor, a super-conductor, an
independent worker. A session launched by another session never sweeps and never decides a pending of
the four kinds: it sends it to its launcher as §0 says, and the session the human types into sweeps it.
No human at the wheel (CI, an unattended routine): no sweep; park the item and report it
(`./decision-protocol.md` §5).

**What counts as pending.** Only what `./decision-protocol.md` §5 lets reach a person (the four kinds).
A technical call inside the approved plan is decided and reported as DECIDED, never swept. A settled
question is followed, never re-asked (§3 there). The sweep decides HOW pendings are asked; it never
widens WHAT is asked.

**When.** Before any message that would leave something waiting on the human: a decision, an unconfirmed
assumption, an item left for later. In plan mode, sweep before `ExitPlanMode`, which stays reserved for
approving the plan itself.

**Rounds.** Use the harness's own question tool at its own per-call limit, and call it again, each round
waiting for its answers, until every pending item has been asked; an item an earlier answer made moot is dropped. Nine items on a tool that takes four per call are rounds of four, four and
one. No number is written in this repo: the tool's schema sets it, and a harness that changes its limit
changes nothing here. Blocking items go in the first round. A later round never repeats an item already
answered or deferred.

**Shape of each question.** One pending item, a short header, the options within the tool's option limit,
the recommended one first and marked, each option stating its value and its cost in a line. Always
offer a free-text way out: the tool adds one ("Other") on every harness below; where it does not, add an
option "Other (write your own)". Add a "Later" option unless the item blocks the work.

**"Later" is an answer.** Record it as deferred in the session's `progress.md`
(`./session-management.md` §7), do not ask it again in the same session unless it starts to block, and
let a new session re-raise it once, only if the handoff lists it.

**The answer is the execution contract**, read as §5 reads a deck result: "Other" text is executed as
written; an answer saying the question was not understood means do NOT execute: explain it plainly and
ask again.

**Which tool.** The harness's own structured-question tool; look it up in the session's tool list.

| Harness | Tool | Where it is absent |
|---|---|---|
| Claude Code | `AskUserQuestion` | headless runs; Agent-tool subagents (unreliable) |
| Codex | `request_user_input` | exec mode; outside Plan mode unless the feature flag `default_mode_request_user_input` is on |
| OpenCode | `question` | `opencode run`; disabled by its permission key `question` |
| Gemini CLI | `ask_user` | non-interactive runs |
| any other | its own question tool, if its tool list shows one | otherwise the fallback below |

Tool names and limits move with harness versions (read 2026-10-22, harness docs and binaries): the tool
list of the running session is the authority, this table only says what to look for.

**Fallback** (no tool, a refused call, or the tool is off in this mode): a numbered list in the message,
same content as the structured call, in rounds only if it grows unwieldy:

```text
Pending (N). Reply with the numbers, e.g. "1a 2b 3 later":
1. <the question, one sentence>
   a) <option> (recommended: <why>)   b) <option>   c) later   d) other: write your own
```

A turn that ends with an unnumbered paragraph of open questions is the defect the sweep exists to remove.
