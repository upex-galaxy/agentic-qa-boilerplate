/**
 * Xray CLI - Parser Module
 *
 * Command line argument parsing utilities.
 */

import type { Flags, ParsedArgs } from '../types/index.js';

// ============================================================================
// ARGUMENT PARSER
// ============================================================================

function appendFlag(flags: Flags, key: string, value: string | true): void {
  const existing = flags[key];
  if (existing === undefined) {
    flags[key] = value;
    return;
  }
  // Repeating a boolean flag is a no-op. Repeating a value flag promotes
  // the previous value into an array so callers that opt-in via
  // getFlagArray() see every occurrence.
  if (value === true) {
    return;
  }
  if (Array.isArray(existing)) {
    existing.push(value);
    return;
  }
  if (typeof existing === 'string') {
    flags[key] = [existing, value];
    return;
  }
  // Previous occurrence was a boolean true; replace with the new value.
  flags[key] = value;
}

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
        appendFlag(result.flags, key, next);
        i += 2;
      }
      else {
        appendFlag(result.flags, key, true);
        i += 1;
      }
    }
    else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        appendFlag(result.flags, key, next);
        i += 2;
      }
      else {
        appendFlag(result.flags, key, true);
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
  if (Array.isArray(value)) {
    // Preserve legacy "last write wins" semantics for callers that expect a
    // single string. Callers that want every occurrence should use getFlagArray.
    const last = value[value.length - 1];
    if (typeof last === 'string') {
      return last;
    }
  }
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
  if (Array.isArray(value)) {
    const last = value[value.length - 1];
    return typeof last === 'string' ? last : defaultValue;
  }
  if (typeof value === 'string') {
    return value;
  }
  return defaultValue;
}

export function getBoolFlag(flags: Flags, name: string): boolean {
  return flags[name] === true || flags[name] === 'true';
}

/**
 * Collect every occurrence of a repeated flag.
 *
 * Returns `[]` when the flag is absent or set to a bare boolean. A flag passed
 * once returns a single-element array. Repeated occurrences are returned in
 * the order they appeared on the command line.
 *
 *     bun xray run evidence --id 123 --file a.png --file b.png
 *     // getFlagArray(flags, 'file') -> ['a.png', 'b.png']
 */
export function getFlagArray(flags: Flags, name: string): string[] {
  const value = flags[name];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  if (typeof value === 'string') {
    return [value];
  }
  return [];
}
