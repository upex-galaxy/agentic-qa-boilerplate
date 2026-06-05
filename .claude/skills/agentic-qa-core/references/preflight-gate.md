# Readiness Preflight Gate — Shared Doctrine

> Cited by every testing workflow skill in this repo (`shift-left-testing`, `sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `framework-development`). Loaded on demand at the very start of a skill, BEFORE its session-resume check and BEFORE any real work.
> Sibling references: `./session-management.md` (resume contract — runs immediately AFTER this gate), `./orchestration-doctrine.md`, `./acli-integration.md`.

## 1. Purpose

A testing run must not discover a missing tool, dead MCP, expired token, or unset credential **half-way through** — that is the single most expensive class of waste (an authored ATP against a dead env, a Stage-2 API exploration that 401s, a regression trigger that fails `gh auth`). This gate moves every such surprise to **t=0**: probe every capability the skill needs, surface a single checklist to the user, and either self-fix (with explanation + approval) or stop with an exact remedy — before the skill does anything else.

The gate is a **clause**, not a phase rewrite. It runs, it clears, then the skill proceeds normally through its existing Phase 0 (resume) and pipeline.

## 2. The two laws

**Law 1 — Args-as-answers (no nagging).** Treat the user's invocation like a CLI call: anything they already specified in natural language is a **provided argument** — do NOT re-ask it. "QA UPEX-123 on staging" already answers *environment* and *scope*. "test the login API" already answers *which surface (API)*. Only ask the **gaps**. If every required answer is present and every probe is GREEN, ask nothing — announce the green checklist in one line and continue.

**Law 2 — Probe, never assume.** "Configured in `.mcp.json`" ≠ "valid". A capability is GREEN only when actually exercised: DBHub lists a schema, the OpenAPI token is unexpired, `gh` reports authenticated, the browser binary exists, the env root returns 2xx/3xx. Presence of an env var is necessary, not sufficient.

## 3. Gate sequence (run in order)

1. **Resolve the environment.** From the invocation arg if present; else default **staging** (per `CLAUDE.md` §8); ask only when genuinely ambiguous. Persist as `<<ACTIVE_ENV>>` for the session.
2. **Assemble the required-capability set.** Each skill ships its own matrix (§"Required capabilities" in its SKILL.md). Drop capabilities that the resolved scope makes irrelevant (e.g. no DB surface in this ticket → DBHub is OPTIONAL).
3. **Probe every required capability** (§4 table) → build a GREEN / RED status list.
4. **Branch:**
   - All required GREEN → emit a one-line green summary, continue to the resume check.
   - Any RED → go to §5 (classify + surface checklist via `AskUserQuestion`).
5. **Resolve REDs** per §5, then re-probe the ones you fixed in-session. MCP-spawn-time vars (§6) cannot be re-probed without an agent restart → STOP after writing them.

On **resume** (the skill's Phase 0 finds prior `.session/` state): re-run the fast probes (env reachable, token unexpired, `gh` auth) but DO skip the user questions already answered in the prior `plan.md`. Tokens and env health expire; answers do not.

## 3.1 Generic baseline vs skill-specific delta

These hold for **every** testing skill and are owned HERE — a skill must NOT re-state them:

- The two laws (§2) + the probe-don't-assume discipline.
- Environment resolution (§3 step 1): arg-first, default staging, ask only if genuinely ambiguous.
- Secret & token handling + the spawn-time RESTART rule (§6).
- The single-checklist `AskUserQuestion` behavior (§5) and the output contract (§7).
- **Surfaces / test-types are NEVER a user question** (§5) — always a planning-phase decision.
- **The gate probes artifacts; it NEVER auto-runs heavy setup commands.** A missing adapted state, missing `.context/`, or any other heavy-setup gap → STOP and hand the user the command to run themselves (`/project-discovery`, `/adapt-framework`). These are write-gated, interactive, token-heavy commands the user drives in a clean session — the gate verifies their OUTPUT, it does not execute them.

Each skill therefore declares ONLY its **specific capability delta**: the REQUIRED / SCOPE-conditional / OPTIONAL rows from §4 that its work actually needs. A skill's gate section is that delta — not a re-listing of the baseline.

## 4. Capability probe table

Probe only what the skill's matrix lists. `[TAG_TOOL]` resolve per `CLAUDE.md` §6.

| Capability | GREEN probe | Typical RED remedy |
|---|---|---|
| **Framework adapted (artifacts present — NOT a generic boilerplate)** | The OUTPUT that `/adapt-framework` produces is in place. Probe its Phase 9 ADAPTED signals, read-only: `bun run vars:check` exits 0 AND `.agents/project.yaml` has zero `null #` lines; none of `ExampleApi.ts` / `ExamplePage.ts` / `ExampleSteps.ts` / `api/schemas/example.types.ts` exist; no `module-example` spec dirs remain under `tests/e2e/` / `tests/integration/`. | Still generic → **STOP and hand the user the commands to run THEMSELVES**: `/project-discovery` (if `.context/` is missing) then `/adapt-framework`. The gate **never auto-runs** them — it verifies their artifacts only. |
| **Active env reachable** | HTTP HEAD/GET on `{{WEB_URL}}` and `{{API_URL}}` root → 2xx/3xx (a login redirect counts). | 404/410/5xx, refused, or a dead-deploy page → STOP; offer a session env override (user-supplied alt URL). |
| **Test-user credentials** | `<<ACTIVE_ENV>>`-scoped creds present in `.env` (`LOCAL_USER_*` / `STAGING_USER_*`). | Empty → user fills `.env` (template in `.env.example`). Never hardcode, never echo the value back. |
| **User roles** | The project's role count is known and each role has creds in `.env`. | Multi-role project with one cred set → ask how many roles; have the user add `<ROLE>_USER_*` rows. `scripts/api-login.ts` authenticates the active `config.testUser`; one token per role. |
| **OpenAPI MCP (authenticated API calls)** | `openapi` server present in `.mcp.json`; `OPENAPI_SPEC_PATH` set; `API_TOKEN` present AND unexpired (a dynamic tool call returns 2xx, not 401). | Missing/expired token → run the api-login flow (§6) then RESTART. Spec path unset / endpoints generic → the project never ran `/adapt-framework`; hand off there. |
| **DBHub MCP (data validation)** | `dbhub` server present; `DBHUB_*` set in `.env`; a probe query lists tables / returns the schema. | Unset vars or auth failure → user fills `.env` DBHUB_* block, then RESTART (spawn-time, §6). |
| **Issue-tracker (`[ISSUE_TRACKER_TOOL]`)** | `/acli` loaded; auth check per `/acli` references passes (`bun run jira:check` validates the Jira field/workflow setup). | Not authenticated / token missing → tell the user the exact var (`ATLASSIAN_*`) + `.env`, ask them to fix + RESTART. |
| **TMS (`[TMS_TOOL]`)** | Modality resolved (jira-xray vs jira-native, per `test-documentation/SKILL.md` §Phase 0). Modality jira-xray → `/xray-cli` loaded + `XRAY_*` creds set. | Xray creds missing → user fills `.env` `XRAY_*`. Modality unresolved → run the 4-step probe; ask only if all auto-checks fail. |
| **GitHub CLI** | `gh auth status` → authenticated; repo + workflows visible. | Not authed → user runs `gh auth login` themselves (suggest the `!` prefix); do not proceed. |
| **Playwright browsers** | `bunx playwright --version` resolves; chromium installed. | Missing browser → offer to run `bun run pw:install` (explain it downloads chromium), then proceed. |
| **Email (`resend`)** | `RESEND_API_KEY` set; the `resend` binary present (load `/resend-cli`). Mailbox can RECEIVE, not just send, for magic-link / token flows. | Send-only or missing key → STOP for email-dependent tickets; surface before authoring anything. |
| **Web search / docs** | `TAVILY_API_KEY` set (Tavily); `context7` needs no key. | Missing key → degrade to built-in search; note the degradation, do not block. |
| **Dev toolchain** | `bun run test` / `types:check` / `lint:check` resolve; `kata-manifest.json` present + `bun run kata:manifest:check` clean. | Stale manifest → `bun run kata:manifest`. Missing dep → `bun install`. |
| **GitHub Actions Secrets/Variables** | For CI-driven skills only: the runner holds the env-prefixed creds + tokens as Repository / Environment Secrets — `gh secret list` / `gh variable list` (add `--env <env>` for environment-scoped) shows them. | Missing → set from `.env` via `gh secret set <NAME>` / `gh variable set <NAME>` (`--env <env>` for environment scope). NOTE: `/adapt-framework` today only EMITS a manual copy-paste list; pushing them with `gh secret set` is the lower-friction path and avoids a runner that 401s mid-suite. |

## 5. Classify each RED, then surface ONE checklist

Split REDs into:

- **Self-fixable in-session** (no restart): run `bun run pw:install`, `bun run kata:manifest`, load a tool skill, run `bun run jira:check`. → Offer to do it, **explain what it does**, ask approval, then do it.
- **User-action** (a secret you must not invent, or an interactive login): missing `.env` value, `gh auth login`. → Tell the user the **exact var + file + why**, ask them to fix it.
- **MCP-spawn-time** (§6): `API_TOKEN`, `OPENAPI_SPEC_PATH`, any `DBHUB_*` — even when you can write the value, the running MCP will not see it until restart. → Write it (token only, via the script), then STOP and ask for a restart.

Surface them as a **single batched checklist** with `AskUserQuestion` (≤4 questions/call; multi-select where natural). Compose questions only for genuine gaps + REDs — never to pad a checklist (per `CLAUDE.md` Critical Rule #4, Shift-Left). One question per real decision: environment (ONLY if unresolved by an arg), missing-secret intents, and a confirm-to-fix for each self-fixable remedy.

**Never ask the user which test types / surfaces to run.** That is the skill's OWN decision, derived from story analysis + veto + risk-scoring in its planning phase (e.g. `sprint-testing` Stage 1). The gate's job is to PROBE and REPORT which surface tools are ready; the planning phase reads that report and picks trifuerza (UI/API/DB), a single surface, or code-review-only on its own. If a surface the planning later selects has a RED tool, surface that remedy then (lazy) — do not front-load a surface menu at the gate.

If a single `AskUserQuestion` round cannot hold the gaps AND the user benefits from seeing the full readiness table while answering, prefer the `wokitoki` skill (point-by-point browser form) over multiple terminal rounds.

GREEN items are reported, not asked.

## 6. Secret & token handling (load-bearing — read every time)

- Secrets live in `.env` ONLY. Never hardcode, never paste a secret into a skill artifact, a Jira field, a commit, or chat. When reporting status, say "set" / "unset" / "expired" — never the value.
- `.mcp.json` consumes secrets as `${VAR}`; `opencode.jsonc` as `{env:VAR}`. Both read the value **at MCP-server spawn time** — there is no mid-session refresh (per `CLAUDE.md` Critical Rule #10). So any write to `.env` that an MCP depends on (`API_TOKEN`, `OPENAPI_SPEC_PATH`, `DBHUB_*`, `XRAY_*`, `TAVILY_API_KEY`) requires the user to **restart the agent** (`bun claude` / `bun opencode`) before the change takes effect. Always end such a remedy with that instruction and STOP.

### The OpenAPI authenticated-call flow (canonical)

The OpenAPI MCP can invoke project endpoints **authenticated** — it injects `Authorization: Bearer ${API_TOKEN}`. The AI is responsible for minting that token, safely:

1. **Precondition:** `scripts/api-login.ts` is project-adapted (auth endpoint + payload shape wired by `/adapt-framework`), and `<<ACTIVE_ENV>>`-scoped creds exist in `.env`. If api-login is still generic → hand off to `/adapt-framework`; do not improvise an auth call.
2. **Mint:** run `bun run api:login:<env>` (or `bun run api:login` for the `.env` default). It authenticates `config.testUser`, writes `API_TOKEN` to `.env`, and stores the Playwright state at `.auth/api-state.json`. The AI never sees the raw token.
3. **Activate:** ask the user to **restart the agent** so the `openapi` MCP re-spawns with the fresh `${API_TOKEN}`. Until then, treat authenticated OpenAPI calls as RED.
4. **Per role:** repeat per role the scope needs (each role = its own creds → its own token); note that only one `API_TOKEN` is live at a time.

## 7. Output contract

The gate produces, before any other skill output:

```
Readiness — <skill> — env: <<ACTIVE_ENV>>
  GREEN: <capability, …>
  RED:   <capability — remedy class>
  Action: <none | questions asked | fix applied | RESTART required>
```

Then: all-GREEN → continue to the resume check. Any blocking RED unresolved → STOP at the gate. Never enter the skill's real work with a required capability RED.
