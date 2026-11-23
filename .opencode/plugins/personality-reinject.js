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
// `ROUTE:` lines (instruction router) need the prompt text. Each generation
// hands it to one hook: `chat.message` on OpenCode 1, the session `prompt`
// hook on OpenCode 2 (`{ sessionID, messageID, prompt: { text, files } }`,
// measured on 2.3.2). The plugin classifies it there with the same
// `routeLines` the command hook uses and pushes the result through the system
// hook for the rest of that turn. Compaction re-arms the routes:
// `experimental.session.compacting` on OpenCode 1, the session `compaction`
// hook on OpenCode 2 (it runs on the compaction request, next to the
// `session.compaction.started` / `ended` events).
//
// The `ORCA:` line follows the session's role, and the role comes from the
// prompt too: a prompt carrying the fleet token (`/<skill> <label> fleet
// worker`) marks the session launched. The prompt hook records it with the
// emitter's `sessionLaunched` (same session record as the routes, so a
// compaction keeps it) and the system hook then pushes the launched variant.
//
// The checkout is the plugin's, never the server's working directory: one
// OpenCode service serves every project, and its `process.cwd()` is wherever
// it started. OpenCode 1 hands it as `ctx.worktree`, OpenCode 2 as
// `ctx.location` (`project.directory` is the checkout root, `directory` the
// folder the session opened). The identity line and the route state both
// resolve from it.
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

/** OpenCode 2: the checkout root of `ctx.location`, else the session folder. */
function checkoutOfLocation(location) {
  const root = location?.project?.directory || location?.directory;
  return typeof root === 'string' && root ? root : undefined;
}

/** The `ROUTE:` lines of the latest prompt, per session. */
const pendingRoutes = new Map();

export default {
  id: 'agentic-qa.personality-reinject',

  // OpenCode 2.
  async setup(ctx) {
    const repoRoot = checkoutOfLocation(ctx?.location);
    await ctx.session.hook('prompt', (event) => {
      const sessionId = event?.sessionID ?? '';
      const prompt = typeof event?.prompt?.text === 'string' ? event.prompt.text : '';
      // The role first: `routeLines` rewrites the same record and keeps `launched`.
      sessionLaunched({ prompt, sessionId, repoRoot });
      pendingRoutes.set(sessionId, routeLines({ prompt, sessionId, repoRoot }));
    });
    await ctx.session.hook('compaction', (event) => {
      rearmRoutes({ sessionId: event?.sessionID ?? '', repoRoot });
    });
    await ctx.session.hook('context', (event) => {
      const lines = [...linesFor(event?.sessionID, repoRoot), ...(pendingRoutes.get(event?.sessionID ?? '') ?? [])];
      for (const text of lines) {
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
