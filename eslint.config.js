/**
 * @fileoverview PROJECT-OWNED — `bun run up` never overwrites this file.
 *
 * `eslint.config.base.js` is the synced half: the shared options and the
 * `cli/` import-closure block that guards the updater's self-update. Override
 * anything here.
 *
 * `ignores` and `rules` are arrays/objects, so an override REPLACES rather than
 * merges: spread the base value first or you silently drop what upstream added.
 *
 *   ignores: [...BASE_ESLINT_OPTIONS.ignores, 'my-generated-dir/**'],
 *   rules: { ...BASE_ESLINT_OPTIONS.rules, 'no-console': 'error' },
 *
 * Extra project-only config blocks go after `CLI_IMPORT_CLOSURE` in the
 * `antfu()` call — later blocks win.
 */
import antfu from '@antfu/eslint-config';

import { BASE_ESLINT_OPTIONS, CLI_IMPORT_CLOSURE } from './eslint.config.base.js';

export default antfu({ ...BASE_ESLINT_OPTIONS }, CLI_IMPORT_CLOSURE);
