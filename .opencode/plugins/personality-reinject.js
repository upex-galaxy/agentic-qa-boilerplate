import { agentContextLines, rearmRoutes, routeLines, sessionLaunched } from '../../.agents/hooks/personality-reinject.mjs';

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
// The `ORCA:` line follows the session's role, and the role comes from the
// prompt too: a prompt carrying the fleet token (`/<skill> <label> fleet
// worker`) marks the session launched. OpenCode 1 records it in
// `chat.message` with the emitter's `sessionLaunched` (same session record as
// the routes, so a compaction keeps it) and the system transform then pushes
// the launched variant. OpenCode 2 hands the plugin no prompt, so it cannot
// see the token: a v2 worker always gets the independent `ORCA:` line, and
// its brief (worker contract) is what tells it to report to its launcher.
//
// Plain object on purpose (no `Plugin.define` import): this repo does not
// depend on the plugin SDK, and the loader reads the shape, not the helper.
// See https://opencode.ai/v2/docs/build/plugins/migrate-v1.

function linesFor(sessionId, repoRoot) {
  return agentContextLines({ harness: 'opencode', sessionId: sessionId ?? '', repoRoot });
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
        const prompt = promptOf(output?.parts);
        // The role first: `routeLines` rewrites the same record and keeps `launched`.
        sessionLaunched({ prompt, sessionId, repoRoot });
        pendingRoutes.set(sessionId, routeLines({ prompt, sessionId, repoRoot }));
      },
      'experimental.session.compacting': async (input) => {
        rearmRoutes({ sessionId: input?.sessionID ?? '', repoRoot });
      },
      'experimental.chat.system.transform': async (input, output) => {
        const lines = [...linesFor(input?.sessionID, repoRoot), ...(pendingRoutes.get(input?.sessionID ?? '') ?? [])];
        for (const line of lines) {
          if (!output.system.includes(line)) {
            output.system.push(line);
          }
        }
      },
    };
  },
};
