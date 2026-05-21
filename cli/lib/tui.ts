import boxen from 'boxen';
import Table from 'cli-table3';
import figuresModule from 'figures';
import pc from 'picocolors';

// figures v6 ships as default export
const figures = figuresModule as unknown as Record<string, string>;

// ---------------------------------------------------------------------------
// ASCII logo
// ---------------------------------------------------------------------------
// Plain template literal — Bun (as of 1.3.x) has a quirk where String.raw
// converts inline UTF-8 block characters into their literal `\uXXXX` escape
// text at module load time. The banner has no backslash sequences that need
// escape-preserving, so a regular template literal renders correctly under
// both bun runtime and pre-compiled JS distribution.
const LOGO_RAW = `                  ░█████  ░██████ ░███████░███   ░██░████████░██ ░██████
                 ░██  ░██░██      ░██     ░████  ░██   ░██   ░██░██
                 ░███████░██  ░███░█████  ░██░██ ░██   ░██   ░██░██
  ██████████     ░██  ░██░██   ░██░██     ░██ ░██░██   ░██   ░██░██
  ██▀▀▀▀▀▀██     ░██  ░██ ░██████ ░███████░██  ░████   ░██   ░██ ░██████
  ██ ◉  ◉ ██     ░░   ░░  ░░░░░░  ░░░░░░░ ░░   ░░░░    ░░    ░░  ░░░░░░
  ██   3  ██
  ██████████     ░███████░███   ░██ ░██████ ░██░███   ░██░███████░███████░██████
   ██    ██      ░██     ░████  ░██░██      ░██░████  ░██░██     ░██     ░██  ░██
                 ░█████  ░██░██ ░██░██  ░███░██░██░██ ░██░█████  ░█████  ░██████
                 ░██     ░██ ░██░██░██   ░██░██░██ ░██░██░██     ░██     ░██  ░██
                 ░███████░██  ░████ ░██████ ░██░██  ░████░███████░███████░██  ░██
                 ░░░░░░░ ░░   ░░░░  ░░░░░░  ░░ ░░   ░░░░ ░░░░░░░ ░░░░░░░ ░░   ░░
                                 Agentic Quality Engineer                                        `;

/**
 * Returns the ASCII logo as a string, tinted with picocolors.
 * Entire block is tinted cyan for simplicity (column-split would be fragile
 * with proportional-width terminal fonts).
 */
export function logo(): string {
  return pc.cyan(LOGO_RAW);
}

// ---------------------------------------------------------------------------
// Headline box
// ---------------------------------------------------------------------------

export function headline(title: string): string {
  return boxen(title, {
    borderColor: 'cyan',
    borderStyle: 'round',
    padding: { top: 0, bottom: 0, left: 2, right: 2 },
  });
}

// ---------------------------------------------------------------------------
// Section label
// ---------------------------------------------------------------------------

export function section(label: string): void {
  process.stdout.write(`\n${pc.bold(pc.cyan(label))}\n`);
}

// ---------------------------------------------------------------------------
// Phase header — bold cyan banner padded to ~78 cols
// ---------------------------------------------------------------------------

export function phaseHeader(num: 1 | 2 | 3 | 4 | 5, label: string): void {
  const prefix = `── PHASE ${num} — ${label} `;
  const totalWidth = 78;
  const dashes = '─'.repeat(Math.max(0, totalWidth - prefix.length));
  process.stdout.write(`\n${pc.bold(pc.cyan(prefix + dashes))}\n\n`);
}

// ---------------------------------------------------------------------------
// Key-value aligned block
// ---------------------------------------------------------------------------

export function kv(rows: { k: string, v: string }[]): void {
  const maxLen = rows.reduce((m, r) => Math.max(m, r.k.length), 0);
  for (const { k, v } of rows) {
    process.stdout.write(`${pc.bold(k.padEnd(maxLen))} : ${v}\n`);
  }
}

// ---------------------------------------------------------------------------
// Status icon with NO_COLOR / non-TTY fallbacks
// ---------------------------------------------------------------------------

const noColor = !process.stdout.isTTY || Boolean(process.env.NO_COLOR);

export function statusIcon(status: 'ok' | 'warn' | 'fail' | 'info'): string {
  if (noColor) {
    return status === 'ok' ? '[ok]' : status === 'warn' ? '[!]' : status === 'fail' ? '[x]' : '[i]';
  }
  switch (status) {
    case 'ok':
      return pc.green(figures.tick ?? '✔');
    case 'warn':
      return pc.yellow(figures.warning ?? '⚠');
    case 'fail':
      return pc.red(figures.cross ?? '✘');
    case 'info':
      return pc.cyan(figures.info ?? 'ℹ');
  }
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export function table(headers: string[], rows: string[][]): string {
  const t = new Table({
    head: headers,
    style: { head: ['cyan'], border: ['gray'] },
    chars: {
      'mid': '',
      'left-mid': '',
      'mid-mid': '',
      'right-mid': '',
    },
  });
  for (const row of rows) {
    t.push(row);
  }
  return t.toString();
}

// ---------------------------------------------------------------------------
// Breathe
// ---------------------------------------------------------------------------

export function breathe(): void {
  process.stdout.write('\n');
}

// ---------------------------------------------------------------------------
// Success box
// ---------------------------------------------------------------------------

export function successBox(lines: string[]): string {
  return boxen(lines.join('\n'), {
    borderColor: 'green',
    borderStyle: 'round',
    padding: { top: 0, bottom: 0, left: 2, right: 2 },
  });
}

// ---------------------------------------------------------------------------
// Re-exports from @clack/prompts
// ---------------------------------------------------------------------------

export {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  multiselect,
  note,
  outro,
  select,
  spinner,
  text,
} from '@clack/prompts';
