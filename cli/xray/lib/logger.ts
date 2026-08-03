/**
 * Xray CLI - Logger Module
 *
 * Console formatting utilities with colors and icons.
 */

// ============================================================================
// ANSI COLORS
// ============================================================================

export const colors = {
  reset: '\x1B[0m',
  bold: '\x1B[1m',
  dim: '\x1B[2m',
  red: '\x1B[31m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  blue: '\x1B[34m',
  magenta: '\x1B[35m',
  cyan: '\x1B[36m',
  white: '\x1B[37m',
} as const;

// ============================================================================
// LOGGER
// ============================================================================

export const log = {
  info: (msg: string): void => {
    console.log(`${colors.blue}ℹ${colors.reset} ${msg}`);
  },

  success: (msg: string): void => {
    console.log(`${colors.green}✔${colors.reset} ${msg}`);
  },

  warn: (msg: string): void => {
    console.log(`${colors.yellow}⚠${colors.reset} ${msg}`);
  },

  error: (msg: string): void => {
    console.error(`${colors.red}✖${colors.reset} ${msg}`);
  },

  title: (msg: string): void => {
    console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}\n`);
  },

  dim: (msg: string): void => {
    console.log(`${colors.dim}${msg}${colors.reset}`);
  },

  json: (obj: unknown): void => {
    console.log(JSON.stringify(obj, null, 2));
  },
} as const;

/**
 * Warn when a list command returned fewer rows than the server's total.
 *
 * Every `list` defaults to `--limit 20`, and a silently truncated read is
 * indistinguishable from missing data — during a post-migration verification it
 * reads as data loss. Callers print this right after the header so the operator
 * sees the cap at the moment they would otherwise start counting rows.
 */
export function warnIfTruncated(total: number, shown: number, limit: number): void {
  if (shown < total) {
    log.warn(
      `Showing ${shown} of ${total} — capped by --limit ${limit}. `
      + `Re-run with --limit ${total} for the full list.`,
    );
  }
}

/**
 * Explain a list that reports a nonzero total but resolves zero rows.
 *
 * Xray counts the issues without being able to return them as entities. Two
 * different causes share this exact signature and call for opposite actions, so
 * both are named rather than guessed. Either way it is a hard stop before a
 * `--sync` restore, which would fall back to CREATE and duplicate the project.
 */
export function warnCountedButUnresolved(label: string, total: number): void {
  log.warn(`${total} ${label} counted but none resolved. Two possible causes:`);
  log.warn('  1. Xray is installed but this project is not configured on this site — set up');
  log.warn('     Miscellaneous / Test Coverage / Defect Mapping / Test Environments, then re-index.');
  log.warn(`  2. The ${label} exist in Jira but were never registered with Xray. Compare the Jira`);
  log.warn('     issuetype count against this one to tell the two apart.');
  log.warn('Do NOT run a --sync restore until this command returns rows.');
}
