# shellcheck shell=sh
# Framework gates — SYNCED by the boilerplate updater (`husky` component).
#
# WHY THIS FILE EXISTS. `.husky/pre-commit` and `.husky/pre-push` are on the
# updater's PROTECTED_WATCHLIST: delivered once when missing, then never
# overwritten, because a project's own gates live in them. The consequence was
# that a gate added upstream never reached a project scaffolded earlier — four
# of them had already failed to land anywhere downstream. This file carries the
# gates upstream owns and IS synced; each hook sources it and calls one
# function, keeping its own ordering and its own extra gates around that call.
#
# CONTRACT FOR A HOOK. Source this file, then call the function for the hook:
#
#   GATES="$(dirname -- "$0")/framework-gates.sh"
#   if [ -f "$GATES" ]; then . "$GATES"; framework_gates_pre_commit; fi
#
# The guard is not decoration: `.husky/_/h` runs the hook under `sh -e`, so a
# `.` on a file that is not there kills the hook outright. A rollback, a sparse
# checkout or a half-applied sync can leave the hooks present and this file
# absent, and a repo in that state must still be committable.
#
# CONTRACT FOR THIS FILE. Only gates every scaffolded project can run. No
# package.json script key that does not already exist in every project (see the
# note in `framework_gates_pre_push`), no project-specific paths, POSIX sh only.
# Adding a gate here is how it reaches every downstream repo on the next sync.

# Gates that run on EVERY commit. Fast, full-repo, plus the freshness checks
# that only matter when the staged set touches what they guard.
framework_gates_pre_commit() {
  # Light-weight repo health checks on every commit (fast, cover full repo).
  bun run types:check
  bun run vars:check
  bun run skills:check

  _fg_staged=$(git diff --cached --name-only --diff-filter=ACMRD)

  # kata-manifest freshness gate — only runs when staged files affect it.
  if echo "$_fg_staged" | grep -qE '^(tests/components/|scripts/kata-manifest\.ts$|kata-manifest\.json$)'; then
    bun run kata:manifest:check || {
      echo ""
      echo "❌ kata-manifest.json is stale. Fix:"
      echo "   bun run kata:manifest && git add kata-manifest.json"
      exit 1
    }
  fi

  # project-schema freshness gate — only runs when staged files affect it.
  #
  # TWO guards, both load-bearing. The package.json grep honours this file's
  # contract ("no script key that does not already exist in every project"): a
  # project synced to this release's husky but not its package.json would
  # otherwise have every commit touching `.agents/` killed by a missing script.
  # And `agents:schema:check` itself exits 0 with a note in any repo that is NOT
  # the boilerplate, because the schema is SYNCED there rather than generated —
  # so even when the key IS present downstream, this gate cannot fail for a
  # reason the project can do nothing about.
  if echo "$_fg_staged" | grep -qE '^(\.agents/project\.yaml$|\.agents/project\.schema\.yaml$|cli/lib/agents-schema\.ts$|scripts/agents-schema\.ts$)' \
    && grep -q '"agents:schema:check"' package.json 2>/dev/null; then
    bun run agents:schema:check || {
      echo ""
      echo "❌ .agents/project.schema.yaml is stale. Fix:"
      echo "   bun run agents:schema && git add .agents/project.schema.yaml"
      exit 1
    }
  fi

  # env-schema freshness gate — only runs when staged files affect it, and only
  # where the script exists (same two guards as the project-schema gate above).
  # `.env.core.schema` is GENERATED from cli/lib/variables-manifest.ts; the check
  # also loads the committed schema pair through the pinned varlock, so a
  # varlock bump that breaks the import fails here, not in someone's session.
  if echo "$_fg_staged" | grep -qE '^(cli/lib/variables-manifest\.ts$|cli/lib/env-schema\.ts$|scripts/env-schema\.ts$|\.env\.core\.schema$|\.env\.schema$|package\.json$)' \
    && grep -q '"vars:schema:check"' package.json 2>/dev/null; then
    bun run vars:schema:check || {
      echo ""
      echo "❌ .env.core.schema is stale or the schema pair does not load. Fix:"
      echo "   bun run vars:schema && git add .env.core.schema"
      exit 1
    }
  fi

  # skill-registry freshness gate — only runs when staged files affect it.
  if echo "$_fg_staged" | grep -qE '^(\.agents/skills/.+/SKILL\.md$|scripts/build-skill-registry\.ts$|\.agents/skills/REGISTRY\.md$)'; then
    bun run skills:registry:check || {
      echo ""
      echo "❌ .agents/skills/REGISTRY.md is stale. Fix:"
      echo "   bun run skills:registry && git add .agents/skills/REGISTRY.md"
      exit 1
    }
  fi

  # cross-harness compatibility gate — only runs when staged files affect it.
  # Covers the generated Claude skills alias, the command wrappers, the three hook
  # adapters and MCP parity across the three host configs. Everything it guards is
  # generated or mirrored, so a hand-edit is invisible to every other check.
  if echo "$_fg_staged" | grep -qE '^(\.agents/compatibility/|\.agents/hooks/|\.claude/commands/|\.opencode/commands/|\.opencode/plugins/|\.codex/|\.claude/settings\.json$|\.mcp\.json$|opencode\.jsonc$|cli/lib/agent-compatibility.*\.ts$|scripts/agent-compatibility.*\.ts$)'; then
    bun run agents:compat:check || {
      echo ""
      echo "❌ Cross-harness compatibility is out of contract. Fix:"
      echo "   bun run agents:compat   # regenerates wrappers + repairs the Claude skills alias"
      echo "   then re-stage whatever it rewrote under .claude/commands/ and .opencode/commands/"
      exit 1
    }
  fi
}

# Gates that run before a PUSH: ONLY the checks pre-commit does not already run
# per-commit.
#
# pre-commit covers (every commit): types:check, vars:check, skills:check
#   + conditional kata:manifest:check (when staged files affect the kata manifest)
#   + conditional skills:registry:check (when staged files affect the registry).
# pre-push adds the full-repo checks pre-commit skips for speed:
#   - format:check / lint:check  full repo (lint-staged only touches staged files at commit)
#   - vars:env:check             not run at commit time. Runs with
#                                VARS_ENV_CHECK_DRIFT=warn: the manifest/.env.example parity
#                                rules stay FATAL (they describe the repo), but the
#                                process-env-vs-.env drift rule only WARNS here, because it
#                                describes the developer's machine — a stale variable in some
#                                ancestor shell must not block pushing an unrelated change.
#                                `bun run repo:check` (and any direct run) leaves the variable
#                                unset, so drift is a hard error there.
#   - skills:registry:check      unconditional safety net — a commit in the push range may
#                                have changed the registry without pre-commit catching it.
#   - kata:manifest:check        unconditional safety net — same rationale as the registry.
#   - agents:compat:check        unconditional safety net for the cross-harness contract:
#                                the generated `.claude/skills` alias, the command wrappers
#                                against `.agents/compatibility/command-aliases.json`,
#                                the three hook adapters, MCP parity for every server, and that eslint.config.js wires every block the synced base exports
#                                declared in .mcp.json across `.mcp.json` / `opencode.jsonc`
#                                / `.codex/config.toml`. All of it is generated or mirrored,
#                                so nothing else notices when a wrapper is hand-edited or an
#                                MCP is added to one host only.
#                                Fix is always `bun run agents:compat` (regenerates + repairs).
#   - git:policy verify          declared git_strategy vs the host's enforced ruleset —
#                                pre-push is exactly when that parity matters. Hook-safe by
#                                design: an unreachable host (offline, no gh, no auth) warns
#                                and exits 0 (absence of data is not drift), and divergences
#                                listed in git_strategy.policy.accepted_divergences report
#                                as ACCEPTED, not drift. Only UNACCEPTED drift blocks a push.
#   - varlock load               the developer's own .env against the committed env schema
#                                (.env.schema + .env.core.schema). WARN-ONLY in this phase: it
#                                describes the developer's machine, like vars:env:check's drift
#                                rule, and the runtime does not yet go through varlock. Runs
#                                only when the schema and the pinned devDependency are both
#                                present, so a project synced to this gates file but not to
#                                this package.json is untouched. Output is redacted by varlock
#                                (sensitive values never print); we still send it to /dev/null
#                                and name the command to rerun, so the hook stays quiet on green.
#
# Commands are still spelled out here rather than behind one aggregate npm script:
# every command below already exists in every scaffolded project, so this function
# cannot be broken by a package.json key that lands in a separate, partially-applied
# sync phase. The full suite (incl. types/vars/skills) lives in `repo:check` for
# CI / manual runs.
framework_gates_pre_push() {
  bun run format:check \
    && bun run lint:check \
    && VARS_ENV_CHECK_DRIFT=warn bun run vars:env:check \
    && bun run skills:registry:check \
    && bun run kata:manifest:check \
    && bun run agents:compat:check \
    && bun run git:policy verify \
    && framework_gate_varlock_warn
}

# The warn-only env-schema validation described above. A function so the
# `&&` chain in framework_gates_pre_push stays one expression: this never
# returns non-zero, because a red here is advice, not a block, until the
# runtime itself goes through varlock.
framework_gate_varlock_warn() {
  if [ -f .env.schema ] && grep -q '"varlock"' package.json 2>/dev/null; then
    if ! bunx varlock load --agent >/dev/null 2>&1; then
      echo ""
      echo "⚠️  varlock: your .env does not satisfy .env.schema (warn-only for now)."
      echo "   See what is missing (values are redacted):  bunx varlock load"
    fi
  fi
  return 0
}
