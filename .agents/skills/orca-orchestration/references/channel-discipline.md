# Channel Discipline: Which Verb Carries What, and the One Exception

> Loaded by any session that sends anything to another session: conductor, worker, helper.
> The shortest reference in this skill and the one whose violation costs the most, because the
> failure is silent in both directions and the receipt says `ok`.
> It exists because two sessions, both of which had just finished WRITING the rule, broke it
> repeatedly within the hour and lost content each way (G64, G66). A rule its own authors break
> right after writing it is a placement problem, not a comprehension one, so this is a channel
> ASSIGNMENT (hard rule 4) and not advice about brief length.

---

## 1 · The three channels

The two verbs are named in `.agents/project.yaml` → `orchestration.message_verb` and
`orchestration.terminal_verb`, not hardcoded here, so a project on another orchestrator keeps the
doctrine and swaps the commands. On this repo they resolve to `{{MESSAGE_VERB}} send` and
`{{TERMINAL_VERB}} send` on {{ORCHESTRATOR_NAME}}.

| Channel | What it carries | Integrity |
|---|---|---|
| `{{MESSAGE_VERB}} send` (the mailbox) | every message between sessions: status, questions, answers, decisions, escalations | byte-intact (G66) |
| a file plus a one-line pointer | anything longer than a couple of sentences: briefs, reports, scope agreements, evidence, anything with a table | perfect, and re-readable later, which a message is not |
| `{{TERMINAL_VERB}} send` | driving a terminal: commands, CLI calls, harness slash-commands, keystrokes | lossy. It truncates silently, keeps only the TAIL, and reports success anyway (G60, G64) |

The test: if a human would READ it, it does not go through `{{TERMINAL_VERB}} send`. If a shell or
a TUI would EXECUTE it, that is what the verb is for.

The vendor stubs follow the same logic. `orchestration.orchestrator_skills` are small and load
alongside this skill. The measurement behind that lives in ADR-0006: a config file carries the
setting and a doctrine file carries the rule, and neither carries the lab notebook.

The mailbox is the reliable channel. A session that meets one truncated `terminal send` and
concludes "messaging between agents is unreliable" starts avoiding both channels and loses the one
that works (G66).

---

## 2 · The one exception, and it is structural: keep it

A supervised worker's FIRST prompt is delivered with `terminal send`, because there is no other way.
The native launch starts the agent itself and takes an agent, a model and an effort level, not a
command line, so there is no argv for a prompt to travel in. That is step 6 of the launch flow, and
`references/coordinator-playbook.md` §1 treats steps 3 to 6 as one indivisible operation. G58 is the
cost of getting it wrong in the other direction: the injected task spec is what the worker acts on
first, so the spec and the handoff prompt must each be self-sufficient.

The rule, then, is that `terminal send` never carries a CONVERSATION. The one prompt it may carry is
the launch handoff, and that prompt is short and points at a file.

That is the same discipline anyway: the handoff opens with `/<workflow-skill> <label> fleet worker`,
names the brief by absolute path, carries the no-stopping sentence, and stops. The worker finds
everything else in the brief, because a long prompt through this verb arrives as its last fragment
(G60).

---

## 3 · What `terminal send` is good at

The half of the rule usually left unwritten, and the reason anyone reaches for the verb:

- **Running a command in the worker's own shell**: a CLI call, a script, a verification the worker's
  environment can answer and the conductor's cannot.
- **Driving a harness slash-command a session cannot invoke for itself.** The measured case: `/mcp`
  is a terminal command, not a tool, so a worker whose MCP process died diagnoses the failure
  perfectly and stays stuck. The conductor revives it by typing into that terminal. The same goes
  for `/rename`, which a worker cannot run on itself (`references/coordinator-playbook.md` §1
  step 5).
- **Reloading the session's plugin and skill surface mid-flight**, so a long-running worker picks up
  a skill edited after it started, which is what a fleet developing its own skills looks like. On
  Claude Code the command is `/reload-plugins` (verified on this machine by the operator: it prints
  a `Reloaded: …` line with the plugin and skill totals). The other harnesses' equivalents are
  UNVERIFIED: confirm the exact string on the machine before putting it in a brief, because naming a
  command that does not exist is the invented-identifier failure and costs a worker a stall.
- **Interrupting a worker**, then verifying on the rendered screen. There is no native pause/resume.
- **A one-sentence nudge pointing at something else**: "check your mailbox: `<subject>`", or a
  stalled worker's continuation sentence. The nudge is not the message (G46).

---

## 4 · Reading the result of a send

- A success code describes the CALL, never the outcome (hard rule 17). `ok: true` / `accepted: true`
  means the text was WRITTEN. Verify at the destination: read the screen, the mailbox, the row. The
  reported byte count counts what was written, not what the agent received (G60).
- `ok: false` on a `terminal send` is the runtime protecting a human typing in that terminal (hard
  rule 18, G65). It is not a transport failure and not a reason to retry: a retry interleaves your
  keystrokes with theirs. Wait, then read the screen.
- A message that begins mid-sentence is a truncation until proven otherwise (hard rule 19, G64). The
  head is what gets lost, so the damage reads like a typo and not like a missing message. Say so and
  ask for the pointer; do not answer the fragment.
- `agent_prompt_stalled` can be returned with the text already queued (G52). Read the screen before
  resending: usually there is nothing to resend, and the retry makes the worker act twice.
- Do not send into an input box that already holds text: it concatenates, and `--interrupt` does
  not clear it (G61). Absorb what is there, or submit it, before sending anything new.

---

## 5 · Where the pointed-at file goes

A pointer is worth exactly the path it names:

1. **Absolute, into the PRIMARY checkout.** A relative path resolves differently per worktree, and a
   path inside a worker's own worktree dies with that worktree (G40).
2. **In the gitignored session scope**, `.session/orchestration/<slug>/` for a Run. It is
   correspondence, not a project record, and tier LOCAL: nothing downstream may depend on it
   existing on another machine. Anything durable graduates to the repo, the tracker or memory, and
   the correspondence cites it.
3. **Not a system temp directory.** It triggers a permission prompt on the receiving side, and the
   worker stalls waiting on a human who is not watching.

---

## 6 · The sender signs with an address, not a name

A channel is half of delivery. A brief, a report or a seed names its author by terminal handle plus
Run id, never by a name the session read about itself, which can resolve to nothing, only to
itself, or to the wrong session in another repository while returning success (hard rule 20, G69,
G70). `ORCA_TERMINAL_HANDLE` is in the environment and is not a self-report.
