# Evidence conventions (shared contract)

> Cited by: `sprint-testing` (Stage 2 capture + Stage 3 handoff), `bug-screenshot-annotation`, `regression-testing` (artifact triage), and any subagent briefed to capture or reference evidence. It holds the shared bucket and naming model. `sprint-testing/references/reporting-templates.md` (§1.11, §3.5) and `sprint-testing/references/exploration-patterns.md` (§5.3) stay authoritative for their stage mechanics and point here.

The evidence PAGE built from these files (one offline HTML page per ticket and per bug, from an evidence pack kept in the same `evidence/` folder) is the `evidence-artifact` skill (`.agents/skills/evidence-artifact/SKILL.md`).

Every file produced while testing falls into exactly one of three buckets. Misfiling causes two recurring failures: stray artifacts committed to the repo root, and "evidence" claimed in a report that never existed on disk.

---

## 1. The three buckets

| Bucket | What | Where it lives | Lifecycle |
|---|---|---|---|
| **A: auto-generated logs (noise)** | Console/network logs and session files auto-produced by the automation tool (`[AUTOMATION_TOOL]` / playwright-cli) via its `outputDir` | The tool's configured output dir (`.playwright/` tree, gitignored) | Not read, not committed, not referenced. |
| **B: real evidence** | Screenshots, traces, videos, HARs, PDFs explicitly captured to prove a TC step, a bug, or a smoke result | The ticket's PBI `evidence/` folder (gitignored) under `<<PRIMARY_ROOT>>` (`.agents/README.md` §"Checkout roots"; a worktree's copy dies with the worktree): `<<PRIMARY_ROOT>>/.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/evidence/` (or the coverable-type equivalent folder). A ticket-free round (`exploratory-testing`) has no coverable yet: its captures live in the session's `evidence/` until a bug or an anchor is filed, then the ones it cites are copied to that coverable's folder | Referenced by ATR / bug reports / handoffs. Named per §2. |
| **C: annotation intermediates** | Working files produced while building a marked-up bug screenshot: the cropped source PNG and the annotation HTML (see the `bug-screenshot-annotation` skill) | The session scratchpad only | Disposable. It never moves to `evidence/` and no Jira, ATR or bug ticket references it. Only the final rendered annotated PNG (Bucket B) is evidence; a later session can re-derive the crop and HTML from the raw screenshot. |

**Bucket B rule: explicit destination, always.** Every capture command receives an explicit destination path that resolves to the ticket's `evidence/` folder. A capture that falls back to the tool default writes to the repo root CWD and leaves stray files that look like committed assets. Known gotcha: `outputDir` in the automation tool config does not apply to screenshots, so pass the full path in the capture command's filename argument (`sprint-testing/references/exploration-patterns.md` §1.1).

**Bucket B rule: a trace or HAR is session material until scrubbed.** A Playwright trace records request headers (`Authorization`, `Cookie`), cookies set through the context, `localStorage` writes, and the literal value of every `fill()` (measured: a typed password appears in the trace's action log, and in the Allure step name `Fill "<value>" …` even on a passing test). A HAR records the same headers. So a trace or HAR goes to `evidence/` and is attached to Jira, an ATR or a report only after the `Authorization` / `Cookie` / `Set-Cookie` headers, storage values and typed secrets are removed; when it cannot be scrubbed, it is not attached, and a screenshot, a video or a written repro carries the proof instead. A published test report is an attachment too: Allure attaches the failure trace as-is, so a report hosted where people outside the team can open it carries that material (private hosting: `regression-testing/references/private-hosting-setup.md`). The dispatch that captured it declares it (`.agents/instructions/agent-orchestration-detail.md` "SESSION MATERIAL IN A DISPATCH").

**Bucket A rule: hands off the shared config.** The automation tool's `outputDir` stays at the tool-owned directory it ships with (`.playwright/output`), which is what lets parallel sessions share the file. A workflow step that says "set `outputDir` to the ticket's evidence folder before capturing" is a single-session assumption, superseded by §5. The value is **committed**, so a ticket path written there outlives the ticket: measured on a real fleet (see ADR-0006), a repo whose config still pointed at one story's evidence folder cross-contaminated the first unqualified capture of all three concurrent sessions. When you find a ticket path there, fix it back to the tool-owned directory once and do not race to overwrite it.

---

## 2. Naming: two stage-scoped families and the annotated suffix

Both families start with the ticket key. Pick by what the file evidences:

**Family 1, Stage 2 exploration shots** (per `exploration-patterns.md` §5.3):

```
{KEY}-smoke-{area}.png          # smoke gate
{KEY}-ac{N}-{short-desc}.png    # AC-tied scenario
{KEY}-bug-{short-desc}.png      # raw capture of a defect found mid-exploration
```

**Family 2, bug-report and reproduction-step attachments** (per `reporting-templates.md` §1.11):

```
{KEY}-step{NN}-{action}.{ext}   # zero-padded step number ties the file to a repro/test step
```

`{ext}` ∈ png · jpg · gif · mp4 · log · txt · pdf · har.

**Annotated bug images** extend the pattern with a dedicated suffix instead of a step/scenario slot:

```
{KEY}-BUG-{BUG-KEY}-annotated.png
```

where `{KEY}` is the ticket under test and `{BUG-KEY}` is the filed bug/defect/improvement issue key, and they differ whenever the quality issue is filed as its own Jira issue (the normal case per the defect-management doctrine). The redundant `{KEY}` prefix is deliberate: the file stays traceable if it is later dragged into a Slack thread or a shared folder. Only the `bug-screenshot-annotation` skill produces it. Example shape: an annotated capture for bug `UPEX-512` found while testing story `UPEX-411` is named `UPEX-411-BUG-UPEX-512-annotated.png`.

---

## 3. Verify-on-disk discipline

Before any report, handoff or footer lists an evidence file, `ls` the `evidence/` folder and list only files that exist. A subagent that says it took a capture has given testimony; the filesystem is the proof. Both the Evidence Handoff (`sprint-testing/references/reporting-templates.md` §3.5) and the session footer (`session-footer-contract.md` Part 1) depend on this.

---

## 4. Subagent briefing snippet (paste into component 7, Rules)

> Evidence rules (mandatory): every capture command targets the ticket's `evidence/` folder with an explicit full destination path (never the tool default). Name files per `agentic-qa-core/references/evidence-conventions.md` §2. Annotation intermediates (crops, overlay HTML) go to the session scratchpad, never to `evidence/`. A trace or HAR is attached only after its `Authorization` / `Cookie` / `Set-Cookie` headers, storage values and typed secrets are removed; if you cannot scrub it, do not attach it, and report it under `secrets_materialized`. In your structured report, list only evidence files you verified exist on disk (`ls`), with repo-relative paths.

---

## 5. Concurrent sessions: isolate the session, never the shared config

When several sessions test different tickets at the same time on one checkout (a QA fleet, or simply two terminals), the automation tool's config file is shared and its `outputDir` is last-writer-wins: session 3 repoints it and session 1's next capture lands in session 3's ticket folder. The §1 Bucket A rule prevents that, even when a workflow step says "set `outputDir` before capturing": that step assumes it is the only session running.

Two things are per-session, and neither one edits the shared config file:

| What | Why | How |
|---|---|---|
| **Browser session** | two browsers on one profile directory write the same cookies, last writer wins, silently | a named session per ticket or worker (`-s=<KEY>`): the shipped config runs every session in memory, so the name IS the isolation. `--persistent` is never used. Canon: `browser-sessions.md` |
| **Output destination** | keeps Bucket A noise and any non-explicit capture from crossing into another ticket's folder | a per-session config file, OR simply the Bucket B rule already in force: an explicit full destination on every capture |

Which session, which identity and which browser: `browser-sessions.md` (the repo's canon; `/playwright-cli` owns only the verbs). A distinct session name is enough only because the shipped config keeps sessions in memory: a config edited back to a shared `userDataDir` (`isolated: false`) puts every session name on one profile again, so the shared config is not hand-edited to fake isolation, in either direction.

Two constraints hold whatever the mechanism:

- An alternate config **replaces** the default, it does not merge with it, so a per-session config file must be complete.
- `outputDir` never applies to `.png`, so a screenshot passes its full destination path regardless, which is why Bucket B's explicit-destination rule already makes evidence concurrency-safe with a shared config. What is left unsafe without isolation is the **browser profile**, which the session name covers (above).

Every session closes its browser sessions before it reports: orphaned browser processes accumulate per session at a measured cost (ADR-0006).
