# HTML surfaces: opening a generated page inside the runtime

Measured 2026-09-18 against orca 1.4.190, on the primary checkout of this repo.

The runtime opens **browser tabs bound to a worktree**, not only terminals. A page opened that way sits
next to the terminals that produced it, on the same card, reachable from the same board and the same
phone. A page opened in the system browser sits nowhere: it has no worktree, it is invisible to the
board, and it is the first thing lost when the owner closes a window.

This repo generates several pages that qualify. They are all read-by-a-human artifacts, not test output:
the coverage map from `bun run tests:map`, an Allure report, the how-it-works decks under
`packages/decks/`, and any decision deck a skill renders for the owner.

---

## The gate applies here exactly as everywhere else

This is the FOURTH gated line a workflow skill may use (`references/launch-seam.md` §2.3), and it
carries the same silence rule as the other three.

| Gate state | What happens |
|---|---|
| **ready** | offer the worktree-bound tab, or just open it when the owner already asked for the page |
| **no binary / runtime unreachable** | open the page the ordinary way and **say nothing at all**. Not a hint, not an aside, not "this would be nicer in…" |

A page that opens in the system browser is not a degraded outcome. It is the normal outcome, and it
is what every machine without the runtime has always done. The improvement is invisible when absent,
which is the whole contract.

---

## Two routes, and why one of them is not just prettier

Both were verified end to end: the tab loaded, the page rendered (confirmed by an accessibility
snapshot showing live controls, not just a title), and browser storage read and wrote back under both
origins, so a deck's own persistence survives.

| Route | What it buys | What it costs |
|---|---|---|
| a `file://` URL to the generated page | nothing to run, nothing to stop, works for any artifact already on disk | the owner still has to copy the result out by hand, for a page that produces one |
| a loopback URL served by the tool that renders the page | **the submitted result returns to the agent directly**, so nothing is copied and nothing is pasted | a server to start, a port, and a lifetime to manage |

For a page the owner only READS (a coverage map, a report), the `file://` route is the whole answer.
For a page the owner ANSWERS (a decision deck), the loopback route is the one that closes the loop,
and the difference is not cosmetic: it removes the step where a result gets truncated, lost, or pasted
into the wrong conversation.

---

## The dead end, recorded so nobody pays for it twice

Reading the result out of the clipboard does NOT work, and it is the obvious-looking shortcut:

```
NotAllowedError: Failed to execute 'readText' on 'Clipboard': Document is not focused.
```

Bringing the tab to the foreground first does not fix it. The embedded page does not acquire DOM focus
from a tab switch, so the Clipboard API keeps refusing. That failure is what makes the loopback route
the only way to eliminate the manual paste, rather than a preference between two equivalent options.

---

## Two rules when a page holds state

1. **One copy, or the state splits.** Browser storage is per-origin and per-engine, so the same deck
   opened in the system browser and in a worktree tab keeps two separate sets of answers that never
   merge. Open one, say which one is live, and close the other. Closing the wrong one silently discards
   whatever was already answered in it.
2. **Check before you switch.** Moving a half-answered page from one origin to the other loses the
   answers. Read the page's own storage key first and only offer the move when nothing is stored yet.

---

## Grammar

Ask the binary, as always (`orca skills get orca-cli`); it owns the verbs and this reference does not
copy them. What matters here and is NOT in the vendor guide: pass the worktree selector explicitly so
the tab is bound rather than floating, and verify afterwards that the tab reports no load error and
that the page actually rendered. A tab that opened is not a page that worked.
