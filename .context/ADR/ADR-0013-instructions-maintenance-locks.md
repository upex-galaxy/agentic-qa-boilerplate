# ADR-0013 — Keeping progressive disclosure from eroding: a placement doctrine, one edit path, three lint locks and a recall audit

- **Status:** Accepted (by the owner, 2026-10-05)
- **Date:** 2026-10-05
- **Deciders:** framework owner (boilerplate maintainer): owner decision B2 of handoff 07 (2026-10-05), "approve all 4 maintenance pieces (decision tree doctrine, single sanctioned instructions mode, 3 lint locks, recall audit) + ADR, both repos". Technical calls inside it (the lock mechanism, when the eval runs) were made by the implementing worker under that approval and are recorded below with the options they beat
- **Tags:** instructions, multi-harness, hooks, lint, cross-cutting-invariant
- **Supersedes:** —
- **Superseded by:** —

---

## Context

ADR-0009 split the project instructions into an always-on `AGENTS.md` (L0), routed sections under `.agents/instructions/` (L1) and the skills' own `references/` (L2), with a prompt hook that names the section a request needs. L0 went from the 115 KB monolith to about 19 KB (19 409 B when this ADR was written), under Codex's 32 KiB cut. That gain is a property of how people edit the files, and nothing held it in place:

1. **Nothing said where a sentence goes.** The README carried editing rules, but no procedure turned "I need the agent to know X" into "X goes in this file". The shortest path is still pasting a paragraph into `AGENTS.md`, which every host loads on every session.
2. **The ROUTER was frozen by convention only.** ADR-0009 made its rows request kinds, "so the table does not grow with the project"; `instructions:check` proved every row resolves and every section is routed, but accepted any number of new rows.
3. **The router eval ran nowhere that blocks.** The labelled set (`cli/lib/fixtures/instruction-router-eval.json`, 58 prompts, recall 100.0% and precision 89.2% at the rename) was asserted only by `cli/lib/instruction-router.test.ts` under `bun test`. Neither the pre-commit hook nor CI's `build.yml` runs `bun test`, so a `triggers:` edit that lost a route merged green.
4. **A new section could ship half-done**: routed and with frontmatter, but with no labelled prompts and no entry in the folder's guide.
5. **Nobody measured whether a route is followed.** The eval proves the hook names the right file; it says nothing about the agent reading it. The first measurement, taken on the maintainer's machine for this decision with the audit below, over the last 30 days of Claude Code transcripts: **28.3%** (17 of 60 closed routes) across the three live checkouts of this repository, **16.8%** (27 of 161) when the transcripts of removed worktrees are included. Most misses (127 of 174 in a manual cross-check) are files no tool ever touched in that turn, concentrated in dispatched workers whose long brief fires six to eight routes at once.

## Decision

We will keep the split in place with four pieces, all reached through the gate that already runs on every commit (`skills:check` runs `lint-instructions.ts`).

1. **A placement doctrine.** `.agents/skills/framework-development/references/instructions-doctrine.md` is the decision tree for "where does this sentence go": L0 holds only behaviour, a critical rule's binding sentence, the LOAD PROTOCOL, orchestration core, memory triggers and the ROUTER; a per-request-kind fact goes in the `agent-*.md` section that owns the kind; skill detail in that skill's `references/`; a project-only fact in `agent-project.md` or an `<app>-context` skill. It carries worked examples.
2. **One sanctioned edit path.** `framework-development` gains mode `instructions`, which performs every change to L0, a section, the ROUTER or a `triggers:` list and closes with the checks. Skills whose own flow records a project fact in `agent-project.md` keep that one write, follow the doctrine and run `bun run instructions:check`; every other instruction change goes through the mode.
3. **Three locks in `instructions:check`**, errors in the maintainers' copy and warnings in a project (where the README and the eval set are synced, the ADR folder is not, and `AGENTS.md` is the project's own):
   - **ROUTER lock.** `AGENTS.md` carries `<!-- router:lock <fingerprint> <ADR-NNNN> -->` under the router markers. The fingerprint is the first 12 hex of the sha256 of the table, header included, cells trimmed and whitespace collapsed (a reflow keeps it, a changed cell does not). The gate fails when the table no longer matches the lock, when the named ADR is not in `.context/ADR/`, and when that ADR does not cite the fingerprint. The escape hatch is the decision itself: write or amend the ADR, run `bun run instructions:check --accept-router ADR-NNNN` (it refuses an ADR that is not on disk, rewrites the lock and prints the fingerprint), cite the fingerprint in the ADR.
   - **Router eval on every run.** The scorer moved to `scripts/lib/router-eval.ts`, shared with the unit test. `instructions:check` scores the hook's classifier against the labelled set on every call and fails under the fixture's targets, held at or above floors of recall 95% and precision 80%, or on a label no routed section carries.
   - **Complete section.** Every section but `agent-project.md` ships with frontmatter and a ROUTER row (checked already), at least three labelled prompts that expect its `id`, and a row in a new `## Sections` table of `.agents/instructions/README.md`; a README row naming a file that is gone fails too.
4. **A recall audit.** `bun run instructions:audit` reads this machine's Claude Code transcripts and reports, per section and overall against a 90% target, how many injected routes the agent read in the same turn (or had already read in that context). It prints file names and counts only, never transcript text. OpenCode and Codex transcripts are not parsed yet. A monthly routine running it is documented as optional; none is created.

Router fingerprint `f4d8c1c9bcf0`: the table as ADR-0009 left it, locked by this ADR.

## Consequences

- **Positive:** the cheapest wrong edit (a new ROUTER row, a pasted paragraph, a trigger tweak) now fails on the same commit, with the fix in the message. A `triggers:` regression is caught before any test run. The audit turns "the agent ignores the routes" from an impression into a number per section, and its first reading says the routing half is the weak one, not the classification half.
- **Negative / trade-offs:** a legitimate new request kind costs an ADR (or an amendment) and one extra command. The lock line costs about 60 bytes of L0. The eval adds a few milliseconds to every `instructions:check` (6 ms measured for the whole set, router load included). The README index is one more place to touch when a section is added, kept honest by the lint. The audit's notion of a read is a heuristic (the `Read` tool, or `Bash` with a read verb naming the file); a section read by a subagent does not count, by design, because it never reached the routed context.
- **Neutral / follow-ups:** the low measured recall is a separate problem this ADR does not solve; candidates are fewer routes per long prompt (precision on real briefs) and a stronger cue in the `ROUTE:` line, each measured with the audit before and after. The agentic-dev twin ports the same four pieces with its own router header (`Kind | Load | Also`).

## Alternatives considered

- **Lock the router through the commit message (an `ADR-NNNN` citation checked by `commit-msg`).** Rejected: pre-commit runs before the message exists, `commit-msg` is warn-only by contract here, a squash merge rewrites the message, and CI never sees one. A fingerprint the ADR must cite survives all four.
- **Run the eval only when `triggers:` changed against `HEAD`.** Rejected: it needs a base (`HEAD` in pre-commit, a merge-base in CI) and silently skips when `HEAD` is the change itself; it also misses `paths:` and router edits that move routing. Running the whole set costs less than reading the old file from git.
- **A committed router lock file under `scripts/` or `.agents/`.** Rejected: those are synced downstream, where the project owns its router; the lock belongs next to the table it locks, in the project-owned `AGENTS.md`.
- **Count any mention of the file in a tool call as a read in the audit.** Rejected: `git add`, `sed -i` and a `grep` of one line do not put the section in the context; the audit would overstate recall.

## References

- `.context/ADR/ADR-0009-progressive-disclosure-of-instructions.md` (the split this ADR protects)
- `.agents/skills/framework-development/references/instructions-doctrine.md`, `.agents/skills/framework-development/SKILL.md` (mode `instructions`)
- `scripts/lint-instructions.ts` (`lockFindings`, `evalFindings`, `completeFindings`, `acceptRouter`), `scripts/lib/instructions.ts` (`routerFingerprint`, `routerLock`, `readmeSectionRows`), `scripts/lib/router-eval.ts`
- `scripts/instructions-audit.ts`, `scripts/lib/instructions-audit.ts`
- `.agents/instructions/README.md` (`## Sections`, the locks)
- Twin decision in agentic-dev: its own ADR for the same four pieces
