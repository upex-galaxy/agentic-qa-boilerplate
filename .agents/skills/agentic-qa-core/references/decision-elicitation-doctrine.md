# Decision-elicitation doctrine

How this harness asks a human to decide. It is binding, and every skill that reaches a point where the AI should not choose alone cites it.

Match the instrument to the shape of the ask, and never let it cost more than the decision is worth. Whether a question reaches a person at all is settled first, in `./decision-protocol.md`.

---

## 0 · Who may ask the human

One rule covers every instrument here: the harness's question tool, the sweep (§7) and the `mkd` deck (§2-5). Only the session the human types into asks the human.

| Session | Asks the human? | Where its pendings go |
|---|---|---|
| a top-level conductor; a super-conductor (a conductor whose workers are conductors); an independent worker (launched top-level, its prompt carries no fleet token) | yes: the sweep for small items, the deck for heavy ones (§1) | to the human |
| a session launched by another session: its prompt carries the fleet token `/<skill> <label> fleet worker` (a worker, or a middle conductor started with `agent launch`) | no question tool, no `mkd` deck, no sweep | to the session that launched it |
| a subagent, an unattended routine, CI | no | listed in its report; a routine parks the item (`./decision-protocol.md` §5) |

A launched session escalates to its launcher the four kinds of `./decision-protocol.md` §5 and every blocker it cannot clear inside its brief. It sends an `ask` (then ends its turn until the answer wakes it), an `escalation`, or, when it was launched without a dispatch, a `status` message whose subject starts with `BLOCKED: ` (`/agent-orchestration` worker contract rules 2, 3 and 8). A pending that does not block it goes in a plain message or its report, and it keeps working on whatever does not depend on the answer. The launcher relays the item to the human with the instrument §1 picks or, if it was itself launched, sends it up one more level. A middle conductor relays and does not sweep.

The reason: a question prompt in a terminal nobody watches waits forever (gotcha G36 in `/agent-orchestration` gotchas), and inside Orca the `mkd` deck opens a tab and blocks its session until someone presses Send.

The exception is per request. A launched session may ask the human directly when the human typed that request into its own terminal, or when its brief grants it in writing. It asks with the instrument §1 picks, then tells its launcher what it asked and what the answer was, so the decision lands in the run record (`./decision-protocol.md` §6). The next request that did not come from the human goes back to the launcher.

Its first prompt says what a session is (the fleet token, or none), and the request in front of it says who is asking now. When unsure, treat yourself as launched and escalate: a needless relay costs one hop, a prompt nobody sees costs the run.

---

## 1 · The ladder

The ladder is for a session §0 lets ask the human.

| The ask | Instrument | Why |
|---|---|---|
| One small decision needed to continue this turn | the harness's own question tool | fastest path, no context switch, the answer arrives in-turn |
| Any number of small decisions (A or B, a default to confirm, a deferral: each fits in two sentences) | the sweep (§7): the harness's question tool, called in rounds until every item is asked | the count never moves a small decision to a deck; the tool's per-call cap only sets the round size |
| A decision with real tradeoffs or weight (architecture, an implementation approach, a larger change, anything whose cost cannot be stated honestly in two sentences) | `mkd` decision deck | a terminal prompt cannot hold written tradeoffs and context. Weight is the trigger, never the count |
| A long report or plan the human should react to point by point | `mkd` report items | anchors each reaction to the exact section instead of a prose reply the AI has to guess-map back |
| Row-by-row verdicts over tabular data | `mkd` table item | one answer per row, not a paragraph about rows |
| The approach itself is unsettled and needs exploring before anything is built | plan mode | this is not a decision yet |
| No human is at the wheel (CI, an unattended routine) | none of the above | state the technical assumption, proceed, record it in the report; a question of the four kinds (`./decision-protocol.md` §5) is parked, never assumed |

Weight decides, not count: nine small decisions are one sweep, one heavy decision is a deck, and a mixed batch splits. A deck for a small decision is ceremony, and ceremony is how a good instrument gets abandoned.

A skill that interviews a person in rounds (the user-level `grilling` is the usual case) follows the same ladder. Each round is a sweep: its questions go through the harness question tool, the skill's recommended answer is the first option, and numbered prose in the chat is the fallback in §7 and nothing more.

---

## 2 · What makes a deck worth the round trip

A deck that only lists options is worse than a terminal prompt: it costs more and delivers the same. The value is in what a terminal cannot hold.

- Every option carries a written justification of what it buys and what it costs (the skill's validator rejects one without).
- At most one option is recommended, and its justification says why it wins.
- The problem is stated in plain language for someone without the technical context. Jargon, internal names and the way the system works as it stands go in the collapsible context balloons, because a reader who does not know the current state cannot weigh a change to it.
- Skipping an item means decide later, not a rejection.

---

## 3 · The gate, and the fallback

`mkd` is a user-level skill, installed globally by this repo's installer (`cli/install.ts`, `USER_LEVEL_SKILLS`). A machine that ran the installer has it. This doctrine is its named loader (`skill-composition-strategy.md` §3.2), so loading it needs no permission.

| State | What happens |
|---|---|
| installed | when the ladder says deck, call the Skill tool with "mkd" and follow it |
| not installed | say one line offering to install it, then do the step with the harness prompt and carry on |

This gate speaks, unlike the orchestration gate (`/agent-orchestration` §Two gates), whose silence comes from depending on a separate application. Here the absence means our own installer did not run or drifted, the fix is one command, and the user benefits from knowing. Say it once per session. A decision taken through the harness prompt is a real decision: the deck is a better container, not a different authority.

---

## 4 · Delivery, and the part that closes the loop

By default the CLI renders the deck, opens a browser and exits; the human answers whenever they want and pastes the result back. That suits an answer not needed this turn. When it is needed this turn, serve the deck and wait: the result returns to the agent directly.

With an orchestration runtime, open the deck in a worktree-bound browser tab rather than the system browser (`agentic-qa-core/references/fleet-launch-seam.md` §6). Measured (ADR-0006): the page renders, its storage works, and the submit returns the result with no copy step. The tab sits beside the terminals that produced it and is reachable from the owner's phone.

Two rules follow from how browser storage works, both measured:

1. Keep one copy. The same deck open in the system browser and in a worktree tab keeps two sets of answers that never merge. Open one, say which is live, close the other.
2. Read the storage key before moving a half-answered deck. Moving it to a different origin loses everything already answered.

---

## 5 · Reading the result

The returned JSON is the execution contract. Execute what it says.

- A skipped item means decide later: ask it again later.
- A custom answer is executed as written, or questioned if something does not add up, and is not normalised into the nearest listed option.
- Read each item's note. "I did not understand this question" is the most important signal a deck can return, because the answer is then not informed consent. Do not execute that item: re-explain it in plain language and ask again. Measured (ADR-0006): this happened, and executing that item would have shipped a change the owner never approved.
- Quoted phrases the human highlighted weigh more than the rest of their free text, because they chose those words on purpose.

---

## 6 · What this is not for

This file picks the instrument. `./decision-protocol.md` decides whether a question reaches a person at all. So a deck is the wrong tool for:

- a technical call inside an approved plan, which is the agent's (`./decision-protocol.md` §4);
- gathering requirements, which is a conversation;
- a decision already taken: search the record before drafting the deck (`./decision-protocol.md` §2), and when an item exists to supersede a prior ruling, show that ruling inside it;
- an unattended routine, which parks a question of the four kinds and reports it (`./decision-protocol.md` §5).

Write the answers down where `./decision-protocol.md` §6 says, as soon as they arrive, so the next session finds them in its search instead of asking again.

---

## 7 · The sweep (SPD, Sweep Pending Decisions)

The sweep closes a turn that still holds small open items; the deck takes the heavy ones (§1). A blocking item is asked at once, by whichever instrument fits. At the close, heavy items go to the deck first, then the sweep takes every remaining small item.

**Who sweeps.** Only a session §0 lets ask the human. A launched session sends its pendings to its launcher, and the session the human types into sweeps them. With no human at the wheel there is no sweep: park the item and report it.

**What counts as pending.** Only what `./decision-protocol.md` §5 lets reach a person. A technical call inside the approved plan is decided and reported as DECIDED, and a settled question is followed. The sweep decides how pendings are asked and does not widen what is asked.

**When.** Before any message that would leave something waiting on the human: a decision, an unconfirmed assumption, an item left for later. In plan mode, sweep before `ExitPlanMode`, which is reserved for approving the plan itself.

**Rounds.** Call the harness's question tool at its own per-call limit, each round waiting for its answers, until every pending item has been asked. Nine items on a tool that takes four per call are rounds of four, four and one. The tool's schema sets the limit, so no number is written in this repo. Blocking items go in the first round. When pendings depend on each other, order the rounds by dependency level, roots first (`./decision-protocol.md` §1.1). Drop an item an earlier answer made moot, and never repeat one already answered or deferred.

**Shape of each question.** One pending item, a short header, the options within the tool's option limit, the recommended one first and marked, each stating its value and cost in a line. Always offer a free-text way out: the tool adds "Other" on every harness below, and where it does not, add "Other (write your own)". Add a "Later" option unless the item blocks the work.

**"Later" is an answer.** Record it as deferred in the session's `progress.md` (`./session-management.md` §7) and do not ask it again in the same session unless it starts to block. A new session re-raises it once, only if the handoff lists it.

**The answer is the execution contract**, read as §5 reads a deck result: "Other" text is executed as written, and "I did not understand" means do not execute, explain and ask again.

**Which tool.** The harness's own structured-question tool; look it up in the session's tool list.

| Harness | Tool | Where it is absent |
|---|---|---|
| Claude Code | `AskUserQuestion` | headless runs; Agent-tool subagents (unreliable) |
| Codex | `request_user_input` | exec mode; outside Plan mode unless the feature flag `default_mode_request_user_input` is on |
| OpenCode | `question` | `opencode run`; disabled by its permission key `question` |
| Gemini CLI | `ask_user` | non-interactive runs |
| Pi | none built in | always, unless a package adds one: the fallback below |
| any other | its own question tool, if its tool list shows one | otherwise the fallback below |

Tool names and limits move with harness releases. The tool list of the running session is the authority, and this table only says what to look for.

**Fallback** (no tool, a refused call, or the tool is off in this mode): a numbered list in the message with the same content as the structured call, in rounds only if it grows unwieldy:

```text
Pending (N). Reply with the numbers, e.g. "1a 2b 3 later":
1. <the question, one sentence>
   a) <option> (recommended: <why>)   b) <option>   c) later   d) other: write your own
```

Numbered prose is right only here, for the sweep and for a skill's own interview rounds alike. A turn that ends with an unnumbered paragraph of open questions is the defect the sweep exists to remove.
