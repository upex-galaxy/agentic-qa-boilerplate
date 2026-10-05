# Secret hygiene: credentials by name, never by value

> Canon for Critical Rule #1 (`AGENTS.md` §1, full text in `.agents/instructions/agent-critical-rules.md` §1). The rule binds; this file is the working detail: which files and commands are off-limits, the safe forms that replace them, how to check whether a variable is set, and what to do when a value leaks.

A secret VALUE that reaches the model context also reaches the provider request and the local session transcript, and neither can be taken back. Using a secret by NAME inside a command is not an exposure; printing it is. Every rule below follows from that one distinction.

## 1. What counts as a secret

| Secret: the human types it, the AI only names it | Not a secret: the AI may write it into `.env` when asked |
|---|---|
| anything marked `@sensitive` in `.env.schema` / `.env.core.schema` | URLs (`API_BASE_URL`, `PORTAL_URL`) |
| passwords, API keys, tokens, client secrets, webhook URLs that embed a token | project keys, issue keys (`XRAY_PROJECT_KEY`, `JIRA_PROJECT_KEY`) |
| session material: `.auth/**` state files, cookies, minted API tokens | flags and switches (`AUTO_SYNC`, `HEADLESS`, `TMS_PROVIDER`) |
| anything obviously secret even when the schema forgot to mark it | ports, timeouts, paths, environment names |

When in doubt, treat it as a secret. The schema is the source of truth for the `@sensitive` marking; a missing marking on an obvious secret is a schema bug to report, not a permission.

## 2. Files the AI never opens

| Never open (no `Read`, `cat`, `grep`, `head`, `sed`, `less`) | Safe to read: names and references only |
|---|---|
| `.env`, `.env.local`, `.env.*.local` | `.env.example` |
| `.auth/**` (token files, `api-state.json`, `<env>-<role>.json`, the `opencode/<VAR>` value files an older `harness:env` wrote, `harness-env-backup/<VAR>`) | the committed `.env*.schema` files: `.env.schema`, `.env.core.schema` and, when a project uses a secret manager, `.env.provider.schema` (`op://` references, never a value) |
| `.claude/settings.local.json` (an older `bun run harness:env` wrote MCP secrets into its `env` block; the current one retires them) | `.mcp.json`, `opencode.jsonc`, `.codex/config.toml` (they hold the `.env` loader's `--filter` names) |

Sourcing a file inside the same command that uses it is using it by name: `source .auth/tokens.env && curl -H "Authorization: Bearer $API_TOKEN_<ROLE>_<ENV>" ...` is the API doctrine's form (`api-testing-doctrine.md`) and stays allowed. Printing what the file holds is not.

## 3. Commands that print a value, and their safe forms

| Never | Why | Safe form |
|---|---|---|
| `printenv`, `env`, `export -p`, `set` | dumps every variable of the agent's shell, secrets included | `test -n "${NAME+x}" && echo set \|\| echo unset` |
| `echo $SECRET`, `echo "$SECRET"` to the terminal | prints the value | use `$SECRET` as an argument or pipe it: `printf %s "$SECRET" \| <tool> --stdin` |
| `set -x`, `bash -x` | echoes every expanded command line | leave tracing off when a command carries a secret |
| `curl -v`, `curl --trace` | prints the `Authorization:` header | `curl -sS` (add `-o /dev/null -w '%{http_code}'` for a status probe) |
| `varlock printenv`, `varlock reveal`, `varlock load --format env\|shell\|json\|json-full` without `--agent` | print raw values | `bunx varlock load --agent` (redacted) |
| `grep '^NAME=' .env`, `source .env`, `set -a; . .env` | read the raw file into the agent's shell | run the step inside the loader: `bunx varlock run -- <cmd>` (wrap in `sh -c '...'` when it pipes) |
| starting a harness inside a loader: `varlock run -- claude`, `dotenv -- codex`, a `package.json` script that does it | exports every `.env` value into the AI's own process, where any command it runs can read them | open the harness bare (`claude`, `codex`, `opencode` or the desktop app): every MCP server and every repo script loads `.env` itself |
| `sed -i ... .env`, `echo NAME=... >> .env`, a heredoc into `.env` | edits a file the AI must not open, and echoes the neighbouring lines on a mistake | `bun run env:set NAME=value` (non-sensitive keys only, §5) |
| `gh secret set NAME --body "$NAME"` | puts the value in argv (visible in the process list) | `bunx varlock run -- sh -c 'printf %s "$NAME" \| gh secret set NAME'` |
| `playwright-cli fill <ref> "$PASSWORD"` without `--raw` | echoes the typed value in the tool output | `playwright-cli --raw fill <ref> "$PASSWORD"` (`browser-sessions.md`) |

A secret in a value position of a command the AI writes is still a secret in the transcript. The command text carries `$NAME`; the shell expands it; the output carries only the result.

## 4. Checking whether a variable is set

`bunx varlock load --agent` resolves the schema and prints every item by name, with each `@sensitive` value redacted to a short prefix. It is the presence check for this repo.

Never run `varlock load` (even `--agent`) against a schema you have not checked for `@sensitive` coverage: `--agent` redacts only the items the schema marks sensitive and prints every other value in clear, including one inherited from the shell. Scratch schemas are banned. The committed ones are checked by `bun run vars:schema:check`, which fails on any secret-looking key without `@sensitive`.

```bash
bunx varlock load --agent                      # every variable, redacted
bunx varlock load --agent --filter 'DBHUB_*'   # one family
bunx varlock load --agent --filter NAME        # one variable; {} when it is absent
```

It also sees keys present in `.env` but not declared in the schema (redacted), so it answers "is a stale `ATLASSIAN_URL` still in `.env`?" without opening the file. For the PROCESS environment (a value inherited from whatever spawned the session) use the `test -n "${NAME+x}"` form of §3, which prints only `set` / `unset`. `bun run vars:env:check` adds the parity view (manifest vs `.env.example`, process vs `.env`) and masks secrets; `bun run setup:doctor` runs the same schema check in its "Env schema (varlock)" section.

A missing or wrong secret is the human's to fix: name the variable, say which check failed, point to `.env` (or the secret manager) and stop. Never ask the human to paste the value into the chat, and never echo one back. After the human fixes a value an MCP server reads, restart the session: the server reads `.env` through the `.env` loader when the harness spawns it (Critical Rule #10).

## 5. Writing values

The AI never writes a secret into `.env`, `.env.local`, a harness file or any committed file. It MAY write a non-sensitive value (§1, right column) into `.env` when the human asks for it, and `bun run env:set KEY=value [KEY2=value2 ...]` is the ONLY sanctioned way to do it: never `sed`, a heredoc, `>>` or an editor tool on `.env`. The script (`scripts/env-set.ts`):

- refuses a key the schema marks `@sensitive`, a key the schema does not declare, a key whose name reads as a secret (`PASSWORD`, `SECRET`, `TOKEN`, `API_KEY`, ...) even when the decorator is missing, and a key whose value does not live in `.env` (`ATLASSIAN_URL`). One refusal writes nothing;
- replaces the key's active line in place (or appends it), leaving every other line byte-identical;
- prints key NAMES only, never the new value or any other line, and says when `.env.local` also sets the key (that file wins and stays the human's).

Seeding `.env` from `.env.example` with empty slots is fine; filling the secret slots is the human's step, in their own terminal (`$EDITOR .env`) or in the secret manager.

## 6. Harness enforcement

The rule text binds the AI; the harness deny rules are the net under it.

| Host | What refuses the reads | Measured behaviour |
|---|---|---|
| Claude Code | `.claude/settings.json` `permissions.deny`: `Read(.env)`, `Read(.env.local)`, `Read(.env.*.local)`, `Read(.auth/**)`, `Read(.claude/settings.local.json)`, `Bash(printenv*)`, `Bash(env)`, `Bash(varlock printenv*)`, `Bash(varlock reveal*)` and their `bunx` forms | a `Read(...)` deny refuses the Read tool and Bash `cat` / `grep` / `head` on the path, and a listing of a denied directory; it applies in every permission mode. It does NOT refuse `source FILE` / `. FILE`, nor a subprocess that opens the file itself |
| OpenCode | `opencode.jsonc` `permission.read` (path wildcards, matched against the relative path) and the secret entries at the end of `permission.bash` | `.env.example` and both schemas stay readable; `source .auth/tokens.env` asks instead of being denied |
| Codex | `[shell_environment_policy] inherit = "core"` in `.codex/config.toml` keeps secret variables out of the shell commands Codex runs | no file-read deny is configured for Codex in this repo: the rule text is the only guard against Codex opening `.env` |

A project scaffolded before a deny rule shipped receives it on the next `bun run up`: the updater appends the upstream `permissions.deny` entries `.claude/settings.json` lacks (an entry the project does not want goes in `updater.declined_denies` in `.agents/project.yaml`), and reports the OpenCode rules `opencode.jsonc` lacks as a block to paste, never a write.

Deny rules match patterns, so they can be bypassed (`node -e 'console.log(process.env)'`). That is a breach of Critical Rule #1, not a loophole in it.

## 7. When a value leaks

1. Stop. Do not repeat the value, quote it, or "redact" it by retyping part of it.
2. Tell the human, by variable NAME, where it appeared (which command, which tool output).
3. Recommend rotating it. The transcript and the provider request keep the value; only rotation makes it worthless. The human decides.
4. Fix the command or instruction that printed it, so the next session does not repeat it.
