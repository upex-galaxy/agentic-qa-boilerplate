# ADR-0027 — KATA rules move from prose to an inline ESLint plugin, eslint-plugin-playwright and manifest checks, shipped at warn then error

- **Status:** Accepted (by the owner, 2026-11-17)
- **Date:** 2026-11-17
- **Deciders:** framework owner (boilerplate maintainer), owner deck `kata-review` (https://claude.ai/artifact/Khx8ScWSe8j6sCiHhYiR1G)
- **Tags:** kata, lint, enforcement, test-architecture, manifest
- **Supersedes:** —
- **Superseded by:** —

---

## Context

Three KATA rules were checked by a machine: the import aliases (`KATA_IMPORT_ALIASES`), duplicate ATC ids and manifest freshness. The rest lived in prose (`kata-invariants.md`, `kata-architecture.md`, `review-checklists.md`) and held only while a reviewer remembered them. A finding that repeated in review stayed a prose line, so it repeated again.

A read-only probe of the template and one downstream project found real violations of rules no tool checked: positional-parameter overruns, `nth` locators, `force: true`, direct faker imports in specs. It found no layer or import violations.

Flat config adds a constraint. A rule configured in two blocks that match the same file is replaced by the later block, not merged. `KATA_IMPORT_ALIASES` already owns `no-restricted-imports` on `tests/**/*.ts`.

## Decision

We will check every KATA rule a machine can judge with a tool, and keep prose only for what a machine cannot judge.

1. An inline plugin `kata` exported from `eslint.config.base.js` holds the layer-import, ATC-calls-ATC, decorator-in-Base and raw-page-in-spec rules. Each message names the doctrine section and the root-cause fix.
2. Core `max-params` and `max-lines` cover the component layers, with an override that exempts the protected HTTP primitives of `ApiBase`.
3. The `eslint-plugin-playwright` rules that agree with KATA are on. The ones that contradict KATA (assertions live inside ATCs, locators live in components) stay off.
4. `scripts/kata-manifest.ts --check` reports Domain components that no Fixture registers.
5. Every new check ships at `warn` this release and at `error` the next. `KATA_ENFORCEMENT_LEVEL` sets the level in `eslint.config.base.js` and is mirrored in `kata-manifest.ts`; the flip edits both.
6. `kata-invariants.md` names the check behind each invariant in an "Enforced by" entry. A repeated review finding becomes a check first (`framework-development` Compact Rules).

## Consequences

- **Positive:** a violation shows in the editor and in `lint:check` with the fix named. Review time goes to judgment, and the doctrine and the checks cannot drift silently because both name each other.
- **Negative / trade-offs:** the plugin is code the boilerplate maintains. Downstream projects get new warnings on `bun sync`, and `agents:compat:check` fails until they spread the new blocks in `eslint.config.js`. The release note has to say so.
- **Neutral / follow-ups:** the flip to `error` is a later release and its own change (`kata-invariants.md` §8). A rule that proves noisy is tuned or removed through the same file.

## Alternatives considered

- **Core `no-restricted-imports` for the new import limits** — a second block on `tests/**` replaces `KATA_IMPORT_ALIASES` silently under flat config.
- **A published `eslint-plugin-kata` package** — needs a publish pipeline and a dependency for a handful of small rules, and the sync already ships the inline plugin to every project.
- **Staying in prose** — the status quo: rules that depend on a reviewer remembering them, and findings that repeat.

## References

- Owner deck `kata-review` (https://claude.ai/artifact/Khx8ScWSe8j6sCiHhYiR1G), decisions D1 (warn first) and D2 (no-comments rule).
- `eslint.config.base.js` (`KATA_ENFORCEMENT_LEVEL`, `kataPlugin`), `scripts/kata-manifest.ts`, `.agents/skills/framework-development/references/kata-invariants.md`.
