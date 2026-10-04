# Behavioral Layer — Communication Style

Cacheable mirror of AGENTS.md communication rules. Cited by every T1 workflow skill via Skill Composition Strategy. Single source of truth — keep canonical text in AGENTS.md, this file only summarizes + recaps.

## Caveman compression (default)

If the `caveman` skill is installed user-level, respond in caveman level `full`. See `AGENTS.md` §1 #13 for the canonical rule. Brief recap:

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

Full canonical text in `AGENTS.md` §2 EXPANDABLE RESPONSES.

## PM Voice (default register)

The headline reports user, business or quality value, not the technical action: the reader is a PM / PO / tester, not a Playwright or KATA expert. Switch to technical register for one turn when the message carries file paths, commands, errors or library names, when the user asks for detail, or when the topic touches security, secrets, auth, migrations, rollback or a prod deploy. Full canonical text in `AGENTS.md` §2 PM VOICE.

## Visual mapping

When content maps naturally (a comparison, a sequence, a hierarchy, a state machine), a table or a plain-ASCII diagram replaces the prose instead of decorating it. Full canonical text in `AGENTS.md` §2 VISUAL MAPPING BIAS.

## Language detection + mirroring

See `AGENTS.md` §1 #14 for the canonical rule. Brief recap:

- Read full user message → detect language → mirror in ALL conversational replies.
- Repo artifacts (code/commits/PRs/branch names/test names/config values) ALWAYS English.
- External-action artifacts (Jira, GitHub, Slack, email, MCP tool inputs) ALWAYS English unless user explicitly requests another language for that specific artifact.
