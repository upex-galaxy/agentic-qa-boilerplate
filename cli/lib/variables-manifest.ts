/**
 * @fileoverview Canonical variable manifest — the SINGLE SOURCE OF TRUTH for
 * every environment variable this repo knows about and where each one must go.
 *
 * Per handoff decision D1 (`.scratch/handoff-installer-variables-automation.md`):
 * this typed module replaces the four disconnected, drift-prone lists that used
 * to scatter var routing across the codebase (`INSTALLER_DEFERRED_VARS`,
 * `MCP_SERVER_SECRETS`, `DAY_ZERO_*`, and `doctor.ts`'s `PROJECT_BOUND_VARS`).
 *
 * Consumers (wired in later phases — NOT this phase):
 *   - `cli/install.ts`          → manifest-driven collection + closing summary.
 *   - `cli/doctor.ts`           → required-var health checks.
 *   - `cli/update-boilerplate.ts` → `.env` drift detection on update.
 *
 * `.env.example` stays the human-facing doc humans copy from; `scripts/check-vars.ts`
 * asserts manifest ⇄ `.env.example` parity so they never drift (D1).
 *
 * Remote target for THIS repo (QA) = GitHub Actions secrets (`gh secret set`),
 * because the test suites run in GitHub Actions. `GITHUB_TOKEN` is deliberately
 * EXCLUDED from the manifest: it is auto-injected by Actions and must never be
 * pushed (see the comment on the local-only block below).
 */

import * as fs from 'node:fs';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

/**
 * Where a variable must live.
 *   - `local`  → the developer's `.env` file.
 *   - `github` → a GitHub Actions repository secret (or CI env input).
 *
 * NOTE: `VarScope` (production/preview/development) is intentionally OMITTED for
 * this repo. GitHub Actions secrets have no per-scope concept — the field exists
 * only in the DEV (Vercel) sibling boilerplate. Kept out here for clarity rather
 * than carrying a dead field.
 */
export type VarDestination = 'local' | 'github';

/**
 * A conditional-required clause: the var is required only when another env var
 * holds a specific value, e.g. `{ ifEnv: 'TEST_ENV=staging' }`.
 */
export interface VarRequiredIfEnv {
  ifEnv: string
}

/**
 * Canonical description of one environment variable.
 *
 *   - `name`         UPPER_SNAKE_CASE env-var key.
 *   - `destinations` non-empty list of sinks this var must reach.
 *   - `secret`       true → mask in logs, pipe via stdin, treat as sensitive.
 *   - `required`     `true` (always), `false` (optional), or a conditional
 *                    clause (`{ ifEnv: 'TEST_ENV=local' }`).
 *   - `critical`     true → a project-INDEPENDENT tool credential the NORMAL
 *                    installer prompts for interactively at day-0 (identical in
 *                    both boilerplates). false → NON-critical: never asked at
 *                    install, never warned about; surfaced only in the closing
 *                    "Next steps — finish later" list with its `obtainHint`,
 *                    and settable later via `bun run setup --variables`.
 *   - `obtainHint`   (NON-critical only) concise where/how-to-get-it pointer
 *                    printed in the closing next-steps section.
 *   - `defaultValue` (special cases only, e.g. TEST_ENV) value the installer
 *                    writes when the var is absent — WITHOUT prompting.
 *   - `note`         one-line human rationale / CI consumer reference.
 */
export interface VarSpec {
  name: string
  destinations: VarDestination[]
  secret: boolean
  required: boolean | VarRequiredIfEnv
  critical: boolean
  obtainHint?: string
  defaultValue?: string
  note: string
}

// ----------------------------------------------------------------------------
// The manifest — content sourced from §2 (QA table) of the handoff.
// ----------------------------------------------------------------------------

/**
 * Every variable this repo manages, with its destination routing.
 *
 * Excluded by design: `GITHUB_TOKEN` (auto-injected by GitHub Actions — pushing
 * it is both unnecessary and a footgun, so it is NOT listed here as pushable).
 */
export const VAR_MANIFEST: VarSpec[] = [
  // --- Environment selection ---
  {
    name: 'TEST_ENV',
    destinations: ['local', 'github'],
    secret: false,
    required: true,
    critical: false,
    defaultValue: 'local',
    obtainHint: 'defaults to local; reconfigure manually or via the /adapt-framework skill when you adapt the framework to your project-under-test.',
    note: 'Which environment to test against (local | staging). CI env INPUT, not a secret; local required by validateTestEnv.ts. Installer writes the default; never prompts.',
  },

  // --- Test user credentials (per-environment) ---
  {
    name: 'LOCAL_USER_EMAIL',
    destinations: ['local', 'github'],
    secret: false,
    required: { ifEnv: 'TEST_ENV=local' },
    critical: false,
    obtainHint: 'test-user creds for your project-under-test; set when adapting the framework to your project.',
    note: 'Local test user email. CI secret in all workflows. Project-dependent — set later, not at install.',
  },
  {
    name: 'LOCAL_USER_PASSWORD',
    destinations: ['local', 'github'],
    secret: true,
    required: { ifEnv: 'TEST_ENV=local' },
    critical: false,
    obtainHint: 'test-user creds for your project-under-test; set when adapting the framework to your project.',
    note: 'Local test user password. CI secret in all workflows. Project-dependent — set later, not at install.',
  },
  {
    name: 'STAGING_USER_EMAIL',
    destinations: ['local', 'github'],
    secret: false,
    required: { ifEnv: 'TEST_ENV=staging' },
    critical: false,
    obtainHint: 'test-user creds for your project-under-test; set when adapting the framework to your project.',
    note: 'Staging test user email. CI secret in build/regression/sanity/smoke workflows. Project-dependent — set later.',
  },
  {
    name: 'STAGING_USER_PASSWORD',
    destinations: ['local', 'github'],
    secret: true,
    required: { ifEnv: 'TEST_ENV=staging' },
    critical: false,
    obtainHint: 'test-user creds for your project-under-test; set when adapting the framework to your project.',
    note: 'Staging test user password. Required when TEST_ENV=staging. Project-dependent — set later.',
  },

  // --- Xray (TMS, optional) ---
  {
    name: 'XRAY_CLIENT_ID',
    destinations: ['local', 'github'],
    secret: true,
    required: false,
    critical: false,
    obtainHint: 'Xray Cloud → API keys (only if your project uses Xray TMS).',
    note: 'Xray Cloud client id. Referenced by regression.yml:46; optional (needed only when AUTO_SYNC && xray).',
  },
  {
    name: 'XRAY_CLIENT_SECRET',
    destinations: ['local', 'github'],
    secret: true,
    required: false,
    critical: false,
    obtainHint: 'Xray Cloud → API keys (only if your project uses Xray TMS).',
    note: 'Xray Cloud client secret. Referenced by regression.yml:47; optional (needed only when AUTO_SYNC && xray).',
  },
  {
    name: 'XRAY_PROJECT_KEY',
    destinations: ['local', 'github'],
    secret: false,
    required: false,
    critical: false,
    obtainHint: 'your Xray project key (only if your project uses Xray TMS).',
    note: 'Xray project key. Optional operational param.',
  },

  // --- Operational CI flag ---
  {
    name: 'AUTO_SYNC',
    destinations: ['github'],
    secret: false,
    required: false,
    critical: false,
    obtainHint: 'CI flag — set to "true" in GitHub secrets only if you auto-sync Xray results from CI.',
    note: 'CI operational flag (default false). Referenced by regression.yml:45. GitHub-only.',
  },

  // --- Atlassian (Day-0 credentials) ---
  {
    name: 'ATLASSIAN_URL',
    destinations: ['local', 'github'],
    secret: false,
    required: true,
    critical: true,
    note: 'Atlassian site URL. CRITICAL — Day-0 collected; GitHub refs are commented in regression.yml:51-53.',
  },
  {
    name: 'ATLASSIAN_EMAIL',
    destinations: ['local', 'github'],
    secret: false,
    required: true,
    critical: true,
    note: 'Atlassian account email. CRITICAL — Day-0 collected.',
  },
  {
    name: 'ATLASSIAN_API_TOKEN',
    destinations: ['local', 'github'],
    secret: true,
    required: true,
    critical: true,
    note: 'Atlassian API token. CRITICAL — Day-0 collected; sensitive.',
  },

  // --- Slack (CI-only notifier) ---
  {
    name: 'SLACK_WEBHOOK_URL',
    destinations: ['github'],
    secret: true,
    required: false,
    critical: false,
    obtainHint: 'Slack → Incoming Webhooks (optional CI notifications).',
    note: 'CI-only Slack webhook for notifications. Absent from .env.example historically; GitHub-only secret.',
  },

  // --- LOCAL-ONLY set: no CI consumer; never pushed to GitHub ---
  // (GITHUB_TOKEN is deliberately NOT in this manifest — auto-injected by Actions.)
  {
    name: 'TAVILY_API_KEY',
    destinations: ['local'],
    secret: true,
    required: false,
    critical: true,
    note: 'Tavily web-search MCP key. CRITICAL — powers the pre-configured Tavily MCP; project-independent tool. Local only.',
  },
  {
    name: 'POSTMAN_API_KEY',
    destinations: ['local'],
    secret: true,
    required: false,
    critical: false,
    obtainHint: 'Postman → Settings → API keys (only if your project uses the Postman MCP).',
    note: 'Postman MCP collection-runner key. Local only.',
  },
  {
    name: 'API_BASE_URL',
    destinations: ['local'],
    secret: false,
    required: false,
    critical: false,
    obtainHint: 'your project-under-test API base URL — set when adapting the framework.',
    note: 'Backend API base URL for OpenAPI MCP exploration. Local only.',
  },
  {
    name: 'OPENAPI_SPEC_PATH',
    destinations: ['local'],
    secret: false,
    required: false,
    critical: false,
    obtainHint: 'path/URL to your project OpenAPI spec — set when adapting the framework.',
    note: 'Path/URL to the OpenAPI spec for the OpenAPI MCP. Local only.',
  },
  {
    name: 'API_TOKEN',
    destinations: ['local'],
    secret: true,
    required: false,
    critical: false,
    obtainHint: 'auto-populated by `bun run api:login` against your project; no manual entry needed.',
    note: 'Bearer token for API exploration (auto-populated by api:login). Local only.',
  },
  {
    name: 'RESEND_API_KEY',
    destinations: ['local'],
    secret: true,
    required: false,
    critical: true,
    note: 'Resend email-test verification key; also authenticates the resend CLI. CRITICAL — project-independent email-testing tool. Local only.',
  },
  {
    name: 'DBHUB_TYPE',
    destinations: ['local'],
    secret: false,
    required: false,
    critical: false,
    obtainHint: 'your project DB driver (sqlserver | postgres | mysql | sqlite | mariadb) — set when adapting the framework.',
    note: 'DBHub MCP driver (sqlserver | postgres | mysql | sqlite | mariadb). Local only.',
  },
  {
    name: 'DBHUB_HOST',
    destinations: ['local'],
    secret: false,
    required: false,
    critical: false,
    obtainHint: 'your project DB connection — set when adapting the framework.',
    note: 'DBHub MCP host. Local only.',
  },
  {
    name: 'DBHUB_PORT',
    destinations: ['local'],
    secret: false,
    required: false,
    critical: false,
    obtainHint: 'your project DB connection — set when adapting the framework.',
    note: 'DBHub MCP port. Local only.',
  },
  {
    name: 'DBHUB_DATABASE',
    destinations: ['local'],
    secret: false,
    required: false,
    critical: false,
    obtainHint: 'your project DB connection — set when adapting the framework.',
    note: 'DBHub MCP database name. Local only.',
  },
  {
    name: 'DBHUB_USER',
    destinations: ['local'],
    secret: false,
    required: false,
    critical: false,
    obtainHint: 'your project DB connection — set when adapting the framework.',
    note: 'DBHub MCP user. Local only.',
  },
  {
    name: 'DBHUB_PASSWORD',
    destinations: ['local'],
    secret: true,
    required: false,
    critical: false,
    obtainHint: 'your project DB connection — set when adapting the framework.',
    note: 'DBHub MCP password. Local only; sensitive.',
  },
];

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/**
 * All manifest vars whose destinations include `dest`.
 * Preserves manifest order.
 */
export function varsFor(dest: VarDestination): VarSpec[] {
  return VAR_MANIFEST.filter(spec => spec.destinations.includes(dest));
}

/**
 * The CRITICAL set — project-INDEPENDENT tool credentials the normal installer
 * prompts for interactively at day-0 (identical across both boilerplates).
 * Preserves manifest order. The `--variables` "set/reset critical" path and
 * `install.ts` day-0 collection both iterate this.
 */
export function criticalVars(): VarSpec[] {
  return VAR_MANIFEST.filter(spec => spec.critical);
}

/**
 * The NON-critical set — vars NEVER prompted at install and never warned about.
 * Surfaced only in the closing "Next steps — finish later" list (each with its
 * `obtainHint`). Preserves manifest order.
 */
export function nonCriticalVars(): VarSpec[] {
  return VAR_MANIFEST.filter(spec => !spec.critical);
}

/**
 * True if the named var is declared `secret` in the manifest. Unknown names
 * return `false` (the manifest is authoritative; callers should not assume a
 * non-manifest var is sensitive based on this helper).
 */
export function isManifestSecret(name: string): boolean {
  const spec = VAR_MANIFEST.find(s => s.name === name);
  return spec ? spec.secret : false;
}

/**
 * Resolve whether `spec` is required GIVEN the current environment snapshot.
 *
 *   - `required: true`  → always required.
 *   - `required: false` → never required.
 *   - `required: {ifEnv: 'KEY=VALUE'}` → required only when `env[KEY] === VALUE`.
 *
 * A malformed `ifEnv` clause (no `=`) is treated as not-required rather than
 * throwing — `validateVarManifest()` is the place that rejects malformed specs.
 */
export function requiredNow(spec: VarSpec, env: Record<string, string>): boolean {
  if (typeof spec.required === 'boolean') {
    return spec.required;
  }
  const clause = spec.required.ifEnv;
  const eq = clause.indexOf('=');
  if (eq === -1) {
    return false;
  }
  const key = clause.slice(0, eq).trim();
  const expected = clause.slice(eq + 1).trim();
  return (env[key] ?? '') === expected;
}

/**
 * Parse the UNCOMMENTED `KEY=...` keys declared in a `.env.example` file.
 *
 * Lines that are blank, comments (`#`/`*` after optional leading whitespace),
 * or lack a `=` are ignored. Inline trailing comments on a value line do NOT
 * affect the key. Returns keys in file order, de-duplicated.
 */
export function parseDotEnvExampleKeys(envExamplePath: string): string[] {
  const raw = fs.readFileSync(envExamplePath, 'utf8');
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('*')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    // Strip an optional `export ` prefix, then take the key.
    const lhs = trimmed.slice(0, eq).replace(/^export\s+/, '').trim();
    if (!/^[a-z_]\w*$/i.test(lhs)) {
      continue;
    }
    if (!seen.has(lhs)) {
      seen.add(lhs);
      keys.push(lhs);
    }
  }
  return keys;
}

// ----------------------------------------------------------------------------
// Validation (mirrors the spirit of validateComponentRegistry in
// cli/update-boilerplate.ts → updater-core.ts: pure, fails fast on a malformed
// registry before any consumer relies on it).
// ----------------------------------------------------------------------------

const VALID_DESTINATIONS: readonly VarDestination[] = ['local', 'github'];
const ENV_VAR_NAME = /^[A-Z][A-Z0-9_]*$/;

/**
 * Error thrown when the variable manifest is structurally invalid.
 */
export class VarManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VarManifestError';
  }
}

/**
 * Validate `VAR_MANIFEST`. Throws `VarManifestError` on the first problem found:
 *   - duplicate `name`
 *   - empty / malformed `name`
 *   - empty `destinations`, unknown destination, or duplicate destination
 *   - malformed conditional-required clause (`{ ifEnv }` without a `KEY=VALUE`)
 *   - empty `note`
 *
 * Pure / no I/O — safe to call at module load or startup so a bad entry fails
 * fast before install/doctor/update consume it.
 */
export function validateVarManifest(manifest: readonly VarSpec[] = VAR_MANIFEST): void {
  const seen = new Set<string>();
  for (const spec of manifest) {
    if (typeof spec.name !== 'string' || !ENV_VAR_NAME.test(spec.name)) {
      throw new VarManifestError(
        `Invalid var name '${String(spec.name)}'. Names must be UPPER_SNAKE_CASE (^[A-Z][A-Z0-9_]*$).`,
      );
    }
    if (seen.has(spec.name)) {
      throw new VarManifestError(`Duplicate var '${spec.name}' in VAR_MANIFEST.`);
    }
    seen.add(spec.name);

    if (!Array.isArray(spec.destinations) || spec.destinations.length === 0) {
      throw new VarManifestError(`Var '${spec.name}' has empty 'destinations'.`);
    }
    const destSeen = new Set<VarDestination>();
    for (const dest of spec.destinations) {
      if (!VALID_DESTINATIONS.includes(dest)) {
        throw new VarManifestError(
          `Var '${spec.name}' has unknown destination '${String(dest)}'. Valid: ${VALID_DESTINATIONS.join(', ')}.`,
        );
      }
      if (destSeen.has(dest)) {
        throw new VarManifestError(`Var '${spec.name}' lists destination '${dest}' more than once.`);
      }
      destSeen.add(dest);
    }

    if (typeof spec.secret !== 'boolean') {
      throw new VarManifestError(`Var '${spec.name}' has non-boolean 'secret'.`);
    }

    if (typeof spec.required !== 'boolean') {
      if (!spec.required || typeof spec.required !== 'object' || !('ifEnv' in spec.required)) {
        throw new VarManifestError(`Var '${spec.name}' has invalid 'required' (expected boolean | { ifEnv }).`);
      }
      const clause = spec.required.ifEnv;
      if (typeof clause !== 'string' || !clause.includes('=') || clause.indexOf('=') === 0) {
        throw new VarManifestError(
          `Var '${spec.name}' has malformed 'required.ifEnv' (expected 'KEY=VALUE'): '${String(clause)}'.`,
        );
      }
    }

    if (typeof spec.critical !== 'boolean') {
      throw new VarManifestError(`Var '${spec.name}' has non-boolean 'critical'.`);
    }
    // NON-critical vars must explain where to get them (the closing next-steps
    // list relies on this). CRITICAL vars are prompted with their own day-0
    // notes, so an obtainHint is optional for them.
    if (!spec.critical && (typeof spec.obtainHint !== 'string' || spec.obtainHint.trim() === '')) {
      throw new VarManifestError(`Non-critical var '${spec.name}' is missing a non-empty 'obtainHint'.`);
    }
    if (spec.obtainHint !== undefined && typeof spec.obtainHint !== 'string') {
      throw new VarManifestError(`Var '${spec.name}' has non-string 'obtainHint'.`);
    }
    if (spec.defaultValue !== undefined && typeof spec.defaultValue !== 'string') {
      throw new VarManifestError(`Var '${spec.name}' has non-string 'defaultValue'.`);
    }

    if (typeof spec.note !== 'string' || spec.note.trim() === '') {
      throw new VarManifestError(`Var '${spec.name}' has empty 'note'.`);
    }
  }
}
