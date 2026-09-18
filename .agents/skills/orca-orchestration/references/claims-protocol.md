# Claims Protocol — Shared Fixtures, Data and Credentials

> Loaded by: the conductor (it arbitrates) and every worker (it declares).
> There is no claim command and no lock daemon. A claim is a MESSAGE with a reserved subject
> prefix, and the conductor keeps the ledger. That is deliberate: a file-based lock in a fleet
> spread over several worktrees needs a shared filesystem, a TTL, crash recovery and an atomic
> write — four moving parts to replace one conductor who is already awake and already arbitrating.

---

## 1 · What is claimable, and what is not

A claim covers a **shared mutable resource that two workers could touch at once**. It does NOT cover
files: file collisions are prevented at assignment time by file ownership (`references/topologies.md`),
not at runtime.

| Entity | Id shape | Typical intent | Why it collides |
|---|---|---|---|
| `user` | the login or account id | `write` (state change), `read` (login only) | two workers logging in as the same user invalidate each other's session |
| `fixture` | the fixture or dataset name | `write` | one worker mutates the record another is asserting on |
| `record` | `<type>:<id>` of a real row | `write` | the classic dirty read across two sessions |
| `credential` | the role plus environment | `write` = mint / refresh, `read` = use | a refresh rotates the token the other worker is holding |
| `env-resource` | queue / bucket / tenant / feature flag | `write` | a flag flipped for one worker changes another's expected behaviour |
| `tracker-artifact` | the issue or artifact key | `write` | two writers on one description overwrite each other wholesale |

Three intents:

- **`read`** — I will not change it. Several `read` grants coexist.
- **`write`** — I may change it. A `write` grant is exclusive and it excludes concurrent `read`s on
  the same entity id.
- **`enumerate`** — I will LIST a shared-account collection whose contents include my siblings'
  entities. Nothing is mutated, and yet it is not a `read`: a listing on a shared account is not a
  stable observation and can never be an assertion target.

### Why `enumerate` exists

Measured 2026-09-17: three workers minted three distinct API tokens under three isolated profiles,
and one of them found that the account's own token-listing endpoint returns ALL of them. The
isolation was real at the file level and absent at the API level. Nothing collided, nothing was
mutated, and an assertion on "the account has N tokens" would have been wrong for all three of them
at once.

So the rule: a collection endpoint on a shared account is claimed as `enumerate`, and an
`enumerate` claim carries one consequence the conductor must broadcast — **nobody asserts on the
collection's size, contents or ordering.** Assert on your OWN entity, found by its own id. Several
`enumerate` grants coexist (like `read`); a `write` on the same entity id still excludes them.

State the claim at the smallest id you can defend. `fixture:checkout-cart` is arbitrable;
`fixture:all` is a fleet-wide stop.

---

## 2 · Message shapes

The runtime has no `claim` message type. The protocol lives in the SUBJECT, so it is greppable in the
mailbox and in the ledger, and the body carries the reason a human would need to arbitrate.

Worker → conductor (declare):

```bash
orca orchestration send --type status \
  --subject "CLAIM fixture:checkout-cart write" \
  --body "BK-123 Stage 2: I mutate the cart totals to assert the discount rule. ~15 min. Alternative if denied: seed my own cart." \
  --json </dev/null
```

Conductor → worker (grant or deny):

```bash
orca orchestration send --to dispatch:<id> --type status \
  --subject "CLAIM-GRANTED fixture:checkout-cart write" --body "Yours until you release it. W3 is queued behind you." --json </dev/null

orca orchestration send --to dispatch:<id> --type status \
  --subject "CLAIM-DENIED fixture:checkout-cart write" --body "W2 holds the write. Use <alternative>: seed your own cart under your own prefix." --json </dev/null
```

A worker whose claim was pre-granted in its brief (§3 rule 0) sends the same shape ONCE as an
announcement and does not wait:

```bash
orca orchestration send --type status \
  --subject "CLAIM credential:qa-buyer@staging enumerate" \
  --body "Pre-granted in my brief. The token list on this shared account shows every sibling's token, so I assert only on my own token id, never on the collection." \
  --json </dev/null
```

Worker → conductor (release, only when the release is EARLY):

```bash
orca orchestration send --type status --subject "CLAIM-RELEASED fixture:checkout-cart write" --body "done with it" --json </dev/null
```

A denial that names no alternative is a bug in the protocol: the conductor either grants, or denies
AND says what to do instead. A worker that receives a bare denial asks once with a blocking `ask`.

---

## 3 · Arbitration rules

0. **A claim listed in a worker's brief is PRE-DECLARED and PRE-GRANTED.** The conductor decided it
   at triage (§5) and granted it at launch, so the worker announces it and starts working. Only a
   claim DISCOVERED mid-run waits for a grant.
   This rule exists because the contradiction it resolves cost a real stall: the protocol said "wait
   for the grant" while the brief said the list was pre-agreed, and a worker correctly stopped,
   unable to tell which document governed. If a claim needs arbitration, it does not belong in the
   brief; if it is in the brief, it does not need arbitration.

1. **First message wins.** Order is the mailbox's arrival order, not the worker's clock and not the
   roster order. This is the whole rule; it needs no tie-breaker in normal operation.
2. **`write` is exclusive**; `read` and `enumerate` grants stack. A `write` request against a live
   `read` or `enumerate` grant queues behind it, and the conductor tells the requester who is ahead.
   An `enumerate` grant is broadcast with its consequence attached: nobody asserts on that
   collection's size, contents or ordering.
3. **Rare genuine dispute** (two claims in the same batch, same entity, same intent): the conductor
   decides, on impact — whoever is further along, or whoever is blocked hard rather than
   inconvenienced. It writes the reason in the ledger. There is no automatic resolution to appeal to.
4. **A grant is released by `worker_done`.** Every claim a worker held is released the moment its
   `worker_done` lands, with no separate message. An explicit `CLAIM-RELEASED` is only for releasing
   early so a queued worker can move.
5. **The conductor broadcasts the consequence** to the workers it affects: the one who gets the grant,
   and the ones who were waiting. A grant nobody is told about is a lock with no lock.
6. **The conductor never holds a claim for itself while also arbitrating one.** Conductor-only
   operations (token minting, schema sync, fleet-altitude tracker writes) happen BETWEEN rounds, with
   no worker in flight against them. See `references/coordinator-playbook.md` §7.

---

## 4 · The ledger

`.session/orchestration/<slug>/claims.md`, owned by the conductor, append-only, one line per event:

```
[HH:MM] <worker> <entity>:<id> <read|write|enumerate> <pre-granted|granted|denied|released>
```

Example:

```
[09:30] W1 credential:qa-buyer@staging enumerate pre-granted   -> no assertion on the collection
[09:41] W2 fixture:checkout-cart write granted
[09:44] W3 fixture:checkout-cart write denied      -> seeds own cart
[10:02] W2 fixture:checkout-cart write released
[10:02] W3 fixture:checkout-cart write granted
```

A `pre-granted` line is written by the conductor at LAUNCH, from the brief, not when the worker
announces it. Then the ledger and the briefs cannot disagree about what was already decided.

Append-only because two writers rewriting one file is the failure the ledger exists to prevent. The
ledger is the answer to "why did BK-140 use different data than BK-123" three days later.

---

## 5 · Collision detection at triage (planning aid)

Runtime claims are the safety net. The cheap win is not needing them, and that is a triage-time
decision made in the SAME vocabulary, before anything launches:

1. For each unit of work, write down the entities it will touch and the intent
   (`user:qa-buyer write`, `fixture:catalog read`, `credential:qa-buyer@staging enumerate`).
2. Two units with the same `entity:id` and at least one `write` → **do not put them in the same
   round**, or re-scope one to seed its own data.
3. Two units with the same entity and both `read`, or both `enumerate` → same round is fine. For
   `enumerate`, carry the consequence into both briefs: no assertion on the collection.
4. Write the resulting per-unit claim list into each worker's brief, and log each one as
   `pre-granted` in the ledger at launch (§3 rule 0, §4). A claim in the brief is a decision already
   taken; the worker announces it and works.

This is where the pairing is decided, and it is much cheaper than arbitrating the same collision at
10:41 with two workers stalled.

---

## 6 · Fallback with no runtime (degraded, optional)

With no mailbox there is no arbiter, so the protocol degrades to a convention over the same file:

- `claims.md` lives in the scope the workflow skill already writes to and is **append-only**.
- Before touching a shared entity, a session greps `claims.md` for that `entity:id`. A live `write`
  line with no matching `released` line means: do not touch it, seed your own data.
- Claiming = appending one line with the same four fields, then re-grepping to confirm nobody
  appended the same claim in between.
- Releasing = appending a `released` line.

Be honest about what this is: a cooperative convention with a real race window between the grep and
the append, and no recovery when a session dies holding a claim. It is strictly better than nothing
and strictly worse than an arbiter. Document in the run notes that the fleet ran degraded, and keep
rounds smaller.
