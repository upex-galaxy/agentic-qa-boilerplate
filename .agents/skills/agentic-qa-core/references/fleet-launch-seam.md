# Fleet launch seam: how a workflow skill of this repo hands work to a fleet

> Loaded by a workflow skill that distributes work (`sprint-testing`, `test-automation`,
> `shift-left-testing`, `exploratory-testing`, `framework-development`, `regression-testing`), by
> `/sprint-conductor`, and by whoever edits one of them. The doctrine (conductor, workers, mailbox,
> claims, close) is the user-level skill `/agent-orchestration`; this file is what this repo adds to
> it: who writes the launch file, where, which lines are gated, and what a workflow skill never does.
> Provisioning a worktree is `fleet-provisioning.md`; the rest of what this repo fills into the
> skill's slots is `fleet-project-profile.md`.

---

## 1 · The gate, as a workflow skill sees it

`/agent-orchestration` owns the gate (the binary on PATH, then `status --json` with the nested
`result.runtime.reachable`). On Linux outside an Orca terminal the binary is probed as `orca-ide`,
because bare `orca` is the GNOME screen reader; the identity hook's `orcaAvailable()` and
`cli/doctor.ts` apply the same rule. What changes per state for a workflow skill of this repo:

| State | In a workflow skill | In `/sprint-conductor` |
|---|---|---|
| A, no binary | total silence: not named, not recommended, not a prerequisite, not in the ATR, not in the blocked-token sweep. The skill writes `launch.txt` and the human pastes the lines | one line, then it stops: it exists to run on Orca |
| B, binary, runtime unreachable | silence, same fallback | opens the app once, re-checks once; still unreachable, its state-A line |
| C, ready | the gated lines of §3 activate without announcing themselves | full mode |

The user skill is installed at user level by `bun setup` (`USER_LEVEL_SKILLS` in `cli/install.ts`).
Not installed is the same as state A for a workflow skill: it runs on one-shot subagents plus the
pasted `launch.txt` lines (`AGENTS.md` §3). `bun run setup:doctor` reports it.

The test that settles any edit: would the line still make sense, unchanged, to a tester who has never
heard of the orchestrator? If not, it belongs in `/agent-orchestration`, not in the workflow skill.

---

## 2 · The launch file

Every workflow skill that distributes work writes `launch.txt`, always, whether or not a runtime
exists. The prompt inside each line is byte-identical to the spec a supervised worker gets as its
first prompt; that shared prompt is the payload (shape and quoting rules: `/agent-orchestration`,
its brief template and `templates/launch.txt`).

- Path: `<<PRIMARY_ROOT>>/.session/<skill-slug>/<scope>/launch.txt`, inside the scope of the workflow
  skill that distributes the work. Only a wave no single workflow skill owns (a conductor running
  `/agent-orchestration` directly) keeps it in the orchestration scope,
  `.session/orchestration/<slug>/launch.txt`, and never in both.
- Regenerate it whole at each planning pass; finished items drop out.
- Every prompt opens with `/<workflow-skill> <label> fleet worker` and ends with this repo's
  `ROUTE-SCOPE:` sentence (`fleet-project-profile.md` §2).
- The permission flag matches `orchestration.permission_modes.worker` in `.agents/project.yaml`
  (the per-harness flags: `/agent-orchestration`, machine setup §3).
- The Claude Code line carries no `-n`: this repo's identity hook names the session from the prompt
  token (`fleet-project-profile.md` §3), and a name flag marks the name as human-set, so the hook
  would never append the handle.
- The line starts the harness binary bare: no launch line loads `.env` into the worker's shell
  (`fleet-provisioning.md` §2).
- Fleet mode is detected from the prompt token and the brief, never from an environment variable:
  a prefix never reaches a supervised worker and was measured empty on a real fleet even on the
  pasted path.

The sprint shape, one line per issue. A `sprint-testing` worker's label is the bare issue key,
because that skill reads the issue it owns from the token; its name is `<KEY>--<handle>`:

```
claude --model <full-model-id> --effort <effort> --dangerously-skip-permissions '/sprint-testing <KEY> fleet worker. Read <ABS>/.session/sprint-testing/sprint-<N>/<KEY>/brief.md and execute it. Run every stage without returning to the prompt until worker_done is sent, except to end your turn right after an ask; stage boundaries are not checkpoints. No heartbeats. ROUTE-SCOPE: <section ids>'
```

---

## 3 · The gated lines

When the gate passes, a workflow skill may do only these things, each one silent when the gate fails:

1. Hand the work to the launcher instead of asking the human to paste it: one supervised worker per
   unit of work, whose spec is the same prompt. A conductor that wants an unsupervised terminal
   passes the `launch.txt` line verbatim as that terminal's command.
2. Seed the per-unit brief with the fleet fields of the user skill's brief template, including
   `Run: <run_id>` when the worker is launched without a dispatch.
3. Add the mailbox report to what a worker already writes. The workflow's own tokens and files stay;
   the message is an addition, never a replacement.
4. Open a generated page in a worktree-bound tab instead of the system browser (§6). When the gate
   fails, open it the ordinary way and say nothing.

Everything else (Runs, Tasks, launch, waiting, liveness, closing) belongs to `/agent-orchestration`,
and a workflow skill writes it as `[ORCHESTRATION_TOOL] <verb>: …` pseudocode, never a command.

---

## 4 · What a workflow skill never does

| Never | Why |
|---|---|
| list a runtime, a binary or an app as a prerequisite | the flow works without it; a prerequisite turns an optional accelerator into a hard dependency |
| put it in a non-bypassable probe | a machine without it would fail a gate it has no reason to pass |
| mention it in the ATR environment block or any report of record | the artifact of record reads the same on every machine |
| include it in the blocked-token sweep | the sweep is the fallback that must work without it |
| name it to the user when the gate fails | state A is total silence. The single exception is `/sprint-conductor`, which stops with one line |
| change what a single worker does | N=1 keeps its behaviour byte for byte; fleet mode adds a coordinator above the loop |
| paraphrase the prompt, on either path | the prompt is the payload both paths share |
| detect fleet mode from an environment variable | it does not survive either path (§2) |

---

## 5 · Per-skill scope and topology

| Skill | Scope for `launch.txt` | Topology | Why |
|---|---|---|---|
| `sprint-testing` sprint-wide | `.session/sprint-testing/sprint-<N>/` | fleet in the same checkout, one worker per issue (or per 2-3 tightly coupled issues); per-worker browser session, profile and output dir | it writes no code; the record lives in the tracker plus the session scope, so a worktree per issue is pure cost |
| `shift-left-testing` batch | its dated batch scope | same checkout, one worker per story | the output is refined criteria and an early test plan |
| `exploratory-testing` | its charter scope | same checkout, one worker per module | a read of the app, recorded in the session scope |
| `test-automation` batch | its per-module or per-package scope | one Orca worktree per worker, one worker per MODULE; stories that share a module run one after another inside that worker | it writes code; two workers on one module conflict in the fixture files by construction (`test-automation/references/batch-fleet.md`, component ownership) |
| `framework-development` waves | its wave scope | same checkout (`solo-main`) with explicit file ownership per worker and pathspec commits, or a worktree per wave when two workers must touch one module | a same-checkout fleet hit one git-index collision (G43), which produced the pathspec-commit rule |
| `regression-testing` triage | its dated run scope | the conductor reads CI; one worker per real failure CLUSTER, each in a worktree | every fix is code; three failures with one root cause is one worker |
| `project-discovery`, `project-context` | none | not a fleet: one-shot subagents | these are reads |

The owner's rule of thumb: when the task touches files another live session is touching, use a
worktree; otherwise the shared checkout. In manual QA there is almost never a file conflict; in
automation there almost always is. The scope directory name is whatever that skill's own
session-management contract declares.

---

## 6 · Generated pages in a worktree-bound tab

This repo generates pages a human reads: the coverage map from `bun run tests:map`, an Allure
report, the how-it-works decks, and any decision deck a skill renders for the owner. With the gate
passing, open one in a tab bound to the worktree (pass the worktree selector explicitly, then verify
the tab reports no load error and the page rendered); the user skill's Orca provider holds the
routes and the clipboard dead end. With the gate failing, the system browser is the normal outcome,
not a degraded one, and nothing is said about it.

---

## 7 · Review checklist for a seam edit

- [ ] The launch file is written on BOTH paths, unconditionally.
- [ ] The prompt is identical on both paths, opens with `/<workflow-skill> <label> fleet worker`
      and ends with the `ROUTE-SCOPE:` sentence.
- [ ] The permission flag matches `orchestration.permission_modes.worker`, and the Claude Code line
      carries no name flag.
- [ ] Nothing detects fleet mode from an environment variable.
- [ ] Every line is self-contained and passes `sh -n`.
- [ ] The gated block is genuinely gated, and its failure mode is silence.
- [ ] N=1 behaviour is unchanged; the workflow's own tokens and artifacts are still written.
- [ ] Every orchestration action is `[ORCHESTRATION_TOOL]` pseudocode resolved through
      `/agent-orchestration`.
