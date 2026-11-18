# ADR-0028 — Oxlint runs the KATA rules at commit, ESLint stays the CI gate

- **Status:** Accepted (by the owner, 2026-11-18)
- **Date:** 2026-11-18
- **Deciders:** framework owner (boilerplate maintainer)
- **Tags:** lint, oxlint, eslint, pre-commit, kata
- **Supersedes:** —
- **Superseded by:** —

---

## Context

ADR-0027 moved the KATA rules into ESLint. ESLint now takes 5 s or more on a handful of staged files and 17 to 30 s on the repo, because the type-aware `ts/*` rules load the TypeScript project. Every commit pays that cost, which pushes people toward `--no-verify`.

Oxlint ran the same rules in about 0.2 s. Its JS plugin loader accepted the inline `kata` plugin and `eslint-plugin-playwright` unchanged. A full replacement of ESLint was measured and rejected: 37 antfu rules have no Oxlint equivalent, JS plugins are alpha, and type-aware linting needs TypeScript 7 while the repo is on 5.9.

## Decision

Use both, each where it is strong.

1. Pre-commit (`lint-staged`) runs Oxlint on staged code with `.oxlintrc.json`, which `extends` the synced `.oxlintrc.base.json`.
2. ESLint stays the gate in `lint:check`, `repo:check`, `pre-push` and CI. `oxlint:check` also runs in `repo:check`, so a config that stops loading fails there.
3. The `kata` plugin moves to `kata-eslint-plugin.js` (default export) so ESLint and Oxlint load one file. `eslint.config.base.js` re-exports it.
4. ESLint runs every stock rule. `eslint-plugin-oxlint` was tried and dropped: it switches off 93 core ESLint rules assuming Oxlint runs them, and our config keeps Oxlint's `correctness` category off, so those rules would run in neither linter. Enabling the category was measured (26 findings in this repo, mostly `unicorn` style rules) and left for a later, separate change.
5. The split mirrors ESLint: base files synced, `.oxlintrc.json` project-owned, `validateOxlintWiring` in `agents:compat:check`.
6. Prettier stays. The `warn` severities in `.oxlintrc.base.json` follow `KATA_ENFORCEMENT_LEVEL`; a test fails on drift.

## Consequences

- **Positive:** a KATA violation shows in under a second at commit, with the same message as in CI.
- **Negative / trade-offs:** two linters to keep aligned, and pre-commit no longer autofixes style (`lint:fix`, then `pre-push`, catch it). Oxlint JS plugins are alpha, pinned at an exact version. Oxlint reads import patterns differently (`../**`, not `../*`).
- **Neutral / follow-ups:** `playwright/missing-playwright-await` fires under Oxlint on `expect(...).toBeVisible()`. It does not flag a bare `page.goto()` in either linter; that is the rule's scope. A later swap to full Oxlint plus oxfmt waits for stable JS plugins and TypeScript 7.

## Alternatives considered

- **ESLint only, tuned** — `--cache` gives 2 s warm but stays stale on type-aware rules and is cold in CI and fresh worktrees.
- **Full Oxlint plus oxfmt now** — loses 37 style rules and the type-aware set.
- **Biome** — cannot run the inline KATA plugin.

## References

- `.oxlintrc.base.json`, `kata-eslint-plugin.js`, `eslint.config.js`, `scripts/oxlint-config.test.ts`, `cli/lib/agent-compatibility-contracts.ts` (`validateOxlintWiring`).
- ADR-0027.
