#!/usr/bin/env bun
/**
 * onboarding.ts — `bun run onboarding`: the docs site opened on "Empezar aquí".
 *
 * Same server as `bun run docs` (scripts/docs-serve.ts), started with
 * `--page core/empezar-aqui.html`. Every docs flag passes through:
 *
 *   bun run onboarding                   # port 4173 (next free when busy), auto-open
 *   bun run onboarding -- --port 4000    # custom port
 *   bun run onboarding -- --no-open      # skip the browser
 *
 * A `--page` given on the command line wins over the default.
 */

import { serveDocs } from './docs-serve.ts';

const START_PAGE = 'core/empezar-aqui.html';

const argv = process.argv.slice(2);
const hasPage = argv.some(arg => arg === '--page' || arg.startsWith('--page='));
serveDocs(hasPage ? argv : ['--page', START_PAGE, ...argv], 'onboarding');
