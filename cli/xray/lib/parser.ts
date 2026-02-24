/**
 * Xray CLI - Parser Module
 *
 * Command line argument parsing utilities.
 */

import type { Flags, ParsedArgs } from '../types/index.js';

// ============================================================================
// ARGUMENT PARSER
// ============================================================================

export function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: args[0] || 'help',
    subcommand: args[1] || '',
    flags: {},
    positional: [],
  };

  let i = 2;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        result.flags[key] = next;
        i += 2;
      }
      else {
        result.flags[key] = true;
        i += 1;
      }
    }
    else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        result.flags[key] = next;
        i += 2;
      }
      else {
        result.flags[key] = true;
        i += 1;
      }
    }
    else {
      result.positional.push(arg);
      i += 1;
    }
  }

  return result;
}

// ============================================================================
// FLAG HELPERS
// ============================================================================

export function requireFlag(flags: Flags, name: string): string {
  const value = flags[name];
  if (!value || typeof value !== 'string') {
    throw new Error(`Missing required flag: --${name}`);
  }
  return value;
}

export function getFlag(
  flags: Flags,
  name: string,
  defaultValue?: string,
): string | undefined {
  const value = flags[name];
  if (typeof value === 'string') {
    return value;
  }
  return defaultValue;
}

export function getBoolFlag(flags: Flags, name: string): boolean {
  return flags[name] === true || flags[name] === 'true';
}
