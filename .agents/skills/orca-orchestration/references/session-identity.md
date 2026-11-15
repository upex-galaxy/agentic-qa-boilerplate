# Session Identity: Who Made This Commit, Three Weeks Later

> Loaded by the conductor (it fills the roster and the board card) and by anyone debugging a commit
> whose author is "the machine".
> A fleet produces commits from six sessions in two checkouts, and a week later the roster is gone
> and the board card is archived, so the answer has to be in the commit.
> Rows marked (unverified) were reported by research but not confirmed by running the command:
> confirm before building on them.

---

## 1 · The two values

```
Worktree: <worktree name | primary>
Session: <session label>
```

- `Worktree` comes from the runtime's own worktree environment variable, whose value has the shape
  `<repoId>::<path>`: take the path after `::` and use its basename. With no such variable in the
  environment, write `primary`.
- `Session` is the session label, resolved by the rule in §3.

Both keys are harness-agnostic on purpose. A harness-branded trailer key names the tool instead of
the work, goes stale when the tool changes, and reads as attribution. These two are forensics: they
answer "which of the six" and nothing else. No AI attribution of any kind is allowed
(Critical Rule #3), and no harness-branded trailer either. `/git-flow-master` owns the trailer rule;
this file only says where the values come from.

---

## 2 · Per-harness table

| Axis | Claude Code | OpenCode | Codex CLI | Pi (ADR-0026) |
|---|---|---|---|---|
| id from inside a shell | `CLAUDE_CODE_SESSION_ID`, `CLAUDE_PID` | no env var (only a terminal marker) | no confirmed env var; resolve from disk | `PI_SESSION_ID`, `PI_SESSION_FILE` in its shell tools; the extension process has neither |
| id via a hook | stdin JSON `session_id`, on every event | plugin context exposes the session id | **(unverified)** | extension: `ctx.sessionManager.getSessionId()` |
| id from disk | `~/.claude/sessions/<PID>.json` → `.sessionId` | the local app data store; `opencode session list` | `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl` (respects `CODEX_HOME`) | session JSONL under `~/.pi/agent/sessions/` |
| name at launch | `-n, --name <name>` | none in the TUI (`opencode run --title` only; `--prompt`, `--model`, `--agent`, `--auto`, `-s`, `-c`, `--fork` exist) | none (rust-v0.165.0) | `-n, --name <name>` (v1.4.0) |
| rename in session | `/rename <name>` (≤200 chars); **queued while the session is busy** | v1.19.5: `/rename` opens a dialog and takes no argument; v2.2.0: `/rename <name>` inline. Also `PATCH /session/:id {title}` on the TUI's server, only when it was launched with a fixed `--port` (that port then also accepts prompts). **Not** a `session rename` subcommand | `/rename <name>`, accepted mid-task (rust-v0.165.0) | `/name <name>`; an extension calls `pi.setSessionName()` |
| rename from another process | only by typing `/rename` into the TUI; the identity hook sets the name itself (§2b) | typing into the TUI, or the `--port` REST route above | typing into the TUI; the app-server `thread/name/set` needs an experimental `--remote` TUI, so it is not usable | typing `/name` into the TUI; the adapter sets the name itself (§2b) |
| name from disk | `~/.claude/sessions/<PID>.json` → `.name` + `.nameSource` (`user` \| `derived` \| `hook`) | `opencode session list`, Title column (auto-generated from the first message) | `$CODEX_HOME/session_index.jsonl` → `{id, thread_name, updated_at}` | `session_info` entry (`name`) in the session JSONL |
| resume by id | `claude -r <id>`, `--session-id <uuid>`, `--fork-session` | `opencode -s <id>`, `-c`, `--fork` | `codex resume <id>`, `--last` | `pi --session <path\|id>`, `--session-id <id>`, `-c`, `-r`, `--fork <path\|id>` |
| resume by name | `claude --resume <term>` opens a filtered picker; direct resolution **(unverified)** | not supported | first class: `codex resume <name-or-id>` | `pi -r` opens a picker; direct resolution **(unverified)** |
| transcripts | `~/.claude/projects/<slug>/<uuid>.jsonl` | `opencode export [id]` | under `$CODEX_HOME/sessions/` | `~/.pi/agent/sessions/`, one JSONL per session; `pi --export <file>` |

Versions are the ones the research read (2026-10-28): Codex CLI rust-v0.165.0, OpenCode v1.19.5 and <!-- volatile-ok: harness flags carry the version they were read at -->
v2.2.0; Pi v1.4.0 and v1.5.0 were read and measured 2026-11-04. Harness flags move, so confirm the launch line against `<harness> <!-- volatile-ok: harness flags carry the version they were read at -->
--help` on the machine.

Claude Code flags this skill relies on (confirm with `claude --help` before writing a launch line): `-n, --name`, `--model`,
`--effort` (`low`, `medium`, `high`, `xhigh`, `max`), `--permission-mode` (`acceptEdits`, `auto`,
`bypassPermissions`, `manual`, `dontAsk`, `plan`), `--dangerously-skip-permissions` (the same as
`--permission-mode bypassPermissions`), `-r, --resume`, `--session-id`, `--fork-session`. Which
permission mode a tier gets, per harness: `references/orca-machine-setup.md` §3.1.
The two flags differ in one way worth remembering: the permission-mode flag rejects an invalid
value, while the effort flag does not. An invalid effort starts the session on the default and tells
nobody (gotcha G28).

OpenCode flags this skill relies on (confirm with `opencode --help`): `-m, --model`, `-c, --continue`, `-s, --session`,
`--fork`, `--prompt`, `--agent`, `--auto` (auto-approve permissions not explicitly denied), `--mini`.
There is no name flag and no effort flag, so the conductor names an OpenCode worker, never the worker
itself: on v2.2 the conductor types `/rename <name>` into it once it is ready, and on v1 `/rename`
opens a dialog with no argument, so the roster carries the name instead (§2b).

On Claude Code and Pi a hook both reads and writes the session name. On Pi it is the extension,
through `pi.getSessionName()` and `pi.setSessionName()`. On Claude Code a hook receives the current
title and can emit a title field to set it. The hook emitter (`.agents/hooks/personality-reinject.mjs`)
owns the exact field name and the events that honour it, and verifies them against the official docs
before emitting anything. This file does not restate them, so that one place can be wrong and no
other.

### 2b · On the supervised path the name comes from the prompt

The `name at launch` row above applies to a pasted launch line, not to a supervised worker: the
native launch starts the agent itself and takes an agent, a model and an effort level, never a
command line, so there is no name flag to pass (`references/coordinator-playbook.md` §1b).

The worker name is `<label>--<handle>`, one string everywhere: the harness session name, the Orca
tab title (§5), the roster's `Name` column and the `Session:` commit trailer. A worker started
without the name, with Orca's default tab title and a harness-generated session title, is the failure
this section exists to prevent (G84). `<label>` is `[<KEY>-]<slug>`, kebab-case with single hyphens
inside and a slug of 3 or 4 words (`TK-123-add-google-auth`, or a bare kebab slug such as
`volatile-impl` for work with no ticket; a `/sprint-testing` worker uses the bare issue key, because
that skill reads the issue it owns from the token). The `--` appears only once, before the Orca
terminal handle (`term_<uuid>`), so parse a name back by splitting on the last `--term_`. Example:
`TK-123-add-google-auth--term_7235f5a5-0fce-495c-9474-7c4370fdefa6`. In this file `<label>` is that
roster label, and the session label of §3 (the trailer value) is the whole name.

The replacement for the name flag is the prompt's fixed opening. A worker's first prompt begins with
`/<skill> <label> fleet worker`. On Claude Code the hook emitter composes the session name
`<label>--<handle>` from that token plus `ORCA_TERMINAL_HANDLE`, which is present in a dispatched
worker's own environment (gotcha G56); with no handle in the environment (a line pasted outside
Orca) the name is the label alone. It does so while no human has named the session. Claude Code
records the name with `nameSource: hook`, and the label rule in §3 reads it back verbatim. The
runtime prepends its own preamble to that prompt, so the token is matched at the start of the task
text: after the last `=== TASK ===` marker when the prompt has one, else at the prompt's start. A
prompt that quotes the token mid-sentence, or carries it inside a harness block (a system reminder, a
subagent hand-back), neither launches the session nor names it.

- Put nothing between the label and `fleet worker`. `<label> SPIKE fleet worker` does not match,
  and the session keeps the harness's generated title.
- Do not rename a Claude Code worker whose prompt carried the token, and do not pass a name flag on
  its launch line (after a resume the conductor does rename it, §5). A rename or `--name` marks the
  name as human-set, and the emitter then leaves it alone forever: the handle never gets appended,
  which is correct behaviour and not what you wanted.
- Pi names itself the same way. The adapter (`.pi/extensions/agentic-qa.js`) composes the same name
  from the same token and leaves alone a name it did not set (`/name`, `--name`). Do not rename a Pi
  worker whose prompt carried the token, and do not pass `-n` on its launch line. After a resume it
  needs the rename verb too (`/name <label>--<new handle>`, §5).
- Codex and OpenCode v2.2 have no hook that can set a name. The conductor drives their TUI with the
  harness's rename verb (`/rename <label>--<handle>`) once the screen shows the worker ready
  (`references/coordinator-playbook.md` §1 step 5), then reads it back on the status bar.
- On OpenCode v1 (`/rename` opens a dialog and takes no argument), or any harness that cannot be
  renamed, the roster maps name to handle, the worker's `Session:` trailer carries the roster name,
  and the conductor says so once in the run report.
- A worker never renames its own session. `/rename` is user input on every harness, not a command a
  model can run, so a brief that asks for it asks for nothing. A worker can rename its own tab,
  because that is a CLI call, and it does so as its first action (§5).

The conductor reads the resulting name back off the screen rather than assuming it, as part of
verifying readiness: the agent's status bar carries the session label together with the model and the
effort level, and `terminal read --screen` shows it (gotcha G13: the default read mode returns
stacked fragments of a repainting TUI). Grep it as a bare token, because that bar is drawn with
non-breaking spaces and a pattern that includes a label plus a space never matches (gotcha G15). A
status bar that shows a generated title, or a tab that still reads `worker-<task id>`, means the
naming step failed: fix it before any work is sent.

---

## 3 · The label rule

One rule, applied in order, so two sessions never produce two label formats:

| Case | Label |
|---|---|
| the user set the name explicitly (`nameSource == user`), or the identity hook set it from the fleet token (`nameSource == hook`) | the name, as-is |
| the name was derived or auto-generated | `<name> (<first 8 chars of the id>)` |
| only an id is available | the full id |
| nothing is resolvable | `unknown` |

A fleet worker's composed `<label>--<handle>` is a hook name (`nameSource == hook`, first row), so it
is the label as-is, handle included. A conductor-typed rename on Codex, OpenCode v2.2 or Pi is a
`user` name and lands in the same row.

The name beats the id because the name persists and the id does not. Resuming a session can mint a
new id (a fork certainly does), while the name survives across resumes and is what appears in the
resume picker, in the terminal title and on the board card. The 8-char suffix on a derived name
exists because derived names collide ("Fix the login test" twice in one wave).

The trailer says `unknown` rather than being omitted because an absent trailer is indistinguishable
from an old commit, while `unknown` states that the resolver ran and came back empty. That is what a
forensic field is for.

---

## 4 · Where it is injected

This repo has one hook emitter and one adapter per harness. The emitter resolves identity once per
prompt and injects a single line into the session's context:

```
AGENT IDENTITY: worktree=<name|primary> session=<label> harness=<claude-code|codex|opencode|pi>
```

When the binary gate passes, a second line names this skill and the worker's channel. When the gate
fails, nothing at all is injected (silence, hard rule 10).

For anyone reading a commit or writing one:

- A session does not re-derive its identity: it reads that line. Re-deriving per commit is how two
  commits from one session end up with two different labels.
- The name can change mid-session (a rename, an auto-title landing late). The trailer records the
  label as it was at commit time, and that is correct: it is forensics, not a primary key.
- A worker in a fresh worktree has the hook, because the hook is committed. It does not have the
  environment file or the skills alias (`references/provisioning.md`).

The emitter and its adapters live in `.agents/hooks/` plus the per-harness adapters, and the
compatibility contract (`cli/lib/agent-compatibility-contracts.ts`) keeps them in sync. Do not write
a second emitter, and do not hand-edit an adapter's generated counterpart.

---

## 5 · Board card, terminal title and the crash case

The case this section covers is a machine crash: the session is gone and the Orca tab survives.
Whatever was only in the conductor's head is lost, and whatever is in the card is recoverable. So at
every launch and every stage boundary:

- The tab title is the worker name itself, `<label>--<handle>` (§2b), the same string as the session
  name. On the supervised path the runtime titles every worker tab `worker-<task id>` and that label
  outranks whatever the harness paints (G71), so the worker sets the title first, as its first
  action:
  `orca terminal rename --terminal "$ORCA_TERMINAL_HANDLE" --title "<label>--$ORCA_TERMINAL_HANDLE" --json </dev/null`.
  Right after the worker starts, the conductor issues the same rename with the handle it read from
  `worker-list` (`agentTerminalHandle`, G78), and again in every liveness sweep. A rename lands only
  once the app window has opened the tab, and `terminal list` reads a different field, so the
  conductor confirms the title on the tab itself (gotchas G71, G72, G82). On the custom-argv path
  `terminal create --title` takes the label (the handle does not exist yet), and the rename follows
  once `terminal create` returns the handle.
  After a runtime restart every handle changes while the titles still carry the old one (gotcha
  G22). Match a tab on its label, the part before the last `--term_`, write the new handle into the
  roster, and re-issue the rename with it. The harness session name keeps the old handle, and a
  resumed session receives no fresh fleet-token prompt, so not even the Claude Code hook re-titles
  it. The conductor types the rename verb (`/rename <label>--<new handle>`; Pi `/name`) into each
  resumed worker once its screen is ready, on every harness Claude Code included, reads it back, and
  updates the roster's `Name` column; `Session:` trailers after the resume carry the new name
  (`references/coordinator-playbook.md` §5 step 6).
- The board card's display name is the work key plus a short title. In a same-checkout fleet it is
  the fleet's own display name, because the card is per-worktree there.
- The board card's comment carries the recovery block: stage, session label, branch, and the absolute
  path of the brief. In a same-checkout fleet the card cannot hold N of those, so it points at the
  roster and the roster carries per-worker recovery (`references/coordinator-playbook.md` §3,
  gotcha G50).

The roster keeps the machine-readable side of the same facts (task, dispatch, terminal handle,
worktree, agent, model, name, resume command, status), and it is what the owner phrasebook resolves
"the one on BK-123" against. In a fleet of N workers in one checkout it is the only recovery record
there is.
