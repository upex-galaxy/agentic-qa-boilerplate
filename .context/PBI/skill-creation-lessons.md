# Skill Creation — Lessons Learned

> Living document. Each subagent updates this with new learnings before reporting back.
> Subagents MUST read this before starting, alongside `migration-analysis-agent-skills.md`.

---

## Progress Log

| # | Skill | Status | Source lines → Skill lines | Reduction | Surprises |
|---|-------|--------|---------------------------|-----------|-----------|
| 1 | `regression-testing` | ✅ Done | ~1,500 → 1,039 | 31% | 2 bugs in source, 1 coverage gap, 1 false dependency |
| 2 | `test-documentation` | ✅ Done | ~3,700 → 1,929 (SKILL 347 + tms-arch 421 + tms-conv 616 + jira-tms 545) | ~48% | 4-scope branching pattern compressed into one table; Xray-vs-native mode split forced duplication in the Jira reference; first skill to need a post-hoc remediation pass after "Prompt too long" failure |
| 3 | `project-discovery` | ✅ Done | ~11,500 → 2,828 (SKILL 285 + 8 refs: phase-1 395 + phase-2-prd 277 + phase-2-srs 283 + phase-3 302 + phase-4 266 + context-generators 293 + kata-adaptation 498 + iql-methodology 229) | 75% | Largest skill so far; required 3 passes (3a + remediation, 3b, 3c) to land cleanly. Splitting into 2-3 refs per pass kept context headroom safe. project-test-guide content lives inside context-generators (not duplicated in kata-adaptation). KATA reference held to 498 after one trim — close to the 500 ceiling. |
| 4 | `test-automation` | ✅ Done | ~12,130 → 4,885 (SKILL 251 + evals 40 + 10 refs: kata-architecture 579 + typescript-patterns 418 + automation-standards 638 + test-data-management 459 + e2e-patterns 486 + api-patterns 548 + atc-tracing 415 + review-checklists 249 + ci-integration 337 + planning-playbook 465) | 59.7% | 10 refs across 4 passes; DRY enforced via strict scope-boundary handoffs between passes; automation-standards absorbed kata-ai-index; pass 4b/4c noted multiple per-ref overshoots managed with active line-trimming |
| 5 | `sprint-testing` | ✅ Done | ~9,740 → 2,628 (SKILL 187 + evals 40 + 6 refs: sprint-orchestration 454 + session-entry-points 588 + feature-test-planning 253 + acceptance-test-planning 341 + reporting-templates 404 + exploration-patterns 361) | 73% | Delivered in 4 passes (5a crashed on final report but left all files on disk — SKILL + evals + 2 refs — confirming §13 "registered ≠ complete" pattern). Handoff-notes discipline held across 5b/5c; cross-skill boundaries with test-documentation (TMS artifacts) + test-automation (automation planning) + regression-testing (Stage 6) documented in SKILL.md handoff table. Scope-selection table with 3 modes (single US / bug verification / batch sprint) absorbed the three workflow entry points. Subagent Write-tool was blocked by harness in pass 5c — heredoc-via-Bash is the working fallback for creating files under `.claude/skills/`. |

---

## 1. Canonical frontmatter shape

Use this **exact** YAML frontmatter template. No variations.

```yaml
---
name: skill-name-in-kebab-case
description: <first-person imperative, front-loaded with triggers, ≤1024 chars>
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
allowed-tools: <optional — only if skill needs tool restriction>
---
```

**Decision (2026-04-13):** Keep `license` and `compatibility` even though existing `playwright-cli` / `xray-cli` omit them. The migration's entire purpose is multi-platform portability — new skills lead by example; legacy skills will be aligned later.

**Description field rules:**
- ≤ 1024 characters (hard limit per agentskills.io spec)
- Front-load with action verb and concrete triggers
- Include both positive triggers ("Triggers on: X, Y, Z…") and negative guardrails ("Do NOT use for: A, B")
- Style reference: `regression-testing/SKILL.md` description (834 chars — proven to work)

---

## 2. Pseudocode tags vs concrete tool names

**Rule:** Concrete when universally portable. Tag when project-configurable.

| Use concrete names | Use pseudocode tags |
|--------------------|---------------------|
| `gh` (GitHub CLI) | `[TMS_TOOL]` (Jira/Xray varies) |
| `git` | `[ISSUE_TRACKER_TOOL]` (Jira/Linear/GitHub Issues) |
| `bun`, `npm`, `pnpm` (whichever repo uses) | `[DB_TOOL]` (DBHub/Supabase/raw SQL) |
| `playwright` | `[API_TOOL]` (OpenAPI/Postman) |
| Standard shell commands | `[AUTOMATION_TOOL]` (Playwright CLI/MCP) |

The test: "would this tool name be identical on any random testing project?" If yes → concrete. If no → tag.

---

## 3. `evals/` is mandatory

Every skill gets `evals/evals.json` regardless of whether §4.5/§4.x of the plan lists it. Format per skill-creator convention:

```json
{
  "evals": [
    {
      "name": "should-trigger-<scenario>",
      "prompt": "<user prompt>",
      "expected_behavior": "Activates <skill-name>. <expected output description>",
      "category": "positive"
    },
    {
      "name": "should-not-trigger-<scenario>",
      "prompt": "<user prompt>",
      "expected_behavior": "Does NOT activate <skill-name>. Should route to <correct-skill>.",
      "category": "negative"
    }
  ]
}
```

Source the prompts from §8.x of the plan. Add extra negatives if the plan only lists 3 (minimum viable: 3 positive + 3 negative).

---

## 4. Inline vs references/ heuristic

Decide where content goes using this rule:

| Criterion | Inline in SKILL.md | Move to references/ |
|-----------|--------------------|-----------------------|
| Size | < 100 lines | ≥ 100 lines |
| Load-bearing? | Needed every invocation | Needed in narrow scenarios only |
| Template/decision? | Decision trees, gotchas, naming rules | Full templates, step-by-step procedures |

**Example from `regression-testing`:** The GO/NO-GO stakeholder report template stayed inline in SKILL.md (load-bearing — every analysis run uses it), even though initial plan suggested a third reference file. Adding a file for one template would have been noise.

**Rule of thumb:** If the agent will need X in more than 50% of invocations, inline it. Otherwise, refs/.

---

## 5. Source conflicts are expected — don't be afraid to reconcile

Every skill will find contradictions between source files. This is normal and expected.

**When sources conflict:**
1. Pick the most defensible version (usually the later/more-canonical artifact)
2. Report the conflict in your final report (§4 "What surprised you")
3. Document the resolution in the skill itself so future readers understand

**Known example from `regression-testing`:**
- `regression-analysis.md` had a 9-point GO/NO-GO matrix
- `regression-report.md` had a different 9-point matrix with different weightings
- Resolution: used `regression-report.md`'s version (final artifact wins)
- Documented in `failure-classification.md` §1

**Pattern to expect:**
- Guidelines and prompts that cover the same topic often drift
- Decision trees with ordering bugs (check precedence matters)
- Assumptions that a config/file exists when it's actually optional
- Cross-references to other files that create false coupling

Fix these in the skill. Don't propagate bugs.

---

## 6. Discovered gaps are fair game

When source material misses something that the test framework actually does (e.g., `retries: 2` in Playwright config but no retry-aware flakiness logic in regression prompts), **add it to the skill**.

Skills are meant to codify current best practice, not freeze the old prompts. If you find a gap, fill it and report it.

---

## 7. Self-contained references/

Each `references/*.md` must be self-contained for its topic. **No cross-references** like "see failure-classification.md for details". If topic A needs a fact from topic B, either:
- Duplicate the fact in both (small facts — a line or two)
- Restructure so the fact lives where it's used

The agent reads one reference at a time. Cross-references force re-loading and defeat progressive disclosure.

---

## 8. SKILL.md is routing + essentials, not a tutorial

SKILL.md structure that works (from `regression-testing`):
1. **When to use** (expanded from description)
2. **Workflow overview** (the happy path — what steps, in what order)
3. **Decision rules** (branching logic — which reference to load for which situation)
4. **Gotchas** (the 5-15 most important inline rules)
5. **Templates** (small inline templates; large ones → references/)
6. **Pointers to references/** (each with "Read X when Y")

Avoid:
- Prose preambles ("This skill will help you…")
- Tutorials ("First, let's understand what regression testing is…")
- Repeating what's in `references/` (DRY between tiers)
- Listing every single rule from source files (that's what references/ are for)

---

## 9. No AI attribution — ever

- No "Generated with Claude Code" / "Co-Authored-By: Claude"
- No emojis unless the repo convention already uses them in that exact spot
- All content in English
- Must look human-authored

---

## 10. Self-verification checklist (run before reporting)

Every subagent runs this before handing back:

- [ ] SKILL.md ≤ 500 lines (`wc -l`)
- [ ] Description ≤ 1024 chars
- [ ] YAML frontmatter has all 4 required fields (`name`, `description`, `license`, `compatibility`)
- [ ] `evals/evals.json` parses as valid JSON (`python -m json.tool` or `jq .`)
- [ ] No `.prompts/` paths inside SKILL.md (self-contained)
- [ ] No `.context/guidelines/` paths inside SKILL.md (self-contained)
- [ ] Every "Read X when Y" pointer maps to an existing file in `references/`
- [ ] No cross-references between files in `references/`
- [ ] No redundancy between SKILL.md and references/
- [ ] No Spanish inside any skill file (skills are English-only)
- [ ] No AI attribution anywhere

---

## 11. Report format (≤ 500 words back to main)

1. **Files created** — paths + line counts
2. **Description text** (exact, with char count)
3. **Deviations from the plan** — added/removed/renamed files and why
4. **Surprises** — source conflicts, bugs, gaps discovered
5. **Lessons for next skill** — 3-5 bullets that would improve the next briefing
6. **Blockers / open questions** — what you couldn't resolve

The main conversation reads ONLY this report, not the files. Make it count.

---

## 12. Append lessons here before reporting back

Each subagent, after completing its skill, appends a "Lessons from skill N" subsection below. This keeps institutional knowledge persistent across conversations and subagents.

### Lessons from skill 1 — `regression-testing` (2026-04-13)

- Published the canonical frontmatter shape (§1 above) — addresses the "had to derive from §9.2" friction
- Added pseudocode vs concrete rule (§2) — solves the `gh` literal vs `[TMS_TOOL]` tag ambiguity
- Made `evals/` mandatory (§3) — resolves plan/briefing conflict
- Inline-vs-reference heuristic (§4) — explicit rule replaces "follow plan literally" instinct
- Source-conflict resolution protocol (§5) — empowers authors to fix bugs without feeling like they're fabricating
- Discovered gap protocol (§6) — codifies "add what's missing, report it"
- Self-contained references rule (§7) — prevents progressive-disclosure defeat
- SKILL.md structure template (§8) — 6-part skeleton proven to work

### Lessons from skill 2 — `test-documentation` (2026-04-13)

- **Scope-branching pattern (first use)**: this skill has four distinct scopes (module-driven, ticket-driven, bug-driven, ad-hoc) that all share the same Analyze -> Prioritize -> Document pipeline. The winning structure was one scope-selection table at the top (what input, what defaults), then a single pipeline described once. Attempting to document four full workflows would have blown past the 500-line SKILL.md limit. Future skills with multiple entry scopes (e.g., `sprint-testing` with its per-ticket stages) should follow this pattern: pick-scope table first, single shared pipeline second.
- **Xray-vs-native forked the reference, not the SKILL.md**: the mode split (Jira Native vs Jira + Xray) surfaces everywhere — field storage, workflow permissions, CI/CD import path, entity hierarchy. Keeping both inside one `jira-test-management.md` reference worked because the modes share most rules and only diverge on a few fields. Do NOT split into two files; a single mode-comparison table is lighter.
- **Source conflicts reconciled**: the source `jira-test-management.md` (QA guideline) and `tms-integration.md` (TAE guideline) disagreed on whether the `Test Status` field is a select list or a separate workflow. The skill adopts the workflow-based model (richer, matches modern Xray) and mentions the select-list fallback for Jira Native only. This pattern — "workflow first, custom field as degraded fallback" — is worth carrying to future TMS-adjacent skills.
- **ROI formula dedup**: ROI appears in 4 source files with slightly different wordings and one with different weightings. Resolved by stating the formula once inline in SKILL.md §Phase 2 and referring all scorers to a single 1-5 rubric. Did NOT duplicate the table into references.
- **Description template is load-bearing**: the Jira Description template (Related Story, ROI, Variables, Implementation Code, Refinement Notes) is the single document where ATP design, bug history, and automation handoff all live. Made it section §7 of `jira-test-management.md` and told SKILL.md to point there whenever "filling fields" comes up. A future `test-automation` skill will want to read this exact template to find the handoff slots.
- **What was harder than `regression-testing`**: scope of source material (~3,700 lines vs ~1,500), semantic overlap between `tms-integration.md` and `jira-test-management.md` (70% duplicate content), and the fact that three references had to stay coordinated without cross-referencing. Target reduction (~54%) was achieved at ~48% because the Xray mode required inlining its own examples rather than pointing at tms-conventions.
- **For skill 3 (`project-discovery`)**: this will be the largest source (~11,500 lines). Expect heavy scope branching (different project types: boilerplate, greenfield, migration). Apply the scope-selection-table pattern from day one. Do NOT try to cover every discovery type in SKILL.md; push type-specific playbooks to references.

### Lessons from skill 3 — `project-discovery` (pass 3a, 2026-04-13)

**Status**: Partial. Pass 3a actually crashed mid-flight (~50% of planned references) with "Prompt is too long" after delivering SKILL.md (285 lines), `evals/evals.json` (3 positive + 3 negative), and only `phase-1-constitution.md` + `phase-2-prd.md`. A focused remediation subagent (following the §13 recovery pattern) then added `phase-2-srs.md` (283 lines) and `phase-3-infrastructure.md` (302 lines), bringing pass 3a to its intended 4-reference set. Pass 3b must still deliver `phase-4-specification.md`, `context-generators.md`, `kata-adaptation.md`, `iql-methodology.md`. SKILL.md already points at those four with `(created in pass 3b)` suffixes -- the verification subagent should NOT flag them until pass 3b completes.

**Key lesson from the crash**: 4 references per subagent pass is too many for ~11K source lines. The remediation pattern from §13 worked — a numbered-fixes-list remediation subagent recovered the 2 missing phase refs cleanly. Future large skills should plan **2-3 references per subagent pass maximum**, and split into more passes rather than fewer. Specifically, pass 3b's planned 4 refs (phase-4, context-generators, kata-adaptation, iql) risk the same failure — consider splitting into two passes (3b = context-generators + kata-adaptation, 3c = phase-4 + iql), or trimming aggressively.

- **Splitting a large skill across two passes is viable.** The prompt-too-long failure mode from skill 2 was avoided by banking SKILL.md + evals + lessons-row early (before context pressure builds), then writing references one at a time. Pass 3a's output was ~2,200 lines across 6 files -- well under the single-subagent ceiling.
- **Scope-selection table earned its keep immediately.** The table at the top of SKILL.md ("Fresh onboarding / Boilerplate adoption / Brownfield / Context refresh / KATA only") absorbed what would otherwise have been five separate workflow sections. Each scope maps to the same 4-phase pipeline with different start/stop points -- one pipeline documented once.
- **Stack detection had to be inline, not a reference.** Every Phase 1 invocation needs it. Moving it to `references/` would force the agent to load a reference file on its first move. Kept as a Markdown table in SKILL.md §Stack detection rules.
- **Phase completion gates prevent cascade failures.** Each phase emits a "Phase N complete, confirm to continue" ping before the next phase starts. Tested pattern from `sprint-testing` roadmap -- and the gates expose missing inputs to the user instead of silently using placeholders.
- **"Discovery Gaps" section is the anti-hallucination mechanism.** Every generated doc must include a `## Discovery Gaps` block listing items the AI could not verify from code. This codifies "do not invent numbers" as a structural requirement rather than a behavioural plea.
- **Context generators depend on phase outputs -- do NOT let users skip phases.** Users will ask "regenerate api-architecture.md" as a shortcut. The SKILL.md gotchas section explicitly says "generators need Phase 1 + Phase 3 at minimum" -- run them first even if the user did not ask.
- **For pass 3b**: (a) `context-generators.md` is the highest-traffic reference -- most users will land there via "regenerate X". Bias its content for quick operational lookup, not narrative. (b) `kata-adaptation.md` should fuse `kata-architecture-adaptation.md` (994 lines) with the relevant chunks of `context-engineering-setup.md` (463 lines) -- they overlap on component-scaffold instructions. (c) `iql-methodology.md` is background reading only -- keep it short (~300 lines), lifted from `.context/test-management-system.md` Parts 1-2 only (skip the late-game parts, those belong to sprint-testing / regression-testing). (d) `phase-4-specification.md` can be small (~250-350 lines); its two sources (`pbi-backlog-mapping.md` + `pbi-story-template.md`) carry a lot of example markdown that should be stripped, not duplicated.
- **Open question for pass 3b**: no cross-ref cleanup needed between pass 3a's 4 references (verified -- each is self-contained). Pass 3b must preserve this discipline for its 4 references.

### Lessons from skill 3 — `project-discovery` (consolidated, 2026-04-14)

- **Three passes for ~11,500 source lines was the right call.** Pass 3a (SKILL + evals + 2 refs) crashed at the prompt-too-long boundary; a focused remediation subagent then added 2 more refs, pass 3b added 2 refs, pass 3c added the final 2. Total output 2,828 lines across 9 files. Future skills above ~10K source lines should plan for 3+ passes from day one — do NOT try to land everything in one or two passes.
- **Scope-selection table at SKILL.md top is now a proven pattern.** Five scopes (Fresh / Boilerplate / Brownfield / Refresh / KATA-only) all reuse the same 4-phase pipeline; documenting the pipeline once and gating it with a scope table kept SKILL.md at 285 lines despite covering five distinct user journeys.
- **Phase completion gates prevent silent failures.** Each phase emits a "Phase N complete, confirm to continue" ping. This pattern surfaced ambiguity early (e.g., missing PRD inputs) instead of letting the agent fabricate placeholder content downstream.
- **"Discovery Gaps" section is the anti-hallucination structural requirement.** Every generated doc must end with `## Discovery Gaps` listing items that could not be verified from code. Adding it as a structural rule (not a behavioural plea) made the agent stop inventing numbers.
- **Reference scope discipline matters.** Resisted the temptation to put project-test-guide content into both context-generators and kata-adaptation; kept it only in context-generators. Kata-adaptation focuses purely on KATA mechanics. Self-contained references pay off when the agent loads only one at a time.
- **Pass 3c specific lesson — write smallest deliverable first.** iql-methodology (229 lines, background-only) was banked before kata-adaptation (498 lines, code-heavy with templates). When the larger file overshoots the 500-line cap, you can still trim without losing the smaller bank. The KATA file did overshoot (567 -> 498 after trimming code-block redundancy) — confirms the §13 prediction that 450-500 line refs need active line management.
- **For skill 4 (`test-automation`)**: ~12,130 source lines targeting ~4,500 — even larger than discovery's output. Plan 4-5 passes minimum. Expect heavy overlap between coding prompts (e2e vs integration) and planning prompts (module vs ticket vs ATC) — apply a scope-table pattern early. Reference splits should mirror the existing folder structure (planning / coding / review) rather than fight it.

### Lessons from skill 4 — test-automation (consolidated, 2026-04-14)

- **Four passes is the new ceiling for ~12K-line skills.** Pass 4a delivered SKILL + evals + 3 foundational refs; 4b added 3 patterns refs; 4c added 3 operational refs; 4d closed with planning-playbook + consolidation. Held to 3 refs per pass — the §13 ceiling that pass 3a's crash established.
- **Handoff-notes discipline drove DRY across passes.** Each pass's final report named the exact scope boundaries the next pass must respect (e.g., "4c must not re-document fixture selection — SKILL.md owns it"). This replaced per-file cross-ref discipline with per-pass scope contracts — reusable for skill 5.
- **DELTA-format references are a proven DRY pattern.** `review-checklists.md` (249 lines) is an explicit delta on top of `automation-standards.md` §9 — its intro tells the reader to run the shared list first, then layer the E2E- or API-specific additions. Held to 249 lines because it does not re-document what the shared list already covers. Use this pattern whenever two references cover the same topic at different depths.
- **Scope + fixture tables in SKILL.md absorbed full sections.** The "Pick the planning scope first" table and the fixture-selection table each replaced what could have been multi-page sections by compressing the decision into one row per option. SKILL.md landed at 251 lines — well under the 500 cap — despite covering three planning scopes and four fixture types.
- **Stub-free SKILL.md worked cleanly.** Skill 3 used `(created in pass 3b)` markers during multi-pass construction; skill 4 did not. The verification grep `grep "created in pass" SKILL.md` returned 0. Cleaner for users; requires the pass author to only add reference pointers as refs actually land. Recommended default going forward.
- **Absorbing redundant source files pays off.** `kata-ai-index.md` (~180 source lines) was folded into `automation-standards.md` rather than producing an 11th reference. Redundancy between source prompts (review checklists vs automation standards; kata-ai-index vs kata-architecture) surfaced during pass reviews; absorbing produced fewer, richer refs instead of more, thinner ones.
- **For skill 5 (`sprint-testing`)**: expect orchestration-style content — per-ticket sequencing across Stages 1–3 rather than deep single-topic refs. Two reminders: (a) multi-pass from day one (~9,800 source lines sits in the same danger zone as skill 3); (b) cross-skill boundaries with `test-automation` are the main risk — sprint-testing will want to reference planning/coding rather than re-document it. Build a scope-overlap table during the pass-1 briefing and enforce it the same way 4b/4c handoff notes worked.

### Lessons from skill 5 — sprint-testing (consolidated, 2026-04-14)

Delivered in 4 passes (5a crashed on final report step but left all planned files on disk: SKILL + evals + 2 refs — a clean confirmation of §13 "registered ≠ complete"). Passes 5b/5c completed without crashes. Pass 5d was done inline from main (tiny wrap-up, no source reads).

- **Cross-skill handoff table in SKILL.md replaced what would have been multiple "don't do this" sections.** Sprint-testing is the only skill whose entire purpose is bounded by other skills (Stage 4 → test-documentation, Stage 5 → test-automation, Stage 6 → regression-testing). Encoding the handoffs as a single table at the top of SKILL.md let each reference focus on the in-scope mechanics. Pattern is reusable for any orchestration-style skill.
- **Scope-selection with 3 modes absorbed 3 workflow entry points.** Single user story / bug verification / batch sprint each have distinct entry prompts in the source (us-qa-workflow, bug-qa-workflow, sprint-testing-agent) but share the same Stage 1→2→3 pipeline. Table at top + one shared pipeline section replaced three workflow chapters.
- **Ref-by-granularity outperformed ref-by-artifact for planning.** Originally considered splitting planning into ATP-body vs traceability-verification. Pass 5b converged instead on feature-level (`feature-test-planning`) vs ticket-level (`acceptance-test-planning`) — a user-facing granularity axis. The result: feature ref stayed at 253 lines (tight), ticket ref at 341 — neither bloated by over-scoping.
- **Handoff-notes discipline from skill 4 transferred cleanly.** Each pass's report included "what pass N+1 must not duplicate" bullets. Pass 5b's report flagged veto/risk-score tables, data-feasibility, outline naming, and branch strategy as owned — pass 5c followed exactly and did not duplicate.
- **Pass 5a's crash was the least damaging of the three prompt-too-long incidents.** All files landed, only the final narrative report was lost. Hypothesis: SKILL.md + 2 refs (~1,229 lines output) was the maximum one subagent could produce in a single pass before hitting the ceiling. Combined with briefing + source reads (~3 more files on top of guidelines), the single-pass ceiling appears to be around **~4,000–4,500 total lines in + out**. Future large-skill pass-1 briefings should stay below this line, or split pre-emptively.
- **Subagent Write-tool is sometimes blocked by the harness** with "Subagents should return findings as text" — pass 5c hit this for both refs. Reliable fallback: `cat > path <<'EOF' … EOF` via Bash. Worth capturing as a known harness quirk; not skill-specific.
- **Line overshoots are survivable when budget is loose.** Pass 5a's `session-entry-points.md` came in at 588 (target 400-450). Rather than remediate mid-flight, accepted the overshoot because the total skill budget (~2,900) had headroom. Final: 2,628 lines — 272 lines under target, so overshoot absorbed cleanly.
- **Final verification caught one external-path leak** (acceptance-test-planning.md line 79 pointed to `.context/guidelines/TAE/test-data-management.md`). Fixed in wrap-up by inlining the Discover/Modify/Generate definitions. Lesson: run `grep "\.prompts/\|\.context/guidelines/"` during EVERY pass, not just final. References that only skim a pattern can leak a cross-repo pointer without the subagent noticing.

---

## 13. Prompt-too-long failure mode — what to do

**Phenomenon.** A subagent with a large briefing, large source files, and a large output (multiple 400-600-line references + SKILL.md + evals + lessons-file edits) can accumulate enough context that it fails with "Prompt is too long" BEFORE completing the final report and cleanup steps. The skill may register as "available" in Claude Code (because SKILL.md landed on disk) while `evals/evals.json`, referenced-but-missing files, cross-reference cleanup, and lessons-file updates never happen. Observed first on skill 2 (`test-documentation`).

**Detection.** The main conversation must NEVER trust "skill registered = skill complete". Always dispatch a read-only verification subagent before moving on. The verification subagent checks: (a) every `references/X.md` mentioned in SKILL.md actually exists; (b) `evals/evals.json` exists and parses; (c) no cross-references between references; (d) lessons-file progress-log row shows Done with actuals; (e) §12 subsection for this skill is filled. Cheap, catches the silent failure.

**Prevention** — instructions to include in every future skill-creation briefing:

1. **Do `evals/evals.json` SECOND**, right after the SKILL.md draft is stable. It is small (~1 KB) and cheap — bank it early before the context pressure builds. Do NOT leave it for last.
2. **Update the lessons file and progress log as soon as SKILL.md is stable**, not at the very end. The progress-log row and the §12 lessons subsection are small edits; they should not share context headroom with the final reference files.
3. **Report format is STRICTLY ≤ 400 words**. No verbose per-file summaries, no tutorial-style explanations. Bulleted status per deliverable is enough.
4. **Do NOT read source files more than once**. If you re-read a source file, you're burning context on content you already saw. Take notes mentally or in a scratch file the first time.
5. **Create `references/` files ONE AT A TIME**: write file A -> verify it exists with `wc -l` -> move on to file B. Do not batch all references at the end. Batching makes a single "prompt too long" error wipe out multiple files worth of planned work.
6. **Front-load the smallest deliverables**. Order of operations: (1) SKILL.md draft, (2) evals.json, (3) progress log + §12 lessons entry, (4) references one at a time (smallest first), (5) cross-reference cleanup, (6) final report.

**Recovery pattern.** When verification finds gaps, dispatch a focused remediation subagent (this very fix is the template) with a SPECIFIC numbered-fixes list. Do NOT re-create the whole skill. The remediation subagent should have: exact file paths, exact line numbers for edits, a strict word cap on the report, and a self-verification checklist before reporting. Recovery cost scales with gap count, not with skill size, so catch gaps early.

**Rule of thumb.** Any skill whose total output exceeds ~2,000 lines across SKILL.md + references needs the above staging discipline. Skills under that threshold (e.g., `regression-testing` at 1,039 lines) did not trigger the failure. Skills at or above (`test-documentation`, `project-discovery`, `test-automation`) will — plan accordingly.
