# ADR-0005 — The framework validates only what it owns

- **Status:** Proposed
- **Date:** 2026-09-24
- **Deciders:** framework owner (boilerplate maintainer); drafted by `/framework-development` from the env-scopes SPIKE (D1-D8 decided 2026-09-24)
- **Tags:** env, validation, install, doctor, ci, mcp, updater
- **Supersedes:** ADR-0003 §Decision, bullet 3 only ("the schema's `@required` is the RUNTIME contract: `TEST_ENV` plus the active environment's test-user credentials"). Every other invariant of ADR-0003 stands.
- **Superseded by:** —

---

## Context

Every environment variable this repo knows is routed by `cli/lib/variables-manifest.ts` and validated in several places: the installer's day-0 prompt, `bun run setup:doctor` (exit 1 on a missing credential), the generated env schema (`@required=forEnv(...)` on the test-user pair), `bun run test:env:check` and the CI workflows that call it, and the varlock action in `build.yml`. The env-scopes SPIKE (`.session/spikes/env-scopes/plan.md`) inventoried those sites and found that most of them required values the framework does not own: the login of the application under test, the API keys of MCP servers that can run at harness level, a Postman workspace. An adopting repo whose app has no login, or whose team keeps its search MCP as a claude.ai connector, had to bend to this boilerplate's shape or learn to skip its gates. A fork PR with no secrets failed the build.

The variables fall into three scopes, and the scope decides who may validate them:

| Scope | Examples | Owner |
|---|---|---|
| Boilerplate core | `TEST_ENV`, `AUTO_SYNC`, the Xray and Atlassian credentials behind a feature switch | the framework |
| Tooling | portal / R2 secrets for private report hosting, `SLACK_WEBHOOK_URL` | a tool that can get its credential elsewhere |
| Project under test | `<ENV>_USER_EMAIL` / `_PASSWORD`, `DBHUB_*`, `API_BASE_URL`, `OPENAPI_SPEC_PATH` | the adopting project |

## Decision

We will validate a variable only at its point of use, and only when the framework owns the need.

- **`VarSpec` carries a `scope`** (`core` | `tooling` | `project`) and an optional `featureGate` naming the switch that makes a core variable relevant (`atlassian-url`, `auto-sync`, `tms-xray`, `portal-url`). The manifest is the single source of truth for both; consumers read the field instead of keeping hand lists.
- **The generated schema (`.env.core.schema`) requires only core, unconditional items.** Today that is `TEST_ENV`, which has a default. Project and tooling items are declared, typed and optional: a `.env` copied from the template validates, and a project that wants a stronger contract adds it in its own `.env.schema` (measured: an item declared optional in the imported core file can be re-declared `@required=forEnv(...)` by the importing project file; `TEST_ENV` is the exception, because `@currentEnv` resolves it early and a second declaration is an error, so it is declared in the core only).
- **The doctor never exits 1 for a credential of any scope.** A missing core variable behind a switch that is on (an Atlassian token with the Jira host set, an Xray secret with `AUTO_SYNC=true` and `TMS_PROVIDER=xray`) is a warning; a missing project or tooling variable is an informational row with its scope and consumer. Structural findings (no `.env`, stale harness surfaces, an invalid schema load, a broken compatibility artifact) keep the exit code.
- **The installer offers, never requires.** The day-0 prompt keeps the Atlassian credentials (a human is present, skip is a first-class answer); everything else is listed by scope at the close, project variables under "examples: rename or delete when you adapt the framework".
- **The updater tags a new upstream variable `(requerida)` only when its scope is core**; the rest are `(opcional, <scope>)`.
- **`bun run test:env:check` validates shape, not presence**: `TEST_ENV` names a declared environment, and the TMS pair exists when `AUTO_SYNC=true`. The credential half is gone; `config.testUser` (a getter in `config/variables.ts`) throws a named error when a test reads it with the active pair empty.
- **MCP servers that can run at harness level are the harness's business.** Remote servers whose only project-side content was an API key (`tavily`, `postman`) leave the three project MCP configs and their keys leave the manifest, the schema and `.env.example`; skills keep resolving them by capability. Local-only servers (`dbhub`, `openapi`) keep their project-scope variables. CLIs authenticate themselves (`acli auth login`, `resend login`); `RESEND_API_KEY` is dropped because nothing in the repo reads it. Downstream projects that still carry those servers keep them: the updater reports the move as a parity row and never overwrites a protected MCP file.

## Consequences

- **Positive:** an adopting repo installs, updates and passes `setup:doctor` without inventing a login it does not have; `build.yml` validates a fork PR; a missing credential fails once, by name, where it is read; the manifest answers "who needs this and when" for every variable; the boilerplate stops carrying keys for tools the harness can provide.
- **Negative / trade-offs:** `setup:doctor` exit 1 no longer means "credentials missing" (nothing in-repo relied on that; the doctor is a report); the first signal for an empty project credential moves from install time to the first test run; a project that wants `STAGING_USER_*` required must say so in its own `.env.schema`; a team that relied on the committed `tavily` / `postman` servers connects them at harness level once.
- **Neutral / follow-ups:** env-secrets P2 carries the three scope banners into the `.env.schema` scaffold; P3 generates provider overlays from `@sensitive` items regardless of scope; P4 makes the per-server allowlist the informative signal for an MCP started with empty project values. The doctor's "provided elsewhere" state reads user-level harness configs; a cloud connector is not detectable and the row says so.

## Alternatives considered

- **Flip the four test-user variables to optional and stop** — rejected as the whole answer: it leaves the manifest with no vocabulary for scope, so the next project variable someone adds gets the same accidental `@required`; it is the first commit of this change, not the decision.
- **Remove project variables from the manifest entirely** — rejected: varlock fails an undeclared key that is present and empty in `.env` (env-secrets probe), so every downstream `.env` copied from the old template would break; the parity check would force them into a commented block; `setup --variables --remote` could no longer push them to the secrets the suite workflows read.
- **Keep the doctor blocking on core-gated credentials when the gate is on** — rejected (D2): it re-introduces the pattern this decision removes for the sake of one warning that already exists.
- **Keep `tavily` / `postman` committed with their keys optional** — rejected (D3): a remote server whose only project-side content is a key is not project configuration; the capability model already resolves the tool by suffix wherever the harness provides it.

## References

- `.session/spikes/env-scopes/plan.md` (inventory of every variable and validation site, decisions D1-D8, R5 probe).
- `.context/ADR/ADR-0003-env-schema-owner-varlock.md` (the schema layout this decision keeps; bullet 3 superseded).
- `cli/lib/variables-manifest.ts` (`scope`, `featureGate`, `varsInScope`, `gateIsOn`), `cli/lib/env-schema.ts` (the three banners), `cli/doctor.ts` (scope column, warnings, "provided elsewhere").
- `.agents/skills/agentic-qa-core/references/mcp-capabilities.md` (capability resolution by suffix, any prefix).
- `docs/core/variables-de-entorno.html` (the human-facing version of this decision).
