---
name: jira-components
description: Reconcile a Jira project's Components against the target application's real functional modules through a plan file the user approves before anything is written. Not for setting components on an issue, Jira field or workflow catalogs, or repointing the instance (mode `instance-migration`).
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode, pi]
---

# Jira Components Sync

Derive the target application's functional modules from its source, compare them with the Jira project's live Components, and reconcile the two through `scripts/sync-jira-components.ts`.

**Inputs**: `$ARGUMENTS` holds the Jira project key and/or the path to the target application's source, both optional. Phase 1 resolves what is missing: `{{PROJECT_KEY}}` from `.agents/project.yaml`, the target repo from the session or by asking.

```
/jira-administration components                 # -> resolve key + target repo, then run the 4 phases
/jira-administration components BK ../bunkai    # -> explicit key + target source
```

The doctrine is `.agents/skills/agentic-qa-core/references/defect-management-doctrine.md` Part 3: one component is one functional module of the running application, derived from the app's real surface and not from the planning taxonomy. This mode materializes that convention in a project's Components module.

---

## Hard gate: no writes without explicit approval

Phases 1 to 3 read and propose. Only Phase 4 writes, and only after the user has seen the plan table (renames with their issue counts, creates) and said yes. The script has the same posture: a dry run is its default and `--apply` is a deliberate second step. As in mode `instance-migration`, silence or ambiguity means stop and ask.

The flow is plan-driven because deriving modules from a codebase is a judgement call: which routes collapse into one module, what the product's own vocabulary is. The AI authors a plan, a human approves it, and the script executes only what the approved plan says. Autodetection would skip the step that makes the result reviewable before it reaches a production Jira.

`acli` cannot create, rename or delete components. That is why the script speaks the REST API directly and why this mode drives the script and not `[ISSUE_TRACKER_TOOL]`.

**Prerequisites**: `ATLASSIAN_EMAIL` and `ATLASSIAN_API_TOKEN` in `.env`, and the host resolved from `.agents/project.yaml` (`issue_tracker.atlassian_url`, env fallback). Missing credentials stop the run (Critical Rule #10): name the variable, point at `.env.example`, no workaround.

---

## Phase 1: derive the module map

This phase is judgement: the AI proposes and the user decides. The map comes from two inputs. Using only the first silently drops every module the team has planned but not yet built.

### 1a: what exists, from the app's source

Read the target application and extract its real surface:

- **Next.js App Router**: the route tree. `app/**/page.tsx` is the UI surface and `app/api/**/route.ts` the API surface.
- **Other stacks**: the equivalent, whether router config, controllers or blueprints, whatever declares what the running app serves.

Collapse routes into functional modules using the product's own vocabulary. `/checkout/cart` and `/checkout/payment` are probably one `Checkout` module, and `/auth/login` and `/auth/register` are `Auth`. Group by what a user or an API client would call one area of the product, not by directory count.

### 1b: what is coming, from the backlog's scope

Read the project's Epics and Stories (`bun run jira:sync-issues pull --dry-run`, or the already-synced `.context/PBI/epics/`) and look for product areas the source does not have yet.

A component may be declared ahead of the code (doctrine Part 3). A feature in refinement has Stories, ACs and often Tests before it has a route, and each of them needs a component. Waiting for the code leaves that work without a component exactly while planning metrics would be useful, and it produces the failure this step prevents: an issue that fits no component, found when someone tries to file it.

Forward-declaring is cheap and safe. `create` is additive, `rename` re-labels without touching an issue assignment, and the mode is re-run as the map evolves. A module that ships under a different name becomes a rename, and one that never ships is one unused row.

### 1c: present the proposal

Show the module list with what each one absorbs: routes for existing modules, the Epic or Story for forward-declared ones. Mark which is which so the user can correct the grouping, and apply the naming-collision check below.

**Naming-collision check (doctrine Part 3).** Check whether the product's domain vocabulary overlaps QA's own, such as `Tests`, `Runs`, `Bugs` or `Suites` as product features. If it does, raise it and propose prefixing every component with the product name (`{{PROJECT_NAME}} Tests`, `{{PROJECT_NAME}} Runs`). This is the normal case for developer tools, testing products and project-management products, and unnecessary where nothing collides. The prefix is part of the plan the user approves, so propose it openly.

---

## Phase 2: read the project's current Components

```bash
bun scripts/sync-jira-components.ts --list --project {{PROJECT_KEY}}
```

This prints every live component with its issue count, and the counts are the point. A component that carries issue assignments cannot simply be replaced, because deleting and recreating it under a new name orphans every issue that references it. The script therefore treats rename as a separate operation from create: a rename preserves all existing assignments, and it is how an existing component moves to a new convention without a bulk issue edit.

Diff the live list against the Phase 1 proposal and classify each proposed module as already existing (skip), existing under an old or ambiguous name (rename), or missing (create).

---

## Phase 3: author the plan file and get approval

Write the plan to `.context/reports/jira-components-plan.json`, in the shape the script consumes:

```json
{
  "project": "<KEY>",
  "rename": [{ "from": "Bugs & Defect Heatmap", "to": "Bunkai Bugs" }],
  "create": [{ "name": "Bunkai Auth", "description": "Login, registration, sessions" }]
}
```

Present it to the user as a table with renames separated from creates and the issue count on every rename, so the user sees what is at stake in each one. Run the script's dry run to show what it resolves. A rename whose source is gone or whose target already exists degrades to a documented skip, and re-running a partly applied plan is normal.

```bash
bun scripts/sync-jira-components.ts .context/reports/jira-components-plan.json
```

Wait for explicit approval. The user may edit the grouping, the names or the prefix decision. Regenerate the plan and present it again until they approve. Without a person to approve, the `## With nobody at the keyboard` rule in `SKILL.md` applies: the plan file and the dry-run output go into the report and Phase 4 does not run.

---

## Phase 4: apply and verify

Only after approval:

```bash
bun scripts/sync-jira-components.ts .context/reports/jira-components-plan.json --apply
bun scripts/sync-jira-components.ts --list --project {{PROJECT_KEY}}
```

The second command is the verification: the live list must now match the approved plan, with renames showing their preserved issue counts and creates present. Report the final component list, what was renamed, created and skipped, and any skip whose reason the user should review.
