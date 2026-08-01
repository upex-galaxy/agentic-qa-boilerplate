---
name: jira-instance-migration
description: Repoint this repo at a new Atlassian/Jira instance after a site migration, and regenerate the `.agents/` catalogs whose custom-field IDs the migration invalidated. Takes two inputs (source instance, target instance); detects the source from the repo and asks for whatever is missing before touching anything. Triggers on 'jira instance migration', 'migrar la instancia de jira', 'cambió la URL de Jira', 'jira site migration', 'we moved Jira workspaces', 'repoint jira', 'nuevo site de jira', 'actualizar ATLASSIAN_URL', 'the jira URL changed'. Do NOT use for: first-time Jira setup (see docs/setup/jira-setup-guide.md), routine catalog refresh with no instance change (run `bun run jira:sync-*` directly), or Jira ticket operations (use /acli).
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
---

# Jira Instance Migration

Repoint this repository at a new Atlassian instance and regenerate everything the move invalidated.

**Inputs**: `$ARGUMENTS` — the source instance and the target instance, in that order. Both may be omitted; Phase 0 resolves them.

```
/jira-instance-migration oldsite.atlassian.net newsite.atlassian.net
/jira-instance-migration                         # -> Phase 0 detects and asks
```

---

## Why this is not a find-and-replace

A site migration reassigns custom-field IDs instead of preserving them. The old ID usually still exists on the new instance, pointing at a **different field**. So the failure mode is not a 404 — it is a `200 OK` that writes your data into the wrong field, silently, forever.

That is why this command has two halves. Repointing the URL is the easy half. Regenerating the `.agents/` catalogs is the half that prevents silent corruption.

A second silent failure sits alongside it: `.env` and the `acli` session are independent. Change one and not the other, and REST calls hit the new instance while `acli` keeps reading the old one, with no error to tell you.

---

## Phase 0 — Resolve the two instances (always first)

**Never edit anything before both values are confirmed by the user.**

**Source** — detect it, do not ask first. Read, in order, and report what each one says:

```bash
grep -n '^ATLASSIAN_URL' .env 2>/dev/null
grep -n 'atlassian_url' .agents/project.yaml
acli jira auth status 2>/dev/null | grep -i site
```

Three outcomes:

- All agree -> that is the source. State it and move on.
- They disagree -> the repo is already in a half-migrated state. **Report all three values** and treat the migration as a repair, not a move. Ask which one is the real "before".
- Nothing found -> ask the user for the source.

**Target** — never guess. If it is not in `$ARGUMENTS`, ask. There is no way to detect a site the repo has never contacted.

Normalize both to the bare host (`site.atlassian.net`, no scheme, no trailing slash). Then confirm as one line and wait:

> Migrating `<source>` -> `<target>`. Three places change: `.env`, `.agents/project.yaml`, and your machine-global `acli` session. Confirm?

**Verify the target is reachable and populated before proceeding.** Migrating into an empty or half-provisioned instance regenerates empty catalogs and publishes them, which is worse than doing nothing:

```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" \
  -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  "https://<target>/rest/api/3/myself"
```

Anything other than `200` stops the command.

---

## Phase 1 — Audit before editing

Sweep for the source host, excluding dependencies and git internals:

```bash
grep -rn "<source-slug>" -I . 2>/dev/null | grep -v "^./node_modules" | grep -v "^./.git/"
```

Classify every hit into change / do-not-change, and **present the table to the user before editing anything**.

### Changes

| Target | What to write |
|---|---|
| `.env` -> `ATLASSIAN_URL` | `https://<target>/` — the line number varies per project, never assume it |
| `.agents/project.yaml` -> `atlassian_url` | `<target>` — **without** the scheme; this is the slug `acli` derives `--site` from |
| `acli` session | machine-global (`~/.config/acli`), not a repo file — re-login required per machine |

### Does not change

- **A vanity / alias domain** (an org-owned hostname that fronts Jira instead of the numbered or named instance slug). If one appears in the code, leave it: these normally redirect to whatever instance is currently active, which is exactly why already-published `/browse/` links survive a migration. **But the alias is invisible from the repo** — tell the user to confirm by hand that it now resolves to the target. If it still points at the source, every published link is broken and nothing in the codebase reveals it.
- **Historical records** — sprint reports, retros, changelogs of closed work. Rewriting them falsifies the past.
- **Code whose pattern already generalizes.** If the logic matches the instance with a regex rather than a literal (`/site\d+\.atlassian\.net/`), it already supports the target and only a comment names the source. Read the code before deciding; do not edit a pattern that already generalizes.
- **Regenerable cache** — `.context/PBI/` is rebuilt by the sync, so occurrences there clear themselves.

Anything that fits neither list — a CI workflow, a README, `.mcp.json`, a deploy script — **ask before touching it**.

---

## Phase 2 — Apply

1. `.env` -> `ATLASSIAN_URL=https://<target>/`
2. `.agents/project.yaml` -> `atlassian_url: <target>`
3. Re-authenticate `acli`:

```bash
TOKEN=$(grep '^ATLASSIAN_API_TOKEN=' .env | cut -d= -f2-)
EMAIL=$(grep '^ATLASSIAN_EMAIL=' .env | cut -d= -f2-)
printf '%s' "$TOKEN" | acli jira auth login --site "<target>" --email "$EMAIL" --token
```

> **Secret hygiene**: never `cat` the `.env` or grep it broadly — that dumps `ATLASSIAN_API_TOKEN` into the terminal, the scrollback, and the agent transcript. Filter by the exact key every time. If a token does get printed, say so plainly and recommend rotating it.

The `acli` session is **global to the machine**, so this re-login repoints every project on it. That is usually what you want after a company-wide migration. If the operator still needs the old instance for another repo, stop and tell them — `acli` holds one session per product, and they will have to switch back and forth with `acli jira auth switch`.

---

## Phase 3 — Verify all three agree

A migration where two of the three match is worse than one where none do, because it looks like it worked.

```bash
acli jira auth status | grep -i site
grep -n '^ATLASSIAN_URL' .env
grep -n 'atlassian_url' .agents/project.yaml
URL=$(grep '^ATLASSIAN_URL=' .env | cut -d= -f2-)
EMAIL=$(grep '^ATLASSIAN_EMAIL=' .env | cut -d= -f2-)
TOKEN=$(grep '^ATLASSIAN_API_TOKEN=' .env | cut -d= -f2-)
curl -sS -o /dev/null -w "HTTP %{http_code}\n" -u "$EMAIL:$TOKEN" "${URL%/}/rest/api/3/myself"
```

All three must name the target, and the REST call must return `200`. Report the four results as a table. Anything short of that is a failed migration — say so and stop.

---

## Phase 4 — Regenerate the `.agents/` catalogs

**The part people skip, and the one that corrupts data.**

Agentic variables never hardcode Jira IDs; they resolve *slugs* against three workspace-specific catalogs. After a migration those catalogs describe an instance that no longer exists.

| Catalog | Script | Holds |
|---|---|---|
| `.agents/jira-fields.json` | `bun run jira:sync-fields` | custom-field IDs + their option IDs |
| `.agents/jira-workflows.json` | `bun run jira:sync-workflows` | statuses and transitions per work type |
| `.agents/jira-link-types.json` | `bun run jira:sync-link-types` | issue link types |

`.agents/jira-required.yaml` references everything **by slug**, never by ID. It is not touched.

### With Administer permission (the correct path)

```bash
bun run jira:sync-fields --force
bun run jira:sync-link-types --force
bun run jira:sync-workflows
```

Two behaviors to anticipate:

- **`jira:sync-workflows` prompts for the project key** when `.agents/project.yaml` has it null, and then **persists the answer into that file**. In a real project that is correct, leave it. In a boilerplate/template repo that must ship `project_key: null`, revert that one line after syncing. There is no CLI flag for it — the prompt is the only channel.
- **Run `jira:sync-workflows` without `--force`.** With the flag it re-prompts for every already-mapped slug. Without it, re-runs are idempotent and ask only about what is new.

### The `--upex` flag — usually NOT what you want

Each script also accepts `--upex`, which skips Jira entirely and downloads a **pre-built reference catalog published by the boilerplate's own authors, generated against THEIR workspace**.

**If you are migrating your own Jira instance, do not use this flag.** It would overwrite your catalogs with someone else's field IDs, which describe an instance you have no relation to. Your own instance is the only correct source for your own catalogs — run the plain sync above.

The flag exists for exactly one situation: you lack Administer permission, cannot fetch your real catalog, and want a structurally valid placeholder so the repo's tooling runs at all. It is a scaffolding crutch, not a migration step. Treat the resulting catalog as known-wrong data whose IDs must be replaced the moment someone with Administer access can run the real sync.

```bash
bun run jira:sync-fields --upex        # reference catalog only — NOT your instance's IDs
```

If you do reach for it, two rules:

- **Catalogs from different boilerplates are not interchangeable.** Each script hardcodes its own upstream URL pointing at its own repo, and the catalogs deliberately differ (a QA-flavored boilerplate keeps its TMS plugin fields; a DEV one drops them). Never edit the URL to borrow another repo's catalog. To see which upstream applies here, read `UPEX_UPSTREAM_URL` in `scripts/sync-jira-fields.ts`.
- **Ordering.** It only reflects a post-migration state *after* the upstream maintainers have regenerated and pushed their catalogs. Run it before that and you download their pre-migration IDs. When unsure whether the upstream has published, ask rather than guess.

### Then prove the IDs actually moved

```bash
git diff --stat .agents/
git diff .agents/jira-fields.json | grep -E '^[+-].*"id"' | head -20
```

Pick one known slug and state its before/after explicitly. Reassignment is normal and is the whole point — a diff showing zero ID changes means the sync did not reach the new instance.

Then confirm no ID escaped the catalog:

```bash
grep -rn "customfield_" --include="*.ts" --include="*.md" --include="*.yaml" . \
  | grep -v node_modules | grep -v "^./.agents/"
```

Expected: nothing. A literal ID in a script, skill, or doc is a latent bug — it must resolve by slug against `.agents/jira-fields.json`. Report any hit; do not silently rewrite it.

**Also sweep the override channel.** Projects often expose an env var or config constant that PINS a field ID, as an escape hatch over the catalog (`*_FIELD`, `*_FIELD_ID`, `*_CUSTOM_FIELD`). A pinned value survives the catalog regeneration untouched and keeps pointing at the old instance — the exact silent-write bug this command exists to prevent, reintroduced through the back door:

```bash
grep -rniE '(FIELD|CUSTOMFIELD)(_ID)?\s*[=:]\s*.?customfield_' \
  --include="*.ts" --include="*.js" --include="*.env*" --include="*.yaml" --include="*.md" . \
  | grep -v node_modules
```

Every hit is either re-pointed at the new ID or, better, changed to resolve from the catalog by slug and left empty as an override.

---

## Phase 5 — Commit

`.env` is gitignored and never committed. What ships is `.agents/project.yaml` plus the three regenerated catalogs.

Group into two commits — the config repoint and the catalog refresh are separate responsibilities:

```
chore(jira): point atlassian_url at the <target> instance
chore(jira): refresh field, workflow and link-type catalogs for <target>
```

Follow the repo's git strategy via `/git-flow-master`. **Do not push without explicit confirmation** — in a boilerplate, publishing catalogs affects every downstream project that later runs `--upex`.

---

## Closing report

Give the operator these, and flag the last two as needing a human:

1. The three config points, with before/after.
2. Catalog counts: fields, work types, link types, plus any missing required slug.
3. At least one custom-field ID before/after, as proof the regeneration reached the new instance.
4. **Manual check**: does the vanity/alias domain now resolve to the target? Not visible from the repo.
5. **Team broadcast**: everyone re-runs the `acli` login on their own machine. If the team consumes the upstream reference catalog via `--upex`, add that nobody should run it until the upstream has published its post-migration catalogs.
