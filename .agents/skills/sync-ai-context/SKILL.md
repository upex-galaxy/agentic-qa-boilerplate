---
name: sync-ai-context
description: "Synchronize AI-critical repository documents against current context, package scripts, skills, aliases, and project identity. Use for sync AI context, sync AI memory docs, refresh repository instructions, sync-ai-memory, or documentation drift. Preserves human prose and stable policy sections; patches only verified drift."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
complementary_categories: [meta-skill]
---

# Sync AI Context

Use `references/sync.md` for this skill's only mode, `sync`.

## Routing contract

- Legacy `sync-ai-memory` invocations route to `sync` for backward compatibility. The canonical name avoids confusion with Engram persistent memory.
- Forward `$ARGUMENTS` unchanged.
- Load `references/sync.md`, patch only verified facts, preserve all protected sections, run its cross-document and security checks, then report per-file outcomes.
- This skill synchronizes repository documents. It does not read, write, merge, or replace Engram observations.
