/**
 * @fileoverview Decides ONCE, at start, whether a run opens the page
 * (plan §5, owner decisions D2 and Q7).
 *
 * Pure function over the flags, the environment, the TTY state and the platform,
 * so the whole decision table is unit-tested as a matrix. First matching row wins:
 *
 *   --headless                                   -> terminal (today's full flow)
 *   --ui                                         -> page, even where the rows below say no
 *   CI / GITHUB_ACTIONS / BUILD_ID               -> terminal
 *   stdin or stdout not a TTY                    -> terminal
 *   an agent harness is the caller               -> terminal
 *   SSH without DISPLAY / WAYLAND_DISPLAY        -> terminal, with a tunnel hint
 *   Linux without DISPLAY / WAYLAND_DISPLAY      -> terminal (WSL without WSLg too)
 *   otherwise                                    -> page
 *
 * A page run with an EXPLICIT `--auto` is read-only: the page shows the run and
 * asks nothing. An implied `--auto` (no TTY) never reaches the page rows at all.
 *
 * Shared file: byte-identical in agentic-qa-boilerplate and agentic-dev-boilerplate.
 */

export interface UiFlags {
  headless?: boolean
  ui?: boolean
  /** true ONLY when the person typed `--auto`; an auto mode implied by "no TTY" is not explicit. */
  explicitAuto?: boolean
}

export interface UiEnvironment {
  env: Record<string, string | undefined>
  stdinTTY: boolean
  stdoutTTY: boolean
  platform: NodeJS.Platform | string
}

export type UiReason
  = | 'headless-flag'
    | 'ui-flag'
    | 'ci'
    | 'no-tty'
    | 'agent'
    | 'ssh-no-display'
    | 'no-display'
    | 'default';

export interface UiDecision {
  surface: 'page' | 'terminal'
  /** Only meaningful for `surface: 'page'`: read-only when the run was an explicit `--auto`. */
  readonly: boolean
  reason: UiReason
  /** One line for the terminal when the reason deserves an explanation (SSH). */
  hint?: string
}

/** Env vars an agent harness sets in the shells it drives. */
export const AGENT_MARKERS = ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CODEX_SANDBOX', 'CODEX_SANDBOX_NETWORK_DISABLED', 'OPENCODE', 'PI_CODING_AGENT'] as const;

const CI_MARKERS = ['CI', 'GITHUB_ACTIONS', 'BUILD_ID'] as const;

/** Set to anything except empty, `0` or `false` (`CI=1`, `CI=yes`, `CI=true` all count). */
export function truthy(value: string | undefined): boolean {
  if (value == null) { return false; }
  const v = value.trim().toLowerCase();
  return v !== '' && v !== '0' && v !== 'false';
}

function hasDisplay(env: Record<string, string | undefined>): boolean {
  return Boolean(env.DISPLAY?.trim() || env.WAYLAND_DISPLAY?.trim());
}

export function decideUi(flags: UiFlags, e: UiEnvironment): UiDecision {
  const readonly = flags.explicitAuto === true;
  if (flags.headless) { return { surface: 'terminal', readonly: false, reason: 'headless-flag' }; }
  if (flags.ui) { return { surface: 'page', readonly, reason: 'ui-flag' }; }

  const { env } = e;
  if (CI_MARKERS.some(k => truthy(env[k]))) { return { surface: 'terminal', readonly: false, reason: 'ci' }; }
  if (!e.stdinTTY || !e.stdoutTTY) { return { surface: 'terminal', readonly: false, reason: 'no-tty' }; }
  if (AGENT_MARKERS.some(k => truthy(env[k]))) { return { surface: 'terminal', readonly: false, reason: 'agent' }; }

  const ssh = Boolean(env.SSH_CONNECTION?.trim() || env.SSH_TTY?.trim());
  if (ssh && !hasDisplay(env)) {
    return {
      surface: 'terminal',
      readonly: false,
      reason: 'ssh-no-display',
      hint: 'Remote session: the page stays closed. Run with --ui and open the printed URL through a tunnel to use it.',
    };
  }
  if (e.platform === 'linux' && !hasDisplay(env)) { return { surface: 'terminal', readonly: false, reason: 'no-display' }; }

  return { surface: 'page', readonly, reason: 'default' };
}

/** Reads `--headless`, `--ui` and an explicit `--auto` out of an argv slice. */
export function parseUiFlags(argv: readonly string[]): UiFlags {
  return {
    headless: argv.includes('--headless'),
    ui: argv.includes('--ui'),
    explicitAuto: argv.includes('--auto'),
  };
}

/** The live process as a `UiEnvironment`. */
export function currentUiEnvironment(): UiEnvironment {
  return {
    env: process.env,
    stdinTTY: Boolean(process.stdin.isTTY),
    stdoutTTY: Boolean(process.stdout.isTTY),
    platform: process.platform,
  };
}
