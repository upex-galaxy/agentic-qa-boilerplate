# Volatile facts in committed prose

> Canon for Critical Rule #17 in `AGENTS.md`. Cited by every skill that writes or reviews committed prose; the two linters (`scripts/lint-skills.ts` for `.agents/**` and `AGENTS.md`, `scripts/lint-docs.ts` for `docs/**`, `README.md`, `INSTALLER.md` and the decks) enforce the two families a regex can see.

## 1. The rule

A committed instruction or doc describes the repo the way a contract describes a system: by naming the parts and who owns them, not by copying the current readings off the dashboard. Any sentence whose truth depends on the current contents of another file, of the tracker, or of an external tool is a **volatile fact**, and a volatile fact in committed prose is a bug with a fuse: it is correct the day it is written, wrong a few weeks later, and read every session by an agent that has no way to tell the two states apart.

The cost is paid twice. Once when a session trusts the stale value: a count of skills that makes the AI stop looking after that many, a line number that now points at a blank line, a measured token size that justifies a posture the numbers no longer support. And again when a careful session notices the drift and spends a turn reporting it instead of working.

The fix is always the same shape: **replace the value with the name of its owner.** The reader resolves the pointer at read time, so the prose is correct for as long as the owner exists, and when the owner moves, the STALE-PATH check in `scripts/lint-skills.ts` or the path check in `scripts/lint-docs.ts` catches the dead pointer, which no lint can do for a stale number.

## 2. Five categories, one test each

| Category | The test | Owner to name instead |
|---|---|---|
| **Count** | Would a routine commit change this number? | The file or command that counts: `REGISTRY.md`, `kata-manifest.json`, `package.json`, `bun run tests:map` |
| **Enumeration** | Does another file already own this list? | That file: `.mcp.json`, `.agents/skills/`, `.agents/jira-required.yaml`, `REGISTRY.md`, a constant in code |
| **file:line** | Would an unrelated edit above it shift the line? | The file plus a symbol or a heading |
| **Current-state claim** | Does the sentence carry "today", a date, a version, a measurement, or a live ticket number? <!-- volatile-ok: names the word it forbids --> | The behaviour without the qualifier; the dated figure goes to an ADR |
| **Edit-history narration** | Does it tell the reader what the text used to say? | The current behaviour only; the history goes to an ADR or the commit |

Before and after, one per category (the left column is what the sweep found, the right column is the shape that survives):

```text
count          "Six MCP servers"                       -> "the servers `.mcp.json` declares"
enumeration    "10 rows: A / B / C / ..."              -> "one row per surface, listed in `cli/lib/updater-parity.ts`"
file:line      "`config/variables.ts:34`"              -> "`resolveAtlassianUrl` in `config/variables.ts`"
current-state  "currently `git_strategy` and `orchestration`" -> "the keys in `CONFIG_BLOCK_READERS`"
edit-history   "since 8.4 the updater does X"          -> "the updater does X" (history in an ADR)
```

## 3. What is stable, and therefore fine

Names that change only by an explicit decision are the vocabulary of the repo, not its state: the IQL stage names, the KATA layer names, a Critical Rule number, the name of a file or a command, "three hosts". A stable fact passes all five tests. When in doubt, ask whether a routine commit (a new skill, a new skill mode, a synced catalog, a regenerated registry) could falsify the sentence without anyone meaning to change it. If yes, it is volatile.

## 4. Exemptions: where a snapshot is the point

- **Gitignored files and `.session/**`**: nobody else reads them.
- **Generated artifacts**: the tooling rewrites them (`REGISTRY.md`, `kata-manifest.json`, `.agents/project.schema.yaml`).
- **ADRs, changelogs and dated reports**: a number "at the time" stays true forever because the date is part of the claim.
- **Test fixtures and code constants**: they ARE the value.
- **Example output inside a fenced block or a `<pre>`**: a fake `4/7 PASSED` teaches a format, it does not describe the suite.
- **A dated ledger by design**: a reference whose every row carries its own measurement date and tool version, and whose lifecycle moves a row out when it stops being true (the orca gotchas ledger is one). The date is the row's identity, not a stale copy.

## 5. Forensic notes: keep the why, move the figure

A doctrine rule often exists because something was measured: a byte count that proved a YAML round-trip corrupts the file, a token size that justified loading two stubs eagerly, a fleet where every worker started with an empty variable. The reader deserves the WHY, but the figure and its date are current-state claims that age in prose read every session.

The split: the doctrine keeps the why in one sentence with no figure and no date ("measured on a real fleet", "a measured, non-trivial cost"), and links the record that holds the number. The record is an ADR (`.context/ADR/ADR-0006-forensic-measurements-ledger.md` collects the ones behind this repo's own doctrine) or a dated ledger the skill owns. A new measurement that motivates a rule is appended there, never inlined in the rule.

## 6. Decks and pages

User-facing decks and pages are committed too. They may show a current list or a dogfood figure as a teaching example, but the slide says "snapshot" or names its source (the file, the report, the date of the run) so the next reader does not mistake a lesson for an inventory. A duration table or a cost figure on a slide is captioned as an order of magnitude, never as the suite's timing.

## 7. The lint, and the escape hatch

Two families have a regex-visible shape, and the linters report them:

- `FILE-LINE`: a path with a known extension followed by `:N`, `:N-M` or `#LN`, outside fenced blocks and `<pre>` / `<code class="block">`.
- `CURRENT-STATE`: the dating vocabulary ("today", "currently", "as of <year>", "measured <date>", "since <version>", a `~Nk tokens` or `N bytes` measurement, a tool version after "as of" / "verified against", and the Spanish equivalents), outside the same blocks and outside the frontmatter `description`. <!-- volatile-ok: names the words it forbids -->

Counts and enumerations have no regex shape: no pattern can tell a router table from a copied inventory. Those stay a review-time judgement, which is what this reference is for.

A line that legitimately carries one of the two shapes (a worked example that must show the bad form, a teaching sentence about a forbidden word) is marked on the same line with `volatile-ok: <reason>`, as an HTML comment in HTML and Markdown (`<!-- volatile-ok: teaching example -->`). A dated ledger by design (§4) carries `volatile-ok-file: <reason>` in its header and is skipped whole. The reason is mandatory in both forms: an allowlist entry with no reason is the next stale fact.
