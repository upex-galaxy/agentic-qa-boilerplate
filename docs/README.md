# docs/: the human documentation site

This directory is a small HTML site for people (the AI reads `.agents/skills/` instead).
Open it with:

```bash
bun run docs          # portal at http://127.0.0.1:4173 (next free port when busy)
bun run onboarding    # the same portal, opened on "Empezar aquí"
```

| Path | Owner |
|---|---|
| `docs/core/` | The boilerplate. Synced by `bun run up`; do not edit it in a project, your changes would be offered for overwrite. |
| `docs/assets/`, `docs/index.html`, `docs/README.md` | The boilerplate (shared CSS/JS, the portal shell, this file). |
| Any other folder under `docs/` | Your project. Never written by the updater; it shows up in the sidebar on refresh. |

A page is one HTML file with a `<title>` and a `<meta name="description">` (both required by `bun run docs:check`), optional `<meta name="docs-order">`, linking `docs/assets/docs.css` and `docs/assets/docs.js`. A folder's `index.html` names the folder with `<meta name="docs-section-title">`. `bun run docs:build` writes the generated `docs/manifest.json` for static hosting.
