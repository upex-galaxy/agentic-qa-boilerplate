---
id: code-quickref
title: 'KATA quick reference'
load_when: 'writing or reviewing test code, KATA layers, fixtures, a Page / Api / Steps module, scripts/ path handling'
triggers: ['\bKATA\b', '\bATC\b', '\bfixtures?\b', '\bPage\b', '\bApiBase\b', '\bUiBase\b', '\bTestContext\b', '\bspec\.ts\b', '\bplaywright(?!-cli)\b', '\btests?/']
paths: ['tests/', 'api/schemas/', 'scripts/']
---

# Code quick reference

## 10. KATA QUICK-REFERENCE

> **FULL KATA + TypeScript rules**: `.agents/skills/test-automation/references/kata-architecture.md` + `.../typescript-patterns.md`. LOAD `/test-automation` BEFORE writing or reviewing any test code.

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

**Hard rules** (full detail in skill refs: load `/test-automation`):

- ATC = complete mini-flow, atomic, NEVER calls another ATC. Reusable chains → Steps module. (binding: `/test-automation`)
- Max 2 positional params. 3+ → object param.
- Locators inline in ATC. Extract only if used 2+ times.
- Imports use aliases (`@api/`, `@schemas/`, `@utils/`). No relative imports.
- Public methods: fail fast. Utilities: silent fail (return null).
- Fixture selection: API only → `{ api }` (no browser). UI only → `{ ui }`. Hybrid → `{ test }`.
- **Repo-relative paths in `scripts/` go through `scripts/lib/posix-path.ts`** (`toPosix` / `relativePosix`). `relative()` and `join()` emit `\` on Windows, and this repo has shipped that bug repeatedly (ADR-0006; downstream issue #26). **Exception: path GUARDS compare in the platform's own `sep`, never normalised**, because normalising a traversal prefix is how a `\` candidate slips past a `/` prefix.
- `scripts/api-login.project.ts` may export an optional `authenticate` hook that replaces the core's single POST for auth flows a single request cannot express. It is a LAST RESORT: a project that adopts it stops receiving upstream improvements to the request phase. Prefer `buildAuthPayload`.
- DRY scope: `api/schemas/` = OpenAPI facades. `tests/utils/` = agnostic utilities only. `UiBase` = all Playwright/Page helpers. `ApiBase` = all HTTP helpers. `TestContext` = shared across both.
