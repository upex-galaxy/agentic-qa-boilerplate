#!/usr/bin/env node
/**
 * UserPromptSubmit hook: re-inject the output contract on every turn.
 *
 * Why this exists: CLAUDE.md §2 (Butler + PM Voice + Visual Mapping) and the
 * user-global OUTPUT STYLE section are read ONCE at session start and then
 * dilute as the context window fills, while the caveman plugin re-injects
 * itself on every UserPromptSubmit. That asymmetry is mechanical, not
 * editorial: whichever layer is repeated most often wins. This hook restores
 * the balance for ~30 tokens per turn.
 *
 * Keep it to a SINGLE short line. It runs on every prompt.
 */

const CONTRACT = [
  'OUTPUT CONTRACT (CLAUDE.md §2 + ~/.claude/CLAUDE.md OUTPUT STYLE):',
  'PM Voice headline = value, never a punch phrase.',
  'Render markdown: headings when 2+ sections, one bold anchor per block, backticks on every path/command/identifier, tables for comparisons, no wall of text.',
  'Butler bullets as `topic: fragment`.',
  'No em dash. Vary sentence length. No closing recap.',
].join(' ');

process.stdout.write(CONTRACT);
process.exit(0);
