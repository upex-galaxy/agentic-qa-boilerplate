import { defineConfig } from 'allure';

/**
 * Allure 3 report configuration.
 *
 * Landing page shows one card per plugin instance below:
 *   1. Awesome    — full drill-down report (tests, steps, attachments).
 *   2. Dashboard  — executive QA dashboard over ALL suites.
 *   3. Dashboard  — smoke/release-gate view (@critical-tagged tests only).
 *
 * Chart `type` values MUST match the ChartType enum in
 * @allurereport/charts-api (dist/types.d.ts). The plugin-dashboard README
 * examples (`trend`/`pie`) predate 3.14 and silently produce an EMPTY
 * dashboard (404 on widgets/charts.json) — do not copy them.
 *
 * Trend-style charts (dynamics/transitions/growth/age) need run history:
 * they render meaningfully from the 2nd generated report onward.
 */

// Executive dashboard over all suites — ordered health → risk → hygiene.
const qaDashboardLayout = [
  // Health at a glance
  { type: 'currentStatus', title: 'Current status' },
  { type: 'statusDynamics', title: 'Status dynamics (last 20 runs)', limit: 20 },
  { type: 'statusTransitions', title: 'Status transitions vs previous run', limit: 20 },
  // Risk: what is broken, how severe, where
  { type: 'testResultSeverities', title: 'Results by severity', includeUnset: true },
  { type: 'problemsDistribution', by: 'environment', title: 'Problems by environment' },
  { type: 'statusAgePyramid', title: 'Failure age (how long tests have been failing)' },
  // Stability & coverage shape
  {
    type: 'stabilityDistribution',
    title: 'Stability by suite (flakiness radar)',
    groupBy: 'suite',
    threshold: 90,
    skipStatuses: ['skipped', 'unknown'],
  },
  // Layers come from the `layer` label set by the _allureLayer auto-fixture
  // in tests/components/TestFixture.ts (derived from e2e/ vs integration/).
  { type: 'testingPyramid', title: 'Testing pyramid', layers: ['integration', 'e2e'] },
  { type: 'successRateDistribution', title: 'Success rate map' },
  { type: 'coverageDiff', title: 'Coverage diff vs previous run' },
  { type: 'testBaseGrowthDynamics', title: 'Test base growth' },
  // Performance of the suite itself
  { type: 'durations', title: 'Durations by layer', groupBy: 'layer' },
  { type: 'durationDynamics', title: 'Duration dynamics (suite speed over time)', limit: 20 },
];

// Release-gate view: only what matters right after a deploy.
const smokeDashboardLayout = [
  { type: 'currentStatus', title: 'Critical tests — current status' },
  { type: 'statusDynamics', title: 'Critical tests — status dynamics', limit: 20 },
  { type: 'statusTransitions', title: 'Critical tests — transitions vs previous run', limit: 20 },
  { type: 'durationDynamics', title: 'Smoke duration dynamics', limit: 20 },
];

export default defineConfig({
  name: 'Agentic QA Boilerplate',
  output: './allure-report',
  // Persisted outside allure-report/ so `bun run test:clean` (which wipes
  // allure-results/ and allure-report/) never erases trend history.
  historyPath: './.allure/history.jsonl',
  // Awesome-plugin-native grouping (report-generation time), on top of the
  // classic messageRegex/matchedStatuses categories the allure-playwright
  // reporter already writes to allure-results/ (still current SDK options,
  // kept as-is in playwright.config.ts) — the two are complementary, not
  // a replacement for each other.
  categories: [
    {
      name: 'Product defects',
      matchers: { statuses: ['failed'] },
      groupBy: ['severity', 'owner', 'environment'],
      groupByMessage: true,
      groupEnvironments: true,
    },
    {
      name: 'Flaky tests',
      matchers: { flaky: true },
      groupBy: ['environment'],
    },
  ],
  plugins: {
    'awesome': {
      options: {
        reportLanguage: 'en',
      },
    },
    'dashboard': {
      options: {
        reportName: 'QA Dashboard',
        reportLanguage: 'en',
        layout: qaDashboardLayout,
      },
    },
    // Second instance of the same plugin: custom key + explicit `import`.
    // Playwright tags (e.g. `{ tag: '@critical' }`) reach Allure as `tag`
    // labels with the leading `@` stripped.
    'smoke-dashboard': {
      import: '@allurereport/plugin-dashboard',
      options: {
        reportName: 'Smoke — Release Gate',
        reportLanguage: 'en',
        layout: smokeDashboardLayout,
        filter: testResult =>
          testResult.labels.some(({ name, value }) => name === 'tag' && value === 'critical'),
      },
    },
  },
});
