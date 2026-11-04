# ADR-0026 — Pi is a declared harness: two files decide detection, and a secret-only block stands in for a deny list

- **Status:** Accepted (by the owner, 2026-11-04)
- **Date:** 2026-11-04
- **Deciders:** framework owner (boilerplate maintainer): Q1, Q2 and Q3 of the Pi compatibility plan, approved 2026-11-04
- **Tags:** harness, compatibility, security, orchestration
- **Supersedes:** —
- **Superseded by:** —

Amends ADR-0012 (the harness list grows by one, the mechanism does not change) and corrects one claim of ADR-0024 (session naming on Pi).

---

## Context

Pi (earendil-works) can run this repo with little of its own: it reads `AGENTS.md` and `.agents/skills` natively, and its extension API took the shared hook emitter unchanged. Measured on Pi 1.4.0 and repeated on 1.5.0, 2026-11-04.

Four things differ from the harnesses already declared:

- Pi packages write runtime state under `.pi/` (`loops/`, `tasks/`, `subagents/`). ADR-0012 puts a harness "in use" while any of its files exists, so a directory-wide rule would flip a project to Pi because someone ran a package once.
- Pi has no deny config and no approval system. Rule #1 has no runtime net there, and QA workers read untrusted pages.
- Project trust gates `.agents/skills`, `.pi/mcp.json` and `.pi/extensions`. Without it a session gets `AGENTS.md` and nothing else. The default on a new machine is to ask, and print and RPC modes skip protected resources under that default.
- ADR-0024 and the orchestration doctrine said Pi has no hook that can name a session, so a conductor had to type `/name`. That is wrong: an extension calls `pi.setSessionName()`, the name lands in the session file as a `session_info` entry and shows on the status bar. Measured under a real `orca orchestration worker-start --agent pi`, whose hidden message reached the model.

## Decision

We will treat Pi as a first-class harness: it is in `HARNESSES`, under the same gates as the others.

1. **Detection reads two files.** `HARNESS_FILES.pi` and `HARNESS_SYNC_PATHS.pi` are exactly `.pi/mcp.json` and `.pi/extensions/agentic-qa.js`. Never `.pi/settings.json` and never a directory, so runtime state cannot put Pi in use and a project's own extensions stay out of the sync.
2. **Existing projects are untouched.** A project that neither declares Pi nor has those files gets no Pi file and one more `NOTE:` line. The installer preselects Pi only when it detects it. `harnesses:` stays `null` in the template.
3. **One adapter on the shared emitter.** `.pi/extensions/agentic-qa.js` is plain JS with no Pi import. The emitter does not change for it, and the output of the existing harnesses does not change.
4. **A secret-only block in the adapter.** A `tool_call` handler refuses direct reads of `.env*` (except `.env.example` and the schemas), `.auth/**` and `.claude/settings.local.json`, plus the commands in Claude Code's secret deny entries. A test derives its cases from `.claude/settings.json`, so a new secret entry fails until the adapter covers it. It is a seatbelt, not a boundary: `cat .env` and other shell variants pass, and `pi-subagents` background children are untested.
5. **`exposure: "deferred"` on every server in `.pi/mcp.json`**, with a one-line `description`. The default `codemode` hides tools from the model, and this repo resolves a capability by tool-name suffix. Tool names keep the suffix with hyphens as underscores.
6. **ADR-0024's naming claim is corrected here.** That ADR stays as written. Pi self-names like Claude Code, and the conductor does not type `/name`.

## Consequences

- **Positive:** Pi gets identity, routes, `ROUTE-PENDING:` and self-naming through code the other harnesses already use. A deleted adapter fails the boilerplate's own gates.
- **Negative / trade-offs:** the boilerplate must keep a fourth adapter passing while Pi moves fast. New scaffolds carry two more files until the installer's offer to delete them is taken. The block leaves Rule #1's text as what really binds. A Pi conductor cannot honour `permission_modes.conductor: auto`, because Pi has no such mode, and ADR-0024's stated exposure applies.
- **Neutral / follow-ups:** Pi has no subagents, question tool or plan mode built in, so the doctrines name their fallbacks (inline work or a supervised worker, the numbered list). `default_model` never reaches a Pi worker: it starts on the model in its own config and the conductor types `/model`. `dbhub` on Pi is loader-verified only: the machine that measured this has no database values, so a full connect is unproven. Trust on a machine whose default is `ask` is unproven under Orca.

## Review note (2026-11-04, before the first push)

An independent review found the block narrower than stated, and the code was fixed before this ADR left the branch. A `grep` wildcard glob overrides `.gitignore` and returned `.env` values, and path and case variants passed `read`. Ripgrep takes one `--glob` and runs with `--no-config`, so an exclusion cannot be forced: the adapter refuses a glob that names a secret and drops lines from secret files out of `grep` output. It normalizes paths and fails closed on malformed input. A third limit joins decision 4: the block exists only where the adapter loads, so an untrusted session, or a print or RPC session under `ask`, has none. The Engram line takes `--exposure deferred`, per decision 5.

## Alternatives considered

- **A separate opt-in class for Pi** — lower promise while Pi moves fast, but a second code path through selection, doctor, installer and updater, with weaker gates.
- **Rule text only, the Codex precedent** — no code and honest about what exists, but Rule #1 would have no net on the one harness with no approvals.
- **A full port of Claude's deny list** — parity on destructive git and shell too, but a larger list to maintain, overlapping a user-level gate some machines already run.
- **`.pi/` as a whole in `HARNESS_FILES`** — simpler, and it would flip detection on runtime state.
- **The default `codemode` exposure, or `direct`** — the first hides tools from suffix resolution, the second pays their schema cost on every prompt.

## References

- ADR-0012 (declared harnesses), ADR-0014 (no harness inside a loader), ADR-0024 (work profile and permission posture).
- Pi docs shipped with the install: `docs/extensions.md`, `docs/mcp.md`, `docs/security.md`.
