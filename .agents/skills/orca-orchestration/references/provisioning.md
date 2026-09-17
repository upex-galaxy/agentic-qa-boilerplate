# Provisioning — What a Fresh Worktree of THIS Repo Lacks

> Loaded by: the conductor, before it launches ANY worker into a new worktree.
> Rule 2 of the hard rules: provision BEFORE launching. Every entry below was measured with
> `git check-ignore` against this repo.

**The pattern worth internalizing**: a provisioning gap never announces itself as a provisioning
gap. It disguises itself as something else, and the worker then debugs the wrong thing for an hour.

---

## 1 · The gap table

| Missing | Git state | How it fails without it | How it is restored |
|---|---|---|---|
| `.env` | ignored | **loud and silent at once**: `.mcp.json` uses `${VAR}` placeholders, so Claude Code fails to parse the MCP block and the session starts with no MCP tools (Critical Rule #10); and any script needing credentials fails on missing variables | copy it from the primary checkout, mode `0600` |
| the `.claude/skills` alias → `.agents/skills` | ignored | loud, on Claude Code only: `Skill` answers `Unknown skill`. OpenCode and Codex read `.agents/skills/` natively and do not need it | `bun run agents:compat` inside the worktree (it creates a POSIX symlink or a Windows junction) |
| T3 community skills (`playwright-cli`, `playwright-best-practices`, `resend-cli`) | ignored by explicit `.gitignore` entries | loud, at load time: the skill simply is not there | copy the directories from the primary checkout, or re-run the installer |
| `node_modules/` | ignored | loud **with the wrong message**: `Cannot find module`, which reads as a broken import | `bun install --frozen-lockfile` |
| `.context/PBI/` (the tracker cache) | ignored | **silent**: the worker cannot see the synced story and quietly works from the ticket title alone | `bun run context:hydrate`, or a scoped per-issue sync named in the brief |
| `.auth/` (tokens) | not committed, created at login | loud: authenticated API calls fail with 401 | the CONDUCTOR mints tokens before the round (`bun run api:login`, with a per-worker profile when workers must not share a token) and the worker only reads the file; copy mode `0600` |
| `.session/` | ignored | the brief, the roster and the run files are simply absent inside the worktree | do NOT copy it. Cite ABSOLUTE paths into the PRIMARY checkout from the prompt. Anything written inside a worktree dies with it |

**Present in a fresh worktree because they are committed**: `.mcp.json` (with its `${VAR}`
placeholders, hence the `.env` dependency), `opencode.jsonc`, `.codex/config.toml`,
`.claude/settings.json`, `.claude/commands/`, `.agents/project.yaml`, the Jira catalogs under
`.agents/`, and every T1 skill under `.agents/skills/`.

---

## 2 · The script

`bun run worktree:provision [<target path>]` closes the repairable rows above in one call. With no
argument it provisions the current directory, which is what makes it usable as an Orca setup hook.

```bash
bun run worktree:provision                       # provision the cwd (hook form)
bun run worktree:provision /path/to/worktree     # provision an explicit target
bun run worktree:provision /path/to/wt --dry-run # print what it would do, touch nothing
```

Implementation: `scripts/provision-worktree.ts` (Bun, cross-platform). It refuses to run on the
primary checkout, resolves the primary via git's common-dir, copies the secret files with mode
`0600` (guarding `chmod` on Windows), installs dependencies from the lockfile, runs
`bun run agents:compat` inside the target, copies the gitignored T3 skill directories and `.auth/`
when present, deliberately does NOT copy `.session/`, prints a summary plus the tracker-cache hint,
and exits non-zero on any hard failure.

What it deliberately leaves to a human decision: hydrating the tracker cache (it can be large and
slow, and a scoped per-issue sync is often enough) and minting tokens (conductor-only, see
`references/coordinator-playbook.md` §7).

---

## 3 · Making it the Orca setup hook

Today this repo's registered setup command installs dependencies only, which covers exactly one of
the seven rows above. Pointing the hook at the provisioning script closes six of them automatically
on every worktree the runtime creates.

**This can only be changed from the app's UI.** The setting is not exposed by the CLI
(`orca agent-context --json` has no command for it), so it cannot be scripted, cannot be versioned,
and must be redone on every machine. Read the current value before changing anything:

```bash
orca repo show --repo <selector> --json </dev/null   # read the registered setup command + policy
```

Then, in the app: Settings for this repository → the setup script field → set it to
`bun run worktree:provision`. Keep the setup policy at run-by-default so a newly created worktree
provisions itself before the agent starts.

The per-machine checklist this belongs to: `references/orca-machine-setup.md`.

---

## 4 · The provisioning checklist the conductor actually runs

For each new worktree, in this order, and none of it optional:

1. Create the worktree just before launching (one created half an hour earlier is born stale).
2. `git -C <wt> fetch origin` and verify `git -C <wt> rev-parse --short HEAD` equals
   `origin/<base>`. No `|| true`.
3. `bun run worktree:provision <wt>`.
4. Decide the tracker cache: full hydration, or a scoped per-issue sync named in the brief.
5. Confirm tokens exist and are readable by this worker (conductor-minted, never worker-minted).
6. Only now: create the terminal with the launch line, adopt it, deliver the brief.
7. Within a few minutes, verify the brief landed: a working-tree status check that is still empty
   after ten minutes means the worker received nothing. Re-send the line into the SAME terminal —
   the tab, the title and the dispatch binding all survive a shell-level failure, so recreating the
   terminal would orphan the dispatch row instead of fixing anything.
