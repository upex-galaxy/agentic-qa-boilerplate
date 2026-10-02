# packages/decks — canonical source of the published deck site

Every HTML deck served at `https://upex-galaxy.github.io/agentic-qa-boilerplate/decks/<folder>/`
lives here, grouped by the skill (or family of skills) it teaches. `.github/workflows/pages.yml` copies
this directory verbatim into the site's `/decks/` path on every deploy.

## Why here and not in `.agents/skills/`?

`packages/` is boilerplate-only: the `create-agentic-qa` scaffolder prunes it
(`TEMPLATE_EXCLUDES`) and `bun run up` never syncs it. Keeping the decks here
means consumer projects scaffolded from this template do NOT carry the
academic HTML — they browse the published site instead (the `agentic-qa-onboard`
skill links to it).

## Single home

This directory is the ONLY home of the decks. The skill-side copies
(`.agents/skills/<skill>/*.html`) were removed; do not reintroduce
them. Edit decks here only; the published site is regenerated on push.

## Layout: one directory per skill, plus category folders

`ls packages/decks/` is the index. The published catalog, with a card per deck, is `packages/pages-home/index.html`. Three kinds of folder live here:

| Folder | Holds | Example |
| --- | --- | --- |
| `<skill>/` (the skill's exact slug) | that skill's `how-it-works.es.html`, plus any craft or curriculum deck that teaches the discipline behind it | `sprint-testing/` |
| `<category>/` (a name that is not a skill slug) | one deck that explains a family of skills together, when a deck per skill would repeat itself | `context-skills/` (the `*-context` skills and their maps), `tooling/` (`/acli`, `/xray-cli`, `/playwright-cli`, tool resolution) |
| `agentic-qa-core/` | cross-cutting reference decks the foundation skill hosts (naming, skills inputs and outputs, output style) | `agentic-qa-core/naming-conventions.es.html` |

A skill covered by a category deck gets no folder of its own: its human explanation is the category deck. When a deck is retired, delete its folder and repoint every link to the deck that replaced it.

## Adding a new deck

1. Create `packages/decks/<folder>/<slug>.<lang>.html` (self-contained: CSS + JS
   inlined; Spanish decks use `.es.html`, technical terms stay in English). A
   workflow deck is `how-it-works.es.html`, mirrors the shell of an existing
   deck, and keeps the mobile scale-to-fit canvas at 1440x900 (the desktop
   reference viewport), so a slide that fits on desktop also fits on a phone.
2. Register a card in `packages/pages-home/index.html` (the homepage catalog is
   hardcoded HTML).
3. If the AI should proactively offer it, register it in
   `.agents/skills/agentic-qa-onboard/SKILL.md` (deck tables) and, for
   `agentic-qa-core` decks, in `.agents/skills/agentic-qa-core/SKILL.md`.
4. Nothing else: `pages.yml` copies this whole directory verbatim, so the new
   file publishes automatically at
   `https://upex-galaxy.github.io/agentic-qa-boilerplate/decks/<folder>/<file>`.
