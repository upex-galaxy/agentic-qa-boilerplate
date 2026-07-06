import { defineConfig } from 'allure';

/**
 * Allure 3 report configuration.
 *
 * SINGLE-PLUGIN BY DESIGN. With only the Awesome plugin, the generated
 * index.html IS the report (no landing/card-chooser screen), and Awesome
 * already ships everything in one UI via its top-left mode dropdown:
 *   - Report   — full drill-down (tests, steps, attachments, tag filters).
 *   - Graphs   — the COMPLETE chart set (defaultChartsConfig from
 *                @allurereport/charts-api): status, dynamics, severities,
 *                transitions, stability by suite/feature/epic/story,
 *                testing pyramid, durations, growth, coverage diff…
 *                Customizable via the `charts: ChartOptions[]` option.
 *   - Timeline — per-worker execution timeline.
 *
 * Do NOT add @allurereport/plugin-dashboard instances here: they duplicate
 * Awesome's Graphs tab with fewer charts AND bring back the card-chooser
 * landing in front of every published report. If a filtered executive view
 * is ever needed (e.g. @critical-only), Awesome itself accepts a `filter`
 * option on a second instance — but prefer the in-report Tags filter.
 *
 * Trend-style charts need run history: they render from the 2nd generated
 * report onward. The `layer` label feeding testingPyramid/durations-by-layer
 * comes from the _allureLayer auto-fixture in tests/components/TestFixture.ts.
 */

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
    awesome: {
      options: {
        reportLanguage: 'en',
      },
    },
  },
});
