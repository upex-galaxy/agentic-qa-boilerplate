# ADR-0014 — A harness opens bare; the `claude` / `codex` / `opencode` launch scripts are retired, and the credential proxy is cancelled

- **Status:** Accepted (by the owner, 2026-10-05)
- **Date:** 2026-10-05
- **Deciders:** framework owner (boilerplate maintainer): decision B13 of handoff 07 ("retire the harness launcher scripts in both repos; opening a harness needs no script at all"), and B3 recorded there as cancelled, superseded by B8 + B13 (`.session/decisions/handoff07-2026-10-05.json`). Implemented by unit b13-q (this PR)
- **Tags:** secrets, harness, varlock, launcher, updater
- **Supersedes:** —
- **Superseded by:** —

---

## Context

Until now `bun run claude|codex|opencode` started a harness through `scripts/launch.ts`: a preflight, then `varlock run -- <harness>`. That put every `.env` item into the harness process, and from there into every command the AI runs. Measured on a QA fleet worker (unit b8-q): an installer run inside the worker session saw a Slack token it had never been given.

The wrapper had two jobs, and both are now done elsewhere:

- **Credentials for MCP servers.** Since ADR-0011 every MCP server that needs `.env` values starts through its own filtered loader in `.mcp.json`, `opencode.jsonc` and `.codex/config.toml`, and reads `.env` at spawn time however the harness was opened. A desktop app or a natively launched supervised worker already worked with no wrapper.
- **The stale-variable preflight.** It refused a harness launch while an inherited variable differed from `.env.local` over `.env`, because varlock lets the inherited value win. The usual source of such values, direnv exporting `.env` into every shell, was retired (QA #116), and the wrapper itself was the other one.

The credential proxy (B3, spike Q-U5) planned to wrap the same launch so the AI would never hold a raw secret. It needs a launcher on every path, and desktop apps have none. With no secret in the AI's shell at all it has nothing left to protect.

## Decision

1. **A harness opens bare**: `claude`, `opencode`, `codex` in the repo folder, or the desktop app. `package.json` drops the three scripts; README, INSTALLER, `.env.example`, the docs pages, the decks, the installer and doctor messages, the scaffolder's next steps and the orchestration launch lines name the bare binary.
2. **`scripts/launch.ts` serves test and tooling scripts only.** It refuses `claude`, `codex` and `opencode` (by name or path, exit 2, with the remedy), so a downstream script that still calls it fails loudly instead of exporting `.env`. Its drift check now only warns, then runs; `--warn` is accepted and changes nothing, so the `test*` script lines stay byte-identical and downstream sees no drift on them.
3. **The stale-variable concern moves to `bun run vars:env:check`** (Rule 3, the same `cli/lib/env-drift.ts` comparison), plus the test launcher's warning. What remains is a variable the human exported in their own shell profile: it still wins for anything started from that shell, MCP servers included, and the check names it.
4. **The updater never re-adds the scripts and never deletes them.** Its `package.json` sync only appends keys upstream has, so a removed key cannot return. A downstream `claude` / `codex` / `opencode` script that loads `.env` (every shape upstream ever shipped) gets one informational parity row naming it as removable (`RETIRED_HARNESS_SCRIPTS` in `cli/lib/updater-parity.ts`); the file is left alone.
5. **Never start a harness inside a loader** is a secret-hygiene rule (`agentic-qa-core/references/secret-hygiene.md` §3) and a harness gotcha (`agent-harnesses.md`), bound to Critical Rule #1.
6. **B3, the credential proxy, is cancelled** as superseded by B8 (direnv removal) and this decision.

## Consequences

- **Positive:** no repo path puts a `.env` value into the AI's process; terminal, desktop and supervised launches share one credential path; one wrapper less to explain, test and keep in sync across three harnesses.
- **Negative / trade-offs:** a stale variable exported in the human's shell is no longer refused at harness start; it is reported by `bun run vars:env:check` and, at test time, by the launcher's warning. A command that needs a value outside an MCP or a repo script (a raw `curl`) always runs inside the per-command loader (`bunx varlock run --filter ... -- sh -c '...'`), since the harness never carries one.
- **Neutral / follow-ups:** a downstream project keeps its old script until it deletes it; running it now fails with the remedy. agentic-dev retires its launcher under the same decision in its own repo.

## Alternatives considered

- **Keep the scripts as an opt-in** — keeps the exposure for whoever uses them, and the owner's call was that launching through them should not be possible.
- **Keep the refuse-mode preflight in a harness-only launcher that does not export values** — a launcher that loads nothing has nothing to check against at the moment that matters (MCP spawn), and desktop launches would still skip it.
- **Strip `--warn` from the 13 test script lines** — no behaviour change, and every downstream project would get 13 `package.json` drift prompts.
- **Have the updater delete the downstream scripts** — the updater never deletes a project's own `package.json` key; a project may have wrapped other behaviour in them.

## References

- `.session/decisions/handoff07-2026-10-05.json` (B3, B13).
- ADR-0003 (varlock owns the env schema), ADR-0010 (secret manager), ADR-0011 (the MCP `.env` loader).
- `scripts/launch.ts`, `scripts/launch.test.ts`, `cli/lib/updater-parity.ts`, `cli/lib/env-drift.ts`, `scripts/check-vars.ts`.
