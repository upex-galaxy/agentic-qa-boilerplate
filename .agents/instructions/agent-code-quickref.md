---
id: code-quickref
title: 'KATA quick reference'
load_when: 'writing or reviewing test code, KATA layers, fixtures, a Page / Api / Steps module, scripts/ path handling'
triggers: ['\bKATA\b', '\bATC\b', '\bfixtures?\b', '\bPage\b', '\bApiBase\b', '\bUiBase\b', '\bTestContext\b', '\bspec\.ts\b', '\bplaywright(?!-cli)\b', '\btests?/']
paths: ['tests/', 'api/schemas/', 'scripts/']
---

# Code quick reference

## 10. KATA QUICK-REFERENCE

> Full KATA and TypeScript rules: `.agents/skills/test-automation/references/kata-architecture.md` and `.agents/skills/test-automation/references/typescript-patterns.md`. Load `/test-automation` before writing or reviewing any test code.

KATA layer flow:

```
TestContext (L1: config, faker, agnostic utils)
  ↓ extends
ApiBase / UiBase (L2: HTTP / Playwright helpers)
  ↓ extends
YourApi / YourPage (L3: ATCs live here)
  ↓ used by
TestFixture (L4: dependency injection)
  ↓ used by
Test files (orchestrate ATCs)
```

Hard rules, with the full detail in the skill's references (load `/test-automation`):

- An ATC is a complete, atomic mini-flow and never calls another ATC. A reusable chain goes in a Steps module. (binding: `/test-automation`)
- A method takes at most 2 positional params; with 3 or more, use an object param.
- Locators sit inline in the ATC. Extract one only when 2 or more places use it.
- Imports use the aliases (`@api/`, `@schemas/`, `@utils/`), not relative paths.
- Public methods fail fast. Utilities fail silently and return null.
- Fixture selection: API only takes `{ api }` (no browser), UI only takes `{ ui }`, a hybrid test takes `{ test }`.
- Repo-relative paths in `scripts/` go through `scripts/lib/posix-path.ts` (`toPosix` / `relativePosix`). `relative()` and `join()` emit `\` on Windows, and this repo has shipped that bug repeatedly (ADR-0006; downstream issue #26). The exception: path guards compare in the platform's own `sep` and are never normalised, because normalising a traversal prefix is how a `\` candidate slips past a `/` prefix.
- `scripts/api-login.project.ts` may export an optional `authenticate` hook that replaces the core's single POST for auth flows one request cannot express. It is a last resort: a project that adopts it stops receiving upstream improvements to the request phase. Prefer `buildAuthPayload`.
- DRY scope: `api/schemas/` holds the OpenAPI facades, `tests/utils/` holds agnostic utilities only, `UiBase` holds all Playwright and Page helpers, `ApiBase` holds all HTTP helpers, and `TestContext` is shared across both.
