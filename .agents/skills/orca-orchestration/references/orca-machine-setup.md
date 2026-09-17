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
the binary on demand (`orca skills get <topic>`), which is what this repo's references ask for.
Install them if you want the user-level trigger words; skip them and nothing breaks.

Note `orca skills install --local` installs into the current project instead of globally. In THIS
repo, do not use `--local`: a stub landing inside the project skill store would show up as an
untracked skill directory and collide with the repo's own tier model. Global (the default) or
`--agent universal`, and nothing else.

---

## 3 · Agent default arguments (the native-launch prerequisite)

This is the item that decides whether the NATIVE launch path is usable at all.

The default launch path in this repo is a custom argv: we create the terminal with our own command
line and then adopt it into the Task. That path needs no settings at all, which is exactly why it is
the default.

The native path (`worker-start --agent <agent> --model <id> --effort <level>`) lets the runtime start
the agent itself. It accepts a model and an effort level and **nothing else**: there is no argument
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
  Verified on this machine: OpenCode exposes `--auto` (auto-approve permissions not explicitly
  denied). For Codex, do not guess a flag — read its docs, then write the verified value here.
- **(unverified)** the exact label of the settings section and the field, which may differ per app
  version. Read the screen, do not trust this sentence.

Until that override exists on a machine, the native path is not usable there and the custom-argv
path is the only correct one. Neither the repo nor a teammate's machine can tell whether you did it,
which is the whole problem with a non-versionable setting.

---

## 4 · The setup hook → the provisioning script

```bash
orca repo list --json </dev/null
orca repo show --repo <selector> --json </dev/null     # read the CURRENT setup command + policy
```

Today the registered setup command for this repo installs dependencies only, which covers exactly
one of the seven gaps a fresh worktree has (`references/provisioning.md` §1). Point it at the
provisioning script instead and six close automatically:

- In the app: the repository's settings → the setup script field → `bun run worktree:provision`.
- Keep the setup policy at run-by-default, so a newly created worktree provisions itself before the
  agent starts.

**This setting is UI-only** (gotcha G24): the CLI does not expose it, the machine-readable command
schema has no command for it, and desktop automation is blocked by the OS permission model on
macOS. It cannot be scripted and it cannot be versioned.

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
    (only needed for the native launch path; the custom-argv default needs nothing)
[ ] other agents: their documented equivalent, verified, not guessed
[ ] repo setup script set to `bun run worktree:provision`, policy run-by-default
[ ] (optional) phone paired
[ ] a single test worker launched and released end to end BEFORE a real fleet
```

The last line is not decoration. A machine where nobody has ever released a worker is a machine
where the cleanup path is untested, and the cleanup path is the one that takes the runtime down when
it is wrong (gotcha G31).
