# Session Footer Contract (shared, chat-facing)

> Cited by: the 6 workflow skills (`shift-left-testing`, `sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `framework-development`). Reference/utility skills are exempt (they run inside a workflow session that already honors this).

Chat-facing reporting contract: two things the AI must surface to the human operator **without being asked**, every session, in every workflow skill. Neither block goes into a Jira comment, ATR body, or any ticket-facing artifact — those keep their own templates and voice; this contract governs the terminal/chat conversation only.

**Gate:** if you are about to tell the user a session/flow is done and you haven't printed the two blocks below, stop — you're not actually done reporting.

**Why it exists (real precedent, sibling project, 2026-07-06/07):** after a full sprint-testing run, the operator had to explicitly ask for the annotated bug screenshot's relative path to open it, and separately ask which tools and testing levels were actually applied — a business-outcome summary alone didn't make that legible. Both questions are cheap to pre-empt and expensive to keep re-asking; hence a standing contract instead of a one-off answer.

---

## Part 1 — Evidence path surfacing (whenever a screenshot exists)

Two trigger points; **both** apply:

**1a. At the moment, not deferred.** The instant a screenshot/annotation is captured and relevant, state its **repo-relative** path in chat in that same turn. Extra weight on annotated bug images — the human's next move is almost always "attach that to the bug", so the path must be sitting right there ready to copy.

**1b. Consolidated at session close.** The final chat report of ANY completed workflow session includes the full list of every screenshot/annotation the session captured. Bug annotations lead the list.

Template:

```
### Screenshots (relative paths)
Bug annotations:
- .context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/evidence/{KEY}-BUG-{BUG-KEY}-annotated.png

Other evidence:
- .context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/evidence/{KEY}-ac1-{label}.png
- .context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/evidence/{KEY}-smoke-{label}.png
```

Rules:

- Omit the "Bug annotations" group entirely if none exist this session — no empty headings.
- **Repo-relative paths** here (they open inline in chat/editor). The Evidence Handoff (`sprint-testing/references/reporting-templates.md` §3.5) deliberately uses FULL ABSOLUTE paths because it instructs the human to open the OS file browser. Produce both where both apply — they don't conflict.
- List only files verified on disk (`ls` the evidence dir) — never claim a capture a subagent only *said* it took. Canon: `evidence-conventions.md` §3.

## Part 2 — Session-close footer: tools used + testing levels touched

Printed once, at session/flow close, in chat:

- **Skills loaded** — every skill invoked this session (the orchestrating workflow skill itself, plus anything loaded inside it or inside its subagents).
- **MCPs used** — every MCP server actually *called* (not just connected).
- **CLIs used** — every CLI tool actually invoked.
- **Testing levels touched** — one line per testing-pyramid level the session actually exercised, each with a one-clause note of WHAT was done there. Say **"none"** explicitly for an expected-but-untouched level — never omit it silently, and never pad coverage that didn't happen.

Template:

```
### Session Footer — Tools & Testing Levels
Skills loaded: sprint-testing, acli, playwright-cli, bug-screenshot-annotation
MCPs used: dbhub, openapi
CLIs used: acli, playwright-cli, curl, bun (jira:sync-issues, api:login)
Testing levels touched:
- UI/E2E — Playwright-driven AC pass on /orders, admin + customer roles
- Database — 5 SELECT probes verifying persistence + trigger totals
- API — exercised via curl (POST /orders happy + 400 matrix); RLS probe VERIFIED
- Unit — none
- Accessibility / Performance / Security — none (out of scope for this ticket)
```

### Framing per skill type

| Skill | Framing | "Testing levels touched" means |
|---|---|---|
| `sprint-testing`, `shift-left-testing`, `regression-testing` | **Execution** | Which pyramid levels were manually/exploratorily (or via CI suite) exercised: Unit, API/Integration, Database, UI/E2E, Cross-browser, Accessibility, Security, Performance. |
| `test-automation` | **Authoring** | Which levels got NEW automated coverage written (Unit, API, E2E/UI) + which KATA layer the code landed in (L2 base / L3 component / Steps / fixture / spec). |
| `test-documentation` | **Curation** | How the TCs processed this session break down by level — e.g. "6 API-level Candidates, 2 UI-level Candidates, 1 Manual". |
| `framework-development` | **Meta** | Which verify surfaces ran (types / lint / skills-lint / test suite) + which framework layers were touched; product-testing levels are usually all "none (meta-work)". |

## Multi-subagent aggregation rule

No single subagent sees the whole session — the **orchestrator** is the one place that can compile this footer. Two options:

1. **Schema-driven (preferred for dispatch-heavy flows):** every stage subagent's structured report includes the fields below; the orchestrator unions them at close.
2. **Orchestrator-tracked:** the orchestrator records tools/levels as it dispatches (fine for simpler flows).

Either way: the footer is compiled ONCE, by the orchestrator, at the very end — never per-stage, never per-subagent (that fragments it into partial, confusing blocks).

### Briefing snippet (paste into component 6 — Report format)

> **Session-footer fields (mandatory in your structured report):** `skills_loaded` (array), `mcps_used` (array), `clis_used` (array), `testing_levels_touched` (array of `{level, note}`; include a `{level, note: "none"}` entry for any pyramid level your stage would normally be expected to touch but didn't), `screenshots_captured` (array of repo-relative paths, tagging which ones are bug annotations). Never omit any of the five fields even if empty — report empty arrays explicitly rather than dropping the field.
