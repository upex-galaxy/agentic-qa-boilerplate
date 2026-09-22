/**
 * @fileoverview SYNCED BASE — `bun run up` overwrites this file. Do not edit it
 * here; the project's own `eslint.config.js` spreads these exports and
 * overrides whatever it needs.
 *
 * A flat ESLint config is an executable module, so it has no merge-able shape:
 * upstream cannot deliver "the new rule" into a project-owned file the way a
 * structured format would allow. Splitting the values out and letting the
 * project spread them is the idiom that makes a rule reach a downstream repo at
 * all, and it is the same shape as the `tsconfig.base.json` split next to it.
 *
 * `CLI_IMPORT_CLOSURE` is the reason this file is not optional: it enforces an
 * invariant of the UPDATER, not a project style preference, and until now it
 * existed only upstream — a downstream project ran the updater with no rule
 * guarding the import closure its self-update depends on.
 */

/**
 * Options handed to `antfu()`. Spread it, then override: the project's config
 * owns the final shape, and `ignores` / `rules` are the two a project realistically
 * extends (spread the base array/object first, or you drop what upstream added).
 */
export const BASE_ESLINT_OPTIONS = {
  // TypeScript configuration
  typescript: {
    tsconfigPath: 'tsconfig.json',
  },

  // Less opinionated mode for easier adoption
  lessOpinionated: true,

  // Ignore patterns
  ignores: [
    'node_modules',
    'dist',
    'test-results',
    'playwright-report',
    'allure-results',
    'allure-report',
    'reports',
    'cli/legacy/**',
    // JXA (JavaScript for Automation) dialect — runs under macOS osascript,
    // not bun/node; JXA globals (ObjC, $) and osascript's run(argv) entry
    // point false-positive against every Node-oriented rule set.
    'cli/slack-clip.js',
    '*.min.js',
    // Documentation files (contain code examples that shouldn't be linted)
    '**/*.md',
    // GitHub workflows (YAML files)
    '.github/**',
    // Generated files (auto-generated, not manually edited)
    'api/openapi-types.ts',
    // Git worktrees placed under .claude/worktrees/ are another branch's full
    // checkout — never lint another tree from this one.
    '.claude/worktrees/**',
    // Skill templates — copied to target repos at install time, not linted here
    '.agents/skills/*/templates/**',
    // Skills (committed QA-specific + community installed via `bunx skills add`
    // + gentle-ai loader output) are out of scope for repo-level lint rules.
    // Mixing upstream skill code with our ESLint config causes false positives;
    // QA-specific skills under .agents/skills/ are markdown + JSON only, no
    // TypeScript that needs linting.
    '.agents/skills/**',
    // MCP reference templates — syntax-sensitive opt-in configs. Linting them
    // (e.g. toml/array-bracket-newline) corrupts the layout users copy from.
    'docs/mcp/**',
  ],

  // Custom rules
  rules: {
    // Allow console for test logging
    'no-console': 'off',

    // TypeScript specific - strict but practical
    'ts/explicit-function-return-type': 'off',
    'ts/explicit-module-boundary-types': 'off',
    'ts/no-explicit-any': 'warn',
    // Required for @atc decorator flexibility
    'ts/no-unsafe-assignment': 'off',
    'ts/no-unsafe-return': 'off',
    'ts/no-unsafe-member-access': 'off',
    'ts/no-unsafe-argument': 'off',
    'ts/no-unsafe-call': 'off',
    // Disabled: requires type info for all files including JSON
    'ts/switch-exhaustiveness-check': 'off',
    // Disabled: too strict for config files, requires explicit boolean checks
    'ts/strict-boolean-expressions': 'off',

    // Node.js globals - standard in Bun/Node environment
    'node/prefer-global/buffer': 'off',
    'node/prefer-global/process': 'off',

    // Style preferences
    'style/semi': ['error', 'always'],
    'style/quotes': ['error', 'single'],
    'style/comma-dangle': ['error', 'always-multiline'],
    'style/max-statements-per-line': 'off',

    // Allow unused vars with underscore prefix
    'unused-imports/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],

    // YAML: defer to Prettier for flow-mapping brace spacing
    // (ESLint plugin wants {x}, Prettier wants { x }; Prettier wins via pre-commit)
    'yaml/flow-mapping-curly-spacing': 'off',
  },
};

/**
 * KATA test code imports through path aliases, never through `./` or `../`.
 *
 * `typescript-patterns.md` §8 asserts "Lint rejects relative imports" and
 * `/test-automation` anti-pattern T5 repeats it. Until this block existed the
 * claim was false: `eslint-plugin-import` is not a dependency and the only
 * import restriction in the repo was `CLI_IMPORT_CLOSURE`, scoped to `cli/**`.
 * `lint:check` was green with four relative imports in the test tree, so the
 * rule every reviewer had been told to trust was enforcing nothing.
 *
 * Aliases (`tsconfig.base.json`): `@ui/` `@api/` `@steps/` `@utils/` `@data/`
 * `@schemas/` `@variables` `@TestContext` `@TestFixture` `@ApiFixture`
 * `@UiFixture` `@DataFactory` `@openapi`.
 *
 * `playwright.config.ts` is in scope: it is part of the test framework and
 * `@variables` resolves there too. Nothing outside the test tree is touched,
 * so `scripts/`, `cli/` and `packages/` keep their own conventions.
 */
export const KATA_IMPORT_ALIASES = {
  files: ['tests/**/*.ts', 'playwright.config.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['./*', '../*'],
        message: 'KATA test code imports through path aliases (@ui/ @api/ @steps/ @utils/ @data/ @schemas/ @variables @TestContext @TestFixture), never relative paths. See typescript-patterns.md §8.',
      }],
    }],
  },
};

/**
 * --- cli/ IMPORT CLOSURE (updater self-update invariant) ---
 *
 * `cli/` is the updater's self-update component: `runUpdate` refreshes those
 * files in place and re-execs the process BEFORE any other component is
 * synced (cli/lib/updater-core.ts, "SELF-UPDATE (before Phase 2)"). A repo
 * several releases behind therefore runs the NEW `cli/` against its OWN, old
 * copy of every sibling directory.
 *
 * So an import that escapes `cli/` is not a style question: it bricks the
 * update path for anyone jumping more than one release. It happened — `cli/`
 * imported `../scripts/agent-compatibility.ts`, the re-exec died on
 * `Cannot find module`, and `bun run up`, `up --rollback`, `setup` and
 * `setup:doctor` all went down together, since the failure is at module load
 * and the rollback path shares the same entrypoint.
 *
 * Shared code goes in `cli/lib/`. A `scripts/` file that needs it imports
 * FROM `cli/` (that direction is safe — `scripts/` is synced later, never
 * re-exec'd mid-run). Path aliases are listed too: they resolve into
 * `tests/`, `config/` and `api/`, which are equally absent at re-exec time.
 *
 * This block travels with the base config on purpose: it guards the updater,
 * so a project that never received it runs `bun run up` unprotected.
 */
export const CLI_IMPORT_CLOSURE = {
  files: ['cli/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: [
          '../scripts/**',
          '../../scripts/**',
          '../../../scripts/**',
          '../../../../scripts/**',
          '../config/**',
          '../../config/**',
          '../../../config/**',
          '../../../../config/**',
          '../tests/**',
          '../../tests/**',
          '../../../tests/**',
          '../../../../tests/**',
          '../api/**',
          '../../api/**',
          '../../../api/**',
          '../../../../api/**',
          '../packages/**',
          '../../packages/**',
          '../../../packages/**',
          '../../../../packages/**',
          '@/*',
          '@ui/*',
          '@api/*',
          '@steps/*',
          '@utils/*',
          '@data/*',
          '@schemas/*',
          '@variables',
          '@openapi',
          '@schemas',
          '@TestContext',
          '@UiFixture',
          '@ApiFixture',
          '@TestFixture',
          '@DataFactory',
        ],
        message: 'cli/ must be import-closed: the updater re-execs the new cli/ before other components are synced, so an import that escapes cli/ breaks `bun run up` for repos more than one release behind. Move the shared module into cli/lib/ instead.',
      }],
    }],
  },
};
