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

## Compact Rules

The sealed mutation contract. Binding on every run of either mode:

- Exactly ONE mode per run: `components` (`references/components.md`) or `instance-migration` (`references/instance-migration.md`). Load only that mode's reference. Never combine the two, never fall through into the other.
- Mode unclear → ASK. Do not infer one from a bare "fix Jira" / "sync Jira" request.
- Load `/acli` before any Jira operation. Load other tool-owner skills only when the selected reference requires them.
- Missing MCP or Jira credentials = HARD STOP (`AGENTS.md` Critical Rule #10). Name the exact env var, point at `.env` / `.env.example`, ask for an agent-session restart. No workaround, no partial run.
- Read-first on every mutation: inspect the live state before authoring any plan. Nothing is created, applied, deleted, or repointed without the user's explicit approval given inside the same run.
- `components`: derive and inspect → author the plan file → dry-run → WAIT for explicit approval → only then `--apply`.
- `instance-migration`: resolve and confirm BOTH instances → audit and verify reachability → WAIT for explicit approval → only then change files or the `acli` session. That session lives at `~/.config/acli` and is machine-global: re-login repoints every repo on the host, not just this one.
- The Atlassian host lives in `.agents/project.yaml` → `issue_tracker.atlassian_url` and NOWHERE else locally. A stale `ATLASSIAN_URL` in `.env` or the process environment is contamination to DELETE, never to update — a second copy is what goes stale.
- Template-repo carve-out: if `.agents/project.yaml` → `project.project_name` is `null`, the repo is an un-onboarded template. Leave `atlassian_url` and `project_key` `null`, say so in the report, and never manufacture a commit to hide the emptiness.
- Run only the selected reference's verification steps. Never run the other mode's.
- Forward `$ARGUMENTS` unchanged.

**Read full SKILL.md when**: the mode is ambiguous, a dry-run diff or migration audit looks wrong, or you need the selected reference's step-by-step phases and verification list.
