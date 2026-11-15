# Output and Posting Flow

> Read at Steps 4 to 7 of `SKILL.md`. Covers the findings table, the triage conversation, the feedback draft and posting. Write the table headers, severity names and prose in the user's language; the examples below are in English.

## Step 4: Findings presentation template

Group by bucket, then severity, always with the citation column, and include the Positive list before the user asks for it. The Axis column is Spec or Standards for test-automation PRs (see `SKILL.md` Step 3) and can be left out when the PR has no ticket or plan to check against.

```
| # | Severity | Axis | File/Location | Finding (with evidence) |
|---|---|---|---|---|
| 1 | Critical | Standards | config/variables.ts:34 | Hardcoded password fallback in code (`\|\| 'Demo123!'`). AGENTS.md Critical Rule #1 (CREDENTIALS = BY NAME, NEVER BY VALUE): "NEVER hardcode or guess." |
| 2 | Major | Spec | (PR-wide) | 97% of the diff (+36k lines) is an unrelated template-sync commit; it makes the review harder even with the author's note. |
```

Close with:

```
Strengths:
- <positive finding 1, with its own evidence>
- <positive finding 2>

Score: X.X / 10: <one-line rationale tied to the buckets that drove it>
```

Nothing is sent anywhere yet. This is the checkpoint the user reacts to in Step 5.

## Step 5: Triage conversation

Pushback comes in a few shapes. Act on it directly instead of re-arguing the first call:

- "Only the critical and major ones": filter the set that goes to the draft. Do not re-run the analysis, just re-scope.
- "That's not an error, it's a pattern": move the finding from Real/Reliability to Pattern/Doctrine-deviation (or drop it if it was borderline), restate the score under the new weighting, and ask whether that score is acceptable before moving on.
- "Let's not be so hard on patterns": this changes the strictness level for the whole review, not one finding. Re-walk every Pattern-bucket finding under the new level (`references/severity-and-scoring.md`) and re-present the updated table before drafting.

Draft only after the user has said which findings ship and accepted a score. A draft nobody asked for gets redone.

## Step 6: Draft template (sandwich, the validated default)

Use this shape unless the user sets another. Keep the constructive middle tied to the citations in the findings table, not to a vaguer rephrasing of them.

```
## Feedback: PR #<N> <title>

<Name>, <one genuine, specific opening observation, not generic praise. Name the
actual thing done well and why it mattered, evidence and all, like a finding.>

<second positive if there is a natural one; do not pad if there is only one strong point.>

<One sentence moving into the constructive section, no hedging preamble.>

**1. <Finding title> (<severity>).** <What is wrong, where, why it matters, and, when
there is an obvious one, a concrete suggested fix.>

**2. <Finding title> (<severity>).** <Same shape.>

<Optional: lighter pattern-level notes, framed as comparison and not error,
grouped apart from the numbered real findings.>

**Score: X.X / 10**

<Closing positive: genuine, forward-looking, not a repeat of the opening. Tie it to
what the fix path looks like or what is already solid enough to build on.>
```

## Step 7: Confirm, then post

The confirmation has to be unambiguous and about this draft. "Looks good" while you are still discussing severity is not the same as "post it" after the final draft is shown. When in doubt, show the full draft again and ask directly.

Posting commands:

```bash
# Save the draft to a scratch file first (avoids shell-escaping issues with markdown/backticks)
cat > <scratchpad>/pr<N>_feedback.md << 'EOF'
<the confirmed draft, verbatim>
EOF

# This repo, current branch's PR
gh pr comment <N> --body-file <scratchpad>/pr<N>_feedback.md

# External repo
gh pr comment <N> --repo <owner>/<repo> --body-file <scratchpad>/pr<N>_feedback.md
```

Report the comment URL that `gh pr comment` returns. That URL, not the fact that the command ran, shows the action happened.

If the user approved only part of a multi-PR batch ("post PR #1, hold PR #2"), post exactly that subset and say plainly what is pending and why. An earlier yes for one PR is not consent for a sibling PR still being triaged.
