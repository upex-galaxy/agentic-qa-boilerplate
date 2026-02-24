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
import * as plan from './commands/plan.js';
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
                 --step <action|result> Test step (repeatable for Manual tests)
                 --definition <text>    Definition (for Generic tests)
                 --gherkin <feature>    Gherkin feature (for Cucumber tests)

  test get <key>     Get test details
  test list          List tests
                     --project <key>    Filter by project
                     --jql <query>      Custom JQL filter
                     --limit <n>        Max results (default: 20)

  test add-step      Add step to existing test
                     --test <id>        Test issue ID (required)
                     --action <text>    Step action (required)
                     --data <text>      Step test data
                     --result <text>    Expected result

${colors.bold}TEST EXECUTIONS${colors.reset}
  exec create        Create a test execution
                     --project <key>    Project key (required)
                     --summary <text>   Execution summary (required)
                     --tests <id1,id2>  Test issue IDs to include

  exec get <id>      Get execution details with test runs
  exec list          List executions
  exec add-tests     Add tests to an existing execution
                     --execution <id>   Execution issue ID
                     --tests <id1,id2>  Test issue IDs to add
  exec remove-tests  Remove tests from an execution

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

  run comment        Add comment to test run
                     --id <id>          Test run ID
                     --comment <text>   Comment text

  run defect         Link defects to test run
                     --id <id>          Test run ID
                     --issues <k1,k2>   Issue keys to link as defects

${colors.bold}TEST PLANS${colors.reset}
  plan create        Create a test plan
                     --project <key>    Project key (required)
                     --summary <text>   Plan summary (required)
                     --tests <id1,id2>  Test issue IDs to include

  plan list          List test plans

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
  backup export      Export all Xray data from a project
                     --project <key>    Project key (required)
                     --output <file>    Output file path
                     --include-runs     Include test execution runs and statuses
                     --only-with-data   Only export tests with Xray data (steps, gherkin, definition)
                     --limit <n>        Batch size for fetching (default: 100)

  backup restore     Restore Xray data to a project
                     --file <path>      Backup file path (required)
                     --project <key>    Target project key (required)
                     --dry-run          Preview changes without making them
                     --sync             Update existing tests instead of creating duplicates
                     --map-keys <file>  CSV file with old_key,new_key mappings

${colors.bold}EXAMPLES${colors.reset}
  # Login
  xray auth login --client-id ABC123 --client-secret xyz789

  # Create a manual test with steps
  xray test create --project DEMO --summary "Verify login" \\
    --step "Open app|Login form is displayed" \\
    --step "Enter credentials|user@test.com|Success message"

  # Update test run status
  xray run status --id 5acc7ab0a3fe1b --status PASSED

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

${colors.bold}ENVIRONMENT VARIABLES${colors.reset}
  XRAY_CLIENT_ID      Xray API Client ID
  XRAY_CLIENT_SECRET  Xray API Client Secret
  JIRA_BASE_URL       Jira instance URL (for sync features)
  JIRA_EMAIL          Jira account email
  JIRA_API_TOKEN      Jira API token

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
          default:
            log.error(`Unknown test command: ${subcommand}`);
            log.info('Available: create, get, list, add-step');
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
          case 'remove-tests':
            await exec.removeTests(flags);
            break;
          default:
            log.error(`Unknown exec command: ${subcommand}`);
            log.info('Available: create, get, list, add-tests, remove-tests');
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
          case 'comment':
            await run.comment(flags);
            break;
          case 'defect':
            await run.defect(flags);
            break;
          default:
            log.error(`Unknown run command: ${subcommand}`);
            log.info('Available: get, list, status, step-status, comment, defect');
        }
        break;

      case 'plan':
        switch (subcommand) {
          case 'create':
            await plan.create(flags);
            break;
          case 'list':
            await plan.list(flags);
            break;
          default:
            log.error(`Unknown plan command: ${subcommand}`);
            log.info('Available: create, list');
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
          default:
            log.error(`Unknown set command: ${subcommand}`);
            log.info('Available: create, get, list, add-tests, remove-tests');
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
          default:
            log.error(`Unknown backup command: ${subcommand}`);
            log.info('Available: export, restore');
        }
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
