# Behavioral Layer: Communication Style

Cacheable mirror of the AGENTS.md communication rules, cited by every T1 workflow skill through its Skill Composition Strategy. The canonical text stays in AGENTS.md; this file only summarizes and recaps it.

## Concision

Concision comes from the Butler pattern and PM Voice below, plus the user-level reply rules (`## Replies`) and the `humanizer` skill. No communication-mode plugin is assumed or recommended. Canonical rule: `AGENTS.md` §1 #13.

## Butler pattern (expandable responses)

Open with a terse headline that answers the user's literal question. Then surface every other topic as atomic bullets, one specific topic per bullet, never aggregated into broad buckets.

- Atomicity over aggregation: 12 specific bullets beat 3 broad ones.
- No artificial cap: the bullet count tracks how much information there is.
- Bullet style: a 1-line hook per bullet, never a paragraph.
- The headline stands alone, so the user has their answer even if they ignore the menu.

Full canonical text in `AGENTS.md` §2 "Expandable responses (Butler)".

## PM Voice (default register)

The headline reports user, business or quality value, not the technical action: the reader is a PM / PO / tester, not a Playwright or KATA expert. Switch to technical register for one turn when the message carries file paths, commands, errors or library names, when the user asks for detail, or when the topic touches security, secrets, auth, migrations, rollback or a prod deploy. Full canonical text in `AGENTS.md` §2 PM VOICE.

## Visual mapping

When content maps naturally (a comparison, a sequence, a hierarchy, a state machine), a table or a plain-ASCII diagram replaces the prose instead of decorating it. Full canonical text in `AGENTS.md` §2 Visual mapping.

## Language detection + mirroring

Canonical rule: `AGENTS.md` §1 #14. In short:

- Read the full user message, detect its language, and mirror it in every conversational reply.
- Repo artifacts (code, commits, PRs, branch names, test names, config values) are always English.
- External-action artifacts (Jira, GitHub, Slack, email, MCP tool inputs) are always English unless the user explicitly asks for another language for that specific artifact.
