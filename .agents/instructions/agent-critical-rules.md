---
id: critical-rules
title: 'Critical rules: full text'
load_when: 'about to break, unsure about, or asked about a Critical Rule'
triggers: ['\bcritical rule', '\brule #?\d+\b']
paths: []
---

# Critical rules: full text

> Each rule below has the same number and name as its binding sentence in `AGENTS.md` §1. The sentences there are copied verbatim from the text below, so an edit here and the matching L0 line change together. This file holds the whole rule, its reason and its measurements. A rule that asks the person follows `agentic-qa-core/references/decision-protocol.md` when nobody is present: the brief decides, or the action is not taken and is reported.

## 1. Credentials by name, never by value

Reference a secret only through its variable name (`$STAGING_USER_PASSWORD` expanded by the shell, `process.env.X` in code, a name in the MCP loader's `--filter` list). Never open, print or paste a secret value: no `Read`/`cat`/`grep` of `.env*` (except `.env.example` and the committed `.env*.schema` files), `.auth/**` or `.claude/settings.local.json`; no `printenv`, `env`, `echo $SECRET`, `set -x`, `curl -v`, `varlock printenv|reveal`, or `varlock load` without `--agent`. To learn whether a variable is set, run `bunx varlock load --agent`. It is the repo's redacted presence check: it prints every variable by name and redacts each `@sensitive` value. A missing secret value is the human's to type, in a terminal or the secret manager, never through the chat. Never hardcode or guess one.

A secret is anything the schema marks `@sensitive` (`.env.schema`, `.env.core.schema`, `.env.provider.schema`) and anything obviously secret even when unmarked: credentials, passwords, API keys, tokens, cookies, session state. The AI names the variable and stops. A non-sensitive value (a URL, a project key, a flag, a port) is the one thing the AI may write into `.env`, only when the human asks, and only through `bun run env:set KEY=value`. That command refuses every key the schema marks `@sensitive`, does not declare, or whose name reads as a secret, and it prints names only. Editing `.env` by hand, with `sed` or with a heredoc is out.

To use a value without seeing it, let the shell expand `$NAME` inside the command: the command text carries the name and the output carries only the result (`playwright-cli --raw fill <ref> "$STAGING_USER_PASSWORD"`, `source .auth/tokens.env && curl -H "Authorization: Bearer $API_TOKEN_<ROLE>_<ENV>" ...`). Sourcing a file inside the same call is using it by name; printing what it holds is not.

The deny rules in `.claude/settings.json` (`permissions.deny`) and `opencode.jsonc` (`permission.read` / `permission.bash`) and the Pi adapter's `tool_call` block refuse the common reads, `printenv` and `env`. They match command patterns, so a subprocess can still open a file: this text is what binds, the deny list is the net. The commands that print, the safe forms, the presence check and what to do when a value leaks are in `.agents/skills/agentic-qa-core/references/secret-hygiene.md`.

Example keys: `LOCAL_USER_EMAIL`, `STAGING_USER_PASSWORD` (project-scope examples: the adopting repo renames or deletes them, the framework never requires them, and `config.testUser` fails by name at the point of use). The scope of every variable is in `cli/lib/variables-manifest.ts`; the doctrine is `.context/ADR/ADR-0005-validation-scope.md`.

## 2. Plan before coding

Produce the test plan (`spec.md` or the implementation plan) before writing test code. The flow is Plan, Code, Review.

## 3. No AI attribution

Never include "Generated with AI", harness branding, or AI `Co-Authored-By` trailers in commits. Commits look human-authored. The forensic trailers are the one mandatory exception and are not attribution: every commit ends with `Worktree: <name|primary>` then `Session: <label>`. They are harness-agnostic provenance that answers which checkout and which session produced a line, not who wrote it (the canon and the label rule are in `/git-flow-master`). `Claude-Session:` and every other harness-branded trailer stay forbidden.

## 4. Shift-left

Evaluate ACs for clarity, testability and completeness. Raise questions only when a genuine gap exists, never to fill a checklist.

## 5. Push to protected = resolve `git_strategy.policy.direct_push_to_protected`

The decision lives in `.agents/project.yaml`; the protected list is `git_strategy.protected`. `forbidden` means never direct-push, route through a PR. `confirm` means ask the user explicitly before every push. `allowed` is a standing authorization: push without asking. When the `git_strategy` block is missing or null (a fresh scaffold), behave as `confirm`, the safe default. Do not hardcode the answer here: the variable is the decision.

## 6. Git history (invariants: no `git_strategy` value relaxes them)

Never rewrite pushed history (rebase or amend on pushed commits). Never force-push a branch others may share: at minimum every branch in `git_strategy.protected`, plus the integration and ephemeral trunks in `git_strategy.branches`. Never delete remote branches without confirmation. Always add forward, with new commits instead of a rewrite, and always preserve merge history.

## 7. Quality verification

After code changes, verify in order: tests, types, lint. Do not skip a step.

## 8. File operations

Read a file before editing it, preserve its formatting and indent, and never overwrite a file you have not read.

## 9. Skills-first

All workflows live in `.agents/skills/`. Never paste instructions inline: invoke the matching skill and let it load its own detail. Use `[TAG_TOOL]` pseudocode and `{{VARIABLES}}` for dynamic content.

## 10. MCP credential failure = stop immediately

An MCP server that fails auth or lacks an env var stops the work, and the failure is silent on every host (ADR-0011). Every MCP server that needs `.env` values starts through the `.env` loader (`varlock run ... --filter <its vars> -- <server>`) in `.mcp.json`, `opencode.jsonc`, `.codex/config.toml` and `.pi/mcp.json`, which reads `.env` from the project root when the harness spawns the server.

The schema makes every item optional unless it says otherwise, so an unset variable does not stop the loader. The server starts without it and either exits before the handshake (the OpenAPI server, measured: listed as failed) or connects and dies on its first authenticated call. In `dbhub.toml`, an unset `${VAR}` becomes a literal string and then a connection failure that reads as a database problem. A value that fails the schema (a bad URL, port or enum) stops only the server whose `--filter` names it, and that server never connects; `bunx varlock load --agent` names the variable, redacted. `/mcp` inside a Claude Code session, `opencode mcp list` and the Codex startup report show which server is down. So a 401 or 403, or a mystery tool failure, is the signal: do not wait for a parse error that will not come.

No workaround. Stop, tell the user the exact env var, point to `.env` / `.env.example`, and ask them to fix `.env` and restart the agent session (the env is cached when the MCP server spawns and does not refresh mid-session).

An unavailable MCP is the same stop, at the point of use. A skill step or user prompt that needs a capability no available tool provides stops before the step, names the capability and says how to enable it. Resolve a capability by tool-name suffix, never by server prefix: a claude.ai connector or a user-level server satisfies it too. Never fall back silently to another tool, and never raise an alarm at session start for a server someone disabled. The canon is `agentic-qa-core/references/mcp-capabilities.md`.

## 11. Scripts = read `package.json` directly

Never quote test or build commands from this file or any doc, because they drift. Open `package.json` first, then answer.

## 12. KATA manifest = source of truth

`kata-manifest.json` (repo root) is the authoritative registry of every existing Component and ATC. Before proposing a new `Page`, `Api`, `Steps` module or `@atc('PROJ-XXX')` ID, load `kata-manifest.json` and check it: this is the anti-duplication gate. A stale manifest blocks commits through `.husky/pre-commit`. Regenerate with `bun run kata:manifest`; validate with `bun run kata:manifest:check`.

## 13. Concision comes from §2, not from a plugin

Butler and PM Voice set the content, and the user-level reply rules (`## Replies`) plus the `humanizer` skill set how it looks. No communication-mode plugin is assumed or recommended. Butler controls granularity (a terse headline plus an atomic menu the user pulls from), PM Voice controls register, and the user-level reply rules and `humanizer` control how the reply looks and sounds. A harness plugin that rewrites the register (a word-compression mode, a persona) is the user's own user-level choice: the repo does not install it, does not depend on it, and writes no rule whose meaning changes when it is present.

## 14. Language detection + mirroring

At the start of every conversation, read the full user message, not just the opening words, to detect the user's working language. Mirror that language in all conversational replies (questions, summaries, explanations, status updates). Repo artifacts are always English regardless of conversation language: code, code comments, commits, PR titles and bodies, branch names, file names, test names, configuration values, and any external action artifact (Jira issues and comments, GitHub issues, PRs and comments, Slack messages, emails, deploy notes, MCP tool inputs). If the user explicitly asks for another language for one artifact ("crea el ticket en español", "write this PR description in Spanish"), honor that for that artifact only and go back to English for the next ones unless asked again.

## 15. No global discards (multi-session safety)

Never run repo-wide destructive git commands: `git restore .`, `git checkout -- .`, `git reset --hard`, untargeted `git stash`, `git clean -f`. Several agent sessions may share one working tree without worktrees, and a global discard silently destroys another session's uncommitted work, unrecoverably. Discard only explicit paths you modified in this session (`git restore <path>...`, `git stash push <path>...`). When you are unsure who modified a file, do not restore it: ask the user.

## 16. A success code describes the call, never the outcome: verify at the destination

`ok: true`, exit 0, `accepted`, `delivered` and a returned id all say the request was well formed. None of them says the thing happened. Four measured cases: a message delivered to the wrong session by prefix match and returned success; a terminal created for a command that died in the shell; a send receipt carrying `"delivered_at": null, "read": 0` in the same payload that proved acceptance; a dispatch still reading `dispatched` against a terminal that had been replaced. A green receipt is the most dangerous kind of green, because it suppresses the verification that would have caught the failure.

A write is verified by reading it back from the destination, a message by the recipient answering it, a transition by re-reading the issue's status, a file write by re-parsing the file, a dispatch by the worker's own first report. This binds subagent reports, `[ISSUE_TRACKER_TOOL]` writes, MCP calls, the updater and every CLI in §6.5, not only orchestration. Where verifying is genuinely expensive, say the claim is unverified instead of letting the receipt stand in for it.

## 17. Committed prose names the source of truth, never its current value

Text that is committed (this file, `.agents/**`, `docs/**`, `README.md`, `INSTALLER.md`, `.env.example`, the decks) never states a fact that changes with the normal life of the repo or the tracker. Four kinds go stale within weeks, after which every session either trusts a wrong value or spends a turn reporting the drift:

- a count that moves (tests, ATCs, skills, aliases, MCP servers, Jira fields, components, work types or statuses, files, rows, gates `N/N`, tokens);
- an enumeration of a mutable set owned elsewhere (the skill list, the alias list, the server list, the custom-field list, the test-file list);
- a `file:line` citation (a path, a symbol or a heading is fine);
- a current-state claim ("today", "currently", "newest", "as of <date>", a measured size or timing, a tool version, a PR or issue number as live state), and edit-history narration inside doctrine ("since <version>", "correcting an earlier claim"). volatile-ok: quoted examples of the forbidden forms

Write the name of the owner instead and let the reader resolve it: a file (`.mcp.json`), a command (`bun run skills:registry`), a generated artifact (`REGISTRY.md`), a constant (`CONFIG_BLOCK_READERS`). Stable names that change only by decision are fine: stage names, KATA layers, rule numbers, file and command names, "three hosts".

Exempt: gitignored files and `.session/**`, generated artifacts (the business context maps inside their skills included), ADRs, changelogs and dated reports (a number "at the time" is right forever), test fixtures, code constants, and example output inside fenced blocks. A fact that must be stated with its date goes to an ADR and the doctrine links to it; the measurements behind this repo's own doctrine are in `.context/ADR/ADR-0006-forensic-measurements-ledger.md`. `scripts/lint-skills.ts` and `scripts/lint-docs.ts` flag the two regex-visible families (`FILE-LINE`, `CURRENT-STATE`); a line that must carry one is marked `volatile-ok: <reason>`. Canon and examples: `agentic-qa-core/references/volatile-facts.md`.

## 18. No comments in code by default

Code carries no comments. A comment stays only as a toolchain directive (`eslint-disable-next-line <rule> -- <reason>`, `@ts-expect-error`, `LINT.IfChange`/`LINT.ThenChange`) or as one line of WHY the code cannot express and a reader would otherwise get wrong.

Explanations and teaching go to docs and decks, where a reader looks for them and a reviewer maintains them. A comment that restates the code, narrates a step, banners a section or leaves an example TODO costs a line on every read and drifts out of date silently.

A comment never justifies skipping a rule. When a check fires, fix the cause, or disable that one rule on that one line with `eslint-disable-next-line <rule> -- <reason>` so the reason is a directive the toolchain reads.

The rule binds new and edited code everywhere in the repo. Existing comments outside `tests/` are not purged retroactively; touch them only when the edit already reaches that line. Decision: owner deck `kata-review` (D2).
