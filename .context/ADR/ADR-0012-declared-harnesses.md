# ADR-0012 — A project declares the harnesses it uses; the gates check only those, the boilerplate checks all three

- **Status:** Accepted (by the owner, 2026-10-05)
- **Date:** 2026-10-05
- **Deciders:** framework owner (boilerplate maintainer): decision B4 of handoff 07, with its three sub-answers (`.session/decisions/handoff07-2026-10-05.json`), approved on the measured spike "one-harness downstream" of 2026-10-05. Implemented by unit b4-q (this PR)
- **Tags:** harness, compatibility, installer, updater, doctor
- **Supersedes:** —
- **Superseded by:** —

---

## Context

The boilerplate ships one instruction body and one skill tree for three harnesses (Claude Code, OpenCode, Codex), plus a thin adapter per harness: its MCP registry (`.mcp.json`, `opencode.jsonc`, `.codex/config.toml`) and its hook wiring (`.claude/settings.json`, `.opencode/plugins/personality-reinject.js`, `.codex/hooks.json`). Every gate checked the three of them unconditionally.

A downstream team that runs on one harness deletes the other two's files. Measured on a Claude-only fixture of this repo (the five OpenCode and Codex files deleted): `agents:compat:check` failed (the MCP parity read threw `ENOENT`, reported under the wrong group), `types:check` failed on every commit (a test imported the OpenCode plugin statically), `setup:doctor` exited 1 and advised `git restore opencode.jsonc`, the installer threw in `repairRepositoryCompatibility`, and `bun run up` re-delivered the deleted files. The only way through was `--no-verify` or restoring files nobody uses.

## Decision

We will read which harnesses a project uses from one place, `declaredHarnesses(root)` in `cli/lib/harness-selection.ts`, and every compatibility gate checks only those:

- **Source of the answer.** The top-level `harnesses:` list in `.agents/project.yaml` (any of `claude`, `opencode`, `codex`) wins. Absent or `null`: detect from the files present, where a harness is in use while ANY of its files exists, so deleting one file of a harness still fails its contract and only deleting all of them retires it. Nothing found: all three.
- **The boilerplate always checks all three** (`isSchemaOwner(package.json)`), whatever its yaml says, and its own maintainer copy declares all three too. A deleted OpenCode or Codex file in the template still fails.
- **Contracts per harness.** MCP parity compares the configs of the harnesses in use; the canonical server set is Claude's `.mcp.json` while Claude is in use, otherwise the first declared harness's file. Hook adapter, route re-arm and the Codex 32 KB `AGENTS.md` cap bind only their own harness. The `CLAUDE.md` shim and the `.claude/skills` alias are required only with Claude. Each skipped harness prints one note (`codex: none of its files present, skipped`). A missing or unreadable MCP config of a harness in use is reported under the MCP group.
- **Doctor.** Rows and pending actions only for the harnesses in use; others read `not used`, and no action advises restoring their files.
- **Installer.** The agent selection is written to `harnesses:` as a union with what is already declared (it never shrinks the list; dropping a harness is an edit to the yaml). It then OFFERS to delete the files of every harness left out, default keep. Its compatibility repair no longer throws on a harness the project does not use.
- **Updater.** The files of a harness not in use are neither delivered, watched nor reported (`repoOnlyPaths` + the watchlist filter), the `.claude/settings.json` permission merge runs only with Claude and the OpenCode deny-gap row only with OpenCode.
- **Tests** that read the OpenCode plugin or the Codex files skip when the checkout lacks them; the plugin is imported dynamically.

## Consequences

- **Positive:** a one-harness project passes pre-commit, pre-push, `repo:check`, `setup:doctor`, the installer and CI without keeping files it does not use, and `bun run up` stops putting them back.
- **Negative / trade-offs:** a gate now depends on a yaml value or on detection, so a project can silence a harness by declaring it away. That is the intent, and the boilerplate is immune by `isSchemaOwner`. A repo made with GitHub "Use this template" keeps the boilerplate's `package.json` name, so it stays in boilerplate mode (all three) until it renames its package.
- **Neutral / follow-ups:** the dev boilerplate needs the same change (port notes in the implementation report). The shipped schema carries `harnesses: null`, so a fresh project detects until `bun run setup` records its selection.

## Alternatives considered

- **Detection only, no yaml key.** Rejected: a project that keeps a file it does not use (a teammate's `.claude/settings.json`) would be checked for that harness forever, and nothing records the team's choice.
- **Explicit key required.** Rejected (owner answer Q1): every existing project would fail the day it updates, before it had any reason to declare anything.
- **Downgrade every per-harness finding to a warning downstream.** Rejected: a half-deleted harness (one file gone, the rest present) is real drift and must keep failing.

## References

- `.session/orchestration/impl-fleet/SPIKES-2026-10-05.md` §B4 (gate inventory, fixture measurements).
- `cli/lib/harness-selection.ts`, `cli/lib/agent-compatibility-contracts.ts`, `cli/lib/agent-compatibility.ts`, `cli/doctor.ts`, `cli/install.ts`, `cli/update-boilerplate.ts`.
- `.agents/instructions/agent-harnesses.md` §4.5.
