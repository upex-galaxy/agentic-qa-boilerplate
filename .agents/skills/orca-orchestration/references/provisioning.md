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
| `.env` | ignored | **silent on every host but Codex** (Critical Rule #10): `.mcp.json` uses `${VAR}` placeholders, and an unset `${VAR}` is passed through as the LITERAL string, so the server starts and dies on its first authenticated call (401/403), not at parse time. Any script needing credentials fails on missing variables. On Claude Code the worker reads the `env` block of `.claude/settings.local.json`, on OpenCode the `.auth/opencode/*` files: both come from `bun run harness:env`, see §1b | copy it from the primary checkout, mode `0600`. On the SUPERVISED path the file existing is not enough — see §1b |
| the `.claude/skills` alias → `.agents/skills` | ignored | loud, on Claude Code only: `Skill` answers `Unknown skill`. OpenCode and Codex read `.agents/skills/` natively and do not need it | `bun run agents:compat` inside the worktree (it creates a POSIX symlink or a Windows junction) |
| the T3 community skills `cli/install.ts` installs | ignored by explicit `.gitignore` entries | loud, at load time: the skill simply is not there | copy the directories from the primary checkout, or re-run the installer |
| `node_modules/` | ignored | loud **with the wrong message**: `Cannot find module`, which reads as a broken import | `bun install --frozen-lockfile` |
| `.context/PBI/` (the tracker cache) | ignored | **silent**: the worker cannot see the synced story and quietly works from the ticket title alone | `bun run context:hydrate`, or a scoped per-issue sync named in the brief |
| `.auth/` (tokens) | not committed, created at login | loud: authenticated API calls fail with 401 | the CONDUCTOR mints tokens before the round (`bun run api:login`, with a per-worker profile when workers must not share a token) and the worker only reads the file; copy mode `0600` |
| `api/openapi.json` (the synced spec) | ignored | loud, on the OpenAPI MCP only: with `OPENAPI_SPEC_PATH` pointing at it the server exits at start, before the handshake, and reads as a dead tool | copy it from the primary checkout (`worktree:provision` does), or `bun run api:sync` |
| `.session/` | ignored | the brief, the roster and the run files are simply absent inside the worktree | do NOT copy it. Cite ABSOLUTE paths into the PRIMARY checkout (`<<PRIMARY_ROOT>>`, `.agents/README.md` §"Checkout roots") from the prompt. Anything written inside a worktree dies with it; `bun run worktree:audit --rescue` (§5) copies what a worker wrote there anyway |

**Present in a fresh worktree because they are committed**: everything `git ls-files` lists, which
includes the MCP config of each host (with its `${VAR}`-style placeholders, hence the `.env`
dependency), `.agents/project.yaml`, the Jira catalogs under `.agents/`, and every T1 skill under
`.agents/skills/`.

---

## 1b · The env file is present and the supervised worker still has no credentials

A launch line LOADS the env file (the repo's own wrapper does it, which is why the human-paste path
is immune). The supervised native launch has no launch line, so a worker gets credentials only from
what it can read WITHOUT a shell:

- **Claude Code**: the `env` block of `.claude/settings.local.json`, resolved from the MAIN checkout's
  root on macOS/Linux (measured), so a worktree inherits it with no action. Provision copies the file
  anyway, mode `0600`.
- **OpenCode**: `.auth/opencode/<VAR>` via `{file:}` references in `opencode.jsonc`, relative to the
  worktree. Provision copies `.auth/` from the primary; `bun install` creates empty placeholders on a
  fresh clone so the config loads (degraded, not broken).
- **Codex**, and anything inside a worker that reads a shell-exported variable (`acli`, `curl`,
  `bun xray`): the process environment only. Here the seam is **direnv firing in Orca's interactive
  shell**. On a machine without it, that worker is fully provisioned, starts cleanly, and has no
  credentials, and nothing says so until its first authenticated call fails with an error that reads
  like a broken tool (gotcha G45).

The Claude and OpenCode surfaces are derived from `.env` by `bun run harness:env`. Run it in the
primary after every `.env` change (Claude reads the primary's file; OpenCode gets its copy at
provision time), then restart the agent session: MCP servers read credentials at startup.

So for every worker launched on the native path, in this order:

1. `bun run harness:env` up to date in the primary. For a Codex worker, or a brief that calls
   shell-exported CLIs: direnv installed and hooked, `.envrc` sourcing the env file, `direnv allow`
   run once per checkout (`references/orca-machine-setup.md` §3.2). Provision runs
   `direnv allow <worktree>` itself when direnv is installed AND the primary's `.envrc` is already
   allowed, and prints what it did. Per machine; not versionable; invisible to the repo.
2. The conductor **reads the worker's screen and confirms credentials loaded** before sending it any
   work (`references/coordinator-playbook.md` §1 step 5). An MCP tool listed as connected, a direnv
   export line, or the worker's own first probe is the evidence. No evidence → fix the machine, do
   not dispatch work.

No direnv on this machine → Claude and OpenCode workers still run supervised. A Codex worker, or any
worker whose brief needs shell-exported variables, runs on pasted custom-argv lines, which carry their
own env loading and lose supervision (`references/launch-seam.md` §1).

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
primary checkout, resolves the primary via git's common-dir, copies every gitignored input a
worktree cannot rebuild that the primary has (`PROVISION_COPIES` in `cli/lib/worktree.ts`: `.env` and
its local overrides, the Claude settings, `.auth/`, the OpenAPI config and spec, local MCP overrides,
the installer state; secrets at mode `0600`, guarding `chmod` on Windows), installs dependencies from
the lockfile, runs `bun run agents:compat` inside the target, copies the gitignored T3 skill
directories, deliberately does NOT copy `.session/`, prints a summary plus the tracker-cache hint, and
exits non-zero on any hard failure. The committed `.worktreeinclude` names the same list, and a test
keeps the two equal.

What it deliberately leaves to a human decision: hydrating the tracker cache (it can be large and
slow, and a scoped per-issue sync is often enough) and minting tokens (conductor-only, see
`references/coordinator-playbook.md` §7).

---

## 3 · Making it the Orca setup hook

The repo commits `orca.yaml` at its root, and Orca reads it as the repo's shared hooks: `scripts.setup`
runs `bun run worktree:provision` in every worktree Orca creates, and `scripts.archive` runs
`bun run worktree:audit --rescue` before Orca removes one (§5). Both run with the worktree as their
working directory, which is why neither names a path. Nobody has to set anything per machine.

Three things still decide whether the committed hooks run, and they are per machine:

- **Trust.** The first run of each hook shows the script and asks; the answer is remembered until the
  script changes.
- **Source policy.** Settings for this repository → Hooks can hold a LOCAL script too, and a policy
  that picks shared, local or both. A local-only policy ignores `orca.yaml`. Read what is registered
  before assuming:

  ```bash
  orca repo show --repo <selector> --json </dev/null   # registered hooks + policy
  ```

- **The CLI skips archive hooks by default.** `orca worktree rm` runs them only with `--run-hooks`;
  a conductor that removes from the CLI passes it (`references/coordinator-playbook.md` §6).

A machine where the committed hooks do not run (policy, an older Orca, a declined trust prompt) falls
back to the manual steps: `bun run worktree:provision <wt>` in §4 and the audit in §5. Keep the setup
policy at run-by-default so a new worktree provisions itself before the agent starts; whether the
agent waits for setup under `start-immediately` is unverified, so read the worker's screen before
sending it work (§4 step 6).

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
6. Only now: launch the supervised worker, read its screen for the status footer AND for credentials
   (§1b), then send it the prompt that points at its brief
   (`references/coordinator-playbook.md` §1 steps 4-6).
7. Within a few minutes, verify the prompt landed: a working-tree status check that is still empty
   after ten minutes means the worker received nothing. Re-send into the SAME terminal — the tab, the
   title and the dispatch binding all survive a failure, so creating a new terminal would orphan the
   dispatch row instead of fixing anything. Check the screen first: a send that answered
   `agent_prompt_stalled` has usually already queued the text (gotcha G52).

---

## 5 · Before a worktree is removed

Removing a worktree deletes everything git ignores inside it, and every removal path (`git worktree
remove` without `--force`, Orca's delete, a harness's own cleanup) does it silently. Run the audit
first:

```bash
bun run worktree:audit <wt>            # read-only; exit 1 while STATE or UNKNOWN is only in the worktree
bun run worktree:audit <wt> --rescue   # copy STATE to the same path in the primary, never overwriting
```

It classifies each gitignored path from one table (`AUDIT_RULES` in `cli/lib/worktree.ts`): STATE
(`.session/`, `.scratch/`, PBI evidence and `[LOCAL]` notes, `.context/reports/`, updater state)
belongs in the primary; CACHE comes back with a command it names; DISPOSABLE is safe to lose; UNKNOWN
matched no rule and is decided by hand. Test-run outputs (Allure history, `reports/` for the TMS sync,
refreshed `.auth/` tokens) are DISPOSABLE by the owner's decision: they are never rescued and their
loss is accepted. The committed `orca.yaml` archive hook runs the rescue form; the full orphan audit,
with uncommitted work and unpushed commits, is `references/coordinator-playbook.md` §6.

