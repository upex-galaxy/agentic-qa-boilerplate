import { spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { CliError } from './errors.ts';
import { log } from './log.ts';

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
      'GNU/BSD `tar` not found on PATH.',
      'Install: macOS+Linux have it by default; on Windows use Git Bash or WSL.',
    );
  }

  // 2) Fetch tarball to a temp file
  const tmpRoot = await mkdtemp(join(tmpdir(), 'create-agentic-qa-'));
  const tarballPath = join(tmpRoot, 'template.tar.gz');

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
  const isWin = process.platform === 'win32';
  // Windows: GNU tar reads `C:\path` as host:path (rsync-style remote); --force-local disables that.
  // Forward slashes avoid backslashes being interpreted as escape sequences after --force-local.
  const tarSrc = isWin ? tarballPath.replace(/\\/g, '/') : tarballPath;
  const tarDst = isWin ? targetDir.replace(/\\/g, '/') : targetDir;
  const extract = spawnSync(
    'tar',
    [
      ...(isWin ? ['--force-local'] : []),
      '-xzf',
      tarSrc,
      '-C',
      tarDst,
      '--strip-components=1',
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
  // Cleanup tarball regardless of extract outcome
  await unlink(tarballPath).catch(() => {});
  await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});

  if (extract.status !== 0) {
    throw new CliError(
      'BOOTSTRAP',
      `tar extraction failed (exit ${extract.status}).`,
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
