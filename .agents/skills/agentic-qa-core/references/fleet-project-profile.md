# Fleet project profile: what this repo fills into `/agent-orchestration`

> Loaded by a conductor of this repo right after `/agent-orchestration`, and by whoever edits a
> fleet rule here. The user skill is generic and leaves named slots to the project: the profile
> keys, the routing line, the session-naming hook, the commit trailers, the conductor-only
> operations, the decision record, the "Project rules" block of `COMMON.md`, the routine recipes.
> This file fills each slot for this repo. The launch file and its gated lines are
> `fleet-launch-seam.md`; worktree provisioning is `fleet-provisioning.md`.

---

## 1 · The profile: the `orchestration:` block of `.agents/project.yaml`

The skill reads these keys by path. Variable syntax and each key's meaning: `.agents/README.md`
§"`orchestration`"; the schema: `.agents/project.schema.yaml`.

| Key | Variable | How the conductor applies it |
|---|---|---|
| `orchestrator_cli`, `orchestrator_name` | `{{ORCHESTRATOR_CLI}}`, `{{ORCHESTRATOR_NAME}}` | the binary the gate probes (`orca`, or `orca-ide` on Linux outside an Orca terminal) and the name the owner reads |
| `max_workers` | `{{MAX_WORKERS}}` | the worker cap per round: one concurrency group in flight at once |
| `default_agent`, `default_model`, `default_effort` | `{{DEFAULT_AGENT}}`, `{{DEFAULT_MODEL}}`, `{{DEFAULT_EFFORT}}` | the worker tier: `worker-start --agent --model --effort` on the supervised path, the `launch.txt` line on the pasted one. A full model id, never an alias (G29) |
| `conductor_model`, `conductor_effort` | `{{CONDUCTOR_MODEL}}`, `{{CONDUCTOR_EFFORT}}` | the conductor tier, including a middle conductor another conductor launches (G77) |
| `subagent_model` | `{{SUBAGENT_MODEL}}` | one-shot subagents, in the harness's own subagent vocabulary (`sonnet`, `opus`, `haiku`, `fable` on Claude Code), never a full id |
| `permission_modes` | read by path | the mode per tier (`conductor`, `worker`, `subagent`) in the repo vocabulary `bypass`, `auto`, `ask`, `inherit`; the posture is ADR-0024, the per-harness flags are the user skill's machine setup §3; the conductor verifies the worker's mode at readiness |
| `model_overrides` | read by path | each entry (`topics`, `tier`, `model`, `effort`) replaces a tier default for a brief whose topics match |

These are defaults, not policy: an explicit user instruction in the conductor session wins for that
run. A wave is a tracker-status bucket and exists only in `sprint-testing`; rounds are numbered
inside a wave ("Wave 1, round 2").

The scope of a Run is `<<PRIMARY_ROOT>>/.session/orchestration/<slug>/` (the skill's default; this
repo sets no `orchestration.scope_dir`). Its `<slug>` is not a `.session/<skill-slug>/` scope, so
`agentic-qa-core/references/session-management.md` does not validate it.

---

## 2 · Routing: the `ROUTE-SCOPE:` sentence

This repo's prompt hook classifies every prompt to inject `ROUTE: read <file>` lines (`AGENTS.md`
LOAD PROTOCOL). A worker prompt is the worst input it gets: the injected preamble talks about
workers, dispatch and rules, and the absolute paths name the scope folders, so before the cap one
prompt fired most sections and workers read almost none (measurements in ADR-0017).

- Every worker prompt and every `launch.txt` line ends with
  `ROUTE-SCOPE: <section ids the work needs, or none>`. The ids are the `id:` values in
  `.agents/instructions/agent-*.md`. It runs to the end of its line, so nothing follows it. With it
  the worker gets exactly the routes the conductor chose; without it the hook classifies the task
  block alone.
- The worker contract's routing rule (rule 15) reads, in this repo: read each `ROUTE:` line first,
  then `COMMON.md`, then the brief; a `ROUTE-OPTIONAL:` line is read only when the work needs it.

---

## 3 · Session identity and commit trailers

This repo has one hook emitter (`.agents/hooks/personality-reinject.mjs`) and one adapter per
harness; `cli/lib/agent-compatibility-contracts.ts` keeps them in sync. The emitter resolves
identity once per prompt and injects one line:

```
AGENT IDENTITY: worktree=<name|primary> session=<label> harness=<claude-code|codex|opencode|pi>
```

When the gate passes, a second line names `/agent-orchestration` and the worker's channel; when it
fails, nothing is injected.

- On Claude Code the emitter composes the session name `<label>--<handle>` from the prompt token
  `/<skill> <label> fleet worker` plus `ORCA_TERMINAL_HANDLE` (the label alone outside Orca), while no
  human has named the session. On Pi the adapter does the same. This is why no Claude Code or Pi
  launch line here carries a name flag (`fleet-launch-seam.md` §2).
- A session reads its identity from that line and never re-derives it per commit.
- Commits carry exactly two trailers, `Worktree: <name|primary>` then `Session: <label>`, from the
  `AGENT IDENTITY` line. They are forensics, not attribution (Critical Rule #3). Canon:
  `/git-flow-master`.
- A worker in a fresh worktree has the hook, because it is committed; it lacks `.env` and the skills
  alias until provisioned (`fleet-provisioning.md` §1).

---

## 4 · Conductor-only operations in this repo

A fleet has exactly one writer for anything shared. In this repo the conductor keeps:

- **Token minting**: `bun run api:login` before launching, with a per-worker profile when workers
  must not share a token; workers only read `.auth/profiles/<name>/tokens.env`. Canon:
  `agentic-qa-core/references/api-testing-doctrine.md`.
- **Schema sync**: `bun run api:sync`, one writer into `api/schemas/`, before the round.
- **Tracker pull and push at fleet altitude**: the sprint plan, the shared test plan, the cache
  hydration (`bun run context:hydrate`). A worker reads its own issue.
- **Generated registries**: `.agents/skills/REGISTRY.md` (`bun run skills:registry`) and the KATA
  manifest (`bun run kata:manifest`), regenerated once at integration (Critical Rule #12).

---

## 5 · Decisions and escalations

Whether a question reaches the human is decided by `agentic-qa-core/references/decision-protocol.md`;
the four escalation kinds are its §5. How it is asked is
`agentic-qa-core/references/decision-elicitation-doctrine.md` (§0 for a launched session, §1 and §7
for the sweep and the `mkd` deck). The user skill's relay rule (conductor cycle §4) lands here as:

- A technical call inside the approved plan is the conductor's, replied and reported as DECIDED.
- Everything else goes to the human, informed; an owner answer is recorded in
  `.session/decisions/<slug>-<date>.json`, the record `decision-protocol.md` §6 names and §2 searches
  first.

---

## 6 · The "Project rules" block of `COMMON.md`

Paste this block into the `## Project rules` slot of the user skill's `templates/COMMON.md`, filled:

```
1. Read AGENTS.md first. The Critical Rules that matter most here: #3 (no AI attribution in
   commits), #7 (after code changes verify tests, then types, then lint), #8 (read before edit),
   #11 (read package.json for scripts, never quote a command from a doc), #12 (the KATA manifest is
   the source of truth), #15 (no global git discards: never git restore ., git checkout -- .,
   git reset --hard, an untargeted git stash, or git clean). Restore only paths you modified.
2. Generated files are generated: do not hand-edit .agents/skills/REGISTRY.md or the KATA manifest.
   If your change makes one stale, say so in your report; the conductor regenerates it once.
3. Before each commit run at least bun run types:check, bun run lint:check, bun run skills:check and
   bun run vars:check; with cli/, scripts/ or tests/ touched, also the matching test suite (read
   package.json for the exact names).
4. Lint traps that reject a commit: SKILL-LITERAL-TOOL (a literal tracker or TMS command outside its
   owner skill: write [ISSUE_TRACKER_TOOL] / [TMS_TOOL] pseudocode), SKILL-HARDCODED-CFID (no literal
   custom-field ids outside the tool-owner skills), STALE-PATH (every inline-code path in a SKILL.md
   or references/*.md exists; cross-skill cites use the full path), vars:check (every project
   variable resolves, .agents/README.md).
5. Commits: stage only your own paths, commit with a pathspec (git commit -F <file> -- <paths>),
   semantic prefix, and end the message with exactly two lines, Worktree: <name|primary> then
   Session: <the session= value of your AGENT IDENTITY line>. Write unknown for a value you cannot
   resolve. Never amend a rejected commit; fix it in a new one.
6. Your first action after reading this file and your brief: rename your own tab with the command in
   the Name row of your brief. Your session is named for you; do not rename it.
7. Where things are: skills in .agents/skills/<slug>/, shared doctrine in
   .agents/skills/agentic-qa-core/references/, project variables in .agents/project.yaml, tracker
   catalogs .agents/jira-fields.json, .agents/jira-workflows.json, .agents/jira-required.yaml, tests
   and KATA in tests/ and kata-manifest.json, the CLI in cli/ (import-closed). Scripts: package.json.
```

---

## 7 · Routines that fit this repo

Each one is the full conductor cycle minus the owner; an ambiguous case becomes a parked item in the
report, never an `ask`.

| Routine | Cadence | Workspace | What it does |
|---|---|---|---|
| Nightly regression triage | daily, after CI | existing | read the latest run, classify failures into clusters, one worker per cluster, a GO / CAUTION / NO-GO verdict where the team reads it. WHAT: `/regression-testing` |
| Hydrate the tracker cache and the coverage map | daily | existing | refresh the synced issue cache, regenerate the coverage map, publish the HTML |
| Shift-left sweep | sprint start | existing | stories in the backlog with no shift-left label, one worker per story up to the cap. WHAT: `/shift-left-testing` |
| Artifact-status guard | weekly | existing | run the artifact-lifecycle verifier over the sprint's artifacts and produce a LIST; it touches nothing |

A routine that selects Stories for testing runs the deploy check of
`sprint-testing/references/session-entry-points.md` (Step 1c) on each candidate before opening a
worker. The cost of an empty wake-up is recorded in ADR-0006; the number to trust for a routine is
its own run log.

---

## 8 · Harvest and the gotcha this repo owns

At the close of a wave the user skill harvests `learnings.md` and `skill-improvements.md` (conductor
cycle §9). In this repo `skill-improvements.md` is the input for a `/framework-development` pass and
`learnings.md` feeds the next wave's `COMMON.md`.

G63 (this repo, GitHub API): `bun run git:policy verify` reports host DRIFT when the active `gh`
account cannot see the ruleset's bypass list (`bypass_actors: null`, `current_user_can_bypass:
"never"` from an unchanged ruleset), which blocks `repo:check` and the pre-push hook. Before
believing the drift, check who is asking (`gh auth status`) and the ruleset's own `updated_at`; an
unchanged timestamp with an empty bypass list is a permissions artifact. Switch to the account the
policy was stamped with and re-verify.
