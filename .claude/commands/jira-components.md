---
name: jira-components
description: Reconcile a Jira project's Components against the target application's real functional modules, driving `scripts/sync-jira-components.ts` through a plan file the user approves before anything is written. Triggers on 'sync jira components', 'set up components', 'create the components in Jira', 'los components de Jira', 'component plan', 'rename these components', 'align components with the app'. Do NOT use for: setting components ON an issue (that is normal issue filing per the defect-management doctrine), Jira field/workflow catalogs (run `bun run jira:sync-fields` / `jira:sync-workflows`), or repointing the instance (use /jira-instance-migration).
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
---

# Jira Components Sync

Derive the target application's functional modules from its source, compare them against the Jira project's live Components, and reconcile the two through `scripts/sync-jira-components.ts`.

**Inputs**: `$ARGUMENTS` — optionally the Jira project key and/or the path to the target application's source. Both may be omitted; Phase 1 resolves them (`{{PROJECT_KEY}}` from `.agents/project.yaml`, the target repo from the session or by asking).

```
/jira-components                       # -> resolve key + target repo, then run the 4 phases
/jira-components BK ../bunkai          # -> explicit key + target source
```

Doctrine: `.claude/skills/agentic-qa-core/references/defect-management-doctrine.md` Part 3 — one component = one functional module of the running application, derived from the app's real surface, not from the planning taxonomy. This command is how that convention gets materialized in a project's Components module.

---

## Hard gate — no writes without explicit approval

**Never write to Jira without the user's explicit approval of the plan.** Phases 1-3 read and propose; only Phase 4 writes, and only after the user has seen the plan table (renames with their issue counts, creates) and said yes. The script enforces the same posture: dry run is its default, `--apply` is a deliberate second step. Matching `/jira-instance-migration`, silence or ambiguity means stop and ask.

Why the flow is plan-driven at all (from the script's own header): deriving modules from a codebase is a judgement call — which routes collapse into one module, what the product's own vocabulary is — so the AI authors a plan, a human approves it, and the script only executes what the approved plan says. Autodetection would skip the one step that makes the result reviewable before it reaches a production Jira.

`acli` cannot create, rename, or delete components — which is why the script speaks the REST API directly and why this command drives the script rather than `[ISSUE_TRACKER_TOOL]`.

**Prerequisites**: `ATLASSIAN_EMAIL` + `ATLASSIAN_API_TOKEN` in `.env`, host resolved from `.agents/project.yaml` (`issue_tracker.atlassian_url`, env fallback). Missing credentials = STOP per Critical Rule #10 — name the variable, point at `.env.example`, no workaround.

---

## Phase 1 — Derive the module map

This phase is judgement, not mechanics: **the AI proposes, it does not decide.**

The map comes from **two** inputs. Using only the first is the easy mistake, and it silently drops every module the team has planned but not yet built.

### 1a — What exists: the app's source

Read the target application and extract its real surface:

- **Next.js App Router**: the route tree — `app/**/page.tsx` for UI surface, `app/api/**/route.ts` for API surface.
- **Other stacks**: the equivalent — router config, controllers, blueprints, whatever declares what the running app actually serves.

Collapse routes into functional modules using the product's own vocabulary (`/checkout/cart` and `/checkout/payment` are probably one `Checkout` module; `/auth/login` and `/auth/register` are `Auth`). Group by what a user or an API client would call one area of the product, not by directory count.

### 1b — What is coming: the backlog's own scope

Read the project's Epics and Stories (`bun run jira:sync-issues pull --dry-run`, or the already-synced `.context/PBI/epics/`) and look for product areas the source does not have yet.

A component may be declared **ahead of the code** — see the doctrine, Part 3. A feature in refinement has Stories, ACs and often Tests before it has a route, and every one of them needs a component. Waiting for the code means that work stays uncomponented exactly while planning metrics would be useful, and it produces the failure this step exists to prevent: an issue that fits no component, discovered when someone tries to file it.

Forward-declaring is cheap and safe. `create` is additive, `rename` re-labels without touching a single issue assignment, and the command is re-run as the map evolves — so a module that ships under a different name is a rename, and one that never ships is one unused row.

### 1c — Present the proposal

Show the module list with what each one absorbs — routes for existing modules, the Epic or Story for forward-declared ones — and mark which is which, so the user can see and correct the grouping. Also apply the naming-collision check below.

**Naming-collision check (doctrine Part 3).** While proposing, check whether the product's domain vocabulary overlaps QA's own — `Tests`, `Runs`, `Bugs`, `Suites` as product features. If it does, raise it and propose prefixing every component with the product name (`{{PROJECT_NAME}} Tests`, `{{PROJECT_NAME}} Runs`). This is the normal case for developer tools, testing products, and project-management products, and unnecessary where nothing collides. Do not apply the prefix silently — it is part of the plan the user approves.

---

## Phase 2 — Read the project's current Components

```bash
bun scripts/sync-jira-components.ts --list --project {{PROJECT_KEY}}
```

This prints every live component **with its issue count**. The counts are the point: a component that already carries issue assignments cannot simply be replaced — deleting and recreating it under a new name would orphan every issue that references it. The script therefore treats **rename as a separate operation from create**: a rename preserves all existing assignments, and it is how an existing component migrates to a new convention without a bulk issue edit.

Diff the live list against the Phase 1 proposal and classify each proposed module: already exists (skip), exists under an old/ambiguous name (rename), missing (create).

---

## Phase 3 — Author the plan file and get approval

Write the plan to `.context/reports/jira-components-plan.json`, in the shape the script consumes:

```json
{
  "project": "<KEY>",
  "rename": [{ "from": "Bugs & Defect Heatmap", "to": "Bunkai Bugs" }],
  "create": [{ "name": "Bunkai Auth", "description": "Login, registration, sessions" }]
}
```

Then present it to the user as a table — **renames separated from creates, with the issue count on every rename** so the user sees exactly what is at stake in each one. Run the script's dry run to show what it resolves (a rename whose source is gone or whose target already exists degrades to a documented skip — re-running a partly-applied plan is normal, not a fault):

```bash
bun scripts/sync-jira-components.ts .context/reports/jira-components-plan.json
```

**Wait for explicit approval.** The user may edit the grouping, the names, or the prefix decision — regenerate the plan and re-present until they approve.

---

## Phase 4 — Apply and verify

Only after approval:

```bash
bun scripts/sync-jira-components.ts .context/reports/jira-components-plan.json --apply
bun scripts/sync-jira-components.ts --list --project {{PROJECT_KEY}}
```

The second command is the verification: the live list must now match the approved plan (renames showing their preserved issue counts, creates present). Report the final component list, what was renamed / created / skipped, and any skip whose reason the user should review.
