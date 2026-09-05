# Changelog

All notable changes to this boilerplate are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This repository ships **two independently released artifacts**, and every entry
below names which one it applies to:

- **Boilerplate** — reaches users the moment it lands on `main`, because the
  scaffolder downloads the template from GitHub at runtime. No publish step.
- **Scaffolder** — the `create-agentic-qa` npm package under
  `packages/create-agentic-qa/`. Release runbook:
  [packages/create-agentic-qa/README.md → Releasing a new version to npm](./packages/create-agentic-qa/README.md#releasing-a-new-version-to-npm).

## [Unreleased]

### Fixed (updater 8.4)

`CLI_VERSION` 8.3 -> 8.4, ported from the dev boilerplate. Five polish items.

- **The `cli` lock cursor also advances after a self-update from a pre-8.1
  parent.** A 7.x parent predates `UPEX_UPDATER_SELF_UPDATED` and re-execs the
  child on `UPEX_UPDATER_REEXEC=1` alone, so the env-signal fast path never
  fires. The re-exec child now detects the same fact independently: when
  `cli/` is byte-identical to the fetched upstream and the lock's prior
  cursor for the component is not already at that sha, the component settles
  there anyway, same as the env signal.
- **A heading changed only by punctuation is not a heading change.** The
  markdown evidence normalizes an em dash, an en dash, a spaced hyphen and a
  colon to one canonical separator before comparing headings (`## A - B` and
  `## A: B` now compare equal). Case-sensitive otherwise. Hunk counts still
  come from the real diff, untouched.
- **The skills registry regenerates after everything else, including a
  restored overwrite.** `bun run skills:registry` now reruns as the very last
  afterApply hook, after the parity report; an overwritten-edit row for a
  path under `.agents/skills/` now ends with `after restoring, run bun run
  skills:registry`, so `skills:registry:check` does not go red the moment the
  project restores its own edit from the backup. The KATA manifest hook
  keeps its own place ahead of the gates: `kata:manifest:check` still judges
  the manifest the run just rebuilt.
- **First-run noise for a watched file no upstream ever touched.** A watched
  path with no marker yet (a migrated repo, or one running the per-file
  marker tracking for the first time) whose upstream copy has not changed
  since the project's own lock cursor seeds its marker silently instead of
  firing a row: the same treatment `updater.protected_paths` first advice
  already got in 8.3, now for any watched path when the cursor proves nothing
  moved. An unknown cursor (no lock yet) keeps today's first advice.
- **The closing box names why gates did not run.** `Gates:` used to be
  omitted entirely on a no-op run (nothing applied) or with `--no-gates`,
  reading as "nothing to say"; it now prints `omitidas (sin cambios)` or
  `omitidas (--no-gates)`.

### Fixed (updater 8.3, ported from the dev boilerplate)

`CLI_VERSION` 8.2 -> 8.3. The dev boilerplate's 8.3 lands here: two items that
were born in this repo's 8.2 port and went back upstream (the write-surface
guard, the added-upstream rule for local edits), plus four polish items from
the live runs on bunkai-qa-engineering and upex-bunkai-tms.

- **The dirty-tree guard blocks only on what the sync writes.** Uncommitted
  work inside the write surface (a synced component file, an ignore file,
  `package.json`, a deprecated file) still aborts `--auto` and names the
  paths; dirt anywhere else (`tests/`, KATA code, a protected or bootstrap-only
  file, generated surfaces) is listed as `N ruta(s) con cambios sin commitear
  fuera de lo que este updater escribe; no bloquean` and never blocks. The
  last-apply hash and the updater-owned exemptions are unchanged. Same
  `isWithinWriteSurface` as upstream now; the 8.2 port had its own copy.
- **No "project edit overwritten" row for a path upstream added after the
  lock cursor.** A file with no base copy at the cursor (`status A`, no
  `templateOldSha`) cannot be told apart from one that arrived another way;
  a migrated Claude-era repo had every moved skill in that state and got one
  false row each. Unknown is never reported as an edit.
- **`.context/PBI/` migration is one parity row.** A repo that still tracks
  the Jira cache in git gets one Componentes row (`N tracked path(s) still in
  git ...; migration recipe saved to .agents/prompts/pbi-cache-migration.md`)
  and the full recipe in that file; the terminal no longer receives the path
  list (370 lines on one live run, next to eight parity rows). The 8.2 file
  name `pbi-cache-migration-prompt.md` is removed when the recipe is written.
  `--dry-run` shows the row without writing the file. The QA allowlist
  (`README.md`, `templates/**`, `epics/*/test-specs/**`) is unchanged.
- **A freshly protected path gets no residual row.** A path just declared in
  `updater.protected_paths` (any project-declared entry with no marker yet)
  has its upstream marker seeded silently, with a one-line note; the drift
  row fires on the next upstream change. Before, the first dry-run and the
  first real run after declaring it both showed a `content differs` row that
  only went away once a real run had persisted the marker.
- **The `cli` lock cursor advances after a self-update.** The re-exec child
  found `cli/` identical to upstream (its parent had just written it), walked
  no entry for the component and never moved its cursor, so the lock kept
  `cli@<scaffold sha>` release after release. The parent now hands the sha it
  refreshed `cli/` to through `UPEX_UPDATER_SELF_UPDATED` and the child
  settles the component at it (only when it equals the HEAD the child
  fetched; otherwise the files differ again and sync as usual).
- **MCP registries are compared per server.** `.mcp.json`, `opencode.jsonc`
  and `.codex/config.toml` rows no longer say `same keys and values` when a
  server's args, env, url or command differ: a nested server object is
  compared whole and the evidence names it (`context7: args differ`,
  `supabase: env keys differ`), at most three servers named, the rest
  counted.

### Added

**Boilerplate (updater 8.2, cross-harness compatibility)**

- **Project-aware MCP parity.** The canonical server set is whatever
  `.mcp.json` declares; `opencode.jsonc` and `.codex/config.toml` must declare
  exactly that set, and every declared server must agree across hosts on the
  `.env` variables it depends on and on its literal env settings. A server
  missing from a host, or present in one host only, fails naming the server
  and the host. The six ids the boilerplate ships (`KNOWN_MCP_IDS`) keep a
  strict per-host shape check whenever the project declares them; any other
  server gets the generic check only, so a downstream project may add or drop
  servers freely. `declaredMcpIds(root)` exposes the set; `setup:doctor` and
  the "MCP parity (N servers x 3 harnesses)" row derive N from it.
- **Command-alias overlay.** `.agents/compatibility/command-aliases.project.json`
  (same schema as the upstream manifest, optional, never synced) adds or
  overrides aliases by name; `wrapperHosts` always come from upstream. A
  wrapper file under `.claude/commands/` or `.opencode/commands/` that no
  manifest produced is reported by name (`Command wrapper not declared in any
  manifest: <path>`) and never deleted by the repair.
- **`repairAgentSurfaces`.** One call renders the wrappers, repairs the alias
  and runs the check; `{ deferSkillsAlias: true }` writes the
  `.template/upstream-sha/claude-skills-alias.deferred` marker so the check
  reports the alias as `deferred` (not missing) until the migration commit,
  and the next `bun run agents:compat` creates it and removes the marker.
- **Grouped compat report.** `bun run agents:compat:check` and `setup:doctor`
  always print the alias status line (created / OK / deferred / missing /
  invalid) and bucket errors per surface (instructions, alias, wrappers,
  hooks, MCP). Doctor `--json` gains `agent_compatibility.alias` and
  `agent_compatibility.errors_by_surface`.
- **`scripts/lint-skills.test.ts`.** Regression tests for the tier
  classification below, run against fixture repos through the new
  `LINT_SKILLS_ROOT` override.

### Changed

**Boilerplate**

- `opencode.jsonc` parsing strips trailing commas as well as comments (what
  Prettier writes), and a `${VAR}` placeholder inside a Codex
  `[mcp_servers.X.env]` table is rejected with the fix (`Forward the variable
  through env_vars instead`).
- The doctor's "Command wrappers (N Claude + N OpenCode)" row derives N from
  the merged manifest instead of the literal 10; `command_wrappers.ok` means
  "every declared wrapper is present on both hosts".
- Docs (`README.md`, `INSTALLER.md`, `AGENTS.md`, `CONTEXT.md`, `docs/mcp/`)
  describe the MCP contract as project-declared instead of "the same six
  servers", document the overlay, and describe updater 8.2 (parity prompt,
  `--strict`, `--no-gates`, `--dry-run` with the new updater, safe re-runs,
  protected watchlist, `updater.protected_paths`).

### Fixed

**Boilerplate (`scripts/lint-skills.ts`)**

- A community skill committed as a real directory in `.agents/skills/`
  (downstream projects commit their `bunx skills add` output) is no longer
  reclassified as T1: `cli/install.ts` stays the tier authority, the T1-only
  checks (frontmatter, categories, STALE-PATH, session contract) skip the
  vendor body, and the summary line counts it separately (`N T1 skills (+ M
  community skills committed in the store, tiers from cli/install.ts)`). The
  AGENTS.md §5 cross-check still applies to it, so a committed community skill
  missing from the registry is a TIER-MISMATCH instead of a silent T1 exemption.

**Scaffolder (`create-agentic-qa` 1.1.2)**

- `rewriteProjectYaml` patched a field named `name`, but `.agents/project.yaml`
  declares `project_name` — so **every scaffold since the CLI shipped left
  `project_name: null`** while the CLI logged `Wrote .agents/project.yaml
  (name=<project>)`. `--project-key` was unaffected, since `project_key` is the
  field's real name. The field name is fixed, and a field that cannot be matched
  is now reported as a warning instead of silently reported as written.

**Installer (`cli/install.ts`)**

- The "no agents detected" hard exit now runs before the `NON_INTERACTIVE`
  guard in `promptAgentSelection`. It is a validation, not a prompt — behind the
  guard, an unattended install proceeded with zero agents and configured
  nothing.

### Fixed (earlier in this cycle)

Cross-platform defects across the whole bootstrap path, found by an audit of
the scaffolder, the installer, and the prerequisite docs. Windows PowerShell and
cmd are now supported directly; WSL and Git Bash still work but are no longer
required.

**Scaffolder (`create-agentic-qa` 1.1.1)**

- `tar` extraction failed on Windows PowerShell and cmd with
  `tar: Option --force-local is not supported`. That flag is GNU-only, but
  Windows 10 1803+ and Windows 11 resolve `tar` to the bsdtar at
  `C:\Windows\System32\tar.exe`, which rejects it. The flag is gone entirely:
  tar now runs with `cwd` at the tarball and takes a bare relative filename, so
  GNU tar's `host:path` heuristic (which only applies to the `-f` argument)
  never triggers and both flavours accept the same argv. Regression-tested in
  `tests/smoke.test.ts`.
- `bun` could not be launched at all on Windows when installed via
  `npm i -g bun`, which writes a `bun.cmd` shim and no `bun.exe`. `where` honours
  PATHEXT so the preflight passed green, but libuv only appends `.com`/`.exe`,
  so the spawn failed with ENOENT. All three bun spawns now pass `shell` on
  win32.
- A spawn that never launched was misread as a failed exit code, because
  `spawnSync` reports it as `status: null` and `null !== 0` is true. That routed
  launch failures into the destructive "corrupted node_modules" recovery path,
  wiping a populated `node_modules` in `--here` mode. Both `runBunInstall` and
  `runBunSetup` now check `res.error` first.
- `bun install` failures aborted the run with no recovery path. The scaffolder
  now wipes `node_modules` and retries once with `--force` (Bun's own documented
  remedy), and on a second failure prints recovery steps plus the WSL `/mnt/c`
  caveat.
- `git init -b main` requires git >= 2.28, which is newer than Ubuntu 20.04
  (2.25), Debian 10 (2.20) and Catalina's Command Line Tools (2.24). On those,
  git exited non-zero and the rollback deleted the entire freshly scaffolded
  project over a branch-naming flag. Replaced with `git init` followed by
  `git symbolic-ref HEAD refs/heads/main`, which every git version accepts.
- The doctor's `node >= 18` check read `process.versions.node`, which Bun
  emulates, so it reported OK on machines with no Node installed while the
  inspect view (driven by `installer-manifest.json`) correctly said MISSING. It
  now probes the real binary.
- Failure hints were Unix-only. `curl -fsSL … | bash` is unusable in PowerShell,
  where `curl` aliases `Invoke-WebRequest` and there is no `bash`; the obvious
  workaround (`npm i -g bun`) led straight into the shim bug above. The hint is
  now platform-aware and points Windows users at the PowerShell installer.

**Boilerplate**

- `cli/doctor.ts` looked for Playwright browsers only at
  `~/.cache/ms-playwright`, the Linux path. On macOS (`~/Library/Caches/`) and
  Windows (`~/AppData/Local/`) it reported them missing forever, pushing a
  `pw:install` pending action and exiting 1 on every run. `cli/install.ts`
  already handled all three layouts; the two now share
  `cli/lib/playwright-cache.ts` so they cannot drift again.
- `cli/install.ts` Step 12.4 (acli auth) was the only Phase-5 step without the
  `AUTO_NON_INTERACTIVE` guard. Git Bash reports `process.stdin.isTTY === false`
  because MSYS ptys are named pipes, so the credential prompts were skipped and
  the step then hard-exited 1 — on every re-run, permanently. It now skips like
  every sibling step, and its three `process.exit(1)` calls are warnings, so
  Steps 13 and 14 still write their Jira catalog placeholders.
- `cli/install.ts` printed a POSIX-only manual `acli` login command at each
  failure site. Pasted into PowerShell, `$ATLASSIAN_URL` expands as an undefined
  PowerShell variable, silently authenticating with an empty site and token. The
  instruction is now platform-aware.
- `cli/doctor.ts` `detectDirenv()` scanned only POSIX rc files while
  `shellHookLine()` told Windows users to edit `$PROFILE`, so `hook_in_rc` could
  never become true on native Windows and the report stayed `needs-action`
  forever. Both PowerShell profile paths and fish's config are now candidates.

### Changed

- **Boilerplate** — `bun run claude` and `bun run opencode` no longer shell out
  to `bash -c 'set -a; . ./.env; set +a; exec <bin> "$@"' --`, which cannot run
  in PowerShell or cmd (Bun executes package.json scripts through Bun Shell,
  which has no `bash`, `set` or `source`). They now use `dotenv -e .env -- <bin>`
  via the `dotenv-cli` devDependency — which `README.md`, `INSTALLER.md` and
  `cli/doctor.ts`'s `deps_installed` probe already described as the mechanism.
  Argument forwarding is unchanged.
- **Boilerplate** — `README.md`, `INSTALLER.md` and the scaffolder's README now
  document the real Windows story (PowerShell and cmd supported, bsdtar ships
  with the OS, install Bun via the PowerShell one-liner rather than npm) and the
  WSL `/mnt/c` caveat that makes `bun install` fail with
  `could not open bin metadata file`.

### Added

- **Boilerplate** — `cli/lib/playwright-cache.ts`, the single source of truth
  for the per-OS Playwright browser cache location. Node built-ins only, so
  `cli/doctor.ts --preflight` keeps running before `bun install`.
- **Boilerplate** — this changelog, and a release runbook for the scaffolder in
  `packages/create-agentic-qa/README.md`.

### Removed

- **Boilerplate** — the `env` npm script (`set -a; source .env; set +a`). It
  failed outright in PowerShell and cmd, and was a no-op everywhere else:
  `bun run env` exports into a child subshell that exits immediately, leaving
  the caller's environment untouched. `README.md` documents the inline bash/zsh
  form and its PowerShell equivalent instead.
