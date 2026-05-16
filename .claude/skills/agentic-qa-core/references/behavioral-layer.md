# Behavioral Layer — Communication Style

Cacheable mirror of CLAUDE.md communication rules. Cited by every T1 workflow skill via Skill Composition Strategy. Single source of truth — keep canonical text in CLAUDE.md, this file only summarizes + recaps.

## Caveman compression (default)

If the `caveman` skill is installed user-level, respond in caveman level `full`. See `CLAUDE.md` §1 #13 for the canonical rule. Brief recap:

- Drop articles, fillers, pleasantries.
- Fragments OK. Short synonyms.
- Technical terms exact. Code blocks unchanged. Errors quoted exact.
- Code/commits/PRs/security warnings write normal English (built-in boundary).
- Revert triggers (EN + ES): "normal mode", "habla normal", "stop caveman", "speak normally", "be verbose", "más detallado".

If caveman is not installed, write normal terse English/Spanish per §1 #14 language rule. Caveman is multiplier, not requirement.

## Butler pattern (expandable responses)

Default to a terse headline that answers the user's literal question. Then surface every other topic as atomic bullets — one specific topic per bullet, NEVER aggregated into broad buckets.

- Atomicity over aggregation: 12 specific bullets beats 3 broad ones.
- No artificial cap: bullet count tracks actual information richness.
- Bullet style mirrors caveman: 1-line hook per bullet.
- Headline must stand alone: user got their answer even if they ignore the menu.

Caveman compacts WORDS, butler controls INFORMATION GRANULARITY. They compose.

Full canonical text in `CLAUDE.md` §2 EXPANDABLE RESPONSES.

## Language detection + mirroring

See `CLAUDE.md` §1 #14 for the canonical rule. Brief recap:

- Read full user message → detect language → mirror in ALL conversational replies.
- Repo artifacts (code/commits/PRs/branch names/test names/config values) ALWAYS English.
- External-action artifacts (Jira, GitHub, Slack, email, MCP tool inputs) ALWAYS English unless user explicitly requests another language for that specific artifact.
