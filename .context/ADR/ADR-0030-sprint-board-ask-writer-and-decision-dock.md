# ADR-0030 — Sprint Board asks have one locked writer, only the page writes as the owner, and the Decision dock publishes nothing

- **Status:** Accepted (by the owner, in the approved EDD round, board ports package, 2026-11-27)
- **Date:** 2026-11-27
- **Deciders:** framework owner (boilerplate maintainer), through the approved EDD round; the technical calls inside the board ports package were taken by the delivery that built it
- **Tags:** sprint-board, storage, locking, authorship, decision-dock, snapshots
- **Supersedes:** ADR-0023 in part (§Decision points 1, 4 and 8: amended, nothing in them is withdrawn). The rest of ADR-0023 and its amendments stand.
- **Superseded by:** —

---

## Context

ADR-0023 gave each sprint one append-only log, one lock (`source.json.lock`, for the tracker read) and publish snapshots built by allowlist. The board ports package added ask states that move in steps, and the Decision dock, where the owner answers many questions in one batch.

Both need more than an append. A move is read, checked and then written, so two writers can fork it. A conductor also opens gates on what the owner wrote, while the CLI of that time signed an `answer` given without `--by` as `owner`. And the dock stores agent questions and owner text in the same log that the shared snapshots are folded from.

## Decision

We will keep the single log of ADR-0023 and add these rules.

**1. Locks, for writes that check before they append** (`store.ts`). An ask transition runs under `asks.lock`; a dock send, consume or close runs under `sweep.lock`. Both live in the sprint folder. A waiter takes over a lock whose holder process is gone, or one older than `ASK_LOCK_STALE_MS`, one waiter at a time. `source.json.lock` has no dead-holder takeover. Any other append takes no lock.

**2. One writer for ask moves** (`ask-transition.ts`). The page, the CLI and the messenger hand-off write `ask.state` through it and nowhere else. Under the lock it folds the log again, checks the move against `askTransition` (`model.ts`) and the caller's `expect`, confirms the lock is still its own and appends at most one event. Asking for the current state writes nothing, unless it brings a new reply. The phase of an ask is derived on read, never stored. Agents and the page enter through separate functions, and only the page's one signs `owner`. `messenger.ts` is an interface with no provider.

**3. Only the page writes as the owner** (`server.ts`). Its POST routes sign `owner` and ignore an author sent in the request. Every CLI command refuses a `--by` that reads as `owner`, and a `--by` with no value. A command whose event states what someone said or decided requires an author; the table in `cli/sprint-board/README.md` §Authors says which. A question an agent answered still awaits the owner, an agent's answer never replaces the owner's, and the owner's response time counts the owner's answers only.

**4. The Decision dock** (`sweep.ts`, `app/dock.ts`). It is a view over the same log: its open items plus the needs-you cards that still await the owner. A send writes the card answers, one `sweep.answer` per item and a closing `sweep.batch` marker in one append, with a result per item. A reader is handed a batch only once its marker exists. A worker neither posts nor retires an item (it raises a needs-you card), and only the conductor marks a batch or note read. `sweep.ts` is pure and joins the modules of ADR-0023 point 8 that run in the page.

**5. What a snapshot carries.** No snapshot carries the dock's items or batches. The full copy keeps what is also ordinary board content: card answers and dock notes. For share and report, the ADR-0023 point 4 tripwire also refuses the write when an item's question, the owner's free text on an item or a dock note shows up in the output and the same board, folded without its dock, does not publish it.

## Consequences

- **Positive:** outside the gaps below, two writers cannot fork an ask or send the same dock item twice, and a repeated click writes once. `listen` and the sentinel report an owner action only when it did not come through the CLI.
- **Negative, what an owner answer proves:** it did not come through the CLI, not who typed it. A process on the same machine that calls the page's routes, or edits `events.ndjson`, is not stopped: the headers the routes check carry no secret. A log written before this rule may hold `owner` events the CLI signed by default.
- **Negative, the gate is doctrine:** an agent must not resolve a gating question before the owner's own record exists (`.agents/skills/sprint-testing/references/sprint-board.md` §3), and `resolve` does not enforce it.
- **Negative, lock gaps:**
  - The ownership check and the append are two steps, so a writer stalled long enough for its lock to go stale between them can still write after a takeover.
  - A dead holder whose process id was reused reads as alive. The lock is freed only by the stale age, and a writer that gives up first fails.
  - `answer`, `resolve` and the page's card route take no `sweep.lock`. A card resolved from the CLI while a send is being written can be reported `written` although the resolved card takes no answer.
  - The transition table is checked when writing; the fold applies any known state the log holds.
- **Negative, other limits:**
  - A server that dies while a messenger is drafting leaves the ask `approved`. Nothing records the result by itself, and asking for `approved` again writes nothing.
  - A dock append cut short (a full disk) can leave answers on their items with no marker, so `sweep read` and the sentinel's dock part never hand that batch over.
  - The dock tripwire probes the start of those texts and skips very short ones; context and option labels rest on the allowlist. The older tripwire for ask text has no such comparison, so text repeated elsewhere on the board can block a snapshot.
- **Neutral / follow-ups:** a messenger provider would turn on the drafting states. A board server started before the dock must be restarted to take its answers.

## Alternatives considered

- **Let each caller append ask moves itself.** No place to check the table, `expect` and the lock together, and concurrent identical writes would each append.
- **Require `--by` on every command, or only on `answer` and `ask-state`.** The first is noise on events whose author nothing reads; the second leaves other statements of what someone decided unsigned.
- **A harness hook that refuses agent commands calling the page's routes or writing the log.** Not built in this delivery; a script file could still bypass it.
- **Give `source.json.lock` the same dead-holder takeover.** Left out, so the tracker sync keeps the behaviour it had.

## References

- `cli/sprint-board/README.md` (§Authors, §Asks, §Decision dock), `.agents/skills/sprint-testing/references/sprint-board.md` (the conductor's side).
- `cli/sprint-board/ask.test.ts`, `cli/sprint-board/sweep.test.ts`, `cli/sprint-board/server.test.ts`, `cli/sprint-board/cli.test.ts`.
- ADR-0023 (the store, the allowlists and the browser bundle).
