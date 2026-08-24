---
name: jira-administration
description: "Run bounded Jira administration workflows for project Components or Atlassian instance migration. Use for jira-components, sync Jira components, jira-instance-migration, changed Jira URL, or repoint Jira. Both modes are sealed behind read-first analysis and explicit user approval before any Jira, credential-session, or repository mutation."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
complementary_categories: [issue-tracker, meta-skill]
---

# Jira Administration

## Mode routing

Choose exactly one mode and load only its reference.

| Mode | Legacy alias / trigger | Reference |
|---|---|---|
| `components` | `jira-components`, reconcile/sync Jira Components | `references/components.md` |
| `instance-migration` | `jira-instance-migration`, changed/repoint Jira instance | `references/instance-migration.md` |

If the mode is unclear, ask. Never combine both modes in one run.

## Sealed mutation contract

- Forward `$ARGUMENTS` unchanged.
- Load `/acli` before Jira operations. Load other tool-owner skills only when the selected reference requires them.
- Missing MCP or Jira credentials are a hard stop under `AGENTS.md` Critical Rule #10.
- `components`: derive and inspect, author the plan, run dry-run, then wait for explicit approval before `--apply`.
- `instance-migration`: resolve and confirm both instances, audit and verify reachability, then wait for explicit approval before changing files or the machine-global `acli` session.
- Run only the selected reference's verification. Never fall through into the other mode.
