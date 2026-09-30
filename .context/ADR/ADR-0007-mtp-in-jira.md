# ADR-0007 — The Master Test Plan lives in Jira; the local file is a cache

- **Status:** Accepted (by the owner, 2026-09-30)
- **Date:** 2026-09-30
- **Deciders:** framework owner (boilerplate maintainer); drafted by `/framework-development` from the context-c SPIKE (DC9, DC10 and DC11 approved 2026-09-30)
- **Tags:** mtp, planning-ladder, sync, cache, jira
- **Supersedes:** ADR-0001, for the §Consequences follow-up "The MTP needs no cache file" only. The ladder's title grammar and the QA-epic sweep stand.
- **Superseded by:** —

---

## Context

The Master Test Plan had two homes. `project-context` mode `test-plan` wrote the real plan to the committed file `.context/master-test-plan.md`, then mirrored a summary into the `QA Master Test Plan` Epic description under `## Master Test Plan (mirror)`. ADR-0001 recorded that shape: "the MTP needs no cache file; the Jira Epic is its anchor, not its source of truth".

Every other rung of the planning ladder (FTP, STP, ATP, RTP and their runs) is already mastered in Jira and cached under `.context/PBI/` by `scripts/sync-jira-issues.ts`. The MTP was the one artifact whose truth sat in git, so two machines could hold two plans, the Epic summary drifted from the file between runs, and a second writer grew on the side: `test-documentation` appended a `## TMS Modality` section to the file and then grepped it back as a modality fallback, although `.agents/project.yaml` (`tms_cli`) and `.agents/jira-fields.json` already hold both facts.

The owner decided (context-c deck, 2026-09-30) that the MTP is mastered in Jira like the rest of the ladder. The constraint that shapes how is the Jira Cloud description cap.

**Measured facts (2026-09-30):**

| Fact | Value | Source |
| --- | --- | --- |
| Jira Cloud description cap | 32,767 characters, not configurable on Cloud | JRACLOUD-59124, JRACLOUD-72176; `CONTENT_LIMIT_EXCEEDED` on REST v3 (JRACLOUD-78553) |
| What the cap counts | the serialized ADF JSON of the field, not the visible text | JRACLOUD-95408 |
| A real, file-first MTP (Bunkai QA repo) | 32,389 markdown characters → 71,209 characters of ADF JSON through `.agents/skills/acli/scripts/md-to-adf.ts` (ratio 2.2) | measured on `bunkai-qa-engineering/.context/master-test-plan.md` |
| The same plan without its per-flow sections (what to test first, state machines, edge cases) | about 36,900 characters of ADF JSON: still over the cap | same measurement, per section |

The spike had assumed the cap counted visible characters and proposed a 28,000-character markdown threshold. The measurement contradicted it; the conductor chose the ADF-JSON budget below.

## Decision

We will master the Master Test Plan in the `QA Master Test Plan` Epic description, and treat every local copy as a cache.

- **Source of truth**: the `## Master Test Plan` section of the MTP Epic description. `project-context` mode `test-plan` writes only that section, read-first, leaving any other text on the Epic verbatim. It never writes a local file.
- **Cache**: `scripts/sync-jira-issues.ts` splits the section out into `.context/PBI/qa-artifacts/master-test-plan.md` (gitignored, `[SYNC]`), on an unfiltered `pull` (the Epic is already fetched with the Epic list, so no extra query) and on `get <MTP-KEY>`. `--no-qa-artifacts` skips it. A section removed in Jira removes the cache. The writer reads the cache back after every write (Critical Rule #16).
- **Budget**: the MTP is the PRODUCT altitude. Feature depth (per-flow rationale, state-machine detail, edge cases) belongs in each feature's FTP, which already parents to the same Epic. Every write, CREATE or UPDATE, measures the full description as serialized ADF JSON (`md-to-adf.ts`, then `jq -c . | wc -m`) against a 30,000 threshold; above it the writer STOPs and proposes which sections move to which FTP. A Jira length rejection is the same STOP. Never truncate.
- **Migration**: a project's existing non-placeholder `.context/master-test-plan.md` is offered, with approval and the same size check, as the seed of the Epic section on CREATE. It is never deleted; after seeding it is superseded and no skill reads it.
- **One writer**: `test-documentation` no longer records a `## TMS Modality` section into the MTP, and its modality resolution no longer reads the MTP.

## Consequences

**Positive.**

- One MTP per project, the same on every machine and in Jira, where the rest of the ladder already lives. The Epic summary cannot drift from the file because there is no file of record.
- The cache joins `.context/PBI/`: recovered by `bun run context:hydrate`, never committed, never hand-written.
- The budget enforces the ladder's altitudes instead of fighting them: the plan that fits is the product-altitude plan.

**Negative / trade-offs.**

- The MTP is much shorter than the file-first plans. A product-altitude plan fits in roughly 13,000 to 14,000 visible characters of markdown at the measured ratio, and structure-heavy content (tables, short lists) fits less. Plans written under the file-first model need their feature sections moved to FTPs before they fit.
- Editing the plan needs Jira access. Someone without it keeps an empty cache, exactly as with the rest of `.context/PBI/`.
- The markdown → ADF → markdown round trip is not byte-exact: the cache is a rendering of what Jira stores, not the markdown the writer composed.

**Neutral / follow-ups.**

- The 30,000 threshold leaves a margin under the cap for text a human adds to the Epic outside the section. The expansion ratio varies with structure, so the check measures every write instead of estimating.
- The legacy file keeps a lint exemption (`scripts/lint-skills.ts`, `CONTEXT_GENERATED_PREFIXES`) because the seeding step names it.
- A later change may stop committing `.context/` outputs altogether (context-c C3); this ADR does not depend on it.

## Alternatives considered

- **Summary in the description, full plan as an attached `.md`** (the workaround Atlassian suggests on JRACLOUD-59124). Rejected: an attachment has no inline editing, no diff and no history in the issue, and the sync would have to download and version binaries.
- **A Confluence page linked from the Epic.** Rejected: a second tool and a second credential for one artifact.
- **Keep the file as the truth and ignore it in git.** Rejected: two machines still hold two plans, and the Epic stays a mirror that drifts.
- **A markdown-character threshold (28,000).** Rejected on measurement: the cap counts ADF JSON, so a plan under that threshold is still rejected by Jira.

## References

- `.agents/skills/project-context/references/test-plan.md` — the writer: altitude, budget, write steps, seeding.
- `scripts/sync-jira-issues.ts` — `renderMasterTestPlanCache`, `syncMasterTestPlanFile`, `isMasterTestPlanEpic`; tests in `scripts/sync-jira-issues.test.ts`.
- `.agents/skills/agentic-qa-core/references/planning-ladder.md` §1.1 — the MTP Epic's role.
- ADR-0001 — the artifact-ladder cache this extends.
- Jira: JRACLOUD-95408 (cap counts ADF JSON), JRACLOUD-59124 and JRACLOUD-72176 (cap not configurable on Cloud), JRACLOUD-78553 (`CONTENT_LIMIT_EXCEEDED`).
