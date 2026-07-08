---
name: bug-screenshot-annotation
description: "Turns a raw bug screenshot into a QA-style annotated evidence image — circles/ovals around the broken region, arrows, callout text boxes, a 'BUG — <KEY>' corner badge, and axis tick-marks for date/offset bugs. Use whenever a bug is visual or positional (overlapping elements, misalignment, wrong date/offset on a chart axis, a UI element in the wrong place) and a plain screenshot would need a paragraph to explain what's wrong — the annotated image should make the defect obvious at a glance, the way a QA engineer would mark it up with Snagit or Markup. Triggers on: annotate bug screenshot, mark up evidence, add circles/arrows to screenshot, clarify this bug visually, anota este bug, marca la captura, resalta el bug en la imagen. Runs 100% locally (HTML+CSS overlays rendered via a loopback-only HTTP server and captured with playwright-cli) — do NOT use for photos of physical objects or documents where the fix is inherent to an external image-editing/generative service; this skill only knows how to overlay shapes on a screenshot you already have on disk. Do NOT use for filing the bug itself (that's sprint-testing Stage 2/3) or for routine before/after screenshots that already read clearly without markup — this skill is for the specific case where a raw screenshot alone doesn't communicate the defect."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
---

# Bug Screenshot Annotation

Reference/utility skill (same tier as `/playwright-cli`): loaded INSIDE the subagent that is already executing a testing stage — it does not spawn agents of its own and has no dispatch strategy. Typical caller: `/sprint-testing` Stage 2, when a bug found during exploration is visual/positional (see `../sprint-testing/references/exploration-patterns.md` §"Bugs found during exploration").

## Why 100% local — the security rationale (binding)

An earlier design routed screenshots through external generative image-editing services. Both attempts failed, one dangerously:

- A quota-walled image MCP was simply unavailable (429 across every tier). Not a design problem — just dead.
- A second generative service got hard-blocked by the agent runtime's own data-exfiltration classifier, because QA screenshots carry real product/customer/competitor data and the destination was not a trusted host. Critically, **explicit user authorization in chat did not lift the block** — and one screenshot had already leaked to the service's public S3/CloudFront bucket before the second attempt was caught.

The standing lesson: **QA evidence containing real product or customer data never routes through an external image service, generative or otherwise.** This skill sidesteps the risk entirely — everything happens with HTML+CSS rendered by an HTTP server bound to `127.0.0.1`, captured by a local browser-automation CLI; nothing leaves the machine. If a genuinely unhandleable case appears (e.g. annotating a photo of physical signage), go back to the user and talk through anonymization first — NEVER quietly pipe a real screenshot to an external service.

## Scope

- **Input**: a raw screenshot that already exists on disk (typically in the ticket's PBI `evidence/` folder). This skill overlays shapes; it does not generate or edit images from a text description.
- **Output**: exactly ONE file that counts as evidence — the final rendered annotated PNG, in the ticket's `evidence/` folder. The crop and the annotation HTML are Bucket C working files (see `../agentic-qa-core/references/evidence-conventions.md` §1): session scratchpad only, never referenced from Jira/ATR/bug tickets.
- **Not for**: filing the bug (reporting-templates owns that), plain before/after shots that read clearly raw, photos of physical objects/documents.

## Process (8 steps + optional embed)

1. **Identify the region.** From the raw screenshot (or its accessibility snapshot), work out the pixel crop box and roughly where each annotation shape lands relative to it.

2. **Crop with Python + PIL — scratchpad only.**

   ```python
   from PIL import Image
   img = Image.open("<raw-screenshot-path>")
   img.crop((left, top, right, bottom)).save("<scratchpad>/crop.png")
   ```

   The crop is a working intermediate, not evidence — never write it to the ticket's evidence folder.

3. **Build the annotation HTML — scratchpad only.** The crop goes in as a background `<img>`; each annotation is one absolutely-positioned `<div>` overlay. Do NOT design from scratch — copy/adjust the commented blocks in `references/shapes.html` (circle-callout, arrow-to-region, callout-box, badge-corner, axis-tick + axis-tag, before-after) and keep its z-index scale.

4. **Serve it over loopback.** The browser-automation CLI refuses `file://` URLs (errors out before rendering) — a local HTTP server is the only way, and loopback binding is also what keeps this approach exfiltration-safe, not just a workaround:

   ```bash
   python3 -m http.server <port> --bind 127.0.0.1 --directory <scratchpad>
   ```

5. **Capture with the browser-automation CLI.** Load `/playwright-cli` first (CLI → skill auto-load rule) for exact verbs/flags. Flow: open `http://127.0.0.1:<port>/annotation.html`, resize the viewport to the HTML's real dimensions (equal or larger — a smaller viewport clips callouts), then screenshot with an explicit destination path into the ticket's `evidence/` folder, named:

   ```
   {KEY}-BUG-{BUG-KEY}-annotated.png
   ```

   `{KEY}` = ticket under test, `{BUG-KEY}` = the filed bug/defect/improvement issue key (they differ in the normal case). This is the ONE file of the whole process that belongs in `evidence/`.

6. **Inspect and iterate.** Read the PNG back and check it reads cleanly. Not optional and not one-shot — expect at least one adjustment pass: move/resize a circle or callout box, rewrap/shorten callout text, nudge the badge or arrow out of a collision.

7. **Clean up.** Kill the HTTP server process (`kill <pid>` or `pkill -f "http.server <port>"`). Never leave it running past the session.

8. **Report the path — immediately, unprompted.** The moment the final PNG lands in `evidence/`, state its repo-relative path in chat, in that same turn (standing contract: `../agentic-qa-core/references/session-footer-contract.md` Part 1). The path must also reappear in the session-close consolidated screenshot list, leading the "Bug annotations" group.

9. **(Optional — this repo's upgrade over the manual-attach model.) Embed into the bug issue.** Jira accepts inline images via the bundled helper — offer to publish the annotated PNG directly as an evidence comment on the bug (human confirms first):

   ```bash
   bun .claude/skills/acli/scripts/jira-attach-media.ts <BUG-KEY> \
     ./evidence/<KEY>-BUG-<BUG-KEY>-annotated.png \
     --caption "Annotated evidence — <one-line defect summary>" --publish
   ```

   The annotated image is the "money shot": it leads the bug's Evidence section and ranks first (ahead of the raw capture) in the Stage 3 Evidence Handoff (`../sprint-testing/references/reporting-templates.md` §3.5).

## Known gotchas

- **Badge hidden behind a callout box.** Both are `position: absolute`; without explicit stacking, DOM order (not visual intent) decides paint order. `references/shapes.html` fixes this with an explicit z-index scale — base image `1` → circles/arrows/ticks `10` → callout boxes `20` → corner badge `30` (always topmost). Skipping the scale is the #1 source of annotation bugs; don't let a copy-pasted block quietly drop its `z-index`.
- **Callout text clipped at the edge.** Happens when the resize viewport is smaller than the HTML canvas, or a callout box lacks `max-width` + `white-space: normal`. Size the viewport to the real image dimensions or larger — never smaller; keep callout boxes wrapped, not `nowrap`.
- **`file://` doesn't work.** Always serve over loopback HTTP (step 4).
- **Mojibake on em-dashes / accented characters.** Without `<meta charset="utf-8">` in `<head>`, `—` and accents render as garbage when captured. `references/shapes.html` already carries the meta tag — keep it when copying.

## Evidence rules

Binding conventions: `../agentic-qa-core/references/evidence-conventions.md` — bucket model (§1: intermediates are Bucket C, final PNG is Bucket B), annotated-name suffix (§2), verify-on-disk discipline (§3).
