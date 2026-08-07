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

### Fixed

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
