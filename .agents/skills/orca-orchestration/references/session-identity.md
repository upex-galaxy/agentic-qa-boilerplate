# Session Identity — Who Made This Commit, Three Weeks Later

> Loaded by: the conductor (it fills the roster and the board card) and anyone debugging a commit
> whose author is "the machine".
> The problem: a fleet produces commits from six sessions in two checkouts, and a week later the
> roster is gone and the board card is archived. The answer has to be IN the commit.
> Rows marked **(unverified)** were reported by research but not confirmed by running the command;
> do not build on them without confirming first.

---

## 1 · The two values

```
Worktree: <worktree name | primary>
Session: <session label>
```

- **Worktree** comes from the runtime's own worktree environment variable, whose value has the shape
  `<repoId>::<path>`: take the path after `::` and use its basename. No such variable in the
  environment → `primary`.
- **Session** is the session LABEL, resolved by the rule in §3.

Both keys are **harness-agnostic on purpose**. A harness-branded trailer key names the tool instead
of the work, goes stale when the tool changes, and reads as attribution. These two are forensics:
they answer "which of the six" and nothing else. No AI attribution of any kind is allowed
(Critical Rule #3), and no harness-branded trailer either. The trailer RULE is owned by
`/git-flow-master`; this file only says where the values come from.

---

## 2 · Per-harness table

| Axis | Claude Code | OpenCode | Codex CLI |
|---|---|---|---|
| id from inside a shell | `CLAUDE_CODE_SESSION_ID`, `CLAUDE_PID` | no env var (only a terminal marker) | no confirmed env var; resolve from disk |
| id via a hook | stdin JSON `session_id`, on every event | plugin context exposes the session id | **(unverified)** |
| id from disk | `~/.claude/sessions/<PID>.json` → `.sessionId` | the local app data store; `opencode session list` | `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl` (respects `CODEX_HOME`) |
| name at launch | `-n, --name <name>` | none at startup (`--prompt`, `--model`, `--agent`, `--auto`, `-s`, `-c`, `--fork` exist; no name flag) | **(unverified)**: no confirmed flag |
| rename in session | `/rename` | `/rename` (also a REST patch on the session; **not** a `session rename` subcommand) | `/rename` in the TUI |
| name from disk | `~/.claude/sessions/<PID>.json` → `.name` + `.nameSource` (`user` \| `derived`) | `opencode session list`, Title column (auto-generated from the first message) | `$CODEX_HOME/session_index.jsonl` → `{id, thread_name, updated_at}` |
| resume by id | `claude -r <id>`, `--session-id <uuid>`, `--fork-session` | `opencode -s <id>`, `-c`, `--fork` | `codex resume <id>`, `--last` |
| resume by name | `claude --resume <term>` opens a filtered picker; direct resolution **(unverified)** | not supported | first class: `codex resume <name-or-id>` |
| transcripts | `~/.claude/projects/<slug>/<uuid>.jsonl` | `opencode export [id]` | under `$CODEX_HOME/sessions/` |

Claude Code flags confirmed on this machine against CLI 2.1.275: `-n, --name`, `--model`,
`--effort` (`low`, `medium`, `high`, `xhigh`, `max`), `--permission-mode` (`acceptEdits`, `auto`,
`bypassPermissions`, `manual`, `dontAsk`, `plan`), `-r, --resume`, `--session-id`, `--fork-session`.
Note the asymmetry worth remembering: the permission-mode flag REJECTS an invalid value, while the
effort flag does not — an invalid effort starts the session on the default and tells nobody (gotcha
G28).

OpenCode flags confirmed on this machine: `-m, --model`, `-c, --continue`, `-s, --session`,
`--fork`, `--prompt`, `--agent`, `--auto` (auto-approve permissions not explicitly denied), `--mini`.
There is no name flag and no effort flag, so an OpenCode worker is named by renaming itself in its
first turn.

**Claude Code is the only harness where a hook both reads and writes the session name**: a hook
receives the current title and can emit a title field to set it. The exact field name and the events
that honour it are owned by the hook emitter (`.agents/hooks/personality-reinject.mjs`), which
verifies them against the official docs before emitting anything — this file does not restate them,
precisely so there is one place that can be wrong.

### 2b · On the supervised path the NAME comes from the prompt

The `name at launch` row above applies to a pasted launch line. It does not apply to a supervised
worker: the native launch starts the agent itself and takes an agent, a model and an effort level,
**never a command line**, so there is no name flag to pass (`references/coordinator-playbook.md` §1b).

The replacement is the prompt's fixed opening. A worker's first prompt begins with
`/<workflow-skill> <KEY> fleet worker`, and the hook emitter turns that shape — a workflow trigger
plus an issue key — into the session title, but only while no human has named the session. Two
consequences that bite in practice:

- **Do not rename a Claude Code worker whose prompt carried the token.** A rename marks the name as
  human-set, and the emitter then leaves it alone forever, which is correct behaviour and not what
  you wanted.
- **A worker whose first prompt did NOT carry the token stays unnamed**, and its brief must tell it
  to rename itself to exactly the roster label in its first turn. Same instruction as for the
  harnesses with no name flag at all.

The conductor reads the resulting label back off the screen rather than assuming it: the agent's
status bar carries the session label together with the model and the effort level, and
`terminal read --screen` is how you see it (gotcha G13 — the default read mode returns stacked
fragments of a repainting TUI). Grep it as a BARE token: that bar is drawn with non-breaking spaces,
so a pattern that includes a label plus a space never matches (gotcha G15).

---

## 3 · The label rule

One rule, applied in order, so two sessions never produce two different label formats:

| Case | Label |
|---|---|
| the user set the name explicitly (`nameSource == user`) | the name, as-is |
| the name was derived or auto-generated | `<name> (<first 8 chars of the id>)` |
| only an id is available | the full id |
| nothing is resolvable | `unknown` |

Why the name beats the id: **the name persists and the id does not.** Resuming a session can mint a
new id (a fork certainly does), while the name survives across resumes — and the name is what appears
in the resume picker, in the terminal title and on the board card. The 8-char suffix on a derived name
exists because derived names collide ("Fix the login test" twice in one wave).

Why `unknown` rather than omitting the trailer: an absent trailer is indistinguishable from an old
commit, while `unknown` is a positive statement that the resolver ran and came back empty. That
distinction is the whole point of a forensic field.

---

## 4 · Where it is injected

This repo has **one hook emitter and three adapters**. The emitter resolves identity once per prompt
and injects a single line into the session's context:

```
AGENT IDENTITY: worktree=<name|primary> session=<label> harness=<claude-code|codex|opencode>
```

And, only when the binary gate passes, a second line naming this skill and the worker's channel.
When the gate fails: nothing at all (silence, hard rule 10).

Consequences for anyone reading a commit or writing one:

- A session does **not** need to re-derive its identity: it reads that line. Re-deriving per commit
  is how two commits from one session end up with two different labels.
- The name can MUTATE mid-session (a rename, an auto-title landing late). The trailer records the
  label as it was at commit time, and that is correct: it is forensics, not a primary key.
- A worker in a fresh worktree has the hook, because the hook is committed. It does NOT have the
  environment file or the skills alias — see `references/provisioning.md`.

Ownership: the emitter and its three adapters are `.agents/hooks/` plus the per-harness adapters, and
the compatibility contract (`cli/lib/agent-compatibility-contracts.ts`) is what keeps the three in
sync. Never write a second emitter, and never hand-edit an adapter's generated counterpart.

---

## 5 · Board card, terminal title and the crash case

The failure this exists for: the machine crashes, the session is gone, and the Orca tab survives.
Whatever was only in the conductor's head is lost; whatever is in the card is recoverable.

So at every launch and every stage boundary:

- the terminal title is the session label (a worker launched from a pasted line with a name flag gets
  this for free, since the name becomes the terminal title; on the supervised path set it explicitly
  with the terminal-rename verb, or read back the title the hook set from the prompt);
- the board card's display name is the work key plus a short title — or, in a same-checkout fleet,
  the fleet's own display name, because the card is per-worktree there;
- the board card's comment carries the recovery block: stage, session label, branch, and the absolute
  path of the brief. **In a same-checkout fleet the card cannot hold N of those**, so it points at
  the roster instead and the roster carries per-worker recovery
  (`references/coordinator-playbook.md` §3, gotcha G50).

The roster keeps the machine-readable side of the same facts (task, dispatch, terminal handle,
worktree, agent, model, session label, resume command, status), and it is what the owner phrasebook
resolves "the one on BK-123" against. In a fleet of N workers in one checkout it is not a convenience:
it is the only recovery record there is.
