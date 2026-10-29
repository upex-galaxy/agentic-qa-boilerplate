# Changelog

All notable changes to this boilerplate are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This repository ships **two independently released artifacts**, and every entry
below names which one it applies to:

- **Boilerplate** — reaches users the moment it lands on `main`, because the
  scaffolder downloads the template from GitHub at runtime. No publish step.
- **Scaffolder** — the `create-agentic-qa` npm package under
  `packages/create-agentic-qa/`. Release runbook:
  [packages/create-agentic-qa/README.md → Releasing a new version to npm](./packages/create-agentic-qa/README.md#releasing-a-new-version-to-npm).

## Unreleased — Boilerplate

### Changed (agentic work runs in three tiers: who asks the human, one worker name, a permission mode per tier)
- **Only the session the human types into asks the human.** `decision-elicitation-doctrine.md` §0
  governs the question tool, the sweep and the `mkd` deck together: a session launched by another
  session (its prompt carries `/<skill> <label> fleet worker`) never uses any of them and sends the
  four escalation kinds of `decision-protocol.md` §5, plus every error or blocker it cannot clear,
  to its launcher, which relays. `worker-contract.md` gains rule 16 and the brief template an
  escalation section. The prompt hook's `ORCA:` line now has two variants by role (launched:
  report through the mailbox, never ask the human; independent or conductor: ask the human, sweep
  small items, deck for heavy ones), and a harness task notification (a prompt opening with
  `<task-notification>`) no longer produces `ROUTE:` lines or touches the route state.
- **A worker has one name, `<label>--<handle>`**, for the harness session, the Orca tab, the
  roster and the `Session:` trailer (`session-identity.md` §2b). The prompt token carries
  `<label>` (`[<KEY>-]<slug>`) instead of `<KEY>`; on Claude Code the identity hook composes the
  name from it plus `ORCA_TERMINAL_HANDLE`, the worker renames its own tab first, and the conductor
  types the rename verb on Codex, OpenCode v2.2 and Pi. The roster template gains `Name` and `Mode`
  columns, the Claude Code launch line drops `-n` (a name flag would stop the hook from appending
  the handle), and the `/sprint-testing` fleet launch line no longer writes the `PARALLEL_*` env
  prefix.
- **A permission mode per tier instead of "launch workers in auto".** The modes come from
  `orchestration.permission_modes` (shipped: conductor `auto`, worker `bypass`, subagent
  `inherit`; ADR-0024 records the security tradeoff of worker bypass), translated per harness in
  `orca-orchestration/references/orca-machine-setup.md` §3.1. A supervised worker takes no argv,
  so Orca's per-agent default arguments (Settings, Agents) decide its permission mode: check them
  against §3.1, and the conductor verifies the mode on the worker's screen at readiness.
- **New `orchestration:` keys**: `conductor_model`, `conductor_effort`, `subagent_model`,
  `permission_modes` and `model_overrides`; `default_model` keeps its name and now pins a full
  model id for the worker tier. Run `bun sync` **interactively** to get them: `orchestration:`
  already exists in your `.agents/project.yaml`, and `bun sync --auto` only lists the missing
  leaves of an existing block, it never inserts them (`bun run agents:schema --project` lists what
  your file lacks).

### Fixed (worker names after a resume, OpenCode worker role, `bun sync` insertion marker)
- **A resumed worker gets its new name everywhere.** After a restart the conductor types the harness
  rename verb (`/rename <label>--<new handle>`, Pi `/name`) into each resumed worker, Claude Code
  included, and rewrites the roster `Name`; trailers after the resume carry the new name
  (`sprint-conductor/references/boot-and-resume.md` §4, `coordinator-playbook.md` §5).
- **OpenCode v1 workers get the launched `ORCA:` line.** The plugin records the fleet token like the
  Claude Code and Codex hook; OpenCode v2 does not expose the prompt to plugins, so a v2 worker keeps
  the independent line and relies on its brief.
- **`bun sync` labels inserted `project.yaml` leaves honestly**: `unset` only when the inserted value
  is empty, `upstream default` when it carries a real default.

### Changed (the regression and git skills stop contradicting each other)
- **One rule per contested point, aligned across `SKILL.md`, references, decks and docs.** A
  failure with fewer than 5 runs of history is labeled INSUFFICIENT HISTORY and counts as
  REGRESSION for the GO / CAUTION / NO-GO verdict (fail-closed), never FLAKY. The precedence is
  `KNOWN-BLOCKED > KNOWN ISSUE > ENVIRONMENT > NEW TEST > FLAKY > REGRESSION` in both
  `regression-testing/SKILL.md` and `failure-classification.md` (FLAKY wins only with its
  citation; REGRESSION is the residual class). Run counts come from `reports/test-outcomes.json`;
  Allure supplies each failure's detail and history, and the counts only when that file is
  missing from the downloaded artifacts (the report says so). `git-flow-master` §3.4 picks the
  `gh pr merge` flag by rule: `--merge` for every PR of an `sdet` suite and never `--squash` into
  the trunk, otherwise the flag that matches `git_strategy.decisions.feature_merge`.

### Fixed (a re-run of `bun sync` keeps the lock and the blocking rows honest)
- **The lock's `templateCommit` reaches the upstream head after a partial-delta sync.** A
  component with no delta at the new head now has its cursor moved too (`componentsWithoutDelta`),
  so the top-level SHA advances once nothing is pending. Before, a sync that advanced 13
  components left the 9 with nothing to sync at the old cursor, and `templateCommit` (and the
  "project lock" line of every parity prompt) stayed releases behind. A re-run at the same head
  repairs a lock left that way; a component with a pending delta, deselected or skipped, still
  holds its cursor.
- **A BLOCKING protected-file row stays until its arbiter passes.** The gate of every
  `PATH_PREREQUISITES` entry that differs from upstream now runs on each sync (fail-closed: a gate
  that cannot run counts as failing), and while it fails the row is printed whatever the
  `.template/upstream-sha/` marker says, and is never seeded silently. Before, run 1 printed the
  kept `.github/workflows/regression.yml` as BLOCKING and stamped its marker, and run 2 printed
  nothing while `grep -q 'xray:payload'` still failed. A project whose marker is already stamped
  gets the row back on its next sync.
  Consequence: `bun sync --strict` now exits 1 on EVERY run while such a gate fails (before, only the
  first run did), and there is no accepted-divergence key for a prerequisite yet, so a project that
  keeps its own `regression.yml` without the Xray write-back stays red under `--strict`. The fix branch
  also moves the `.github/workflows/build.yml` and `unit-tests.yml` PR triggers to every base branch,
  so PRs into an integration trunk or stacked on another PR get checks.
- **The last maintainer-only tests skip downstream.** The cases in `cli/lib/agents-schema.test.ts`
  built on `generateSchema` of the real `.agents/project.yaml`, the exact MCP variable set in
  `cli/agent-lifecycle.test.ts`, the exact hook layout in `cli/lib/updater-settings.test.ts` and
  the shipped `.playwright/cli.config.json` shape in `cli/update-boilerplate.test.ts` now sit
  behind the same maintainer-checkout test (package name AND sentinel) the other skipped tests
  use. A synced project measured 31 failures in bare `bun test`; with these files it has none.
  They still run, and pass, in the boilerplate's own checkout.

### Fixed (a new project commits, pushes and sees its prerequisites on day one)
- **The hooks of a scaffolded project pass**: `vars:check` reads the `{}` placeholder catalogs as not
  synced yet (one `CATALOG_NOT_SYNCED` warning instead of an UNKNOWN option error per shipped
  reference); `skills:check` (STALE-PATH) and `docs:check` exempt the recorded ADRs the scaffolder
  prunes, outside the boilerplate's own checkout only; `git:policy verify` warns and exits 0 with no
  GitHub origin, and prints drift as warnings while `git_strategy.meta.strategy_source` is
  `inherited` (a chosen strategy still blocks). Reaches existing projects through `bun sync`.
- **Prerequisites named**: the `bun setup` preflight shows Python 3.9+ with Pillow as information,
  `setup:doctor` reports the evidence builder and the Orca gate (binary and reachable runtime), and
  the installer's tool table says Orca is required by `/sprint-conductor` and optional elsewhere. The
  evidence builder finds `py` / `python` when there is no `python3`, and its Pillow hint names the
  PEP 668 path (`brew install pillow`, a distro package, or a venv).
- **The `board:` block from setup**: `bun setup` offers the suggested status buckets right after the
  Jira catalog sync, and `bun run agents:setup` asks `board.jql` (default from the project key);
  empty buckets are written as `[]`, and nothing is written unless `board:check` accepts the block.
  A `{}` catalog or a yaml without a `board:` block gets one line saying what to do.
- **No shell value reaches `.env` silently**: the installer asks before copying an MCP variable it
  finds in the calling shell; an unattended run copies none and lists the names.
- **Bare `bun test` is green downstream**: the tests that assert the maintainers' own files skip
  outside the boilerplate checkout (four files were still missed here; they are gated in the
  section above), and the setup fixture starts a downstream project from the blank template.
- Upgrade note: the shared `cli/preflight.ts` gained an optional `BRAND.prereqs` field; the sibling
  boilerplate keeps working without it until the shared files are ported.

### Changed — Scaffolder (prepared, not published)
- `create-agentic-qa` prunes `.agents/jira-link-types.json` (the source site's ids), drops the ADR
  Index rows of the decisions it prunes, and its `--inspect` manifest names Python/Pillow and the new
  setup steps. Needs an npm release to reach `bunx create-agentic-qa`.

### Added (`/sprint-conductor`, the sprint QA conductor on Orca)
- **`/sprint-conductor`**, a thin workflow skill that runs the sprint as a fleet of `/sprint-testing`
  workers watched from the Sprint Board: boot in seven steps (board, conductor-owned pre-flight, Run
  with a reply probe, sentinel, what the owner and the workers left, one status screen), one watch
  pass per sentinel wake (arrivals, deploy check, launch under the cap, redeploy notice), the close of
  each worker with the conductor's own status read-back and one verification subagent, and the resume
  after a reboot. Orca is required: without a reachable runtime it stops with one line, the one
  declared exception to the orchestrator-silence rule. It cites `fleet-conductor.md`, `sprint-board.md`
  and `orca-orchestration` instead of restating them; a how-it-works deck ships with it.
- **Fleet canon gaps closed** in `fleet-conductor.md`: fixture setup and the Epic's module-context
  section as conductor-only writes (a fleet worker stages its module learnings), the conductor never
  investigates an issue, auth freshness before every launch, the ad-hoc retest details, localhost
  sibling-repo worktrees, and the status read-back at each close. Orca gotchas G74-G76.
- **Sprint Board: automated outcomes in the ticket drawer.** Each TC that `reports/test-outcomes.json`
  names gets an `automated` chip beside its own status, for a run in the board's environment only;
  lanes, metrics, counts and the share and report snapshots are unchanged (ADR-0023 amendment).
- **Round closes of the same Epic run one after another.** Two workers of one Epic that finish in the
  same pass get their round-close subagents in sequence, so only one of them publishes the Epic's
  `## Module Context (QA)` section at a time (`round-close.md` §2, the skill's compact rule and its
  dispatch table).

### Fixed (`bun sync` delivers the last releases and leaves the project green)
- **The outcome classes and the Xray payload reach existing projects.** A new `tests-utils`
  component syncs `tests/utils/testOutcomes.ts`, `knownDefect.ts`, `xrayResults.ts` and their
  tests. Before, the synced skills cited two of those files and none arrived, so `skills:check`
  failed and the pre-commit hook refused the sync's own commit, and the appended `xray:payload`
  script failed with `Module not found`. `xrayResults.ts` now declares the one field it reads
  beyond `AtcResult` (`AtcRun`), so it compiles next to a project's older `decorators.ts`. A
  project that copied and edited one of these files by hand gets upstream's copy on the first
  sync, with its own saved under `.backups/` and no parity row (the component is new, so there
  is no earlier sync to compare against): to keep its copy, list the path in
  `updater.protected_paths` BEFORE that sync.
- **`tests/KataReporter.ts`, `tests/utils/decorators.ts` and `tests/utils/jiraSync.ts` are
  watched**: never overwritten, delivered once when missing, and a drift row with the hunks when
  upstream changes them (they used to get no row at all).
- **`--auto` inserts a whole missing `.agents/project.yaml` block** (headless and agent runs
  included), copied from the schema with its blank values and a `# NEW in <release>` marker. It
  still never edits a block the project has: missing leaves inside one are listed, as before, and
  `updater.schema_exempt` silences a block for both the insert and the blocking row below. The `board:` block is now declared as read by
  `/sprint-conductor`, so a project still missing it gets a blocking row. An inserted blank block
  is "board not configured": `board:check` prints one INFO line and exits 0.
- **A protected file keeps its own test.** The `.test.*` sibling of a watched or
  `updater.protected_paths` file is held back (not delivered, not overwritten) while the
  project's copy differs from upstream's, with one row naming both files. Before, protecting
  `scripts/lint-skills.ts` still delivered upstream's `lint-skills.test.ts`, and `bun test`
  failed on code nobody changed.
- **A kept `.github/workflows/regression.yml` is a blocking row with the port steps**: the
  synced `bun xray import` guard refuses keyless JUnit, so a workflow that still runs
  `bun xray import junit` stops writing results while CI stays green (`continue-on-error`).
- **A `package.json` script appended with a target file the project lacks is a blocking row**
  naming the script and the file, instead of a script that fails the first time someone runs it.
- **`.claude/settings.json` allows `Skill(sprint-conductor)` and `Skill(exploratory-testing)`**;
  the permission merge appends both to existing projects.
- **The evidence builder's Pillow hint is per platform**, the same one `bun setup` and
  `setup:doctor` print: `py -m pip install pillow` on Windows; elsewhere
  `python3 -m pip install pillow`, or `brew install pillow` / the distro package / a venv where
  the system Python refuses `pip install` (`evidence-artifact` `build.py` and its skill).
- **Upgrade step for a project that kept its own `repo:check`** (the parity row "project value
  kept"): take upstream's value, or append `&& bun run shared:check && bun run board:check` to
  yours; both scripts arrive with the sync, but nothing runs them until `repo:check` does.

### Fixed (the CI import to Xray can no longer create a Test)
- **The regression workflow's Xray write-back imports explicit Test keys.** The `XrayImport` job
  used to post `junit.xml` with no `test_key` per testcase, and Xray creates a new Generic Test for
  every unmatched JUnit testcase: the first opted-in run would have minted one unsigned, unparented
  Test per spec test, setup and teardown included, past the signed ROI gate. It now imports Xray
  JSON built from each test job's `reports/atc_results.json` (new `*-atc-results` artifacts): one
  entry per ATC, `testKey` = the `@atc` id, never `testInfo`, so it can only write runs onto existing
  Tests. A new payload step (`bun run xray:payload`) fails the job with one line naming every id
  that is not a Test key, before anything is sent; the import step stays `continue-on-error`.
  `bun run test:sync` builds its Xray body through the same code (`tests/utils/xrayResults.ts`).
- **`bun xray import junit` and `import xray` refuse a Test-creating input.** A JUnit testcase without
  `test_key` / `test_id` inside its own `<properties>` (or with two keys, a malformed key, or
  `test_summary` / `test_description` / `tags`, which rewrite the Test), or an Xray JSON entry with
  `testInfo` or a missing, malformed or repeated `testKey`, stops the command with one message
  naming each one; a body the guard cannot read is refused too.
- **The write-back reports what ran, and only this run.** A runtime `test.skip()` inside an ATC is
  recorded `SKIP` and left out (NOT RUN), never sent as FAILED. An ATC whose test failed before it
  could record a result (a timeout on a non-Playwright await) is sent as FAILED from the outcome
  records. `atc_results.json` and `test-outcomes.json` carry one run id, a report from another run
  is refused, and a run with no ATC deletes the previous run's `atc_results.json`. `bun run
  test:sync` checks the keys before it authenticates.
- **No separate "automated test" issue.** `test-automation` step 6 no longer links an
  `{AUTOMATED_TEST_KEY}` to the TC: the `@atc` id is the TC's key and the run result lands on the TC.
- Before a project's first import, every `@atc` id must be the key of an existing Test (template
  placeholder ids included): Xray returns an error for an unknown key. The docs that described
  the JUnit import (`xray-platform.md` §6 matching rules, the regression and xray-cli references, the
  Xray setup page and the regression decks) now say what the import does and does not do.

### Changed (signed ROI gate for automation, discovery intake)
- **`test-automation` no longer creates Tests.** A TC source gate runs before Plan and first on
  every resume. In scope are the Tests at `candidate` whose signature comment was created and last
  updated in Jira before the run started; Manual and recorded-Deferred Tests are listed out of
  scope. The run stops and routes the scope to `/test-documentation` (Story, coverage Tech Story or
  gap ids) only for a named TC that is not a signed Candidate, a Test with no verdict, or zero
  signed Candidates, and it never signs or waits inside the run it gates. The planning playbook's "create them in the TMS first",
  the module master document's own scenarios, the batch fleet's discovery work packages and the
  tracing troubleshooting row all follow the gate. `bun run test:sync` is documented as allowed only
  after a run in the environment the Test Execution names.
- **Signed ROI verdicts.** `test-documentation` fires Candidate or Manual only after a person signs
  the verdict, and the ROI comment ends with a `Verdict signed:` line naming a record a reader can
  check (the person's own comment, or the saved decision). Only an attended session writes it.
  Candidates without the line get a sign-only pass (`tms-conventions.md` §9). `stage-gates.md` makes signed ROI a
  hard gate with no collapse path.
- **Discovery intake** (`test-documentation/references/discovery-intake.md`): the coverage gap list
  and the exploratory round's candidate file feed Analyze, ROI and Document. COVERED is dropped with
  a line, WEAK becomes a proposal to strengthen the existing test, and NEW runs the full pipeline on
  its coverage Tech Story. Anchors and oracle answers are read back from Jira, and the >50%
  Candidate/Manual alarm runs per chunk of one anchor.
- **Mode `post-promotion`** (`test-documentation/references/post-promotion-pass.md`): the
  post-promotion `merged` pass that `git-flow-master` hands off. It checks each TC's ATC and spec
  path on the production branch plus CI, then fires `merged` and reads the status back.

### Added (evidence through the tracker, the sprint's own bugs, bucket suggestions)
- **`bun run evidence attach` / `bun run evidence link`** (`cli/lib/evidence-page/tracker.ts`): `attach` embeds a
  bug's one thumbnail at the end of its Jira Description (append only; a Description the edit screen refuses
  falls back to an `Evidence` comment) and, on `jira-xray`, a named Test Run's evidence; `link` adds the published
  evidence page to an issue as a remote link keyed by the page URL (a retest republish updates it) and, on
  `jira-xray`, appends the TC deep link to the run comment. Every write is read back at the destination,
  `--dry-run` prints every call and sends nothing, the `none` source writes nothing. They reuse the acli media
  helper, `cli/lib/sprint-source/transport.ts` and `cli/xray`. ADR-0021 carries an amendment naming the path.
- **The bug thumbnail loop and the Evidence Handoff follow the source design**: the board's bug evidence reminder
  names the thumbnail build and `attach`, the conductor's wave close verifies each filed bug has its page linked and
  its thumbnail embedded, and the sprint-testing Evidence Handoff lists the page URLs and ranked deep links and is
  the ATR's `EVIDENCE HANDOFF` section.
- **The Bugs view reads the sprint's own bug rows** on `sync --discover`: every `bugs:` row of `tickets.yaml` for
  the `none` source, and for the Jira sources one more search, `board.bug_jql` or, when it is `null`, `board.jql`
  with its issuetype clause swapped for the bug work types (never derived across an `OR` / `NOT`). A row in a status
  no bucket lists is named and never counted as open. New optional key `board.bug_jql`.
- **`bun run agents:setup` suggests `board.statuses` buckets** for the workflow statuses no bucket holds yet, from
  the status category and its slug, and appends the confirmed ones (`--non-interactive` only prints them).

### Added (CI unit tests)
- **`.github/workflows/unit-tests.yml`** runs `bun test` (the unit tests of `cli/`, `scripts/`,
  `tests/utils/`, `packages/` and `.agents/skills/`) and the `repo:check` gates no other workflow
  runs, on every push to any branch (tags excluded), on fork pull requests and on a manual dispatch.
  It checks out the full history so the `bun sync` end-to-end test runs, installs Chromium so the
  installer page test runs, and needs no secret. Until now those tests gated only on a laptop, and `build.yml` runs on pull requests only.
- **Inert in a project created from the template**: the job runs only where `contractsEnforced`
  holds (the boilerplate's own checkout, ADR-0016), because several unit tests assert the
  boilerplate's own files. `.github/` is not a `bun sync` component, so existing projects do not
  receive the file either.

### Fixed (concurrent bun sync)
- **Two `bun sync` runs on one machine no longer break each other.** The updater cloned the
  template into one fixed directory under the OS temp dir and wiped it before every clone, so two
  concurrent runs (two worktrees, two test processes) deleted each other's clone and one stopped
  with `CLONE_FAILED`. Each run now clones into a directory named after its process. This was the
  intermittent failure of `scripts/ui-up-e2e.test.ts` under load. A run that ends badly does not
  leave that directory behind: it is removed on every exit (an error, Ctrl-C, SIGINT, SIGTERM), and
  each run removes at start the directories of runs whose process is gone (a SIGKILL).
- **The `bun sync` and `bun setup` end-to-end tests clean up after themselves.**
  `scripts/ui-up-e2e.test.ts` (two full clones of the repo per test, hundreds of MB a run) and
  `scripts/ui-setup-e2e.test.ts` left every fixture in the OS temp dir; a day of parallel runs filled
  a disk. Both now remove their temp root in `afterAll`, which also fires when a test fails, and a
  test declared after each block asserts the root is gone.

### Added (Sprint Board, Merge Line and the sentinel)
- **`cli/sprint-board/`**: the Sprint Board, a live local page for a sprint-testing run with a
  conductor and several workers (`bun run board:up`, `bun run board <command>`). Lanes computed from
  the tracker's status buckets and the workers' own files, Needs-you decision cards, the owner <->
  Claude inbox, Slack drafts the owner sends, metrics, the Evidence and Bugs views, share and
  sprint QA report snapshots built by allowlist, and the `sentinel` that wakes the conductor only
  when something changed. It reads the tracker through `cli/lib/sprint-source/` and the `board:`
  block; `cli/sprint-board/demo/` renders an invented sprint with no tracker. ADR-0023.
- **Merge Line** (`#merge` on the board): every open PR into the mainline or a trunk, its signals,
  owner, interference and merge order, refreshed every 90 s by a TypeScript collector
  (`cli/sprint-board/merge-collect.ts`) that reads GitHub, git and the orchestrator and never acts
  on them. Doctrine: `git-flow-master/references/observer.md`.
- **`sprint-testing/references/sprint-board.md`**: the conductor's side of the board (the board at
  every stage, the block a worker's brief carries, the channels, decision cards, the sentinel).
- `cli/lib/sprint-source/`: untracked sprint rows now carry their `statusKey` and `bucket`; a row in
  a status `board.statuses` does not list comes back with `bucket: null` and the reason instead of
  failing `--discover` (a tracked ticket in such a status still fails). `SnapshotOptions.bugKeys`
  reads extra bug ids (the board's own links): they count in `searched.bugs`, and one the tracker
  cannot find is returned in `missing.bugs`.

### Added (exploratory testing)
- **`/exploratory-testing`**, the ticket-free entry into the Execution stage: a charter, a
  parallel reconnaissance fan-out across UI, API and DB, a refutation pass whose job is to kill each
  finding, a main-thread tie-break, and a handoff. Every candidate scenario is executed live, marked
  `NEW`, `WEAK` or `COVERED` against existing coverage (the gap list of `project-context` mode
  `coverage`, or a coverage view built from the KATA manifest and the TMS; a weak cover never
  dedupes), and kept `oracle: observed` until a person confirms it. Bugs, coverage Tech Stories
  and module-context writes are drafted and filed only on a person's approval. Its DoD and
  contract are in `stage-gates.md`; `test-documentation` reads its `candidate-scenarios.md`.
- **`agentic-qa-core/references/adversarial-verification.md`**: the refute mandate, the
  own-invariant check, executing competing hypotheses, and the main-thread tie-break, shared by
  `exploratory-testing` and `sprint-testing`.

### Added (coverage inventory)
- **`project-context` mode `coverage`**: crosses the behaviours in the business maps with the
  tests (the KATA manifest at the production branch, the TMS test repository, the regression
  repository) and puts each one in exactly one bucket: `automated`, `manual-only`, `weak` or
  `uncovered`. Gaps are ordered by the Master Test Plan's risk. The `weak` verdict and the risk
  level are agent judgments with one evidence line per row; the buckets, the order and the
  run-over-run diff are computed by **`bun run context:coverage`** (`collect`, `classify`,
  `propose`), so the gap list is recomputable. Coverage Tech Stories are proposed as a dry run and
  created only after a person approves them. Files live under the primary checkout's
  `.session/project-context/coverage/`. Never part of `refresh-all`.

### Changed (evidence page: the reference design, replaced format)
- **Replaced format: `evidence-pack/1.0` -> `evidence-pack/2.0`.** The evidence page is now the
  reference implementation's page, copied (ADR-0022): the same layout, palette, fonts, viewer,
  BEFORE FIX history, compare and pills. The pack follows its format under the id `evidence-pack/2.0`
  (`tcs`, `bugs`, `env` as a build strip, `repro`, `rounds`, `currentRound`, `artifact: {url, path,
  published}`); a `1.0` pack is refused with one line. Field reference: the `evidence-artifact`
  skill, `references/pack-schema.md`.
- **The builder is `.agents/skills/evidence-artifact/scripts/build.py` (Python 3.9+ and Pillow).**
  `bun run evidence build` checks both and names the install command
  (`python3 -m pip install pillow`) when one is missing. Every safety rule of the first page is kept
  in it with a regression test, and a JPEG capture can now be redacted. The TypeScript renderer and
  image codec are gone.
- **CLI flags changed**: `build --out` is now the page FILE (default
  `<pack dir>/evidence-artifact/index.html`, a bug `.../evidence-artifact/<BUG>/index.html`, was the
  `evidence-page/` folder), `--thumb <png>` writes the bug thumbnail instead of the page, `--case`,
  `--repo`, repeated `--pack` for one review page; new `bun run evidence extract --page <html> --out
  <pack.json>` recovers a pack from a published page.
- **New skill `evidence-artifact`** (the agent workflow: capture in Stage 2, build, publish, record and
  link in Stage 3, retests on the same URL). `agentic-qa-core/references/evidence-page.md` is now a
  pointer to it.
- **Upgrade step**: install Pillow once (`python3 -m pip install pillow`); rewrite any
  `evidence-pack/1.0` pack in the new shape (`bun run evidence demo` writes two complete examples).

### Added (evidence page)
- **`bun run evidence build --pack <pack.json>`** builds one self-contained, offline HTML evidence
  page per ticket and per bug from an `evidence-pack/1.0` JSON pack (ADR-0021): verdict, build
  under test, a board of cases and bugs, annotated screenshots with marks kept as data, API calls,
  SQL results, timelines, and earlier retest rounds as BEFORE FIX history. The build refuses
  secrets, `.auth` files, HAR and traces, burns redactions into the pixels, and stops over the
  size limit. `--thumb` writes a bug thumbnail. No new dependency.
- **Publishing goes through a host seam**: by default the agent publishes the page as a private
  Claude artifact and runs `bun run evidence record --pack <pack> --url <url>` (only hosts in
  `board.evidence.allowed_hosts`); `--host local` links the file on disk instead.
  `bun run evidence demo` builds a synthetic example. Agent workflow:
  `agentic-qa-core/references/evidence-page.md`.

### Added (test outcome classes)
- **Every automated test now gets one outcome class** (`passed`, `failed`, `known-defect`,
  `unexpected-pass`, `skipped`), written by `KataReporter` to `reports/test-outcomes.json`
  (schema `test-outcomes/1.0`, ADR-0020). A test skipped by a failed `beforeAll`, serial sibling
  or setup project counts as `failed` (BLOCKED on the board: its body never ran), an expected
  failure that starts passing is an `unexpected-pass` action item, and an expected failure with
  no defect key is an action item too.
- **`knownDefect('<KEY>')`** (`tests/utils/knownDefect.ts`) marks an expected failure and its
  defect key in one call; the `@blocked:<KEY>` tag and `test.fail(true, 'Blocked by <KEY>')`
  keep working.
- **Changed: the final banner** comes from the outcome records. It reads `ALL TESTS PASSED` only
  when nothing failed, passed unexpectedly or was left not run; otherwise it names the counts
  (`PASSED WITH 2 KNOWN DEFECTS`, `EXECUTION FAILED: 4 FAILED (3 NOT OBSERVED: SETUP FAILED, ...)`).
  In GitHub Actions the same counts go to the step summary. The exit code is unchanged. A CI step
  that matched the old failure text should read the records file instead.
- **Upgrade step for existing projects** (corrected): `bun sync` now delivers
  `tests/utils/testOutcomes.ts`, `knownDefect.ts` and `xrayResults.ts` (component `tests-utils`).
  The files that carry project wiring stay yours and each gets a drift row with the hunks to
  merge: `tests/KataReporter.ts` (writes `reports/test-outcomes.json` and the run id shared with
  `atc_results.json`; without it the board never shows an automated result),
  `tests/utils/decorators.ts` (`AtcResult.playwrightTestId`, a runtime `test.skip()` recorded as
  `SKIP`) and `tests/utils/jiraSync.ts` (the Xray body built through `xrayResults.ts`, keys checked
  before authenticating). Then port `.github/workflows/regression.yml`'s `XrayImport` job (its
  blocking row lists the steps): the `*-atc-results` artifacts, `bun run xray:payload`, the Xray
  JSON import, and every `@atc` id an existing Test key before the first run.

### Added (sprint source layer)
- **`cli/lib/sprint-source/`**: the configuration layer and `Source` interface the Sprint Board,
  Merge Line and evidence modules will build on (ADR-0019). Three sources (`jira-xray`,
  `jira-native`, `none`) return one snapshot with denominators; every status goes through the
  new `board:` block of `.agents/project.yaml`, and a status no bucket lists fails the snapshot
  instead of being counted. The block derives the ticket key, environment, mainline branch,
  approvals, modality and Jira host from the keys that already own them.
- **`bun run board:check`** validates the block offline and runs inside `repo:check`; an
  unconfigured block (how the template ships) is one INFO line and exit 0. `bun sync` inserts the
  new block into existing projects through the schema diff (corrected: interactive runs offer
  it; `--auto` inserts a whole missing block since the `bun sync` fix above).
- **Upgrade step for existing projects that adopt `board.source: none`** (corrected): `bun sync`
  appends `!.context/sprint/` to the root `.gitignore`, so the default `tickets.yaml` is
  versioned with no hand edit. Only a custom `board.tickets_file` outside `.context/sprint/`
  needs its own re-include line after `.context/*`; `bun run board:check` warns while the file is
  still ignored.

### Changed (`bun sync` and `bun setup` are the command names)
- **The updater is `bun sync`**, a new `sync` script. `up` stays as a hidden alias running the
  same updater, so a project whose `package.json` only has `up` runs `bun up` (or
  `bun run up`) ONCE: the `scripts` key sync adds `sync`, and the run prints one line naming
  the new command. From then on, `bun sync`. Docs and messages no longer teach `up`.
- **The installer is taught as `bun setup`** (the script name `setup` is unchanged; Bun runs a
  package script without `run` when no built-in command shares its name). The scaffolder's
  final hints print `bun setup` when `--no-setup` skipped it, and `bun sync` for later updates.
- Entries below this one keep the names that were current when they were written.

### Fixed (skill registry)
- **`bun run skills:registry` skips skill folders git ignores**: a T3 community skill installed
  on the machine (`playwright-cli`, `resend-cli`, ...) landed in the committed
  `.agents/skills/REGISTRY.md` with skill-relative links, which `docs:check` then reported as
  dead on every push, and `skills:registry:check` differed per machine. A downstream project
  that added `scripts/build-skill-registry.ts` to `updater.protected_paths` as a workaround can
  remove that entry.

### Fixed (final sweep)
- **`bun run allure:run` runs the Playwright suite**: it ran `bun test` (the unit tests) and
  skipped `.env`. It now goes through `scripts/launch.ts` like `allure:agent` and the `test*`
  scripts, and `scripts/launch.test.ts` holds every Allure run script to that.
- **`bun run env:set` keeps an inline `# comment`** on the line it replaces (quoted or unquoted
  value); a `#` inside an unquoted value with no space before it stays part of the value.
- **`api/.gitkeep`** no longer describes files, scripts and an MCP setup that were retired: it
  points at the sync script, the setup page, the harness MCP files and the API doctrine.

### Changed (final sweep)
- **`docs:check` checks markdown `](…)` links in committed `.md` under `.agents/`, `.context/`
  and `.claude/`**, relative to the file; URLs, anchors, placeholders and code spans are skipped.
- **`AGENTS.md`**: §3 delegates to a subagent only when the work returns a lot of tool output or
  splits into independent units, and §12 does not save to Engram what the repo already records.

### Changed (`bun run up` appends upstream hook groups)
- **The `hooks` of `.claude/settings.json` only grow, like its permission lists**: an upstream hook
  command the project lacks under the same event and matcher is appended as a new group after the
  project's own, after a backup, and BEFORE the compatibility check. A project scaffolded before the
  route re-surface `PostToolUse` group (ADR-0017) no longer fails `agents:compat:check` at
  pre-commit, pre-push and CI after the sync. A command the project does not want goes in
  `updater.declined_hooks`; one whose script the project lacks is skipped and reported.
- **A key repeated by a git auto-merge is folded, not lost**: both settings merges read the file
  keeping every repeated list (`JSON.parse` keeps only the last) and report the fold.
- **A downstream compat error for a missing hook group names the fix**: run `bun run up`.

### Added (documentation contracts, ADR-0016)
- **`LINT.IfChange(label)` / `LINT.ThenChange(pages)` region markers** on the code the docs
  describe in prose (harness selection, MCP parity, the MCP `.env` loader, the Engram setup,
  the router lock). `scripts/lint-doc-contracts.ts` blocks a push or a PR that changes a marked
  region without every page it names, unless a commit carries `Docs-Checked: <label> <reason>`;
  at commit time it only warns. The structural lint (balanced markers, unique labels, targets on
  disk) runs inside `docs:check`. Maintainers only: a downstream project prints one line and is
  never blocked.
- **Edit-time `DOCS:` line**: `.agents/hooks/doc-contracts.mjs`, a `PostToolUse` hook in Claude
  Code and Codex, names the pages the moment an edit lands inside a marked region (once per
  session per label). OpenCode relies on the gate.
- **`framework-development` drift sweep (V5)**: a report-only Phase 3 step that greps the doc
  surface for prose describing the old behaviour, run only when a change touches `cli/`,
  `scripts/`, `.husky/` or the instruction files.

### Changed (documentation gates)
- `docs:check` runs on every push (it ran at commit time only when docs were staged), and the PR
  workflow (`build.yml`) runs `docs:check` and `skills:check`, which no CI job ran before.
- The `framework-development` docs follow-through triggers on behaviour changes too, not only on
  renames, and lists the decks and the Pages home.

### Changed (instruction routes the agent actually reads, ADR-0017)
- **The prompt hook routes fewer sections and says when to read them.** Fired ROUTER rows are
  ranked (an id named in a `ROUTE-SCOPE:` sentence, then path hits, then trigger hits, then the
  earliest match; anchors before companions), at most three section files get a binding
  `ROUTE: read <file> (<id>, <n> lines) before acting on this prompt` line, and the rest share one
  non-binding `ROUTE-OPTIONAL:` line. Imports never count against the cap. Absolute paths are no
  longer read as intent, and a prompt carrying an orchestrator preamble is classified on its task
  block only.
- **Claude Code re-surfaces an unread route once.** `.claude/settings.json` gains a `PostToolUse`
  group running the same emitter: the first tool call that reads none of the routed sections,
  while some are unread, gets one `ROUTE-PENDING:` line. `agents:compat:check` requires the group;
  a project updated with `bun run up` adds it by hand (the settings file is delivered once), and
  the parity report names it.
- **Worker launch prompts end with `ROUTE-SCOPE: <section ids>`** (`orca-orchestration`
  launch seam, playbook examples, brief template), and the worker contract gains rule 15: resolve
  the `ROUTE:` lines before the brief. The LOAD PROTOCOL in `AGENTS.md` names the optional and
  pending lines.
- **The router eval scores three numbers**: recall (named on any line), binding recall (kept on a
  binding line, new floor) and precision (binding lines only). `instructions:audit` also counts
  `ROUTE-PENDING:` reminders, reads after one, and `ROUTE-OPTIONAL:` lines.

### Changed (docs follow-through for the secrets and harness changes)
- **Critical Rule #1's by-name example names the MCP loader's `--filter` list** instead of the
  retired `${VAR}` placeholder (same words in the dev boilerplate).
- README, INSTALLER, CONTEXT, the `docs/core` pages, the published harnesses page and the
  progressive-disclosure and framework-development decks describe the changes below: what
  `bun run setup` asks and records, the Engram plugin offer, `env:set`, the `@sensitive` gate,
  checks scoped to the harnesses in use, the updater's permission-list merge, the instructions
  locks and `instructions:audit`. The AI-run setup example in INSTALLER carries no secret values.
- `.agents/README.md` documents the `harnesses:` list and the `secrets:` block. ADR-0015 records
  the direnv removal below.

### Removed (harness launch scripts; a harness opens bare)
- **`bun run claude|codex|opencode` are retired** (ADR-0014). They started the harness inside
  `varlock run`, which exported every `.env` value into the AI's own process. Open the harness
  directly (`claude`, `opencode`, `codex`, or the desktop app): every MCP server loads `.env`
  itself (ADR-0011). `scripts/launch.ts` now serves the test scripts only, refuses a harness
  binary, and its drift check warns and goes on (`--warn` is accepted and changes nothing).
  A stale variable exported in your own shell is reported by `bun run vars:env:check`.
  `bun run up` never re-adds the scripts and never deletes yours: a downstream one that loads
  `.env` gets one informational parity row naming it as removable.
- **Scaffolder** — the `create-agentic-qa` next steps name `claude` (or `opencode` / `codex`, or
  the desktop app) instead of `bun run claude`; takes effect on the next npm release.

### Removed (direnv; every process loads its own `.env`)
- **`.envrc` is gone and nothing recommends a shell autoloader** (ADR-0015). The installer has no
  `direnv allow` step (`INSTALL_SKIP_DIRENV` retired), the doctor no direnv check (its `--json`
  loses `direnv`), and `bun run worktree:provision` copies `.env` without running direnv. A command
  that needs a `.env` value runs inside `bunx varlock run --filter <names> --`, as the `/acli` REST
  recipes now do. A downstream `.envrc` is never touched; `bun run up` reports it once as removable.

### Added (instructions maintenance locks and `bun run instructions:audit`)
- **`instructions:check` holds three locks** (ADR-0013): the ROUTER is fingerprinted and a row
  change fails until an ADR covers it (`--accept-router ADR-NNNN`), the router eval runs on every
  call against recall and precision floors (`scripts/lib/router-eval.ts`), and a new section must
  ship complete (labelled prompts plus a row in `.agents/instructions/README.md`). Errors in the
  boilerplate, warnings in a project.
- **One edit path**: `/framework-development` mode `instructions`, with a placement doctrine
  (`references/instructions-doctrine.md`).
- **`bun run instructions:audit`** reports how often the agent read a routed section in the same
  turn, from local Claude Code transcripts (file names and counts only).

### Added (declared harnesses for one-harness projects)
- **`harnesses:` in `.agents/project.yaml`** lists the harnesses a project uses (ADR-0012). The
  compat check, `setup:doctor`, the installer and `bun run up` check only those (one `NOTE:` per
  skipped harness); absent or `null` detects them from the files present. The boilerplate itself
  always checks all three.
- **`bun run setup` records the agents you select** (union, read back after the write) and offers
  to delete the files of each harness left out (default keep). The updater stops delivering a
  dropped harness's files.

### Changed (caveman removed; Engram plugin offered)
- **Critical Rule #13 is replaced in place**: concision comes from §2 and the user-level output
  style; no communication-mode plugin is assumed or recommended. caveman leaves every skill, doc
  and deck, and the installer's closing block.
- **The installer offers the Engram Claude Code plugin** (`claude plugin install engram@engram`,
  session hooks) right after `engram setup claude-code` succeeds; skipped non-interactively.

### Changed (`vars:schema:check` fails a secret-looking key without `@sensitive`)
- **A schema key whose name reads as a secret** (TOKEN, SECRET, PASSWORD, API_KEY and the rest of
  `SECRET_NAME_PATTERNS` in `cli/lib/env-schema.ts`) must be `@sensitive`, or `vars:schema:check`
  (and so `repo:check` and the pre-commit gate) fails naming it. `varlock load --agent` redacts only
  what the schema marks.

### Added (secret manager as the advanced option)
- **Secret values stay in `.env` by default; 1Password is the first opt-in adapter** (ADR-0010).
  `bun run setup` asks where secrets live, records `secrets:` in `.agents/project.yaml` and writes
  the committed overlay `.env.provider.schema` (references only). A non-empty `.env` value still
  wins over the vault. CI passes `OP_SERVICE_ACCOUNT_TOKEN` beside the per-variable secrets.
  Non-interactive: `INSTALL_SECRETS_PROVIDER` + `INSTALL_SECRETS_VAULT`.

### Changed (`bun run up` appends upstream deny rules)
- **The `permissions.allow` and `permissions.deny` lists of `.claude/settings.json` only grow**:
  upstream entries the project lacks are appended after a backup, nothing removed or reordered. A
  deny the project does not want goes in `updater.declined_denies`. `opencode.jsonc` is never
  written: a parity row carries the deny block to paste.

### Changed (MCP servers read `.env` themselves; no plaintext copies)
- **Every MCP server that needs `.env` values starts through one filtered loader** on all three
  hosts: `bunx -p varlock@<pin> varlock run --no-redact-stdout --inject vars --filter <its vars> --
  <server>` (`MCP_ENV_LOADER_*`, ADR-0011). It reads `.env` (or the secret manager) when the host
  spawns the server, so a desktop or natively launched harness gets its values, and each server
  sees only its own. `.mcp.json` drops `${VAR}`, `opencode.jsonc` drops `{file:}`, Codex drops
  `env_vars`; context7 needs no value and launches bare. `agents:compat:check` compares the filter
  across hosts; downstream, an old-shape config is a warning naming the exact launch.
- **`bun run harness:env` retires the copies it used to generate** (the `env` block of
  `.claude/settings.local.json`, `.auth/opencode/`): equal to `.env` = deleted, different = moved
  to `.auth/harness-env-backup/` and named, still read by an old-shape config = kept.
  `bun run setup:doctor` reports what remains; `bun run setup` retires them in its last step;
  `bun run setup --variables` no longer regenerates anything. Existing machines: run
  `bun run harness:env` once, then restart the agent session.

### Changed (tests launch through varlock)
- **The `test*` scripts run `scripts/launch.ts`**: a drift notice, then `varlock run -- <bin>`.
  varlock lets a variable inherited from the shell win over `.env` (no flag inverts it), so the
  launcher asks varlock which schema items the shell overrides and warns when one differs from
  `.env.local` over `.env`, naming the variables with their lengths only, then the run goes on, so
  a deliberate `AUTO_SYNC=true bun run test` keeps working. `dotenv-cli` is retired. (The harness
  launch scripts this entry first added are retired, entry above.)
- **Codex MCP servers start through `bunx -p varlock@<pin> varlock run --no-redact-stdout --`**
  (`.codex/config.toml`). `--no-redact-stdout` keeps the JSON-RPC stream byte-intact. Since
  narrowed to one filtered loader per server on every host (entry above).
- **`vars:env:check` Rule 3 uses the same comparison** (`cli/lib/env-drift.ts`) and runs with
  `bun --no-env-file`, so its own process holds only what it inherited.
- **Quote a `.env` value that contains `#`**: varlock cuts an unquoted value at the first `#`.

### Added (`bun run env:set`)
- **`bun run env:set KEY=value` is the only sanctioned way for the AI to write `.env`**: it refuses
  every key the varlock schema marks `@sensitive`, does not declare, or whose name reads as a secret,
  and a key whose value lives elsewhere (`ATLASSIAN_URL`); it upserts in place and prints names only.
  Critical Rule #1 and `agentic-qa-core/references/secret-hygiene.md` name it.

### Changed (credentials by name, never by value)
- **Critical Rule #1 is `CREDENTIALS = BY NAME, NEVER BY VALUE`.** The AI references a secret only
  through its variable name and never opens `.env*` (except `.env.example` and the two schemas),
  `.auth/**` or `.claude/settings.local.json`, nor runs `printenv`, `env`, `echo $SECRET`, `set -x`
  or `curl -v`. Presence is checked with `bunx varlock load --agent` (redacted). Secrets are typed by
  the human; the AI may write a non-sensitive value (URL, project key, flag, port) when asked.
- **Deny rules back it on two hosts**: `.claude/settings.json` `permissions.deny` and
  `opencode.jsonc` `permission.read` / `permission.bash`. `source .auth/tokens.env` in the same call
  as curl keeps working. Canon: `agentic-qa-core/references/secret-hygiene.md`; the xray-cli,
  jira-administration, db-testing and adaptation runbooks no longer grep or source `.env`.

### Changed (instruction sections get readable `agent-` names)
- **Every file in `.agents/instructions/` but `README.md` is named `agent-<topic>.md`, with no
  number**: `80-git.md` is `agent-git.md`, `project.md` is `agent-project.md`, the stub is
  `agent-project.md.template`. Frontmatter `id`s are unchanged, so `ROUTE:` lines keep their tags;
  the ROUTER's row order is the reading order. `instructions:check` fails a file without the prefix
  and an `id` that is not the file stem without `agent-`. The L0 rule pointer `→ 01` is now
  `Full: agent-critical-rules.md#<n>`.
- **`bun run up` migrates a project on the numbered names**: the numbered copies are retired through
  `deprecatedFiles`, each saved to `.backups/` first (a merge kept with `updater.protected_paths`
  survives there); a `project.md` with no `agent-project.md` beside it is moved byte for byte, never
  regenerated from the stub; with both present nothing moves and a parity row asks for the merge.

### Changed (`.context/` becomes a cache, BREAKING for discovery readers)
- **`.context/` holds only script caches plus the few files this repo owns.** `.context/*` is
  ignored by default and re-includes `README.md`, `project-config.md`, `ADR/`,
  `regression-history/`, `reports/README.md` and the PBI ladder (`README.md`, `templates/`,
  `epics/*/test-specs/`); `.gitignore` owns the list. AI synthesis lives in a context skill.
- **Discovery writes maps, not markdown files.** `project-discovery` Phase 1 generates the domain
  map inside the new `business-domain-context` (overview, business model, one `term-<slug>`
  section per domain term) and Phases 2-3 generate the infra map inside the new `infra-context`
  (architecture, NFRs, backend, frontend, environments, CI/CD). Both use the business-map
  anatomy and read path (`bun run context:map <slug>`), and `bun run up` delivers them once as
  placeholders. `BUSINESS_CONTEXT_SKILLS` becomes `CONTEXT_MAP_SKILLS` (`cli/lib/context-maps.ts`),
  each entry naming its generator and its legacy inputs.
- `business-e2e-context` absorbs the personas, user journeys and functional specs that used to
  live in `.context/PRD/` and `.context/SRS/`.
- Retired outputs, no replacement file: `PRD/executive-summary.md`, `risk-assessment.md` (high
  risks seed the Master Test Plan in Jira) and `PBI/ACCESS.md` (Phase 4 is a backlog connection
  check, `bun run jira:check`, that writes no file).
- Every reader of a moved output (`sprint-testing`, `test-documentation`,
  `test-framework-adaptation`, the ADR doctrine, the docs) now loads the matching context skill.
  `test-framework-adaptation` gates on the domain and infra maps plus `.context/project-config.md`.
- Legacy `business/`, `PRD/`, `SRS/`, `infrastructure/` files in a project stay tracked (an
  ignore rule never untracks) and are read as generator input; nothing upstream deletes them,
  and `bun run up` / `bun run setup:doctor` name them in an informational line.

### Added (business context maps)
- **The business maps move into context skills, as HTML.** `business-data-context`,
  `business-api-context` and `business-e2e-context` each hold their map at
  `references/<map>.html`: one `<section>` per entity, endpoint group or journey, each with a
  stable id, `data-sources` and `data-updated`. Humans open it in a browser or in `bun run docs`
  (folder "Mapas de contexto", served in place); the AI reads it with the new
  `bun run context:map <slug> [--section <id>] [--list]`, which strips SVG and styles. Doctrine:
  `agentic-qa-core/references/business-context-maps.md`.
- `project-context` modes `data` / `api` / `e2e` write those maps; a second run regenerates
  only the stale sections. Mode `features` becomes `e2e` (journeys first, feature catalog as a
  section); `features` stays a synonym. An old `.context/business/*-map.md` is kept and read
  as input, never deleted.
- A context skill may write its own `references/` and nothing else (`metadata.writes`, lint
  `CONTEXT-WRITES`): when a session contradicts one section, it proposes the edit and applies it
  on approval.
- `diagram-design` is installed at project level (capability `diagrams`, point-of-use STOP).
  Style is its own `.diagram-design` marker at the repo root.
- `bun run up` delivers each business context skill ONCE when its folder is absent and never
  touches it afterwards; a placeholder or missing map (and an old markdown map beside it) is an
  informational row, and `bun run setup:doctor` prints the same line.

### Removed (updater 8.5, BREAKING)
- **`sync-ai-context` is retired.** Nothing triggered it, and its checks were either
  mechanical or judgment. The mechanical half is now `docs:check` (`scripts/lint-docs.ts`):
  a committed repo skill missing from the `AGENTS.md` section 5 router fails by name
  (`roster`; project-local `<aspect>-context` skills exempt), and so does a `bun run <name>`
  quoted in `AGENTS.md` or the doc surface that `package.json` does not declare (`script`;
  placeholders and file runs ignored). Human pages are deliberately not checked for a skill
  list: they point to `REGISTRY.md` (Critical Rule #17). The judgment half is two closing
  steps: the docs follow-through of `framework-development` in the boilerplate, and
  `test-framework-adaptation` Phase 9.3 for a project's own docs (never `docs/core/`). The
  trigger phrases "sync AI context" / "sync AI memory" route to `framework-development`.
  `bun run up` removes the skill downstream through `deprecatedFiles`.
- **Command aliases retired in one release.** The alias manifest
  (`.agents/compatibility/command-aliases.json`) and every generated wrapper under
  `.claude/commands/` and `.opencode/commands/` are gone, and so are the updater's
  `commands` component, the `Commands` row of the parity table, the wrapper checks of
  `agents:compat:check` and the wrapper line of `setup:doctor`. A skill is invoked by its
  name plus a mode on every harness: `/project-context data` on Claude Code, "load
  `project-context`, mode `data`" on OpenCode and Codex. OpenCode users lose the slash
  shortcuts and invoke in prose. `bun run up` removes the retired files downstream through
  `deprecatedFiles` (no backup: they carried no workflow). A consumer lock that still holds
  the `commands` cursor is ignored, never an abort.
- **The project alias overlay is inert.** `.agents/compatibility/command-aliases.project.json`
  is no longer read or delivered; the updater names it once in an informational row, and
  the command files a project declared there stay as plain harness commands it edits by hand.

### Added
- **A command that shadows a skill is refused.** A project command whose name equals a repo
  skill would replace the skill's instructions with its own body, so `agents:compat:check`
  fails on it and `bun run agents:compat` (also run by `bun run up` and `bun run setup`)
  moves it to `.backups/shadowing-commands/<same path>`. The updater reports each move as
  an informational row.
- **First token of `$ARGUMENTS` is the mode.** `project-context`, `jira-administration`,
  `test-automation`, `test-documentation` and `sprint-testing` state it in their Compact
  Rules: a first token that matches a mode IS the mode and the rest is forwarded;
  otherwise the skill asks (or applies its declared default).
- **Context skills layer + `iql-context`.** A `metadata.kind: context` skill holds judgment
  over ONE aspect and cites `.context/` facts without restating them. Upstream ships exactly
  one, `iql-context` (`.agents/skills/iql-context/`): the methodology index (eight named
  stages, the artifact ladder incl. RTP / RTR, the invariants, the agentic contract) with a
  citation per row to `agentic-qa-core/references/*` and to the official site; web-only
  structure (phases, the fifteen steps, the internal cycles, the eight approaches, light
  mode, roles and guardrails, method metrics) lives in its `references/`. Two adaptation
  seams: `qa.methodology` in `.agents/project.yaml` (values; schema-diffed, insert-only on
  `bun run up`) and the bootstrap-only `references/project-overrides.md` (prose, delivered
  once, never overwritten). The web-vs-repo disagreements are listed in the implementation
  report and in the skill's `references/gotchas.md`, not resolved.
- **Updater guard for project-local context skills.** Any `.agents/skills/<slug>-context/`
  other than the ones upstream owns (`iql-context`, plus the grandfathered workflow slugs
  `project-context`, `sync-ai-context`) is never delivered, overwritten or deleted by
  `bun run up`, even if upstream ships a same-slug example (`isProjectLocalSkillPath`,
  `cli/lib/updater-core.ts`; a test keeps the set in step with the lint's
  `KIND_SUFFIX_EXEMPT`).
- **`skill-creator` promoted to T3** (`PROJECT_LEVEL_SKILLS` in `cli/install.ts`,
  gitignored under `.agents/skills/`): it is always the builder when this repo scaffolds a
  skill (`/framework-development`, `project-context` mode `context-skill`).

### Changed
- **`adapt-framework` is now `test-framework-adaptation`** (updater 8.5). Same one-mode
  workflow; the description keeps the old trigger phrases ("adapt framework", "wire
  fixtures"). `bun run up` removes the old folder downstream through `deprecatedFiles`, and
  `cleanupDeprecated` now also removes the folders it empties (a skill folder with no
  `SKILL.md` fails `skills:check`); a deprecated file no longer reaches the delete prompt or
  holds `--auto` back. The plan report is `.context/reports/test-framework-adaptation-plan.md`;
  Phase 0 still resumes one written under the old name. The workflow now covers the local-only
  MCP rule and harness-level recommendations, the third harness file, `harness:env` plus a
  session restart, the varlock env schema, the config split, the five env-list sources, an
  idempotency signal that ignores legitimate `null`s, the `authenticate` hook, dual-mode
  reporting secrets, `git_strategy:` as the home of the branching strategy, and the
  updater-owned `docs/core/`.
- **Web search resolves Exa first, Tavily second.** `[WEB_SEARCH_TOOL]` (AGENTS.md §6),
  `mcp-capabilities.md` and the preflight gate name the Exa suffixes (`web_search_exa`,
  `web_fetch_exa`) ahead of Tavily's; `cli/lib/harness-level-mcps.ts` lists `exa` first
  (never committed, so it carries no former `.env` key and never triggers the migration
  parity note).
- **STALE-PATH now covers `.context/`, kind-scoped** (`scripts/lint-skills.ts`): inside a
  `metadata.kind: context` skill every `.context/` cite must exist (only the gitignored
  `.context/PBI/` mirror is exempt); in every other skill the generator outputs
  (`CONTEXT_GENERATED_PREFIXES`, named by generator) are exempt in both directions because
  they do not exist in the boilerplate checkout. Deviation from the literal deck wording
  (D7-B "add `.context/` for every skill"), approved by the conductor after measuring that
  the literal rule would have failed dozens of legitimate citations.
- `project-discovery` PROPOSES the context skills a fresh repo could carry at its close
  (one line per aspect, never a file); `project-context` mode `context-skill` CREATES them
  through `skill-creator`; the map-regenerating modes (`data`, `features`, `api`,
  `test-plan`) offer, when done, to run `context-skill` in UPDATE for the skill over that
  map. The Skill Resolver injects into a briefing only the context skills whose aspect the
  dispatch touches (`skill-resolver.md`).
- The re-crawl of upexgalaxy.com/metodologia (2026-09-24) expanded the eight approach tabs
  and every collapsed accordion the first capture missed; the raw scrape is session
  material under `.session/spikes/iql-web/`, not committed.

### Changed
- `docs/` is now a human HTML site. `bun run docs` serves it locally (portal with a
  sidebar built from each page's `<title>` and meta description, search, deep links,
  dark and light themes); `bun run onboarding` opens the same site on its "Empezar aquí"
  page; `bun run docs:build` writes the generated `docs/manifest.json` for static
  hosting. The surviving Markdown became Spanish pages under `docs/core/`: Empezar aquí
  (from `onboarding.html`), Setup (Jira + Xray, DBHub, OpenAPI), Metodología (the IQL
  overview, the three phases and Observation from the official upexgalaxy.com site, plus
  "Este repo y el IQL" from `agentic-quality-engineering.md`), Exploración (Postman, SQL
  cookbook) and Personalidad (from `ai-personality.md`). No Markdown remains under
  `docs/` except its README. `bun run up` now syncs only `docs/core/`, `docs/assets/`,
  `docs/index.html`, `docs/README.md` and `docs/.gitignore`: any other folder under
  `docs/` belongs to the project and is never written. `docs:check` also requires a
  `<title>` and a meta description on every page (error in `docs/core/`, warning
  elsewhere).
- KATA spelling rule narrowed (owner decision, 2026-09-14): the K lives **only** in the
  expansion "Komponent Action Test Architecture". Everywhere else the word is spelled
  normally: the third layer is "domain Components", and the legacy doc says
  "Component Strategy" again. Touches `kata-architecture.md`, `kata-invariants.md`,
  `agentic-quality-engineering.md` and `kata-fundamentals.md`. Earlier entries below that
  quote "domain Komponents" describe the state at that time and are left as written.

### Recorded (Boilerplate — Ola F doctrine debts and the eval runner, 2026-09-15)
Folded in from the former `docs/reports/2026-09-15-ola-f-doctrina.md` worker report, which
was removed with the docs relaunch.
- Automation stage: the separate verifier (`/pr-review-lead` or `/judgment-day`, clean
  context) is REQUIRED, not opt-in, in `test-automation/SKILL.md` and in the Automation DoD
  of `stage-gates.md`.
- FLAKY carries two numbers, both correct: floor = 5 runs of history before the word is
  allowed (below it: INSUFFICIENT HISTORY), window = the last N = min(10, available) runs
  the failure rate is computed over. `regression-testing/SKILL.md` was the stale copy.
- `stage-gates.md` contract table gained its Sprint close row (autonomy 2, no separate
  verifier), derived from that stage's own DoD.
- `defect-management-doctrine.md` Part 8: the Bug/Defect anti-patterns now name the real
  error (classifying by when or where it was found, not by the feature's lifecycle stage).
- `kata-academy`: two broken `sourcePath`s fixed (`tests/components/api/ApiBase.ts`,
  `tests/components/ui/UiBase.ts`).
- `scripts/run-skill-evals.ts` (`bun run skills:evals`, also in `build.yml`) validates the
  STRUCTURE of every `evals/evals.json` (three shapes normalised). Still open: it does not
  invoke a model, so it does not prove a skill actually activates for its prompts; that
  needs a real model call and a grader (`claude plugin eval` format) plus an API key in CI.

## [Unreleased]

### Changed (Boilerplate — doctrine: named stages and the agentic contract)

Documentation only. No behaviour change in tests, CLI, scripts or the installer.

- **`stage-gates.md` gained the agentic contract per stage.** Alongside the
  existing Definition-of-Done checklists (untouched, word for word) every stage
  now declares what the agent does, what the person signs, what evidence must
  survive, its autonomy level on a CSA 0-5 scale, and whether a separate
  verifier is required. The ceiling is 3 and never 5, which is the written form
  of "skills do not run end-to-end autonomously". The feedforward (skills,
  specs, briefing) / feedback (gates, linters, suites, verifier) pair is
  declared with it.
- **Stages are named by word, not by number.** The number collided in two
  directions: the old "Stage 4" hosted IQL steps 4 *and* 5, and "Stage 1"
  already meant a TMLC etapa in the legacy prose under `docs/methodology/`. The
  historical numbering now survives in exactly one place, the mapping table at
  the top of `stage-gates.md`, so anything still citing `§Stage N` resolves
  through it.
- **New stage: Observation.** Declared as production-altitude, capability L4,
  **no skill** — its operating unit is an agentic routine that this repo does not
  ship. It deliberately carries no DoD checklist: an empty checklist reads as an
  implemented gate.
- **Execution profiles.** `docs/agentic-quality-engineering.md` now states that
  the method is agnostic to its executor: `manual` and `agentic` run the same
  stages, gates, artefacts and evidence bar. The agentic profile buys speed on
  the mechanical half and nothing on the deciding half.
- **One KATA formula, everywhere.** "four-layer" is replaced by the canonical
  sentence — *four layers with a single direction of dependency (TestContext,
  Base, domain Komponents, Fixtures), Steps as an optional intermediate layer,
  test files as consumers and never a layer* — in
  `test-automation/references/kata-architecture.md`,
  `framework-development/references/kata-invariants.md` and
  `docs/agentic-quality-engineering.md`, whose diagram gained the Steps box and
  the DRY zones. The `@atc` id is unified to `@atc('PROJ-101')`, the form the
  manifest and the code actually use.
- **`kata-invariants.md` describes the repo that exists.** It no longer claims a
  lint that rejects relative imports across `tests/**` (the only
  `no-restricted-imports` block is scoped to `cli/**`, and there is no
  `eslint-plugin-import`), and its alias list is now the one in
  `tsconfig.json` — `@config/*` and `@components/*` never existed there. No lint
  rule was added; the doc was corrected to match.
- **`agentic-qa-core/SKILL.md` stops under-declaring itself.** The references
  table lists all **18** files on disk (seven were invisible, including
  `session-management.md`, `traceability-linking.md` and
  `defect-management-doctrine.md`) and the deck table all **3**.
- **`docs/agentic-quality-engineering.md` enumerates `stage-gates.md`** among the
  orchestration doctrine surfaces. The document that `docs/README.md` calls the
  flagship was describing the checkpoints without naming the layer that enforces
  them.
- **`playwright-cli` is no longer listed as a skill of this repo.** It is a
  community skill installed at project level by `cli/install.ts` and not
  committed; the doc's own universal claim that every skill lives under
  `.agents/skills/<name>/SKILL.md` was falsified by its own roster.
- **`docs/methodology/` and `docs/workflows/` are marked LEGACY.** Nothing was
  deleted. Each file carries a banner at its head: TAUS era, not a source of
  truth, the live layer is `.agents/skills/**` plus the `.agents/jira-*`
  catalogs, KATA replaced TAUS, TDC is retired, and the Jira states named inside
  may not exist. `kata-fundamentals.md` additionally warns that its pytest
  samples are not this repo's runtime (TypeScript + Playwright + Bun;
  `conftest.py` and `pytest.ini` do not exist) and its "Component Strategy" is
  corrected to "Komponent Strategy". `IQL-methodology.md` step 7 stops saying
  "TAUS". `AGENTS.md` §11 stops routing to `docs/workflows/git-flow.md` as a live
  detail — it mandates a `staging` branch that does not exist on `origin`.
- **`docs/qa-standard/` self-contradictions closed.** The planning ladder is
  titled a ratified Standard instead of a Proposal (filename kept: it is cited by
  path; both files have since moved: the ladder to
  `.agents/skills/agentic-qa-core/references/planning-ladder.md`, the backlog to
  `.context/ADR/ADR-0004-naming-decisions.md`). `naming-gaps-backlog.md` rows 4, 8, 9 and 10 now print the conventions
  its own ratification deltas chose, not the ones they rejected.
- **`REGISTRY.md` regenerated** so the per-session compact-rules cache is not
  served from a two-week-old timestamp.

### Fixed (updater 8.4)

`CLI_VERSION` 8.3 -> 8.4, ported from the dev boilerplate. Five polish items.

- **The `cli` lock cursor also advances after a self-update from a pre-8.1
  parent.** A 7.x parent predates `UPEX_UPDATER_SELF_UPDATED` and re-execs the
  child on `UPEX_UPDATER_REEXEC=1` alone, so the env-signal fast path never
  fires. The re-exec child now detects the same fact independently: when
  `cli/` is byte-identical to the fetched upstream and the lock's prior
  cursor for the component is not already at that sha, the component settles
  there anyway, same as the env signal.
- **A heading changed only by punctuation is not a heading change.** The
  markdown evidence normalizes an em dash, an en dash, a spaced hyphen and a
  colon to one canonical separator before comparing headings (`## A - B` and
  `## A: B` now compare equal). Case-sensitive otherwise. Hunk counts still
  come from the real diff, untouched.
- **The skills registry regenerates after everything else, including a
  restored overwrite.** `bun run skills:registry` now reruns as the very last
  afterApply hook, after the parity report; an overwritten-edit row for a
  path under `.agents/skills/` now ends with `after restoring, run bun run
  skills:registry`, so `skills:registry:check` does not go red the moment the
  project restores its own edit from the backup. The KATA manifest hook
  keeps its own place ahead of the gates: `kata:manifest:check` still judges
  the manifest the run just rebuilt.
- **First-run noise for a watched file no upstream ever touched.** A watched
  path with no marker yet (a migrated repo, or one running the per-file
  marker tracking for the first time) whose upstream copy has not changed
  since the project's own lock cursor seeds its marker silently instead of
  firing a row: the same treatment `updater.protected_paths` first advice
  already got in 8.3, now for any watched path when the cursor proves nothing
  moved. An unknown cursor (no lock yet) keeps today's first advice.
- **The closing box names why gates did not run.** `Gates:` used to be
  omitted entirely on a no-op run (nothing applied) or with `--no-gates`,
  reading as "nothing to say"; it now prints `omitidas (sin cambios)` or
  `omitidas (--no-gates)`.

### Fixed (updater 8.3, ported from the dev boilerplate)

`CLI_VERSION` 8.2 -> 8.3. The dev boilerplate's 8.3 lands here: two items that
were born in this repo's 8.2 port and went back upstream (the write-surface
guard, the added-upstream rule for local edits), plus four polish items from
the live runs on bunkai-qa-engineering and upex-bunkai-tms.

- **The dirty-tree guard blocks only on what the sync writes.** Uncommitted
  work inside the write surface (a synced component file, an ignore file,
  `package.json`, a deprecated file) still aborts `--auto` and names the
  paths; dirt anywhere else (`tests/`, KATA code, a protected or bootstrap-only
  file, generated surfaces) is listed as `N ruta(s) con cambios sin commitear
  fuera de lo que este updater escribe; no bloquean` and never blocks. The
  last-apply hash and the updater-owned exemptions are unchanged. Same
  `isWithinWriteSurface` as upstream now; the 8.2 port had its own copy.
- **No "project edit overwritten" row for a path upstream added after the
  lock cursor.** A file with no base copy at the cursor (`status A`, no
  `templateOldSha`) cannot be told apart from one that arrived another way;
  a migrated Claude-era repo had every moved skill in that state and got one
  false row each. Unknown is never reported as an edit.
- **`.context/PBI/` migration is one parity row.** A repo that still tracks
  the Jira cache in git gets one Componentes row (`N tracked path(s) still in
  git ...; migration recipe saved to .agents/prompts/pbi-cache-migration.md`)
  and the full recipe in that file; the terminal no longer receives the path
  list (370 lines on one live run, next to eight parity rows). The 8.2 file
  name `pbi-cache-migration-prompt.md` is removed when the recipe is written.
  `--dry-run` shows the row without writing the file. The QA allowlist
  (`README.md`, `templates/**`, `epics/*/test-specs/**`) is unchanged.
- **A freshly protected path gets no residual row.** A path just declared in
  `updater.protected_paths` (any project-declared entry with no marker yet)
  has its upstream marker seeded silently, with a one-line note; the drift
  row fires on the next upstream change. Before, the first dry-run and the
  first real run after declaring it both showed a `content differs` row that
  only went away once a real run had persisted the marker.
- **The `cli` lock cursor advances after a self-update.** The re-exec child
  found `cli/` identical to upstream (its parent had just written it), walked
  no entry for the component and never moved its cursor, so the lock kept
  `cli@<scaffold sha>` release after release. The parent now hands the sha it
  refreshed `cli/` to through `UPEX_UPDATER_SELF_UPDATED` and the child
  settles the component at it (only when it equals the HEAD the child
  fetched; otherwise the files differ again and sync as usual).
- **MCP registries are compared per server.** `.mcp.json`, `opencode.jsonc`
  and `.codex/config.toml` rows no longer say `same keys and values` when a
  server's args, env, url or command differ: a nested server object is
  compared whole and the evidence names it (`context7: args differ`,
  `supabase: env keys differ`), at most three servers named, the rest
  counted.

### Added

**Boilerplate (updater 8.2, cross-harness compatibility)**

- **Project-aware MCP parity.** The canonical server set is whatever
  `.mcp.json` declares; `opencode.jsonc` and `.codex/config.toml` must declare
  exactly that set, and every declared server must agree across hosts on the
  `.env` variables it depends on and on its literal env settings. A server
  missing from a host, or present in one host only, fails naming the server
  and the host. The six ids the boilerplate ships (`KNOWN_MCP_IDS`) keep a
  strict per-host shape check whenever the project declares them; any other
  server gets the generic check only, so a downstream project may add or drop
  servers freely. `declaredMcpIds(root)` exposes the set; `setup:doctor` and
  the "MCP parity (N servers x 3 harnesses)" row derive N from it.
- **Command-alias overlay.** `.agents/compatibility/command-aliases.project.json`
  (same schema as the upstream manifest, optional, never synced) adds or
  overrides aliases by name; `wrapperHosts` always come from upstream. A
  wrapper file under `.claude/commands/` or `.opencode/commands/` that no
  manifest produced is reported by name (`Command wrapper not declared in any
  manifest: <path>`) and never deleted by the repair.
- **`repairAgentSurfaces`.** One call renders the wrappers, repairs the alias
  and runs the check; `{ deferSkillsAlias: true }` writes the
  `.template/upstream-sha/claude-skills-alias.deferred` marker so the check
  reports the alias as `deferred` (not missing) until the migration commit,
  and the next `bun run agents:compat` creates it and removes the marker.
- **Grouped compat report.** `bun run agents:compat:check` and `setup:doctor`
  always print the alias status line (created / OK / deferred / missing /
  invalid) and bucket errors per surface (instructions, alias, wrappers,
  hooks, MCP). Doctor `--json` gains `agent_compatibility.alias` and
  `agent_compatibility.errors_by_surface`.
- **`scripts/lint-skills.test.ts`.** Regression tests for the tier
  classification below, run against fixture repos through the new
  `LINT_SKILLS_ROOT` override.

### Changed

**Boilerplate**

- `opencode.jsonc` parsing strips trailing commas as well as comments (what
  Prettier writes), and a `${VAR}` placeholder inside a Codex
  `[mcp_servers.X.env]` table is rejected with the fix (`Forward the variable
  through env_vars instead`).
- The doctor's "Command wrappers (N Claude + N OpenCode)" row derives N from
  the merged manifest instead of the literal 10; `command_wrappers.ok` means
  "every declared wrapper is present on both hosts".
- Docs (`README.md`, `INSTALLER.md`, `AGENTS.md`, `CONTEXT.md`, `docs/mcp/`)
  describe the MCP contract as project-declared instead of "the same six
  servers", document the overlay, and describe updater 8.2 (parity prompt,
  `--strict`, `--no-gates`, `--dry-run` with the new updater, safe re-runs,
  protected watchlist, `updater.protected_paths`).

### Fixed

**Boilerplate (`scripts/lint-skills.ts`)**

- A community skill committed as a real directory in `.agents/skills/`
  (downstream projects commit their `bunx skills add` output) is no longer
  reclassified as T1: `cli/install.ts` stays the tier authority, the T1-only
  checks (frontmatter, categories, STALE-PATH, session contract) skip the
  vendor body, and the summary line counts it separately (`N T1 skills (+ M
  community skills committed in the store, tiers from cli/install.ts)`). The
  AGENTS.md §5 cross-check still applies to it, so a committed community skill
  missing from the registry is a TIER-MISMATCH instead of a silent T1 exemption.

**Scaffolder (`create-agentic-qa` 1.1.2)**

- `rewriteProjectYaml` patched a field named `name`, but `.agents/project.yaml`
  declares `project_name` — so **every scaffold since the CLI shipped left
  `project_name: null`** while the CLI logged `Wrote .agents/project.yaml
  (name=<project>)`. `--project-key` was unaffected, since `project_key` is the
  field's real name. The field name is fixed, and a field that cannot be matched
  is now reported as a warning instead of silently reported as written.

**Installer (`cli/install.ts`)**

- The "no agents detected" hard exit now runs before the `NON_INTERACTIVE`
  guard in `promptAgentSelection`. It is a validation, not a prompt — behind the
  guard, an unattended install proceeded with zero agents and configured
  nothing.

### Fixed (earlier in this cycle)

Cross-platform defects across the whole bootstrap path, found by an audit of
the scaffolder, the installer, and the prerequisite docs. Windows PowerShell and
cmd are now supported directly; WSL and Git Bash still work but are no longer
required.

**Scaffolder (`create-agentic-qa` 1.1.1)**

- `tar` extraction failed on Windows PowerShell and cmd with
  `tar: Option --force-local is not supported`. That flag is GNU-only, but
  Windows 10 1803+ and Windows 11 resolve `tar` to the bsdtar at
  `C:\Windows\System32\tar.exe`, which rejects it. The flag is gone entirely:
  tar now runs with `cwd` at the tarball and takes a bare relative filename, so
  GNU tar's `host:path` heuristic (which only applies to the `-f` argument)
  never triggers and both flavours accept the same argv. Regression-tested in
  `tests/smoke.test.ts`.
- `bun` could not be launched at all on Windows when installed via
  `npm i -g bun`, which writes a `bun.cmd` shim and no `bun.exe`. `where` honours
  PATHEXT so the preflight passed green, but libuv only appends `.com`/`.exe`,
  so the spawn failed with ENOENT. All three bun spawns now pass `shell` on
  win32.
- A spawn that never launched was misread as a failed exit code, because
  `spawnSync` reports it as `status: null` and `null !== 0` is true. That routed
  launch failures into the destructive "corrupted node_modules" recovery path,
  wiping a populated `node_modules` in `--here` mode. Both `runBunInstall` and
  `runBunSetup` now check `res.error` first.
- `bun install` failures aborted the run with no recovery path. The scaffolder
  now wipes `node_modules` and retries once with `--force` (Bun's own documented
  remedy), and on a second failure prints recovery steps plus the WSL `/mnt/c`
  caveat.
- `git init -b main` requires git >= 2.28, which is newer than Ubuntu 20.04
  (2.25), Debian 10 (2.20) and Catalina's Command Line Tools (2.24). On those,
  git exited non-zero and the rollback deleted the entire freshly scaffolded
  project over a branch-naming flag. Replaced with `git init` followed by
  `git symbolic-ref HEAD refs/heads/main`, which every git version accepts.
- The doctor's `node >= 18` check read `process.versions.node`, which Bun
  emulates, so it reported OK on machines with no Node installed while the
  inspect view (driven by `installer-manifest.json`) correctly said MISSING. It
  now probes the real binary.
- Failure hints were Unix-only. `curl -fsSL … | bash` is unusable in PowerShell,
  where `curl` aliases `Invoke-WebRequest` and there is no `bash`; the obvious
  workaround (`npm i -g bun`) led straight into the shim bug above. The hint is
  now platform-aware and points Windows users at the PowerShell installer.

**Boilerplate**

- `cli/doctor.ts` looked for Playwright browsers only at
  `~/.cache/ms-playwright`, the Linux path. On macOS (`~/Library/Caches/`) and
  Windows (`~/AppData/Local/`) it reported them missing forever, pushing a
  `pw:install` pending action and exiting 1 on every run. `cli/install.ts`
  already handled all three layouts; the two now share
  `cli/lib/playwright-cache.ts` so they cannot drift again.
- `cli/install.ts` Step 12.4 (acli auth) was the only Phase-5 step without the
  `AUTO_NON_INTERACTIVE` guard. Git Bash reports `process.stdin.isTTY === false`
  because MSYS ptys are named pipes, so the credential prompts were skipped and
  the step then hard-exited 1 — on every re-run, permanently. It now skips like
  every sibling step, and its three `process.exit(1)` calls are warnings, so
  Steps 13 and 14 still write their Jira catalog placeholders.
- `cli/install.ts` printed a POSIX-only manual `acli` login command at each
  failure site. Pasted into PowerShell, `$ATLASSIAN_URL` expands as an undefined
  PowerShell variable, silently authenticating with an empty site and token. The
  instruction is now platform-aware.
- `cli/doctor.ts` `detectDirenv()` scanned only POSIX rc files while
  `shellHookLine()` told Windows users to edit `$PROFILE`, so `hook_in_rc` could
  never become true on native Windows and the report stayed `needs-action`
  forever. Both PowerShell profile paths and fish's config are now candidates.

### Changed

- **Boilerplate** — `bun run claude` and `bun run opencode` no longer shell out
  to `bash -c 'set -a; . ./.env; set +a; exec <bin> "$@"' --`, which cannot run
  in PowerShell or cmd (Bun executes package.json scripts through Bun Shell,
  which has no `bash`, `set` or `source`). They now use `dotenv -e .env -- <bin>`
  via the `dotenv-cli` devDependency — which `README.md`, `INSTALLER.md` and
  `cli/doctor.ts`'s `deps_installed` probe already described as the mechanism.
  Argument forwarding is unchanged.
- **Boilerplate** — `README.md`, `INSTALLER.md` and the scaffolder's README now
  document the real Windows story (PowerShell and cmd supported, bsdtar ships
  with the OS, install Bun via the PowerShell one-liner rather than npm) and the
  WSL `/mnt/c` caveat that makes `bun install` fail with
  `could not open bin metadata file`.

### Added

- **Boilerplate** — `cli/lib/playwright-cache.ts`, the single source of truth
  for the per-OS Playwright browser cache location. Node built-ins only, so
  `cli/doctor.ts --preflight` keeps running before `bun install`.
- **Boilerplate** — this changelog, and a release runbook for the scaffolder in
  `packages/create-agentic-qa/README.md`.

### Removed

- **Boilerplate** — the `env` npm script (`set -a; source .env; set +a`). It
  failed outright in PowerShell and cmd, and was a no-op everywhere else:
  `bun run env` exports into a child subshell that exits immediately, leaving
  the caller's environment untouched. `README.md` documents the inline bash/zsh
  form and its PowerShell equivalent instead.
