# Recon Fan-out (step Recon)

Read this when dispatching the Recon agents. The pattern is **Parallel** (`../../agentic-qa-core/references/dispatch-patterns.md`): one agent per surface or module, no shared state between them, all sent in a single parent message, at most `orchestration.max_workers` at once (`.agents/project.yaml`). Inside each agent the technique is the Trifuerza of `../../sprint-testing/references/exploration-patterns.md` (§1 UI, §2 API, §3 DB). Point the agent at it instead of copying it.

---

## 1. Per-agent structured schema (mandatory return shape)

Every Recon agent returns this shape instead of free prose, because Refute and Handoff consume it. The agent writes it to `recon/<surface>.json` in the session directory and returns the same object.

```json
{
  "surface": "orders (module or flow slice name)",
  "deployed": true,
  "checks_run": [
    "compared 4 orders with discounted and full-price lines",
    "verified the per-customer discount on 6 accounts"
  ],
  "anomalies": [
    {
      "title": "A discounted line total equals its full-price sibling line total",
      "severity_hypothesis": "High",
      "evidence": "order <id>: line total = X, its own quantity x unit price x (1 - discount) gives Y, sibling total = X",
      "repro": "SELECT ... (verbatim SQL or curl)"
    }
  ],
  "observed": [
    {
      "behaviour": "e2e#feature-orders/BR-002 (gap id), or a new kebab id when the maps lack it",
      "what": "the product did <X> when <action> with <data> as <role>",
      "env": "staging",
      "observed_live": true,
      "covered_by": [{ "test": "PROJ-7013", "verdict": "weak", "evidence": "checks the total, not the discount" }]
    }
  ],
  "fixtures_used": ["account <id> (from module-context)"],
  "created_rows": []
}
```

- `deployed: false` means the surface does not exist in this environment yet (missing endpoint, empty table, feature flag off). That is an environment blocker. It is not a bug, and it is not "tested, no anomalies".
- `anomalies[].severity_hypothesis` is a hypothesis. One agent's severity read is unreliable, which is why Refute exists, so a Critical call from Recon still goes through Refute.
- `observed[]` is the raw material of candidate scenarios. Set `observed_live: true` only when the agent executed the behaviour in the environment it names. A code read, a unit test or another environment is `observed_live: false` and cannot become a candidate on its own (`../../agentic-qa-core/references/discovery-driven-doctrine.md` §5.2).
- `observed[].covered_by` lists every existing test that claims the behaviour, taken from the coverage view the charter passed in, each with a verdict (`exercises` | `weak`) and one evidence line. It is empty when nothing claims the behaviour. A `weak` cover is not coverage.
- `created_rows` is required even when empty (`[]`), because it is the only cleanup ledger. Every row an agent creates goes in as `<table>:<id>` (or `<resource>:<id>` for a non-DB side effect) so Handoff can delete it and re-read.

---

## 2. Compare at least 2-3 rows before calling something anomalous

Generalizing from one row is the most common source of false positives in a fan-out. A loose `GROUP BY` or a single suspicious value is a lead, not evidence. Before an agent writes an anomaly into its report:

1. Find at least 2-3 more rows with the same shape.
2. Check whether the "anomaly" also shows up in rows that should be clean (a control group). If it does, it is probably a modeling choice.
3. Write the detection query precisely enough that a verifier can re-run it verbatim. "Looks off" is not reportable.

This rule comes from a measured case. A loose dedupe key matched dozens of records, and most were legitimate pairs that shared a description and a total by coincidence. The real defect, a handful of records whose value was copied instead of computed, only survived once the key included the fields of the computation and each record's own invariant was checked (`../../agentic-qa-core/references/adversarial-verification.md` §2).

---

## 3. Tool limits that bite harder in a fan-out

Recon touches many endpoints blind, not the known routes of one ticket:

- API: the OpenAPI MCP is schema-only, so authenticated calls go through `bun run api:login` and curl (`../../agentic-qa-core/references/api-testing-doctrine.md`). A schema that disagrees with the live response can be deploy lag, so check what is deployed before reporting it.
- DB: read the live schema before writing a query that leans on a column name (`../../agentic-qa-core/references/db-testing-doctrine.md`), because project docs drift.
- Roles: each role signs in through the app's own login only (`../../agentic-qa-core/references/browser-sessions.md` §4). A check that seems to need a shortcut is a blocker to report.

---

## 4. Never call anything that sends or pushes downstream

Recon fans out across surfaces where an agent has no ticket-level familiarity, and some effects cannot be undone. In every scope and mode, do not call an endpoint, job or command that sends a real email or notification, pushes data to an external system (accounting, payment, CRM, another team's tracker), or triggers a bulk operation on real accounts.

Read, list and preview endpoints of the same features are fine and often useful. The line is anything that sends or pushes downstream, not anything that reads.

A project lists its own endpoints under `## Never-call endpoints` in its project-owned `agent-project.md`. When that section exists, every Recon briefing carries it verbatim in component 7. When it does not, the rule above still applies, and an agent unsure whether a call sends something does not make it.

---

## 5. Mutation discipline

A mutation is allowed only to set up a precondition needed to observe a behaviour, and only within the mutation budget the charter set.

- Record every created row in `created_rows` the moment it is created, not from memory at the end.
- Clean up at Handoff: delete every recorded row and re-read it to confirm the delete committed. A delete that reports a timeout can still have committed, and one that reports success can have failed, so only the re-read counts (Critical Rule #16).
- A mutation can leave a trace beyond the row (an uploaded blob, a queued job). Name it in the session record for a human follow-up.
- A self-cleaning preview endpoint (its own insert and delete leave nothing behind) needs no manual cleanup, but check that claim once per session by re-reading the id range after calling it.

---

## 6. Briefing for a Recon agent

Fill the 7-component briefing (`../../agentic-qa-core/references/briefing-template.md`) for each agent. This example is a Module-Targeted dispatch on `orders`:

```markdown
**1. Goal**
Recon the orders module on <env> for anomalies in line totals and discounts, and characterize
every behaviour you observe. Return the schema in recon-fanout.md §1.

**2. Context docs**
- <<PRIMARY_ROOT>>/.session/exploratory-testing/<scope>/charter.md
- the module's module-context.md (absolute path)
- .agents/skills/exploratory-testing/references/recon-fanout.md
- .agents/skills/sprint-testing/references/exploration-patterns.md (§2 API, §3 DB)

**3. Project Standards (auto-resolved)**
<compact rules from .agents/skills/REGISTRY.md for exploratory-testing and the tool skills loaded>

**4. Skills to load**
- playwright-cli (only if this agent covers the UI sub-task)

**5. Exact instructions**
1. Read the business rules for the module from `bun run context:map business-data-context --section <id>`.
2. Read the live schema first, then query a dozen orders with discounted and full-price lines; check each line against its
   own formula, not only against its siblings.
3. Compare at least 2-3 rows before flagging anything (recon-fanout.md §2).
4. For every behaviour you observe, fill observed[] with covered_by from the charter's coverage view.
5. Stay off the never-call boundary (recon-fanout.md §4).

**6. Report format**
The JSON of recon-fanout.md §1 written to recon/orders.json, plus the session-footer fields
(skills_loaded, mcps_used, clis_used, testing_levels_touched, screenshots_captured) and
secrets_materialized / cleaned.

**7. Rules**
- Reference credentials by name, never by value (Critical Rule #1).
- Make authenticated API calls with curl and the api:login token; the OpenAPI MCP is schema-only.
- Record every created row immediately, even if you expect to clean it up later.
- Do not call anything that sends or pushes downstream; the project's never-call list, if any: <verbatim>.
- PASSED / FAILED only on observation in the named environment; anything else is NOT RUN.
```
