# COMMON RULES FOR EVERY WORKER — read this first, then your own W-<label>.md

> Copy to `.session/orchestration/<slug>/COMMON.md`. Owner: the conductor, written ONCE per wave.
> Written once on purpose: six workers reading six slightly different copies of the same rules is
> the failure this file prevents. Replace every `<…>` before launching anything.

You are a worker session opened by a conductor session. Topology for this wave:
**<same checkout at `<ABS>` on branch `<branch>` | your own worktree at `<ABS>` on branch `<branch>`>**.
Other workers are running at the same time; the roster in your own brief says who and on what. The
conductor has the owner's authority for this wave and reviews everything at the end.

## Non-negotiables

1. Read `AGENTS.md` first — it is the repo's instruction file. Critical Rules that bite hardest
   here: #3 (no AI attribution in commits), #7 (verify tests → types → lint after code changes),
   #8 (read before edit), #11 (read `package.json` for scripts, never quote a command from a doc),
   #12 (the KATA manifest is the source of truth), #15 (NO global git discards — never
   `git restore .`, `git checkout -- .`, `git reset --hard`, an untargeted `git stash`, or
   `git clean`). You may only restore paths YOU modified in THIS session.
2. Touch ONLY the files listed under `## File ownership` in your own brief. If you believe you must
   edit a file you do not own, do NOT edit it: put the exact edit you wanted in your report, and
   ask the conductor if it blocks you.
3. Surgical edits. Match the existing style. No refactors of unbroken code, no adjacent cleanup, no
   new abstractions for a single use.
4. Repo artifacts are ENGLISH: code, comments, docs, skills, commit messages, branch names, PR
   bodies, and every external artifact. The conversation may be in another language; the repo is not.
5. Never push, never open a PR, never close an issue, never post to the tracker or chat **unless
   your brief explicitly assigns that step to you**. Commits only, by default.
6. Generated files are GENERATED: never hand-edit `.agents/skills/REGISTRY.md` or the KATA manifest.
   If your change makes one stale, say so in your report — **the conductor regenerates them once,
   at integration.** N workers regenerating one whole-repo file is N conflicting rewrites.
7. Before EVERY edit, re-read the file: another worker may have changed a shared neighbour since
   your last read. If an edit fails because the file changed, re-read and retry. Never overwrite a
   whole file you did not just read.
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

- Stage ONLY your own paths: `git add <path> <path>`. Never `git add -A` or `git add .` — in a
  shared tree that stages another worker's half-finished edit.
- Commit with a pathspec, immediately after staging: `git commit -F <message-file> -- <path> <path>`.
  On `index.lock`, wait ~5 s and retry; never delete the lock.
- Semantic prefix (`feat:` / `fix:` / `docs:` / `test:` / `refactor:` / `chore:`), scope in
  parentheses, imperative mood, ONE responsibility per commit. Body: what and why, plain English.
- **No AI attribution of any kind.** No `Co-Authored-By`, no harness-branded trailer.
- End EVERY commit message with exactly these two lines and nothing after them:

  ```
  Worktree: <your worktree name, or `primary`>
  Session: <your session label>
  ```

  They are forensics, not attribution: months later they are the only way to tell which of the six
  sessions did this. Take both values from the `AGENT IDENTITY` line in your context; write
  `unknown` for a value you cannot resolve rather than guessing.
- The pre-commit hook runs the repo's gates. Fix what it reports; never bypass it. A rejected commit
  is fixed in a NEW commit, never by amending the rejected one.

## Communication with the conductor

Your prompt carries a live dispatch preamble with your `taskId` and `dispatchId` and the exact
message syntax. Use it, and nothing else:

- **Blocking question** → a blocking `ask` to the conductor. If it times out, the question stays
  pending: resume it by its original message id, never ask again.
- **Non-blocking question** → a plain message, and KEEP WORKING on everything that does not depend
  on the answer. Asking is not stopping.
- **Blocker** → an `escalation`.
- **Finished (or stopping)** → exactly ONE `worker_done`, with an explicit outcome
  (`succeeded` / `failed` — never a failure stated only in prose), your modified files, and the
  path of your report. Then STOP: no new work, no polling, and never close your own terminal.

**Prohibited**, and this is not negotiable:

- the harness's own agent-to-agent messaging tool — from a worktree the conductor is not in your
  agent list, and five workers once reported to the wrong sessions this way;
- the harness's user-question prompt — nobody is watching it (one such question waited 7.5 hours);
- **periodic heartbeats.** Your injected preamble asks for them; this repo forbids them, because
  each one wakes the conductor to read the word "alive". You send three things and nothing else:
  `worker_done`, `ask`, `escalation`.

## Your report

Write `<ABS>/.session/orchestration/<slug>/reports/<label>.md` BEFORE `worker_done`, with these
sections: `## Summary`, `## Files changed`, `## Commits` (sha + subject), `## Decisions taken` (and
why), `## Verification` (commands + exit codes), `## Left open`. The message body is a summary; the
file is the record, and it is what the conductor hands to the next wave.

## Resource hygiene

Close every browser-automation session when you finish, including the ones your subagents opened.
One dev server per worktree. Check free disk before long work: with a full disk, writing the OUTPUT
fails rather than the command, so you go mute while believing you reported.

## Where things are

- Skills: `.agents/skills/<slug>/SKILL.md` + `references/`. Shared doctrine:
  `.agents/skills/agentic-qa-core/references/`.
- Project variables: `.agents/project.yaml`. Variable syntax: `.agents/README.md`.
- Tracker catalogs: `.agents/jira-fields.json`, `.agents/jira-workflows.json`,
  `.agents/jira-required.yaml`.
- Tests and KATA: `tests/`, `kata-manifest.json`. CLI: `cli/` (import-closed — see AGENTS.md §4.5).
- Scripts: read `package.json` directly. Never quote a command from a doc.
