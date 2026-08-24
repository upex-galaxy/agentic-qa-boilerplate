# Evidence Conventions (shared contract)

> Cited by: `sprint-testing` (Stage 2 capture + Stage 3 handoff), `bug-screenshot-annotation`, `regression-testing` (artifact triage), and any subagent briefed to capture or reference evidence. This file consolidates the evidence rules previously scattered across `sprint-testing/references/reporting-templates.md` (§1.11, §3.5) and `sprint-testing/references/exploration-patterns.md` (§5.3) — those sections stay authoritative for their stage mechanics and point here for the shared bucket + naming model.

Every file produced while testing falls into exactly one of three buckets. Misfiling is the root cause of two recurring failures: stray artifacts committed to the repo root, and "evidence" claimed in a report that never existed on disk.

---

## 1. The three buckets

| Bucket | What | Where it lives | Lifecycle |
|---|---|---|---|
| **A — Auto-generated logs (noise)** | Console/network logs and session files auto-produced by the automation tool (`[AUTOMATION_TOOL]` / playwright-cli) via its `outputDir` | The tool's configured output dir (`.playwright/` tree, gitignored) | Not read, not committed, not referenced. Ignore. |
| **B — Real evidence** | Screenshots, traces, videos, HARs, PDFs explicitly captured to prove a TC step, a bug, or a smoke result | The ticket's PBI `evidence/` folder (gitignored): `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/evidence/` (or the coverable-type equivalent folder) | Referenced by ATR / bug reports / handoffs. Named per §2. |
| **C — Annotation intermediates** | Working files produced while building a marked-up bug screenshot: the cropped source PNG and the annotation HTML (see the `bug-screenshot-annotation` skill) | The session scratchpad ONLY | Disposable. NEVER moved to `evidence/`, never referenced from Jira/ATR/bug tickets. Only the final rendered annotated PNG (Bucket B) is evidence — a future session re-derives crop/HTML from the raw screenshot if ever needed. |

**Bucket B rule — explicit destination, always.** Every capture command MUST receive an explicit destination path resolving to the ticket's `evidence/` folder. Never let a capture fall back to the tool default — that writes to the repo root CWD and clutters the workspace with stray files that look like committed assets. Note the known gotcha: `outputDir` in the automation tool config does NOT apply to screenshots — pass the full path in the capture command's filename argument (see `sprint-testing/references/exploration-patterns.md` §1.1).

**Bucket A rule — hands off the shared config.** Do not repoint the automation tool's `outputDir` mid-session beyond what the active workflow skill instructs; parallel sessions can share it.

---

## 2. Naming — two stage-scoped families + the annotated suffix

Both families start with the ticket key. Pick by what the file evidences:

**Family 1 — Stage 2 exploration shots** (per `exploration-patterns.md` §5.3):

```
{KEY}-smoke-{area}.png          # smoke gate
{KEY}-ac{N}-{short-desc}.png    # AC-tied scenario
{KEY}-bug-{short-desc}.png      # raw capture of a defect found mid-exploration
```

**Family 2 — Bug-report / reproduction-step attachments** (per `reporting-templates.md` §1.11):

```
{KEY}-step{NN}-{action}.{ext}   # zero-padded step number ties the file to a repro/test step
```

`{ext}` ∈ png · jpg · gif · mp4 · log · txt · pdf · har.

**Annotated bug images** extend the pattern with a dedicated suffix instead of a step/scenario slot:

```
{KEY}-BUG-{BUG-KEY}-annotated.png
```

where `{KEY}` is the ticket under test and `{BUG-KEY}` is the filed bug/defect/improvement issue key — they differ whenever the quality issue is filed as its own Jira issue (the normal case per the defect-management doctrine). The redundant `{KEY}` prefix is deliberate: the file stays traceable if it is later dragged into a Slack thread or a shared folder. Produced exclusively by the `bug-screenshot-annotation` skill. Example shape: an annotated capture for bug `UPEX-512` found while testing story `UPEX-411` is named `UPEX-411-BUG-UPEX-512-annotated.png`.

---

## 3. Verify-on-disk discipline

Before ANY report, handoff, or footer lists an evidence file: `ls` the `evidence/` folder and list only files that actually exist. Never claim a capture that a subagent only *said* it took — subagent reports are testimony, the filesystem is proof. This rule is load-bearing for both the Evidence Handoff (`sprint-testing/references/reporting-templates.md` §3.5) and the session footer (`session-footer-contract.md` Part 1).

---

## 4. Subagent briefing snippet (paste into component 7 — Rules)

> **Evidence rules (mandatory):** every capture command targets the ticket's `evidence/` folder with an explicit full destination path (never the tool default). Name files per `agentic-qa-core/references/evidence-conventions.md` §2. Annotation intermediates (crops, overlay HTML) go to the session scratchpad, never to `evidence/`. In your structured report, list only evidence files you verified exist on disk (`ls`), with repo-relative paths.
