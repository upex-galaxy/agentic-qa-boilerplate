/**
 * @fileoverview SYNCED BASE — `bun sync` overwrites this file. Do not edit it
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

import { relative } from 'node:path';
import playwright from 'eslint-plugin-playwright';

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
 * `Cannot find module`, and `bun sync`, `bun sync --rollback`, `setup` and
 * `setup:doctor` all went down together, since the failure is at module load
 * and the rollback path shares the same entrypoint.
 *
 * Shared code goes in `cli/lib/`. A `scripts/` file that needs it imports
 * FROM `cli/` (that direction is safe — `scripts/` is synced later, never
 * re-exec'd mid-run). Path aliases are listed too: they resolve into
 * `tests/`, `config/` and `api/`, which are equally absent at re-exec time.
 *
 * This block travels with the base config on purpose: it guards the updater,
 * so a project that never received it runs `bun sync` unprotected.
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
        message: 'cli/ must be import-closed: the updater re-execs the new cli/ before other components are synced, so an import that escapes cli/ breaks `bun sync` for repos more than one release behind. Move the shared module into cli/lib/ instead.',
      }],
    }],
  },
};

/**
 * Severity of every KATA enforcement rule below. One line flips the whole set
 * from `warn` to `error`: this release reports, the next one blocks.
 */
export const KATA_ENFORCEMENT_LEVEL = 'warn';

/** Repo-relative POSIX path of the file ESLint is linting. */
function repoPath(context) {
  return relative(context.cwd ?? process.cwd(), context.filename).split('\\').join('/');
}

const isIn = (path, ...dirs) => dirs.some(dir => path.startsWith(dir));
const FIXTURE_FILES = ['tests/components/ApiFixture.ts', 'tests/components/UiFixture.ts', 'tests/components/TestFixture.ts'];

/** `import { test }` (value import, not a type import) from `@playwright/test`. */
function importsTestValue(node) {
  return node.importKind !== 'type'
    && node.specifiers.some(s => s.type === 'ImportSpecifier' && s.importKind !== 'type' && (s.imported.name ?? s.imported.value) === 'test');
}

/**
 * Inline ESLint plugin `kata`: the KATA invariants a machine can check, with
 * messages that name the doctrine section and the root-cause fix. Inline (not a
 * package) because four small rules do not justify a publish and a dependency,
 * and it ships to downstream projects through this synced file.
 */
export const kataPlugin = {
  meta: { name: 'kata' },
  rules: {
    'layer-imports': {
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          specTest: 'KATA specs (kata-invariants.md §2): import `test` from @TestFixture, never from @playwright/test. Replace the import; `expect` and types may still come from @playwright/test.',
          faker: 'KATA data (kata-invariants.md §5): @faker-js/faker is imported only by tests/data/DataFactory.ts. Add a DataFactory method and call it through the data layer.',
          openapi: 'KATA schemas (kata-invariants.md §5): @openapi is imported only under api/schemas/. Re-export the type from @schemas and import it from there.',
          component: 'KATA layers (kata-invariants.md §1): a domain component never imports another component. Move the shared step into a Steps module or the Base.',
          fixtureOrSteps: 'KATA layers (kata-invariants.md §1): Layers 1 to 3 never import Fixtures or Steps. Dependencies flow downward only; move the shared code into the Base or TestContext.',
          testContext: 'KATA layers (kata-invariants.md §1): TestContext imports no @api/*, @ui/* or @steps/* module. Keep it a leaf; pass the dependency in through the fixture.',
        },
      },
      create(context) {
        const path = repoPath(context);
        const check = (node) => {
          const source = node.source?.value;
          if (typeof source !== 'string') { return; }
          const report = messageId => context.report({ node, messageId });

          if (isIn(path, 'tests/e2e/', 'tests/integration/') && source === '@playwright/test' && node.type === 'ImportDeclaration' && importsTestValue(node)) {
            report('specTest');
          }
          if (isIn(path, 'tests/') && path !== 'tests/data/DataFactory.ts' && source === '@faker-js/faker') {
            report('faker');
          }
          if (!isIn(path, 'api/schemas/') && source === '@openapi') {
            report('openapi');
          }
          const domain = isIn(path, 'tests/components/api/', 'tests/components/ui/');
          const base = path === 'tests/components/api/ApiBase.ts' || path === 'tests/components/ui/UiBase.ts';
          const component = /^@(?:api|ui)\/(.+)$/.exec(source);
          if (domain && !base && component && component[1] !== 'ApiBase' && component[1] !== 'UiBase') {
            report('component');
          }
          const lowLayer = isIn(path, 'tests/components/') && !isIn(path, 'tests/components/steps/') && !FIXTURE_FILES.includes(path);
          if (lowLayer && (['@TestFixture', '@ApiFixture', '@UiFixture'].includes(source) || source.startsWith('@steps/'))) {
            report('fixtureOrSteps');
          }
          if (path === 'tests/components/TestContext.ts' && /^@(?:api|ui|steps)\//.test(source)) {
            report('testContext');
          }
        };
        return { ImportDeclaration: check, ExportNamedDeclaration: check, ExportAllDeclaration: check };
      },
    },

    'atc-no-atc-call': {
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          atcCallsAtc: 'KATA ATCs (kata-invariants.md §3): an @atc method never calls another @atc method (`this.{{name}}`). Extract the shared steps into a plain helper method or a Steps module and call that from both.',
        },
      },
      create(context) {
        const isAtc = member => member.type === 'MethodDefinition'
          && member.key.type === 'Identifier'
          && (member.decorators ?? []).some(d => d.expression.type === 'CallExpression' && d.expression.callee.type === 'Identifier' && d.expression.callee.name === 'atc');
        return {
          ClassBody(body) {
            const atcMethods = body.body.filter(isAtc);
            const names = new Set(atcMethods.map(m => m.key.name));
            for (const method of atcMethods) {
              const visit = (node) => {
                if (!node || typeof node.type !== 'string') { return; }
                if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.object.type === 'ThisExpression' && node.callee.property.type === 'Identifier' && names.has(node.callee.property.name)) {
                  context.report({ node, messageId: 'atcCallsAtc', data: { name: node.callee.property.name } });
                }
                for (const key of Object.keys(node)) {
                  if (key === 'parent' || key === 'decorators') { continue; }
                  const child = node[key];
                  if (Array.isArray(child)) { child.forEach(visit); }
                  else if (child && typeof child === 'object') { visit(child); }
                }
              };
              visit(method.value.body);
            }
          },
        };
      },
    },

    'no-decorator-in-base': {
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          decoratorInBase: 'KATA bases (kata-architecture.md §10): the Base classes and TestContext carry no decorators. Put @atc and @step on the domain component method that calls the Base helper.',
        },
      },
      create(context) {
        const path = repoPath(context);
        if (!['tests/components/api/ApiBase.ts', 'tests/components/ui/UiBase.ts', 'tests/components/TestContext.ts'].includes(path)) { return {}; }
        return { Decorator: node => context.report({ node, messageId: 'decoratorInBase' }) };
      },
    },

    'no-raw-page-in-spec': {
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          rawPage: 'KATA specs (kata-invariants.md §2): a spec never destructures `{{name}}` from the test callback. Use the `ui`, `api` or `test` fixture so the spec calls ATCs only; a precondition chain goes in a Steps class.',
        },
      },
      create(context) {
        const path = repoPath(context);
        if (!isIn(path, 'tests/e2e/', 'tests/integration/')) { return {}; }
        const isTestCallee = c => (c.type === 'Identifier' && c.name === 'test')
          || (c.type === 'MemberExpression' && c.object.type === 'Identifier' && c.object.name === 'test');
        return {
          CallExpression(node) {
            if (!isTestCallee(node.callee)) { return; }
            for (const arg of node.arguments) {
              if (arg.type !== 'ArrowFunctionExpression' && arg.type !== 'FunctionExpression') { continue; }
              const first = arg.params[0];
              if (first?.type !== 'ObjectPattern') { continue; }
              for (const prop of first.properties) {
                const name = prop.type === 'Property' && (prop.key.name ?? prop.key.value);
                if (name === 'page' || name === 'request') {
                  context.report({ node: prop, messageId: 'rawPage', data: { name } });
                }
              }
            }
          },
        };
      },
    },
  },
};

/**
 * The four `kata/*` rules on the whole test tree. They are path-aware inside, so
 * one block is enough; `no-restricted-imports` is deliberately NOT used here:
 * `KATA_IMPORT_ALIASES` owns it on `tests/**` and a second block would replace it.
 */
export const KATA_RULES = {
  files: ['tests/**/*.ts'],
  plugins: { kata: kataPlugin },
  rules: {
    'kata/layer-imports': KATA_ENFORCEMENT_LEVEL,
    'kata/atc-no-atc-call': KATA_ENFORCEMENT_LEVEL,
    'kata/no-decorator-in-base': KATA_ENFORCEMENT_LEVEL,
    'kata/no-raw-page-in-spec': KATA_ENFORCEMENT_LEVEL,
  },
};

/**
 * Size limits for the component layers (kata-invariants.md §3: at most 2
 * positional params, domain components stay small enough to review). Each entry
 * is its own block so the later `ApiBase.ts` override wins over the first.
 */
export const KATA_SHAPE = [
  {
    // Layers 2, 3 and 3.5 only: fixtures keep Playwright's ({}, use, testInfo) shape.
    files: ['tests/components/api/**/*.ts', 'tests/components/ui/**/*.ts', 'tests/components/steps/**/*.ts'],
    rules: { 'max-params': [KATA_ENFORCEMENT_LEVEL, 2] },
  },
  {
    // Owner-documented exemption: the protected HTTP primitives of ApiBase take
    // path, payload and options, the tuple contract every ATC already calls.
    files: ['tests/components/api/ApiBase.ts'],
    rules: { 'max-params': 'off' },
  },
  {
    files: ['tests/components/api/*.ts', 'tests/components/ui/*.ts'],
    rules: { 'max-lines': [KATA_ENFORCEMENT_LEVEL, { max: 500, skipBlankLines: true, skipComments: true }] },
  },
];

/**
 * `eslint-plugin-playwright` rules that agree with KATA. `expect-expect`,
 * `prefer-ending-with-an-expect`, `no-standalone-expect` and `no-raw-locators`
 * are left off on purpose: they contradict KATA Rules 4 and 6 (assertions live
 * inside ATCs, locators live in components).
 */
export const KATA_PLAYWRIGHT = {
  files: ['tests/**/*.ts'],
  plugins: { playwright },
  rules: {
    'playwright/no-wait-for-timeout': KATA_ENFORCEMENT_LEVEL,
    'playwright/no-wait-for-selector': KATA_ENFORCEMENT_LEVEL,
    'playwright/no-networkidle': KATA_ENFORCEMENT_LEVEL,
    'playwright/missing-playwright-await': KATA_ENFORCEMENT_LEVEL,
    'playwright/no-conditional-expect': KATA_ENFORCEMENT_LEVEL,
    'playwright/no-useless-not': KATA_ENFORCEMENT_LEVEL,
    'playwright/no-nth-methods': KATA_ENFORCEMENT_LEVEL,
    'playwright/no-force-option': KATA_ENFORCEMENT_LEVEL,
    'playwright/no-focused-test': KATA_ENFORCEMENT_LEVEL,
    'playwright/no-page-pause': KATA_ENFORCEMENT_LEVEL,
    'playwright/no-element-handle': KATA_ENFORCEMENT_LEVEL,
    'playwright/no-skipped-test': KATA_ENFORCEMENT_LEVEL,
  },
};
