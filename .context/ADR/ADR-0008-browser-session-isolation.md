# ADR-0008 — Browser sessions are isolated in memory; persistence and the human's browser are explicit

- **Status:** Accepted (by the owner, 2026-10-01)
- **Date:** 2026-10-01
- **Deciders:** framework owner (boilerplate maintainer); drafted by `/framework-development` from the pw-profiles SPIKE (D1-D9 approved 2026-10-01, with two owner notes that extended D6 and D8)
- **Tags:** isolation, auth-in-tests, exploratory-vs-scripted, playwright-cli, fleet
- **Supersedes:** —
- **Superseded by:** —

---

## Context

Every agentic browser session in this repo runs through `playwright-cli`. The shipped `.playwright/cli.config.json` carried `"isolated": false` and `"userDataDir": ".playwright/user-data"`, which the doctrine described as "give each session its own session / profile identifier" and left the mechanics to the vendor skill. The SPIKE measured what that config actually does, on `playwright-cli` 0.1.14 (playwright-core 1.61.0-alpha), 2026-09-30 and 2026-10-01, in scratch workspaces:

- **Every session shared one profile.** `-s=spa open` and `-s=spb open` (no flags) both reported `persistent: true, userDataDir: .playwright/user-data`; `ps` showed two Chromium processes on the same `--user-data-dir`; no lock error. Two processes writing one profile dir is a silent last-writer-wins on cookies. A distinct session name was NOT isolation under that config. `--profile=<dir>` overrode the config's dir; `--persistent` did not (it reused the shared one).
- **After the change** (config without `isolated` / `userDataDir`), `playwright-cli list --json` reported both named sessions with `userDataDir: null, persistent: false`: in memory, nothing shared.
- **Workspace scoping** (`registry.js` `findWorkspaceDir`): the namespace is the nearest ancestor (up to 10 levels) holding `.playwright/`; its path hash keys the daemon dir. Each worktree is a separate namespace; a directory with no `.playwright/` above it shares one machine-wide namespace.
- **`kill-all`** SIGKILLs every process matching the CLI daemon, the MCP server and the dashboard on the machine: every worktree, every repo, other tools' Playwright MCP servers. Cookies are not flushed.
- **`delete-data`** removes only the session file and the auto-created `ud-<session>-*` dirs; a custom `--profile` dir survives it.
- **Secrets on stdout.** `cookie-list` / `cookie-get` print cookie values. `fill` echoes the typed value inside its "Ran Playwright code" block; `--raw fill` prints nothing. `state-save` writes mode `0644`, and with no filename it writes `storage-state-<timestamp>.json` into the current directory, which `.gitignore` did not cover.
- **Attach, two sessions on one Chrome** (debugging-port mode against a scratch Chrome for Testing 153, never the owner's browser): both sessions saw one tab list and one cookie jar; each kept its own current tab, so commands after `tab-new` ran on each session's own tab; when one session closed its own tab, its current tab jumped to the neighbour, which was the other session's tab; `close` on an attached session ended the session and left the browser and its tabs running. The extension mode (`--extension`) starts one relay per session, opens a connect page in Chrome for the human to approve a tab, and rejects a second client per relay: read from the bundled source (`cdpRelay.ts`), not measured live, because it needs the human's own Chrome.
- **Suite auth was single-role.** `ui-setup` writes `.auth/user.json`; `bun run api:login --role <role>` only LABELLED the token: it always authenticated `config.testUser`, so `--role admin` produced a token named `API_TOKEN_ADMIN_<ENV>` that belonged to the default user, and overwrote the suite's `.auth/api-state.json` on the way.
- **The updater does not deliver `.playwright/cli.config.json`.** No component in `cli/update-boilerplate.ts` covers `.playwright/`; the file reaches a project only when it is scaffolded. `.gitignore` additions do propagate, through the ignore-file sync.
- **The updater could not insert a new sub-block inside an existing block.** `projectDelta` reports leaves; for `testing.browser.pair_mode` in a project that has `testing:` but no `browser:`, `planInsertions` found no parent to anchor to and skipped the key on every run.

## Decision

We will isolate agentic browser sessions in memory by default and make every form of persistence, and every use of the human's own browser, explicit.

- **Config.** `.playwright/cli.config.json` drops `isolated: false` and `userDataDir` (vendor default: one in-memory context per session) and flips `headless` to `true`. A named session (`-s=<name>`) is then the isolation unit. `--persistent` is banned.
- **Four cases, decided before the first `open`:** (a) anonymous, in memory; (b) SUT test user, in memory plus `state-load` of the role's state file; (c) the owner's persistent account, a dedicated `--profile` under `~/.agentic-qa/playwright-profiles/<service>` (machine-wide, outside every repo, machine-local `REGISTRY.md`, first login by the human); (d) Agentic Pair Testing, `attach` to the human's own Chrome, `detach` at the end.
- **Multi-role SUT auth.** One identity per role: credentials `<ENV>_<ROLE>_EMAIL` / `<ENV>_<ROLE>_PASSWORD` in `.env` (role `user` is the existing pair), validated at the point of use (ADR-0005); one browser state file per environment and role at `.auth/<env>-<role>.json`, produced by the suite's setup when it exists and otherwise by one agentic login, consumed with `state-load`. `api:login --role` now authenticates the role's own pair and only the default role writes `.auth/api-state.json`.
- **Pair mode is a project setting**, `testing.browser.pair_mode: null | true | false` in `.agents/project.yaml` (schema too). `null` = ask once at the first agentic browser session and save the answer. Unattended runs never pair.
- **Fleets.** Workers use named in-memory sessions and only `state-load` state files the conductor provisioned; an owner profile is single-writer machine-wide; in pair mode each worker opens and closes only its own tab.
- **Session material is a secret**: never printed, `--raw fill "$VAR"` for credentials, state files only under `.auth/` with `chmod 600`.
- The canon is `.agents/skills/agentic-qa-core/references/browser-sessions.md` (a reference, not a new skill: it is always loaded alongside another skill, and `/playwright-cli` is vendor-owned). No helper script for now (D9).

## Consequences

- **Positive:** two sessions can no longer share cookies by accident, on one checkout or across a fleet; isolation needs no per-worker config file and leaves nothing on disk to clean. Exploration and the suite share one login mechanism per role. A role-scoped API token now really belongs to that role. The updater can deliver new nested keys of `.agents/project.yaml`.
- **Negative / trade-offs:** the implicit persistent login some users relied on (`.playwright/user-data`) is gone for new scaffolds: an owner account must be registered as a case (c) profile, and a test-user login comes from a state file. Headed is opt-in (`--headed`). Case (c) needs real Chrome installed and is local-only. A project with several roles must add their credential pairs to `.env` itself; nothing scaffolds them.
- **Neutral / follow-ups:**
  - **Downstream projects keep their old config.** The updater never ships `.playwright/cli.config.json`, so an existing project still runs every session on `.playwright/user-data` until it edits the file by hand (remove `isolated` and `userDataDir`, set `headless: true`). Until then a distinct session name is NOT isolation there. The doctrine says so where it relies on it. Whether to ship the file (as a protected, bootstrap-only path) is a separate decision.
  - Per-role setup projects in the KATA suite (`ui-setup` per role writing `.auth/<env>-<role>.json`) are the natural next step; the path convention is the seam, and nothing in this decision requires them.
  - Pair mode over the extension is unmeasured; confirm with the human on first use.
  - Revisit a `pw:profile` helper after two real uses of case (c) (D9).

## Alternatives considered

- **Keep the shared persistent profile, isolate with a per-session config file** — rejected: every session must carry a complete alternate config (it replaces, never merges), and forgetting it fails silently.
- **One disk profile per worker** (`--profile=.playwright/profiles/<label>`) — rejected as the default: disk to clean, a lock per dir, and no benefit over in-memory plus `state-load`. Kept as an option for a disposable per-ticket profile.
- **A new skill for browser sessions** — rejected: knowledge always loaded next to another skill gains nothing from its own trigger and registry surface.
- **Attach read-only only** (the SPIKE's D8 recommendation) — replaced by the owner's Agentic Pair Testing: when the human asks, the session writes, under owner-account rules.
- **A `roles:` list in `project.yaml`** — rejected for now: the credential names are the declaration, the personas live in `business-e2e-context`, and a second list would drift from both.

## References

- `.session/spikes/pw-profiles/plan.md` (SPIKE, primary checkout, gitignored) and the owner's verdicts `.session/decisions/pw-profiles-2026-10-01.json`.
- `.agents/skills/agentic-qa-core/references/browser-sessions.md` (canon), `evidence-conventions.md` §5, `api-testing-doctrine.md`.
- ADR-0005 (validation scope: project-scope credentials checked at the point of use), ADR-0006 (forensic ledger; G37 orphaned browsers).
- External: `microsoft/playwright#31212` (Google refuses sign-in in a CDP-driven browser; first login in a plain Chrome window on the same user-data dir).
