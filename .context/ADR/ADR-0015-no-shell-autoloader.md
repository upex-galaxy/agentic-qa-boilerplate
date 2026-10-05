# ADR-0015 — No shell autoloader: each process loads its own `.env`, nothing exports it into a shell

- **Status:** Accepted (by the owner, 2026-10-05)
- **Date:** 2026-10-05
- **Deciders:** framework owner (boilerplate maintainer): decision B8 of handoff 07 ("remove direnv from both repos; secrets never exported into the AI shell; MCPs keep loading `.env` per process; worktree provisioning keeps copying `.env`, drops `direnv allow`"), implemented by unit b8-q (PR #116). Recorded after the fact under decision B14 of the same handoff, so this repo has the decision its twin records as its own ADR-0015
- **Tags:** secrets, env, installer, doctor, worktree, updater
- **Supersedes:** —
- **Superseded by:** —

---

## Context

The repo shipped an `.envrc` that loaded `.env.local` on top of `.env` into the shell on `cd`. The installer offered `direnv allow`, the doctor reported direnv as a pending action, and `bun run worktree:provision` ran `direnv allow` in a new worktree.

After ADR-0011 nothing depended on it: every stdio MCP server starts through the filtered `.env` loader on all three hosts and reads the checkout's `.env` itself, the test scripts load it through `scripts/launch.ts`, and the Bun scripts through Bun's autoload. What the autoloader still did was put every secret in `.env` into every shell under the repo, including the shell the AI's tool calls run in, which is the exposure Critical Rule #1 exists to prevent. The one recipe that read shell-exported secrets was the `/acli` REST fallback.

## Decision

We ship no shell autoloader and recommend none. Each process loads its own config:

- `.envrc` is deleted; `.gitignore`, the deny lists and `.env.example` drop it.
- The installer has no direnv step (and no `INSTALL_SKIP_DIRENV`); the doctor has no direnv check and no `direnv` field in `--json`.
- `bun run worktree:provision` keeps copying `.env` and never runs `direnv allow`; `.envrc.local` is not provisioned.
- A command that needs a `.env` value runs as `bunx varlock run --filter <names> -- <cmd>`, which loads it for that process only. The `/acli` REST recipes and `jira-attach-media.ts` are rewritten that way.
- The updater never delivers, watches or deletes `.envrc`: a downstream copy is its developer's file and gets one informational parity row saying it can be removed.

## Consequences

- **Positive:** no secret reaches a shell the AI uses unless a single command asks for it; the doctor and the installer lose an optional tool; provisioning does one thing fewer.
- **Negative / trade-offs:** a value a developer used to read from the shell (`echo`, an ad-hoc `curl`) now needs `bunx varlock run --` around that command. Opening a harness needs no `.env` in its shell at all (ADR-0014).
- **Neutral / follow-ups:** a project scaffolded earlier keeps its `.envrc` until its developer deletes it; nothing in the repo reads it.
