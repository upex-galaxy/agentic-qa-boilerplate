# Workflow: capture in Stage 2, publish and link in Stage 3

The steps a testing session runs, in order. The pack format is in `pack-schema.md` and what may appear
on a page is in `privacy.md`. Shared bucket and naming rules are in
`agentic-qa-core/references/evidence-conventions.md`.

## 1. Where things live (one artifact per story under test, plus one per bug filed)

`<PBI>` = the ticket's folder under the PRIMARY checkout's `.context/PBI/`
(`.../epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/`, or the coverable-type equivalent). Its
`evidence/` folder is gitignored.

| What | Path |
|---|---|
| Screenshots | `<PBI>/evidence/<KEY>-<tc-or-step>-<label>.png` (`evidence-conventions.md` §2) |
| The ticket's pack | `<PBI>/evidence/evidence-pack.json` |
| The ticket's page | `<PBI>/evidence/evidence-artifact/index.html` |
| A bug's pack (bug filed from this ticket) | `<PBI>/evidence/evidence-pack-<BUG>.json` |
| That bug's page and tracker thumbnail | `<PBI>/evidence/evidence-artifact/<BUG>/index.html`, `.../<BUG>/<BUG>-thumbnail.png` |

The page path never changes for a ticket, so the same path in the same session republishes to the same
URL. A bug page carries the bug's own TCs the way a story page carries its TCs, and has its own board.
These paths are the defaults of `bun run evidence build` when `--out` is not given.

## 2. Stage 2: write the pack while you test

Start the pack when Stage 2 starts (copy the shape from `pack-schema.md`: `ticket`, `env` with the
builds under test, `summary` left short) and append as each case runs. A pack rebuilt at the end from
memory loses what the screen showed.

1. Screenshot with an explicit `--filename` into `evidence/`, with `--full-page`. An app that
   scrolls inside a container returns only the viewport even with `--full-page`: resize the viewport
   to the content height first (`playwright-cli -s={SESSION} resize 1440 2600`) and check the capture
   holds the whole page. Add the file under `images` and an `image` item to the case. Do not read the
   screenshot back to place marks.
2. Take marks from the element's box. When the element that proves the point is known (it has a
   snapshot ref), read its box in the screenshot's own pixels at capture time:

   ```bash
   # full-page screenshot: page coordinates = image pixels at device scale 1
   playwright-cli -s={SESSION} eval "el => { const r = el.getBoundingClientRect(); return [Math.round(r.x + scrollX), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)] }" e7
   # viewport screenshot: drop the scrollX / scrollY terms
   ```

   Write it as `{"shape": "rect", "x":, "y":, "w":, "h":}` with `"coords": "px"` on the item, plus
   `n`, `tone` (`defect` / `ok` / `note`), `title`, `explain`. A circle is the same box as an
   `ellipse` (`cx = x + w/2`, `rx = w/2 + 6`). With a device scale factor above 1, multiply by it.
   When the element has no ref (a chart region, a gap between two elements), place the mark by
   reading the screenshot instead: that is the fallback, expect one adjustment pass.
3. Mask at capture. A customer email, phone number or person's name on screen goes in the image's
   `redact` list (`privacy.md`); a mark over it would leave the pixels readable.
4. Write API and SQL items already redacted. One `api` item per proving request (method, URL,
   status, request, the response trimmed to what proves the point, a curl line using an env variable
   such as `$API_TOKEN`), `Authorization: Bearer <redacted>`. One `sql` item per proving query (the
   query, the columns, the rows, `hl` / `okRows`). Add the provenance `flags` honestly
   (`"Response trimmed"`, `"Query written for display"`).
5. Each TC's result goes into its case: `status` and a one-line `note` in business voice, the
   same line you write to the TMS.
6. A bug found here gets its own pack (`evidence-pack-<BUG>.json`, `kind: "bug"`, a `repro`
   case holding the defect items, `repro` steps, expected/actual) as soon as the bug issue exists, and
   a card in the story pack's `bugs[]` (its `url` filled in once the bug page is published).

Write the pack with a small script or careful edits, and keep it valid JSON. The build names the first
wrong field; `build.py --check` validates without building.

## 3. Stage 3: build, publish, record, link

Order, so every link exists before the text that carries it is written:

1. Bug pages first. For each bug filed: build the bug pack, publish (step 3 below), then fill
   the bug's description with the link under `## Evidence`, then the thumbnail (§4). Put the bug
   page URL into the story pack's bug card `url`.
2. Build the ticket's page:

   ```bash
   bun run evidence build --pack <PBI>/evidence/evidence-pack.json
   ```

   It prints the size; over the guard (14 MB by default, `--max-mb` up to the 16 MB artifact limit)
   it stops and names the largest images. Drop screenshots that prove nothing new or crop very tall
   ones. It also prints the exact publish step below.

   A bug card that reads `RETEST PASSED` or `RETEST FAILED` is checked against that bug's own pack:
   `evidence-pack-<BUG>.json` beside the story pack, else `<bug PBI>/evidence/evidence-pack.json` (a
   pack recovered with `extract`), else the one passed with `--bug-pack <BUG>=<pack.json>`. A pill
   none of them confirms is refused, so build the bug pages first.

   From a worktree (a fleet worker), relative image paths still resolve against the PRIMARY
   checkout, where `<PBI>` lives; `--repo <root>` points them elsewhere.
3. Publish with the Artifact tool (static page, no `capabilities`):
   - First publish: `file_path` = the absolute page path, `icon: "checklist"` for a story page or
     `"bug"` for a bug page, `description` = one sentence (`PROJ-7420 staging evidence: 5 of 5 TCs
     passed, 1 bug filed`; the build prints it). The page's `<title>` is `<KEY> Evidence`.
   - Same session, later change: same `file_path`, no `icon`; the URL stays.
   - Any other session (a retest, the conductor fixing a worker's page): the pack's
     `artifact.url` exists, so `Artifact action: "read"` on that URL first, then publish with that
     `url` plus the `file_path`. Publishing without `url` mints a second URL and orphans every link
     already in the tracker and in chat.
   - If the Artifact tool is not available in this session, say so (mailbox in worker mode): the
     conductor publishes from your pack. A harness with no hosted equivalent builds with
     `--host local` and links the page path.
4. Record the URL in the pack: `bun run evidence record --pack <pack> --url <url>` writes
   `"artifact": {"url": "...", "path": "<page path>", "published": ["<ISO time>"]}` and appends a time
   on each republish. It accepts only a host in `board.evidence.allowed_hosts` and refuses a second
   URL for the same pack. Then link it from the issue in the tracker:
   `bun run evidence link --pack <pack>` adds the page as a remote link (one link per page, keyed by
   its URL, so a retest republish updates it instead of adding a second) and reads it back. With no
   tracker (`board.source: none`) it writes nothing and says where the link lives.
5. Sprint Board (worker mode, or whenever a board runs):
   `bun run board evidence-artifact <KEY> <url> --by worker`, and for a bug page
   `bun run board evidence-artifact <KEY> <url> --bug <BUG> --by worker` (the `bug` line first).
6. The link goes everywhere, each in its own voice:
   - ATR, the evidence section: the link first, then the captions
     (`sprint-testing/references/reporting-templates.md`).
   - Bug description, `## Evidence`: the bug page link (and the thumbnail, §4).
   - QA comment: the footer link `Evidence → [evidence page](<url>)`. The comment carries the
     outcome and the page carries the proof.
   - Each TC's notes in the TMS: append a line `Evidence: <url>#<KEY>.<TC>` under the result
     text, never replacing it. The deep link opens the viewer on that case. On `jira-xray` the run
     comment holds those notes: `bun run evidence link --pack <pack> --test <TC> --exec <ATR>`
     (add `--case <id>` when the pack's case id is not the test key) appends the line once and reads
     it back. On `jira-native` the TC's result text lives on the Test issue: append the line there.
   - Chat: the board's "Copy for Slack" adds the link; a hand-written message carries it too.
7. Hand-off to the owner (chat, or the mailbox in worker mode): the URL(s), plus the line:
   "Published private: share it from the page's Share menu so the team can open the links."

Conductor check. At wave close the conductor checks that each tested ticket and each bug has an
`evidence-artifact` link on the board. When one is missing, it builds from the worker's pack, publishes
itself, and records the link with `--by conductor`.

## 4. The bug's tracker thumbnail

```bash
bun run evidence build --pack <PBI>/evidence/evidence-pack-<BUG>.json \
  --thumb <PBI>/evidence/evidence-artifact/<BUG>/<BUG>-thumbnail.png
bun run evidence attach --pack <PBI>/evidence/evidence-pack-<BUG>.json --dry-run   # read the calls
bun run evidence attach --pack <PBI>/evidence/evidence-pack-<BUG>.json
```

`build --thumb` takes the reproduction's first defect screenshot (or `--case <id>`), burns the marks
and the `redact` boxes in, and writes a PNG at native size. It is the one image a tracker embeds
inline; everything else is the link. An API/DB-only bug has no thumbnail: link only.

`attach` embeds it in the bug, after the Description already carries the page link (step 1 of §3):

1. It reads the bug: attachments, Description and comments. The same file already attached and
   already in the Description, or in the `Evidence` comment an earlier fallback wrote: nothing to do.
   An EARLIER thumbnail of the bug (same name, other bytes, for instance before a missed `redact` box
   was fixed) may be unredacted, so it is never appended beside the new one: `attach` stops and says
   so. Ask a person; on their OK, rerun with `--replace`, which takes that image out of the
   Description (or deletes its `Evidence` comment), DELETES the attachment this tool embedded, reads
   the bug back, then attaches the new one (on `jira-xray` it also swaps the run's evidence file).
   Deleting a tracker attachment cannot be undone, so `--replace` waits for that OK (a supervised
   worker asks its conductor; a routine with nobody leaves the earlier thumbnail and reports that
   `attach` stopped). An attachment of that name `attach` did not embed is left for the person.
2. It attaches the PNG to the bug (unless that copy is already there), resolves the attachment's
   media id, and appends ONE image node at the END of the Description. The text above it is never
   rewritten.
3. A Description the edit screen does not expose (Jira answers 400) falls back to a comment headed
   `Evidence` holding the image; the output says so.
4. It reads the bug back: the attachment with the file's size, and the image in the Description (or
   that comment). A mismatch exits 1 and names what is missing.
5. On `jira-xray`, `--test <TC> --exec <ATR>` (or `--run <id>`) also adds the PNG to that Test Run's
   evidence and reads the run back. The run is resolved before any write, so a wrong TC writes nothing.

`--dry-run` prints every call and sends nothing; its result lines say `DRY RUN: read-back not
performed`, never `read-back OK`, and nothing counts as embedded.

Write "(image embedded below)" in a report only after a live `read-back OK` (after a fallback, name the
`Evidence` comment instead), then `bun run board bug <KEY> <BUG> --title "<title>" --severity <...>
--evidence-embedded --by worker` (the command prints that line, filled from the bug pack). With
no tracker (`board.source: none`) `attach` writes nothing: the thumbnail stays on disk and the report
links it.

## 5. Retest: same URL, a new round, history kept

1. Find the pack: `<parent PBI>/evidence/evidence-pack-<BUG>.json` (the bug description names the
   parent). If it is gone (another machine, a cleaned cache), read the page and recover the pack:
   `Artifact action: "read"` on the URL from the bug description saves the HTML; then
   `bun run evidence extract --page <saved.html> --out <bug PBI>/evidence/evidence-pack.json` (images
   come back embedded, their redactions already burned). From here on the bug is the ticket under
   test, so its pack is that file.
2. Mark the earlier round as history (`pack-schema.md` §Retest rounds). Keep every round-0
   case and item and give it `"round": 0` (the `repro` case is round 0 even without it). Set
   `"currentRound": 1` and add `"rounds": [{"round": 0, "date": "<found>", "build": "<build then>"},
   {"round": 1, "date": "<retest date>", "build": "<build now>"}]`. Never delete or rewrite the earlier
   cases: they are the history. An earlier item you copy into the retest case for context keeps its
   `"round": 0`; without it the page shows it as a current red DEFECT on a PASSED retest.
3. Append one case: `{"id": "<BUG>-retest-1", "kind": "retest", "round": 1, "date": "...",
   "status": "PASSED|FAILED", "evidence": [...], "compare": {"left": {"image": "<original actual>"},
   "right": {"image": "<new shot>"}, "caption": "..."}}`. Leave the compare labels out: they default
   to BEFORE FIX (round 0, build, date) and AFTER FIX (retest 1, build, date) from `rounds[]`.
4. Update `ticket.verdict` and `ticket.verdictNote` (`Fixed: verified in retest 1 on <date>`), the
   bug's own TCs' statuses, and `env` (the builds now under test). The header, coverage and board
   counts use the current round only, so a superseded FAILED reproduction no longer reads as failing.
   A retest never passes with a DEFERRED case in its round.
5. Build to the same page path, then publish with the pack's `artifact.url` (after the `read`),
   so the link in the bug description, the old QA comment and chat shows the retest. Record it on
   the board again. Before publishing, open the retest case: it must start on current evidence, with
   the earlier round collapsed under "Before the fix".

## 6. Other workflows

- An exploratory session: a confirmed bug filed from it gets its bug pack and page the same way; the
  session's validated scenarios may go in one `kind: "story"` pack named after the session when they
  are handed to `test-documentation`.
