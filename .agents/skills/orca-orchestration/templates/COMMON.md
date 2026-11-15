# COMMON RULES FOR EVERY WORKER: read this first, then your own W-<label>.md

> Copy to `.session/orchestration/<slug>/COMMON.md`. Owner: the conductor, written once per wave.
> It is written once on purpose: six workers reading six slightly different copies of the same rules
> is the failure this file prevents. Replace every `<…>` before launching anything.

You are a worker session opened by a conductor session. Topology for this wave:
**<same checkout at `<ABS>` on branch `<branch>` | your own worktree at `<ABS>` on branch `<branch>`>**.
Other workers run at the same time; the roster in your own brief says who and on what. The conductor
has the owner's authority for this wave and reviews everything at the end.

## Non-negotiables

1. Read `AGENTS.md` first, it is the repo's instruction file. The Critical Rules that matter most
   here: #3 (no AI attribution in commits), #7 (after code changes verify tests, then types, then
   lint), #8 (read before edit), #11 (read `package.json` for scripts, never quote a command from a
   doc), #12 (the KATA manifest is the source of truth), #15 (no global git discards: never
   `git restore .`, `git checkout -- .`, `git reset --hard`, an untargeted `git stash`, or
   `git clean`). You may only restore paths you modified in this session.
2. Touch only the files listed under `## File ownership` in your own brief. If you believe you must
   edit a file you do not own, leave it alone: put the exact edit you wanted in your report, and ask
   the conductor if it blocks you.
3. Make surgical edits. Match the existing style; no refactors of unbroken code, no adjacent
   cleanup, no new abstraction for a single use.
4. Repo artifacts are English: code, comments, docs, skills, commit messages, branch names, PR
   bodies and every external artifact. The conversation may be in another language; the repo is not.
5. Never push, open a PR, close an issue, or post to the tracker or chat unless your brief
   explicitly assigns that step to you. Commits only, by default.
6. Generated files are generated: do not hand-edit `.agents/skills/REGISTRY.md` or the KATA
   manifest. If your change makes one stale, say so in your report; the conductor regenerates them
   once, at integration, because N workers regenerating one whole-repo file is N conflicting
   rewrites.
7. Re-read a file before every edit: another worker may have changed a shared neighbour since your
   last read. If an edit fails because the file changed, re-read and retry. Do not overwrite a whole
   file you did not just read.
8. Run the gates before each commit: at minimum `bun run types:check`, `bun run lint:check`,
   `bun run skills:check`, `bun run vars:check`. If you touched `cli/`, `scripts/` or `tests/`, also
   run the matching test suite (read `package.json` for the exact script names).

## Lint traps that will reject your commit

- `SKILL-LITERAL-TOOL`: a literal issue-tracker or TMS CLI command inside any skill or reference
  that is not that tool's owner skill. Write `[ISSUE_TRACKER_TOOL] <Verb>: …` /
  `[TMS_TOOL] <verb>: …` pseudocode and point at the owner skill for the syntax. Doctrine:
  `agentic-qa-core/references/skill-composition-strategy.md`.
- `SKILL-HARDCODED-CFID`: no literal custom-field ids outside the tool-owner skills; use the slug
  catalog form.
- `STALE-PATH`: every inline-code path you cite inside a `SKILL.md` or a `references/*.md` must
  exist on disk. Cross-skill cites use the full path, never a `./` relative one.
- `vars:check`: every project variable you write must resolve (`.agents/README.md`).

## Commits

- Stage only your own paths: `git add <path> <path>`. Never `git add -A` or `git add .`, which in a
  shared tree stages another worker's half-finished edit.
- Commit with a pathspec, immediately after staging: `git commit -F <message-file> -- <path> <path>`.
  On `index.lock`, wait about 5 s and retry; do not delete the lock.
- Use a semantic prefix (`feat:` / `fix:` / `docs:` / `test:` / `refactor:` / `chore:`), the scope in
  parentheses, imperative mood, one responsibility per commit. The body says what and why, in plain
  English.
- No AI attribution of any kind: no `Co-Authored-By`, no harness-branded trailer.
- End every commit message with exactly these two lines and nothing after them:

  ```
  Worktree: <your worktree name, or `primary`>
  Session: <your full name: the session= value of your AGENT IDENTITY line>
  ```

  They are forensics, not attribution: months later they are the only way to tell which of the six
  sessions did the work. Take both values from the `AGENT IDENTITY` line in your context, except
  where the `Name` row of your own brief says `roster only` (a harness that cannot be renamed): then
  `Session:` carries that roster name. Write `unknown` for a value you cannot resolve rather than
  guessing.
- The pre-commit hook runs the repo's gates. Fix what it reports and do not bypass it. Fix a
  rejected commit in a new commit, never by amending the rejected one.

## Your name, and your first action

Your name is the label your prompt token carries, two hyphens, then your own terminal handle
(`TK-123-add-google-auth--term_…`). It is your session name, your tab title and your `Session:`
trailer. Your first action, once this file and your brief are read and before any work, is to rename
your own tab with the exact command in the `Name` row of your own brief
(`orca terminal rename --terminal "$ORCA_TERMINAL_HANDLE" …`); with no `ORCA_TERMINAL_HANDLE` in your
environment there is no tab to rename. Your session is named for you (the identity hook on Claude
Code, the conductor elsewhere); do not rename it yourself. Detail:
`.agents/skills/orca-orchestration/references/worker-contract.md` §Session naming.

## Communication with the conductor

Your prompt carries a live dispatch preamble with your `taskId` and `dispatchId` and the exact
message syntax. Use it and nothing else:

- Blocking question: a blocking `ask` to the conductor. If it times out, the question stays
  pending: resume it by its original message id, never ask again.
- A measurement that contradicts the conductor: a blocking `ask` carrying both readings and your
  evidence. This one is mandatory, because complying silently or deviating silently is exactly what
  makes a fleet worth less than a single session.
- Non-blocking question: a plain message, and keep working on everything that does not depend on
  the answer. Asking is not stopping.
- Blocker: an `escalation`, unless you were launched without a dispatch. There the runtime rejects
  it and returns the refusal as a `status` message, so your blocker never arrives. On that path send
  a `status` message whose subject starts with `BLOCKED: `.
- An error, a blocker or a decision you cannot take inside your brief goes to the conductor, never
  to the human, and is never guessed: the four escalation kinds of
  `agentic-qa-core/references/decision-protocol.md` §5 (product behaviour, a new security posture, an
  irreversible or outward action, what a person signs) and every error or blocker you cannot clear,
  as a blocking `ask`, an `escalation` or the `BLOCKED: ` status above. A technical call inside your
  brief is yours: decide it and report it as DECIDED, with the option it beat. Exception: the human
  typed the request into your own session, or your brief grants it in writing; then tell the
  conductor what was asked and answered (worker contract rule 16).
- Finished or stopping: exactly one `worker_done`, with an explicit outcome (`succeeded` or
  `failed`, never a failure stated only in prose), your modified files, and the path of your
  report. Then stop: no new work, no polling, and never close your own terminal.

Run every stage without returning to the prompt until `worker_done` is sent. A stage boundary, a
written artifact and a natural pause are not checkpoints; each stop costs a manual nudge from the
conductor. Work done: `worker_done`. Work blocked: `ask` or the blocker form above. Anything else:
keep going.

Three channels are off limits, and this is not negotiable:

- The harness's own agent-to-agent messaging tool. From a worktree the conductor is not in your
  agent list, and a whole fleet once reported to the wrong sessions this way (G35).
- The harness's user-question prompt, any structured-question tool, and an `mkd` decision deck.
  Nobody is watching them (one such question waited for hours, G36); a pending that needs the human
  goes to the conductor, who relays it.
- Periodic heartbeats. Your injected preamble asks for them; this repo forbids them, because each
  one wakes the conductor to read the word "alive". You send three things and nothing else:
  `worker_done`, `ask`, `escalation`.

## Claims on shared data

Your own brief lists the claims you hold, each with one of three intents: `read`, `write`, or
`enumerate` (a listing on a shared account that exposes your siblings' entities; nothing is mutated,
and nothing about that collection may be asserted on, because its size, contents and ordering belong
to the whole fleet). Everything in that table is already granted: announce it and work. A claim you
discover mid-run is declared and waited on, because a sibling may hold it.

## Your report

Write `<ABS>/.session/orchestration/<slug>/reports/<label>.md` before `worker_done`, with these
sections: `## Summary`, `## Files changed`, `## Commits` (sha + subject), `## Decisions taken` (and
why), `## Verification` (commands + exit codes), `## Left open`. The message body is a summary; the
file is the record, and it is what the conductor hands to the next wave.

## Resource hygiene

Close every browser-automation session when you finish, including the ones your subagents opened.
Run one dev server per worktree. Check free disk before long work: with a full disk, writing the
output fails rather than the command, so you go mute while believing you reported.

## Where things are

- Skills: `.agents/skills/<slug>/SKILL.md` + `references/`. Shared doctrine:
  `.agents/skills/agentic-qa-core/references/`.
- Project variables: `.agents/project.yaml`. Variable syntax: `.agents/README.md`.
- Tracker catalogs: `.agents/jira-fields.json`, `.agents/jira-workflows.json`,
  `.agents/jira-required.yaml`.
- Tests and KATA: `tests/`, `kata-manifest.json`. CLI: `cli/` (import-closed, see
  `.agents/instructions/agent-harnesses.md`).
- Scripts: read `package.json` directly, and quote no command from a doc.
