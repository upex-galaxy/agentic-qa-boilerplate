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
    '*.min.js',
    // Documentation files (contain code examples that shouldn't be linted)
    '**/*.md',
    // GitHub workflows (YAML files)
    '.github/**',
    // Generated files (auto-generated, not manually edited)
    'api/openapi-types.ts',
    // Skill templates — copied to target repos at install time, not linted here
    '.claude/skills/*/templates/**',
    // Skills (committed QA-specific + community installed via `bunx skills add`
    // + gentle-ai loader output) are out of scope for repo-level lint rules.
    // Mixing upstream skill code with our ESLint config causes false positives;
    // QA-specific skills under .claude/skills/ are markdown + JSON only, no
    // TypeScript that needs linting.
    '.claude/skills/**',
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
});
