import type { RtkDeps, RtkOut } from './rtk-setup.ts';
import { describe, expect, test } from 'bun:test';

import { hasRtkHook, offerRtk, RTK_MANUAL_PROMPT, RTK_UNINSTALL, rtkInstallCommand, rtkState } from './rtk-setup.ts';

const HOOK_SETTINGS = JSON.stringify({
  hooks: {
    PreToolUse: [
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'rtk hook claude' }] },
    ],
  },
});

interface World {
  binaries: Set<string>
  gainOk: boolean
  settings: string | null
  installOk: boolean
  initWritesHook: boolean
}

function fake(world: Partial<World> = {}, over: Partial<RtkDeps> = {}) {
  const w: World = { binaries: new Set(['rtk', 'claude']), gainOk: true, settings: null, installOk: true, initWritesHook: true, ...world };
  const commands: string[] = [];
  const lines: string[] = [];
  const out: RtkOut = {
    info: m => lines.push(m),
    success: m => lines.push(m),
    warn: m => lines.push(m),
    error: m => lines.push(m),
    dim: m => lines.push(m),
  };
  const deps: RtkDeps = {
    platform: 'darwin',
    nonInteractive: false,
    has: b => w.binaries.has(b),
    run: (cmd, args) => {
      commands.push([cmd, ...args].join(' '));
      if (cmd === 'rtk' && args[0] === 'gain') { return { ok: w.gainOk, stdout: '', stderr: '' }; }
      if (cmd === 'rtk' && args[0] === 'init') {
        if (w.initWritesHook) { w.settings = HOOK_SETTINGS; }
        return { ok: true, stdout: '', stderr: '' };
      }
      if (!w.installOk) { return { ok: false, stdout: '', stderr: 'boom' }; }
      w.binaries.add('rtk');
      return { ok: true, stdout: '', stderr: '' };
    },
    readClaudeSettings: () => w.settings,
    confirm: async () => true,
    out,
    ...over,
  };
  return { deps, commands, lines, world: w };
}

describe('rtkState', () => {
  test('not-installed: no rtk on PATH', () => {
    const { deps } = fake({ binaries: new Set() });
    expect(rtkState(deps)).toBe('not-installed');
  });
  test('wrong-binary: rtk on PATH but gain fails', () => {
    const { deps } = fake({ gainOk: false });
    expect(rtkState(deps)).toBe('wrong-binary');
  });
  test('installed-no-hook: gain ok, no settings.json', () => {
    const { deps } = fake({ settings: null });
    expect(rtkState(deps)).toBe('installed-no-hook');
  });
  test('ready: gain ok and the hook is present', () => {
    const { deps } = fake({ settings: HOOK_SETTINGS });
    expect(rtkState(deps)).toBe('ready');
  });
});

describe('hasRtkHook', () => {
  test('finds the rtk hook among other hooks', () => {
    const text = JSON.stringify({
      hooks: {
        PreToolUse: [
          { matcher: 'Edit', hooks: [{ type: 'command', command: 'prettier --write' }] },
          { matcher: 'Bash', hooks: [{ type: 'command', command: 'other-tool run' }, { type: 'command', command: '/usr/local/bin/rtk hook claude' }] },
        ],
        PostToolUse: [],
      },
    });
    expect(hasRtkHook(text)).toBe(true);
  });
  test('other hooks only: no rtk hook', () => {
    const text = JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ command: 'other-tool' }] }] } });
    expect(hasRtkHook(text)).toBe(false);
  });
  test('rtk hook under another event does not count', () => {
    const text = JSON.stringify({ hooks: { PostToolUse: [{ hooks: [{ command: 'rtk hook claude' }] }] } });
    expect(hasRtkHook(text)).toBe(false);
  });
  test('malformed JSON is no hook and does not throw', () => {
    expect(hasRtkHook('{ not json')).toBe(false);
    expect(hasRtkHook('null')).toBe(false);
    expect(hasRtkHook(null)).toBe(false);
  });
});

describe('rtkInstallCommand', () => {
  test('darwin with brew', () => {
    expect(rtkInstallCommand({ platform: 'darwin', hasBrew: true, hasWinget: false })).toEqual({ argv: ['brew', 'install', 'rtk'] });
  });
  test('linux with brew', () => {
    expect(rtkInstallCommand({ platform: 'linux', hasBrew: true, hasWinget: false })).toEqual({ argv: ['brew', 'install', 'rtk'] });
  });
  test('linux without brew falls back to the curl script', () => {
    const cmd = rtkInstallCommand({ platform: 'linux', hasBrew: false, hasWinget: false });
    expect('argv' in cmd && cmd.argv.slice(0, 2)).toEqual(['sh', '-c']);
    expect('argv' in cmd && cmd.argv[2]).toContain('rtk-ai/rtk/refs/heads/master/install.sh');
  });
  test('win32 uses winget, or a manual line without it', () => {
    expect(rtkInstallCommand({ platform: 'win32', hasBrew: false, hasWinget: true })).toEqual({ argv: ['winget', 'install', 'rtk-ai.rtk'] });
    expect(rtkInstallCommand({ platform: 'win32', hasBrew: false, hasWinget: false })).toEqual({ manual: 'winget install rtk-ai.rtk' });
  });
});

describe('offerRtk', () => {
  test('ready: idempotent, only the read-only gain probe runs and nothing is asked or written', async () => {
    let asked = false;
    const { deps, commands, world } = fake({ settings: HOOK_SETTINGS }, { confirm: async () => { asked = true; return true; } });
    expect(await offerRtk(deps)).toBe('already-installed');
    expect(commands).toEqual(['rtk gain']);
    expect(asked).toBe(false);
    expect(world.settings).toBe(HOOK_SETTINGS);
  });

  test('non-interactive: runs no command, prints the manual prompt', async () => {
    const { deps, commands, lines } = fake({ binaries: new Set(['claude']) }, { nonInteractive: true });
    expect(await offerRtk(deps)).toBe('skipped-non-interactive');
    expect(commands).toEqual([]);
    expect(lines.join('\n')).toContain('rtk gain');
    expect(lines.join('\n')).toContain('--dry-run');
  });

  test('no claude on PATH: manual prompt, no command', async () => {
    const { deps, commands } = fake({ binaries: new Set() });
    expect(await offerRtk(deps)).toBe('no-claude');
    expect(commands).toEqual([]);
  });

  test('declined: no command beyond the state probe, manual prompt printed', async () => {
    const { deps, commands, lines } = fake({ binaries: new Set(['claude']) }, { confirm: async () => false });
    expect(await offerRtk(deps)).toBe('declined');
    expect(commands).toEqual([]);
    expect(lines.join('\n')).toContain(RTK_UNINSTALL);
  });

  test('fresh machine: install, verify, init, re-check', async () => {
    const { deps, commands } = fake({ binaries: new Set(['claude', 'brew']) });
    expect(await offerRtk(deps)).toBe('installed');
    expect(commands).toEqual(['brew install rtk', 'rtk gain', 'rtk init --global --auto-patch', 'rtk gain']);
  });

  test('installed without the hook: skips the install, only runs init', async () => {
    const { deps, commands } = fake({ settings: null });
    expect(await offerRtk(deps)).toBe('installed');
    expect(commands).toEqual(['rtk gain', 'rtk init --global --auto-patch', 'rtk gain']);
  });

  test('wrong binary: fails without touching anything', async () => {
    const { deps, commands } = fake({ gainOk: false });
    expect(await offerRtk(deps)).toBe('failed');
    expect(commands).toEqual(['rtk gain']);
  });

  test('install failure is non-fatal and prints the manual prompt', async () => {
    const { deps, lines } = fake({ binaries: new Set(['claude', 'brew']), installOk: false });
    expect(await offerRtk(deps)).toBe('failed');
    expect(lines.join('\n')).toContain('boom');
    expect(lines.join('\n')).toContain('rtk init --global --auto-patch');
  });

  test('a throwing dependency is non-fatal', async () => {
    const { deps } = fake({ binaries: new Set(['claude', 'brew']) }, { run: () => { throw new Error('spawn exploded'); } });
    expect(await offerRtk(deps)).toBe('failed');
  });

  test('init that leaves no hook is a failure', async () => {
    const { deps } = fake({ initWritesHook: false });
    expect(await offerRtk(deps)).toBe('failed');
  });

  test('never uses rtk-proxy or pipelines', async () => {
    const { deps, commands } = fake({ binaries: new Set(['claude', 'brew']) });
    await offerRtk(deps);
    expect(commands.join(' ')).not.toContain('proxy');
    expect(RTK_MANUAL_PROMPT).toContain('Do not use rtk-proxy');
  });
});
