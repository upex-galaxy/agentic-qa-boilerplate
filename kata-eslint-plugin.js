/**
 * @fileoverview SYNCED. The inline KATA plugin, in its own module so ESLint
 * (`eslint.config.base.js`) and Oxlint (`.oxlintrc.base.json` `jsPlugins`) load
 * the same file. Default export is the plugin object, which is what an Oxlint
 * JS plugin needs; `eslint.config.base.js` re-exports it as `kataPlugin`.
 */

import { relative } from 'node:path';

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
const kataPlugin = {
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

export default kataPlugin;
