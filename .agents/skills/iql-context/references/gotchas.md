# Measured Gotchas

> Loaded by: `iql-context`, when a term reads two different ways between the official site, this repo's doctrine and a project. Every row was measured on the date given against the source it names. Rows that stop being true move to §"No longer true"; they are never deleted.

## 1 · Site vs repo

| # | Gotcha | Symptom | Fix | Measured | Verified against |
|---|---|---|---|---|---|
| G1 | **The site names stages, the repo still numbers some.** `AGENTS.md` §5 and the sprint-testing / regression-testing headings say "Stage N" | a briefing says "Stage 4" and a reader looks for a fourth stage in `agentic-qa-core/references/stage-gates.md` | resolve the number through the table in `agentic-qa-core/references/stage-gates.md`, answer by name | 2026-09-24 | site scrape 2026-09-23 + repo at the `feat/context-skills` base |
| G2 | **"ATC" is Acceptance on the site and a code method in `AGENTS.md` §10.** Same acronym, two layers | a plan counts "ATCs" as automated methods when the ATP meant acceptance cases | say which layer you mean: the TMS case, or `@atc('KEY')` as its code representation | 2026-09-24 | `#artefactos` vs `AGENTS.md` §10 |
| G3 | **The site does not name the RTR and barely names the RTP; the repo ratified both.** The ladder on the site ends at STR | a reader concludes regression has no run record | cite `agentic-qa-core/references/planning-ladder.md` amendments: RTP long-lived, one RTR per verdict | 2026-09-24 | `#artefactos` vs the RTP / RTR amendments |
| G4 | **Failure classes differ in count.** The site lists five (REGRESSION, FLAKY, KNOWN, ENVIRONMENT, NEW TEST); the regression skill splits KNOWN into two | a classification written from the site misses a class the skill expects | classify with the skill's own list in `.agents/skills/regression-testing/SKILL.md` | 2026-09-24 | `/late-game` vs the skill |
| G5 | **Documentation sub-phases.** The repo names Analyze / Prioritize / Document; the site names only Prioritize and Document | "phase Analyze" looks invented to a site reader | cite `agentic-qa-core/references/stage-gates.md` §"Documentation" | 2026-09-24 | `#stages` vs the reference |
| G6 | **Who fires Draft → In Design → READY depends on the modality.** The site lists it under Documentation; in `jira-xray` Planning fires it, in `jira-native` Documentation creates the TC | a jira-xray session waits for Documentation to design cases the sprint already needs | read `agentic-qa-core/references/artifact-lifecycle.md` §1 (TC row) and resolve the modality first | 2026-09-24 | `#stages` card Documentation vs the lifecycle table |
| G7 | **The site's sandbox Defect example links differently from the doctrine** (blocks the TC, relates to the ATR) | a Defect filed from the example carries links the traceability check does not expect | link per `agentic-qa-core/references/traceability-linking.md` §3 and §8 | 2026-09-24 | `#jira` example vs the link catalog |
| G8 | **Subtask status names.** The site and `.agents/jira-workflows.json` say ACTIVE → Close; `AGENTS.md` §5 still says In Progress → Done | a transition by the prose name is not in the catalog | the JSON wins; use the catalog slug | 2026-09-24 | `.agents/jira-workflows.json` `subtask` |

## 2 · Site-internal

| # | Gotcha | Symptom | Fix | Measured | Verified against |
|---|---|---|---|---|---|
| G9 | **Where Documentation sits is stated two ways on the site** (block 02 Early Detection covers steps 3-4; the stage card says L3 Continuous Detection) | a maturity argument cites the wrong block | the repo's Capability column in `agentic-qa-core/references/stage-gates.md` is L3 | 2026-09-24 | `#iql` vs `#stages` |
| G10 | **The light-mode ATP card contradicts the coverage rule on the same site.** The card says the Story misses the coverage panel until the ATP item exists; the coverage cascade says only the ATS edge fills the panel | a team creates the ATP item to "fix coverage" | the ATS → Story edge is the only coverage edge (`agentic-qa-core/references/traceability-linking.md` §3) | 2026-09-24 | `#principios` vs `/diagramas/gestion-de-tests` |

## 3 · No longer true

_(empty)_
