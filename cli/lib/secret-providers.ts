/**
 * @fileoverview Secret-manager providers: the ADVANCED, opt-in source of secret values.
 *
 * The default path is `.env` (ADR-0010, owner decision OD1 = b): a fresh clone,
 * a student, an offline laptop all fill `.env` and nothing here runs. A project
 * that keeps its secrets in a manager opts in through `.agents/project.yaml`
 * `secrets.provider`, and `bun run setup` writes ONE committed overlay file,
 * `.env.provider.schema`, that holds REFERENCES (`op(op://vault/item/field)`),
 * never a value. varlock resolves them each time a process starts through
 * `varlock run`; the value lives in that process and dies with it.
 *
 * HOW THE OVERLAY IS WIRED. `.env.core.schema` (generated, synced to every
 * project) ends its header with `@import(./.env.provider.schema,
 * allowMissing=true)`. No overlay = the import is a no-op and the project loads
 * exactly as before. The overlay carries its own root decorators (`@plugin`,
 * `@initOp`), which varlock honours in an imported file. Measured on varlock
 * 1.20.0 with `@varlock/1password-plugin@2.0.4` and a stand-in `op` CLI:
 *   - an absent overlay changes nothing (allowMissing);
 *   - an overlay value wins over the empty core declaration AND over a project
 *     re-declaration with an empty value in `.env.schema`;
 *   - a NON-empty value in `.env.local` / `.env`, or an inherited process
 *     variable, wins over the vault, and the vault is then not even asked
 *     (items resolve lazily), so one teammate on plain `.env` still works;
 *   - an EMPTY inherited process variable ALSO wins and blanks the item. GitHub
 *     Actions turns every unset `secrets.X` into an empty string, so
 *     `scripts/launch.ts` drops the empty inherited copies of the keys this
 *     overlay resolves (`providerResolvedKeys`) before it calls varlock;
 *   - `-p <file>` drops the `.env.local` ladder (probe P0.1), which is why the
 *     overlay is an import and never a `-p` flag.
 *
 * ONE SLOT, MANY PROVIDERS (OD2). `SECRET_PROVIDERS` lists what this repo
 * ships; `ADAPTERS` holds one entry per manager. 1Password is the only adapter
 * today. Another varlock plugin (the list is in `SUPPORTED_ELSEWHERE`) plugs in
 * by adding its id to `SECRET_PROVIDERS` and one `ProviderAdapter`: the file
 * name, the import, the launcher rule and the CI wiring stay as they are.
 *
 * `cli/` is import-closed (AGENTS.md §4.5): this module imports only from
 * `./variables-manifest.ts`, the `yaml` package and node built-ins.
 */

import type { VarSpec } from './variables-manifest.ts';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { valueSourceOf, VAR_MANIFEST } from './variables-manifest.ts';

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

/**
 * The overlay. Root-relative, committed (references only). varlock reads a
 * file starting with `.env` as `.env[.<env>][.<type>]`: `provider` lands in the
 * env slot, which an IMPORTED file ignores (the same rule `.env.core.schema`
 * relies on, see `cli/lib/env-schema.ts`).
 */
export const PROVIDER_SCHEMA_FILE = '.env.provider.schema';

/** Providers this repo ships. `local` = no manager: `.env` / `.env.local` only. */
export const SECRET_PROVIDERS = ['local', '1password'] as const;
export type SecretProvider = typeof SECRET_PROVIDERS[number];
export type ManagedProvider = Exclude<SecretProvider, 'local'>;

/**
 * varlock plugins that exist for other managers, as listed by the varlock
 * skill shipped inside `varlock@1.20.0` (`node_modules/varlock/skills/varlock/
 * SKILL.md`, section "Plugins"). Not shipped here; each one is a candidate
 * `ProviderAdapter`. Documentation only: nothing reads this list at runtime.
 */
export const SUPPORTED_ELSEWHERE: readonly string[] = [
  'AWS Secrets Manager',
  'Azure Key Vault',
  'Bitwarden',
  'Dashlane',
  'Doppler',
  'Google Secret Manager',
  'HashiCorp Vault',
  'Infisical',
  'Akeyless',
  'KeePass',
  'Keeper',
  'Passbolt',
  'Proton Pass',
  'Pass',
  'macOS Keychain (built into varlock)',
];

/**
 * The 1Password plugin, pinned EXACTLY. With a fixed version and no
 * `node_modules` copy, varlock fetches an `@varlock/*` plugin from npm into
 * `~/.varlock/plugins-cache` on first use, without a prompt, so the repo needs
 * no extra devDependency and a project on plain `.env` downloads nothing. Bump
 * it deliberately, like the `varlock` pin (ADR-0003).
 */
export const ONEPASSWORD_PLUGIN = '@varlock/1password-plugin@2.0.4';

/**
 * The service-account token variable. Same name the `op` CLI reads natively,
 * so one GitHub secret serves both. Declared `@internal` in the overlay:
 * varlock uses it, the child process never receives it.
 */
export const OP_TOKEN_VAR = 'OP_SERVICE_ACCOUNT_TOKEN';

// ----------------------------------------------------------------------------
// Config (`.agents/project.yaml` -> `secrets:`)
// ----------------------------------------------------------------------------

export type OnePasswordAuth = 'app' | 'service-account';

export interface OnePasswordSettings {
  /** Vault the references point at, e.g. `bunkai-dev` (team) or `Private` (personal). */
  vault: string | null
  /** Sign-in shorthand (`op account list`); null = the CLI's default account. */
  account: string | null
  /** `app` = desktop app locally, service account when the token is set (CI). `service-account` = token only. */
  auth: OnePasswordAuth
}

export interface SecretsConfig {
  provider: SecretProvider
  onepassword: OnePasswordSettings
}

export const DEFAULT_SECRETS_CONFIG: SecretsConfig = {
  provider: 'local',
  onepassword: { vault: null, account: null, auth: 'app' },
};

function str(value: unknown): string | null {
  if (typeof value !== 'string') { return null; }
  const t = value.trim();
  return t === '' ? null : t;
}

/**
 * Reads the `secrets:` block of a parsed `.agents/project.yaml`. A missing
 * block (a project older than the block) is `local`. An unknown provider or
 * auth mode throws: guessing would silently send a team to the wrong source.
 */
export function parseSecretsConfig(projectYaml: unknown): SecretsConfig {
  const block = (projectYaml as { secrets?: unknown } | null)?.secrets;
  if (block === undefined || block === null) { return structuredClone(DEFAULT_SECRETS_CONFIG); }
  if (typeof block !== 'object' || Array.isArray(block)) {
    throw new TypeError('.agents/project.yaml: `secrets:` must be a mapping.');
  }
  const raw = block as { provider?: unknown, onepassword?: unknown };
  const provider = str(raw.provider) ?? 'local';
  if (!(SECRET_PROVIDERS as readonly string[]).includes(provider)) {
    throw new TypeError(`.agents/project.yaml: secrets.provider '${provider}' is not one of ${SECRET_PROVIDERS.join(' | ')}.`);
  }
  const op = (raw.onepassword ?? {}) as { vault?: unknown, account?: unknown, auth?: unknown };
  const auth = str(op.auth) ?? 'app';
  if (auth !== 'app' && auth !== 'service-account') {
    throw new TypeError(`.agents/project.yaml: secrets.onepassword.auth '${auth}' is not one of app | service-account.`);
  }
  return {
    provider: provider as SecretProvider,
    onepassword: { vault: str(op.vault), account: str(op.account), auth },
  };
}

/** `parseSecretsConfig` over a yaml file on disk; `local` when the file is absent. */
export function readSecretsConfig(yamlPath: string): SecretsConfig {
  if (!existsSync(yamlPath)) { return structuredClone(DEFAULT_SECRETS_CONFIG); }
  return parseSecretsConfig(parseYaml(readFileSync(yamlPath, 'utf8')));
}

/** A vault name a reference can carry unquoted: letters, digits, `.`, `_`, `-`. */
export function isValidVaultName(name: string): boolean {
  return /^[\w.-]+$/.test(name);
}

// ----------------------------------------------------------------------------
// Adapters
// ----------------------------------------------------------------------------

export interface ProviderAdapter {
  id: ManagedProvider
  /** Human name, for prompts and the overlay banner. */
  label: string
  /** Root decorators the overlay opens with (without the leading `# `). */
  rootDecorators: (config: SecretsConfig) => string[]
  /** Items the overlay always declares (the auth token), as schema lines. */
  authItems: () => string[]
  /** The resolver expression for one variable. */
  reference: (config: SecretsConfig, varName: string) => string
  /** Comment lines above the per-variable block: the naming convention. */
  conventionNote: (config: SecretsConfig) => string[]
  /** Throws when the config cannot produce a working overlay. */
  validate: (config: SecretsConfig) => void
  /** What the human does once, after the overlay is written. Plain lines. */
  setupSteps: (config: SecretsConfig) => string[]
}

const ONEPASSWORD: ProviderAdapter = {
  id: '1password',
  label: '1Password',
  rootDecorators: (config) => {
    const { account, auth } = config.onepassword;
    const args = [`token=$${OP_TOKEN_VAR}`, `allowAppAuth=${auth === 'app' ? 'true' : 'false'}`];
    if (account !== null) { args.push(`account=${account}`); }
    return [`@plugin(${ONEPASSWORD_PLUGIN})`, `@initOp(${args.join(', ')})`];
  },
  authItems: () => [
    '# 1Password service-account token. CI only: a GitHub secret of the same',
    '# name. Leave it unset on a laptop, where the desktop app authenticates.',
    '# varlock uses it; the child process never receives it (@internal).',
    '# @type=opServiceAccountToken @sensitive @internal',
    `${OP_TOKEN_VAR}=`,
  ],
  reference: (config, varName) => `op(op://${config.onepassword.vault}/${varName}/password)`,
  conventionNote: config => [
    `# One line per secret kept in the vault "${config.onepassword.vault}". Convention: one`,
    '# item per variable, titled with the variable NAME, the value in its',
    '# "password" field (a Password item). Uncomment the line of every item the',
    '# vault holds; a commented line keeps reading .env / .env.local.',
  ],
  validate: (config) => {
    const { vault } = config.onepassword;
    if (vault === null) {
      throw new TypeError('secrets.onepassword.vault is empty: name the vault the references point at (e.g. <project>-dev).');
    }
    if (!isValidVaultName(vault)) {
      throw new TypeError(`secrets.onepassword.vault '${vault}' must use letters, digits, '.', '_' or '-' only (it is written into op:// references).`);
    }
  },
  setupSteps: (config) => {
    const { vault, auth } = config.onepassword;
    return [
      '1. Install the 1Password desktop app and its CLI `op` (https://developer.1password.com/docs/cli/get-started/; macOS: brew install 1password-cli).',
      '2. In the app: Settings > Developer > "Integrate with 1Password CLI" (unlock with biometrics; no token on disk).',
      `3. Vault "${vault}": one Password item per variable, titled with the variable NAME. Team = a shared vault; personal plan = your own vault (works locally, CI cannot read it).`,
      `4. In ${PROVIDER_SCHEMA_FILE}, uncomment the line of every item the vault holds, and leave those keys empty (or absent) in .env.`,
      '5. Check, redacted: bunx varlock load --agent',
      `6. CI (team plan only): a service account with read access to "${vault}"; its token goes in the GitHub secret ${OP_TOKEN_VAR}, beside the per-variable secrets.`,
      ...(auth === 'service-account' ? [`   auth = service-account: the desktop app is NOT used; ${OP_TOKEN_VAR} must be set wherever the project runs.`] : []),
    ];
  },
};

export const ADAPTERS: Record<ManagedProvider, ProviderAdapter> = {
  '1password': ONEPASSWORD,
};

// ----------------------------------------------------------------------------
// The overlay
// ----------------------------------------------------------------------------

/** Manifest variables a manager may serve: secret AND read from an env file. */
export function managedVarSpecs(manifest: readonly VarSpec[] = VAR_MANIFEST): VarSpec[] {
  return manifest.filter(s => s.secret && valueSourceOf(s) === 'env-file');
}

/**
 * The full text of `.env.provider.schema` for a managed provider. Every
 * per-variable line starts COMMENTED: the human uncomments the ones the vault
 * actually holds, so a fresh overlay never asks the vault for an item that does
 * not exist. Deterministic for a given config and manifest.
 */
export function providerSchemaTemplate(config: SecretsConfig, manifest: readonly VarSpec[] = VAR_MANIFEST): string {
  if (config.provider === 'local') {
    throw new TypeError('secrets.provider is local: there is no overlay to write.');
  }
  const adapter = ADAPTERS[config.provider];
  adapter.validate(config);

  const lines = [
    '# ============================================================================',
    `# ${PROVIDER_SCHEMA_FILE} - secret-manager overlay (varlock), provider: ${adapter.id}`,
    '# ============================================================================',
    '# ADVANCED, opt-in. The default home of a value is .env; this file serves the',
    `# secrets a team keeps in ${adapter.label} instead. It holds REFERENCES, never a`,
    '# value, so it is committed: each teammate resolves the same references',
    '# through their own access when a process starts (an MCP server, bun run test).',
    '#',
    '# Written once by `bun run setup` from .agents/project.yaml `secrets:`; yours',
    '# after that. Imported by .env.core.schema with allowMissing=true: delete this',
    '# file and the project is back on plain .env.',
    '#',
    '# Precedence: a NON-empty value in .env.local or .env, or one exported in the',
    '# shell, wins over the vault (and the vault is not asked for it). Leave a key',
    '# empty or absent in .env to read it from here.',
    '#',
    '# Check (redacted):  bunx varlock load --agent',
    '# Guide:             docs/core/variables-de-entorno.html, "Gestores de secretos"',
    '#',
    ...adapter.rootDecorators(config).map(d => `# ${d}`),
    '# @defaultRequired=false',
    '# @defaultSensitive=true',
    '# ---',
    '',
    ...adapter.authItems(),
    '',
    '# ----------------------------------------------------------------------------',
    ...adapter.conventionNote(config),
    '# ----------------------------------------------------------------------------',
    '',
    ...managedVarSpecs(manifest).map(spec => `# ${spec.name}=${adapter.reference(config, spec.name)}`),
  ];
  return `${lines.join('\n')}\n`;
}

/**
 * Names the overlay resolves from the manager: every ACTIVE item line (the
 * auth token included). Commented lines do not count. Pure, for the launcher.
 */
export function providerResolvedKeys(overlayText: string): string[] {
  const keys: string[] = [];
  for (const line of overlayText.split(/\r?\n/)) {
    const m = /^([A-Z_]\w*)=/i.exec(line);
    if (m) { keys.push(m[1]); }
  }
  return keys;
}

/** `providerResolvedKeys` of the overlay in `root`, or `[]` when there is none. */
export function providerResolvedKeysIn(root: string): string[] {
  const file = join(root, PROVIDER_SCHEMA_FILE);
  return existsSync(file) ? providerResolvedKeys(readFileSync(file, 'utf8')) : [];
}

// ----------------------------------------------------------------------------
// Writing the `secrets:` block back
// ----------------------------------------------------------------------------

function yamlScalar(value: string | null): string {
  if (value === null) { return 'null'; }
  return /^[\w.-]+$/.test(value) && !/^(?:null|true|false|yes|no|on|off|~|[-+]?[\d.]+(?:e[-+]?\d+)?)$/i.test(value) ? value : JSON.stringify(value);
}

/** The block a project without one gets appended, with its comments. */
export function secretsBlockText(config: SecretsConfig): string {
  const op = config.onepassword;
  return [
    '# Where SECRET values come from. `local` (the default) = .env / .env.local.',
    '# A secret manager is the ADVANCED option (ADR-0010): `bun run setup` writes the',
    '# committed overlay .env.provider.schema (references only, never values).',
    '# Read directly by the installer; not a {{VAR}} source.',
    'secrets:',
    `  provider: ${config.provider} # ${SECRET_PROVIDERS.join(' | ')}`,
    '  onepassword:',
    `    vault: ${yamlScalar(op.vault)} # vault the op:// references point at (e.g. myproject-dev; Private on a personal plan)`,
    `    account: ${yamlScalar(op.account)} # sign-in shorthand from \`op account list\`; null = the CLI default account`,
    `    auth: ${op.auth} # app (desktop app locally, service account in CI) | service-account (token only)`,
    '',
  ].join('\n');
}

/**
 * Sets the `secrets:` leaves in a project.yaml TEXT, line by line, keeping every
 * comment and every other line byte for byte (a Document round-trip reformats
 * the whole file). A file without the block gets `secretsBlockText` appended.
 */
export function writeSecretsToYamlText(text: string, config: SecretsConfig): string {
  const lines = text.split('\n');
  const start = lines.findIndex(l => /^secrets\s*:/.test(l));
  if (start === -1) {
    const sep = text.length === 0 || text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n';
    return `${text}${sep}${secretsBlockText(config)}`;
  }
  const values: Record<string, string> = {
    'provider': yamlScalar(config.provider),
    'onepassword.vault': yamlScalar(config.onepassword.vault),
    'onepassword.account': yamlScalar(config.onepassword.account),
    'onepassword.auth': yamlScalar(config.onepassword.auth),
  };
  let parent = '';
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\S/.test(line) && !line.startsWith('#')) { break; }
    const m = /^( +)([a-z_]\w*)\s*:(.*)$/i.exec(line);
    if (!m) { continue; }
    const [, indent, key, rest] = m;
    if (indent.length === 2) { parent = key; }
    const path = indent.length === 2 ? key : `${parent}.${key}`;
    if (!(path in values)) { continue; }
    const commentAt = rest.search(/\s#/);
    const comment = commentAt === -1 ? '' : rest.slice(commentAt);
    lines[i] = `${indent}${key}: ${values[path]}${comment}`;
  }
  return lines.join('\n');
}

// ----------------------------------------------------------------------------
// Opting in (the installer's write path)
// ----------------------------------------------------------------------------

export interface ProviderWriteResult {
  /** True when `.env.provider.schema` was written (it never overwrites one). */
  overlayWritten: boolean
  /** True when the `secrets:` block of the yaml changed. */
  yamlWritten: boolean
}

/**
 * Records the choice in `.agents/project.yaml` and, for a managed provider,
 * writes the overlay when it is absent. An existing overlay is the project's
 * (hand-uncommented lines live there): it is never replaced.
 */
export function applySecretsChoice(root: string, yamlPath: string, config: SecretsConfig): ProviderWriteResult {
  const overlay = join(root, PROVIDER_SCHEMA_FILE);
  let overlayWritten = false;
  if (config.provider !== 'local' && !existsSync(overlay)) {
    writeFileSync(overlay, providerSchemaTemplate(config), 'utf8');
    overlayWritten = true;
  }
  let yamlWritten = false;
  if (existsSync(yamlPath)) {
    const before = readFileSync(yamlPath, 'utf8');
    const after = writeSecretsToYamlText(before, config);
    if (after !== before) {
      writeFileSync(yamlPath, after, 'utf8');
      yamlWritten = true;
    }
  }
  return { overlayWritten, yamlWritten };
}
