# Per-Machine Setup — The One-Time Checklist

> Loaded by: whoever sets up a new machine, once.
> **None of this is versionable.** Every item below lives in the app's own settings store on THIS
> computer. There is no repo file that carries it, no CLI command that sets it, and therefore no
> way for `bun sync` or a fresh clone to restore it. That is the reason this file exists: so the
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

These are **optional and never required**. The stubs carry the command grammar and are loaded alongside
`orca-orchestration` (the list is `orchestration.orchestrator_skills` in `.agents/project.yaml`); the binary
serves the DEEP topics a stub points at on demand (`orca skills get <topic>`). Skip them and nothing breaks:
the binary still answers for the grammar.

Note `orca skills install --local` installs into the current project instead of globally. In THIS
repo, do not use `--local`: a stub landing inside the project skill store would show up as an
untracked skill directory and collide with the repo's own tier model. Global (the default) or
`--agent universal`, and nothing else.

---

## 3 · The native-launch prerequisites

Supervision comes from the native launch alone (`worker-start --agent <agent> --model <id> --effort
<level>`): the runtime recognizes only agents it started itself, so a terminal created from our own
command line can never be adopted (`references/gotchas.md` G44). Item 3.1 decides the PERMISSION
MODE a supervised worker runs in, which the conductor verifies at readiness; a machine whose default
arguments do not match the profile still supervises its workers, and the mismatch is caught on the
first worker's screen and fixed before any work is dispatched. Item 3.2 decides whether a supervised
worker has its credentials, and needs nothing per machine.

### 3.1 · The agent's default arguments (permission mode per tier)

The native path accepts a model and an effort level and **nothing else**: there is no argument
passthrough on `worker-start` or on `worktree create`, so a permission mode cannot be expressed as a
flag. It has to be a per-agent default configured in the app. The profile DECLARES the mode each
tier should run in (`orchestration.permission_modes` in `.agents/project.yaml`, repo vocabulary
`bypass | auto | ask | inherit`; why these defaults and the risk they accept:
`.context/ADR/ADR-0024-agentic-work-profile-and-permission-posture.md`); this table translates it per
harness, and the conductor VERIFIES the result on each worker at readiness
(`references/coordinator-playbook.md` §1 step 5).

| Mode | Claude Code | Codex CLI (rust-v0.165.0) | OpenCode (v1.19.5 / v2.2.0) | Pi (v1.4.0; not a supported harness of this repo) |
|---|---|---|---|---|
| bypass | `--dangerously-skip-permissions` (= `--permission-mode bypassPermissions`); the first run needs `skipDangerousModePermissionPrompt: true` in the user settings | `--dangerously-bypass-approvals-and-sandbox` (`-a never -s workspace-write` keeps `.git` read-only and the network off: a worker cannot commit) | `--auto` (hidden aliases `--yolo`, `--dangerously-skip-permissions`) or `"permission": {"*": "allow"}` | nothing to set (no approval system); pass `--approve` to skip the project-trust prompt |
| auto | `--permission-mode auto` (a classifier; it pauses and PROMPTS after 3 consecutive or 20 total blocks, and falls back to manual when it is unavailable) | `--approve-for-me` (a reviewer model answers approvals) | no equivalent (closest: per-tool `ask` / `allow` / `deny`) | no equivalent |
| ask | the default mode | `-a on-request` | the default | n/a |
| inherit | a subagent inherits the parent session's mode | same | same | same |

Sources, read 2026-10-28 (versions as named; harness flags move, so confirm with `<harness> --help`
on the machine): code.claude.com/docs/en/permission-modes and /cli-reference; learn.chatgpt.com
Codex approvals and security plus `codex-rs` at tag rust-v0.165.0; opencode.ai/docs/permissions and
/docs/cli; earendil-works/pi `packages/coding-agent/docs/security.md`.

What still stops each mode, so nobody reads `bypass` as "nothing ever stops" (same research): Claude
Code bypass still stops on its first-run dialog (item 4 below), on explicit `ask` rules, on
`AskUserQuestion` and on protected-path deletes, and refuses to run as root; OpenCode `--auto` still
applies an explicit `deny`; Codex's full bypass has no sandbox (full disk and network), and whether
a destructive-annotated MCP call still asks under it is **(unverified)**. The repo's own
`permissions.deny` list stays in every mode. `auto` and an edits-only mode
(`acceptEdits`) are not non-interactive: the first stalls after its block limit, the second on its
first Bash call, and a worker nobody watches stalls with them (gotcha G27).

What to set in the app (Settings, the Agents section), per agent the fleet uses:

1. **Worker tier** (`orchestration.permission_modes.worker`): the agent's default arguments carry the
   flag of that mode from the table. Orca's own default Claude launch has been measured carrying
   `--dangerously-skip-permissions` already (gotcha G79 holds the date and the app version), so for
   `claude` with the shipped `bypass` there may be nothing to add; read what is there rather than
   assuming it.
2. **Conductor tier** (`orchestration.permission_modes.conductor`): a conductor is the session the
   human types into, usually started by hand. Start it with that mode's flag
   (`claude --permission-mode auto` for the shipped `auto`). A middle conductor started with `agent launch` (G77) is unsupervised:
   pass the flag there if `orca agent launch --help` lists an argument passthrough, otherwise the
   agent's default arguments decide its mode as they do a worker's, and the conductor reads it off
   the screen.
3. **Subagent tier** (`inherit`): nothing to set; a subagent runs in its parent session's mode.
4. **Claude Code with bypass**: set `skipDangerousModePermissionPrompt: true` in the user-level
   settings once, or every bypass worker stops on a first-run confirmation dialog that nobody sees.
5. Leave the run mode per-agent: an agent with its own argument override is excluded from the global
   yolo / manual switch, which is what you want: a global switch never decides a worker's mode.

- **(unverified)** the exact label of the settings section and the field, which may differ per app
  version. Read the screen, do not trust this sentence.

The security tradeoff of a bypass worker, stated once: an instruction injected through content the
worker reads (a page of the app under test, a tracker comment) runs with the owner's rights and
network. The repo's `permissions.deny` list stays in force; the accepted risk is recorded in ADR-0024.

Until the default arguments match the profile on a machine, a native worker launches in whatever
mode the app's per-agent default gives it. Neither the repo nor a teammate's machine can tell whether
you set it, which is the whole problem with a non-versionable setting, and why the conductor reads
the mode off each worker instead of trusting this checklist.

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
[ ] Settings -> Agents: each agent's default args carry the flag of
    `orchestration.permission_modes.worker` from the §3.1 table (claude bypass:
    `--dangerously-skip-permissions`, already in Orca 1.4.240's default launch, G79; a pasted
    custom-argv line carries its own flag)
[ ] Claude Code with bypass: `skipDangerousModePermissionPrompt: true` in the user settings
[ ] other agents: the §3.1 flag, confirmed with `<harness> --help` on this machine, not guessed
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
