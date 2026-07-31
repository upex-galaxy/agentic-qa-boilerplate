# Severity, Strictness, and Scoring

> Read at Step 0 (choosing strictness) and Step 3 (bucketing findings) of `SKILL.md`.

## The three buckets

Every finding lands in exactly one bucket. The bucket, not the tier label, is what actually drives the score.

**Real / Reliability** — something is evidently wrong or puts the tests' correctness/reliability at risk, independent of anyone's architectural taste. Hardcoded credentials, a test that depends on unseeded shared-environment data it can't guarantee, a global config choice that will hurt CI at scale, a coverage gap the PR author never justified. These get weight at every strictness level, including Flexible.

**Pattern / Doctrine-deviation** — the code works, nothing breaks, but it diverges from a convention this repo (or the target repo) actually documents. This is a comparison, not a verdict: "the documented pattern does X, this PR does Y." Whether this bucket gets surfaced at all, and how much it counts toward the score, depends on the strictness level chosen in Step 0.

**Positive** — not optional, not a courtesy. A finding here is exactly as evidence-grounded as the other two: "5 consecutive stable runs is real evidence, not a claim" is a Positive finding the same way a hardcoded password is a Real/Reliability finding.

## Strictness levels — what changes

| Level | Real/Reliability | Pattern/Doctrine-deviation | Score impact of Pattern findings |
|---|---|---|---|
| Flexible | Full weight, always surfaced | Not surfaced at all unless it's ALSO a reliability risk | None |
| Standard (default) | Full weight | Surfaced as a labeled observation, explicitly not called an error | None — pattern notes are informational, never subtracted |
| Strict | Full weight | Surfaced as a tagged finding, including things that are "technically fine but not per the documented pattern" or not really part of the intended flow | Small — a genuine, cleanly-documented doctrine violation can shave a fraction of a point, but should never dominate the score the way a Real/Reliability finding does |

The level is a lens on what gets *reported*, not a license to invent findings. At Strict, you still need the same evidence bar (`references/evidence-and-doctrine-lookup.md`) — you're just lowering the threshold for what counts as worth reporting, not lowering the bar for proof.

## Worked example (why this doctrine exists)

During a real review session, an initial pass flagged a nested-decorator pattern — a helper method inside an ATC's flow was itself decorated `@atc` and invoked from inside another `@atc` method, which the repo's own doctrine (`CLAUDE.md` §10: *"ATC... NEVER calls another ATC. Reusable chains → Steps module."*) states as a hard rule — and scored it as "Crítico." The user pushed back: most engineers don't implement any architecture 100% by the book, and a pattern deviation that doesn't actually break anything shouldn't be framed as an "error" the way a real bug is. The correct call, once recalibrated to Standard strictness, was:

> "El patrón KATA profesional separa esto con `@step` para no anidar ATCs — funciona igual, simplemente el patrón documentado dice otra cosa. Se lo menciono como comparación de patrón, no como error."

Same underlying fact, same doctrine citation, completely different weight and framing. That recalibration is the canonical example of Standard strictness working correctly — cite the doctrine, don't dramatize the deviation, don't let it drag the score.

Contrast with a Real/Reliability finding from the same PR that kept its full weight regardless of strictness level: two test cases depended on pre-existing data in a shared staging environment with no self-seeding mechanism, unlike a sibling test case in the same PR that did self-seed. That's a genuine risk (silent breakage if the environment's fixture data ever changes) independent of any architectural opinion, so it stayed a "Mayor" finding even after the user asked for a lighter touch on pattern-only items.

## Scoring rubric

Score out of 10. Start at 10 and subtract:

- Each **Crítico** Real/Reliability finding: -1.5 to -2.5 depending on blast radius (a hardcoded secret in a public demo repo is a smaller real-world risk than the same pattern in a repo with real user data — say so, and weight accordingly).
- Each **Mayor** Real/Reliability finding: -0.5 to -1.
- Each **Menor** Real/Reliability finding: -0.1 to -0.3.
- Pattern/Doctrine-deviation findings: 0 at Flexible/Standard. At Strict, -0.1 to -0.2 each, capped so Pattern findings alone cannot pull the score below what the Real/Reliability findings alone would produce plus 1 point — a PR with zero real defects and ten pattern nitpicks should still land solidly above the midpoint.
- Do not add points back for Positives — they don't offset defects, they're reported separately so the feedback isn't just a list of problems. A PR with a critical finding and excellent positives is still a PR with a critical finding; say both, honestly.

Always attach a one-line rationale to the number ("6.5/10 — solid framework structure, but credential handling and PR-size hygiene both land in Real/Reliability"), not just the digit. The user is going to see this number before deciding what to actually send — it needs to be defensible on its own, because they may ask you to justify it before triaging (Step 5).
