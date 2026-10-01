# Browser sessions: whose login, which browser, and how sessions stay apart

> Canon for every `[AUTOMATION_TOOL]` session this repo opens with `/playwright-cli`: sprint exploration, bug-screenshot capture, fleet workers, smoke checks by hand. `/playwright-cli` owns the HOW of each verb (flags, syntax); this file owns WHICH session, WHICH identity and WHICH browser, because the vendor skill cannot carry repo rules. The measurements behind every "measured" below, with their dates and tool versions, are in `.context/ADR/ADR-0008-browser-session-isolation.md`.

---

## 1. The question before the first `open`

Before the first `open`, answer: **does the page need a logged-in session, and whose?** The answer picks exactly one case.

| Case | When | Browser | How it starts | How it ends |
|---|---|---|---|---|
| **(a) anonymous** | public page, localhost, the annotation page of `bug-screenshot-annotation`, anything with no login | bundled Chromium, in memory | `-s=<name> open <url>` | `close` |
| **(b) SUT test user** | the app under test, logged in as one of its roles (credentials in `.env`, Critical Rule #1) | bundled Chromium, in memory | `-s=<name> open`, then `state-load` the role's state file (§4) | `close` |
| **(c) owner's persistent profile** | a third-party account a script cannot log into (SSO, MFA, Google, LinkedIn): the human's own account, kept across runs | real Chrome on a dedicated profile dir | `-s=<service> open <url> --profile=<abs dir> --browser=chrome` (§5) | `close` (flushes cookies) |
| **(d) Agentic Pair Testing** | the human and the AI test together in the human's own running Chrome | the human's Chrome, attached | `attach` (§6) | `detach`, never `close` |

The shipped `.playwright/cli.config.json` launches every session **in memory and headless**: no profile on disk, nothing shared between two session names. Persistence is always explicit (`--profile`), headed is always explicit (`--headed`, when a human must see the window: a first login, a demo, a pair session).

`bun run up` delivers that file only when it is missing and never overwrites it: a project keeps the copy it has. If its `browser` block still carries `"isolated": false` and a `"userDataDir"`, every session name shares that one profile and nothing in this file's isolation holds; the updater says so in an informational parity row on every run until it is fixed. Fix it once (remove both keys; `headless: true`), with the human's OK, before trusting a session name as isolation.

---

## 2. Rules for every case

1. **Always a named session** (`-s=<name>`), never the default one. A ticket session is named after the ticket (`-s=<KEY>`); a fleet worker after its label; a case (c) session after its service.
2. **Never `--persistent`.** It reuses one profile dir for every session that passes it. Persistence is `--profile=<absolute dir>` or nothing.
3. **`--profile` is always an absolute path.** A relative one resolves against the daemon's working directory and differs per worktree (measured).
4. **One account = one live browser.** Never two sessions, two agents, two worktrees, or the CLI plus an MCP on the same account at once. Subagents that need the same account run serially. Two browsers on one account drop the session.
5. **Work from `snapshot` refs**, not CSS selectors or coordinates.
6. **`close` is mandatory, even after an error**, and `playwright-cli list` is the proof it happened (Critical Rule #16): an empty list for your session names, not the `close` receipt. Every session closes before its report (orchestration gotcha G37).
7. **Never `pkill` a browser or the daemon.** `kill-all` SIGKILLs every Playwright CLI daemon and MCP server on the machine, in every worktree and every repo, and flushes no cookies (measured from source): use it only when no other session is working, after telling the human.
8. **A stuck `beforeunload`** ("does not handle the modal state") is released with `dialog-accept`. On an owner account (cases c and d) an UNEXPECTED confirmation dialog is `dialog-dismiss` and stop.
9. **Values print by default.** Use `--raw` when a command's output is a value you only need to compare, and `run-code --filename <file>` for non-trivial code (shell escaping silently breaks large inline snippets).

---

## 3. Session material is a secret

A storage-state file, a profile dir and a cookie value are login credentials in another shape.

- **Never print them.** No `cat` of a state file or a profile file. Never run `cookie-list`, `cookie-get`, `localstorage-list` or `sessionstorage-list` on an owner account (cases c, d): they print the values (measured). On a case (b) test user, read a single non-session key with `--raw` when a test needs it, never dump the store.
- **`fill` echoes the value it typed** in its "Ran Playwright code" block (measured). Typing a password is always `--raw fill <ref> "$VAR"`: the shell expands the variable, the command text carries only its NAME, and `--raw` suppresses the echo (measured: empty output).
- **State files live in `.auth/` only** (gitignored), and get `chmod 600` right after `state-save` (it writes `0644`, measured). `state-save` with no filename writes `storage-state-<timestamp>.json` into the current directory: always pass the full path. `.gitignore` also covers that auto-name, as a net, not as permission.
- **Profiles live outside every repo** (§5). `.playwright/profiles/` is gitignored for disposable per-ticket profiles only.
- **CI never uses an owner profile or a pair session.** CI authenticates through the suite's setup projects, nothing else.

---

## 4. Case (b): the app under test, one role at a time

Applications under test usually have several roles (admin, member, guest, seller). Each role is one identity, and each identity gets one state file per environment.

### Vocabulary

| Thing | Convention | Owner |
|---|---|---|
| Role name | lowercase slug from the domain (`admin`, `member`); the default role is `user` | the project (its personas: `business-e2e-context`) |
| Credentials | `<ENV>_<ROLE>_EMAIL` + `<ENV>_<ROLE>_PASSWORD` in `.env`, e.g. `STAGING_ADMIN_EMAIL`. Role `user` is the pair `config.testUser` already reads (`STAGING_USER_EMAIL`), so the default role needs no rename | the project: project-scope variables, never in the framework manifest (ADR-0005). A project declares the ones it uses in its own `.env.schema` / `.env.example` |
| Browser state file | `.auth/<env>-<role>.json` (e.g. `.auth/staging-admin.json`) | whoever produces it (below) |
| API token | `API_TOKEN_<ROLE>_<ENV>` from `bun run api:login <env> --role <role>`, which reads the SAME credential pair | `api-testing-doctrine.md` |

Credentials are validated **at the point of use**: the step that needs a role reads its pair and, when either half is empty, STOPS and names both variables and `.env`. Never guess, never fall back to another role's account (a test that passes as the wrong role is a false PASS).

### Producing a role's state file

1. **The suite's setup is the producer when it exists.** `ui-setup` writes the default role's state to `config.auth.storageStatePath` for the active environment. A project that adds per-role setup projects points each one at `.auth/<env>-<role>.json`, and exploration then reads exactly what the suite reads: one login mechanism for both.
2. **Otherwise, one agentic UI login per role and environment**, by whoever owns `.auth/` (the conductor in a fleet, §7):

   ```bash
   playwright-cli -s=login-<env>-<role> open <login url>
   playwright-cli -s=login-<env>-<role> snapshot                      # find the field refs
   playwright-cli -s=login-<env>-<role> --raw fill <email-ref> "$STAGING_ADMIN_EMAIL"
   playwright-cli -s=login-<env>-<role> --raw fill <password-ref> "$STAGING_ADMIN_PASSWORD"
   playwright-cli -s=login-<env>-<role> click <submit-ref>
   playwright-cli -s=login-<env>-<role> --raw eval "location.href"   # landed past the login page?
   playwright-cli -s=login-<env>-<role> state-save <repo>/.auth/staging-admin.json
   chmod 600 <repo>/.auth/staging-admin.json
   playwright-cli -s=login-<env>-<role> close
   ```

   The variables are in the process environment when the session was launched through the repo's harness wrappers (`bun run claude` / `opencode` / `codex` wrap `dotenv -o -e .env`). Launched bare, prefix the one command: `bunx dotenv -e .env -- sh -c 'playwright-cli -s=… --raw fill <ref> "$STAGING_ADMIN_PASSWORD"'`. Then verify WHICH account is signed in (a profile page, a role badge, `/me`) before trusting any result.

### Consuming it

```bash
playwright-cli -s=<KEY> open
playwright-cli -s=<KEY> state-load <repo>/.auth/<env>-<role>.json
playwright-cli -s=<KEY> goto <app url>
```

A ticket that needs two roles opens two sessions (`-s=<KEY>-admin`, `-s=<KEY>-member`), each loading its own file. A login page after `goto` means the state expired: regenerate the file through its producer, never log in inside the exploration session itself.

---

## 5. Case (c): the owner's persistent profile

For an account the human owns and only the human can log into. Root, machine-wide and outside every repo, so one login serves every repo and worktree on the machine and nothing can be committed:

| OS | Root |
|---|---|
| macOS / Linux | `~/.agentic-qa/playwright-profiles/<service>` |
| Windows | `%USERPROFILE%\.agentic-qa\playwright-profiles\<service>` |

**Naming.** Session name = profile folder name = `<service>`, lowercase, fixed (`loom`, `linkedin`). One account = one profile: a second account of the same service gets a suffix (`loom-work`). The session name and the `--profile` path always travel together: `open` without the `--profile` looks exactly like an expired login.

**Registry.** `REGISTRY.md` inside the root, machine-local: service, profile path, login-URL patterns, which account (written by the human), consuming skill, last verified date. Committed doctrine never names an account. A profile not in the registry does not exist: ask before using one.

**Register a profile (first login).**

1. Ask: which account, more than one account of that service, login method, purpose, and whether an API, CLI or MCP would serve instead.
2. Name it, add the registry row, create the folder.
3. Open it headed: `playwright-cli -s=<service> open <login url> --profile=<abs root>/<service> --browser=chrome --headed`. The human types credentials and 2FA; the agent never types or stores them, even when offered.
4. For Google and other bot-sensitive logins, which refuse a browser driven over CDP, the first login happens in a plain Chrome window launched on the same user-data dir with no automation attached; close it, then reuse the dir with `--profile … --browser=chrome`. If the service still refuses, stop and tell the human. Never reach for stealth flags.
5. Verify WHICH account is signed in, then `close`: closing is what flushes cookies to disk. A killed browser loses them (diagnose by the mtime of `<profile>/Default/Cookies`).
6. Headless smoke, read-only: reopen without `--headed`, `eval "location.href"`, confirm no login page, `close`.

**Daily use.** A healthy session lasts weeks: assume logged in, never log in "just in case". After every `open` / `goto`, `--raw eval "location.href"`; a login-pattern hit means stop, `close`, reopen headed for the human, and report what is done and what is not. Never retry, never auto-login. Nothing destructive without the human's written OK per item, and every write is one visible command, read back afterwards (Critical Rule #16). Disposable per-ticket profiles are removed by path when the ticket closes (`delete-data` never removes a custom `--profile` dir, measured); an owner profile is never removed by an agent.

---

## 6. Case (d): Agentic Pair Testing in the human's own Chrome

The human and the AI drive the same browser: the human's Chrome, with the human's real accounts and tabs. It is not read-only: when the human asks for pair testing, the AI clicks, types and submits in that browser like in any other session. It is opt-in, governed by `.agents/project.yaml` → `testing.browser.pair_mode`.

### The `pair_mode` setting

| Value | Behaviour |
|---|---|
| `null` (default) | The FIRST time an agentic browser session is about to start in this project, present both modes in one question: **dedicated session** (cases a-c, the AI's own browser) or **pair testing** (case d, the human's Chrome). Use the harness prompt; it is one decision. Save the answer once, as `true` or `false`, by editing that one line of `.agents/project.yaml` (a line edit, never a reformat of the file), and say it was saved. Never ask again unless the human asks to change it. |
| `true` | Pair testing is the default mode for agentic browser sessions in this project. |
| `false` | Dedicated sessions by default. Pair testing still happens when the human asks for it explicitly, after one confirmation that names what it means (their real browser and accounts). |

Unattended work never enters case (d), whatever the value: a scheduled routine, CI, or a worker with no human at the screen uses cases a-c.

### Attaching

| Mode | Command | What the human sets up first |
|---|---|---|
| Debugging port | `playwright-cli attach --cdp=chrome --session=<name>` | remote debugging enabled in their Chrome (the CLI reads the port Chrome publishes in its own profile dir) |
| Extension | `playwright-cli attach --extension=chrome --session=<name>` | the Playwright extension installed; Chrome opens a connect page and the human approves which tab is shared, once per session |

Always pass `--session`: without it the session is named after the channel and a second attach collides with the first. End with `detach`, never `close`: `detach` leaves the human's browser running. `upload` does not work on an attached browser.

### Rules while paired

- Announce before each write ("I am submitting the form on tab 2"), one visible command per write, and read it back.
- The human's real accounts are in play: §5 rules apply (nothing destructive without a per-item OK, unexpected dialog → `dialog-dismiss` and stop, never print cookies or storage).
- Work in a tab you opened yourself (`tab-new <url>`) unless the human points you at one of theirs. Never close a tab you did not open.

### Several AI sessions on one Chrome (fleet, parallel)

What the CLI supports, measured on the debugging-port mode against a scratch Chrome (never the human's):

- Two sessions attached to one Chrome share **one tab list and one cookie jar**: the same accounts, the same storage, the same tab indexes.
- Each session keeps its **own current tab**: after each opened its own tab with `tab-new`, every command ran on that session's tab only, so tabs do not collide by construction.
- **Tab indexes are shared and shift.** When a session closes its own tab, its current tab silently jumps to a neighbour, which can be another session's tab. So: a worker closes only its own tab, and only as its last step before `detach`. Never `tab-select` by an index you did not just read with `tab-list`.
- `close` on an attached session ended the session without closing the browser or its tabs; `detach` is still the command, because it says what you mean.

The extension mode starts one relay per session and accepts one client per relay, so each session needs its own approved tab; read from the CLI's source, not measured live, because it needs the human's own Chrome. Confirm with the human the first time before relying on it.

Because the cookie jar is shared, every paired worker is the SAME identity on every site. Rule §2.4 therefore binds: two workers writing to the same account in parallel is two browsers on one account. Parallel pair testing is for reading and for disjoint accounts; anything else is serialized by the conductor. Role-separated parallel testing belongs in case (b).

---

## 7. Fleets and parallel sessions

- **Workers use case (b) in-memory sessions**, one name each (`-s=<KEY>` or the worker label). Under the shipped config two names never share a profile (measured: no data dir, not persistent), so the name IS the isolation. No per-worker disk profile, nothing to clean.
- **The conductor provisions the state files** (`.auth/<env>-<role>.json`) before launch, exactly like API tokens (`api:login --profile`); each brief names the absolute path its worker `state-load`s. One writer, many readers: a worker never logs in and never writes into `.auth/`.
- **The session namespace is the nearest ancestor directory with a `.playwright/` folder.** Each worktree is its own namespace, so the same `-s` name in two worktrees is two different browsers; `playwright-cli list --all` shows every workspace on the machine. A directory with no `.playwright/` above it falls into one machine-wide default namespace.
- **An owner profile (case c) is single-writer machine-wide**, across worktrees and repos: the conductor serializes any work on it. Before opening one, `playwright-cli list --all` and check nobody holds it.
- **Pair mode in a fleet** follows §6: one tab per worker, opened by the worker, closed only as its last step; same identity everywhere, so writes are serialized.
- Output and evidence isolation is a separate concern: `evidence-conventions.md` §5 (explicit capture paths, never repoint the shared `outputDir`).
