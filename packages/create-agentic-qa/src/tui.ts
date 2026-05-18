import boxen from 'boxen';
import Table from 'cli-table3';
import figuresModule from 'figures';
import pc from 'picocolors';

// figures v6 ships as default export
const figures = figuresModule as unknown as Record<string, string>;

// ---------------------------------------------------------------------------
// ASCII logo
// ---------------------------------------------------------------------------
// Stored as String.raw template to be 100% safe with special chars.
const LOGO_RAW = String.raw`                  ░█████  ░██████ ░███████░███   ░██░████████░██ ░██████
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
    case 'ok': return pc.green(figures.tick ?? '✔');
    case 'warn': return pc.yellow(figures.warning ?? '⚠');
    case 'fail': return pc.red(figures.cross ?? '✘');
    case 'info': return pc.cyan(figures.info ?? 'ℹ');
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
  note,
  outro,
  select,
  spinner,
  text,
} from '@clack/prompts';
