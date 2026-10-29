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

| Axis | Claude Code | OpenCode | Codex CLI | Pi (not a supported harness of this repo; researched 2026-10-28) |
|---|---|---|---|---|
| id from inside a shell | `CLAUDE_CODE_SESSION_ID`, `CLAUDE_PID` | no env var (only a terminal marker) | no confirmed env var; resolve from disk | not researched |
| id via a hook | stdin JSON `session_id`, on every event | plugin context exposes the session id | **(unverified)** | not researched |
| id from disk | `~/.claude/sessions/<PID>.json` → `.sessionId` | the local app data store; `opencode session list` | `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl` (respects `CODEX_HOME`) | not researched |
| name at launch | `-n, --name <name>` | none in the TUI (`opencode run --title` only; `--prompt`, `--model`, `--agent`, `--auto`, `-s`, `-c`, `--fork` exist) | none (rust-v0.165.0) | `-n, --name <name>` (v1.4.0) |
| rename in session | `/rename <name>` (≤200 chars); **queued while the session is busy** | v1.19.5: `/rename` opens a dialog and takes no argument; v2.2.0: `/rename <name>` inline. Also `PATCH /session/:id {title}` on the TUI's server, only when it was launched with a fixed `--port` (that port then also accepts prompts). **Not** a `session rename` subcommand | `/rename <name>`, accepted mid-task (rust-v0.165.0) | `/name <name>`, works mid-run (v1.4.0) |
| rename from another process | only by typing `/rename` into the TUI; the identity hook sets the name itself (§2b) | typing into the TUI, or the `--port` REST route above | typing into the TUI; the app-server `thread/name/set` needs an experimental `--remote` TUI, so it is not usable | typing into the TUI |
| name from disk | `~/.claude/sessions/<PID>.json` → `.name` + `.nameSource` (`user` \| `derived` \| `hook`) | `opencode session list`, Title column (auto-generated from the first message) | `$CODEX_HOME/session_index.jsonl` → `{id, thread_name, updated_at}` | not researched |
| resume by id | `claude -r <id>`, `--session-id <uuid>`, `--fork-session` | `opencode -s <id>`, `-c`, `--fork` | `codex resume <id>`, `--last` | not researched |
| resume by name | `claude --resume <term>` opens a filtered picker; direct resolution **(unverified)** | not supported | first class: `codex resume <name-or-id>` | not researched |
| transcripts | `~/.claude/projects/<slug>/<uuid>.jsonl` | `opencode export [id]` | under `$CODEX_HOME/sessions/` | not researched |

Versions are the ones the research read (2026-10-28): Codex CLI rust-v0.165.0, OpenCode v1.19.5 and <!-- volatile-ok: harness flags carry the version they were read at -->
v2.2.0, Pi v1.4.0. Harness flags move, so the launch line is always confirmed against `<harness>
--help` on the machine.

Claude Code flags this skill relies on (confirm with `claude --help` before writing a launch line): `-n, --name`, `--model`,
`--effort` (`low`, `medium`, `high`, `xhigh`, `max`), `--permission-mode` (`acceptEdits`, `auto`,
`bypassPermissions`, `manual`, `dontAsk`, `plan`), `--dangerously-skip-permissions` (the same as
`--permission-mode bypassPermissions`), `-r, --resume`, `--session-id`, `--fork-session`. Which
permission mode a tier gets, per harness: `references/orca-machine-setup.md` §3.1.
Note the asymmetry worth remembering: the permission-mode flag REJECTS an invalid value, while the
effort flag does not — an invalid effort starts the session on the default and tells nobody (gotcha
G28).

OpenCode flags this skill relies on (confirm with `opencode --help`): `-m, --model`, `-c, --continue`, `-s, --session`,
`--fork`, `--prompt`, `--agent`, `--auto` (auto-approve permissions not explicitly denied), `--mini`.
There is no name flag and no effort flag, so an OpenCode worker is named by the CONDUCTOR, never by
itself: on v2.2 the conductor types `/rename <name>` into it once it is ready; on v1 `/rename` opens a
dialog with no argument, so the roster carries the name instead (§2b).

**Claude Code is the only harness where a hook both reads and writes the session name**: a hook
receives the current title and can emit a title field to set it. The exact field name and the events
that honour it are owned by the hook emitter (`.agents/hooks/personality-reinject.mjs`), which
verifies them against the official docs before emitting anything — this file does not restate them,
precisely so there is one place that can be wrong.

### 2b · On the supervised path the NAME comes from the prompt

The `name at launch` row above applies to a pasted launch line. It does not apply to a supervised
worker: the native launch starts the agent itself and takes an agent, a model and an effort level,
**never a command line**, so there is no name flag to pass (`references/coordinator-playbook.md` §1b).

**The worker name is `<label>--<handle>`**, one string everywhere: the harness session name, the Orca
tab title (§5), the roster's `Name` column and the `Session:` commit trailer. `<label>` is
`[<KEY>-]<slug>`, kebab-case with single hyphens inside (`TK-123-add-google-auth`, or a bare kebab
slug such as `volatile-impl` for work with no ticket; a `/sprint-testing` worker uses the bare issue
key, because that skill reads the issue it owns from the token); `--` appears only once, before the Orca
terminal handle (`term_<uuid>`). Parse it back by splitting on the LAST `--term_`. Example:
`TK-123-add-google-auth--term_7235f5a5-0fce-495c-9474-7c4370fdefa6`. Vocabulary: in this file
`<label>` is that roster label, and the session LABEL of §3 (the trailer value) is the whole name.

The replacement for the name flag is the prompt's fixed opening. A worker's first prompt begins with
`/<skill> <label> fleet worker`. On Claude Code the hook emitter composes the session name
`<label>--<handle>` from that token plus `ORCA_TERMINAL_HANDLE`, which is present in a dispatched
worker's own environment (gotcha G56); with no handle in the environment (a line pasted outside
Orca) the name is the label alone. It does so while no human has named the session; Claude Code
records it with `nameSource: hook`, and the label rule in §3 reads it back verbatim. The runtime
prepends its own preamble to that prompt, so the token is matched anywhere in it, never only at the
start.

- **One token, nothing between it and `fleet worker`.** `<label> SPIKE fleet worker` does not match,
  and the session keeps the harness's generated title.
- **Do not rename a Claude Code worker whose prompt carried the token** at launch (after a resume
  the conductor does, §5), and do not pass a name flag on its launch line. A rename or `--name` marks the name as human-set, and the emitter then leaves it
  alone forever: the handle never gets appended, which is correct behaviour and not what you wanted.
- **Codex, OpenCode v2.2 and Pi have no hook that can set a name.** The conductor drives their TUI
  with the harness's rename verb (`/rename <label>--<handle>`; Pi `/name <label>--<handle>`) once the
  screen shows the worker ready (`references/coordinator-playbook.md` §1 step 5), then reads it back
  on the status bar.
- **OpenCode v1 (`/rename` opens a dialog and takes no argument), or any harness that cannot be
  renamed**: the roster maps name ↔ handle, the worker's `Session:` trailer carries the roster name,
  and the conductor says so once in the run report.
- **A worker never renames its own SESSION**: `/rename` is user input on every harness, not a command
  a model can run, so a brief that asks for it asks for nothing. A worker CAN rename its own TAB,
  because that is a CLI call, and it does so as its first action (§5).

The conductor reads the resulting name back off the screen rather than assuming it: the agent's
status bar carries the session label together with the model and the effort level, and
`terminal read --screen` is how you see it (gotcha G13 — the default read mode returns stacked
fragments of a repainting TUI). Grep it as a BARE token: that bar is drawn with non-breaking spaces,
so a pattern that includes a label plus a space never matches (gotcha G15).

---

## 3 · The label rule

One rule, applied in order, so two sessions never produce two different label formats:

| Case | Label |
|---|---|
| the user set the name explicitly (`nameSource == user`), or the identity hook set it from the fleet token (`nameSource == hook`) | the name, as-is |
| the name was derived or auto-generated | `<name> (<first 8 chars of the id>)` |
| only an id is available | the full id |
| nothing is resolvable | `unknown` |

A fleet worker's composed `<label>--<handle>` is a hook name (`nameSource == hook`, first row), so it
is the label as-is, handle included; a conductor-typed rename on Codex, OpenCode v2.2 or Pi is a
`user` name and lands in the same row.

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

- the TAB title is the worker name itself, `<label>--<handle>` (§2b), the same string as the session
  name. On the supervised path the runtime titles every worker tab `worker-<task id>` and that label
  outranks whatever the harness paints (G71), so the WORKER sets it first, as its first action:
  `orca terminal rename --terminal "$ORCA_TERMINAL_HANDLE" --title "<label>--$ORCA_TERMINAL_HANDLE" --json </dev/null`.
  The conductor re-issues the same rename, with the handle it read from `worker-list`
  (`agentTerminalHandle`, G78), in every liveness sweep: it lands only once the app window has
  opened the tab, and `terminal list` reads a different field, so it is confirmed on the tab itself
  (gotchas G71, G72). On the custom-argv path `terminal create --title` takes the label (the handle
  does not exist yet), and the rename follows once `terminal create` returns the handle. After a
  runtime restart every handle changes while the titles still carry the old one (gotcha G22): match
  a tab on its label, the part before the last `--term_`, write the new handle into the roster, and
  re-issue the rename with it. The harness SESSION name keeps the old handle, and a resumed session
  receives no fresh fleet-token prompt, so not even the Claude Code hook re-titles it: the conductor
  types the rename verb (`/rename <label>--<new handle>`; Pi `/name`) into each resumed worker once
  its screen is ready, on every harness Claude Code included, reads it back, and updates the roster's
  `Name` column; `Session:` trailers after the resume carry the new name
  (`references/coordinator-playbook.md` §5 step 6);
- the board card's display name is the work key plus a short title — or, in a same-checkout fleet,
  the fleet's own display name, because the card is per-worktree there;
- the board card's comment carries the recovery block: stage, session label, branch, and the absolute
  path of the brief. **In a same-checkout fleet the card cannot hold N of those**, so it points at
  the roster instead and the roster carries per-worker recovery
  (`references/coordinator-playbook.md` §3, gotcha G50).

The roster keeps the machine-readable side of the same facts (task, dispatch, terminal handle,
worktree, agent, model, name, resume command, status), and it is what the owner phrasebook
resolves "the one on BK-123" against. In a fleet of N workers in one checkout it is not a convenience:
it is the only recovery record there is.
