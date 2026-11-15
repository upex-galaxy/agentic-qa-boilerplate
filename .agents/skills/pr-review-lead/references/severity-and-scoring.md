# Severity, Strictness, and Scoring

> Read at Step 0 (choosing strictness) and Step 3 (bucketing findings) of `SKILL.md`.

## The three buckets

Every finding lands in exactly one bucket. The bucket, not the tier label, drives the score.

**Real/Reliability**: something is evidently wrong or puts the tests' correctness or reliability at risk, whatever anyone's architectural taste. Hardcoded credentials, a test that depends on unseeded shared-environment data it cannot guarantee, a global config choice that will hurt CI at scale, a coverage gap the author never justified, a lying test (`test-automation/references/review-checklists.md`, LT-1 to LT-3: one that passes by construction, cannot fail, or breaks on a harmless refactor). These get weight at every strictness level, Flexible included.

**Pattern/Doctrine-deviation**: the code works and nothing breaks, but it diverges from a convention this repo (or the target repo) documents. This is a comparison, not a verdict: "the documented pattern does X, this PR does Y." Whether the bucket is surfaced, and how much it counts toward the score, depends on the strictness level chosen in Step 0.

**Positive**: not optional, not a courtesy. A finding here is as evidence-grounded as the other two: "5 consecutive stable runs is real evidence, not a claim" is a Positive finding the same way a hardcoded password is a Real/Reliability one.

## Strictness levels: what changes

| Level | Real/Reliability | Pattern/Doctrine-deviation | Score impact of Pattern findings |
|---|---|---|---|
| Flexible | Full weight, always surfaced | Not surfaced at all unless it is ALSO a reliability risk | None |
| Standard (default) | Full weight | Surfaced as a labeled observation, explicitly not called an error | None: pattern notes are informational, never subtracted |
| Strict | Full weight | Surfaced as a tagged finding, including things that are "technically fine but not per the documented pattern" or not really part of the intended flow | Small: a genuine, cleanly documented doctrine violation can shave a fraction of a point, but never dominates the score the way a Real/Reliability finding does |

The level is a lens on what gets reported, not a license to invent findings. At Strict the evidence bar (`references/evidence-and-doctrine-lookup.md`) stays the same; only the threshold for what is worth reporting drops.

## Severity tiers

Critical, Major, Minor and Trivial, in the user's language. `review-checklists.md` grades with CRITICAL, HIGH, MEDIUM and LOW: read HIGH as Major, MEDIUM as Minor and LOW as Trivial when you carry one of its findings over.

## Worked example (why this doctrine exists)

In a real review, a first pass flagged a nested-decorator pattern: a helper inside an ATC's flow was itself decorated `@atc` and called from inside another `@atc` method. The repo's doctrine (`.agents/instructions/agent-code-quickref.md`: *"ATC... NEVER calls another ATC. Reusable chains → Steps module."*) states that as a hard rule, and the first pass scored it Critical. The user pushed back: most engineers do not follow an architecture 100% by the book, and a deviation that breaks nothing should not be framed as an error the way a real bug is. The right call, once recalibrated to Standard, was:

> "The professional KATA pattern separates this with `@step` so ATCs don't nest. It works the same, the documented pattern just says otherwise. I'm mentioning it as a pattern comparison, not an error."

Same fact, same doctrine citation, a different weight and framing. That recalibration is the model for Standard working correctly: cite the doctrine, do not dramatize the deviation, and do not let it drag the score.

Contrast a Real/Reliability finding from the same PR that kept its full weight at every level: two test cases depended on pre-existing data in a shared staging environment with no self-seeding, unlike a sibling test case in the same PR that did seed itself. That is a genuine risk (silent breakage if the environment's fixture data changes) whatever the architectural opinion, so it stayed Major even after the user asked for a lighter touch on pattern-only items.

## Scoring rubric

Score out of 10. Start at 10 and subtract:

- Each **Critical** Real/Reliability finding: -1.5 to -2.5 depending on blast radius. A hardcoded secret in a public demo repo is a smaller real-world risk than the same pattern in a repo with real user data; say so and weight accordingly.
- Each **Major** Real/Reliability finding: -0.5 to -1.
- Each **Minor** Real/Reliability finding: -0.1 to -0.3.
- Pattern/Doctrine-deviation findings: 0 at Flexible and Standard. At Strict, -0.1 to -0.2 each, capped so Pattern findings alone cannot pull the score below what the Real/Reliability findings alone would produce plus 1 point. A PR with zero real defects and ten pattern nitpicks still lands solidly above the midpoint.
- Positives add nothing back. They do not offset defects; they are reported separately so the feedback is not only a list of problems. A PR with a critical finding and excellent positives is still a PR with a critical finding, and you say both.

Attach a one-line rationale to the number ("6.5/10: solid framework structure, but credential handling and PR-size hygiene both land in Real/Reliability"), not just the digit. The user sees the number before deciding what to send and may ask you to justify it before triaging (Step 5), so it has to stand on its own.
