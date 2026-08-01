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

> **Template-repo carve-out for step 2.** A boilerplate/template repo ships `.agents/project.yaml` with every value `null` on purpose — downstream projects inherit the file verbatim, so a concrete site baked into it is wrong for all of them. Detect this by reading `project.project_name` in the same file: if it is `null`, the repo is an un-onboarded template. **Leave `atlassian_url: null`** and say so in the report. The same rule applies to `project_key` in Phase 4. Only a real, onboarded project gets the value written.

```bash
TOKEN=$(grep '^ATLASSIAN_API_TOKEN=' .env | cut -d= -f2-)
EMAIL=$(grep '^ATLASSIAN_EMAIL=' .env | cut -d= -f2-)
printf '%s' "$TOKEN" | acli jira auth login --site "<target>" --email "$EMAIL" --token
```

> **Secret hygiene**: never `cat` the `.env` or grep it broadly — that dumps `ATLASSIAN_API_TOKEN` into the terminal, the scrollback, and the agent transcript. Filter by the exact key every time. If a token does get printed, say so plainly and recommend rotating it.
>
> **Do not back the `.env` up inside the repo.** `cp .env .env.bak` feels prudent and is not: `.gitignore` usually covers the exact name `.env`, not arbitrary suffixes, so the backup lands as an untracked file holding a live API token, one `git add -A` away from being committed. Verify with `git check-ignore -v <path>` before writing any copy, or put it outside the working tree entirely. The `.env` edit here is a single line and is trivially reversible without a backup.

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

`.agents/jira-required.yaml` holds no IDs — it declares everything **by slug**, so the migration does not invalidate its contents. But it is not a bystander either, and the next section is why.

### Pre-flight: the manifest caps what the catalogs can contain

**Do this BEFORE running any sync.** `.agents/jira-required.yaml` is the *input* to the regeneration, not a sibling output. `jira:sync-workflows` walks its `work_types:` section and catalogs **only the types declared there** — anything else is skipped with a `log.info` line that scrolls past in a wall of successful output:

```
Project issue type "Task" exists in <KEY> but is not declared in
.agents/jira-required.yaml work_types — declare it to catalog its workflow.
```

So a stale manifest declaring 3 work types regenerates a catalog with 3 work types, exits `0`, and reports success. The migration looks clean and the catalog is missing everything the manifest forgot to ask for. Same silent-success failure this whole command exists to prevent, entering through the input side.

The manifest goes stale invisibly because **the boilerplate updater neither syncs it nor warns about it**: it sits in `bootstrapOnlyPaths` (so `bun run update` never overwrites the project's customizations) and is absent from the drift watchlist (so nothing reports that it has fallen behind). A project scaffolded from an older boilerplate can be many versions behind with zero signal.

Compare against upstream before regenerating:

There is no published URL for the manifest itself — derive it from the one the scripts already hardcode, by swapping the filename on `UPEX_UPSTREAM_URL` (it points at `jira-workflows.json` in the same `.agents/` directory):

```bash
UPSTREAM=$(grep -oE "https://raw\.githubusercontent\.com/[^']+" scripts/sync-jira-workflows.ts \
  | head -1 | sed 's|/[^/]*$|/jira-required.yaml|')
echo "comparing against: $UPSTREAM"
curl -fsSL "$UPSTREAM" -o /tmp/jira-required.upstream.yaml || echo "upstream fetch FAILED — do not assume parity"

wt() { awk '/^work_types:/{f=1;next} f&&/^[a-z_]+:/{f=0} f&&/^  [a-z_]+:/{print $1}' "$1"; }
diff <(wt .agents/jira-required.yaml) <(wt /tmp/jira-required.upstream.yaml)
```

The same `wt` shape works on the `required:` / `optional:` sections by changing the anchor — check those too, not just `work_types:`. A missing field slug is quieter than a missing work type but breaks the skill that references it.

Report the delta and **stop for a decision** — do not merge it silently. The file is genuinely co-owned: upstream owns the baseline contract (which work types and slugs the skills reference), the project owns its adaptations (fields its Jira lacks, `fallback:` declarations). Blindly adopting upstream clobbers real local customization; ignoring the delta ships an amputated catalog. Present both sides and let the operator choose per work type.

If the manifest does need updating, **update it first, then run the syncs** — in the other order the catalogs get regenerated twice.

### With Administer permission (the correct path)

```bash
bun run jira:sync-fields --force
bun run jira:sync-link-types
bun run jira:sync-workflows
```

Three behaviors to anticipate, and they differ per script — do not assume one rule covers all three:

- **`jira:sync-fields` REQUIRES `--force`.** Its populated-catalog guard sits on the main path, so a plain re-run stops with `already populated. Re-run with --force to overwrite.` and exits `1`.
- **`jira:sync-workflows` does NOT need `--force`, and should not get it.** Its identical-looking guard lives *inside* the `--upex` branch only, so the normal Jira path is idempotent. Adding `--force` re-prompts for already-mapped slugs and buys nothing. (In practice a canonical slug with exactly one candidate auto-resolves either way; prompts only appear on a collision or a no-match.)
- **`jira:sync-link-types` has NO `--force` flag at all.** Its argument parser knows only `--dry-run`, `--json`, `--verbose`, `--help` and `--upex`, and has no `default:` case — so `--force` is silently swallowed rather than rejected. Passing it appears to work, which is exactly why it is worth not teaching.

Plus one behavior shared with Phase 2:

- **`jira:sync-workflows` prompts for the project key** when `.agents/project.yaml` has it null, and then **persists the answer into that file**. In a real project that is correct, leave it. In a boilerplate/template repo that must ship `project_key: null`, revert that one line after syncing. There is no CLI flag for it — the prompt is the only channel.

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

**A changed ID is not a correct ID.** The diff proves the sync reached somewhere; it does not prove each slug now points at the field it names. Two slugs can *swap* IDs during a migration, which survives every check above: both IDs still exist, both still resolve, and each now names the other's entity. Verify by asking the live instance what each catalogued ID actually is, and comparing against the name the catalog recorded:

```bash
URL=$(grep '^ATLASSIAN_URL=' .env | cut -d= -f2-); B="${URL%/}"
curl -sS -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" "$B/rest/api/3/field" > /tmp/live-fields.json

jq -s -r '
  (.[1] | map({key: .id, value: .name}) | from_entries) as $live
  | .[0] | to_entries
  | map(select( ($live[.value.id] // null) != .value.name ))
  | map("\(.key)\t\(.value.id)\tcatalog=\(.value.name)\tlive=\($live[.value.id] // "MISSING")")
  | if length==0 then ["all field ids verified"] else . end | .[]' \
  .agents/jira-fields.json /tmp/live-fields.json
```

Repeat the same shape for `jira-link-types.json` against `/rest/api/3/issueLinkType` (`.issueLinkTypes[]`) and for `jira-workflows.json` against `/rest/api/3/issuetype` and `/rest/api/3/status`. Any row printed is a mismatch and must be resolved before committing.

**Check the option values came back too.** `jira-fields.json` stores the child options of select-type fields, and the options endpoint can return `404` per field while the parent sync still exits `0` — the warning goes to stderr and scrolls past. A field left with `options: []` looks catalogued and is not:

```bash
jq -r 'to_entries[] | select(.value.options != null and (.value.options|length)==0)
  | "\(.key)\t\(.value.id)\t\(.value.type)\tOPTIONS EMPTY"' .agents/jira-fields.json
```

Report each one. It is only harmless if no skill resolves `{{jira.<slug>.<option>}}` for that field — confirm rather than assume.

Then confirm no ID escaped the catalog:

```bash
grep -rnE "customfield_[0-9]{4,}" --include="*.ts" --include="*.md" --include="*.yaml" . \
  | grep -v node_modules | grep -v "^\./\.agents/"
```

**Match on digits, not on the `customfield_` prefix alone.** A bare-prefix grep also hits every legitimate mention: prose about `customfield_XXXXX`, the `customfield_*` wildcard, `customfield_<slug>` markers for unmapped fields, and `customfield_NNNNN` placeholders. In a mature repo that is dozens of false positives, and an operator told to "expect nothing" will either panic or learn to ignore the check.

Expect only hits you can justify. A literal ID in a script, skill, or doc is a latent bug — it must resolve by slug against `.agents/jira-fields.json`. Two exemptions are legitimate: a tool-owner skill demonstrating CLI syntax (`acli jira field update --id customfield_10122`), where the number is a sample argument carrying no slug mapping, and any file the repo's own linter allowlists for this. Report every hit and classify it; do not silently rewrite.

**Custom fields are not the only per-instance IDs.** Statuses, transitions and link types are reassigned by the same migration and hide in the same places — env examples, docs, commented reference implementations:

```bash
grep -rnE '(TRANSITION|STATUS|LINK_?TYPE)[A-Z_]*\s*[=:]\s*"?[0-9]{2,}' \
  --include="*.ts" --include="*.js" --include="*.md" --include="*.yaml" --include="*.env*" . \
  | grep -v node_modules | grep -v "^\./\.agents/"
```

These resolve through `.agents/jira-workflows.json` (`{{jira.transition.<work_type>.<slug>}}`, `{{jira.<work_type>.<status>}}`) and `.agents/jira-link-types.json`. A literal number is the same latent bug wearing different clothes.

**Also sweep the override channel.** Projects often expose an env var or config constant that PINS a field ID, as an escape hatch over the catalog (`*_FIELD`, `*_FIELD_ID`, `*_CUSTOM_FIELD`). A pinned value survives the catalog regeneration untouched and keeps pointing at the old instance — the exact silent-write bug this command exists to prevent, reintroduced through the back door:

```bash
grep -rniE '(FIELD|CUSTOMFIELD)(_ID)?\s*[=:]\s*.?customfield_[0-9]{4,}' \
  --include="*.ts" --include="*.js" --include="*.env*" --include="*.yaml" --include="*.md" . \
  | grep -v node_modules
```

Same digit rule as above — without it the pattern flags its own `customfield_NNNNN` placeholder as a finding.

Every hit is either re-pointed at the new ID or, better, changed to resolve from the catalog by slug and left empty as an override. Prefer the second: an empty default plus a catalog lookup cannot go stale, and a pinned value silently survives the next migration too. **Before rewriting one, trace whether the code path is even reachable** — a constant guarded behind a provider switch or a disabled feature flag may be dormant, which changes the urgency but not the fix.

---

## Phase 5 — Commit

`.env` is gitignored and never committed. What ships is `.agents/project.yaml` plus the three regenerated catalogs.

Group into two commits — the config repoint and the catalog refresh are separate responsibilities:

```
chore(jira): point atlassian_url at the <target> instance
chore(jira): refresh field, workflow and link-type catalogs for <target>
```

**In a template repo the first commit has no content.** `.env` is gitignored and `atlassian_url` deliberately stayed `null` (Phase 2 carve-out), so there is nothing to stage. Skip it and say so — do not manufacture an empty commit, and do not "fix" the emptiness by writing the value.

If the manifest pre-flight produced a change, that is a third commit and it goes **first**, because the catalogs are generated from it:

```
chore(jira): sync jira-required.yaml work types with upstream
```

Follow the repo's git strategy via `/git-flow-master`. **Do not push without explicit confirmation** — in a boilerplate, publishing catalogs affects every downstream project that later runs `--upex`.

---

## Closing report

Give the operator these, and flag the last three as needing a human:

1. The three config points, with before/after. In a template repo, state explicitly that `atlassian_url` was left `null` by design so it does not read as an oversight.
2. The manifest pre-flight result: local vs upstream work-type counts, and whether anything was adopted.
3. Catalog counts: fields, work types, link types, plus any missing required slug and any field left with empty options.
4. At least one custom-field ID before/after, as proof the regeneration reached the new instance, **plus** the id-to-name verification result — "N ids checked against the live instance, 0 mismatches" is the claim worth making; "the diff was large" is not.
5. **Manual check**: does the vanity/alias domain now resolve to the target? Not visible from the repo.
6. **Manual check**: if the manifest was behind, whatever made it drift will make it drift again. The updater treats it as bootstrap-only and does not watch it for drift, so nothing will report the next gap either. Say so.
7. **Team broadcast**: everyone re-runs the `acli` login on their own machine — a stale session returns old-instance data with no error, which is the one failure mode nobody notices. If the team consumes the upstream reference catalog via `--upex`, add that nobody should run it until the upstream has published its post-migration catalogs.
