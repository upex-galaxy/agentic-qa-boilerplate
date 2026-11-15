# Session Footer Contract (shared, chat-facing)

> Cited by: every skill marked `metadata.stage_owner: true` in its frontmatter. Reference and utility skills are exempt (they run inside a workflow session that already honors this).

A chat-facing reporting contract. In every workflow skill, every session, the AI tells the human operator two things without being asked: where the screenshots are, and which tools and testing levels the session used. Neither block goes into a Jira comment, ATR body or any ticket-facing artifact. Those keep their own templates and voice, and this contract governs the terminal and chat conversation only.

The gate: before telling the user a session or flow is done, print the two blocks below. Without them the reporting is not finished.

The reason, from a real precedent on a sibling project (ADR-0006): after a full sprint-testing run, the operator had to ask for the annotated bug screenshot's relative path to open it, and separately ask which tools and testing levels were actually applied. A business-outcome summary alone did not make that legible. Both questions are cheap to answer up front and expensive to keep re-asking, so the answer is a standing contract.

---

## Part 1 · Evidence path surfacing (whenever a screenshot exists)

Two trigger points, and both apply.

1a. Immediately. The moment a screenshot or annotation is captured and relevant, state its repo-relative path in chat in that same turn. Annotated bug images matter most: the human's next move is almost always "attach that to the bug", so the path should sit ready to copy.

1b. Consolidated at session close. The final chat report of any completed workflow session lists every screenshot and annotation the session captured. Bug annotations lead the list.

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

- Omit the "Bug annotations" group when none exist this session. No empty headings.
- Use repo-relative paths here, since they open inline in chat and the editor. The Evidence Handoff (`sprint-testing/references/reporting-templates.md` §3.5) links the evidence pages and names the local pack by its full absolute path, for the operator on this machine (and lists absolute screenshot paths only while a page is not published yet). Produce both where both apply. They do not conflict.
- List only files verified on disk (`ls` the evidence dir). A capture a subagent only said it took does not count. Canon: `evidence-conventions.md` §3.

## Part 2 · Session-close footer: tools used and testing levels touched

Printed once, in chat, at session or flow close:

- Skills loaded: every skill invoked this session (the orchestrating workflow skill itself, plus anything loaded inside it or inside its subagents).
- MCPs used: every MCP server actually called, not just connected.
- CLIs used: every CLI tool actually invoked.
- Testing levels touched: one line per testing-pyramid level the session exercised, each with a one-clause note of what was done there. Say "none" for an expected-but-untouched level, so the omission is visible, and do not pad coverage that did not happen.
- Refinements proposed: `N → <path>` where the path is the running skill's `.session/<skill-slug>/<scope>/refinements.md` (`skill-refinement-protocol.md` §2). `0` when none, with no path. The session never applies its proposals; the line tells the human there is something to review.

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
Refinements proposed: 1 → .session/sprint-testing/PROJ-277/refinements.md
```

### Framing per skill type

| Skill | Framing | "Testing levels touched" means |
|---|---|---|
| `sprint-testing`, `exploratory-testing`, `shift-left-testing`, `regression-testing`, `sprint-conductor` (the levels its workers' ATRs exercised, read from the close reports) | Execution | Which pyramid levels were manually or exploratorily (or via CI suite) exercised: Unit, API/Integration, Database, UI/E2E, Cross-browser, Accessibility, Security, Performance. |
| `test-automation` | Authoring | Which levels got new automated coverage written (Unit, API, E2E/UI) and which KATA layer the code landed in (L2 base / L3 component / Steps / fixture / spec). |
| `test-documentation` | Curation | How the TCs processed this session break down by level, for example "6 API-level Candidates, 2 UI-level Candidates, 1 Manual". |
| `framework-development` | Meta | Which verify surfaces ran (types / lint / skills-lint / test suite) and which framework layers were touched. Product-testing levels are usually all "none (meta-work)". |

## Multi-subagent aggregation rule

No single subagent sees the whole session, so the orchestrator is the one place that can compile this footer. Two options:

1. Schema-driven (preferred for dispatch-heavy flows): every stage subagent's structured report includes the fields below, and the orchestrator unions them at close.
2. Orchestrator-tracked: the orchestrator records tools and levels as it dispatches (fine for simpler flows).

Either way the orchestrator compiles the footer once, at the very end. A footer per stage or per subagent fragments it into partial, confusing blocks.

### Briefing snippet (paste into component 6, Report format)

> **Session-footer fields (mandatory in your structured report):** `skills_loaded` (array), `mcps_used` (array), `clis_used` (array), `testing_levels_touched` (array of `{level, note}`; include a `{level, note: "none"}` entry for any pyramid level your stage would normally be expected to touch but didn't), `screenshots_captured` (array of repo-relative paths, tagging which ones are bug annotations). Never omit any of the five fields even if empty: report empty arrays explicitly rather than dropping the field.

## With nobody at the keyboard

Nothing here waits for a person. A supervised worker puts the five fields in its report, and the conductor compiles the footer for the fleet. A routine prints the footer in its final report, which is where a person reads it later.
