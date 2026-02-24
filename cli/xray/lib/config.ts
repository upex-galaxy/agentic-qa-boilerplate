/**
 * Xray CLI - Configuration Module
 *
 * Manages CLI configuration stored in ~/.xray-cli/
 */

import type { Config, TokenData } from '../types/index.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// ============================================================================
// PATHS
// ============================================================================

export const CONFIG_DIR = join(homedir(), '.xray-cli');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
export const TOKEN_FILE = join(CONFIG_DIR, 'token.json');

// ============================================================================
// CONFIG FUNCTIONS
// ============================================================================

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): Config | null {
  if (!existsSync(CONFIG_FILE)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  }
  catch {
    return null;
  }
}

export function saveConfig(config: Config): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function clearConfig(): void {
  if (existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, '');
  }
}

// ============================================================================
// TOKEN FUNCTIONS
// ============================================================================

export function loadToken(): TokenData | null {
  if (!existsSync(TOKEN_FILE)) {
    return null;
  }
  try {
    const data = JSON.parse(readFileSync(TOKEN_FILE, 'utf-8')) as TokenData;
    // Check if token is still valid (with 5 min buffer)
    if (data.expires_at > Date.now() + 5 * 60 * 1000) {
      return data;
    }
    return null;
  }
  catch {
    return null;
  }
}

export function saveToken(token: string): void {
  ensureConfigDir();
  const data: TokenData = {
    token,
    // Xray tokens last 24 hours, we'll set expiry to 23 hours to be safe
    expires_at: Date.now() + 23 * 60 * 60 * 1000,
  };
  writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
}

export function clearToken(): void {
  if (existsSync(TOKEN_FILE)) {
    writeFileSync(TOKEN_FILE, '');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const configPaths = {
  dir: CONFIG_DIR,
  file: CONFIG_FILE,
  token: TOKEN_FILE,
} as const;
