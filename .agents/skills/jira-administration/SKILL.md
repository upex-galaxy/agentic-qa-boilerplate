---
name: jira-administration
description: "Administer Jira in two approval-gated modes: Components reconciliation and instance migration. Use when syncing or reconciling Jira components; when the Jira URL changed, the site migrated, or Jira must be repointed."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode, pi]
complementary_categories: [issue-tracker, meta-skill]
metadata:
  kind: workflow
---

# Jira Administration

Two jobs that change a live Jira or the repo's link to it. Both read first, propose a plan, and write only after approval.

## Mode routing

When the first token of `$ARGUMENTS` names a mode below (`/jira-administration components BK ../bunkai`), that token is the mode and the rest goes to the reference unchanged. Otherwise ask; a bare "fix Jira" or "sync Jira" does not pick one. The former `jira-components` and `jira-instance-migration` command names are only phrases a user may still type.

| Mode | When the user says | Reference |
|---|---|---|
| `components` | `jira-components`, reconcile or sync Jira Components | `references/components.md` |
| `instance-migration` | `jira-instance-migration`, the Jira instance changed, repoint Jira | `references/instance-migration.md` |

## Compact Rules

The sealed mutation contract. It binds every run of either mode.

- Take the mode from the first token of `$ARGUMENTS`; with no match, ask, and a bare "fix Jira" or "sync Jira" picks none.
- One mode per run. Load only its reference, never combine the two or fall through into the other, and run only the selected reference's verification steps.
- Load `/acli` before any Jira operation. Load other tool-owner skills only when the selected reference requires them.
- Missing MCP or Jira credentials is a hard stop (`AGENTS.md` Critical Rule #10). Name the exact env var, point at `.env` and `.env.example`, ask for an agent-session restart. No workaround, no partial run.
- Read the live state before authoring any plan. Nothing is created, applied, deleted or repointed without the user's explicit approval given inside the same run.
- `components`: derive and inspect, author the plan file, dry-run, wait for explicit approval, then `--apply`.
- `instance-migration`: resolve and confirm both instances, audit and verify reachability, wait for explicit approval, then change files or the `acli` session. That session lives at `~/.config/acli` and is machine-global, so a re-login repoints every repo on the host, not only this one.
- The Atlassian host lives in `.agents/project.yaml` under `issue_tracker.atlassian_url` and nowhere else locally. A stale `ATLASSIAN_URL` in `.env` or the process environment is contamination: delete it, never update it, because a second copy is what goes stale.
- Template-repo carve-out: when `.agents/project.yaml` has `project.project_name` set to `null`, the repo is an un-onboarded template. Leave `atlassian_url` and `project_key` as `null`, say so in the report, and do not create a commit to hide the emptiness.

**Read full SKILL.md when**: the mode is ambiguous, a dry-run diff or migration audit looks wrong, or you need the selected reference's step-by-step phases and verification list.

## With nobody at the keyboard

Every approval gate in both references follows `agentic-qa-core/references/decision-protocol.md`. A person present holds the gate. A supervised worker reports the plan or audit to its conductor and waits for the answer. A routine counts the delegating brief as approval only when it names this exact change: the mode, the project key and, for a migration, both hosts. Otherwise it does the read-only work (derive, list, dry-run, audit), puts the plan or findings in the report, and stops before any Jira write, credential login, push or message. A worker or routine whose brief names no mode reports that and stops; it does not guess one.
