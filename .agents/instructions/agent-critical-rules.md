---
id: critical-rules
title: 'Critical rules: full text'
load_when: 'about to break, unsure about, or asked about a Critical Rule'
triggers: ['\bcritical rule', '\brule #?\d+\b', '\bregla #?\d+\b']
paths: []
---

# Critical rules: full text

> Each rule below carries the same number and name as its binding sentence in `AGENTS.md` §1. The binding sentence there is what binds; this file holds the full rule, its rationale and its measurements.

## 1. CREDENTIALS = BY NAME, NEVER BY VALUE

1. **CREDENTIALS = BY NAME, NEVER BY VALUE**: Reference a secret only through its variable NAME (`$STAGING_USER_PASSWORD` expanded by the shell, `process.env.X` in code, a name in the MCP loader's `--filter` list). NEVER open, print or paste a secret value: no `Read`/`cat`/`grep` of `.env*` (except `.env.example` and the committed `.env*.schema` files), `.auth/**` or `.claude/settings.local.json`; no `printenv`, `env`, `echo $SECRET`, `set -x`, `curl -v`, `varlock printenv|reveal`, or `varlock load` without `--agent`. To learn WHETHER a variable is set, run the repo's redacted presence check (named in the full text). In this repo that check is `bunx varlock load --agent`: it prints every variable by name and redacts each `@sensitive` value. A missing secret value is the human's to type, in a terminal or the secret manager, never through the chat; the AI MAY write a non-sensitive value (URL, project key, flag, port) when asked. NEVER hardcode or guess.

   **What counts as a secret**: anything the schema marks `@sensitive` (`.env.schema`, `.env.core.schema`, `.env.provider.schema`) and anything obviously secret even when unmarked: credentials, passwords, API keys, tokens, cookies, session state. The human types a secret in their own terminal or stores it in the secret manager; the AI names the variable and stops. A non-sensitive value (a URL, a project key, a flag, a port) is the one thing the AI may write into `.env`, only when the human asks for it, and only through `bun run env:set KEY=value`: the one sanctioned write path. It refuses every key the schema marks `@sensitive`, does not declare, or whose name reads as a secret, and prints names only; never edit `.env` by hand, `sed` or a heredoc.

   **Using a value without seeing it**: the shell expands `$NAME` inside the command, so the command text carries the name and the output carries only the result (`playwright-cli --raw fill <ref> "$STAGING_USER_PASSWORD"`, `source .auth/tokens.env && curl -H "Authorization: Bearer $API_TOKEN_<ROLE>_<ENV>" ...`). Sourcing a file inside the same call is using it by name; printing what it holds is not.

   **Enforcement**: the deny rules in `.claude/settings.json` (`permissions.deny`) and `opencode.jsonc` (`permission.read` / `permission.bash`) refuse the common reads, `printenv` and `env`. They match command patterns, so a subprocess can still open a file: this text is what binds, the deny list is the net. Commands that print, the safe forms, the presence check and what to do when a value leaks → `.agents/skills/agentic-qa-core/references/secret-hygiene.md`.

   Example keys: `LOCAL_USER_EMAIL`, `STAGING_USER_PASSWORD` (project-scope examples: the adopting repo renames or deletes them; the framework never requires them, `config.testUser` fails by name at the point of use). Scope of every variable → `cli/lib/variables-manifest.ts`; doctrine → `.context/ADR/ADR-0005-validation-scope.md`.

## 2. PLAN BEFORE CODING

2. **PLAN BEFORE CODING**: Produce test plan (`spec.md` / impl plan) BEFORE writing test code. Flow: Plan → Code → Review.

## 3. NO AI ATTRIBUTION

3. **NO AI ATTRIBUTION**: NEVER include "Generated with AI", harness branding, or AI `Co-Authored-By` trailers in commits. Commits look human-authored. **Forensic trailers are the one MANDATORY exception and are NOT attribution**: every commit ends with `Worktree: <name|primary>` then `Session: <label>` — harness-agnostic provenance that answers "which checkout and which session produced this line", not "who wrote it" (canon + label rule: `/git-flow-master`). `Claude-Session:` and every other harness-branded trailer stay FORBIDDEN.

## 4. SHIFT-LEFT

4. **SHIFT-LEFT**: Evaluate ACs for clarity, testability, completeness. Raise questions ONLY when genuine gaps exist, never force questions to fill checklist.

## 5. PUSH TO PROTECTED = RESOLVE `git_strategy.policy.direct_push_to_protected`

5. **PUSH TO PROTECTED = RESOLVE `git_strategy.policy.direct_push_to_protected`** (`.agents/project.yaml`; protected list = `git_strategy.protected`): `forbidden` → NEVER direct-push, route through a PR. `confirm` → ask explicit user confirmation before EVERY push. `allowed` → standing authorization, push without asking. `git_strategy` block missing or null (fresh scaffold) → behave as `confirm` (safe default: ask). NEVER hardcode the answer here — the variable is the decision.

## 6. GIT HISTORY (INVARIANTS, not strategy choices — no `git_strategy` value relaxes them)

6. **GIT HISTORY (INVARIANTS, not strategy choices — no `git_strategy` value relaxes them)**: NEVER rewrite pushed history (rebase/amend on pushed commits). NEVER force-push a branch others may share — at minimum every branch in `git_strategy.protected`, plus integration/ephemeral trunks in `git_strategy.branches`. NEVER delete remote branches without confirmation. ALWAYS add forward (new commits, not rewrite). ALWAYS preserve merge history.

## 7. QUALITY VERIFICATION

7. **QUALITY VERIFICATION**: After code changes, verify in order: tests → types → lint. No skip steps.

## 8. FILE OPERATIONS

8. **FILE OPERATIONS**: ALWAYS read file before edit. Preserve formatting + indent. NEVER overwrite without reading.

## 9. SKILLS-FIRST

9. **SKILLS-FIRST**: All workflows live in `.agents/skills/`. NEVER paste instructions inline. Invoke matching skill, let it self-load detail. Use `[TAG_TOOL]` pseudocode + `{{VARIABLES}}` for dynamic content.

## 10. MCP CREDENTIAL FAILURE = STOP IMMEDIATELY

10. **MCP CREDENTIAL FAILURE = STOP IMMEDIATELY**: MCP fail auth or env var missing. **FAILURE IS SILENT ON EVERY HOST** (ADR-0011): every MCP server that needs `.env` values starts through the `.env` loader (`varlock run ... --filter <its vars> -- <server>`) in `.mcp.json`, `opencode.jsonc` and `.codex/config.toml`, which reads `.env` from the project root when the harness spawns the server. The schema makes every item optional unless it says otherwise, so an unset variable does not stop the loader: the server starts without it and either exits before the handshake (the OpenAPI server, measured: listed as failed) or connects and dies on its first authenticated call, and `dbhub.toml` `${VAR}` unset → literal string, then a connection failure that reads as a database problem. A value that fails the schema (a bad URL, port or enum) stops only the server whose `--filter` names it, and that server never connects; `bunx varlock load --agent` names the variable, redacted. `/mcp` inside a Claude Code session, `opencode mcp list` and the Codex startup report show which server is down. **So a 401/403 or a mystery tool failure is the signal** — never wait for a parse error that will not come. NO workaround. STOP, tell user exact env var, point to `.env` / `.env.example`, ask fix `.env` + **RESTART AGENT SESSION** (env cached at MCP-spawn time, no refresh mid-session). **MCP UNAVAILABLE = SAME STOP, AT THE POINT OF USE**: a skill step or user prompt that needs a capability no available tool provides (resolve by tool-name SUFFIX, never by server prefix: a claude.ai connector or a user-level server satisfies it too) STOPS before the step and names the capability + how to enable it; never a silent fallback to another tool, and never an alarm at session start for a server someone disabled: canon `agentic-qa-core/references/mcp-capabilities.md`.

## 11. SCRIPTS = READ `package.json` DIRECTLY

11. **SCRIPTS = READ `package.json` DIRECTLY**. NEVER quote test/build commands from this file or any doc: drift kills. Open `package.json` first, then answer.

## 12. KATA MANIFEST = SOURCE OF TRUTH

12. **KATA MANIFEST = SOURCE OF TRUTH**. `kata-manifest.json` (root) is authoritative registry of every existing Component + ATC. Before proposing new `Page`, `Api`, `Steps` module, or `@atc('PROJ-XXX')` ID: MUST load `kata-manifest.json` and check it. Anti-duplication gate. Stale manifest blocks commits via `.husky/pre-commit`. Regenerate: `bun run kata:manifest`. Validate: `bun run kata:manifest:check`.

## 13. CONCISION COMES FROM §2, NOT FROM A PLUGIN

13. **CONCISION COMES FROM §2, NOT FROM A PLUGIN**: Concision comes from §2 (Butler + PM Voice) and the user-level OUTPUT STYLE. No communication-mode plugin is assumed or recommended. Butler controls granularity (a terse headline plus an atomic menu the user pulls from), PM Voice controls register, OUTPUT STYLE controls how the reply looks and sounds. A harness plugin that rewrites the register (a word-compression mode, a persona) is the user's own user-level choice: the repo does not install it, does not depend on it, and writes no rule whose meaning changes when it is present.

## 14. LANGUAGE DETECTION + MIRRORING

14. **LANGUAGE DETECTION + MIRRORING**: At start of every conversation, READ FULL USER MESSAGE (not just opening words) to detect user's working language. Mirror that language in ALL conversational replies (questions, summaries, explanations, status updates). Repo artifacts ALWAYS English regardless of conversation language: code, code comments, commits, PR titles + bodies, branch names, file names, test names, configuration values, + any external action artifact (Jira issues/comments, GitHub issues/PRs/comments, Slack messages, emails, deploy notes, MCP tool inputs). Override: if user explicitly request another language for specific artifact ("crea el ticket en español", "write this PR description in Spanish"), honor that request only for that artifact + continue defaulting to English for next ones unless re-requested.

## 15. NO GLOBAL DISCARDS (MULTI-SESSION SAFETY)

15. **NO GLOBAL DISCARDS (MULTI-SESSION SAFETY)**: PROHIBITED to run repo-wide destructive git commands: `git restore .`, `git checkout -- .`, `git reset --hard`, untargeted `git stash`, `git clean -f`. Multiple agent sessions may share this working tree without worktrees: a global discard silently destroys another session's uncommitted work, unrecoverably. Discard ONLY explicit paths YOU modified in THIS session (`git restore <path>...` / `git stash push <path>...`). Unsure who modified a file → do NOT restore it: ask the user.

## 16. A SUCCESS CODE DESCRIBES THE CALL, NEVER THE OUTCOME — VERIFY AT THE DESTINATION

16. **A SUCCESS CODE DESCRIBES THE CALL, NEVER THE OUTCOME — VERIFY AT THE DESTINATION**: `ok: true`, exit 0, `accepted`, `delivered` and a returned id all say the REQUEST was well formed. None of them says the thing happened. Measured on four surfaces in one day: a message delivered to the WRONG session by prefix match and returned success; a terminal created for a command that died in the shell; a send receipt carrying `"delivered_at": null, "read": 0` in the same payload that proved acceptance; a dispatch still reading `dispatched` against a terminal that had been replaced. **A green receipt is the most dangerous kind of green, because the successful receipt SUPPRESSES the verification that would have caught the failure.** So: a write is verified by READING IT BACK from the destination, a message by the recipient answering it, a transition by re-reading the issue's status, a file write by re-parsing the file, a dispatch by the worker's own first report. This is not orchestration-specific — it binds subagent reports, `[ISSUE_TRACKER_TOOL]` writes, MCP calls, the updater and every CLI in §6.5. Where the cost of verifying is genuinely high, SAY the claim is unverified rather than letting the receipt stand in for it.

## 17. COMMITTED PROSE NAMES THE SOURCE OF TRUTH, NEVER ITS CURRENT VALUE

17. **COMMITTED PROSE NAMES THE SOURCE OF TRUTH, NEVER ITS CURRENT VALUE**: text that is committed (this file, `.agents/**`, `docs/**`, `README.md`, `INSTALLER.md`, `.env.example`, the decks) NEVER states a fact that changes with the normal life of the repo or the tracker. Forbidden: a COUNT that moves (tests, ATCs, skills, aliases, MCP servers, Jira fields / components / work types / statuses, files, rows, gates `N/N`, tokens); an ENUMERATION of a mutable set owned elsewhere (the skill list, the alias list, the server list, the custom-field list, the test-file list); a `file:line` citation (a path, a symbol or a heading is fine); a CURRENT-STATE claim ("today", "currently", "newest", "as of <date>", a measured size or timing, a tool version, a PR or issue number as live state); and EDIT-HISTORY narration inside doctrine ("since <version>", "correcting an earlier claim"). Every one goes stale within weeks, and then every session either trusts a wrong value or burns a turn reporting the drift. Write the NAME of the owner instead and let the reader resolve it: a file (`.mcp.json`), a command (`bun run skills:registry`), a generated artifact (`REGISTRY.md`), a constant (`CONFIG_BLOCK_READERS`). STABLE names that change only by decision are fine: stage names, KATA layers, rule numbers, file and command names, "three hosts". EXEMPT: gitignored files and `.session/**`, generated artifacts (the business context maps inside their skills included), ADRs / changelogs / dated reports (a number "at the time" is right forever), test fixtures, code constants, example output inside fenced blocks. A fact that must be stated with its date goes to an ADR and the doctrine links to it; the measurements behind this repo's own doctrine are in `.context/ADR/ADR-0006-forensic-measurements-ledger.md`. `scripts/lint-skills.ts` and `scripts/lint-docs.ts` flag the two regex-visible families (`FILE-LINE`, `CURRENT-STATE`); a line that must carry one is marked `volatile-ok: <reason>`. Canon + examples: `agentic-qa-core/references/volatile-facts.md`.
