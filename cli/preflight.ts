#!/usr/bin/env bun
/**
 * @fileoverview The preflight of `bun sync` (installer-ui `preflight.md` §3):
 * everything that would make the update fail halfway, checked in seconds,
 * before any question and any write.
 *
 *   bun cli/preflight.ts --for up [--json]
 *
 *   bun cli/preflight.ts --for setup [--json]
 *   bun cli/preflight.ts --for setup --gate   (what `bun setup` runs first)
 *
 * `--json` prints the checklist (id, group, verdict, observed, needed_by, fix)
 * and exits 0 (all clear), 1 (warnings) or 2 (something blocks), for CI and
 * agents. The updater and the installer import `runUpPreflight` /
 * `runSetupPreflight` in-process and render the same rows in the terminal and
 * in the page.
 *
 * `--gate` (setup only) is the part that must run before the installer can even
 * load: Bun recent enough, and `node_modules` present. When the dependencies
 * are missing it runs `bun install` itself instead of telling the person to
 * (analysis §8 #4); the full checklist then runs inside the installer.
 *
 * Built-ins only (`node:*` and sibling files that are `node:*` too), proven by
 * `cli/lib/ui/imports.test.ts`: it is the one check that must work on a clone
 * with no `node_modules`.
 *
 * Shared file: byte-identical in agentic-qa-boilerplate and agentic-dev-boilerplate.
 */

import type { Check, Lang } from './lib/ui/events.ts';

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { playwrightBrowsersInstalled, playwrightCacheCandidates } from './lib/playwright-cache.ts';
import { formatBytes, freeBytes, isLocalSource, parseVersion, reachable, readJson, runCmd, versionAtLeast, worktreeInfo } from './lib/probes.ts';
import { BRAND } from './lib/ui/brand.ts';

export type Verdict = 'clear' | 'warn' | 'block';

export interface PreflightCheck extends Check {
  id: string
  /** The page phase that fails without it. */
  neededBy: string
  /** The command that fixes it, when there is one. */
  fix?: string
}

export interface PreflightResult {
  checks: PreflightCheck[]
  verdict: Verdict
  /** One line for the verdict bar. */
  text: string
  ms: number
}

export interface UpPreflightOptions {
  cwd: string
  /** `owner/repo` (through gh) or a local clone path (plain git, no gh session). */
  templateRepo: string
  /** Repo-relative path of the update lock. */
  lockFile: string
  lang: Lang
  /** Rows the caller adds (a pending cross-harness migration, for instance). */
  extra?: PreflightCheck[]
  /** Free-space threshold below which `disk` warns. Default 500 MB. */
  minFreeBytes?: number
}

const T = {
  es: {
    tools: 'Herramientas',
    net: 'Red',
    machine: 'Esta máquina',
    bunMsg: 'Instala Bun 1.0 o más nuevo: <code>curl -fsSL https://bun.sh/install | bash</code>.',
    nodeMsg: 'Los hooks de tu agente corren con Node. Instala Node 18+ (nodejs.org o <code>brew install node</code>). La actualización sigue sin él.',
    gitMissing: 'git no está instalado. El actualizador necesita git 2.25 o más nuevo.',
    gitOld: (v: string): string => `Tu git es ${v}. El actualizador necesita 2.25+: <code>brew upgrade git</code> / <code>apt install git</code>.`,
    ghMissing: 'El actualizador descarga el boilerplate con GitHub CLI. Instálalo (cli.github.com) y corre <code>gh auth login</code>.',
    ghAuth: 'GitHub CLI no tiene sesión. Corre <code>gh auth login</code> y vuelve a comprobar.',
    ghLocal: 'fuente local, no hace falta',
    netMsg: 'GitHub no responde. Revisa tu conexión o tu VPN; no se cambió nada.',
    wtMsg: (p: string): string => `Corre el actualizador en el checkout principal (<code>${p}</code>), no en un worktree. Los worktrees reciben la actualización cuando haces merge.`,
    wtOk: 'checkout principal',
    lockCorrupt: (f: string): string => `El lock de actualización está dañado. Restáuralo con <code>git checkout -- ${f}</code>.`,
    lockOld: 'Tu lock usa un formato anterior y se va a migrar (sin cambiar datos).',
    lockMissing: 'primera actualización',
    diskLow: 'Poco espacio para la descarga temporal y la copia de seguridad.',
    free: 'libres',
    clear: (n: number, s: string): string => `Todo listo: ${n} comprobaciones en ${s} s.`,
    warn: (n: number): string => `Nada bloquea. ${n} aviso(s): revisa las filas marcadas.`,
    block: (n: number): string => `${n} cosa(s) impiden empezar. Arréglalas y vuelve a comprobar; no se cambió nada.`,
  },
  en: {
    tools: 'Tools',
    net: 'Network',
    machine: 'This machine',
    bunMsg: 'Install Bun 1.0 or newer: <code>curl -fsSL https://bun.sh/install | bash</code>.',
    nodeMsg: 'Your agent\'s hooks run on Node. Install Node 18+ (nodejs.org or <code>brew install node</code>). The update continues without it.',
    gitMissing: 'git is not installed. The updater needs git 2.25 or newer.',
    gitOld: (v: string): string => `Your git is ${v}. The updater needs 2.25+: <code>brew upgrade git</code> / <code>apt install git</code>.`,
    ghMissing: 'The updater downloads the boilerplate with GitHub CLI. Install it (cli.github.com) and run <code>gh auth login</code>.',
    ghAuth: 'GitHub CLI has no session. Run <code>gh auth login</code> and check again.',
    ghLocal: 'local source, not needed',
    netMsg: 'GitHub does not answer. Check your connection or VPN; nothing was changed.',
    wtMsg: (p: string): string => `Run the updater from the main checkout (<code>${p}</code>), not from a worktree. Worktrees receive the update when you merge.`,
    wtOk: 'main checkout',
    lockCorrupt: (f: string): string => `The update lock is damaged. Restore it with <code>git checkout -- ${f}</code>.`,
    lockOld: 'Your lock uses an older format and will be migrated (no data changes).',
    lockMissing: 'first update',
    diskLow: 'Low disk space for the temporary download and the backup.',
    free: 'free',
    clear: (n: number, s: string): string => `All set: ${n} checks in ${s} s.`,
    warn: (n: number): string => `Nothing blocks. ${n} warning(s): see the marked rows.`,
    block: (n: number): string => `${n} thing(s) stop the start. Fix them and check again; nothing was changed.`,
  },
} as const;

export function verdictOf(checks: Check[]): Verdict {
  if (checks.some(c => c.state === 'block')) { return 'block'; }
  if (checks.some(c => c.state === 'warn')) { return 'warn'; }
  return 'clear';
}

export async function runUpPreflight(o: UpPreflightOptions): Promise<PreflightResult> {
  const t0 = Date.now();
  const L = T[o.lang];
  const local = isLocalSource(o.templateRepo);
  const checks: PreflightCheck[] = [];

  // Network first: it is the only slow probe, so it runs while the rest is checked.
  const net = local ? null : reachable('https://github.com', 3000);

  // Tools
  const bunV = process.versions.bun ?? '';
  checks.push(versionAtLeast(parseVersion(bunV), [1, 0, 0])
    ? { id: 'bun', group: L.tools, label: 'Bun', value: bunV, state: 'ok', neededBy: 'fetch' }
    : { id: 'bun', group: L.tools, label: 'Bun', value: bunV || '-', state: 'block', msg: L.bunMsg, neededBy: 'fetch' });

  // Warn, not block, for `up`: the updater itself never runs node, and CI
  // images built on Bun alone have none (preflight.md asks block for setup).
  const node = runCmd('node', ['--version'], { timeoutMs: 2000 });
  const nodeV = parseVersion(node.stdout);
  checks.push(node.ok && versionAtLeast(nodeV, [18, 0, 0])
    ? { id: 'node', group: L.tools, label: 'Node', value: node.stdout.replace(/^v/, ''), state: 'ok', neededBy: 'apply' }
    : { id: 'node', group: L.tools, label: 'Node', value: node.ok ? node.stdout : '-', state: 'warn', msg: L.nodeMsg, neededBy: 'apply' });

  const git = runCmd('git', ['--version'], { timeoutMs: 2000 });
  const gitV = parseVersion(git.stdout);
  if (!git.ok) {
    checks.push({ id: 'git-version', group: L.tools, label: 'git', value: '-', state: 'block', msg: L.gitMissing, neededBy: 'fetch' });
  }
  else if (!versionAtLeast(gitV, [2, 25, 0])) {
    checks.push({ id: 'git-version', group: L.tools, label: 'git', value: gitV?.join('.') ?? git.stdout, state: 'block', msg: L.gitOld(gitV?.join('.') ?? git.stdout), neededBy: 'fetch', fix: 'brew upgrade git' });
  }
  else {
    checks.push({ id: 'git-version', group: L.tools, label: 'git', value: gitV!.join('.'), state: 'ok', neededBy: 'fetch' });
  }

  if (local) {
    checks.push({ id: 'gh-auth', group: L.tools, label: 'GitHub CLI', value: L.ghLocal, state: 'info', neededBy: 'fetch' });
  }
  else {
    const gh = runCmd('gh', ['auth', 'status'], { timeoutMs: 4000 });
    if (gh.missing) {
      checks.push({ id: 'gh-auth', group: L.tools, label: 'GitHub CLI', value: '-', state: 'block', msg: L.ghMissing, neededBy: 'fetch' });
    }
    else if (!gh.ok) {
      checks.push({ id: 'gh-auth', group: L.tools, label: 'GitHub CLI', value: '-', state: 'block', msg: L.ghAuth, neededBy: 'fetch', fix: 'gh auth login' });
    }
    else {
      const ver = parseVersion(runCmd('gh', ['--version'], { timeoutMs: 2000 }).stdout);
      checks.push({ id: 'gh-auth', group: L.tools, label: 'GitHub CLI', value: ver ? ver.join('.') : 'ok', state: 'ok', neededBy: 'fetch' });
    }
  }

  // Machine
  const wt = worktreeInfo(o.cwd);
  if (wt?.linked) {
    checks.push({ id: 'worktree', group: L.machine, label: 'Checkout', value: 'worktree', state: 'block', msg: L.wtMsg(wt.primaryRoot ?? '…'), neededBy: 'fetch' });
  }
  else {
    checks.push({ id: 'worktree', group: L.machine, label: 'Checkout', value: L.wtOk, state: 'ok', neededBy: 'fetch' });
  }

  const lock = readJson(join(o.cwd, o.lockFile));
  if (lock.state === 'corrupt') {
    checks.push({ id: 'lock', group: L.machine, label: 'Lock', value: o.lockFile, state: 'block', msg: L.lockCorrupt(o.lockFile), neededBy: 'detect', fix: `git checkout -- ${o.lockFile}` });
  }
  else if (lock.state === 'missing') {
    checks.push({ id: 'lock', group: L.machine, label: 'Lock', value: L.lockMissing, state: 'info', neededBy: 'detect' });
  }
  else {
    const version = (lock.value as { schemaVersion?: unknown } | null)?.schemaVersion;
    checks.push(typeof version === 'number' && version < 7
      ? { id: 'lock', group: L.machine, label: 'Lock', value: `v${version}`, state: 'info', msg: L.lockOld, neededBy: 'detect' }
      : { id: 'lock', group: L.machine, label: 'Lock', value: typeof version === 'number' ? `v${version}` : 'ok', state: 'ok', neededBy: 'detect' });
  }

  const min = o.minFreeBytes ?? 500 * 1024 ** 2;
  const free = [freeBytes(tmpdir()), freeBytes(o.cwd)].filter((n): n is number => n !== null);
  const least = free.length ? Math.min(...free) : null;
  checks.push(least === null
    ? { id: 'disk', group: L.machine, label: 'Disco', value: '-', state: 'info', neededBy: 'apply' }
    : { id: 'disk', group: L.machine, label: o.lang === 'es' ? 'Disco' : 'Disk', value: `${formatBytes(least)} ${L.free}`, state: least < min ? 'warn' : 'ok', ...(least < min ? { msg: L.diskLow } : {}), neededBy: 'apply' });

  // Network
  if (net) {
    const r = await net;
    checks.push(r.ok
      ? { id: 'net-github', group: L.net, label: 'github.com', value: `${r.ms} ms`, state: 'ok', neededBy: 'fetch' }
      : { id: 'net-github', group: L.net, label: 'github.com', value: '-', state: 'block', msg: L.netMsg, neededBy: 'fetch' });
  }

  checks.push(...(o.extra ?? []));
  const verdict = verdictOf(checks);
  const ms = Date.now() - t0;
  const text = verdict === 'clear'
    ? L.clear(checks.length, (ms / 1000).toFixed(1).replace('.', o.lang === 'es' ? ',' : '.'))
    : verdict === 'warn'
      ? L.warn(checks.filter(c => c.state === 'warn').length)
      : L.block(checks.filter(c => c.state === 'block').length);
  return { checks, verdict, text, ms };
}

// ----------------------------------------------------------------------------
// `bun setup` (installer-ui preflight.md §2, delivery 3)
// ----------------------------------------------------------------------------

export interface SetupPreflightOptions {
  cwd: string
  lang: Lang
  env?: Record<string, string | undefined>
  /** HEAD probe; injectable so tests never touch the network. */
  reach?: (url: string, timeoutMs: number) => Promise<{ ok: boolean, ms: number }>
  /** Command probe; injectable for tests. */
  run?: typeof runCmd
  platform?: string
  /** Free-space thresholds (bytes): below `block` nothing starts, below `warn` it warns. */
  disk?: { block: number, warn: number }
}

/** The first line of the boilerplate maintainers' own `.agents/project.yaml` (twin of `cli/lib/agents-schema.ts`, which needs `yaml`). */
const MAINTAINER_SENTINEL = '# MAINTAINER COPY:';

const S = {
  es: {
    tools: 'Herramientas',
    agents: 'Agentes de IA',
    net: 'Red',
    machine: 'Esta máquina',
    bunMsg: 'Instala Bun 1.0 o más nuevo: <code>curl -fsSL https://bun.sh/install | bash</code> (macOS/Linux).',
    nodeMsg: 'Los hooks de tu agente corren con Node. Instala Node 18+ (nodejs.org o <code>brew install node</code>) y vuelve a comprobar.',
    gitMissing: 'git no está instalado. Instálalo (git-scm.com) y vuelve a comprobar.',
    gitIdentity: 'git no sabe quién eres, y lo necesita para tu primer commit y para subir a GitHub: <code>git config --global user.name "Tu nombre"</code> y <code>git config --global user.email tu@correo</code>.',
    repoMissing: (scaffolder: string): string => `No hay un <code>package.json</code> aquí. Corre <code>bun setup</code> desde la raíz del proyecto, o crea uno con <code>npx ${scaffolder}</code>.`,
    repoUnknown: (name: string): string => `Este proyecto se llama "${name}" y no tiene la marca de un proyecto creado desde el boilerplate. Si lo creaste con el scaffolder, está bien: la instalación deja la marca al terminar.`,
    templateCopy: 'Este proyecto todavía tiene la configuración del propio boilerplate (vino con "Use this template"). Empezamos desde una plantilla limpia antes de preguntar nada.',
    harnessNone: 'No encontramos ningún agente de IA. Instala al menos uno: Claude Code (<code>npm i -g @anthropic-ai/claude-code</code>), Codex, OpenCode o Pi, y vuelve a comprobar.',
    agentFound: 'encontrado',
    agentMissing: 'no encontrado',
    agentOptional: 'No hace falta: elige solo los que usa tu equipo.',
    acliMissing: 'La fase de Jira necesita la CLI de Atlassian: <code>brew tap atlassian/homebrew-acli && brew install acli</code>. Instálala y vuelve a comprobar, o sigue y Jira se salta.',
    acliSkipped: 'INSTALL_SKIP_JIRA=1: Jira no se configura',
    engramMissing: 'Opcional. Sin él la IA no recuerda sesiones anteriores: <code>brew install gentleman-programming/tap/engram</code>. Puedes instalarlo después y volver a correr el instalador.',
    engramOld: (v: string): string => `Tu Engram es ${v} y hace falta 3.0 o más nuevo: <code>brew upgrade engram</code>. Sin él se salta la memoria entre sesiones.`,
    engramSkipped: 'INSTALL_SKIP_ENGRAM=1: se salta',
    ghMissing: 'Solo hace falta para crear el repositorio en GitHub. Instálalo (cli.github.com) o elige "solo local" más adelante.',
    ghAuth: 'GitHub CLI no tiene sesión: <code>gh auth login</code>, o elige "solo local" más adelante.',
    opMissing: 'Tu proyecto guarda los secretos en 1Password: instala la CLI de 1Password (<code>brew install 1password-cli</code>) e inicia sesión con <code>op signin</code>. La instalación sigue; los servidores MCP no leerán la bóveda hasta entonces.',
    npmMsg: (need: boolean): string => need ? 'No llegamos al registro de npm, y las skills de la comunidad se descargan de ahí. Revisa tu conexión o tu proxy (<code>HTTPS_PROXY</code>) y vuelve a comprobar.' : 'No llegamos al registro de npm. Revisa tu conexión o tu proxy (<code>HTTPS_PROXY</code>).',
    githubMsg: (need: boolean): string => need ? 'GitHub no responde, y las skills de la comunidad se descargan de ahí. Revisa tu conexión o tu VPN y vuelve a comprobar.' : 'GitHub no responde: el paso de GitHub se va a saltar.',
    pwMsg: 'El servidor de descargas de Playwright no responde, y el navegador para los tests se descarga de ahí. Revisa tu conexión o tu proxy y vuelve a comprobar.',
    pwCached: 'ya descargado',
    atlassianMsg: (site: string): string => `${site} no responde. Revisa el sitio en <code>.agents/project.yaml</code> (issue_tracker.atlassian_url).`,
    diskBlock: (free: string): string => `Solo quedan ${free} libres. El navegador y las dependencias necesitan cerca de 1,1 GB.`,
    diskWarn: (free: string): string => `Quedan ${free} libres; el navegador y las dependencias usan cerca de 1,1 GB. Alcanza, pero justo.`,
    free: 'libres',
    sudoMsg: 'En Linux, Chromium necesita paquetes del sistema. Corre una vez: <code>sudo bunx playwright install-deps chromium</code>. El navegador en sí se instala sin sudo.',
    envPerms: 'permisos corregidos a 600',
    pythonMissing: (fix: string): string => `Solo para las páginas de evidencia (<code>/evidence-artifact</code>): Python 3.9 o más nuevo, y después Pillow: <code>${fix}</code>. La instalación no lo necesita.`,
    pythonOld: (v: string): string => `Tu Python es ${v} y las páginas de evidencia necesitan 3.9 o más nuevo. La instalación no lo necesita.`,
    pillowMissing: (fix: string): string => `Las páginas de evidencia (<code>/evidence-artifact</code>) necesitan Pillow: <code>${fix}</code>. La instalación no lo necesita.`,
    clear: (n: number, s: string): string => `Todo listo: ${n} comprobaciones en ${s} s.`,
    warn: (n: number): string => `Nada bloquea. ${n} aviso(s): revisa las filas marcadas; el paso que afectan se salta o queda pendiente.`,
    block: (n: number): string => `${n} cosa(s) impiden empezar. Arréglalas y vuelve a comprobar; no se cambió nada.`,
  },
  en: {
    tools: 'Tools',
    agents: 'AI agents',
    net: 'Network',
    machine: 'This machine',
    bunMsg: 'Install Bun 1.0 or newer: <code>curl -fsSL https://bun.sh/install | bash</code> (macOS/Linux).',
    nodeMsg: 'Your agent\'s hooks run on Node. Install Node 18+ (nodejs.org or <code>brew install node</code>) and check again.',
    gitMissing: 'git is not installed. Install it (git-scm.com) and check again.',
    gitIdentity: 'git does not know who you are, and needs to for your first commit and the GitHub push: <code>git config --global user.name "Your name"</code> and <code>git config --global user.email you@example.com</code>.',
    repoMissing: (scaffolder: string): string => `There is no <code>package.json</code> here. Run <code>bun setup</code> from the project root, or create one with <code>npx ${scaffolder}</code>.`,
    repoUnknown: (name: string): string => `This project is called "${name}" and has no marker of a project made from the boilerplate. If the scaffolder created it, that is fine: the install leaves the marker when it finishes.`,
    templateCopy: 'This project still carries the boilerplate\'s own settings (it came with "Use this template"). We start from a clean template before asking anything.',
    harnessNone: 'No AI agent was found. Install at least one: Claude Code (<code>npm i -g @anthropic-ai/claude-code</code>), Codex, OpenCode or Pi, and check again.',
    agentFound: 'found',
    agentMissing: 'not found',
    agentOptional: 'Not needed: pick only the ones your team uses.',
    acliMissing: 'The Jira phase needs the Atlassian CLI: <code>brew tap atlassian/homebrew-acli && brew install acli</code>. Install it and check again, or go on and Jira is skipped.',
    acliSkipped: 'INSTALL_SKIP_JIRA=1: Jira is not configured',
    engramMissing: 'Optional. Without it the AI does not remember earlier sessions: <code>brew install gentleman-programming/tap/engram</code>. You can install it later and run the installer again.',
    engramOld: (v: string): string => `Your Engram is ${v} and 3.0 or newer is needed: <code>brew upgrade engram</code>. Without it cross-session memory is skipped.`,
    engramSkipped: 'INSTALL_SKIP_ENGRAM=1: skipped',
    ghMissing: 'Only needed to create the GitHub repository. Install it (cli.github.com) or choose "local only" later.',
    ghAuth: 'GitHub CLI has no session: <code>gh auth login</code>, or choose "local only" later.',
    opMissing: 'Your project keeps secrets in 1Password: install the 1Password CLI (<code>brew install 1password-cli</code>) and sign in with <code>op signin</code>. The install goes on; the MCP servers will not read the vault until then.',
    npmMsg: (need: boolean): string => need ? 'The npm registry is unreachable, and the community skills download from it. Check your connection or proxy (<code>HTTPS_PROXY</code>) and check again.' : 'The npm registry is unreachable. Check your connection or proxy (<code>HTTPS_PROXY</code>).',
    githubMsg: (need: boolean): string => need ? 'GitHub does not answer, and the community skills download from it. Check your connection or VPN and check again.' : 'GitHub does not answer: the GitHub step will be skipped.',
    pwMsg: 'The Playwright download host does not answer, and the test browser downloads from it. Check your connection or proxy and check again.',
    pwCached: 'already downloaded',
    atlassianMsg: (site: string): string => `${site} does not answer. Check the site in <code>.agents/project.yaml</code> (issue_tracker.atlassian_url).`,
    diskBlock: (free: string): string => `Only ${free} free. The browser and the dependencies need about 1.1 GB.`,
    diskWarn: (free: string): string => `${free} free; the browser and the dependencies use about 1.1 GB. Enough, but tight.`,
    free: 'free',
    sudoMsg: 'On Linux Chromium needs system packages. Run once: <code>sudo bunx playwright install-deps chromium</code>. The browser itself installs without sudo.',
    envPerms: 'permissions fixed to 600',
    pythonMissing: (fix: string): string => `Only for the evidence pages (<code>/evidence-artifact</code>): Python 3.9 or newer, then Pillow: <code>${fix}</code>. The install does not need it.`,
    pythonOld: (v: string): string => `Your Python is ${v} and the evidence pages need 3.9 or newer. The install does not need it.`,
    pillowMissing: (fix: string): string => `The evidence pages (<code>/evidence-artifact</code>) need Pillow: <code>${fix}</code>. The install does not need it.`,
    clear: (n: number, s: string): string => `All set: ${n} checks in ${s} s.`,
    warn: (n: number): string => `Nothing blocks. ${n} warning(s): see the marked rows; the step each one affects is skipped or left pending.`,
    block: (n: number): string => `${n} thing(s) stop the start. Fix them and check again; nothing was changed.`,
  },
} as const;

/** `issue_tracker.atlassian_url` and `secrets.provider` out of the yaml, without a yaml parser (node built-ins only). */
export function readYamlScalars(text: string): { atlassianUrl: string | null, secretsProvider: string | null } {
  let section = '';
  let atlassianUrl: string | null = null;
  let secretsProvider: string | null = null;
  for (const raw of text.split('\n')) {
    const top = /^([a-z_]+):\s*(?:#.*)?$/.exec(raw);
    if (top) { section = top[1]; continue; }
    const leaf = /^ {2}([a-z_]+):(.*)$/.exec(raw);
    if (!leaf) { continue; }
    const hash = leaf[2].search(/\s#/);
    const value = (hash >= 0 ? leaf[2].slice(0, hash) : leaf[2]).trim().replace(/^['"]|['"]$/g, '');
    const v = value === '' || value === 'null' || value === '~' ? null : value;
    if (section === 'issue_tracker' && leaf[1] === 'atlassian_url') { atlassianUrl = v; }
    if (section === 'secrets' && leaf[1] === 'provider') { secretsProvider = v; }
  }
  return { atlassianUrl, secretsProvider };
}

function truthyEnv(v: string | undefined): boolean {
  return v === '1';
}

/**
 * Python 3.9+ with Pillow, the evidence builder's interpreter. Twin of
 * `pythonCandidates` / `pillowInstall` in `cli/lib/evidence-page/python.ts`,
 * which this file cannot import: its graph is `node:*` only, and the sibling
 * boilerplate has no evidence pages (`BRAND.prereqs` leaves the row out there).
 * Information only: nothing in the install needs it.
 */
export function pythonCheck(run: typeof runCmd, platform: string, lang: Lang): PreflightCheck {
  const L = S[lang];
  const candidates = platform === 'win32' ? [['py', '-3'], ['python3'], ['python']] : [['python3'], ['python']];
  const fix = platform === 'win32' ? 'py -m pip install pillow' : 'python3 -m pip install pillow';
  // Same words as `pillowInstall`: a Homebrew or distro Python refuses a bare pip install (PEP 668).
  const hint = platform === 'win32'
    ? fix
    : platform === 'darwin'
      ? `${fix} (Homebrew Python: brew install pillow, or a venv)`
      : `${fix} (a distro Python: your package manager's python3-pil, or a venv)`;
  const row = { id: 'python', group: L.tools, label: 'Python + Pillow', neededBy: 'evidence' };
  for (const argv of candidates) {
    const probe = run(argv[0], [...argv.slice(1), '-c', 'import sys; print("%d.%d" % sys.version_info[:2]); import PIL'], { timeoutMs: 5000 });
    const v = parseVersion(probe.stdout.split('\n')[0] ?? '');
    if (v === null) { continue; }
    const version = `${v[0]}.${v[1]}`;
    if (!versionAtLeast(v, [3, 9, 0])) { return { ...row, value: version, state: 'info', msg: L.pythonOld(version) }; }
    return probe.ok
      ? { ...row, value: version, state: 'ok' }
      : { ...row, value: `${version}, no Pillow`, state: 'info', msg: L.pillowMissing(hint), fix };
  }
  return { ...row, value: '-', state: 'info', msg: L.pythonMissing(hint), fix };
}

function onPath(run: typeof runCmd, bin: string): boolean {
  const r = run(process.platform === 'win32' ? 'where' : 'which', [bin], { timeoutMs: 2000 });
  return r.ok && r.stdout.length > 0;
}

export async function runSetupPreflight(o: SetupPreflightOptions): Promise<PreflightResult> {
  const t0 = Date.now();
  const L = S[o.lang];
  const env = o.env ?? process.env;
  const run = o.run ?? runCmd;
  const reach = o.reach ?? reachable;
  const platform = o.platform ?? process.platform;
  const checks: PreflightCheck[] = [];

  const state = readJson(join(o.cwd, '.template', 'installer.state.json'));
  const steps = (state.state === 'ok' ? (state.value as { steps?: Record<string, string> } | null)?.steps : null) ?? {};
  const yamlPath = join(o.cwd, '.agents', 'project.yaml');
  const yamlText = existsSync(yamlPath) ? readFileSync(yamlPath, 'utf8') : '';
  const yaml = readYamlScalars(yamlText);
  const skipJira = truthyEnv(env.INSTALL_SKIP_JIRA);
  // Step keys of both installers (QA `9-skills-community-project`, Dev `communitySkillsProjectRanAt`).
  const skillsDone = Boolean(steps['9-skills-community-project'] || steps.communitySkillsProjectRanAt);
  const forceSkills = truthyEnv(env.INSTALL_FORCE_COMMUNITY) || truthyEnv(env.INSTALL_FORCE_COMMUNITY_SKILLS);
  const needsSkills = BRAND.setupDownloads.includes('skills') && !truthyEnv(env.INSTALL_SKIP_COMMUNITY) && (!skillsDone || forceSkills);
  const needsChromium = BRAND.setupDownloads.includes('chromium') && !truthyEnv(env.INSTALL_SKIP_PLAYWRIGHT) && !(steps['6-playwright'] && playwrightBrowsersInstalled());

  const site = !skipJira && yaml.atlassianUrl ? yaml.atlassianUrl.replace(/\/+$/, '') : null;

  // Tools
  const bunV = process.versions.bun ?? '';
  checks.push(versionAtLeast(parseVersion(bunV), [1, 0, 0])
    ? { id: 'bun', group: L.tools, label: 'Bun', value: bunV, state: 'ok', neededBy: 'install' }
    : { id: 'bun', group: L.tools, label: 'Bun', value: bunV || '-', state: 'block', msg: L.bunMsg, neededBy: 'install' });

  const node = run('node', ['--version'], { timeoutMs: 2000 });
  const nodeV = parseVersion(node.stdout);
  checks.push(node.ok && versionAtLeast(nodeV, [18, 0, 0])
    ? { id: 'node', group: L.tools, label: 'Node', value: node.stdout.replace(/^v/, ''), state: 'ok', neededBy: 'team' }
    : { id: 'node', group: L.tools, label: 'Node', value: node.ok ? node.stdout : '-', state: 'block', msg: L.nodeMsg, neededBy: 'team' });

  const git = run('git', ['--version'], { timeoutMs: 2000 });
  if (!git.ok) {
    checks.push({ id: 'git', group: L.tools, label: 'git', value: '-', state: 'block', msg: L.gitMissing, neededBy: 'install' });
  }
  else {
    const email = run('git', ['config', 'user.email'], { cwd: o.cwd, timeoutMs: 2000 });
    const name = run('git', ['config', 'user.name'], { cwd: o.cwd, timeoutMs: 2000 });
    const gitV = parseVersion(git.stdout)?.join('.') ?? git.stdout;
    checks.push(email.ok && email.stdout && name.ok && name.stdout
      ? { id: 'git', group: L.tools, label: 'git', value: gitV, state: 'ok', neededBy: 'github' }
      : { id: 'git', group: L.tools, label: 'git', value: gitV, state: 'warn', msg: L.gitIdentity, neededBy: 'github', fix: 'git config --global user.email you@example.com' });
  }

  if (skipJira) {
    checks.push({ id: 'acli', group: L.tools, label: 'Atlassian CLI (acli)', value: L.acliSkipped, state: 'info', neededBy: 'jira' });
  }
  else if (onPath(run, 'acli')) {
    const v = parseVersion(run('acli', ['--version'], { timeoutMs: 3000 }).stdout);
    checks.push({ id: 'acli', group: L.tools, label: 'Atlassian CLI (acli)', value: v ? v.join('.') : 'ok', state: 'ok', neededBy: 'jira' });
  }
  else {
    checks.push({ id: 'acli', group: L.tools, label: 'Atlassian CLI (acli)', value: '-', state: 'warn', msg: L.acliMissing, neededBy: 'jira', fix: 'brew tap atlassian/homebrew-acli && brew install acli' });
  }

  if (truthyEnv(env.INSTALL_SKIP_ENGRAM) || truthyEnv(env.INSTALL_SKIP_GENTLE_AI)) {
    checks.push({ id: 'engram', group: L.tools, label: 'Engram', value: L.engramSkipped, state: 'info', neededBy: 'install' });
  }
  else if (!onPath(run, 'engram')) {
    checks.push({ id: 'engram', group: L.tools, label: 'Engram', value: '-', state: 'warn', msg: L.engramMissing, neededBy: 'install', fix: 'brew install gentleman-programming/tap/engram' });
  }
  else {
    const v = parseVersion(run('engram', ['version'], { timeoutMs: 2000 }).stdout);
    checks.push(versionAtLeast(v, [3, 0, 0])
      ? { id: 'engram', group: L.tools, label: 'Engram', value: v!.join('.'), state: 'ok', neededBy: 'install' }
      : { id: 'engram', group: L.tools, label: 'Engram', value: v ? v.join('.') : '?', state: 'warn', msg: L.engramOld(v ? v.join('.') : '?'), neededBy: 'install', fix: 'brew upgrade engram' });
  }

  if (!onPath(run, 'gh')) {
    checks.push({ id: 'gh', group: L.tools, label: 'GitHub CLI', value: '-', state: 'warn', msg: L.ghMissing, neededBy: 'github' });
  }
  else {
    const auth = run('gh', ['auth', 'status'], { timeoutMs: 4000 });
    const v = parseVersion(run('gh', ['--version'], { timeoutMs: 2000 }).stdout);
    checks.push(auth.ok
      ? { id: 'gh', group: L.tools, label: 'GitHub CLI', value: v ? v.join('.') : 'ok', state: 'ok', neededBy: 'github' }
      : { id: 'gh', group: L.tools, label: 'GitHub CLI', value: v ? v.join('.') : '-', state: 'warn', msg: L.ghAuth, neededBy: 'github', fix: 'gh auth login' });
  }

  if (yaml.secretsProvider === '1password') {
    const ok = onPath(run, 'op') && run('op', ['whoami'], { timeoutMs: 3000 }).ok;
    checks.push(ok
      ? { id: 'op', group: L.tools, label: '1Password CLI', value: 'ok', state: 'ok', neededBy: 'creds' }
      : { id: 'op', group: L.tools, label: '1Password CLI', value: '-', state: 'warn', msg: L.opMissing, neededBy: 'creds', fix: 'op signin' });
  }

  if (BRAND.prereqs?.includes('python')) { checks.push(pythonCheck(run, platform, o.lang)); }

  // AI agents: at least one, or there is nothing to configure.
  const home = env.HOME ?? env.USERPROFILE ?? '';
  const claude = onPath(run, 'claude') || (home !== '' && existsSync(join(home, '.claude')));
  const opencode = onPath(run, 'opencode') || (home !== '' && existsSync(join(home, '.config', 'opencode')));
  const codex = onPath(run, 'codex') || existsSync(join(o.cwd, '.codex', 'config.toml'));
  const pi = onPath(run, 'pi') || (home !== '' && existsSync(join(home, '.pi', 'agent')));
  const agentRow = (id: string, label: string, found: boolean): PreflightCheck => found
    ? { id, group: L.agents, label, value: L.agentFound, state: 'ok', neededBy: 'team' }
    : { id, group: L.agents, label, value: L.agentMissing, state: 'info', msg: L.agentOptional, neededBy: 'team' };
  if (!claude && !opencode && !codex && !pi) {
    checks.push({ id: 'harness', group: L.agents, label: 'Claude Code / Codex / OpenCode / Pi', value: '-', state: 'block', msg: L.harnessNone, neededBy: 'team' });
  }
  else {
    checks.push(agentRow('agent-claude', 'Claude Code', claude), agentRow('agent-codex', 'Codex', codex), agentRow('agent-opencode', 'OpenCode', opencode), agentRow('agent-pi', 'Pi', pi));
  }

  // This machine
  const pkgPath = join(o.cwd, 'package.json');
  if (!existsSync(pkgPath)) {
    checks.push({ id: 'repo', group: L.machine, label: 'Proyecto', value: '-', state: 'block', msg: L.repoMissing(`create-${(BRAND.templateRepo.split('/').pop() ?? '').replace(/-boilerplate$/, '')}`), neededBy: 'team' });
  }
  else {
    const pkg = readJson(pkgPath);
    const name = pkg.state === 'ok' ? String((pkg.value as { name?: unknown } | null)?.name ?? '') : '';
    const upstream = BRAND.templateRepo.split('/').pop() ?? '';
    const marker = readJson(join(o.cwd, '.template', 'installer.lock.json'));
    const marked = marker.state === 'ok' && (marker.value as { template?: unknown } | null)?.template === BRAND.templateRepo;
    const shaped = existsSync(join(o.cwd, 'cli', 'install.ts')) && existsSync(yamlPath);
    const label = o.lang === 'en' ? 'Project' : 'Proyecto';
    checks.push(name === upstream || marked || shaped
      ? { id: 'repo', group: L.machine, label, value: name || '-', state: 'ok', neededBy: 'team' }
      : { id: 'repo', group: L.machine, label, value: name || '-', state: 'warn', msg: L.repoUnknown(name || '-'), neededBy: 'team' });
  }

  if (yamlText.split('\n').some(l => l.startsWith(MAINTAINER_SENTINEL))) {
    const origin = run('git', ['remote', 'get-url', 'origin'], { cwd: o.cwd, timeoutMs: 2000 });
    const originName = origin.ok ? origin.stdout.trim().replace(/\/+$/, '').replace(/\.git$/, '').split(/[/:]/).pop() : null;
    if (originName !== (BRAND.templateRepo.split('/').pop() ?? '')) {
      checks.push({ id: 'template-copy', group: L.machine, label: '.agents/project.yaml', value: o.lang === 'en' ? 'boilerplate copy' : 'copia del boilerplate', state: 'info', msg: L.templateCopy, neededBy: 'team' });
    }
  }

  const disk = o.disk ?? { block: 400 * 1024 ** 2, warn: 1200 * 1024 ** 2 };
  const cache = playwrightCacheCandidates().find(p => existsSync(p)) ?? null;
  const free = [freeBytes(o.cwd), cache ? freeBytes(cache) : null].filter((n): n is number => n !== null);
  const least = free.length ? Math.min(...free) : null;
  const diskLabel = o.lang === 'en' ? 'Disk' : 'Disco';
  if (least === null) {
    checks.push({ id: 'disk', group: L.machine, label: diskLabel, value: '-', state: 'info', neededBy: 'install' });
  }
  else {
    const f = formatBytes(least);
    checks.push(least < disk.block
      ? { id: 'disk', group: L.machine, label: diskLabel, value: `${f} ${L.free}`, state: 'block', msg: L.diskBlock(f), neededBy: 'install' }
      : least < disk.warn
        ? { id: 'disk', group: L.machine, label: diskLabel, value: `${f} ${L.free}`, state: 'warn', msg: L.diskWarn(f), neededBy: 'install' }
        : { id: 'disk', group: L.machine, label: diskLabel, value: `${f} ${L.free}`, state: 'ok', neededBy: 'install' });
  }

  if (platform === 'linux' && needsChromium) {
    checks.push({ id: 'playwright-sudo', group: L.machine, label: 'Chromium (Linux)', value: 'sudo', state: 'warn', msg: L.sudoMsg, neededBy: 'install', fix: 'sudo bunx playwright install-deps chromium' });
  }

  const envPath = join(o.cwd, '.env');
  if (existsSync(envPath) && platform !== 'win32') {
    try {
      if ((statSync(envPath).mode & 0o077) !== 0) {
        chmodSync(envPath, 0o600);
        checks.push({ id: 'env-perms', group: L.machine, label: '.env', value: L.envPerms, state: 'info', neededBy: 'creds' });
      }
    }
    catch { /* best effort */ }
  }

  // Network (owner answer Q2: the downloads run while questions are asked, so they must be able to succeed).
  // Probed together, after the command probes: those block the event loop and would inflate the timings.
  const [npm, gh, pw, siteR] = await Promise.all([
    reach('https://registry.npmjs.org', 3000),
    reach('https://github.com', 3000),
    needsChromium ? reach('https://cdn.playwright.dev', 3000) : null,
    site ? reach(`${site}/status`, 3000) : null,
  ]);
  checks.push(npm.ok
    ? { id: 'net-npm', group: L.net, label: 'registry.npmjs.org', value: `${npm.ms} ms`, state: 'ok', neededBy: 'install' }
    : { id: 'net-npm', group: L.net, label: 'registry.npmjs.org', value: '-', state: needsSkills ? 'block' : 'warn', msg: L.npmMsg(needsSkills), neededBy: 'install' });
  checks.push(gh.ok
    ? { id: 'net-github', group: L.net, label: 'github.com', value: `${gh.ms} ms`, state: 'ok', neededBy: 'install' }
    : { id: 'net-github', group: L.net, label: 'github.com', value: '-', state: needsSkills ? 'block' : 'warn', msg: L.githubMsg(needsSkills), neededBy: needsSkills ? 'install' : 'github' });
  if (pw) {
    checks.push(pw.ok
      ? { id: 'net-playwright', group: L.net, label: 'cdn.playwright.dev', value: `${pw.ms} ms`, state: 'ok', neededBy: 'install' }
      : { id: 'net-playwright', group: L.net, label: 'cdn.playwright.dev', value: '-', state: 'block', msg: L.pwMsg, neededBy: 'install' });
  }
  else if (BRAND.setupDownloads.includes('chromium')) {
    checks.push({ id: 'net-playwright', group: L.net, label: 'Chromium', value: L.pwCached, state: 'ok', neededBy: 'install' });
  }
  if (site && siteR) {
    const host = site.replace(/^https?:\/\//, '');
    checks.push(siteR.ok
      ? { id: 'net-atlassian', group: L.net, label: host, value: `${siteR.ms} ms`, state: 'ok', neededBy: 'jira' }
      : { id: 'net-atlassian', group: L.net, label: host, value: '-', state: 'warn', msg: L.atlassianMsg(host), neededBy: 'jira' });
  }

  const verdict = verdictOf(checks);
  const ms = Date.now() - t0;
  const text = verdict === 'clear'
    ? L.clear(checks.length, (ms / 1000).toFixed(1).replace('.', o.lang === 'es' ? ',' : '.'))
    : verdict === 'warn'
      ? L.warn(checks.filter(c => c.state === 'warn').length)
      : L.block(checks.filter(c => c.state === 'block').length);
  return { checks, verdict, text, ms };
}

/** Dependencies the installer itself needs to load (its own UI, yaml). */
export function depsPresent(cwd: string): boolean {
  return ['@clack/prompts', 'yaml', 'picocolors'].every(p => existsSync(join(cwd, 'node_modules', p, 'package.json')));
}

/**
 * `bun setup` step one: what must hold before `cli/install.ts` can load.
 * Bun recent enough, and the dependencies on disk: when they are missing it runs
 * `bun install` itself (analysis §8 #4). Returns the exit code.
 */
export async function runSetupGate(o: { cwd: string, lang: Lang, write?: (s: string) => void, install?: () => number }): Promise<number> {
  const write = o.write ?? ((s: string) => { process.stdout.write(s); });
  const es = o.lang === 'es';
  if (!versionAtLeast(parseVersion(process.versions.bun ?? ''), [1, 0, 0])) {
    write(`✖ ${plainMsg(S[o.lang].bunMsg)}\n`);
    return 2;
  }
  if (depsPresent(o.cwd)) { return 0; }
  write(es ? '● Faltan las dependencias del proyecto: corriendo bun install…\n' : '● Project dependencies are missing: running bun install…\n');
  const code = o.install ? o.install() : (spawnSync('bun', ['install'], { cwd: o.cwd, stdio: 'inherit' }).status ?? 1);
  if (code !== 0 || !depsPresent(o.cwd)) {
    write(es
      ? '✖ bun install no terminó. Revisa tu conexión (registry.npmjs.org) y vuelve a correr: bun setup\n'
      : '✖ bun install did not finish. Check your connection (registry.npmjs.org) and run again: bun setup\n');
    return 2;
  }
  write(es ? '✔ Dependencias instaladas.\n' : '✔ Dependencies installed.\n');
  return 0;
}

/** Markup-free text of a row message, for the terminal. */
export function plainMsg(msg: string): string {
  return msg.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** The checklist as the `--json` format: one object per row. */
export function preflightJson(r: PreflightResult): { verdict: Verdict, checks: { id: string, group: string, verdict: Check['state'], observed: string, needed_by: string, fix: string | null, message: string | null }[] } {
  return {
    verdict: r.verdict,
    checks: r.checks.map(c => ({ id: c.id, group: c.group ?? '', verdict: c.state, observed: c.value ?? '', needed_by: c.neededBy, fix: c.fix ?? null, message: c.msg ? plainMsg(c.msg) : null })),
  };
}

export function exitCodeOf(v: Verdict): number {
  return v === 'block' ? 2 : v === 'warn' ? 1 : 0;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const forIdx = argv.indexOf('--for');
  const target = forIdx >= 0 ? argv[forIdx + 1] : 'up';
  if (target !== 'up' && target !== 'setup') {
    process.stderr.write(`preflight: --for ${target} is not a command (use "setup" or "up").\n`);
    process.exit(2);
  }
  const env = process.env;
  const lang: Lang = (env.LC_ALL || env.LC_MESSAGES || env.LANG || '').toLowerCase().startsWith('en') ? 'en' : 'es';
  if (target === 'setup' && argv.includes('--gate')) {
    process.exit(await runSetupGate({ cwd: process.cwd(), lang }));
  }
  const r = target === 'setup'
    ? await runSetupPreflight({ cwd: process.cwd(), lang })
    : await runUpPreflight({
        cwd: process.cwd(),
        templateRepo: env.UPEX_TEMPLATE_REPO || BRAND.templateRepo,
        lockFile: '.template/boilerplate.lock.json',
        lang,
      });
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(preflightJson(r), null, 2)}\n`);
  }
  else {
    for (const c of r.checks) {
      const g = c.state === 'ok' ? '✔' : c.state === 'warn' ? '▲' : c.state === 'block' ? '✖' : '–';
      process.stdout.write(`${g} ${c.label}  ${c.value ?? ''}${c.msg ? `\n    ${plainMsg(c.msg)}` : ''}\n`);
    }
    process.stdout.write(`${plainMsg(r.text)}\n`);
  }
  process.exit(exitCodeOf(r.verdict));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
