export interface RtkOut {
  info: (msg: string) => void
  success: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string) => void
  dim: (msg: string) => void
}

export interface RtkRunResult { ok: boolean, stdout: string, stderr: string }

export interface RtkDeps {
  platform: NodeJS.Platform
  nonInteractive: boolean
  has: (binary: string) => boolean
  run: (cmd: string, args: string[]) => RtkRunResult
  readClaudeSettings: () => string | null
  confirm: (message: string) => Promise<boolean>
  out?: RtkOut
}

export type RtkState = 'not-installed' | 'wrong-binary' | 'installed-no-hook' | 'ready';

export type RtkOutcome = 'already-installed' | 'installed' | 'declined' | 'skipped-non-interactive' | 'no-claude' | 'failed';

export const RTK_UNINSTALL = 'rtk init --global --uninstall';

const RTK_CURL_INSTALL = 'curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh';

export const RTK_MANUAL_PROMPT = `Install RTK (rtk-ai/rtk), the token-saving output compressor, for Claude Code on this machine.

First, check the machine state. If \`rtk\` is already installed (\`rtk gain\` exits 0) and its Claude Code hook is already in ~/.claude/settings.json (a PreToolUse command containing "rtk hook claude"), report that and change nothing.

Otherwise:
1. Detect the OS and the package manager, then install with the matching command:
   - macOS or Linux with Homebrew: brew install rtk
   - Windows: winget install rtk-ai.rtk
   - Anything else: ${RTK_CURL_INSTALL}
2. Verify with \`rtk --version\` and \`rtk gain\`. A different crate also named "rtk" exists: if \`rtk gain\` fails, it is the wrong binary, so stop and explain.
3. Run \`rtk -v init --global --dry-run\`, show me the full output and wait for my confirmation.
4. After I confirm, run \`rtk init --global --auto-patch\`.
5. Tell me to restart Claude Code so the hook loads.
6. Validate: \`rtk rewrite "git status"\` must print a rewritten command, and \`rtk rewrite "supabase db diff"\` must exit 1 (not rewritten, by design).

Do not use rtk-proxy or any pipeline feature. If any step fails, stop and explain what happened instead of working around it.
To uninstall later: ${RTK_UNINSTALL}`;

export function hasRtkHook(settingsText: string | null): boolean {
  if (!settingsText) { return false; }
  let parsed: unknown;
  try { parsed = JSON.parse(settingsText); }
  catch { return false; }
  const pre = (parsed as { hooks?: { PreToolUse?: unknown } } | null)?.hooks?.PreToolUse;
  if (!Array.isArray(pre)) { return false; }
  const commandOf = (item: unknown): string => {
    const command = (item as { command?: unknown } | null)?.command;
    return typeof command === 'string' ? command : '';
  };
  return pre.some((entry) => {
    const nested = (entry as { hooks?: unknown } | null)?.hooks;
    const commands = Array.isArray(nested) ? nested.map(commandOf) : [];
    return [commandOf(entry), ...commands].some(c => c.includes('rtk hook claude'));
  });
}

export function rtkState(deps: Pick<RtkDeps, 'has' | 'run' | 'readClaudeSettings'>): RtkState {
  if (!deps.has('rtk')) { return 'not-installed'; }
  if (!deps.run('rtk', ['gain']).ok) { return 'wrong-binary'; }
  return hasRtkHook(deps.readClaudeSettings()) ? 'ready' : 'installed-no-hook';
}

export type RtkInstallCommand = { argv: string[] } | { manual: string };

export function rtkInstallCommand(o: { platform: NodeJS.Platform, hasBrew: boolean, hasWinget: boolean }): RtkInstallCommand {
  if (o.platform === 'win32') {
    return o.hasWinget
      ? { argv: ['winget', 'install', 'rtk-ai.rtk'] }
      : { manual: 'winget install rtk-ai.rtk' };
  }
  if (o.hasBrew) { return { argv: ['brew', 'install', 'rtk'] }; }
  return { argv: ['sh', '-c', RTK_CURL_INSTALL] };
}

export async function offerRtk(deps: RtkDeps): Promise<RtkOutcome> {
  const out = deps.out ?? { info: console.log, success: console.log, warn: console.warn, error: console.error, dim: console.log };
  const printManual = (): void => {
    out.dim('  RTK compresses command output for Claude Code. To install it by hand, paste this into an AI session:');
    for (const line of RTK_MANUAL_PROMPT.split('\n')) { out.dim(`    ${line}`); }
  };
  const fail = (why: string): RtkOutcome => {
    out.warn(`  RTK setup failed: ${why}`);
    printManual();
    return 'failed';
  };

  const before = rtkState(deps);
  if (before === 'ready') { return 'already-installed'; }
  if (deps.nonInteractive) { printManual(); return 'skipped-non-interactive'; }
  if (!deps.has('claude')) { printManual(); return 'no-claude'; }
  if (before === 'wrong-binary') {
    return fail('an `rtk` binary is on PATH but `rtk gain` fails, so it is probably a different tool; nothing was changed');
  }
  if (!(await deps.confirm('Install RTK (token-saving hook for Claude Code) now?'))) {
    printManual();
    return 'declined';
  }

  try {
    if (before === 'not-installed') {
      const cmd = rtkInstallCommand({ platform: deps.platform, hasBrew: deps.has('brew'), hasWinget: deps.has('winget') });
      if ('manual' in cmd) { return fail(`no automatic install on this machine, run: ${cmd.manual}`); }
      const [bin, ...args] = cmd.argv;
      const installed = deps.run(bin, args);
      if (!installed.ok) { return fail(installed.stderr.trim() || 'the install command failed'); }
      if (!deps.run('rtk', ['gain']).ok) { return fail('`rtk gain` still fails after the install'); }
    }
    const init = deps.run('rtk', ['init', '--global', '--auto-patch']);
    if (!init.ok) { return fail(init.stderr.trim() || '`rtk init --global --auto-patch` failed'); }
    if (rtkState(deps) !== 'ready') { return fail('the Claude Code hook is not in ~/.claude/settings.json after init'); }
  }
  catch (err) {
    return fail((err as Error).message);
  }
  out.success('  RTK installed. Restart Claude Code so the hook loads.');
  return 'installed';
}
