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
