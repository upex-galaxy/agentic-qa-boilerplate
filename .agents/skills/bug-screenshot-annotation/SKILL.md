---
name: bug-screenshot-annotation
description: "Annotates a bug screenshot with circles, arrows, callouts and a corner badge, rendered locally. Use when a visual or positional bug (overlap, misalignment, wrong date or offset on an axis) needs a paragraph to explain in a raw screenshot; or when asked to annotate a bug screenshot or mark up evidence. Not for filing the bug (sprint-testing)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode, pi]
metadata:
  kind: workflow
---

# Bug Screenshot Annotation

Some defects are obvious to whoever found them and invisible in a raw screenshot: overlapping elements, a tick on the wrong date, a button a few pixels off. This skill marks the defect on an image you already have, the way a QA engineer would with Snagit or Markup, using HTML and CSS overlays captured by a local browser.

It is a workflow skill (`metadata.kind: workflow`) with no dispatch of its own. It loads inside the subagent already running a testing stage, spawns no agents and owns no stage. The usual caller is `/sprint-testing` Execution, when a bug found during exploration is visual or positional (`../sprint-testing/references/exploration-patterns.md`, section "Bugs found during exploration").

## Compact Rules

- Keep every QA screenshot off external image services, generative or not: real product and customer data is in the frame. A user's authorization in chat does not lift this. Everything renders locally, over a loopback HTTP server and a local browser capture.
- Annotate when a bug is visual or positional (overlap, misalignment, wrong date or offset on an axis, an element in the wrong place) and a raw screenshot would need a paragraph to explain it. Do not use this skill to file the bug, or on before/after shots that already read clearly raw.
- Work from a screenshot that already exists on disk. The skill overlays shapes; it never generates or edits an image from a text description.
- Produce exactly one evidence file: the final annotated PNG in the ticket's `evidence/` folder, named `{KEY}-BUG-{BUG-KEY}-annotated.png`. The crop and the annotation HTML are scratchpad working files, never written to `evidence/` and never cited from a ticket.
- Copy the commented overlay blocks from `references/shapes.html` instead of designing from scratch, and keep its z-index scale (base image, shapes, callout boxes, corner badge topmost) and its utf-8 meta tag. A copied block that drops either produces a hidden badge or mojibake.
- Serve the annotation HTML over loopback HTTP, never `file://` (the browser-automation CLI refuses it before rendering), and kill that server before the session ends.
- Size the capture viewport equal to or larger than the HTML canvas. A smaller viewport clips callouts.
- Read the rendered PNG back and expect at least one adjustment pass (move a circle, rewrap callout text, nudge the badge out of a collision). It is not one-shot.
- State the final PNG's repo-relative path in chat the moment it lands, unprompted, and repeat it leading the "Bug annotations" group in the session-close screenshot list.
- Offer the annotated PNG for the bug issue and let the human confirm before publishing. Once published it leads the bug's Evidence section, ahead of the raw capture.
- When the ticket has an evidence page (the `evidence-artifact` skill), the page keeps marks as data, one page per ticket and per bug. Link it, and keep this PNG only where a tracker needs an inline image.

**Read full SKILL.md when**: building the annotation HTML, choosing shape types, or handling a case the local render cannot cover (e.g. a photo of physical signage that would need anonymization).

---

## Why everything stays local

QA screenshots carry real product, customer and competitor data. A screenshot sent to an external image service has already landed in that service's public bucket, and the agent runtime's data-exfiltration classifier blocks such uploads even when the user authorizes them in chat. Here everything renders on a server bound to `127.0.0.1`, so nothing leaves the machine.

If a case appears that this cannot handle (a photo of physical signage, say), go back to the user and talk through anonymization first. Never quietly pipe a real screenshot to an external service.

## Scope

Input is a raw screenshot already on disk, typically in the ticket's PBI `evidence/` folder. Output is the one annotated PNG. The crop and the annotation HTML are Bucket C working files (`../agentic-qa-core/references/evidence-conventions.md` §1). Filing the bug belongs to `../sprint-testing/references/reporting-templates.md`.

## Process

1. Identify the region. From the raw screenshot (or its accessibility snapshot), work out the pixel crop box and roughly where each annotation shape lands relative to it.

2. Crop with Python and PIL, in the scratchpad.

   ```python
   from PIL import Image
   img = Image.open("<raw-screenshot-path>")
   img.crop((left, top, right, bottom)).save("<scratchpad>/crop.png")
   ```

   
3. Build the annotation HTML, in the scratchpad. The crop goes in as a background `<img>`; each annotation is one absolutely positioned `<div>` overlay. Copy and adjust the commented blocks in `references/shapes.html` (circle-callout, arrow-to-region, callout-box, badge-corner, axis-tick plus axis-tag, before-after) and keep its z-index scale.

4. Serve it over loopback. The browser-automation CLI errors out on `file://` URLs, so a local HTTP server is the only way:

   ```bash
   python3 -m http.server <port> --bind 127.0.0.1 --directory <scratchpad>
   ```

5. Capture with the browser-automation CLI. Load `/playwright-cli` first (CLI to skill auto-load rule) for exact verbs and flags. Open `http://127.0.0.1:<port>/annotation.html` in a named session of its own (`-s=<KEY>-annotate`; anonymous, case (a) of `../agentic-qa-core/references/browser-sessions.md`), resize the viewport to the HTML's real dimensions (equal or larger), then screenshot with an explicit destination path into the ticket's `evidence/` folder, named:

   ```
   {KEY}-BUG-{BUG-KEY}-annotated.png
   ```

   `{KEY}` is the ticket under test and `{BUG-KEY}` the filed bug, defect or improvement issue key; in the normal case they differ. Close the session once the PNG is on disk. This is the only file of the whole process that belongs in `evidence/`.

6. Inspect and iterate. Read the PNG back and fix what collides: move a circle, rewrap callout text, nudge the badge or arrow. Expect at least one pass.

7. Clean up. Kill the HTTP server (`kill <pid>` or `pkill -f "http.server <port>"`) before the session ends.

8. Report the path, immediately and unprompted. State the final PNG's repo-relative path in chat the same turn it lands (`../agentic-qa-core/references/session-footer-contract.md` Part 1), and lead the "Bug annotations" group with it in the session-close list.

9. Embed into the bug issue (optional, this repo's upgrade over manual attach). Jira accepts inline images through the bundled helper. Offer to publish the annotated PNG as an evidence comment on the bug, and publish only after the human confirms:

   ```bash
   bun .agents/skills/acli/scripts/jira-attach-media.ts <BUG-KEY> \
     ./evidence/<KEY>-BUG-<BUG-KEY>-annotated.png \
     --caption "Annotated evidence — <one-line defect summary>" --publish
   ```

   The image leads the bug's Evidence section, ahead of the raw capture. When the bug has an evidence page (the `evidence-artifact` skill), the image goes into the bug's pack as the reproduction's first defect image, so it leads the page and becomes the bug's one tracker thumbnail. The Stage 3 Evidence Handoff (`../sprint-testing/references/reporting-templates.md` §3.5) links that page, not image files.

## Where this waits for a person

Decisions follow `../agentic-qa-core/references/decision-protocol.md`. Two points here wait for a person.

| Point | Person present | Supervised worker | Routine with nobody |
|---|---|---|---|
| Step 9: confirm before publishing the PNG to Jira | Ask, then publish | The conductor or launcher holds the confirmation | The delegating brief is the approval when it covers publishing evidence to the bug. Without one, stop after step 8 and report the PNG path; no Jira write |
| A case local rendering cannot cover (photo of signage, anonymization) | Talk it through with the user | Report to the launcher and wait for its answer | Stop and report the case; send nothing to an external service |

Steps 1 to 8 are reversible local work and need no approval.

## Known gotchas

- **Badge hidden behind a callout box.** Both are `position: absolute`, so without stacking DOM order decides paint order. `references/shapes.html` sets a z-index scale: base image `1`, circles, arrows and ticks `10`, callout boxes `20`, corner badge `30` (topmost). Skipping it is the most common annotation bug; check that a copied block kept its `z-index`.
- **Callout text clipped at the edge.** The viewport is smaller than the HTML canvas, or a callout box lacks `max-width` and `white-space: normal`. Keep boxes wrapped, not `nowrap`.
- **Mojibake on em dashes and accented characters.** Without `<meta charset="utf-8">` in `<head>`, `—` and accents render as garbage. `references/shapes.html` carries the tag; keep it when copying.

## Evidence rules

The binding conventions live in `../agentic-qa-core/references/evidence-conventions.md`: the bucket model (§1: intermediates are Bucket C, the final PNG is Bucket B), the annotated-name suffix (§2) and the verify-on-disk discipline (§3).
