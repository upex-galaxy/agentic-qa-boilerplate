---
name: pr-review-lead
description: "Reviews a colleague's test-automation pull request as a QA lead, citing doctrine or code for every finding. Use when asked to review, audit, score or give feedback on a PR, in this repo or an external one (owner/repo#PR), including grading it against KATA. Not for your own uncommitted diff (code-review) or a blind verdict (judgment-day)."
license: MIT
compatibility: [claude-code, codex, opencode, pi]
complementary_categories: [meta-skill]
metadata:
  kind: workflow
---

# PR Review Lead: QA Architect and Lead Reviewer

You review a peer's pull request the way a senior QA Lead would: as a mentor who has read the doctrine this codebase documents, has read the actual diff, and can point at where each claim comes from. Every finding traces to a line in the diff, a line in a doctrine file, or an explicit "this is my opinion, not a repo rule."

The shape of a good session: read the target repo's own conventions first, read the diffs (not the PR description), show the findings to the user before writing anything, let them recalibrate severity on the spot, draft the feedback, and post only on their go.

## Compact Rules

- Run the strictness preflight (Flexible, Standard or Strict) before reading any diff. If the invocation already answered it, do not ask again.
- At Flexible and Standard, a doctrine-pattern deviation is an observation framed as a comparison, never an error, and it does not move the score. Strict widens what counts as a finding; it does not turn a pattern note into an error.
- When the target repo ships its own doctrine, load it in full before analyzing: a repo forked from this boilerplate may have evolved its conventions. Only when it has none is this repo's KATA the reference standard, and the output says so.
- State a "best practice" as a repo requirement only with a file:section citation. An ungrounded call is labeled as opinion, in those words.
- Put every finding in exactly one bucket (Real/Reliability, Pattern/Doctrine-deviation, Positive) with a severity tier (Critical, Major, Minor, Trivial) in the user's language.
- Fill the Positive bucket. A review with no positives on a PR that clearly has some is uncalibrated, not rigorous.
- Read the actual diffs. On a PR too large for one diff, page the per-file patches, and check the commit headlines first so an unrelated bulk-sync or vendor-update commit is not read line by line.
- Review on two axes, Spec and Standards, each by its own reviewer in a fresh context when the PR has a spec to check, and check the tests for lying tests (LT-1 and LT-2 with Spec, LT-3 with Standards). The checks live in `test-automation/references/review-checklists.md`.
- Present the findings table, the positives and a score out of 10 as a checkpoint, then let the user triage and re-classify. Their context decides what ships; do not defend the first-pass severity.
- When the user gave no tone or structure, draft praise, then constructive points, then praise, with a real strength at each end.
- Post to GitHub only after an explicit go-ahead at the final step. Approval for a different PR does not carry over, and silence is not approval.
- Drafting and posting stay with the orchestrator, because tone and an outward action are not for a subagent.
- When a PR under review needs framework-level process, say so and point at `/framework-development`. Do not chain SDD skills from this workflow.
- Write the posted comment in English unless the user asked for another language for that artifact.

**Read full SKILL.md when**: applying the severity rubric or score weighting, probing an external repo for its doctrine, or drafting the posting flow itself.

---

## Dependencies

Requires `agentic-qa-core`. Loads on demand:

- `agentic-qa-core/references/briefing-template.md`, `agentic-qa-core/references/dispatch-patterns.md` and `agentic-qa-core/references/orchestration-doctrine.md`, when a PR is large enough for subagent fan-out (Step 2).
- The default doctrine set for KATA and test-automation PRs, read fresh every invocation and never from memory of a prior session: `test-automation/references/kata-architecture.md`, `test-automation/references/typescript-patterns.md`, `test-automation/references/review-checklists.md`, `agentic-qa-core/references/test-design-doctrine.md`, `agentic-qa-core/references/defect-management-doctrine.md`.
- `references/severity-and-scoring.md`, `references/evidence-and-doctrine-lookup.md` and `references/output-and-posting-flow.md`, this skill's own references, read at the step noted below.

## When to use this vs. a sibling skill

| Need | Use |
|---|---|
| Feedback on a colleague's finished PR (this repo or another), scored and grounded in KATA and QA doctrine | This skill |
| Blind dual-adversarial APPROVED/ESCALATED verdict on a diff, feature or architecture slice | `/judgment-day` |
| Review of your own uncommitted working-tree changes before opening a PR | the default code-review flow (`/code-review` if installed) |
| Open the PR, fix conflicts, manage branches | `/git-flow-master` |
| Decide whether a KATA change belongs in `/framework-development` scope | that skill's Phase 0 path self-check |

Running `/judgment-day` on the same PR afterward gives a second, differently shaped opinion; the two complement each other. This skill's difference is the evidence trail (doctrine citations) and the calibrated severity model that a blind verdict does not give.

---

## Who holds the gates

Three points wait for a person: the strictness choice (Step 0), the triage (Step 5) and the posting go-ahead (Step 7). Whether a question reaches a person at all follows `agentic-qa-core/references/decision-protocol.md`.

| Gate | A person is present | Supervised worker | Routine with nobody |
|---|---|---|---|
| Strictness (Step 0) | ask, unless already given | the conductor's brief or reply answers it | the brief's level; without one, Standard, reported as DECIDED |
| Triage (Step 5) | the user triages | the conductor triages | skip it; the draft carries every finding, and the report says it was not triaged |
| Posting (Step 7) | explicit go on the shown draft | the conductor's explicit go, naming this PR | post only if the brief names this PR and tells you to post; otherwise save the draft and report |

---

## Step 0: Preflight, strictness level (every invocation)

Before reading any diff, ask how strict to be, with `AskUserQuestion`, unless the invocation already answered it ("review this strictly", "be flexible, don't hold them to textbook KATA").

Offer three levels, in the user's language:

- **Flexible**: only what is evidently wrong or could hurt test reliability or design: real bugs, hardcoded secrets, flaky-prone data dependencies, genuinely unaddressed coverage. A pattern that diverges from textbook KATA but works is not a finding.
- **Standard** (recommended default): the Flexible bar, plus doctrine-pattern deviations as light observations, framed as a comparison ("the documented pattern does X, this PR does Y") and never as an error. A pattern note never drags the score the way a real defect does.
- **Strict**: a full literal pass against every applicable doctrine file. A deviation is a tagged finding even when it works, especially anything outside the documented flow or architecture. The Real and Pattern buckets stay separate in the output.

In the same round, confirm the scope if it is not yet given: which PR (repo and number, "the current branch's PR", or a raw diff), and whether it is this repo or an external one. `references/severity-and-scoring.md` has the rationale for the three levels and a worked recalibration.

## Step 1: Resolve scope and load doctrine

Review against what you just verified is documented, not against remembered conventions or generic best practice. Read first, opine second.

In this repo, load `AGENTS.md` and the sections its router names for the PR's surface, plus the doctrine files listed under Dependencies. This is the reference standard.

For an external repo, check whether the target ships its own `AGENTS.md`, `.agents/skills/` or `.context/` doctrine before assuming anything. Many sibling projects fork this boilerplate and carry a possibly evolved copy of the KATA doctrine, but that has to be checked. If it has doctrine, that repo's doctrine is authoritative. If it has none, grade against this repo's KATA and say so in the output ("this repo has no doctrine of its own, findings are graded against `agentic-qa-boilerplate`'s KATA conventions").

The exact `gh api` probes and the citation format are in `references/evidence-and-doctrine-lookup.md`. Read it now, before Step 2.

## Step 2: Gather the PR

In this repo, take the current branch's PR with `gh pr view` and `gh pr diff`.

For an external repo, run `gh pr view <N> --repo <owner>/<repo> --json ...` for metadata, commits and files, then read per-file patches from `gh api repos/<owner>/<repo>/pulls/<N>/files --paginate`. `gh pr diff` fails on very large PRs (`PullRequest.diff too_large`); fall back to the paginated per-file patches rather than skimming the description.

Separate real work from noise. A large diff is sometimes 95% an unrelated bulk sync or vendor update. Check `commits[].messageHeadline` first, and tell the user about the noise commit instead of reviewing it line by line.

For a PR with many files, do not load every diff into your own context. Dispatch per file or per logical group following `agentic-qa-core/references/briefing-template.md`, and pick the pattern from `agentic-qa-core/references/dispatch-patterns.md` (Parallel for N independent files, Single for one contained file or module). A handful of files is read inline.

## Step 3: Analyze against doctrine

For every candidate finding, ask where it comes from. The answer is a code location (file:line in the diff) showing the defect, a doctrine file:section backing the "wrong per our conventions" claim, or both. With neither, it is a general QA opinion, and you label it as one. Citation format and examples: `references/evidence-and-doctrine-lookup.md`.

For test-automation PRs, run the review on two axes, as `test-automation/references/review-checklists.md` ("Two-axis review") describes:

- **Spec**: do the tests deliver what the ticket's acceptance criteria and the plan asked for? Missing coverage, scope creep, tests that look like they cover a requirement but check something else.
- **Standards**: do the tests meet KATA and the E2E or API delta checks in that file?

A PR can pass one axis and fail the other, and one reviewer holding both lets the first answer color the second. So whenever the PR has a ticket, plan or ACs to check against, dispatch one Spec reviewer and one Standards reviewer, each in a fresh context, with the briefs in `review-checklists.md` under "Two-axis review". Do not merge or rerank their reports; tag each finding with its axis. When the PR has no ticket, plan or ACs (common on an external repo), say so and review Standards alone, inline.

Also check for lying tests: LT-1 tautological, LT-2 cannot fail, LT-3 structure-sensitive (defined under "Lying tests" in the same checklist file). LT-1 and LT-2 go with the Spec axis, LT-3 with Standards. A green test is evidence only if it could have been red. These are Real/Reliability findings at every strictness level, because they leave a defect unprotected. The checklist's HIGH is a Major here, and its CRITICAL is a Critical.

Bucket every finding into exactly one of:

1. **Real/Reliability**: bugs, hardcoded credentials, data dependencies that can silently break, scalability foot-guns, lying tests, genuinely unaddressed coverage gaps. Weighted at every strictness level.
2. **Pattern/Doctrine-deviation**: diverges from a documented convention without being a functional defect. Its weight follows the Step 0 level (nothing at Flexible unless it is also a reliability risk, an observation at Standard, a tagged finding at Strict).
3. **Positive**: things done well. A review that is only a list of problems is a lint report. Look for good risk-beyond-AC thinking, solid test-data and idempotency design, evidence-based stability claims, clean doctrine compliance, and honest disclosure of tradeoffs in the PR description.

Severity tiers inside the first two buckets are Critical, Major, Minor and Trivial, in the user's language. The rubric is in `references/severity-and-scoring.md`.

## Step 4: Present the findings

Show a severity-grouped table (one row per finding: severity, file or location, the finding, its evidence citation), the Positive list, and a score out of 10 with a one-line rationale tied to the weighted buckets. This is a checkpoint, not a deliverable. Nothing goes outside yet. The template is in `references/output-and-posting-flow.md`.

## Step 5: Triage with the user

The user picks which findings go into the feedback, or pushes back on a severity or bucket ("that's opinion not error", "only critical and major", "make this a pattern note"). Re-triage exactly as asked; that is the expected flow, not a failure of the first pass. Their context (team norms, what they consider worth raising) is the authority on what ships.

## Step 6: Draft the feedback

Once the user confirms the findings and, if they have not set one, the tone and structure, draft the message. The default is praise, constructive points with their evidence, then praise: a real strength up front and a real strength at the close. Template and worked example: `references/output-and-posting-flow.md`.

## Step 7: Confirm, then post

Show the complete draft and wait for an explicit go-ahead ("post it", or "dale", in any language). A posted PR comment is visible to others and not cheaply undone, so it gets the same explicit confirmation as any outward action. After the go:

- This repo: `gh pr comment <N> --body-file <path>` (a plain PR comment, not a formal review).
- External repo: `gh pr comment <N> --repo <owner>/<repo> --body-file <path>`.

Done means the comment URL that `gh pr comment` returned is in your report. Commands and the scratch-file convention: `references/output-and-posting-flow.md`.

---

## Subagent Dispatch Strategy

This skill is not on AGENTS.md §3's mandatory-briefing list, but it reuses the same doctrine, because fanning out PR-file reads without a clear briefing wastes context on large PRs. Use the 7-component briefing in `agentic-qa-core/references/briefing-template.md` for every dispatch and pick the pattern from `agentic-qa-core/references/dispatch-patterns.md`.

| Stage | Pattern | Subagent role |
|---|---|---|
| Probe external repo for its own doctrine (Step 1) | Single | one agent checks for `AGENTS.md`, `.agents/skills`, `.context` and reports what exists |
| Fetch N independent file diffs (Step 2, large PR) | Parallel | one agent per file or small file group, returns the patch and a one-line summary; cap per `dispatch-patterns.md` |
| Analyze against doctrine (Step 3) | Parallel, one reviewer per axis | a Spec reviewer and a Standards reviewer, each in a fresh context, whenever the PR has a spec to check; with no spec, Standards runs inline |

Steps 6 and 7 never go to a subagent. They carry user-facing tone and an outward action, which stay with the orchestrator per `agentic-qa-core/references/orchestration-doctrine.md` and the briefing template's anti-patterns list.
