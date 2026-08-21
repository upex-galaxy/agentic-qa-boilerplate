#!/usr/bin/env bun
/**
 * Xray CLI - Command Line Interface for Xray Test Management
 *
 * SOLID Refactor - Modular Architecture
 * Version 2.0.0
 *
 * A CLI tool for managing Xray Cloud test cases, executions, and results.
 *
 * Documentation:
 *   - Xray Cloud REST API:   https://docs.getxray.app/display/XRAYCLOUD/REST+API
 *   - Xray GraphQL API:      https://docs.getxray.app/display/XRAYCLOUD/GraphQL+API
 *   - GraphQL Schema:        https://us.xray.cloud.getxray.app/doc/graphql/index.html
 */

// Command imports
import * as auth from './commands/auth.js';
import * as backup from './commands/backup.js';

import * as exec from './commands/exec.js';
import * as importCmd from './commands/import.js';
import * as link from './commands/link.js';
import * as plan from './commands/plan.js';
import * as precondition from './commands/precondition.js';
import * as repairCmd from './commands/repair.js';
import * as run from './commands/run.js';
import * as set from './commands/set.js';
import * as test from './commands/test.js';
import { colors, log } from './lib/logger.js';
import { parseArgs } from './lib/parser.js';

// ============================================================================
// HELP
// ============================================================================

function showHelp(): void {
  console.log(`
${colors.bold}${colors.cyan}Xray CLI${colors.reset} - Command Line Interface for Xray Test Management

${colors.bold}USAGE${colors.reset}
  xray <command> <subcommand> [options]

${colors.bold}AUTHENTICATION${colors.reset}
  auth login     Login with Xray API credentials
                 --client-id <id>       Client ID (or XRAY_CLIENT_ID env var)
                 --client-secret <key>  Client Secret (or XRAY_CLIENT_SECRET env var)
                 --project <key>        Default project key
                 --jira-url <url>       Jira base URL (for sync features)
                 --jira-email <email>   Jira account email
                 --jira-token <token>   Jira API token

  auth logout    Clear stored credentials
  auth status    Show current authentication status

${colors.bold}TEST MANAGEMENT${colors.reset}
  test create    Create a new test case
                 --project <key>        Project key (required)
                 --summary <text>       Test summary (required)
                 --type <type>          Manual|Generic|Cucumber (default: Manual)
                 --description <text>   Test description
                 --labels <l1,l2>       Comma-separated labels
                 --folder <path>        Folder path in Xray
                 --definition <text>    Definition (for Generic tests)
                 --gherkin <feature>    Gherkin feature (for Cucumber tests)
                 ${colors.yellow}NOTE: Manual steps are NOT created here.${colors.reset} Xray Cloud
                 does not persist steps passed on create — add each one
                 afterwards with 'test add-step' (see below).

  test get <key>     Get test details
  test list          List tests
                     --project <key>    Filter by project
                     --jql <query>      Custom JQL filter
                     --limit <n>        Max results (default: 20)

  test add-step      Add step to existing test (the reliable way to add Manual
                     steps — one call per step)
                     --test <id>        Test issue ID (required)
                     --action <text>    Step action (required)
                     --data <text>      Step test data
                     --result <text>    Expected result
  test update-step   Update an existing step in place (only the flags you pass
                     change; omitted fields keep their value)
                     <TEST_KEY>         Test key or issue ID (optional, informational)
                     --step <id>        Step ID to update (required)
                     --action <text>    New step action
                     --data <text>      New step test data
                     --result <text>    New expected result
  test remove-step   Remove a step from a test
                     --test <id>        Test issue ID (required)
                     --step <id>        Step ID to remove (required)
  test update-gherkin    Replace the Gherkin definition of an existing Cucumber test
                     --test <id>        Test issue ID (required)
                     --gherkin <feature> New Gherkin feature (required)
  test update-definition Replace the unstructured definition of an existing Generic test
                     --test <id>        Test issue ID (required)
                     --definition <text> New definition (required)
  test update-type   Change the type of an existing test (Manual/Generic/Cucumber)
                     --test <id>        Test issue ID (required)
                     --type <name>      New test type (required)

  test enrich        Backfill the synced Test .md cache (.context/PBI) with the
                     Xray-only associations the Jira REST sync cannot see:
                     inlined Preconditions + Test Set membership. Re-run safe —
                     replaces its own delimited section. Also writes
                     test-sets/<KEY>.md member indexes.
                     --dir <path>       PBI cache root (default: .context/PBI)
                     --project <key>    Only enrich Tests of this project
                     --batch <n>        Keys per GraphQL request (default: 50)
                     --dry-run          Report without writing files
                     --no-set-index     Skip the test-sets/<KEY>.md indexes

${colors.bold}PRECONDITIONS${colors.reset}
  precondition create      Create a Precondition issue
                     --project <key>    Project key (required)
                     --summary <text>   Precondition summary (required)
                     --type <type>      Manual|Generic|Cucumber (default: Manual)
                     --definition <text> Precondition definition / setup body
                     --labels <l1,l2>   Comma-separated labels
                     --folder <path>    Folder path in Xray
  precondition list        List preconditions
                     --project <key>    Filter by project
                     --jql <query>      Custom JQL filter
                     --limit <n>        Max results (default: 20)
  precondition get <key>   Get precondition details (definition + the tests
                     using it). Also addressable via --id <numeric>.
  precondition add-to-test Attach precondition(s) to a test
                     --test <id>        Test key or numeric issue ID (required)
                     --preconditions <k1,k2> Precondition keys/ids (required)
  precondition remove-from-test  Detach a precondition from a test
                     <PRECOND_KEY>      Precondition key or issue ID (required)
                     --test <id>        Test key or numeric issue ID (required)
  precondition update      Update a precondition's definition / type
                     --precondition <id> Precondition key or issue ID (required)
                     --definition <text> New definition
                     --type <name>      New precondition type

${colors.bold}TEST EXECUTIONS${colors.reset}
  exec create        Create a test execution
                     --project <key>    Project key (required)
                     --summary <text>   Execution summary (required)
                     --tests <id1,id2>  Test issue IDs to include
                     --environment <e>  Test Environment (repeatable or comma-
                                        separated). Pins the execution to an
                                        environment (e.g. staging) so results are
                                        congruent across runs and comparable.
                                        ${colors.yellow}Strongly recommended — omitting it prints a
                                        WARNING${colors.reset} (suggested value comes from
                                        .agents/project.yaml testing env).

  exec get <id>      Get execution details with test runs
  exec list          List executions
  exec add-tests     Add tests to an existing execution
                     --execution <id>   Execution issue ID
                     --tests <id1,id2>  Test issue IDs to add
  exec add-set       Cascade a Test Set's membership into an execution
                     <EXEC_KEY>         Execution key or issue ID (required)
                     --set <key>        Test Set key or issue ID (required)
                     Reads the Set membership, adds only the tests the
                     execution is missing, reports added/skipped.
  exec remove-tests  Remove tests from an execution
  exec set-environment  Associate Test Environment(s) with an existing execution
                     --execution <id>   Execution key or numeric issue ID
                     --environment <e>  Test Environment (repeatable or CSV)
  exec sync          Diff Jira-layer issuelinks vs Xray-layer attachment
                     --execution <id>   Execution key or numeric issue ID
                     --apply            Re-attach missing tests at the Xray layer

${colors.bold}TEST RUNS${colors.reset}
  run get <id>       Get test run details with step statuses
  run list           List test runs from an execution
                     --execution <id>   Execution issue ID
  run status         Update test run status
                     --id <id>          Test run ID (required)
                     --status <status>  TODO|EXECUTING|PASSED|FAILED|ABORTED|BLOCKED

  run step-status    Update a specific step status
                     --run <id>         Test run ID
                     --step <id>        Step ID
                     --status <status>  Step status

  run step-comment   Set or replace a comment on a specific step
                     --run <id>         Test run ID
                     --step <id>        Step ID
                     --comment <text>   Comment text

  run comment        Add comment to test run
                     --id <id>          Test run ID
                     --comment <text>   Comment text

  run defect         Link defects to test run
                     --id <id>          Test run ID
                     --issues <k1,k2>   Issue keys to link as defects

  run evidence       Attach evidence files to a test run
                     --id <id>          Test run ID (required)
                     --file <path>      File to attach (repeatable)
                     --dir <dir>        Directory of files to attach
  run step-evidence  Attach evidence files to a single step within a test run
                     --run <id>         Test run ID (required)
                     --step <id>        Step ID (required)
                     --file <path>      File to attach (repeatable)
                     --dir <dir>        Directory of files to attach
  run evidence-list  List evidence currently attached to a test run
                     --id <id>          Test run ID (required)
  run evidence-rm    Remove evidence from a test run
                     --id <id>          Test run ID (required)
                     --evidence <id>    Evidence id to remove (repeatable)
                     --filename <name>  Evidence filename to remove (repeatable)

${colors.bold}TEST PLANS${colors.reset}
  plan create        Create a test plan
                     --project <key>    Project key (required)
                     --summary <text>   Plan summary (required)
                     --tests <id1,id2>  Test issue IDs to include

  plan get <id>      Get test plan details with tests
  plan list          List test plans
  plan add-tests     Add tests to an existing test plan
                     --plan <id>        Test plan key or numeric issue ID
                     --tests <id1,id2>  Test issue IDs or keys to add
  plan add-set       Cascade a Test Set's membership into a test plan
                     <PLAN_KEY>         Test plan key or issue ID (required)
                     --set <key>        Test Set key or issue ID (required)
                     Reads the Set membership, adds only the tests the plan
                     is missing, reports added/skipped.
  plan add-executions  Associate Test Execution(s) with a test plan
                     <PLAN_KEY>         Test plan key or issue ID (required)
                     --executions <k1,k2>  Execution keys/ids, comma-separated (required)
  plan remove-tests  Remove tests from a test plan
  plan sync          Diff Jira-layer issuelinks vs Xray-layer attachment for a Test Plan
                     --plan <id>        Test plan key or numeric issue ID
                     --apply            Re-attach missing tests at the Xray layer

${colors.bold}TEST SETS${colors.reset}
  set create         Create a test set
                     --project <key>    Project key (required)
                     --summary <text>   Test set summary (required)
                     --tests <id1,id2>  Test issue IDs to include

  set get <id>       Get test set details with tests
  set list           List test sets
  set add-tests      Add tests to a test set
                     --set <id>         Test set issue ID
                     --tests <id1,id2>  Test issue IDs to add
  set remove-tests   Remove tests from a test set
  set sync           Diff Jira-layer issuelinks vs Xray-layer membership for a Test Set
                     --set <id>         Test set key or numeric issue ID
                     --apply            Re-attach missing tests at the Xray layer

${colors.bold}ISSUE LINKS${colors.reset}
  link create        Create a Jira issue link between two issues
                     <FROM_KEY>         Outward party (required)
                     <TO_KEY>           Inward party (required)
                     --type <slug>      Link-type SLUG from .agents/jira-required.yaml
                                        -> link_types (default: test). Display names
                                        are resolved from the catalog, never hardcoded.
                     Direction: FROM is the OUTWARD side, TO the INWARD side.
                     Coverage case: 'link create <ATS_KEY> <STORY_KEY> --type test'
                     leaves the Story "is tested by" the Test Set — the edge the
                     Xray coverage panel reads. Also: TC→Story (last resort),
                     Bug↔Test.

${colors.bold}IMPORT RESULTS${colors.reset}
  import junit       Import JUnit XML results
                     --file <path>      XML file path (required)
                     --project <key>    Project key
                     --plan <key>       Test plan key
                     --execution <key>  Existing execution key

  import cucumber    Import Cucumber JSON results
                     --file <path>      JSON file path (required)
                     --project <key>    Project key

  import xray        Import Xray JSON format
                     --file <path>      JSON file path (required)

${colors.bold}BACKUP & RESTORE${colors.reset}
  backup export      Export the full Xray footprint of a project (v2.0):
                     tests, preconditions, test plans, test sets, repository
                     folders, and (opt-in) executions + run statuses.
                     --project <key>    Project key (required unless --all)
                     --all              Export EVERY project on the site that has
                                        Xray data into .backups/<KEY>-backup.json
                                        (lists projects via Jira, 504-resilient)
                     --output <file>    Output file path (single-project mode)
                     --include-runs     Include test executions + run statuses
                     --only-with-data   Only tests with Xray data (steps/gherkin/definition)
                     --limit <n>        Batch size for fetching (default: 100)
                     --tests-only       Legacy v1.0 shape: tests only
                     --no-preconditions / --no-plans / --no-sets / --no-folders
                                        Skip a specific entity type
                     --no-coverage      Drop the coverableIssues subquery
                                        (record-only; fixes CloudFront 504 on
                                        projects with heavy requirement coverage)

  backup restore     Restore Xray data into a project. Order: preconditions ->
                     tests (+folder +precondition links) -> folders -> sets ->
                     plans -> executions (+run statuses). v1.0 backups also work.
                     --file <path>      Backup file path (required)
                     --project <key>    Target project key (required)
                     --dry-run          Preview changes without making them
                     --sync             Match existing issues by KEY (needs target
                                        Jira creds) instead of creating duplicates
                     --map-keys <file>  CSV file with old_key,new_key mappings

                     CROSS-SITE: Xray addresses by numeric issueId (re-assigned
                     per site); a Jira migration preserves the KEY. Use --sync so
                     restore re-resolves ids by key. Re-run 'auth login' to switch
                     sites between export and restore (one site per session).

  backup preflight   Compare a backup's captured source config with the live
                     destination config and report what to create MANUALLY on the
                     destination before import (test types, run statuses, test
                     environments, defect types). Read-only — Xray has no
                     config-write API. Run it while authed to the DESTINATION.
                     --file <path>      Single backup file
                     --dir <dir>        Directory of *-backup.json (default .backups/)
                     --project <key>    Override destination project key
                                        (default: each backup's own key)

${colors.bold}REPAIR${colors.reset}
  repair             Bulk Jira-layer ↔ Xray-layer reconciliation across a project
                     (Test Executions + Test Plans + Test Sets).
                     Useful after Test Executions or Test Plans were created via Jira
                     fallback paths without Xray auth (the Jira layer accepts the
                     issue but the Xray layer never registers the test attachment).
                     --project <key>    Project key (required, falls back to default)
                     --apply            Re-attach missing tests at the Xray layer
                     --limit <n>        Max issues to scan per type (default: 100)

${colors.bold}EXAMPLES${colors.reset}
  # Login
  xray auth login --client-id ABC123 --client-secret xyz789

  # Create a manual test, THEN add steps (steps are not persisted on create)
  xray test create --project DEMO --summary "Verify login" --type Manual
  xray test add-step --test 1042389 --action "Open app" --result "Login form is displayed"
  xray test add-step --test 1042389 --action "Enter credentials" --data "user@test.com" --result "Success message"

  # Create an execution pinned to a Test Environment
  xray exec create --project DEMO --summary "Sprint 5 Regression" --environment staging

  # Update test run status
  xray run status --id 5acc7ab0a3fe1b --status PASSED

  # Attach evidence files to a test run (single, multiple, or whole directory)
  xray run evidence --id 5acc7ab0a3fe1b --file ./screenshots/login-error.png
  xray run evidence --id 5acc7ab0a3fe1b --file a.png --file b.png --file c.png
  xray run evidence --id 5acc7ab0a3fe1b --dir ./.context/PBI/{{PROJECT_KEY}}-8/evidence/

  # Enrich the synced Test cache with Preconditions + Test Set membership
  xray test enrich --project {{PROJECT_KEY}}
  xray test enrich --dry-run

  # Import JUnit results
  xray import junit --file results.xml --project DEMO

  # Backup project data (all tests)
  xray backup export --project DEMO --output demo-backup.json --include-runs

  # Backup only tests with Xray data (excludes empty tests)
  xray backup export --project DEMO --only-with-data --include-runs

  # Restore to a new project (dry run first)
  xray backup restore --file demo-backup.json --project NEW_PROJ --dry-run

  # Sync existing tests (after migration)
  xray backup restore --file backup.json --project PROJ --sync

  # Set-first cascade: propagate a Test Set's membership into a Plan / Execution
  xray plan add-set {{PROJECT_KEY}}-200 --set {{PROJECT_KEY}}-180
  xray exec add-set {{PROJECT_KEY}}-194 --set {{PROJECT_KEY}}-180

  # Associate executions with a plan
  xray plan add-executions {{PROJECT_KEY}}-200 --executions {{PROJECT_KEY}}-194,{{PROJECT_KEY}}-195

  # Coverage link: the Story ends up "is tested by" the Test Set
  xray link create {{PROJECT_KEY}}-180 {{PROJECT_KEY}}-42 --type test

  # Diff Jira-layer vs Xray-layer for a Test Execution and (optionally) repair
  xray exec sync --execution {{PROJECT_KEY}}-194
  xray exec sync --execution {{PROJECT_KEY}}-194 --apply

  # Bulk repair every Test Execution + Test Plan + Test Set in a project
  xray repair --project {{PROJECT_KEY}}
  xray repair --project {{PROJECT_KEY}} --apply

${colors.bold}ENVIRONMENT VARIABLES${colors.reset}
  XRAY_CLIENT_ID      Xray API Client ID
  XRAY_CLIENT_SECRET  Xray API Client Secret
  ATLASSIAN_EMAIL     Atlassian account email
  ATLASSIAN_API_TOKEN Atlassian API token

  The Jira site host is NOT an environment variable: it is read from
  .agents/project.yaml -> issue_tracker.atlassian_url (print it with
  'bun run --silent jira:url'), or from 'xray auth login --jira-url'.

${colors.bold}CONFIG FILES${colors.reset}
  ~/.xray-cli/config.json   Stored credentials
  ~/.xray-cli/token.json    Cached auth token

${colors.dim}Version 2.0.0 (SOLID Refactor - Modular Architecture)${colors.reset}
`);
}

// ============================================================================
// MAIN ROUTER
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, subcommand, flags, positional } = parseArgs(args);

  // `--help` / `-h` on a SUBCOMMAND used to fall through to the router and
  // execute the command instead of printing help: `test list --help` ran an
  // unfiltered list. On a mutating subcommand that fallthrough would perform the
  // mutation, so intercept it before anything is dispatched.
  //
  // Scanning raw argv is safe here: parseArgs never consumes a token starting
  // with `-` as another flag's value, so `--help` / `-h` can only ever have been
  // a flag of their own. (The flip side is that no flag can take a value
  // starting with `-` at all — a parser limitation, not a help-handling one.)
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  try {
    switch (command) {
      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;

      case 'auth':
        switch (subcommand) {
          case 'login':
            await auth.login(flags);
            break;
          case 'logout':
            await auth.logout();
            break;
          case 'status':
            await auth.status();
            break;
          default:
            log.error(`Unknown auth command: ${subcommand}`);
            log.info('Available: login, logout, status');
        }
        break;

      case 'test':
        switch (subcommand) {
          case 'create':
            await test.create(flags);
            break;
          case 'get':
            await test.get(flags, positional);
            break;
          case 'list':
            await test.list(flags);
            break;
          case 'add-step':
            await test.addStep(flags);
            break;
          case 'update-step':
            await test.updateStep(flags, positional);
            break;
          case 'remove-step':
            await test.removeStep(flags);
            break;
          case 'update-gherkin':
            await test.updateGherkin(flags);
            break;
          case 'update-definition':
            await test.updateDefinition(flags);
            break;
          case 'update-type':
            await test.updateType(flags);
            break;
          case 'enrich':
            await test.enrich(flags);
            break;
          default:
            log.error(`Unknown test command: ${subcommand}`);
            log.info('Available: create, get, list, add-step, update-step, remove-step, update-gherkin, update-definition, update-type, enrich');
        }
        break;

      case 'precondition':
      case 'precond': // shorthand
        switch (subcommand) {
          case 'create':
            await precondition.create(flags);
            break;
          case 'list':
            await precondition.list(flags);
            break;
          case 'get':
            await precondition.get(flags, positional);
            break;
          case 'add-to-test':
            await precondition.addToTest(flags);
            break;
          case 'remove-from-test':
            await precondition.removeFromTest(flags, positional);
            break;
          case 'update':
            await precondition.update(flags);
            break;
          default:
            log.error(`Unknown precondition command: ${subcommand}`);
            log.info('Available: create, list, get, add-to-test, remove-from-test, update');
        }
        break;

      case 'exec':
      case 'execution': // alias for backwards compatibility
        switch (subcommand) {
          case 'create':
            await exec.create(flags);
            break;
          case 'get':
            await exec.get(flags, positional);
            break;
          case 'list':
            await exec.list(flags);
            break;
          case 'add-tests':
            await exec.addTests(flags);
            break;
          case 'add-set':
            await exec.addSet(flags, positional);
            break;
          case 'remove-tests':
            await exec.removeTests(flags);
            break;
          case 'sync':
            await exec.sync(flags);
            break;
          case 'set-environment':
            await exec.setEnvironment(flags);
            break;
          default:
            log.error(`Unknown exec command: ${subcommand}`);
            log.info('Available: create, get, list, add-tests, add-set, remove-tests, sync, set-environment');
        }
        break;

      case 'run':
        switch (subcommand) {
          case 'get':
            await run.get(flags, positional);
            break;
          case 'list':
            await run.listRuns(flags);
            break;
          case 'status':
            await run.status(flags);
            break;
          case 'step-status':
            await run.stepStatus(flags);
            break;
          case 'step-comment':
            await run.stepComment(flags);
            break;
          case 'comment':
            await run.comment(flags);
            break;
          case 'defect':
            await run.defect(flags);
            break;
          case 'evidence':
            await run.evidence(flags);
            break;
          case 'step-evidence':
            await run.stepEvidence(flags);
            break;
          case 'evidence-list':
            await run.evidenceList(flags);
            break;
          case 'evidence-rm':
            await run.evidenceRm(flags);
            break;
          default:
            log.error(`Unknown run command: ${subcommand}`);
            log.info('Available: get, list, status, step-status, step-comment, comment, defect, evidence, step-evidence, evidence-list, evidence-rm');
        }
        break;

      case 'plan':
        switch (subcommand) {
          case 'create':
            await plan.create(flags);
            break;
          case 'get':
            await plan.get(flags, positional);
            break;
          case 'list':
            await plan.list(flags);
            break;
          case 'add-tests':
            await plan.addTests(flags);
            break;
          case 'add-set':
            await plan.addSet(flags, positional);
            break;
          case 'add-executions':
            await plan.addExecutions(flags, positional);
            break;
          case 'remove-tests':
            await plan.removeTests(flags);
            break;
          case 'sync':
            await plan.sync(flags);
            break;
          default:
            log.error(`Unknown plan command: ${subcommand}`);
            log.info('Available: create, get, list, add-tests, add-set, add-executions, remove-tests, sync');
        }
        break;

      case 'set':
      case 'testset': // alias for backwards compatibility
        switch (subcommand) {
          case 'create':
            await set.create(flags);
            break;
          case 'get':
            await set.get(flags, positional);
            break;
          case 'list':
            await set.list(flags);
            break;
          case 'add-tests':
            await set.addTests(flags);
            break;
          case 'remove-tests':
            await set.removeTests(flags);
            break;
          case 'sync':
            await set.sync(flags);
            break;
          default:
            log.error(`Unknown set command: ${subcommand}`);
            log.info('Available: create, get, list, add-tests, remove-tests, sync');
        }
        break;

      case 'link':
        switch (subcommand) {
          case 'create':
            await link.create(flags, positional);
            break;
          default:
            log.error(`Unknown link command: ${subcommand}`);
            log.info('Available: create');
        }
        break;

      case 'import':
        switch (subcommand) {
          case 'junit':
            await importCmd.junit(flags);
            break;
          case 'cucumber':
            await importCmd.cucumber(flags);
            break;
          case 'xray':
            await importCmd.xray(flags);
            break;
          default:
            log.error(`Unknown import command: ${subcommand}`);
            log.info('Available: junit, cucumber, xray');
        }
        break;

      case 'backup':
        switch (subcommand) {
          case 'export':
            await backup.backupExport(flags);
            break;
          case 'restore':
            await backup.restore(flags);
            break;
          case 'preflight':
            await backup.preflight(flags);
            break;
          default:
            log.error(`Unknown backup command: ${subcommand}`);
            log.info('Available: export, restore, preflight');
        }
        break;

      case 'repair':
        await repairCmd.repair(flags);
        break;

      default:
        if (command) {
          log.error(`Unknown command: ${command}`);
        }
        showHelp();
    }
  }
  catch (error) {
    if (error instanceof Error) {
      log.error(error.message);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
    }
    else {
      log.error(String(error));
    }
    process.exit(1);
  }
}

// Run
void main();
