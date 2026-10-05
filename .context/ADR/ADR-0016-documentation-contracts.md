# ADR-0016 — Documentation contracts: region markers, a push and CI gate with a `Docs-Checked:` escape, an edit-time reminder

- **Status:** Accepted (by the owner, 2026-10-05)
- **Date:** 2026-10-05
- **Deciders:** framework owner (boilerplate maintainer): decision B15 of handoff 07 ("approved with conductor recommendations: v1 in the two boilerplates only; push + CI BLOCK with an explicit `Docs-Checked: <label> <reason>` trailer escape, commit only warns; drift-sweep subagent runs only when a PR touches `cli/`, `scripts/`, `.husky/` or instruction files; option B of the doc-contracts spike, QA first then DEV port"), implemented by unit b15-q
- **Tags:** docs, gates, husky, ci, hooks, framework-development
- **Supersedes:** —
- **Superseded by:** —

---

## Context

A read-only spike over both boilerplates measured the drift that merged PRs leave behind: 7 of 11 PRs merged in one day left at least one stale page, 29 sites in all. Almost every site had the same shape. A PR changed a behaviour (which harnesses a check covers, what the installer offers after `engram setup`, how a ROUTER row is added) and updated the page its author remembered, while a parallel page that describes the same behaviour in prose kept the old sentence. Removals did not drift: a dead word can be grepped to zero. Generating the facts would have caught none of the 29, because Critical Rule #17 already pushed the generatable ones out of prose.

The existing gates check that words resolve (`docs:check`: links, paths, quoted scripts), never that a sentence is still true. In this repo `docs:check` ran at commit time only when docs were staged, which is the inverse of drift, and no CI job ran any doc check. The `framework-development` docs follow-through fired on renames, not on behaviour changes, and did not list the decks or the Pages home, the surface every drifting PR missed.

## Decision

Option B of the spike, sized small.

1. **Markers.** A code region a page describes is wrapped in `LINT.IfChange(<label>)` and `LINT.ThenChange(<path>[#anchor], ...)` comment lines, Google's syntax, so any model reading the file knows what they mean. A marker counts only when it is the whole content of a comment line and not inside a Markdown fence. Labels are kebab-case and unique across the repo. Targets are checked at FILE level; the anchor is for the reader. Grammar: `scripts/lib/doc-contracts.ts`.
2. **Gate.** `scripts/lint-doc-contracts.ts`. When a change touches a region's content lines, EVERY target must change in the same range ("any" would have let a PR that updated one page and missed its twin pass). Escape: a commit in the range carrying `Docs-Checked: <label> <reason>`; a trailer without a reason does not count. A region created in the range cannot be violated by the change that creates it. Pre-commit WARNS (`--staged`): pages often land in the next commit of the same push. Pre-push BLOCKS (`--push`, range from the merge-base with `origin/HEAD`, else `origin/main`). CI BLOCKS on the PR range (`build.yml`). The structural lint (balanced markers, unique labels, targets on disk) runs inside `docs:check`.
3. **Edit-time reminder.** `.agents/hooks/doc-contracts.mjs`, a `PostToolUse` command hook on file edits in Claude Code (`Edit|Write|MultiEdit`) and Codex (`Edit|Write`, which Codex maps to `apply_patch`). When an edit lands inside a region it adds one `DOCS:` line naming the pages, once per session per label. OpenCode registers nothing: injecting model context from its `tool.execute.after` event is not verified, so it relies on the gate. `agents:compat:check` holds the two registrations in the boilerplate.
4. **Drift sweep.** `framework-development` Phase 3 gains a report-only verifier, V5, that greps the doc surface for prose describing the old behaviour. It runs only when the change touches `cli/`, `scripts/`, `.husky/` or the instruction files, and it counts the `Docs-Checked:` trailers the change used. It is the only piece that finds a coupling nobody declared.
5. **Gaps closed alongside.** `docs:check` runs on every push (where the script exists) and in CI with `skills:check`; the docs follow-through triggers on behaviour changes and lists `packages/decks/**` and `packages/pages-home/**`.
6. **Scope: maintainers only (v1).** The gate, the structural lint and the hook bind only where `package.json` names the boilerplate AND `.agents/project.yaml` carries the maintainer sentinel. Downstream every mode prints one line and exits 0, and the hook stays silent: the markers ship in synced `cli/` and `scripts/` files but point at pages a project owns or does not have.

Seeded on the regions the spike measured as drift sources: `harness-selection` and `mcp-parity` (`cli/lib/harness-selection.ts`, `cli/lib/agent-compatibility-contracts.ts`), `mcp-env-loader` (the loader head, described by Critical Rules #1 and #10), `engram-setup` (`cli/install.ts`), `router-lock` (`scripts/lint-instructions.ts`). Every drift found later becomes a new marker.

## Consequences

- **Positive:** the drift shape measured in the spike now fails the push that creates it, naming each page; the AI hears about the pages at the moment it edits the code, in the two harnesses that can carry it; the existing doc gates finally run where drift happens (push, CI).
- **Negative / trade-offs:** a marker exists only where someone anticipated the coupling, which moves the memory problem earlier rather than removing it; V5 is the backstop. A refactor inside a region costs one trailer line with a reason. A trailer cannot be added to a pushed commit: an ack after the fact is an empty commit carrying the line. The hook adds a node start (tens of milliseconds) to every edit.
- **Neutral / follow-ups:** the DEV boilerplate ports the same script, hook and wording (unit 3 of the spike plan). Downstream opt-in (a project seeding its own markers, targets in project-owned files skipped) is a v2 decision, not taken here.

## Alternatives considered

- **Generate the drifting facts with a check mode (option A) and nothing else.** Rejected as the answer: it would have caught 0 of the 29 sites. Still used opportunistically.
- **Semantic doc tests (option C).** Rejected: one fixture and runner per prose claim, in Spanish HTML decks and English Markdown, to learn what the code's own tests already say. A test cannot tell a sentence is stale.
- **File-level contracts on hot files.** Rejected: replayed over two months, a file-level rule on seven hot files would have asked for about 109 acknowledgements, most for bug fixes.
- **Warn-only everywhere, as Fuchsia does.** Rejected by the owner: the measured drift already passed a warn-level process. The escape keeps the block cheap.
- **Block at pre-commit.** Rejected: docs routinely land in the next commit of the same push, and a per-commit block teaches `--no-verify`.
- **A central `docs-contracts.yaml` with keyword lists.** Rejected: a second document that drifts, and keywords did not find the measured sites. The marker lives next to the code.

## References

- Spike: `.session/spikes/doc-contracts/plan.md` (local, gitignored), option B and section 5.
- Prior art: Chromium "keep files in sync" (`LINT.IfChange` / `LINT.ThenChange`, `NO_IFTTT=` bypass); Fuchsia presubmit checks.
- Code: `scripts/lib/doc-contracts.ts`, `scripts/lint-doc-contracts.ts`, `.agents/hooks/doc-contracts.mjs`, `.husky/framework-gates.sh`, `.github/workflows/build.yml`, `validateDocContractHooks` in `cli/lib/agent-compatibility-contracts.ts`.
