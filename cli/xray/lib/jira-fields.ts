import type { Flags } from '../types/index.js';
import { getFlag, getFlagArray } from './parser.js';

export interface JiraFieldsInput {
  projectKey: string
  summary: string
  description?: string
  labels?: string[]
  parent?: string
  components?: string[]
  assignee?: string
}

export interface JiraCreateFields {
  fields: Record<string, unknown>
}

function splitList(values: string[] | undefined): string[] {
  return (values ?? [])
    .flatMap(v => v.split(','))
    .map(v => v.trim())
    .filter(Boolean);
}

export function buildJiraFields(input: JiraFieldsInput): JiraCreateFields {
  const fields: Record<string, unknown> = {
    summary: input.summary,
    project: { key: input.projectKey },
  };
  if (input.description) {
    fields.description = input.description;
  }
  const labels = splitList(input.labels);
  if (labels.length > 0) {
    fields.labels = labels;
  }
  const parent = input.parent?.trim();
  if (parent) {
    fields.parent = { key: parent };
  }
  const components = splitList(input.components);
  if (components.length > 0) {
    fields.components = components.map(name => ({ name }));
  }
  const assignee = input.assignee?.trim();
  if (assignee) {
    fields.assignee = { accountId: assignee };
  }
  return { fields };
}

export function readJiraFlags(flags: Flags): Pick<JiraFieldsInput, 'parent' | 'components' | 'assignee'> {
  return {
    parent: getFlag(flags, 'parent'),
    components: getFlagArray(flags, 'component'),
    assignee: getFlag(flags, 'assignee'),
  };
}
