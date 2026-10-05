# Per-Machine Setup — The One-Time Checklist

> Loaded by: whoever sets up a new machine, once.
> **None of this is versionable.** Every item below lives in the app's own settings store on THIS
> computer. There is no repo file that carries it, no CLI command that sets it, and therefore no
> way for `bun run up` or a fresh clone to restore it. That is the reason this file exists: so the
> list is at least written down, even though it cannot be automated.

---

## 1 · Install the binary and confirm the runtime

```bash
command -v orca                                  # the binary
orca status --json </dev/null | jq '.result.runtime'
#   want: state "ready", reachable true; note appVersion — the gotcha table is keyed to it
orca open --json </dev/null                      # if the runtime is not reachable
```

The gate this repo uses is `binary + reachable runtime`, never "is a vendor skill installed"
(`SKILL.md` §The gate). A machine with the binary and no stubs is fully capable.

**Gotcha (Linux)**: outside an Orca-managed terminal the CLI registers as `orca-ide`, because
`/usr/bin/orca` is the GNOME Orca screen reader. Run the gate with `command -v orca-ide` there
and use `orca-ide` for every later command; inside Orca's own terminals `orca` is correct.

Install instructions come from the vendor, not from here — this repo's installer lists the binary as
an OPTIONAL external CLI and reports its absence without ever failing
(`cli/install.ts`, the external-CLI table).

---

## 2 · Vendor skill stubs (optional)

```bash
orca skills list                                 # the bundled guide topics
orca skills install --skill orchestration --skill orca-cli --agent universal
orca skills installed
```

These are **optional and never required**. The stubs teach WHEN, not HOW; the grammar is served by
the binary on demand (`orca skills get <topic>`), which is what this repo's references ask for on the DEEP topics; the stubs themselves are loaded, not fetched (`.agents/instructions/agent-skills-and-mcps.md`).
Install them if you want the user-level trigger words; skip them and nothing breaks.

Note `orca skills install --local` installs into the current project instead of globally. In THIS
repo, do not use `--local`: a stub landing inside the project skill store would show up as an
untracked skill directory and collide with the repo's own tier model. Global (the default) or
`--agent universal`, and nothing else.

---

## 3 · The native-launch prerequisites

Item 3.1 decides whether **supervision** is available on this machine at all, so it is not an
optional extra; item 3.2 decides whether a supervised worker has its credentials, and needs nothing
per machine. The native launch (`worker-start --agent <agent> --model <id> --effort <level>`) is
the ONLY supervised one: the runtime recognizes only agents it started itself, so a terminal created
from our own command line can never be adopted (`references/gotchas.md` G44). A machine that has not
done item 3.1 can still run a fleet, but every worker on it is unsupervised.

### 3.1 · The agent's default arguments (permission mode)

The native path accepts a model and an effort level and **nothing else**: there is no argument
passthrough on `worker-start` or on `worktree create`, so a permission mode cannot be expressed as a
flag. It has to be a per-agent default configured in the app:

1. Open the app's Settings → the Agents section.
2. For the `claude` agent, add `--permission-mode auto` to its default arguments.
3. Leave the run mode per-agent: an agent with its own argument override is excluded from the global
   yolo / manual switch, which is what you want — you do not want a global switch deciding a worker's
   permission model.

Two things to know before relying on it:

- The app's own "yolo" mode injects a FIXED flag per agent, and it is NOT an auto permission mode:
  for `claude` it is the skip-permissions flag, for `codex` the bypass-approvals-and-sandbox flag.
  Those are broader than what a worker needs. The auto-mode classifier belongs to Claude Code, not
  to the runtime, and that classifier is the thing worth keeping alive (gotcha G27).
- For any agent other than `claude`, **consult that agent's own documentation** for its equivalent.
  OpenCode exposes `--auto` (auto-approve permissions not explicitly denied); confirm it with
  `opencode --help` on the machine. For Codex, do not guess a flag — read its docs, then write the
  verified value here.
- **(unverified)** the exact label of the settings section and the field, which may differ per app
  version. Read the screen, do not trust this sentence.

Until that override exists on a machine, a native worker launches in whatever mode the app's
per-agent default gives it, which is the trap gotcha G27 describes. Neither the repo nor a teammate's
machine can tell whether you did it, which is the whole problem with a non-versionable setting.

### 3.2 · Credentials for a supervised worker: the `.env` loader

A launch line can export variables; the native launch cannot, because it has no argv. So no MCP
server depends on the launch: every one that needs `.env` values starts through the `.env` loader
declared in `.mcp.json`, `opencode.jsonc` and `.codex/config.toml` (`varlock run ... --filter <its
vars> -- <server>`, ADR-0011), which reads the varlock schema plus `.env` / `.env.local` from the
worktree root when the harness spawns the server. NO shell is involved, for Claude Code, OpenCode
and Codex workers alike. Nothing here is set per machine: what this item needs is the worktree's own
`.env`, which provisioning copies.

- **What the worker needs is its own `.env`.** `bun run worktree:provision` copies it from the
  primary. A worktree without one hands every server empty values, and the hook says so on the
  first prompt.
- **The plaintext copies an older `bun run harness:env` generated** (the `env` block of
  `.claude/settings.local.json`, `.auth/opencode/<VAR>`) are retired by the current one.
  `bun run worktree:provision` copies `.auth/opencode/` only while the worktree's `opencode.jsonc`
  still has `{file:}` references, and never copies `.auth/harness-env-backup/`.
- **Every other process a worker runs loads its own config too; no secret is ever exported into
  the worker's shell.** Bun scripts (`bun run jira:*`, `bun run api:login`, `bun xray`, the acli
  helper scripts) read `.env` through Bun's autoload; `acli` uses its own stored auth and `gh` its
  keyring; a raw `curl` that needs `ATLASSIAN_EMAIL` / `ATLASSIAN_API_TOKEN` runs inside
  `bunx varlock run --filter ATLASSIAN_EMAIL,ATLASSIAN_API_TOKEN -- sh -c '...'`; an app-API `curl`
  runs `source .auth/tokens.env` in the same command. Secret-manager mode: Bun's autoload does not
  resolve 1Password references, so such a script runs through `bunx varlock run -- <cmd>`.

```bash
# after every .env change: restart the agent session (MCP servers read .env at spawn)
test -f .env && echo present || echo MISSING     # in the worker's worktree: presence only, never the content
# Claude Code: /mcp lists every server connected; the other harnesses: their own server listing
```

Two rules that follow:

- The conductor **verifies credentials on the worker's screen** before sending it any work
  (`references/coordinator-playbook.md` §1 step 5), whichever harness it runs: its MCP servers
  connected and its worktree holding `.env`. Readiness is not capability.
- Nothing in this repo may depend on a secret exported into a shell: the custom-argv line starts the
  harness binary bare, exactly like the native launch, so the human-paste path relies on the same
  loaders listed above and needs the same worktree `.env`.

---

## 4 · The setup and archive hooks → the committed `orca.yaml`

The repo commits `orca.yaml`: `scripts.setup` runs `bun run worktree:provision` in every new worktree
and `scripts.archive` runs `bun run worktree:audit --rescue` before one is removed
(`references/provisioning.md` §3). Nothing is set per machine, but three per-machine things decide
whether it runs, so read them once:

```bash
orca repo list --json </dev/null
orca repo show --repo <selector> --json </dev/null     # registered hooks + source policy
```

- The source policy in the repository's Hooks settings must not be local-only, or `orca.yaml` is
  ignored. A local script set before `orca.yaml` existed (often `bun install`) is redundant now.
- Approve the trust prompt the first time each hook runs; it asks again when the script changes.
- Keep the setup policy at run-by-default, so a new worktree provisions itself before the agent
  starts.

A machine where the committed hooks cannot run falls back to setting the setup script field in the
app to `bun run worktree:provision` (UI only, gotcha G24) and running the audit by hand before every
removal.

---

## 5 · Mobile pairing (optional)

Pairing a phone is what makes "send me the summary on my phone" real: the board card, its comment
and shared artifacts become readable away from the desk, and a blocking question can be answered
from there. The pairing flow lives in the app plus the environment commands
(`orca environment list` / `orca environment add --pairing-code <code>`); the pairing code itself is
issued by the app. Which controls the phone offers over a blocking question is **(unverified)** —
find out during a real fleet, and record it in `references/gotchas.md`.

---

## 6 · The checklist, to copy

```
[ ] binary installed, `orca status` reports a reachable runtime; appVersion noted
[ ] (optional) vendor stubs installed GLOBALLY, never --local in this repo
[ ] Settings -> Agents: `claude` default args include `--permission-mode auto`
    (prerequisite of the SUPERVISED native launch; a pasted custom-argv line needs nothing)
[ ] other agents: their documented equivalent, verified, not guessed
[ ] the worktree has its own `.env` and the session restarted after the last `.env` change (every
    MCP server reads it through the `.env` loader; verify its servers connected on the worker's
    screen at launch)
[ ] `orca.yaml` hooks honoured: source policy not local-only, trust approved, setup run-by-default
[ ] (optional) phone paired
[ ] a single test worker launched and released end to end BEFORE a real fleet
```

The last line is not decoration. A machine where nobody has ever released a worker is a machine
where the cleanup path is untested, and the cleanup path is the one that takes the runtime down when
it is wrong (gotcha G31).
