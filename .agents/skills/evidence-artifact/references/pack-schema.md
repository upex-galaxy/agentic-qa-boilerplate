# Evidence pack schema `evidence-pack/2.0`

One JSON file per evidence artifact: `evidence/evidence-pack.json` for the ticket under test, plus
`evidence/evidence-pack-<BUG>.json` for each bug filed from it (`workflow.md` §1). The session
writes the pack; `scripts/build.py` renders it. Nobody edits the template per ticket.

`build.py` validates the pack and stops with a message naming the field when something is wrong. It
refuses `evidence-pack/1.0`, the earlier format of this repo, in one line; rewrite such a pack in this
shape. Ticket keys follow `board.ticket_key_pattern` of `.agents/project.yaml` (the generic key shape
when the `board:` block is not configured).

## Top level

| Key | Required | Meaning |
|---|---|---|
| `schema` | yes | `"evidence-pack/2.0"` |
| `kind` | yes | `"story"` or `"bug"`. Both land on the board of cases; a bug page adds the reproduction and expected/actual boxes and sorts its reproduction first |
| `ticket` | yes | header fields, below |
| `env` | yes | ordered map shown as the build strip, e.g. `{"Environment": "staging", "Web build": "2026.10.24-3 (a1b2c3d)", "API build": "...", "Database": "..."}` |
| `summary` | yes | one paragraph under the coverage bar, business voice |
| `repro` | bug pages | `{steps: [..], frequency, expected, actual}` |
| `images` | when any image | `{key: {file: "<repo-relative path>", redact?: [[x, y, w, h], ...]}}`; `file` may be absolute inside the repo; `redact` boxes are burned into the pixels (`privacy.md`) |
| `tcs` | yes | the cases; a bug page puts its reproduction (and later its retests) here |
| `bugs` | no | bugs filed from this ticket, shown as red cards |
| `artifact` | after the first publish | `{url, path, published: ["<ISO time>", ...]}`: the claude.ai URL every later publish reuses (`workflow.md` §3). The build ignores it; `bun run evidence record` writes it |
| `currentRound` | no | the round the verdict is judged on (retests, below). Default: the highest `round` present, else 0 |
| `rounds` | retests | `[{round, date, build}]`: when each round ran and on which build; feeds the BEFORE FIX / AFTER FIX compare labels and the history notes |

Unknown fields are refused, so a typo never drops evidence silently. The fields the builder itself
writes (`hist`, `histRound`, a compare side's `short`, an image's `src`, `w`, `h`, `bytes`) are
accepted, so a pack recovered with `extract` builds again unchanged.

## `ticket`

`id` (`PROJ-7410`), `title`, `module`, `verdict` (`PASSED` / `FAILED` / `PENDING`, the big stamp),
optional `verdictNote` (one line under the stamp), `severity`, `priority` (chips on a bug page),
`bugs: ["PROJ-7410 Low"]` (chips on a story page), `parent`, `parentTitle`, `case`, `assignee`, `qa`,
`date`, `atp`, `atr`.

## Cases: `tcs[]` and `bugs[]`

| Key | Meaning |
|---|---|
| `id` | `PROJ-7421`, or a local id such as `PROJ-7411-repro`, `PROJ-7410-retest-1`; also the deep link `#PROJ-7420.PROJ-7421`. Ids are unique in the pack; a `bugs[]` id is a ticket key |
| `title`, `note` | card title, required on every case (the build refuses a case without one); the note is the first thing in the viewer's side panel (the TC's result line) |
| `status` | `tcs[]`: `PASSED` `FAILED` `DEFERRED` `BLOCKED` `NOT RUN`. `bugs[]`: `DEFECT` `OPEN` `FIXED` `RETEST PASSED` `RETEST FAILED`. Use `RETEST PASSED` (green) once QA has re-run the fix and it works, `RETEST FAILED` (red) when the fix did not hold; the header pill then reads the same instead of a plain red bug pill. One list for both: `cli/lib/evidence-page/statuses.json` |
| `kind` | `"repro"`: the bug's reproduction, first on a bug page. `"retest"`: one retest round (`round`, `date`), right after it. Absent: a TC. `tcs[]` only |
| `round` | the round the case belongs to (whole number, 0 = the original finding). A retest case carries its round; a `repro` case without one is round 0; any other case without one is current |
| `date` | retest cases: shown on the card as `Retest 1 · 2026-10-25` |
| `severity`, `priority`, `from` | bugs only: shown on the red card (`from` = the TC that found it) |
| `url` | the bug's own evidence artifact (claude.ai URL) on a story's bug card, or `#PACK.CASE` inside a multi-pack page. Any other link is refused |
| `evidence` | the items of the viewer's filmstrip |
| `compare` | optional pair, offered as one more filmstrip item |

Filmstrip order. The page orders a case's items for the reader: items that show the defect
first, then screenshots (the compare right after them), API, SQL, timeline, note. Within a group the
pack order is kept, so write items in the order they happened. A case holding earlier-round items is
ordered differently (next section).

Compare. `compare = {left: {image, label?, detail?, annotations?, coords?}, right: {...}, caption?}`;
`image` is an `images` key. Labels default to `EXPECTED` (left, green) and `ACTUAL` (right, red);
`detail` adds the per-case line, so `{"detail": "TC1 run, same cart and card"}` renders
`EXPECTED · TC1 run, same cart and card`. On a retest case leave `label` out: the left side defaults
to `BEFORE FIX (round 0, build <build>, <date>)` in amber (`left.round` picks another round) and the
right to `AFTER FIX (retest R, build <build>, <date>)`, green when the retest PASSED and red when it
FAILED, both read from `rounds[]`. A bug found fresh keeps EXPECTED/ACTUAL. An explicit `label` always
wins. `caption` overrides the filmstrip caption.

## What the verdict must agree with (checked on the current round)

| The build refuses | Why |
|---|---|
| A current PASSED or FAILED case with no evidence item of its round, no compare and no http(s) `url` (the page then offers "Open where its evidence lives") | PASSED and FAILED only on observation (`agentic-qa-core/references/discovery-driven-doctrine.md` §5) |
| A current BLOCKED or DEFERRED case with no reason (its `note`, or a `note` item) | a NOT RUN reason is a recorded decision |
| A DEFERRED reason that names no follow-up ticket key | the deferral is recorded where someone will pick it up |
| A `ticket.verdict` the current cases contradict (any FAILED: FAILED; any BLOCKED or NOT RUN, or only deferrals: PENDING) | a verdict is derived, never asserted; earlier rounds never count |
| A bug pack judged on a retest round (`currentRound > 0`) that reads PASSED with a current DEFERRED case | a retest never passes on a deferral |
| A story's bug card `RETEST PASSED` / `RETEST FAILED` that disagrees with that bug's own pack, or whose pack cannot be found (built together, beside the story pack, in the bug's PBI folder, or `--bug-pack`) | the pill is what readers see; one truth per bug |
| A mark or a redaction outside its image | it would point at nothing |

A DEFERRED case under a PASSED story verdict only warns: list it in the report.

## Retest rounds: history never reads as a current defect

A retest keeps the earlier evidence and judges the verdict on the current round only. Every case and
evidence item MAY carry `round` (0 = the original finding, 1 = retest 1, ...). An item without one
takes its case's round; a case without one is current (a `repro` case is round 0). Anything below
`currentRound` is history, and the page:

- badges it amber **BEFORE FIX · round N**, never red DEFECT or green PASS (those are for the current
  round only), whatever its `result` or mark tones say;
- orders a case as: current-round items (filmstrip order), then the compare, then the history items in
  a collapsible **Before the fix (round N)** group of the filmstrip, collapsed by default with a count;
- leaves history out of the verdict, the coverage bar, the pills and the status filters. A whole
  earlier-round case (a superseded reproduction) becomes a muted **History** card, shown only when
  the board's **History** toggle is on (off by default).

A pack with no `round` anywhere renders with everything current.

```json
{
  "kind": "bug", "currentRound": 1,
  "rounds": [{"round": 0, "date": "2026-11-03", "build": "v2.4.0-20261103.1 / web a1b2c3d4"},
             {"round": 1, "date": "2026-11-05", "build": "v2.4.0-20261105.1 / web b2c3d4e5"}],
  "tcs": [
    {"id": "PROJ-7430-retest-1", "kind": "retest", "round": 1, "date": "2026-11-05", "status": "PASSED",
     "title": "The list keeps its rows after a late answer",
     "evidence": [
       {"type": "image", "ref": "after", "label": "After the late answer", "result": "pass"},
       {"type": "image", "ref": "bug", "label": "Actual: 81 rows", "round": 0, "result": "defect"}],
     "compare": {"left": {"image": "bug"}, "right": {"image": "after"}, "caption": "Same steps, before and after the fix"}},
    {"id": "PROJ-7430-repro", "kind": "repro", "round": 0, "status": "FAILED", "title": "A late answer duplicates rows", "evidence": []}
  ]
}
```

Here the board reads PASSED 1/1, the `repro` case is a History card, and the retest opens on the
passing screenshot; the round-0 shot sits in the collapsed group as BEFORE FIX · round 0.

## Evidence items

Every item takes `label` (short filmstrip name), optional `caption`, `result` (`defect` = red badge,
`pass` = green, `info` = neutral; when absent: an image with a defect-tone mark is `defect`,
otherwise `pass` on a PASSED case and `info` elsewhere; an earlier-round item is always the amber
BEFORE FIX badge), optional `round` (retests, above), optional `flags` (provenance chips such as
`"Token redacted"`, `"Response trimmed"`, `"Columns verified live"`, `"Query written for display"`),
and optional `note`.

| `type` | Fields |
|---|---|
| `image` | `ref` (images key), `annotations[]`, `coords`: `"px"` (screenshot pixels, what `eval` returns) or `"fraction"` (default) |
| `api` | `method`, `url`, `status`, `ms` (free text: timing or which token), `request`, `response`, `curl` |
| `sql` | `db`, `when`, `query`, `columns[]`, `rows[][]` (`null` renders NULL), `hl[]` (red row indexes), `okRows[]` (green) |
| `timeline` | `title`, `events: [{t (ms), label, rows?, state: ok/req/wait/bad}]`, `source` |
| `note` | `title`, `body`: a DEFERRED or BLOCKED reason with no artifact to show |

## Annotations

Common: `n` (badge number), `shape`, `tone` (`defect` / `ok` / `note`), `title`, `explain`, `layer`
(free label, e.g. `defect`, `validation`, `question`). Geometry, in pixels with `coords: "px"` or
fractions of the image:

| `shape` | Geometry |
|---|---|
| `rect` | `x, y, w, h` (top-left and size) |
| `ellipse` | `cx, cy, rx, ry` |
| `arrow` | `x1, y1, x2, y2` (head at x2,y2) |
| `path` | `pts: [[x, y], ...]` (smoothed stroke) |
| `bubble` | `x, y` (tip), `text` |

`tone: "ok"` is the green "validated" callout; `tone: "defect"` the red bug callout.

## Minimal example (a one-case bug page)

```json
{
  "schema": "evidence-pack/2.0",
  "kind": "bug",
  "ticket": {"id": "PROJ-7410", "title": "The cart badge keeps its old count after a declined payment",
             "module": "checkout", "verdict": "FAILED", "severity": "Minor", "priority": "Medium", "parent": "PROJ-7420", "date": "2026-11-05"},
  "env": {"Environment": "staging", "Web build": "a1b2c3d4 (run 421)"},
  "summary": "After a declined card the cart is empty, but its badge still shows three items.",
  "repro": {"steps": ["Add three items to the cart", "Pay with the always-declined test card", "Open the cart"], "frequency": "3 of 3",
            "expected": "The badge shows the cart's real count.", "actual": "The badge shows 3 while the cart is empty."},
  "images": {"cart": {"file": ".context/PBI/epics/EPIC-PROJ-7400-checkout/stories/STORY-PROJ-7420-keep-the-cart/evidence/PROJ-7420-ac2-declined.png"}},
  "tcs": [{"id": "PROJ-7410-repro", "kind": "repro", "title": "A declined payment leaves a stale cart badge", "status": "FAILED",
           "evidence": [
             {"type": "image", "ref": "cart", "label": "Cart after the decline", "result": "defect", "coords": "px",
              "annotations": [{"n": 1, "shape": "ellipse", "cx": 896, "cy": 32, "rx": 48, "ry": 24, "tone": "defect",
                               "title": "Badge", "explain": "Shows 3 items; the cart holds none."}]},
             {"type": "api", "label": "Cart read", "result": "defect", "method": "GET", "url": "https://staging.example.test/api/cart",
              "status": 200, "response": "{\"items\": []}", "flags": ["Response trimmed"]}]}],
  "bugs": []
}
```

A complete synthetic story pack and bug pack (every item type, a compare, a retest round): run
`bun run evidence demo` and read the packs it writes.
