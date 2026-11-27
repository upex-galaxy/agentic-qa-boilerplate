import { describe, expect, test } from 'bun:test';
import { buildJiraFields, readJiraFlags } from './jira-fields.ts';

const base = { projectKey: 'BK', summary: 'S' };

describe('buildJiraFields', () => {
  test('no extras yields only summary and project', () => {
    expect(buildJiraFields(base)).toEqual({ fields: { summary: 'S', project: { key: 'BK' } } });
  });

  test('description and labels appear only when given', () => {
    expect(buildJiraFields({ ...base, description: 'D', labels: ['a', 'b'] })).toEqual({
      fields: { summary: 'S', project: { key: 'BK' }, description: 'D', labels: ['a', 'b'] },
    });
  });

  test('parent maps to key', () => {
    expect(buildJiraFields({ ...base, parent: 'BK-1' }).fields.parent).toEqual({ key: 'BK-1' });
  });

  test('assignee maps to accountId', () => {
    expect(buildJiraFields({ ...base, assignee: 'abc123' }).fields.assignee).toEqual({ accountId: 'abc123' });
  });

  test('components accept CSV and repeated values', () => {
    expect(buildJiraFields({ ...base, components: ['X, Y', 'Z'] }).fields.components).toEqual([
      { name: 'X' },
      { name: 'Y' },
      { name: 'Z' },
    ]);
  });

  test('empty strings are dropped', () => {
    expect(buildJiraFields({ ...base, description: '', labels: ['', ' '], parent: ' ', components: ['', ','], assignee: '' })).toEqual({
      fields: { summary: 'S', project: { key: 'BK' } },
    });
  });
});

describe('readJiraFlags', () => {
  test('reads repeated component and single flags', () => {
    expect(readJiraFlags({ parent: 'BK-2', component: ['A', 'B,C'], assignee: 'id' })).toEqual({
      parent: 'BK-2',
      components: ['A', 'B,C'],
      assignee: 'id',
    });
  });

  test('absent flags give empty values', () => {
    expect(readJiraFlags({})).toEqual({ parent: undefined, components: [], assignee: undefined });
  });
});
