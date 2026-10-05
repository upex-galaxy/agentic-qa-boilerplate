/**
 * @fileoverview Tests for the secret-manager provider slot.
 *
 * What they guard:
 *   1. `secrets:` parsing: a missing block is `local`; an unknown provider or
 *      auth mode throws instead of guessing.
 *   2. The 1Password overlay: pinned plugin, `@initOp` from the config, every
 *      managed variable present but COMMENTED, no value anywhere.
 *   3. `providerResolvedKeys` counts active item lines only.
 *   4. The yaml writer touches the `secrets:` leaves only, comments intact, and
 *      appends the block to a project that predates it.
 *   5. The generated `.env.core.schema` imports the overlay with allowMissing.
 *   6. Opting in writes the overlay once and never replaces a project's copy.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { parse as parseYaml } from 'yaml';

import { generateCoreSchema } from './env-schema.ts';
import {
  applySecretsChoice,
  DEFAULT_SECRETS_CONFIG,
  managedVarSpecs,
  ONEPASSWORD_PLUGIN,
  OP_TOKEN_VAR,
  parseSecretsConfig,
  PROVIDER_SCHEMA_FILE,
  providerResolvedKeys,
  providerSchemaTemplate,
  secretsBlockText,
  writeSecretsToYamlText,
} from './secret-providers.ts';

const team = {
  provider: '1password' as const,
  onepassword: { vault: 'acme-dev', account: null, auth: 'app' as const },
};

describe('parseSecretsConfig', () => {
  test('a project without the block is local', () => {
    expect(parseSecretsConfig({ project: { project_name: 'x' } })).toEqual(DEFAULT_SECRETS_CONFIG);
    expect(parseSecretsConfig(null)).toEqual(DEFAULT_SECRETS_CONFIG);
  });

  test('reads provider and the 1Password leaves', () => {
    const cfg = parseSecretsConfig({ secrets: { provider: '1password', onepassword: { vault: 'acme-dev', account: 'acme', auth: 'service-account' } } });
    expect(cfg).toEqual({ provider: '1password', onepassword: { vault: 'acme-dev', account: 'acme', auth: 'service-account' } });
  });

  test('an unknown provider or auth mode throws', () => {
    expect(() => parseSecretsConfig({ secrets: { provider: 'vaultwarden' } })).toThrow('not one of');
    expect(() => parseSecretsConfig({ secrets: { provider: '1password', onepassword: { auth: 'sso' } } })).toThrow('not one of');
  });
});

describe('providerSchemaTemplate (1password)', () => {
  const text = providerSchemaTemplate(team);

  test('pins the plugin and builds @initOp from the config', () => {
    expect(text).toContain(`# @plugin(${ONEPASSWORD_PLUGIN})`);
    expect(text).toContain(`# @initOp(token=$${OP_TOKEN_VAR}, allowAppAuth=true)`);
    const withAccount = providerSchemaTemplate({ ...team, onepassword: { ...team.onepassword, account: 'acme', auth: 'service-account' } });
    expect(withAccount).toContain(`# @initOp(token=$${OP_TOKEN_VAR}, allowAppAuth=false, account=acme)`);
  });

  test('lists every managed variable, commented, as a reference into the vault', () => {
    const specs = managedVarSpecs();
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      expect(text).toContain(`# ${spec.name}=op(op://acme-dev/${spec.name}/password)`);
    }
    // Only the token item is active in a fresh overlay.
    expect(providerResolvedKeys(text)).toEqual([OP_TOKEN_VAR]);
  });

  test('the token is internal and the file declares no value', () => {
    expect(text).toContain('# @type=opServiceAccountToken @sensitive @internal');
    expect(text).toContain(`${OP_TOKEN_VAR}=\n`);
  });

  test('refuses local, an empty vault and a vault name a reference cannot carry', () => {
    expect(() => providerSchemaTemplate(DEFAULT_SECRETS_CONFIG)).toThrow('local');
    expect(() => providerSchemaTemplate({ ...team, onepassword: { ...team.onepassword, vault: null } })).toThrow('vault is empty');
    expect(() => providerSchemaTemplate({ ...team, onepassword: { ...team.onepassword, vault: 'my vault' } })).toThrow('letters, digits');
  });
});

describe('providerResolvedKeys', () => {
  test('active item lines count, comments and decorators do not', () => {
    const overlay = '# @initOp(token=$OP_SERVICE_ACCOUNT_TOKEN)\n# ---\nOP_SERVICE_ACCOUNT_TOKEN=\nA_KEY=op(op://v/A_KEY/password)\n# B_KEY=op(op://v/B_KEY/password)\n';
    expect(providerResolvedKeys(overlay)).toEqual(['OP_SERVICE_ACCOUNT_TOKEN', 'A_KEY']);
  });
});

describe('writeSecretsToYamlText', () => {
  const yaml = [
    'project:',
    '  project_name: Acme # name',
    '',
    secretsBlockText(DEFAULT_SECRETS_CONFIG),
    'environments:',
    '  local:',
    '    web_url: null',
    '',
  ].join('\n');

  test('sets the leaves in place and keeps every comment', () => {
    const out = writeSecretsToYamlText(yaml, { ...team, onepassword: { ...team.onepassword, account: 'acme' } });
    expect(out).toContain('  provider: 1password # local | 1password');
    expect(out).toContain('    vault: acme-dev # vault the op:// references');
    expect(out).toContain('    account: acme # sign-in shorthand');
    expect(out).toContain('    auth: app # app (desktop app locally');
    expect(out.split('\n').length).toBe(yaml.split('\n').length);
    expect(out).toContain('  project_name: Acme # name');
    expect(parseSecretsConfig(parseYaml(out)).onepassword.vault).toBe('acme-dev');
  });

  test('appends the block to a yaml that predates it', () => {
    const out = writeSecretsToYamlText('project:\n  project_name: Acme\n', team);
    expect(parseSecretsConfig(parseYaml(out))).toEqual(team);
  });
});

describe('core schema hook', () => {
  test('imports the overlay with allowMissing, inside the header', () => {
    const core = generateCoreSchema();
    const header = core.slice(0, core.indexOf('\n# ---\n'));
    expect(header).toContain(`# @import(./${PROVIDER_SCHEMA_FILE}, allowMissing=true)`);
  });
});

describe('applySecretsChoice', () => {
  test('writes the overlay once, records the choice, never replaces an existing overlay', () => {
    const root = mkdtempSync(join(tmpdir(), 'secret-providers-'));
    try {
      const yamlPath = join(root, 'project.yaml');
      writeFileSync(yamlPath, `project:\n  project_name: Acme\n\n${secretsBlockText(DEFAULT_SECRETS_CONFIG)}`);
      const first = applySecretsChoice(root, yamlPath, team);
      expect(first).toEqual({ overlayWritten: true, yamlWritten: true });
      expect(parseSecretsConfig(parseYaml(readFileSync(yamlPath, 'utf8'))).provider).toBe('1password');
      writeFileSync(join(root, PROVIDER_SCHEMA_FILE), 'HAND_EDITED=op(op://acme-dev/HAND_EDITED/password)\n');
      const second = applySecretsChoice(root, yamlPath, team);
      expect(second).toEqual({ overlayWritten: false, yamlWritten: false });
      expect(readFileSync(join(root, PROVIDER_SCHEMA_FILE), 'utf8')).toContain('HAND_EDITED');
      const local = applySecretsChoice(join(root, 'other'), yamlPath, DEFAULT_SECRETS_CONFIG);
      expect(local.overlayWritten).toBe(false);
      expect(existsSync(join(root, 'other', PROVIDER_SCHEMA_FILE))).toBe(false);
    }
    finally { rmSync(root, { recursive: true, force: true }); }
  });
});
