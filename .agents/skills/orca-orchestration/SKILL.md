---
name: orca-orchestration
description: "Renamed: this skill is now the user-level skill agent-orchestration. Load agent-orchestration instead whenever this name is asked for; this file only points there."
license: MIT
compatibility: [claude-code, codex, opencode, pi]
metadata:
  kind: workflow
---

# orca-orchestration: renamed to `agent-orchestration`

1. This skill was renamed: load `/agent-orchestration` (a user-level skill) for every conductor, worker and routine step.
2. Not installed: run `bun setup`, which installs it at user level; `bun run setup:doctor` reports whether it is present.
3. What only this repo adds stays here: `agentic-qa-core/references/fleet-launch-seam.md`, `fleet-provisioning.md` and `fleet-project-profile.md`.
4. Hard-rule, worker-rule and gotcha numbers are unchanged, so a citation such as "hard rule 23" or "G44" reads the same in `/agent-orchestration`.
5. This stub is removed once every repo has synced the rename.
