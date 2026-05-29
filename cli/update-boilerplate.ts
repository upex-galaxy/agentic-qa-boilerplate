#!/usr/bin/env bun
/**
 * @fileoverview UPEX QA Boilerplate Updater v7 — thin wrapper.
 *
 * Drives the 5-phase delta sync via `runUpdate` in `./lib/updater-core.ts`.
 * Repo-specific concerns (QA component registry, skills sub-command,
 * rollback flag) live here; everything else lives in core.
 */

import type { Component, ReportSink, UpdaterConfig } from './lib/updater-types';
import { execSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import pc from 'picocolors';
import * as tui from './lib/tui';
import { cleanupTempDir, detectGitVersion, gitVersionMeetsMin, runUpdate } from './lib/updater-core';

// --- CONFIGURATION ---
const CLI_VERSION = '7.0';
const TEMPLATE_REPO = 'upex-galaxy/agentic-qa-boilerplate';
const TEMP_DIR = path.join(os.tmpdir(), 'kata-boilerplate-update');
const VERSION_FILE = '.template/boilerplate.lock.json';

const TOOLING_FILES = ['.editorconfig', '.prettierrc', '.gitattributes'];
const AGENTS_DOCS_FILES = ['README.md'];
const CLAUDE_CONFIG_FILES = ['settings.json'];

/**
 * Canonical skills location (Claude Code) and portability symlink target.
 * Codex / Copilot / Cursor / OpenCode resolve skills from the same source.
 */
const SKILLS_CANONICAL_DIR = path.join('.claude', 'skills');

const COMPONENTS: Component[] = [
  { name: 'skills', type: 'directory', paths: ['.claude/skills'] },
  { name: 'commands', type: 'directory', paths: ['.claude/commands'] },
  { name: 'scripts', type: 'directory', paths: ['scripts'] },
  { name: 'templates', type: 'directory', paths: ['templates'] },
  { name: 'docs', type: 'directory', paths: ['docs'] },
  { name: 'cli', type: 'directory', paths: ['cli'] },
  { name: 'vscode', type: 'directory', paths: ['.vscode'] },
  { name: 'husky', type: 'directory', paths: ['.husky'] },
  { name: 'agents-docs', type: 'file-list', paths: ['.agents'], files: AGENTS_DOCS_FILES },
  { name: 'claude-config', type: 'file-list', paths: ['.claude'], files: CLAUDE_CONFIG_FILES },
  { name: 'tooling', type: 'file-list', paths: ['.'], files: TOOLING_FILES },
];

// --- ARG PARSE ---
interface ParsedArgs {
  commands: string[]
  skills: string[] | null
  listSkills: boolean
  help: boolean
  dryRun: boolean
  rollback: boolean
  auto: boolean
  force: boolean
}

function parseArgs(args: string[]): ParsedArgs {
  const out: ParsedArgs = {
    commands: [],
    skills: null,
    listSkills: false,
    help: false,
    dryRun: false,
    rollback: false,
    auto: false,
    force: false,
  };
  const valid = new Set(COMPONENTS.map(c => c.name).concat(['all', 'help', 'rollback']));
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === 'help' || a === '--help' || a === '-h') { out.help = true; }
    else if (a === '--auto') { out.auto = true; }
    else if (a === '--dry-run') { out.dryRun = true; }
    else if (a === '--rollback' || a === 'rollback') { out.rollback = true; }
    else if (a === '--force') { out.force = true; }
    else if (a === '--list') { out.listSkills = true; }
    else if (a === '--skill' || a === '--skills') {
      const next = args[i + 1];
      if (!next || next.startsWith('-')) {
        tui.log.error('--skill requiere lista: --skill nombre1,nombre2');
        process.exit(1);
      }
      out.skills = next.split(',').map(s => s.trim()).filter(Boolean);
      if (out.skills.length === 0) {
        tui.log.error('--skill requiere al menos un nombre de skill.');
        process.exit(1);
      }
      i++;
    }
    else if (valid.has(a)) { out.commands.push(a); }
    else if (!a.startsWith('-')) { tui.log.error(`Comando/componente desconocido: ${a}. Usa --help para ver los validos.`); process.exit(1); }
  }
  return out;
}

// --- HELP ---
const HELP_TEXT = `
UPEX QA Boilerplate Updater v${CLI_VERSION} — Ayuda

USO:
  bun up [comando] [flags]

COMPONENTES: ${COMPONENTS.map(c => c.name).join(', ')}
ATAJOS:      all, rollback, help

FLAGS:
  --auto                 Modo no-interactivo (CI)
  --dry-run              Preview, sin escribir
  --rollback             Restaura backup mas reciente
  --skill a,b,c          Sincroniza solo los skills indicados (subcomando skills)
  --list                 Lista los skills disponibles en el template
  --help, -h             Esta ayuda

EJEMPLOS:
  bun up                                 # Flujo interactivo (5 fases)
  bun up skills                          # Solo agent skills
  bun up skills --skill a,b,c            # Skills especificos
  bun up --list                          # Listar skills disponibles
  bun up commands docs                   # Multiples componentes
  bun up --auto                          # CI mode
  bun up --dry-run                       # Preview
  bun up --rollback                      # Restaurar backup
`;

// --- PREREQ ---
function ensureGitVersion(): void {
  try {
    const v = detectGitVersion();
    if (!gitVersionMeetsMin(v)) {
      tui.log.error(`git ${v.raw} detectado. Se requiere git >= 2.25.0.`);
      process.exit(2);
    }
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    tui.log.error(msg === 'GIT_NOT_FOUND' ? 'git no encontrado. Se requiere git >= 2.25.' : `git: ${msg}`);
    process.exit(2);
  }
}

async function validatePrerequisites(): Promise<void> {
  try { execSync('gh --version', { stdio: 'ignore' }); }
  catch { tui.log.error('GitHub CLI (gh) no instalado.'); process.exit(1); }
  try { execSync('gh auth status', { stdio: 'ignore' }); }
  catch { tui.log.error('GitHub CLI no autenticado. Ejecuta: gh auth login'); process.exit(1); }
}

// --- ROLLBACK ---
function rollbackFromBackup(): void {
  const backupsDir = '.backups';
  if (!fs.existsSync(backupsDir)) { tui.log.error('No hay backups (.backups/ ausente).'); process.exit(1); }
  const backups = fs.readdirSync(backupsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.startsWith('update-'))
    .map(d => d.name)
    .sort()
    .reverse();
  if (backups.length === 0) { tui.log.error('No hay backups en .backups/'); process.exit(1); }
  const latest = backups[0];
  tui.log.info(`Restaurando desde: ${latest}`);
  let restored = 0;
  const walk = (src: string, dst: string): void => {
    for (const it of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, it.name);
      const d = path.join(dst, it.name);
      if (it.isDirectory()) { fs.mkdirSync(d, { recursive: true }); walk(s, d); }
      else { fs.cpSync(s, d); restored++; }
    }
  };
  try {
    walk(path.join(backupsDir, latest), process.cwd());
    tui.log.success(`Restaurados ${restored} archivos desde ${latest}`);
  }
  catch (err) {
    tui.log.error(`Rollback fallido: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

// --- SKILLS RESOLVER (used by --list short-circuit and runtime hook) ---
function resolveTemplateSkills(templateDir: string): string[] {
  const skillsRoot = path.join(templateDir, SKILLS_CANONICAL_DIR);
  if (!fs.existsSync(skillsRoot)) { return []; }
  return fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();
}

async function cloneTemplateForReadOnly(): Promise<void> {
  if (fs.existsSync(TEMP_DIR)) { fs.rmSync(TEMP_DIR, { recursive: true, force: true }); }
  try {
    execSync(`gh repo clone ${TEMPLATE_REPO} "${TEMP_DIR}" -- --depth 1 --quiet`, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 });
  }
  catch (err) {
    tui.log.error(`Error clonando: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

// --- LIST SKILLS (standalone --list flag) ---
async function listAvailableSkills(): Promise<void> {
  tui.log.step('Listando skills disponibles en el template…');
  await validatePrerequisites();
  await cloneTemplateForReadOnly();
  const skills = resolveTemplateSkills(TEMP_DIR);
  if (skills.length === 0) {
    tui.log.warn(`No se encontraron skills en ${SKILLS_CANONICAL_DIR}/ del template.`);
    cleanupTempDir(TEMP_DIR);
    return;
  }
  process.stdout.write(`\n${pc.bold('Skills disponibles:')}\n`);
  for (const skill of skills) { process.stdout.write(`  ${pc.cyan(skill)}\n`); }
  process.stdout.write(`\n${pc.dim(`Total: ${skills.length} skill${skills.length === 1 ? '' : 's'}`)}\n`);
  tui.log.info('Uso: bun run up skills --skill <nombre[,nombre,...]>');
  cleanupTempDir(TEMP_DIR);
}

// --- SKILL FILTER (validates --skill list against template) ---
async function resolveSkillFilter(skills: string[]): Promise<Component[]> {
  await cloneTemplateForReadOnly();
  const available = resolveTemplateSkills(TEMP_DIR);
  const availableSet = new Set(available);
  const missing = skills.filter(s => !availableSet.has(s));
  if (missing.length > 0) {
    cleanupTempDir(TEMP_DIR);
    tui.log.error(`Skill(s) no encontrados en el template: ${missing.join(', ')}`);
    tui.log.info(`Disponibles: ${available.join(', ')}`);
    process.exit(1);
  }
  cleanupTempDir(TEMP_DIR);
  const selectedPaths = skills.map(s => path.join(SKILLS_CANONICAL_DIR, s));
  return [{ name: 'skills', type: 'directory', paths: selectedPaths }];
}

// --- SINK ---
function abortOnCancel<T>(v: T | symbol): T {
  if (tui.isCancel(v)) {
    throw Object.assign(new Error('Aborted by user.'), { name: 'ExitPromptError' });
  }
  return v;
}

function buildSink(): ReportSink {
  return {
    phase: (n, label) => tui.phaseHeader(n, label),
    subphase: (label) => {
      const text = `── ${label} ──`;
      process.stdout.write(`\n${pc.dim(pc.cyan(text))}\n\n`);
    },
    step: msg => tui.log.info(msg),
    warn: msg => tui.log.warn(msg),
    error: msg => tui.log.error(msg),
    spinner: () => tui.spinner(),

    confirm: async (message, defaultValue = false) => {
      const r = await tui.confirm({ message, initialValue: defaultValue });
      return abortOnCancel<boolean>(r);
    },

    pickScopes: async (scopes) => {
      if (scopes.length === 0) { return []; }
      const options = scopes.map(s => ({
        value: s.name,
        label: `${s.name} (${s.changedCount} cambiados${s.divergedCount > 0 ? `, ${s.divergedCount} divergente${s.divergedCount > 1 ? 's' : ''}` : ''})`,
      }));
      const r = await tui.multiselect({ message: 'Selecciona componentes a revisar:', options, required: false });
      return abortOnCancel<string[]>(r);
    },

    pickScopeStrategy: async (scope, stats) => {
      const divergedSuffix = stats.divergedCount > 0
        ? `, ${stats.divergedCount} divergente${stats.divergedCount > 1 ? 's' : ''}`
        : '';
      const locSuffix = (stats.addedTotal || stats.removedTotal)
        ? `, +${stats.addedTotal}/-${stats.removedTotal} líneas`
        : '';
      const r = await tui.select({
        message: `${scope} (${stats.changedCount} archivo(s)${divergedSuffix}${locSuffix}) — ¿como proceder?`,
        options: [
          { value: 'all', label: `aceptar todos (${stats.changedCount})` },
          { value: 'pick', label: 'elegir individualmente' },
          { value: 'skip', label: 'saltar scope completo' },
        ],
        initialValue: 'all',
      });
      return abortOnCancel<string>(r) as 'all' | 'pick' | 'skip';
    },

    pickFiles: async (scope, files) => {
      if (files.length === 0) { return []; }
      const options = files.map(f => ({ value: f.entry.path, label: f.label, hint: f.entry.classification }));
      const r = await tui.multiselect({ message: `Selecciona archivos en ${scope}:`, options, required: false });
      const selected = new Set(abortOnCancel<string[]>(r));
      return files.filter(f => selected.has(f.entry.path)).map(f => f.entry);
    },

    pickIgnoreLines: async (file, options) => {
      if (options.length === 0) { return []; }
      const opts = options.map(o => ({ value: o.value, label: o.label }));
      const initialValues = options.filter(o => o.checked).map(o => o.value);
      const r = await tui.multiselect({
        message: `${file} — líneas nuevas en upstream (no en tu archivo):`,
        options: opts,
        initialValues,
        required: false,
      });
      return abortOnCancel<string[]>(r);
    },

    resolveDiverged: async (entry, diff) => {
      const body = `=== Cambios upstream ===\n${diff.templateDiff.trim() || '(sin diff)'}\n\n=== Tus cambios locales ===\n${diff.localDiff.trim() || '(sin diff)'}`;
      tui.note(body, `Divergencia en ${entry.path}`);
      const r = await tui.select({
        message: '¿Como resolver?',
        options: [
          { value: 'skip', label: 'skip (predeterminado — preservar tu version)' },
          { value: 'theirs', label: 'theirs (descartar locales, usar upstream)' },
          { value: 'mine', label: 'mine (conservar tu version explicitamente)' },
        ],
        initialValue: 'skip',
      });
      return abortOnCancel<string>(r) as 'skip' | 'theirs' | 'mine';
    },

    confirmDelete: async (entry) => {
      const r = await tui.confirm({ message: `¿Eliminar ${entry.path} localmente? (upstream lo borro)`, initialValue: false });
      return abortOnCancel<boolean>(r);
    },

    showDiff: async (entry, diff) => {
      const isNew = entry.classification === 'new-upstream';
      const ask = await tui.confirm({
        message: isNew
          ? `Ver preview de contenido upstream para ${entry.path}?`
          : `Ver diff de ${entry.path} antes de aplicar?`,
        initialValue: false,
      });
      if (!abortOnCancel<boolean>(ask)) { return; }

      const PREVIEW_LIMIT = 40;
      const DIFF_LIMIT = 80;

      let body: string;
      let title: string;
      let limit: number;

      if (isNew) {
        title = `Nuevo archivo: ${entry.path}`;
        body = diff.templateDiff.trim() || '(contenido vacío)';
        limit = PREVIEW_LIMIT;
      }
      else {
        title = `Diff: ${entry.path}`;
        const t = diff.templateDiff.trim() || '(sin diff)';
        const l = diff.localDiff.trim() || '(sin diff)';
        body = `=== Upstream (template) ===\n${t}\n\n=== Local ===\n${l}`;
        limit = DIFF_LIMIT;
      }

      // Strip ANSI to render cleanly inside clack note box.
      // eslint-disable-next-line no-control-regex
      const plain = body.replace(/\x1B\[[0-9;]*m/g, '');
      const lines = plain.split('\n');
      const truncated = lines.length > limit;
      const shown = truncated
        ? `${lines.slice(0, limit).join('\n')}\n... ${lines.length - limit} línea(s) más`
        : plain;

      tui.note(shown, title);

      if (truncated) {
        const openExternal = await tui.confirm({
          message: 'Abrir contenido completo en editor externo?',
          initialValue: false,
        });
        if (abortOnCancel<boolean>(openExternal)) {
          const tmp = path.join(os.tmpdir(), `upex-diff-${process.pid}-${Date.now()}.txt`);
          fs.writeFileSync(tmp, plain);
          const editor = process.env.EDITOR || process.env.VISUAL || (process.platform === 'win32' ? 'notepad' : 'less');
          try { spawnSync(editor, [tmp], { stdio: 'inherit' }); }
          catch { tui.log.warn(`No se pudo abrir ${editor}. Contenido en: ${tmp}`); return; }
          finally {
            try { fs.rmSync(tmp, { force: true }); }
            catch { /* ignore */ }
          }
        }
      }
    },
  };
}

// --- MAIN ---
async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.help) { process.stdout.write(HELP_TEXT); process.exit(0); }
  if (parsed.rollback) { rollbackFromBackup(); process.exit(0); }
  if (parsed.listSkills) { await listAvailableSkills(); process.exit(0); }

  ensureGitVersion();
  await validatePrerequisites();

  // Filter components if sub-commands passed (e.g. `bun run up scripts`).
  let components = COMPONENTS;
  if (parsed.commands.length > 0 && !parsed.commands.includes('all')) {
    const requested = new Set(parsed.commands);
    components = COMPONENTS.filter(c => requested.has(c.name));
    if (components.length === 0) {
      tui.log.error('Ningun componente valido. Usa --help.');
      process.exit(1);
    }
  }

  // --skill a,b,c filter — narrow `skills` component to selected subdirs.
  if (parsed.skills !== null) {
    const skillsSelected = await resolveSkillFilter(parsed.skills);
    components = skillsSelected;
  }

  const cfg: UpdaterConfig = {
    templateRepo: TEMPLATE_REPO,
    cliVersion: CLI_VERSION,
    tempDir: TEMP_DIR,
    versionFile: VERSION_FILE,
    components,
    ignoreFiles: ['.gitignore', '.prettierignore'].map(p => ({ path: p, sentinel: '# ===== Synced from boilerplate' })),
    packageJsonSpecs: [
      { path: 'package.json', sections: ['scripts', 'devDependencies'] },
    ],
    deprecatedFiles: [],
    bootstrapOnlyPaths: [
      '.agents/project.yaml',
      '.agents/jira-fields.json',
      '.agents/jira-workflows.json',
      '.agents/jira-link-types.json',
      '.agents/jira-required.yaml',
    ],
    selfUpdateComponent: 'cli',
    hooks: {
      skillsResolver: resolveTemplateSkills,
    },
  };

  tui.intro(tui.headline(`UPEX QA Boilerplate Updater v${CLI_VERSION}`));

  const summary = await runUpdate(cfg, buildSink(), {
    auto: parsed.auto,
    dryRun: parsed.dryRun,
    rollback: false,
    force: parsed.force,
  });

  process.stdout.write(`${tui.successBox([
    `Aplicados:    ${summary.applied.length}`,
    `Saltados:     ${summary.skipped.length}`,
    `Con error:    ${summary.failed.length}`,
    `Avanzados:    ${summary.componentsAdvanced.join(', ') || '(ninguno)'}`,
    `Retenidos:    ${summary.componentsHeldBack.join(', ') || '(ninguno)'}`,
  ])}\n`);

  tui.outro(parsed.dryRun ? 'Dry-run completado.' : 'Sincronizacion completada.');
}

main().catch((err: unknown) => {
  if (err instanceof Error && err.name === 'ExitPromptError') {
    tui.cancel('Aborted by user.');
    process.exit(130);
  }
  tui.log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
