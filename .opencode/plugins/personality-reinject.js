import { agentContextLines } from '../../.agents/hooks/personality-reinject.mjs';

// OpenCode has no command hook: the plugin imports the shared emitter and
// pushes the same lines (output contract, `AGENT IDENTITY:`, `ORCA:` when the
// binary is there) into the system prompt, in place and without duplicating.
// OpenCode exposes no session NAME to a plugin, only the id, so the label
// degrades to the raw id here.
//
// ONE default export, TWO entrypoints. OpenCode 2 calls `setup(ctx)` and
// refuses a module that lacks a default `{ id, setup }` definition; OpenCode 1
// (1.18.29 and newer) calls `server()` on the same object. The two APIs stay
// separate: V2 registers a session `context` hook whose system parts are
// `{ type: 'text', text }` objects, V1 returns the
// `experimental.chat.system.transform` hook over plain strings. Drop `server`
// when V1 support ends. `bun run agents:compat:check` fails when either
// entrypoint goes missing.
//
// Plain object on purpose (no `Plugin.define` import): this repo does not
// depend on the plugin SDK, and the loader reads the shape, not the helper.
// See https://opencode.ai/v2/docs/build/plugins/migrate-v1.

function linesFor(sessionId) {
  return agentContextLines({ harness: 'opencode', sessionId: sessionId ?? '' });
}

export default {
  id: 'agentic-qa.personality-reinject',

  // OpenCode 2.
  async setup(ctx) {
    await ctx.session.hook('context', (event) => {
      for (const text of linesFor(event?.sessionID)) {
        if (!event.system.some(part => part?.text === text)) {
          event.system.push({ type: 'text', text });
        }
      }
    });
  },

  // OpenCode 1.
  async server() {
    return {
      'experimental.chat.system.transform': async (input, output) => {
        for (const line of linesFor(input?.sessionID)) {
          if (!output.system.includes(line)) {
            output.system.push(line);
          }
        }
      },
    };
  },
};
