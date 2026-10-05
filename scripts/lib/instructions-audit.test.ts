import { describe, expect, test } from 'bun:test';
import { auditTranscript, claudeProjectSlug, emptyAudit, recallOf, totals } from './instructions-audit.ts';

const prompt = (text: string): string => JSON.stringify({ type: 'user', message: { role: 'user', content: text } });
const meta = (): string => JSON.stringify({ type: 'user', isMeta: true, message: { content: [{ type: 'text', text: 'skill body' }] } });
const toolResult = (): string => JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: 'SECRET=hunter2' }] } });
const routes = (...paths: string[]): string => JSON.stringify({
  type: 'attachment',
  attachment: { type: 'hook_additional_context', hookEvent: 'UserPromptSubmit', content: [`AGENT IDENTITY: x\n${paths.map(p => `ROUTE: read ${p}`).join('\n')}`] },
});
const tool = (name: string, input: Record<string, unknown>): string => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
const GIT = '.agents/instructions/agent-git.md';
const PBI = '.agents/instructions/agent-local-context-pbi.md';

function audit(lines: string[], closeAtEnd = false) {
  const result = emptyAudit();
  auditTranscript(lines, result, closeAtEnd);
  return result;
}

describe('instructions audit', () => {
  test('a route read in the same turn counts; one never read before the next prompt is missed', () => {
    const result = audit([
      prompt('commit and sync jira'),
      routes(GIT, PBI, 'package.json'),
      tool('Read', { file_path: `/abs/repo/${GIT}` }),
      prompt('next'),
    ]);
    expect(result.sections.get(GIT)).toEqual({ routed: 1, readInTurn: 1, readBefore: 0, missed: 0, open: 0 });
    expect(result.sections.get(PBI)).toEqual({ routed: 1, readInTurn: 0, readBefore: 0, missed: 1, open: 0 });
    expect(result.importRoutes).toBe(1);
    expect(recallOf(totals(result))).toBe(0.5);
  });

  test('a Bash read verb counts, a Bash mention without one does not; meta and tool results do not close the turn', () => {
    const result = audit([
      prompt('go'),
      routes(GIT, PBI),
      meta(),
      toolResult(),
      tool('Bash', { command: `cat ${GIT} .agents/instructions/agent-local-context-pbi.md` }),
      prompt('go on'),
      routes('.agents/instructions/agent-harnesses.md'),
      tool('Bash', { command: 'git add .agents/instructions/agent-harnesses.md' }),
      prompt('done'),
    ]);
    expect(result.sections.get(GIT)?.readInTurn).toBe(1);
    expect(result.sections.get(PBI)?.readInTurn).toBe(1);
    expect(result.sections.get('.agents/instructions/agent-harnesses.md')?.missed).toBe(1);
  });

  test('a file read earlier in the context satisfies the route; a compaction forgets it', () => {
    const result = audit([
      prompt('look'),
      tool('Read', { file_path: GIT }),
      prompt('commit'),
      routes(GIT),
      prompt('more'),
      JSON.stringify({ type: 'system', subtype: 'compact_boundary' }),
      prompt('push'),
      routes(GIT),
      prompt('end'),
    ]);
    expect(result.sections.get(GIT)).toEqual({ routed: 2, readInTurn: 0, readBefore: 1, missed: 1, open: 0 });
  });

  test('the last turn stays open while the session may run, and closes as missed once it is over', () => {
    const lines = [prompt('one turn worker brief'), routes(GIT)];
    expect(audit(lines).sections.get(GIT)).toEqual({ routed: 1, readInTurn: 0, readBefore: 0, missed: 0, open: 1 });
    expect(audit(lines, true).sections.get(GIT)).toEqual({ routed: 1, readInTurn: 0, readBefore: 0, missed: 1, open: 0 });
    expect(recallOf(totals(audit(lines)))).toBeNull();
  });

  test('garbage lines are skipped and nothing from the transcript is kept but section paths and counts', () => {
    const result = audit(['not json', '{"type":', prompt('my token is sk-live-123'), routes(GIT), toolResult(), prompt('x')]);
    expect(JSON.stringify([...result.sections.entries()])).not.toContain('sk-live');
    expect(JSON.stringify([...result.sections.entries()])).not.toContain('hunter2');
    expect(result.transcripts).toBe(1);
    expect(result.routedSessions).toBe(1);
  });

  test('the new route format, the optional line and the PostToolUse reminder: reads after a reminder are counted apart', () => {
    const hook = (event: string, text: string): string => JSON.stringify({ type: 'attachment', attachment: { type: 'hook_additional_context', hookEvent: event, content: [text] } });
    const result = audit([
      prompt('commit and sync jira'),
      hook('UserPromptSubmit', `ROUTE: read ${GIT} (git, 51 lines) before acting on this prompt\nROUTE: read ${PBI} (local-context-pbi, 112 lines) before acting on this prompt\nROUTE-OPTIONAL: the prompt also touches x; read one only if the task needs it.`),
      tool('Read', { file_path: GIT }),
      tool('Bash', { command: 'git status' }),
      hook('PostToolUse', `ROUTE-PENDING: routed for this prompt and still unread: ${PBI}. Read it before the next step.`),
      tool('Read', { file_path: PBI }),
      prompt('next'),
    ]);
    expect(recallOf(totals(result))).toBe(1);
    expect([result.optionalLines, result.reminders, result.readAfterReminder]).toEqual([1, 1, 1]);
  });

  test('the Claude Code project slug replaces every non-alphanumeric character', () => {
    expect(claudeProjectSlug('/Users/me/orca/workspaces/agentic-qa-boilerplate/b2-q')).toBe('-Users-me-orca-workspaces-agentic-qa-boilerplate-b2-q');
    expect(claudeProjectSlug('/tmp/a_b.c')).toBe('-tmp-a-b-c');
  });
});
