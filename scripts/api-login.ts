#!/usr/bin/env bun
/**
 * API Login CLI - entry point for `bun run api:login`.
 *
 * This file is deliberately 10 lines: it only wires the two halves together.
 *   - scripts/lib/api-login-core.ts   SYNCED   generic CLI (args, --role,
 *                                              --profile, storage, --help).
 *                                              Upstream improvements arrive
 *                                              through `bun run up`.
 *   - scripts/api-login.project.ts    PROJECT  the auth adapter. Shipped once,
 *                                              never overwritten by the sync.
 *                                              THIS is the file to adapt.
 *
 * Add no logic here: behaviour belongs in the core, adaptation in the adapter.
 * Usage and token-storage details: `bun run api:login --help`.
 */

import * as adapter from './api-login.project';
import { runApiLogin } from './lib/api-login-core';

const exitCode = await runApiLogin(adapter);
if (exitCode !== 0) {
  process.exit(exitCode);
}
