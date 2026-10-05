# ADR-0011 — Every MCP server reads `.env` through one filtered varlock loader; the plaintext harness copies are retired

- **Status:** Accepted (by the owner, 2026-10-05)
- **Date:** 2026-10-05
- **Deciders:** framework owner (boilerplate maintainer): the env-secrets spike plan, unit Q-U4 "MCP hardening", approved with the owner decisions of 2026-10-05 (`.session/decisions/env-secrets-2026-10-05.json`); the conductor's shared launch design for the secrets wave (loader = `bunx -p varlock@<pin> varlock run --no-redact-stdout`). Implemented by Q-U4 (this PR)
- **Tags:** secrets, mcp, varlock, harness, worktrees
- **Supersedes:** —
- **Superseded by:** —

---

## Context

A harness reads its MCP config and spawns its servers before any hook runs, with whatever environment the harness process has. A terminal launch through `bun run claude|codex|opencode` carries the `.env` values; a desktop app (Claude Desktop, Codex Desktop, OpenCode desktop) or a natively launched supervised worker carries none, and there is no command line to wrap. Until now each host solved that differently:

- **Claude Code**: `.mcp.json` named `${VAR}`, and `bun run harness:env` copied each value into the `env` block of `.claude/settings.local.json` (the MAIN checkout's file, shared by every worktree).
- **OpenCode**: `opencode.jsonc` named `{file:.auth/opencode/VAR}`, and the same generator wrote one plaintext value file per variable.
- **Codex**: every stdio server started through an unfiltered loader (`varlock run -- <server>`, ADR-0006 row) that handed it the WHOLE `.env`, with `env_vars` naming what it needed.

Two of those were plaintext copies of every MCP secret on disk, readable by any agent and not covered by "never read `.env`" (spike findings X9, X10). The third gave each server every credential in the file. The spike (`.session/spikes/env-secrets/plan.md` §6, §7 Q-U4, §8 R3) proposed one per-server loader on all three hosts instead.

Measured before deciding (varlock 1.20.0, scratch schema, throwaway values; ADR-0006 ledger row "`MCP_ENV_LOADER_*`"): `varlock run --filter A,B` injects only those items and strips an inherited schema key outside the list; validation is scoped to the filter; `--inject vars` leaves no `__VARLOCK_ENV` blob; an EMPTY inherited value shadows `.env` and fails validation; the filter holds under an outer `varlock run`; stdio stays byte-intact with `--no-redact-stdout`. With no credential in the environment, Claude Code, OpenCode and the dbhub child all received their values through the loader, and the same servers without it exited before the handshake.

## Decision

1. **One loader, every host.** Each MCP stdio server that needs `.env` values launches as `bunx -p varlock@<pin> varlock run --no-redact-stdout --inject vars --filter <its vars> -- <server>` in `.mcp.json`, `opencode.jsonc` and `.codex/config.toml` (`MCP_ENV_LOADER_*`, `mcpEnvLoaderArgs()` in `cli/lib/agent-compatibility-contracts.ts`). A server with no `.env` value (context7) launches bare. The pin tracks the `varlock` devDependency, so no standalone binary is needed.
2. **The filter is the contract.** It lists exact variable names, and it IS the server's `.env` dependency set: `agents:compat:check` compares it across the three hosts like any `${VAR}`. A loader-launched server takes nothing from the host (`${VAR}`, `{env:}`, `{file:}`, `env_vars`): an unset `${VAR}` breaks a desktop launch and an empty one shadows `.env`. Both rules, and "a stdio server that needs `.env` values launches through the loader", are errors in the boilerplate and warnings downstream, where the three configs are protected or bootstrap-only and only a hand edit can deliver the change; the warning names the exact launch.
3. **The copies are retired, never silently.** `bun run harness:env` stops generating and becomes the migration: a copy equal to `.env` is deleted, a copy `.env` does not reproduce is moved to `.auth/harness-env-backup/<VAR>` (0600) and named, and a copy a legacy host config still reads stays until that config changes. The command is KEPT rather than retired with an updater deprecation row: `prepare` and downstream projects still call it, and a downstream config on the old shape still needs its `{file:}` placeholders on `bun install`. `bun run setup:doctor` reports any copy left; `bun run setup` retires them in its last step; `bun run worktree:provision` never copies the backup, and copies `.auth/opencode/` only for a config that still points at it.

## Consequences

- **Positive:** no MCP credential exists on disk outside `.env` (or the secret manager); a desktop or natively launched harness gets its values with nothing generated; each server sees only its own variables, and a missing value for one server no longer stops another; a change to `.env` reaches the servers on the next session start with no regeneration step.
- **Negative / trade-offs:** every server spawn pays a varlock resolution (and, with the 1Password provider on desktop-app auth, may wait on an unlock prompt inside the host's MCP startup budget: unlock first; `cacheTtl` on `@initOp` is the documented relief). The loader needs `bunx` on the PATH the host gives the server, as the bare `bunx` launch already did. A Claude Code worktree session still reads the MAIN checkout's `settings.local.json`; its env block is kept by the retirement until the main checkout's own `.mcp.json` is on the loader. A downstream project stays on the old shape, with its copies, until it edits its configs.
- **Neutral / follow-ups:** the credential proxy (spike Q-U5) can wrap the same launch later. agentic-dev receives the loader when it adopts varlock.

## Alternatives considered

- **Keep generating the copies** — works for every launch, but it is two plaintext copies of every MCP secret the AI can read, which is the exposure this wave exists to close.
- **Retire `harness:env` with an updater deprecation row** — breaks `bun install` (the `prepare` line) and leaves downstream projects on the old shape with no generator and no migration.
- **One unfiltered loader everywhere** (the previous Codex shape) — every server receives every credential, and one invalid value anywhere stops all of them.
- **The standalone `varlock` binary as the server command** — one more machine prerequisite, and a GUI host's PATH rarely holds it; `bunx -p` needs only bun.

## References

- `.session/spikes/env-secrets/plan.md` §3 (X9, X10), §6, §7 row "Q-U4 MCP hardening", §8 R3/R4.
- ADR-0003 (varlock owns the env schema), ADR-0006 (measurements ledger), ADR-0010 (secret manager as the advanced option).
- varlock.dev/guides/ai-tools/claude (MCP wrapping), varlock.dev/reference/cli/load-and-run.
- `cli/lib/agent-compatibility-contracts.ts`, `cli/lib/harness-env.ts`, `scripts/harness-env.ts`, `scripts/provision-worktree.ts`.
