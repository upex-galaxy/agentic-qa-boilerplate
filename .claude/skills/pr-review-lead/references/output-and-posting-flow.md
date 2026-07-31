# Output and Posting Flow

> Read at Steps 4-7 of `SKILL.md`. Covers the findings table, the triage conversation, the feedback draft, and posting.

## Step 4 — Findings presentation template

Group by bucket, severity within bucket, always include the citation column, always include the Positive list even before the user asks for it:

```
| # | Severidad | Archivo/Ubicación | Observación (con evidencia) |
|---|---|---|---|
| 1 | Crítico | config/variables.ts:34 | Password fallback hardcodeada en código (`\|\| 'Demo123!'`). CLAUDE.md Regla Crítica #1: "ALWAYS read from .env. NEVER hardcode/guess." |
| 2 | Mayor | (PR-wide) | 97% del diff (+36k líneas) es un commit de sync de template no relacionado; dificulta la revisión aun con nota aclaratoria del autor. |
```

Close with:

```
Puntos fuertes:
- <positive finding 1, with its own evidence>
- <positive finding 2>

Score: X.X / 10 — <one-line rationale tied to the buckets that drove it>
```

Nothing here is sent anywhere yet. This is the checkpoint the user reacts to in Step 5.

## Step 5 — Triage conversation

Expect and welcome pushback of these shapes, and act on it directly rather than re-arguing the original call:

- "Solo los críticos y mayores" — filter the set that goes to the draft; don't re-run analysis, just re-scope.
- "Ese no es un error, es un patrón" — reclassify from Real/Reliability to Pattern/Doctrine-deviation (or drop entirely if it was already borderline), re-state the score with the new weighting, ask if the new score is acceptable before moving on.
- "No seamos tan duros con los patrones" — this is a strictness-level change mid-review, not a one-off reclassification. Re-walk every Pattern-bucket finding under the new level (see `references/severity-and-scoring.md`) and re-present the updated table before drafting anything, don't just quietly adjust the next one.

Once the user has told you which findings ship and confirmed a score they're comfortable with, move to drafting. Don't draft speculatively before this point — a draft the user didn't ask for is a draft you'll have to redo.

## Step 6 — Draft template (sandwich, the validated default)

Use this shape unless the user specifies a different structure. Keep the constructive middle section tightly evidence-linked — every point references the citation from the findings table, not a rephrased vague version of it.

```
## Feedback — PR #<N>: <title>

<Name>, <one genuine, specific opening observation — not generic praise. Name the
actual thing done well and why it mattered, exactly like a finding, evidence and all.>

<second positive if there's a natural second one — don't pad if there's only one strong point.>

<Transition into the constructive section — one sentence, no hedging preamble.>

**1. <Finding title> (<severity>).** <What's wrong, where, why it matters, and — when
there's an obvious one — a concrete suggested fix.>

**2. <Finding title> (<severity>).** <Same shape.>

<Optional: lighter pattern-level notes, explicitly framed as comparison not error,
grouped separately from the numbered real findings.>

**Score: X.X / 10**

<Closing positive — genuine, forward-looking, not a repeat of the opening. Tie it to
what the fix path looks like or what's already solid enough to build on.>
```

## Step 7 — Confirm, then post

The confirmation has to be unambiguous and about *this* draft. "Se ve bien" while you're still discussing severity levels is not the same as "postealo" once the final draft is shown. If in doubt, show the full draft one more time and ask directly rather than inferring.

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

Report back the comment URL `gh pr comment` returns — that's the confirmation the action actually happened, not just that the command was run.

If the user approved only part of a multi-PR review batch (e.g. "post PR #1, hold PR #2"), post exactly that subset and say plainly what's still pending and why — don't let an earlier "yes" for one PR imply consent for a sibling PR still being triaged.
