import { agentContextLines } from '../../.agents/hooks/personality-reinject.mjs';

// OpenCode has no command hook: the plugin imports the shared emitter and
// pushes the same lines (output contract, `AGENT IDENTITY:`, `ORCA:` when the
// binary is there) into the system array, in place and without duplicating.
// The transform input carries `sessionID`, which is the only session handle
// OpenCode exposes to a plugin, so the label degrades to the raw id here.
export const PersonalityReinject = async () => ({
  'experimental.chat.system.transform': async (input, output) => {
    const lines = agentContextLines({
      harness: 'opencode',
      sessionId: input?.sessionID ?? '',
    });
    for (const line of lines) {
      if (!output.system.includes(line)) {
        output.system.push(line);
      }
    }
  },
});
