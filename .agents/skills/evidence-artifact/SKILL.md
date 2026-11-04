---
name: evidence-artifact
description: "Turns a ticket's test evidence into ONE private claude.ai page (an Artifact) that a developer or PM can open and read: a verdict header, the build under test, a board of test cases and bugs, and a full-window viewer per case with annotated screenshots (marks drawn from the element's real box), expected/actual compare, API requests, SQL results and timelines. One page per story ticket under test plus one per bug filed; the ATR, the bug description, the QA comment, the TC notes, chat and the Sprint Board carry the link, and each bug keeps one annotated thumbnail for the tracker. Use in sprint-testing Stage 2 (write the evidence pack as you test) and Stage 3 (build, publish, link), when filing a bug, on a retest (same URL, new round), and in exploratory testing whenever evidence reaches a human. Triggers on: evidence page, evidence artifact, evidence pack, publish the evidence, build the evidence page, retest evidence, combine screenshots, evidence mosaic, build a flow map of the test, green validated callout, bug thumbnail, evidencia, página de evidencia, publica la evidencia, junta las capturas, mosaico de evidencia, marca en verde lo validado, miniatura del bug. Do NOT use for filing the bug issue itself (sprint-testing owns its fields and text), for a one-off annotated PNG a tracker needs inline (bug-screenshot-annotation), for internal smoke or debug shots that never reach a human, or for sending evidence to any external image service (never: references/privacy.md)."
license: MIT
compatibility: [claude-code, codex, opencode, pi]
metadata:
  kind: workflow
---

# Evidence Artifact

A testing session records what it proved in a JSON **evidence pack** while it tests, renders it with
one command into a self-contained HTML page, and publishes that page with the **Artifact** tool. The
link then goes to every place a reader looks. The page design is fixed (ADR-0022): it is never
changed per ticket.

A workflow skill (`metadata.kind: workflow`) with no dispatch of its own: it is loaded INSIDE the
session or subagent already running a testing stage (typically `/sprint-testing` Stages 2 and 3),
spawns no agents, and is not a stage owner.

| Rule | What it means here |
|---|---|
| One page per ticket | One artifact per story ticket under test, plus one per bug filed; the story's bug card links the bug's page |
| Inline images | Screenshots inline as JPEG data URIs at native size; the build stops over 14 MB (artifact limit 16 MB) |
| Who publishes | The worker publishes; the conductor checks the link at wave close and publishes when the worker could not |
| Where the link goes | The ATR, the bug description, the QA comment, each TC's notes, chat and the Sprint Board |
| One thumbnail | A bug keeps ONE annotated thumbnail where its tracker embeds images; everything else is a link |
| Private | Published private; the owner shares it from the page's Share menu; personal data burned out, never covered |
| Static | A static page: no `capabilities` |
| Retest | Same URL, a new retest round with before/after, history kept: earlier rounds render as amber BEFORE FIX history and never count in the verdict |
| Retention | Delete 6 months after the ticket is Done, list-and-review, owner confirms each delete |
| Marks | Marks come from the element's bounding box at capture time; placing them by reading the screenshot is the fallback |
| Reading order | Bug pages open on their board like stories; defect items first in a case (a retest: current round, compare, then the collapsed history); compare labels `EXPECTED` / `ACTUAL` plus a per-case line (`BEFORE FIX` / `AFTER FIX` on a retest); full-window viewer, Esc back to the board |

## Compact Rules

- DO: load this skill in any dispatch whose stage captures evidence (sprint-testing Stage 2) or reports it (Stage 3, filing a bug), and append every proof to `<PBI>/evidence/evidence-pack.json` AS you test, never reconstructed at the end.
- DO: take marks from the element's box via `playwright-cli eval` (`coords: "px"`); do NOT read a screenshot back to place a mark unless no element reaches it.
- DO NOT: mask with a mark. Personal data on screen goes in the image's `redact` boxes, which the build burns into the pixels.
- DO NOT: put a trace, a HAR, a token, a cookie or an `.auth` file in a pack. Credentials in API/SQL text are written as `<redacted>`; the build refuses the rest and names the field.
- DO: give a bug its own pack (`evidence-pack-<BUG>.json`, `kind: "bug"`, a `repro` case) once the bug issue exists, and build and publish bug pages BEFORE the story page: a story's `RETEST PASSED` / `RETEST FAILED` bug card is refused unless the bug's own pack confirms it.
- DO: build with `bun run evidence build --pack <pack>`; it needs Python 3.9+ and Pillow and names the one thing to install when either is missing.
- DO: publish with the Artifact tool; when the pack already has `artifact.url`, run `Artifact action: "read"` on it first and publish with that `url`. Omitting `url` mints a second page and orphans every link.
- DO: record the URL with `bun run evidence record --pack <pack> --url <url>` and on the board (`bun run board evidence-artifact <KEY> <url> [--bug <BUG>] --by worker`), add it to the issue with `bun run evidence link --pack <pack>`, then link it from the ATR, the bug description, the QA comment footer and each TC's notes.
- DO: embed a bug's ONE thumbnail with `bun run evidence attach --pack <bug pack>` (`--dry-run` first prints every call), after the bug page link is in its Description; write "(image embedded below)" and pass `bun run board bug ... --evidence-embedded` only once a live run printed `read-back OK` (a dry run never does).
- DO NOT: run `bun run evidence attach --replace` without a person's OK: it deletes the bug's earlier thumbnail attachment, which cannot be undone. `attach` refuses on its own when an earlier thumbnail (same name, other bytes) is there.
- DO: on a retest, keep every earlier case and item with its `round`, set `currentRound` and `rounds[]`, append the retest case, and republish to the SAME URL. A retest never passes on a DEFERRED case.
- DO: report the URLs as published private for the owner to share; when the Artifact tool is unavailable, report the pack path instead (the conductor publishes).
- DO NOT: send evidence to any external image service, whatever the chat authorises.

## The flow

```
Stage 2  screenshot --filename -> pack: image item + marks from `eval` bbox (px)
         API / SQL items, redacted at write time; personal data -> `redact` boxes
         bug filed -> its own pack (kind "bug", a repro case)
Stage 3  bun run evidence build --pack -> index.html  ->  Artifact publish (same path = same URL)
         URL -> bun run evidence record  ->  bun run board evidence-artifact <KEY> <url> --by worker
         bun run evidence link (issue remote link)  ·  bug: build --thumb -> bun run evidence attach
         link -> ATR, bug description (+ one thumbnail), QA comment, TC notes, chat
         owner hand-off: "published private, share it from the page's Share menu"
Retest   same pack: old evidence `round: 0`, `currentRound`, `rounds[]` + a retest case
         -> same page path -> publish with the recorded url -> same link
```

Step by step, with the exact commands and publish parameters: **`references/workflow.md`**.

## Commands

```bash
bun run evidence build --pack <PBI>/evidence/evidence-pack.json            # the page (prints the publish step)
bun run evidence build --pack <PBI>/evidence/evidence-pack-<BUG>.json \
  --thumb <PBI>/evidence/evidence-artifact/<BUG>/<BUG>-thumbnail.png       # the bug's tracker image
bun run evidence extract --page <saved page.html> --out <pack.json>         # recover a pack from a published page
bun run evidence record --pack <pack.json> --url <url>                      # store the published URL
bun run evidence link --pack <pack.json> [--test <TC> --exec <ATR>]          # page -> issue remote link (+ jira-xray run comment)
bun run evidence attach --pack <bug pack.json> [--test <TC> --exec <ATR>]    # thumbnail -> end of the bug's Description, read back
bun run evidence demo                                                       # synthetic story, bug and review pages
```

The builder is `scripts/build.py` (Python 3.9+ and Pillow: `python3 -m pip install pillow`; a Homebrew
Python: `brew install pillow` or a venv; Windows: `py -m pip install pillow`); the
`bun run evidence` commands pass it the project's ticket key pattern and check both are installed.
It runs locally and makes no network call. `attach` and `link` are the only commands that reach the
tracker (the modality from `board.source`, else `testing.tms_cli`; `--source` overrides): every write
is read back before they say done, `--dry-run` prints the calls and sends nothing, and with no
tracker (`none`) they write nothing and say where the thumbnail and the link live. It validates the pack and names the field when something
is wrong, refuses credentials in any text, warns on email addresses, burns `redact` boxes into the
pixels, and inlines every screenshot at native size (JPEG q88). `--host local` writes a standalone
document to open from disk, for a harness with no Artifact tool. Relative image paths resolve against
the PRIMARY checkout, also when the build runs in a worktree (`--repo <root>` to point elsewhere), and a
story's `RETEST` bug pill is checked against the bug's own pack (`--bug-pack <BUG>=<pack.json>` when it
is neither beside the story pack nor in the bug's PBI folder). Its regression tests:
`python3 -m unittest discover -s .agents/skills/evidence-artifact/scripts` (also run by `bun test`).

## References

| File | Read it when |
|---|---|
| `references/workflow.md` | Every time: Stage 2 capture, Stage 3 publish and links, the conductor check, retests |
| `references/pack-schema.md` | Writing or reading a pack (fields, statuses, shapes, compare, retest cases, what the verdict must agree with, an example) |
| `references/privacy.md` | Anything personal on screen, any API/SQL text, sharing, retention, why nothing goes to an external service |
| `templates/evidence-artifact.html`, `templates/shared.css`, `templates/shared.js` | Only when the owner asks for a design change (the page is the approved standard; the Auto / Light / Dark switch is an owner requirement) |

## Gotchas

- **A PASSED retest showing a red DEFECT means an item lacks `round`.** Earlier-round evidence moved
  into the retest case keeps `"round": 0`, or the page treats it as current and sorts it first
  (`pack-schema.md` §Retest rounds).
- **Publishing without `url` from a new session mints a second artifact.** Once the pack has
  `artifact.url`, every later publish from any session reads that URL first and passes it.
- **A mark is not a mask.** Viewers can toggle marks off. Personal data goes in `redact`.
- **Never a trace, HAR, token or cookie in a pack.** The build refuses tokens; it cannot see a trace
  you did not reference, so never reference one.
- **Do not read screenshots back during Stage 2 to place marks**: the `eval` box costs one line and
  is exact; reading a full-page PNG costs context on every later turn.
- **The thumbnail is embedded only when a live `attach` printed `read-back OK`.** A `--dry-run` prints
  `DRY RUN: read-back not performed` instead. "(image embedded below)" and
  `--evidence-embedded` come after it, never before; a `bug` board call that printed the evidence
  reminder without that flag is a bug still missing its image.
- **A test secret made only of `x` reads as a mask** (`xxxx`): the scanner treats it as already masked.

## Briefing snippet for sub-agents

Any dispatch whose stage captures evidence (sprint-testing Stage 2) or reports it (Stage 3, filing a
bug) MUST carry this verbatim in component 7, Rules:

> **Evidence artifact rule.** Load the `evidence-artifact` skill. Stage 2: append every proof to `<PBI>/evidence/evidence-pack.json` as you test: screenshots with `--filename`, marks from the element's box via `playwright-cli eval` (`coords: "px"`), personal data as `redact` boxes (a mark over it is not a mask), API/SQL items with credentials written as `<redacted>`; a bug gets its own pack (`evidence-pack-<BUG>.json`) once its issue exists. Stage 3 (`references/workflow.md` §3): build with `bun run evidence build`, publish with the Artifact tool (bug pages first; any later publish from another session passes the pack's `artifact.url` after an `action: "read"`), record the URL in the pack (`bun run evidence record`) and on the board (`bun run board evidence-artifact <KEY> <url> [--bug <BUG>] --by worker`), add it to the issue (`bun run evidence link --pack <pack>`), link it from the ATR, the bug description, the QA comment footer and each TC's notes; a new bug's ONE thumbnail goes in with `bun run evidence attach --pack <bug pack>` and counts as embedded only after a live run prints `read-back OK`; never `--replace` (it deletes the earlier thumbnail attachment) without a person's OK. Never a trace, HAR, token or cookie in a pack. Report the URLs and say they were published private for the owner to share; if the Artifact tool is unavailable, report the pack path instead.

## Relation to `bug-screenshot-annotation`

That skill flattens callouts into a PNG through a browser capture. This page keeps marks as data and
is the direction: when a ticket has a page, link the page and use the `--thumb` image where a tracker
needs one inline. Retiring the annotation skill is a separate decision.

## History

Replaces the evidence page this repo shipped first (`evidence-pack/1.0`, its own design, ADR-0021): the
page, the pack format and the builder are now the reference implementation's, copied (ADR-0022).
`agentic-qa-core/references/evidence-page.md` points here. Session close for the stage that loaded
this skill follows `agentic-qa-core/references/session-footer-contract.md`; a defect in this skill
itself is reported per `agentic-qa-core/references/upstream-feedback.md`, and lessons are proposed per
`agentic-qa-core/references/skill-refinement-protocol.md`.
