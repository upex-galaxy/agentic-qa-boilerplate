import antfu from '@antfu/eslint-config';

export default antfu({
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
}, {
  // --- cli/ IMPORT CLOSURE (updater self-update invariant) ---
  //
  // `cli/` is the updater's self-update component: `runUpdate` refreshes those
  // files in place and re-execs the process BEFORE any other component is
  // synced (cli/lib/updater-core.ts, "SELF-UPDATE (before Phase 2)"). A repo
  // several releases behind therefore runs the NEW `cli/` against its OWN, old
  // copy of every sibling directory.
  //
  // So an import that escapes `cli/` is not a style question: it bricks the
  // update path for anyone jumping more than one release. It happened — `cli/`
  // imported `../scripts/agent-compatibility.ts`, the re-exec died on
  // `Cannot find module`, and `bun run up`, `up --rollback`, `setup` and
  // `setup:doctor` all went down together, since the failure is at module load
  // and the rollback path shares the same entrypoint.
  //
  // Shared code goes in `cli/lib/`. A `scripts/` file that needs it imports
  // FROM `cli/` (that direction is safe — `scripts/` is synced later, never
  // re-exec'd mid-run). Path aliases are listed too: they resolve into
  // `tests/`, `config/` and `api/`, which are equally absent at re-exec time.
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
});
