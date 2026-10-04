import { agentContextLines, rearmRoutes, routeLines } from '../../.agents/hooks/personality-reinject.mjs';

// OpenCode has no command hook: the plugin imports the shared emitter and
// pushes the same lines (`AGENT IDENTITY:`, `ORCA:` when the
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
// `ROUTE:` lines (instruction router) need the prompt text. OpenCode 1 hands
// it to `chat.message`: the plugin classifies it there with the same
// `routeLines` the command hook uses and pushes the result through the system
// transform for the rest of that turn; `experimental.session.compacting`
// re-arms the routes. OpenCode 2 exposes no hook that carries the prompt, so
// it is ROUTER-ONLY: the model follows the router table of AGENTS.md and its
// LOAD PROTOCOL, with no `ROUTE:` cue. Re-verify when OpenCode 2 ships a
// per-message hook.
//
// Plain object on purpose (no `Plugin.define` import): this repo does not
// depend on the plugin SDK, and the loader reads the shape, not the helper.
// See https://opencode.ai/v2/docs/build/plugins/migrate-v1.

function linesFor(sessionId) {
  return agentContextLines({ harness: 'opencode', sessionId: sessionId ?? '' });
}

/** The text a user message carries: its `text` parts, joined. */
function promptOf(parts) {
  return (Array.isArray(parts) ? parts : [])
    .filter(part => part?.type === 'text' && typeof part.text === 'string')
    .map(part => part.text)
    .join('\n');
}

/** OpenCode 1: the `ROUTE:` lines of the latest prompt, per session. */
const pendingRoutes = new Map();

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
  async server(ctx) {
    // The checkout whose AGENTS.md the session loaded; the emitter falls back to the cwd.
    const repoRoot = typeof ctx?.worktree === 'string' && ctx.worktree ? ctx.worktree : undefined;
    return {
      'chat.message': async (input, output) => {
        const sessionId = input?.sessionID ?? '';
        pendingRoutes.set(sessionId, routeLines({ prompt: promptOf(output?.parts), sessionId, repoRoot }));
      },
      'experimental.session.compacting': async (input) => {
        rearmRoutes({ sessionId: input?.sessionID ?? '', repoRoot });
      },
      'experimental.chat.system.transform': async (input, output) => {
        const lines = [...linesFor(input?.sessionID), ...(pendingRoutes.get(input?.sessionID ?? '') ?? [])];
        for (const line of lines) {
          if (!output.system.includes(line)) {
            output.system.push(line);
          }
        }
      },
    };
  },
};
