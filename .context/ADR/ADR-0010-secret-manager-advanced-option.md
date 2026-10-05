# ADR-0010 — Secret values live in `.env` by default; a secret manager is the advanced, provider-agnostic opt-in

- **Status:** Accepted (by the owner, 2026-10-05)
- **Date:** 2026-10-05
- **Deciders:** framework owner (boilerplate maintainer): owner decisions OD1 = b and OD2 = a of the env-secrets spike (2026-10-05, `.session/decisions/env-secrets-2026-10-05.json`); OD1 overrode the spike's recommendation (1Password-first). Conductor ruling of the implementation fleet on the Critical Rule #1 wording (the readable exception becomes "the committed `.env*.schema` files"). Implemented by Q-U3 (this PR)
- **Tags:** secrets, env-schema, varlock, ci, onboarding
- **Supersedes:** —
- **Superseded by:** —

---

## Context

varlock owns the env schema since ADR-0003 and, since Q-U2 (#108), starts every harness and test run (`scripts/launch.ts` -> `varlock run`). The values still came from one place: a plaintext `.env` (and `.env.local`) on each laptop, and one GitHub secret per variable in CI. The env-secrets spike (`.session/spikes/env-secrets/plan.md` §4-§8) proposed resolving secrets from a manager at launch time through a varlock plugin, so a team shares one vault instead of passing values around, and a laptop holds no plaintext secret at all.

Two owner decisions frame the change:

1. **OD1 = b.** `.env` stays the DEFAULT. A student, a fresh clone, an offline laptop, a project without a paid manager all keep working with nothing new to install. The manager is the ADVANCED option a project opts into.
2. **OD2 = a.** The team model is a shared project vault (`<project>-dev`) plus one CI service account. A personal 1Password plan must work too (desktop-app auth, personal vault), knowing it cannot serve CI (a service account cannot read a personal vault). And 1Password must never be the only option: the hook is generic, so another varlock-supported manager plugs in the same way.

Measured before the design (varlock 1.20.0, `@varlock/1password-plugin@2.0.4`, a stand-in `op` CLI that answers `op inject`, throwaway values only):

- An overlay file imported with `@import(<file>, allowMissing=true)` changes nothing when absent, and its own root decorators (`@plugin`, `@initOp`) work when imported.
- An overlay item wins over the empty core declaration and over a project re-declaration with an empty value. A NON-empty value in `.env.local` / `.env`, or an inherited variable, wins over the vault, and the vault is not asked for that item (lazy resolution).
- An EMPTY inherited variable also wins and blanks the item. GitHub Actions renders every unset `secrets.X` as an empty string.
- `-p <file>` drops the `.env.local` ladder (probe P0.1, re-verified); `-p <dir>/` keeps it.
- With a pinned version and no `node_modules` copy, varlock fetches an `@varlock/*` plugin from npm into `~/.varlock/plugins-cache` without a prompt.

## Decision

We will keep `.env` / `.env.local` as the default home of every value and offer a secret manager as an opt-in overlay with one generic slot:

1. **The slot.** `.env.core.schema` (generated, synced) imports `./.env.provider.schema` with `allowMissing=true`. A project without the file loads exactly as before. The overlay is COMMITTED: it holds references (`op(op://<vault>/<VAR>/password)`), never a value, so the Critical Rule #1 readable exception is "`.env.example` and the committed `.env*.schema` files".
2. **The choice.** `.agents/project.yaml` `secrets.provider: local | 1password` (default `local`), plus `secrets.onepassword.{vault, account, auth: app | service-account}`. `bun run setup` keeps `.env` first and offers the manager as the advanced option; choosing it writes the overlay once (never over an existing one) and records the choice.
3. **The provider.** 1Password is the first and only shipped adapter (`cli/lib/secret-providers.ts`): plugin pinned EXACTLY (`@varlock/1password-plugin@2.0.4`, no devDependency), `@initOp(token=$OP_SERVICE_ACCOUNT_TOKEN, allowAppAuth=<auth == app>)`, one Password item per variable titled with the variable NAME. Every per-variable line is written commented; the human uncomments what the vault holds.
4. **CI beside, never instead.** Workflows pass `OP_SERVICE_ACCOUNT_TOKEN` NEXT TO the per-variable secrets. The launcher drops the empty inherited copy of every key the overlay resolves before it calls varlock, so an unset per-variable secret cannot blank a vault value, and a set one still wins.
5. **Another provider** = one more id in `SECRET_PROVIDERS` and one `ProviderAdapter`. File name, import, launcher rule and CI wiring stay. varlock 1.20.0 ships plugins for AWS Secrets Manager, Azure Key Vault, Bitwarden, Dashlane, Doppler, Google Secret Manager, HashiCorp Vault, Infisical, Akeyless, KeePass, Keeper, Passbolt, Proton Pass and Pass, plus a built-in macOS Keychain (`node_modules/varlock/skills/varlock/SKILL.md`, "Plugins").

## Consequences

- **Positive:** a team shares one vault and onboards a person by granting vault access instead of sending values; a laptop on desktop-app auth holds no plaintext secret; the overlay reads like the schema it extends, so the AI can open it (references only); a project that never opts in sees one inert import line.
- **Negative / trade-offs:** a teammate without 1Password access must put a non-empty value in `.env.local` for every active overlay item, or the load fails on those items (clear error, item by item). Desktop-app auth runs `op` once in the preflight and once in `varlock run`, so a cold app may prompt; unlock it first (`cacheTtl` on `@initOp` is the documented relief, not set by default: it caches resolved values). The first load downloads the plugin from npm. Steps that bypass the launcher (`bun xray` in the XrayImport job, the portal publisher) still read per-variable secrets only. The personal plan cannot serve CI.
- **Neutral / follow-ups:** the CI path with ONLY the service-account token, and the real `op` + desktop-app path, are owner actions (a vault, a service account and a GitHub secret this repo does not have); they were proven here with a stand-in `op`. agentic-dev receives the same slot by porting this change. MCP servers launched by a desktop host without a command line are Q-U4's scope.

## Alternatives considered

- **1Password-first onboarding with `.env` as fallback** (the spike's OD1 recommendation) — overridden by the owner: it makes a paid account and an app the first step for every student.
- **`op run --env-file` wrapper** (spike option C) — a second source of truth beside the varlock schema, 1Password-only.
- **Passing the overlay with `varlock run -p`** — measured: `-p <file>` silently drops `.env.local`.
- **The import line in the project-owned `.env.schema`** — works, but `.env.schema` is delivered once, so every existing project would have to edit its own file; the synced core gets the hook to all of them through `bun run up`.
- **The plugin as a devDependency** — every clone would install the 1Password SDK (WASM) to support an option most projects never enable.

## References

- `.session/spikes/env-secrets/plan.md` §4 (varlock + 1Password plugin), §7 row "Q-U3 1Password provider", §8 R4/R6; probe `archive-2026-09-22/probe.md` P0.1/P0.2/P0.4.
- ADR-0003 (varlock owns the env schema), ADR-0005 (validation scope).
- varlock.dev/plugins/1password, the plugin README in `@varlock/1password-plugin@2.0.4`.
- `cli/lib/secret-providers.ts`, `cli/lib/env-schema.ts`, `scripts/launch.ts`, `docs/core/variables-de-entorno.html` ("Gestores de secretos").
