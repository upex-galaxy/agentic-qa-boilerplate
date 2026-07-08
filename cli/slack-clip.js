// slack-clip.js — put HTML on the macOS clipboard with the canonical public.html
// flavor (+ a clean plain-text fallback) so pasting into Slack renders rich content:
// a real table, plus bold / italic / underline / strikethrough / inline code / links / bullets.
//
// NOTE: this is a JXA (JavaScript for Automation) script — it runs under macOS
// `osascript`, NOT under bun/node (it is eslint-ignored in eslint.config.js:
// JXA globals ObjC/$ and osascript's run(argv) entry are not a Node dialect).
// macOS only.
// No network calls, no Slack API, no webhook, no config — pure clipboard/file I/O;
// the human pastes manually (Cmd+V) into the Slack composer.
//
// Usage:  osascript -l JavaScript cli/slack-clip.js <path-to-html-file>
//
// Delivery model (macOS, confirmed in Slack):
//   - A report = ONE prose message + ONE message per table.
//   - PROSE: any HTML with <b>/<i>/<u>/<s>/<code>/<ul>/<a> renders as rich text in a single paste.
//   - TABLE: must be its OWN paste from a TABLE-ONLY html (just `<table>…</table>`). Slack allows
//     only one table per message and decides "render as table" from the CLEAN-TSV plain-text flavor.
//
// Why not the obvious approaches:
//   - pbcopy / plain .txt with TABs  -> Slack shows raw text, no table.
//   - AppleScript «data HTML…»        -> sets a dynamic UTI that Slack / Chromium ignore.
//   - Slack Block Kit                 -> has no multi-column table block for channel messages.
//
// Two things silently break the table (both handled here): a trailing newline after </table>,
// and blank lines between rows in the derived TSV. Slack needs clean TSV to detect a table.

ObjC.import('AppKit');
ObjC.import('Foundation');

function readFile(path) {
  var s = $.NSString.stringWithContentsOfFileEncodingError($(path), $.NSUTF8StringEncoding, $());
  return s.isNil() ? null : ObjC.unwrap(s);
}

// Best-effort plain-text fallback. For a table this MUST be clean TSV (one row per line, a tab
// between cells, NO blank lines) — that is what triggers Slack's "paste as table".
function htmlToText(html) {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/\s*<\/\s*tr\s*>\s*/gi, '\n')                 // one newline per row (consume source whitespace)
    .replace(/<\/\s*t[hd]\s*>\s*<\s*t[hd][^>]*>/gi, '\t')  // a tab between cells
    .replace(/<\/\s*(p|h[1-6]|div|li|table)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#8594;|&rarr;/g, '->')
    .replace(/&#8212;|&mdash;/g, '--')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function run(argv) {
  if (!argv || argv.length === 0) {
    console.log('usage: osascript -l JavaScript cli/slack-clip.js <html-file>');
    return;
  }
  var html = readFile(argv[0]);
  if (html === null) { console.log('ERROR: cannot read ' + argv[0]); return; }
  html = html.trim(); // CRITICAL: a trailing newline after </table> makes Slack see mixed content and drop the table

  var text = htmlToText(html);
  var pb = $.NSPasteboard.generalPasteboard;
  pb.clearContents;
  pb.declareTypesOwner($([$.NSPasteboardTypeHTML, $.NSPasteboardTypeString]), $());
  var okH = pb.setStringForType($(html), $.NSPasteboardTypeHTML);
  var okT = pb.setStringForType($(text), $.NSPasteboardTypeString);
  console.log('clipboard set -> public.html=' + okH + ' plain-text=' + okT + ' (' + html.length + ' html bytes)');
}
