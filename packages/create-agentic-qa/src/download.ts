import { spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { CliError } from './errors.ts';
import { log } from './log.ts';

const TARBALL_NAME = 'template.tar.gz';

/**
 * Build the `tar` argv used to extract the downloaded template.
 *
 * Must stay portable across every `tar` a user can end up with:
 *   - GNU tar        — Linux, WSL, Git Bash / MSYS on Windows
 *   - bsdtar         — macOS, and `C:\Windows\System32\tar.exe` on Windows 10
 *                      1803+ / Windows 11 (what PowerShell and cmd resolve)
 *
 * Two constraints drive the shape of this argv:
 *   1. `--force-local` is GNU-only. bsdtar exits with
 *      "tar: Option --force-local is not supported", so it can never be passed
 *      unconditionally on win32 — PowerShell and cmd hit bsdtar, not GNU tar.
 *   2. GNU tar applies its rsync-style `host:path` heuristic ONLY to the `-f`
 *      argument, which is why a Windows drive path like `C:/Users/...` used to
 *      need `--force-local` in the first place.
 *
 * Passing a bare relative filename for `-f` (the caller spawns tar with
 * `cwd` set to the tarball's directory) removes the colon, so no tar flavour
 * needs the flag. `-C` is a plain chdir on every flavour and takes the real
 * path; forward slashes keep MSYS happy on Windows.
 */
export function buildTarArgs(targetDir: string): string[] {
  const dst = process.platform === 'win32' ? targetDir.replace(/\\/g, '/') : targetDir;
  return ['-xzf', TARBALL_NAME, '-C', dst, '--strip-components=1'];
}

/**
 * Download a GitHub repo as a tarball and extract into `targetDir`.
 * Strips the leading single directory the GitHub tarball wraps everything in.
 */
export async function downloadTemplate(opts: {
  repo: string // "owner/name"
  ref: string // branch / tag / sha
  targetDir: string
}): Promise<void> {
  const { repo, ref, targetDir } = opts;
  const url = `https://codeload.github.com/${repo}/tar.gz/refs/heads/${ref}`;

  // 1) Ensure prerequisites
  if (!hasBinary('tar')) {
    throw new CliError(
      'ENVIRONMENT',
      '`tar` not found on PATH.',
      'macOS and Linux ship it by default. Windows 10 1803+ and Windows 11 ship '
      + 'bsdtar at C:\\Windows\\System32\\tar.exe; if PATH does not reach it, use Git Bash or WSL.',
    );
  }

  // 2) Fetch tarball to a temp file
  const tmpRoot = await mkdtemp(join(tmpdir(), 'create-agentic-qa-'));
  const tarballPath = join(tmpRoot, TARBALL_NAME);

  log.info(`Downloading template: ${repo}@${ref}`);
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) {
      // Try alternate ref path (tag) if branch failed
      const altUrl = `https://codeload.github.com/${repo}/tar.gz/refs/tags/${ref}`;
      const altRes = await fetch(altUrl, { redirect: 'follow' });
      if (!altRes.ok) {
        throw new CliError(
          'NETWORK',
          `Template download failed (HTTP ${res.status}).`,
          `Check that ${repo}@${ref} exists and is reachable.`,
        );
      }
      await streamToFile(altRes, tarballPath);
    }
    else {
      await streamToFile(res, tarballPath);
    }
  }
  catch (err) {
    if (err instanceof CliError) { throw err; }
    throw new CliError(
      'NETWORK',
      `Template download failed: ${(err as Error).message}`,
      'Check your internet connection and that the template repo is reachable.',
    );
  }

  // 3) Make target dir
  await mkdir(targetDir, { recursive: true });

  // 4) Extract, stripping top-level GitHub-wrapper dir
  log.info(`Extracting into ${targetDir}`);
  const extract = spawnSync(
    'tar',
    buildTarArgs(targetDir),
    // Run from the tarball's own directory so `-f` gets a bare relative name.
    { cwd: tmpRoot, stdio: ['ignore', 'inherit', 'inherit'] },
  );
  // Cleanup tarball regardless of extract outcome
  await unlink(tarballPath).catch(() => {});
  await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});

  // A spawn that never launched reports `status: null` + a populated `error`,
  // which the `status !== 0` check below would mislabel as a tar failure —
  // pointing the user at "the tar output above" that tar never printed.
  if (extract.error) {
    throw new CliError(
      'BOOTSTRAP',
      `Could not run tar: ${extract.error.message}`,
      'tar was found on PATH but could not be started. Ensure the `tar` it resolves to '
      + 'is a real GNU tar or bsdtar binary, not a shell alias or a .cmd/.bat shim.',
    );
  }

  if (extract.status !== 0) {
    throw new CliError(
      'BOOTSTRAP',
      `tar extraction failed (exit ${extract.status}).`,
      'The tar output above says why. Common causes: no write permission on the '
      + 'target directory, or a third-party `tar` shim on PATH that is neither GNU tar nor bsdtar.',
    );
  }
}

async function streamToFile(res: Response, path: string): Promise<void> {
  if (!res.body) {
    throw new CliError('NETWORK', 'Empty response body from GitHub.');
  }
  // Node's fetch.body is a web stream; Readable.fromWeb adapts it.
  const nodeStream = Readable.fromWeb(res.body as unknown as import('node:stream/web').ReadableStream);
  await pipeline(nodeStream, createWriteStream(path));
}

function hasBinary(name: string): boolean {
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return probe.status === 0;
}
