# Channel Discipline — Which Verb Carries What, and the One Exception

> Loaded by: any session that sends anything to another session — conductor, worker, helper.
> The shortest reference in this skill and the one whose violation costs the most, because the
> failure is silent in BOTH directions and the receipt says `ok`.
> Established 2026-09-21, after an exchange in which two sessions — both of which had just finished
> WRITING the rule — broke it repeatedly within the hour and lost content each way. A rule its own
> authors violate immediately after writing it is a placement problem, not a comprehension one:
> hence a channel ASSIGNMENT (hard rule 4) instead of advice about brief length.

---

## 1 · The three channels

The two verbs are named in `.agents/project.yaml` → `orchestration.message_verb` and
`orchestration.terminal_verb`, not hardcoded here, so a project on another orchestrator keeps the
doctrine and swaps the commands. On this repo they resolve to `{{MESSAGE_VERB}} send` and
`{{TERMINAL_VERB}} send` on {{ORCHESTRATOR_NAME}}.

| Channel | What it carries | Integrity |
|---|---|---|
| **`{{MESSAGE_VERB}} send`** (the mailbox) | **every message between sessions**: status, questions, answers, decisions, escalations | **byte-intact.** Measured 2026-09-21, orca 1.4.190: three messages read back at exactly 126, 896 and 30 bytes (G66) |
| **a file plus a one-line pointer** | **anything longer than a couple of sentences**: briefs, reports, scope agreements, evidence, anything with a table | perfect, and re-readable later, which a message is not |
| **`{{TERMINAL_VERB}} send`** | **driving a terminal**: commands, CLI calls, harness slash-commands, keystrokes | **lossy.** Truncates silently, keeps only the TAIL, reports success anyway (G60, G64) |

**The test**: if a human would READ it, it does not go through `{{TERMINAL_VERB}} send`. If a shell
or a TUI would EXECUTE it, that is exactly what the verb is for.

**The vendor stubs, for the same reason.** `orchestration.orchestrator_skills` measure about 2k tokens for the
pair (4150 and 3862 bytes, 2026-09-22) and load alongside this skill. The figure is here rather than
in `project.yaml` because a config file should carry the setting, not the lab notebook.

The corollary that surprises people: the mailbox is not the unreliable channel. A session that meets
one truncated `terminal send` and concludes "messaging between agents is unreliable" starts avoiding
both channels and loses the one that works (G66).

---

## 2 · The one exception, and it is structural — do not remove it

**A supervised worker's FIRST prompt is delivered with `terminal send`, because there is no other
way.** The native launch starts the agent itself and takes an agent, a model and an effort level —
**not a command line** — so there is no argv for a prompt to travel in. That is step 6 of the launch
flow, and `references/coordinator-playbook.md` §1 calls steps 3-4-5-6 one indivisible operation. G58
is the cost of getting it wrong in the other direction: the injected task spec is what the worker
acts on first, so the spec and the handoff prompt must be self-sufficient on their own.

So the rule is not "never a prompt through `terminal send`". It is:

> **Never a CONVERSATION through `terminal send`. The one prompt it may carry is the launch handoff,
> and that prompt is short and points at a file.**

Which is the same discipline anyway: the handoff opens with `/<workflow-skill> <KEY> fleet worker`,
names the brief by absolute path, carries the no-stopping sentence, and stops. Everything else the
worker needs is in the brief, in a file, because a long prompt through this verb arrives as its last
fragment (G60: 2399 bytes sent, points 1 and 2 of 3 lost).

---

## 3 · What `terminal send` is genuinely excellent at

The half of the rule usually left unwritten, and the reason anyone reaches for the verb at all:

- **Running a command in the worker's own shell** — a CLI call, a script, a verification that the
  worker's environment can answer and the conductor's cannot.
- **Driving a harness slash-command a session cannot invoke for itself.** The measured case: `/mcp`
  is a terminal command, not a tool, so a worker whose MCP process died diagnoses the failure
  perfectly and stays stuck. The conductor revives it remotely, by typing into that terminal. This
  is the class of work the verb exists for.
- **Reloading the session's plugin and skill surface mid-flight**, so a long-running worker picks up
  a skill edited after it started — which is exactly what a fleet developing its own skills looks
  like. **On Claude Code the command is `/reload-plugins`** (verified 2026-09-21 on this machine by
  the operator: it printed `Reloaded: 7 plugins · 62 skills …`). **The other harnesses' equivalents
  are UNVERIFIED**: confirm the exact string on the machine before putting it in a brief. Naming a
  command that does not exist is the invented-identifier failure, and it costs a worker a stall.
- **Interrupting a worker**, then verifying on the rendered screen — there is no native pause/resume.
- **A one-sentence nudge pointing at something else**: "check your mailbox: `<subject>`", or a
  stalled worker's continuation sentence. The nudge is not the message (G46).

---

## 4 · Reading the result of a send

- **A success code describes the CALL, never the outcome** (hard rule 17). `ok: true` /
  `accepted: true` means the text was WRITTEN. Verify at the destination: read the screen, read the
  mailbox, read the row. The reported byte count counts what was written, not what the agent
  received (G60).
- **`ok: false` on a `terminal send` is the runtime protecting a human typing in that terminal**
  (hard rule 18, G65). Not a transport failure, not something to retry — a retry interleaves your
  keystrokes with theirs. Wait, then read the screen.
- **A message that begins mid-sentence is a truncation until proven otherwise** (hard rule 19, G64).
  The head is what gets lost, so the damage reads like a typo rather than like a missing message.
  Say so and ask for the pointer; never answer the fragment.
- **`agent_prompt_stalled` can be returned with the text already queued** (G52). Read the screen
  before resending: usually there is nothing to resend, and the retry makes the worker act twice.
- **Never re-send into an input box that already holds text.** It concatenates, and `--interrupt`
  does not clear it (G61). Absorb what is there, or submit it, before sending anything new.

---

## 5 · Where the pointed-at file goes

A pointer is worth exactly the path it names:

1. **Absolute, into the PRIMARY checkout.** A relative path resolves differently per worktree, and a
   path inside a worker's own worktree dies with that worktree (G40).
2. **In the gitignored session scope** — `.session/orchestration/<slug>/` for a Run. It is
   correspondence, not a project record, and tier LOCAL: nothing downstream may depend on it
   existing on another machine. Anything durable graduates to the repo, to the tracker, or to
   memory, and the correspondence cites it.
3. **Never a system temp directory.** It triggers a permission prompt on the receiving side, and the
   worker stalls waiting on a human who is not watching.

---

## 6 · And the sender signs with an address, not a name

A channel is only half of delivery. A brief, a report or a seed names its author by **terminal
handle plus Run id** — never by a name the session read about itself, which can resolve to nothing,
only to itself, or to the wrong session in another repository while returning success (hard rule 20,
G69, G70). `ORCA_TERMINAL_HANDLE` is in the environment and is not a self-report.
