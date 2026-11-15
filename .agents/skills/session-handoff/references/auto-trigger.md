# Can a handoff trigger itself?

Verified 2026-09-18 against Claude Code 2.1.276 and OpenCode 1.18.30 through official documentation and upstream source. <!-- volatile-ok: dated research verdict by design; the date and versions are what a reader needs to decide whether to re-verify --> Codex CLI was not installed on the verifying machine, so its findings come from upstream source only.

## Verdict: partially feasible, and manual stays the primary trigger

No harness hands the current context size to the agent. Two of the three expose it somewhere outside the model loop, so an automatic trigger is buildable, but it is new wiring and not a field waiting to be read. The hook adapters (`.agents/hooks/`) do not tap these mechanisms; check before assuming they do.

The owner prefers manual (*"I'd rather the human do it manually"*). Read everything below as the answer to "could we", not as a plan.

## What each harness exposes

| Harness | Mechanism | Context size? | Compaction-imminent? |
|---|---|---|---|
| Claude Code | `UserPromptSubmit` hook input | no | n/a |
| Claude Code | `PreCompact` hook input | no | yes, with a `trigger` field distinguishing manual from auto |
| Claude Code | `SessionStart` hook, resumed session | a raw `context_tokens` count, resumed-after-a-gap only | n/a |
| Claude Code | status line stdin JSON | yes: `context_window.used_percentage`, `remaining_percentage`, `context_window_size`, `total_input_tokens` | no |
| OpenCode | `experimental.chat.system.transform` plugin hook | no, input is `{ sessionID, model }` | no |
| OpenCode | `experimental.session.compacting` plugin hook | no | yes |
| OpenCode | `event` plugin hook on `message.part.updated` | yes, indirectly: a `step-finish` part carries `tokens.input` / `tokens.output`, accumulable for free | no |
| Codex CLI | `UserPromptSubmit` hook input | no | n/a |
| Codex CLI | `PreCompact` / `PostCompact` hook events | no, and the hook output wire carries only universal fields | yes |
| Pi | extension `ctx.getContextUsage()`, read from any event | yes | `session_before_compact`, `session_compact` events |

Sources: `https://code.claude.com/docs/en/hooks`, `https://code.claude.com/docs/en/statusline`, the OpenCode plugin and session schema packages, and the Codex `hooks` and `protocol` crates.

## The best available mechanism per harness, if it is ever built

Claude Code: the status line is the only documented surface that carries a live percentage, and it is cheap, since the harness re-renders it on its own cadence with no model call. A status-line command could read `context_window.used_percentage` and drop a flag file that a later `UserPromptSubmit` hook notices. Check `.claude/settings.json` for a `statusLine` before building on this.

OpenCode: subscribe a plugin to `message.part.updated` and accumulate `tokens.input` / `tokens.output` from every `step-finish` part, at no extra cost. `.opencode/plugins/personality-reinject.js` shows what the adapter implements; this would be a second hook.

Codex CLI: nothing exposes a live figure. The only usable signal is `PreCompact` itself, which arrives with no number and, by then, a full window.

## Why the compaction hooks are the weaker answer

Every harness exposes a compaction-imminent event, and it is tempting to use it as the trigger. It fires when the window is already exhausted, so a handoff written from there comes from a session about to be truncated, using the degraded judgement the handoff exists to escape. The threshold that matters is the one the owner named (about 500k), and it arrives long before compaction does.

## If an automatic mode is ever enabled

It asks once, in two lines, and accepts a refusal without asking again that session. With nobody to answer (a worker or routine), it asks nothing and writes nothing. It never writes a handoff unprompted: the file costs context to produce, and its timing is a judgement about the work that the human holds and a flag file does not.
