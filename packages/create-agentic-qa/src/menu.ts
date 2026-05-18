import pc from 'picocolors';

import { sanitizeProjectName } from './prepare.ts';
import * as tui from './tui.ts';

export type MenuResult
  = | { kind: 'doctor' }
    | { kind: 'inspect' }
    | { kind: 'scaffold', projectName: string }
    | { kind: 'quit' };

export async function runMenu(): Promise<MenuResult> {
  // Headline only — logo is already printed by cli.ts main() before the menu.
  process.stdout.write(`${tui.headline('create-agentic-qa')}\n`);

  tui.intro(pc.bgCyan(' AGENTIC QA '));

  const choice = await tui.select<'doctor' | 'inspect' | 'scaffold' | 'quit'>({
    message: 'What would you like to do?',
    options: [
      { value: 'scaffold', label: 'Create a new project' },
      { value: 'doctor', label: 'Check prerequisites' },
      { value: 'inspect', label: 'What will this install?' },
      { value: 'quit', label: 'Quit' },
    ],
  });

  if (tui.isCancel(choice)) {
    return { kind: 'quit' };
  }

  if (choice === 'quit') {
    return { kind: 'quit' };
  }

  if (choice === 'doctor') {
    return { kind: 'doctor' };
  }

  if (choice === 'inspect') {
    return { kind: 'inspect' };
  }

  // scaffold — prompt for project name
  const nameInput = await tui.text({
    message: 'Project name',
    placeholder: 'my-app',
    validate: (v: string | undefined) => ((v ?? '').trim() ? undefined : 'Project name is required'),
  });

  if (tui.isCancel(nameInput)) {
    tui.cancel('Cancelled.');
    return { kind: 'quit' };
  }

  const sanitized = sanitizeProjectName(nameInput);
  if (!sanitized) {
    tui.cancel('Invalid project name.');
    return { kind: 'quit' };
  }

  return { kind: 'scaffold', projectName: sanitized };
}
