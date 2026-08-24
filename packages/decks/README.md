# packages/decks — canonical source of the published deck site

Every HTML deck served at `https://upex-galaxy.github.io/agentic-qa-boilerplate/decks/<skill>/`
lives here, grouped by the skill it teaches. `.github/workflows/pages.yml` copies
this directory verbatim into the site's `/decks/` path on every deploy.

## Why here and not in `.agents/skills/`?

`packages/` is boilerplate-only: the `create-agentic-qa` scaffolder prunes it
(`TEMPLATE_EXCLUDES`) and `bun run update` never syncs it. Keeping the decks here
means consumer projects scaffolded from this template do NOT carry ~2.7 MB of
academic HTML — they browse the published site instead (the `agentic-qa-onboard`
skill links to it).

## Single home (phase 2 done)

This directory is the ONLY home of the decks. The skill-side copies
(`.agents/skills/<skill>/*.html`) were removed in phase 2 — do not reintroduce
them. Edit decks here only; the published site is regenerated on push.

## Adding a new deck

1. Create `packages/decks/<skill>/<slug>.<lang>.html` (self-contained: CSS + JS
   inlined; Spanish decks use `.es.html`, technical terms stay in English).
2. Register a card in `packages/pages-home/index.html` (the homepage catalog is
   hardcoded HTML).
3. If the AI should proactively offer it, register it in
   `.agents/skills/agentic-qa-onboard/SKILL.md` (deck tables) and, for
   `agentic-qa-core` decks, in `.agents/skills/agentic-qa-core/SKILL.md`.
4. Nothing else: `pages.yml` copies this whole directory verbatim, so the new
   file publishes automatically at
   `https://upex-galaxy.github.io/agentic-qa-boilerplate/decks/<skill>/<file>`.
