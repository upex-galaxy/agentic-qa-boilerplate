# packages/decks — canonical source of the published deck site

Every HTML deck served at `https://upex-galaxy.github.io/agentic-qa-boilerplate/decks/<skill>/`
lives here, grouped by the skill it teaches. `.github/workflows/pages.yml` copies
this directory verbatim into the site's `/decks/` path on every deploy.

## Why here and not in `.claude/skills/`?

`packages/` is boilerplate-only: the `create-agentic-qa` scaffolder prunes it
(`TEMPLATE_EXCLUDES`) and `bun run update` never syncs it. Keeping the decks here
means consumer projects scaffolded from this template do NOT carry ~2.7 MB of
academic HTML — they browse the published site instead (the `agentic-qa-onboard`
skill links to it).

## Transitional duplication (phase 2 pending)

The same decks currently ALSO exist in `.claude/skills/<skill>/*.html`. Those
copies are kept on purpose — an external project consumes the skills directories
and renders their HTML. Do NOT delete them yet. When that consumer migrates,
phase 2 removes the skill-side copies and this directory becomes the only home.
Until then: **edit decks here AND mirror the change to the skill-side copy** (or
regenerate both from the same source).

### Phase 2 runbook (when the external consumer no longer needs the skill-side copies)

1. `git rm .claude/skills/*/*.html` in the boilerplate.
2. Add each removed path to `deprecatedFiles` in `cli/update-boilerplate.ts` —
   this guarantees deletion in consumer repos on `bun run update` in EVERY mode.
   (Without it: interactive mode asks per file, `--force` deletes, but `--auto`
   only defers deleted-upstream files and never removes them.)
3. Update the local-fallback references in
   `.claude/skills/agentic-qa-onboard/SKILL.md` (published URLs become the only
   source).
