import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';

import { log } from './log.ts';

interface Tracked {
  createdDir?: string
  gitInitialized?: boolean
}

const state: Tracked = {};

export const rollback = {
  trackCreatedDir(path: string) {
    state.createdDir = path;
  },

  trackGitInit() {
    state.gitInitialized = true;
  },

  /**
   * Run cleanup. Only deletes paths the CLI itself created — never touches
   * pre-existing user files.
   */
  async run(reason: string): Promise<void> {
    if (state.createdDir && existsSync(state.createdDir)) {
      log.warn(`Rolling back: ${reason}`);
      try {
        await rm(state.createdDir, { recursive: true, force: true });
        log.dim(`  Removed: ${state.createdDir}`);
      }
      catch (err) {
        log.error(`  Cleanup failed: ${(err as Error).message}`);
      }
    }
  },

  /** Clear tracker after a successful stage. */
  forget() {
    state.createdDir = undefined;
    state.gitInitialized = undefined;
  },
};
