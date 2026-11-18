# Fleet provisioning: what a fresh worktree of this repo lacks

> Loaded by a conductor before it launches any worker into a new worktree, and by whoever edits
> `scripts/provision-worktree.ts`, `cli/lib/worktree.ts` or `orca.yaml`. `/agent-orchestration` says
> to provision before launching (hard rule 2) and leaves the step to the project; this file is that
> step for this repo. Every row below was measured with `git check-ignore` against this repo.

A provisioning gap never announces itself as one. It disguises itself as another failure, and the
worker then debugs the wrong thing for an hour. The table exists so the conductor recognizes the
disguise before launching.

---

## 1 · The gap table

| Missing | Git state | How it fails without it | How it is restored |
|---|---|---|---|
| `.env` | ignored | silent on every host (Critical Rule #10): every MCP server that needs `.env` values starts through the `.env` loader, which reads THIS worktree's `.env`; without it the server starts with empty values and dies on its first authenticated call (401/403). Any script needing credentials fails on missing variables | copied from the primary checkout, mode `0600` (§3) |
| the `.claude/skills` alias to `.agents/skills` | ignored | loud, on Claude Code only: `Skill` answers `Unknown skill`. OpenCode, Codex and Pi read `.agents/skills/` natively | `bun run agents:compat` inside the worktree |
| the T3 community skills `cli/install.ts` installs | ignored | loud, at load time: the skill is not there | copied from the primary checkout, or the installer re-run |
| `node_modules/` | ignored | loud with the wrong message: `Cannot find module`, which reads as a broken import | `bun install --frozen-lockfile` |
| `.context/PBI/` (the tracker cache) | ignored | silent: the worker cannot see the synced story and works from the ticket title alone | `bun run context:hydrate`, or a scoped per-issue sync named in the brief |
| `.auth/` (tokens) | created at login | loud: authenticated API calls fail with 401 | the CONDUCTOR mints tokens before the round (`bun run api:login`, a per-worker profile when workers must not share a token); the worker only reads the file. Copied at mode `0600`, never `.auth/harness-env-backup/`, and `.auth/opencode/` only while the worktree's `opencode.jsonc` still has `{file:}` references |
| `api/openapi.json` (the synced spec) | ignored | loud, on the OpenAPI MCP only: the server exits at start and reads as a dead tool | copied from the primary checkout, or `bun run api:sync` |
| `.session/` | ignored | the brief, the roster and the run files are absent inside the worktree | NOT copied. The prompt cites ABSOLUTE paths into the primary checkout (`<<PRIMARY_ROOT>>`, `.agents/README.md` §"Checkout roots"). Anything written inside a worktree dies with it; the audit of §5 rescues what a worker wrote there anyway |

Present in a fresh worktree because they are committed: everything `git ls-files` lists, including
each host's MCP config (each server's `.env` loader names its variables), `.agents/project.yaml`, the
Jira catalogs under `.agents/`, every T1 skill and the identity hook.

---

## 2 · Credentials for a supervised worker

No launch path loads `.env` into the worker's shell: a pasted line starts the harness binary bare,
and the supervised launch has no command line at all. Both paths get credentials the same way:

- Every MCP server, on every harness: the `.env` loader declared in `.mcp.json`, `opencode.jsonc`,
  `.codex/config.toml` and `.pi/mcp.json` (`varlock run ... --filter <its vars> -- <server>`,
  ADR-0011) reads the worktree's own `.env` and `.env.local` when the harness spawns the server.
- Every other process loads its own config, and no secret is exported into the worker's shell. Bun
  scripts (`bun run jira:*`, `bun run api:login`, `bun xray`, the acli helper scripts) read `.env`
  through Bun's autoload. `acli` uses its own stored auth and `gh` its keyring. A raw `curl` that
  needs `ATLASSIAN_EMAIL` and `ATLASSIAN_API_TOKEN` runs inside
  `bunx varlock run --filter ATLASSIAN_EMAIL,ATLASSIAN_API_TOKEN -- sh -c '...'`, and an app-API
  `curl` runs `source .auth/tokens.env` in the same command. In secret-manager mode Bun's autoload
  does not resolve 1Password references, so such a script runs through `bunx varlock run -- <cmd>`.
- A variable the human exported in the shell a line is pasted into still wins over `.env` for what
  that shell starts; `bun run vars:env:check` names such a variable (names and lengths only).

After every `.env` change, copy it into the worktrees that need it and restart the agent session:
MCP servers read `.env` when the harness spawns them. Presence check in a worker's worktree, never
the content: `test -f .env && echo present || echo MISSING`.

At readiness (`/agent-orchestration`, conductor cycle §3) the conductor confirms credentials on the
worker's screen before sending it any work: its MCP servers listed as connected (`/mcp` on Claude
Code, the server listing elsewhere) or its own first probe. Readiness is not capability. With no
evidence, provision the `.env` and restart the session; send no work.

---

## 3 · The script

`bun run worktree:provision [<target path>]` closes the repairable rows of §1 in one call. With no
argument it provisions the current directory, which makes it usable as the Orca setup hook; `--dry-run`
prints what it would do.

The implementation is `scripts/provision-worktree.ts`. It refuses to run on the primary checkout and
resolves the primary through git's common dir. It copies every gitignored input a worktree cannot
rebuild that the primary has (`PROVISION_COPIES` in `cli/lib/worktree.ts`: `.env` and its local
overrides, the Claude settings, `.auth/`, the OpenAPI config and spec, local MCP overrides, the
installer state; secrets at mode `0600`). Then it installs dependencies from the lockfile, runs
`bun run agents:compat` in the target, copies the gitignored T3 skill directories, does NOT copy
`.session/`, prints a summary plus the tracker-cache hint, and exits non-zero on any hard failure.
The committed `.worktreeinclude` names the same list, and a test keeps the two equal.

Two things stay with the conductor: hydrating the tracker cache (large and slow; a scoped per-issue
sync is often enough) and minting tokens (`fleet-project-profile.md` §4).

---

## 4 · The setup and archive hooks in the committed `orca.yaml`

Orca reads the committed `orca.yaml` as the repo's shared hooks. `scripts.setup` runs
`bun run worktree:provision` in every worktree Orca creates, and `scripts.archive` runs
`bun run worktree:audit --rescue` before Orca removes one (§5). Both run with the worktree as their
working directory. Three per-machine things decide whether they run, read once with
`orca repo show --repo <selector> --json </dev/null`:

- **Source policy.** The repository's Hooks settings must not be local-only, or `orca.yaml` is
  ignored. A local script set before `orca.yaml` existed (often `bun install`) is redundant now.
- **Trust.** The first run of each hook shows the script and asks; the answer holds until the script
  changes. Keep the setup policy at run-by-default, so a new worktree provisions itself before the
  agent starts.
- **The CLI skips archive hooks by default.** `orca worktree rm` runs them only with `--run-hooks`.

A machine where the committed hooks cannot run falls back to the app's setup-script field set to
`bun run worktree:provision` (UI only) and the audit run by hand before every removal. Whether the
agent waits for setup under `start-immediately` is unverified, so read the worker's screen before
sending it work.

Per-machine items this repo adds to the user skill's machine setup checklist:

```
[ ] orca.yaml hooks honoured: source policy not local-only, trust approved, setup run-by-default
[ ] Pi workers: trust the parent folder of the worktrees (/trust in a session there, or
    defaultProjectTrust), because a launch passes no flags and an untrusted Pi session gets AGENTS.md
    and nothing else; bun run setup:doctor reports it
[ ] permission modes per tier match orchestration.permission_modes (ADR-0024); a Pi conductor cannot
    honour conductor: auto, because bypass is the only state Pi has (ADR-0026)
[ ] the user-level skill agent-orchestration is installed (bun setup); bun run setup:doctor reports it
```

The Orca binary itself is an external CLI of `cli/install.ts`: reported when absent, never a failure.

---

## 5 · Before a worktree is removed

Removing a worktree deletes everything git ignores inside it, silently, on every removal path. Run
the audit first:

```bash
bun run worktree:audit <wt>            # read-only; exit 1 while STATE or UNKNOWN is only in the worktree
bun run worktree:audit <wt> --rescue   # copy STATE to the same path in the primary, never overwriting
```

It classifies each gitignored path from one table (`AUDIT_RULES` in `cli/lib/worktree.ts`). STATE
(`.session/`, `.scratch/`, PBI evidence and `[LOCAL]` notes, `.context/reports/`, updater state)
belongs in the primary. CACHE comes back with a command it names. DISPOSABLE is safe to lose; the
test-run outputs (Allure history, `reports/` for the TMS sync, refreshed `.auth/` tokens) are
DISPOSABLE by the owner's decision and are never rescued. UNKNOWN matched no rule and is decided by
hand. The committed archive hook runs the rescue form; the orphan audit with uncommitted work and
unpushed commits is the close step of `/agent-orchestration` (conductor cycle §6).
