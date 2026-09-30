# Test Execution Breakdown

Explain what automated tests do, as one self-contained HTML page: which ATCs run, what every assertion checks (with its `file:line`), how data flows, and what a reviewer should look at. The AI reads the code and writes the facts as JSON; a synced renderer turns that JSON into the page, so the page looks the same on every run and every harness.

**Input:** $ARGUMENTS
(Scope: a file path, an ATC id, a ticket key, or a module name. Examples: `tests/integration/auth/user-session.test.ts`, `PROJ-101`, `UPEX-100`, `auth`.)

**Read-only.** This mode never edits tests, product code or `kata-manifest.json`, never calls Jira or the TMS, and keeps no session state. Its only writes are the two report files of Step 4.

---

## Step 1: Identify the scope

| Input looks like | Scope | Action |
|---|---|---|
| File path (`.test.ts`) | One test file | Read that file |
| ATC id (`PROJ-101`, the `@atc('...')` value) | One ATC | Find it in `kata-manifest.json`, then every test that calls it |
| Ticket key (`UPEX-100`, the key in the test titles) | That ticket's tests | Find every test file whose titles or `describe` carry the key |
| Module name (`auth`) | One module | Every test file under that module folder, in `tests/e2e/` and `tests/integration/` |

The scope slug (lowercase, `a-z0-9-`) names the output files: the module name, the ATC id or ticket key lowercased (`proj-101`), or the file's basename without `.test.ts`.

## Step 2: Load the facts a script can give you

Read `kata-manifest.json` first. It holds every ATC's `id`, `method`, component file and `line`. The renderer overwrites those four fields from the manifest anyway, so never guess them; an ATC id the manifest does not know is reported on the page as a finding.

## Step 3: Trace the code

For each test file in scope:

1. Read the test file: every `test()` and `test.describe()`, their titles, guards (`test.skip(...)` conditions), and the fixture destructured (`{ api }`, `{ ui }`, `{ test }`).
2. Read each ATC the test calls, in `tests/components/`, and any Steps module used as a precondition.
3. Read the shared setup the tests depend on (`beforeAll`, `beforeEach`, the setup projects under `tests/setup/`) and note what it produces and which tests reuse it.
4. Record every `expect(...)` with its exact file and line, as positive (must be true) or negative (must NOT be true: an error status, a missing session, an absent element). Mark `expect.soft` as `soft: true`.
5. Note anything only a reader can see, such as a `waitForTimeout` hard wait, as a finding with its location.

Never invent an assertion. A count that does not match the code is a wrong page.

## Step 4: Write the JSON, render, open

Write `.context/reports/test-breakdown/<scope-slug>.json` (`.context/reports/` is gitignored generated output), then render it:

```bash
bun run tests:explain:render .context/reports/test-breakdown/<scope-slug>.json
```

The renderer validates the file and writes `<scope-slug>.html` next to it. A validation error names the JSON path to fix; fix the JSON and render again. An unknown `schemaVersion` is refused by name: write the version the renderer states.

**Language (deck decision D6).** `lang` is the conversation language, and every sentence you write (`value`, `text`, `actions`, setup `description`) is in that language. Test titles, ATC ids, method names, file paths and code stay verbatim. The renderer ships English and Spanish labels; for any other language, add a `labels` object with the translated UI strings (keys missing from it fall back to English, and the renderer says which).

**Opening.** The owner asked for the page, so open it without asking. With the orchestration gate ready, open it through `[ORCHESTRATION_TOOL]` as a worktree-bound tab (`orca-orchestration/references/html-surfaces.md`: a read-only page, so the `file://` route). Otherwise run the render with `--open`, which uses the system opener, and say nothing else about how it was opened.

**Chat.** Three lines at most: what the scope proves in business terms, the counts (tests, ATCs, assertions, findings), and the repo-relative path of the HTML. The page carries the detail, and its "Copy as Markdown" button gives the summary table for a PR description.

### JSON contract (`schemaVersion: 1`)

The renderer (`scripts/tests-explain-render.ts`) is the authority: its types and validator define every field. The shape, with the example ids in this repo's format:

```json
{
  "schemaVersion": 1,
  "lang": "es",
  "scope": { "slug": "auth", "title": "Sesión de usuario por API", "input": "tests/integration/auth/" },
  "sourceFiles": ["tests/integration/auth/user-session.test.ts", "tests/components/api/AuthApi.ts"],
  "setup": [
    {
      "id": "api-setup",
      "name": "API Setup: authenticate via API",
      "description": "Inicia sesión antes de la suite y guarda el token.",
      "file": "tests/setup/api-auth.setup.ts",
      "line": 26,
      "produces": [{ "variable": "token", "value": ".auth/api-state.json" }],
      "usedIn": ["re-auth"]
    }
  ],
  "tests": [
    {
      "id": "re-auth",
      "name": "UPEX-100: should be able to re-authenticate",
      "file": "tests/integration/auth/user-session.test.ts",
      "line": 50,
      "fixture": "api",
      "value": "Un usuario cuya sesión se borró puede volver a entrar.",
      "guard": "solo si el endpoint de login está habilitado",
      "setup": ["api-setup"],
      "atcs": [
        {
          "id": "PROJ-101",
          "params": "credentials",
          "actions": ["Envía email y contraseña al login", "Consulta /auth/me"],
          "assertions": [
            { "polarity": "positive", "text": "El login responde OK", "expected": "200", "file": "tests/components/api/AuthApi.ts", "line": 84 }
          ]
        }
      ],
      "assertions": [
        { "polarity": "positive", "text": "Llega un token nuevo", "file": "tests/integration/auth/user-session.test.ts", "line": 64 }
      ],
      "data": {
        "columns": ["email", "password"],
        "rows": [{ "values": ["", "secret"], "partition": "email vacío", "technique": "BVA" }]
      }
    }
  ],
  "findings": [
    { "kind": "hard-wait", "message": "waitForTimeout(2000)", "file": "tests/e2e/checkout/checkout.test.ts", "line": 40 }
  ]
}
```

| Field | Rule |
|---|---|
| `tests[].id`, `setup[].id` | Slug, unique; the anchors the page links to. `setup` and `usedIn` must reference existing ids. |
| `tests[].fixture` | `api`, `ui` or `test`, as destructured in the test. |
| `tests[].assertions` | Only the `expect` calls in the test body. ATC assertions go under that ATC. |
| `atcs[].method`, `file`, `line` | Optional: the manifest fills them. |
| `data.rows[].technique` | `EP`, `BVA`, `state-transition`, `decision-table`, `pairwise` or `error-guessing` (the test-design doctrine's techniques). |
| `findings[]` | Only what the renderer cannot derive: `hard-wait` or `other`. It derives the rest itself: ATC without a negative assertion, test with zero assertions, soft assertion, ATC not in `kata-manifest.json`. |
| `commit`, `generatedAt` | Optional: filled from `git` and the clock at render time. |
| `glossary[]` | Optional additions to the built-in glossary (ATC, fixture, Steps, KATA layer, assertion polarity, EP / BVA). |

### What the page shows

Overview (stat tiles, commit, sources) · what the suite proves (filterable table) · flow per test (setup → fixture → numbered ATC chain → assertion counts) · test cards (guard, actions, positive and negative assertions with `file:line`, data table with partitions) · data flow · findings (facts with a location, never a fix) · traceability (ATC → Jira Test → Story, read from the synced `.context/PBI/` cache on disk; with no cache it says so) · glossary. It embeds the docs site palette, follows the system light or dark theme, makes no network request, and prints cleanly.

## Rules

1. Read the code before writing the JSON. Never invent an assertion, an ATC, a line or a count.
2. One JSON per scope; re-running overwrites both files, which is intended (they are regenerated output).
3. Explain each test's value in business terms, in the conversation language.
4. Never write outside `.context/reports/test-breakdown/`.
