import { pathToFileURL } from 'node:url';

export const PERSONALITY_CONTRACT = [
  'OUTPUT CONTRACT (AGENTS.md §2 plus the active user-level AGENTS.md output style):',
  'PM Voice headline = value, never a punch phrase.',
  'Render markdown: headings when 2+ sections, one bold anchor per block, `backticks` for paths/commands/identifiers, tables for comparisons, blank lines between blocks.',
  'Butler bullets as `topic: fragment`.',
  'No em dash. Vary sentence length. No closing recap.',
].join(' ');

export function emitPersonalityContract(stream = process.stdout) {
  stream.write(PERSONALITY_CONTRACT);
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  emitPersonalityContract();
}
