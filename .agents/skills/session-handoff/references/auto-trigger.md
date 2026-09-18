# Can a handoff trigger itself?

Verified 2026-09-18 against Claude Code 2.1.276 and OpenCode 1.18.30 via official documentation and upstream source. Codex CLI was not installed on the verifying machine, so its findings come from upstream source only and are labelled accordingly.

## Verdict: PARTIALLY FEASIBLE, and manual stays the primary trigger

No harness hands the current context size to the agent. Two of the three expose it somewhere OUTSIDE the model loop, which means an automatic trigger is buildable but is **new wiring, not a field waiting to be read**. None of the repo's three hook adapters taps any of these mechanisms today.

The owner's position, recorded: manual is preferred (*"prefiero que el humano lo haga de manera manual"*). Treat everything below as the answer to "could we", not as a plan.

## What each harness exposes

| Harness | Mechanism | Context size? | Compaction-imminent? |
|---|---|---|---|
| Claude Code | `UserPromptSubmit` hook input | no | n/a |
| Claude Code | `PreCompact` hook input | no | **yes**, with a `trigger` field distinguishing manual from auto |
| Claude Code | `SessionStart` hook, resumed session | a raw `context_tokens` count, resumed-after-a-gap only | n/a |
| Claude Code | status line stdin JSON | **yes**: `context_window.used_percentage`, `remaining_percentage`, `context_window_size`, `total_input_tokens` | no |
| OpenCode | `experimental.chat.system.transform` plugin hook | no, input is `{ sessionID, model }` | no |
| OpenCode | `experimental.session.compacting` plugin hook | no | **yes** |
| OpenCode | `event` plugin hook on `message.part.updated` | **yes, indirectly**: a `step-finish` part carries `tokens.input` / `tokens.output`, accumulable for free | no |
| Codex CLI | `UserPromptSubmit` hook input | no | n/a |
| Codex CLI | `PreCompact` / `PostCompact` hook events | no, and the hook output wire carries only universal fields | **yes** |

Sources: `https://code.claude.com/docs/en/hooks`, `https://code.claude.com/docs/en/statusline`, the OpenCode plugin and session schema packages, and the Codex `hooks` and `protocol` crates.

## The best available mechanism per harness, if it is ever built

**Claude Code.** The status line is the only documented surface carrying a live percentage, and it is cheap: the harness re-renders it on its own cadence with no model call. A status-line command could read `context_window.used_percentage` and, beyond printing, drop a flag file that a later `UserPromptSubmit` hook notices. This repo configures no status line today.

**OpenCode.** Subscribe a plugin to `message.part.updated` and accumulate `tokens.input` / `tokens.output` off every `step-finish` part, at no extra cost. This repo's OpenCode adapter implements only the system transform, so this is a second hook.

**Codex CLI.** Nothing exposes a live figure. The only usable signal is `PreCompact` itself, which arrives with no number attached and, by then, the window is already full.

## Why the compaction hooks are the weaker answer

All three harnesses expose a compaction-imminent event, and it is tempting to treat that as the trigger. It is the wrong moment. Compaction fires when the window is already exhausted, so a handoff written from there is written by a session about to be truncated, using the degraded judgement the handoff exists to escape. The threshold that matters is the one the owner named (~500k), and it arrives long before compaction does.

## If an automatic mode is ever enabled

It asks once, in two lines, and accepts a refusal without asking again that session. It never writes a handoff unprompted: the file costs context to produce and its timing is a judgement call about the work, which the human is holding and the flag file is not.
