#!/usr/bin/env bun
/**
 * sync-jira-components.ts — reconcile a Jira project's Components against a plan.
 *
 * Components are the product-module axis of the three-axis model
 * (`agentic-qa-core/references/defect-management-doctrine.md` Part 3): mandatory
 * on every Bug / Defect / Improvement and on every Test, and the grouping key for
 * every coverage dashboard. The convention is one component = one functional
 * module of the running application, derived from the app's real surface (routes,
 * features), NOT from the planning taxonomy — an Epic is a unit of work, a
 * component is a unit of the system, and a filter is only as useful as it
 * discriminates.
 *
 * `acli` cannot touch components (`acli/SKILL.md` §Hard limits), so this speaks
 * the REST API directly — the same escape hatch `jira-attach-media.ts` uses.
 *
 * WHY A PLAN FILE, NOT AUTODETECTION: deriving modules from a codebase is a
 * judgement call (which routes collapse into one module? what is the product's
 * own vocabulary?), so an AI reading the target repo authors the plan and a human
 * approves it. This script only executes what the plan says, which is what makes
 * the result reviewable before it reaches a production Jira.
 *
 * Plan shape (JSON):
 *   {
 *     "project": "BK",
 *     "rename": [{ "from": "Bugs & Defect Heatmap", "to": "Bunkai Bugs" }],
 *     "create": [{ "name": "Bunkai Auth", "description": "..." }]
 *   }
 *
 * A rename PRESERVES every existing issue assignment — that is the whole reason
 * it is a separate operation from create. Renaming is also how an existing
 * component migrates to a new convention without a bulk issue edit.
 *
 * Usage:
 *   bun scripts/sync-jira-components.ts <plan.json>            # dry run (default)
 *   bun scripts/sync-jira-components.ts <plan.json> --apply    # write to Jira
 *   bun scripts/sync-jira-components.ts --list --project BK   # show current state
 *
 * Env: ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN, and the host per the
 * instance-identity anchor (`.agents/project.yaml` → issue_tracker.atlassian_url,
 * falling back to ATLASSIAN_URL).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';

const PROJECT_YAML_PATH = join(import.meta.dir, '..', '.agents', 'project.yaml');

interface JiraComponent {
  id: string
  name: string
  description?: string
  issueCount?: number
}

interface ComponentPlan {
  project?: string
  rename?: Array<{ from: string, to: string, description?: string }>
  create?: Array<{ name: string, description?: string }>
}

interface Conn {
  baseUrl: string
  email: string
  token: string
  project: string
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

/**
 * Resolves the Atlassian host per the instance-identity anchor: the versioned
 * yaml wins, the env var is a fallback, and a disagreement is reported rather
 * than silently resolved. A stale host does not fail loudly — it happily syncs
 * against a dead site and exits 0 — which is why the yaml is authoritative.
 */
function resolveHost(): string {
  let yamlUrl: string | null = null;
  if (existsSync(PROJECT_YAML_PATH)) {
    try {
      const parsed = parseYaml(readFileSync(PROJECT_YAML_PATH, 'utf8')) as Record<string, unknown> | null;
      const tracker = parsed?.issue_tracker as Record<string, unknown> | undefined;
      const raw = tracker?.atlassian_url;
      if (typeof raw === 'string' && raw.trim() !== '') { yamlUrl = raw.trim(); }
    }
    catch { /* fall through to env */ }
  }
  const envUrl = process.env.ATLASSIAN_URL?.trim() || null;

  if (yamlUrl && envUrl && yamlUrl.replace(/\/$/, '') !== envUrl.replace(/\/$/, '')) {
    console.warn(`⚠ Host disagreement — project.yaml says ${yamlUrl}, ATLASSIAN_URL says ${envUrl}. Using the yaml.`);
  }
  const chosen = yamlUrl ?? envUrl;
  if (!chosen) {
    throw new Error('No Atlassian host. Set `issue_tracker.atlassian_url` in .agents/project.yaml (or ATLASSIAN_URL).');
  }
  return chosen.replace(/\/$/, '');
}

function getConn(projectOverride?: string): Conn {
  const email = process.env.ATLASSIAN_EMAIL?.trim();
  const token = process.env.ATLASSIAN_API_TOKEN?.trim();
  if (!email || !token) {
    throw new Error('Missing ATLASSIAN_EMAIL / ATLASSIAN_API_TOKEN.');
  }

  let project = projectOverride ?? process.env.JIRA_PROJECT_KEY?.trim() ?? '';
  if (!project && existsSync(PROJECT_YAML_PATH)) {
    try {
      const parsed = parseYaml(readFileSync(PROJECT_YAML_PATH, 'utf8')) as Record<string, unknown> | null;
      const proj = parsed?.project as Record<string, unknown> | undefined;
      const raw = proj?.project_key;
      if (typeof raw === 'string' && raw.trim() !== '') { project = raw.trim(); }
    }
    catch { /* handled below */ }
  }
  if (!project) {
    throw new Error('No project key. Pass it in the plan, or set JIRA_PROJECT_KEY / project.project_key.');
  }

  return { baseUrl: resolveHost(), email, token, project };
}

async function api<T>(conn: Conn, path: string, init: RequestInit = {}): Promise<T> {
  const auth = Buffer.from(`${conn.email}:${conn.token}`).toString('base64');
  const res = await fetch(`${conn.baseUrl}${path}`, {
    ...init,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

async function listComponents(conn: Conn): Promise<JiraComponent[]> {
  return api<JiraComponent[]>(conn, `/rest/api/3/project/${conn.project}/components`);
}

/** Issues currently carrying a component — what a rename preserves and a delete would orphan. */
async function issueCount(conn: Conn, componentId: string): Promise<number> {
  const body = JSON.stringify({ jql: `project=${conn.project} AND component=${componentId}` });
  const res = await api<{ count?: number }>(conn, '/rest/api/3/search/approximate-count', { method: 'POST', body });
  return res.count ?? 0;
}

interface PlannedOp {
  kind: 'rename' | 'create' | 'skip'
  name: string
  detail: string
  issues?: number
  id?: string
  description?: string
}

/**
 * Resolves the plan against the project's live components.
 *
 * Every decision is made here, before anything is written, so `--apply` executes
 * a list a human has already read. A rename whose target name already exists, or
 * whose source is gone, degrades to a skip with the reason attached rather than
 * erroring — re-running a partly-applied plan is the normal case, not a fault.
 */
async function planOps(conn: Conn, plan: ComponentPlan): Promise<PlannedOp[]> {
  const live = await listComponents(conn);
  const byName = new Map(live.map(c => [c.name, c]));
  const ops: PlannedOp[] = [];
  const claimed = new Set<string>();

  for (const r of plan.rename ?? []) {
    const src = byName.get(r.from);
    if (!src) {
      ops.push({ kind: 'skip', name: r.to, detail: `source "${r.from}" not found — already renamed?` });
      continue;
    }
    if (byName.has(r.to)) {
      ops.push({ kind: 'skip', name: r.to, detail: `target name already exists (id ${byName.get(r.to)?.id})` });
      continue;
    }
    ops.push({
      kind: 'rename',
      name: r.to,
      detail: `"${r.from}" → "${r.to}"`,
      issues: await issueCount(conn, src.id),
      id: src.id,
      description: r.description,
    });
    claimed.add(r.to);
  }

  for (const c of plan.create ?? []) {
    if (byName.has(c.name) || claimed.has(c.name)) {
      ops.push({ kind: 'skip', name: c.name, detail: 'already exists' });
      continue;
    }
    ops.push({ kind: 'create', name: c.name, detail: 'new component', description: c.description });
  }

  return ops;
}

async function applyOps(conn: Conn, ops: PlannedOp[]): Promise<void> {
  for (const op of ops) {
    if (op.kind === 'skip') { continue; }
    if (op.kind === 'rename') {
      const body: Record<string, string> = { name: op.name };
      if (op.description) { body.description = op.description; }
      await api(conn, `/rest/api/3/component/${op.id}`, { method: 'PUT', body: JSON.stringify(body) });
      console.log(`  ✔ renamed → ${op.name}  (${op.issues} issue assignment(s) preserved)`);
    }
    else {
      await api(conn, '/rest/api/3/component', {
        method: 'POST',
        body: JSON.stringify({ name: op.name, description: op.description ?? '', project: conn.project }),
      });
      console.log(`  ✔ created  → ${op.name}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const wantList = args.includes('--list');
  const projectIdx = args.indexOf('--project');
  const projectFlag = projectIdx >= 0 ? args[projectIdx + 1] : undefined;
  const planPath = args.find((a, i) => !a.startsWith('--') && i !== projectIdx + 1);

  if (wantList) {
    const conn = getConn(projectFlag);
    const live = await listComponents(conn);
    console.log(`\n${live.length} component(s) in ${conn.project}:\n`);
    for (const c of live) {
      console.log(`  ${c.id.padStart(6)}  ${c.name.padEnd(40)} ${await issueCount(conn, c.id)} issue(s)`);
    }
    console.log('');
    return;
  }

  if (!planPath) {
    console.error('Usage: bun scripts/sync-jira-components.ts <plan.json> [--apply]   |   --list');
    process.exit(1);
  }
  if (!existsSync(planPath)) {
    console.error(`Plan not found: ${planPath}`);
    process.exit(1);
  }

  const plan = JSON.parse(readFileSync(planPath, 'utf8')) as ComponentPlan;
  const conn = getConn(projectFlag ?? plan.project);
  const ops = await planOps(conn, plan);

  const renames = ops.filter(o => o.kind === 'rename');
  const creates = ops.filter(o => o.kind === 'create');
  const skips = ops.filter(o => o.kind === 'skip');

  console.log(`\n${apply ? 'APPLYING' : 'DRY RUN'} — project ${conn.project} @ ${conn.baseUrl}\n`);

  if (renames.length > 0) {
    console.log(`RENAME (${renames.length}) — issue assignments are preserved:`);
    for (const o of renames) { console.log(`  ${o.detail.padEnd(62)} ${o.issues} issue(s)`); }
    console.log('');
  }
  if (creates.length > 0) {
    console.log(`CREATE (${creates.length}):`);
    for (const o of creates) { console.log(`  ${o.name}`); }
    console.log('');
  }
  if (skips.length > 0) {
    console.log(`SKIP (${skips.length}):`);
    for (const o of skips) { console.log(`  ${o.name.padEnd(40)} ${o.detail}`); }
    console.log('');
  }

  if (!apply) {
    console.log('Nothing written. Re-run with --apply to execute.\n');
    return;
  }

  await applyOps(conn, ops);
  console.log(`\nDone — ${renames.length} renamed, ${creates.length} created, ${skips.length} skipped.\n`);
}

export { planOps, resolveHost };

if (import.meta.main) {
  main().catch((err: unknown) => {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
