# Adversarial Verification and Tie-break

> Cited by: `exploratory-testing` (its Refute and Tie-break steps), `sprint-testing`
> (`references/exploration-patterns.md` §"Finding triage", before a finding becomes a bug proposal).
> Companions: `./defect-management-doctrine.md` (how a surviving finding is classified and filed),
> `./discovery-driven-doctrine.md` §4 (a surviving finding on behaviour with no AC is still `observed`,
> and a person decides whether it is intended), `./dispatch-patterns.md` (the Parallel pattern the
> verifiers use).

Read this when verifying an anomaly before it is reported. A recon pass produces leads, and a lead becomes a finding only after someone whose job is to kill it has failed to. That is what separates an evidence-backed finding from a plausible-looking one.

---

## 1. The refute mandate

For every anomaly with a `severity_hypothesis` of Medium or higher, dispatch a **Parallel** verifier per `./dispatch-patterns.md`. Its job is to refute the anomaly, not to confirm it. Give it the anomaly and tell it to try to explain it away as:

- a join fan-out (the "duplicate" is N legitimate rows from a 1:N join, not one row counted twice),
- a data quirk (a known-weird-but-intended value, such as a legacy migration artifact),
- intended behaviour (the code does what the business rule says, just not what a guide or a map says),
- a harness artifact (the recon agent's own query, fixture or role produced the anomaly, not the app).

A finding survives only if the verifier cannot refute it. When two verifiers reach different verdicts on the same finding, do not average them and do not pick the more alarming one. Escalate to the tie-break (§4).

The posture is inverted on purpose. An agent asked "is this a bug?" tends to agree with whatever framing it is handed. An agent asked to prove it is not a bug has to do real verification work to close out cleanly, and that discipline catches an over-eager first read.

---

## 2. Check the row's own invariant, not just that it differs from another row

Measured, then rule: a first verifier dismissed two rows as "two different kinds of line, not a duplicate" because they differed in the fields that define their kind. That check compared the rows to each other. It never asked whether the disputed row satisfied its own rule. It did not: its total broke the formula its own fields define, and it matched the other row's total exactly. That is a copy, not a coincidence of two valid values, and it was a real defect.

**The rule.** When verifying an anomaly in a computed value (money, a count, a status derived from other fields), ask two questions:

1. Does this row satisfy its own stated invariant (formula, constraint, state rule), independent of any other row? Prove the invariant on an undisputed row first.
2. Does it also, suspiciously, match something it has no invariant-based reason to match?

A "no" to question 1 together with a "yes" to question 2 is strong evidence of a real bug. A "yes" to question 1 usually means a false positive, however question 2 comes out.

---

## 3. Execute the competing hypotheses, never infer them

When a verifier's argument depends on "the live path behaves like X", it runs the actual query, API call or UI flow and pastes the command and its output, side by side with the competing hypothesis's command and output. Inferring the mechanism from a response shape, a code read or "this looks like the buggy path" is not verification. A right verdict with an unexecuted mechanism still carries the wrong mechanism into the bug report, and from there into the fix.

The same posture drives the observation rule (`./discovery-driven-doctrine.md` §5.2): evidence about the system is not an execution of it.

---

## 4. The tie-break belongs to the conductor

When two verifiers disagree, or one verifier's refutation rests on an assumption nobody can check without reading more code, the session that owns the run resolves it. A third verifier hoping for a majority only adds noise on top of two inconclusive opinions. This step is inline and waits on no person, so it runs the same way with a person present, under a conductor or in a routine.

Resolve it with:

1. A decisive query or API call that distinguishes the two hypotheses (not a repeat of either verifier's own query).
2. A direct read of the code path that is actually live (the backend or frontend repository named in `.agents/project.yaml`): which route, handler and caller a real user reaches, not what a guide says should happen.

On a data-integrity, money or security finding, never let one agent's verdict stand unchallenged. Both errors cost most there: a real defect reported as refuted, or a wrong mechanism reaching an engineer who did not write the code.

Measured, then rule: two verifiers disagreed on whether a module with visibly wrong arithmetic was live. The tie-break was a router read plus a navigation check, which showed the module served only a hidden legacy route no menu links to. The defect was real, but its severity dropped to match how few users can reach it. Map endpoint -> handler -> caller -> navigation entry before sizing any finding on a screen.

---

## 5. Known false-positive trap categories

Traps that already produced a false positive once are recorded so the next run does not rediscover them. The instances are project facts and live in the project's own record (the module's `## Module Context (QA)` section, or `agent-project.md`). This file keeps only the categories:

| Category | Shape | Check before reporting |
|---|---|---|
| Hidden twin | a legacy or unlinked screen, route or job that consumes different code than the customer-facing one | map endpoint -> handler -> caller -> navigation entry; size severity by reachability |
| Placeholder values | sentinel data (hashes of empty strings, default ids, seed rows) that a naive aggregate counts as real | exclude the sentinels explicitly in the detection query and say which ones |
| Sparse environment data | a test environment with too little recent activity to observe "regressed this sprint" | say so in the finding; date it by the closest creation timestamp, never by a business date |
| Schema drift | a column, enum or field that the project docs describe differently from the live store | read the live schema before writing a query that leans on a name |

A verifier that hits one of these writes it into the finding's "why it was refuted" line, so the record explains itself.

---

## 6. Verify a DECIDED answer before applying it

The refute mandate also covers a decision. Every question the researcher tiered `decide`
(`./question-research.md`) that would change an AC, a business rule, the scope or a contract goes to one
refutation subagent, briefed with the 7 components, before the orchestrator applies it. A `follow` answer
is not verified, because the record already carries it.

The verifier tries to kill the proposal. It checks:

- a source that contradicts it;
- a role or tenant for which it breaks;
- an existing, different product pattern it departs from;
- an irreversible or outward consequence nobody saw;
- a sibling Story it collides with.

Verdicts:

| Verdict | Effect |
|---|---|
| `holds` | the orchestrator applies the decision and reports it as DECIDED |
| `refutes` | escalate under `./decision-protocol.md` §5, with the verifier's evidence attached |
| `doubt` | same as `refutes`: escalate with the evidence |

The verifier executes what it claims (§3) and names the source of each check. A verdict that rests on an
inference is `doubt`.
