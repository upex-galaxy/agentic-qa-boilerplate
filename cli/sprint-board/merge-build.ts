/* eslint-disable ts/no-explicit-any -- a line-by-line port of a jq program over untyped GitHub, git and Orca JSON */
/**
 * Builds the Merge Line fact documents from one reading. PURE: no fs, no network, no clock other
 * than `now`. The TypeScript port of the source repo's `gitflow-build.jq`, same output, so
 * `merge.ts` and `merge-read.ts` read it unchanged; `merge-collect.ts` gathers the reading.
 *
 * Output: { snapshotId, collectedAt, reason, docs: { 'meta/state': ..., 'prs/96': ... },
 *           openPrs, closedPrs, denominators, summary }
 *
 * Changed from the source (DEVIATIONS.md): the ticket key comes from `board.ticket_key_pattern`;
 * tracker parity reads the board's bucket (`board.statuses`) instead of a fixed status name; the
 * mainline, the required approvals and the timezone come from the config.
 */

type J = Record<string, any>;

/** One open PR's raw GitHub reading. */
export interface PrReading {
  pr: J
  reviews: J[]
  rcomments: J[]
  icomments: J[]
  events: J[]
  checks: J
  status: J
  threads: { resolved: boolean, author: string }[]
  files: string[]
}

/** The git facts the collector computed for the open PRs. */
export interface GitReading {
  pr: Record<string, { behind: number | null, ahead: number | null, merge: 'clean' | 'conflict' | 'unknown', mainFiles: string[] }>
  pairs: { a: number, b: number, conflict: boolean }[]
  mainSha: string
}

/** A ticket named by a PR, as the board's last tracker read has it. */
export interface TrackerRow { status: string, bucket?: string }

export interface Reading {
  pulls: J[]
  closed: J[]
  prs: Record<string, PrReading>
  git: GitReading
  /** `git for-each-ref` rows: [name, upstream, track, committer date]. */
  refs: string[][]
  /** [branch, behind main, ahead of main] per local branch. */
  refCounts: string[][]
  /** `git worktree list` rows: [path, branch]. */
  worktrees: string[][]
  orcaWorktrees: J
  orcaTerminals: J
  /** `git ls-remote --heads` rows: [sha, ref]. */
  lsRemote: string[][]
  /** The account `gh` reads as. */
  viewer: string
  tracker: Record<string, TrackerRow>
}

export interface BuildParams {
  now: string
  snap: string
  reason: string
  mode: 'wake' | 'boot' | 'close'
  /** `git` | `github` when a source failed this run, else ''. */
  degraded: string
  todayStart: string
  today: string
  nextOpen: string
  mainBranch: string
  repo: string
  timezone: string
  winOpen: string
  winClose: string
  days: string
  heartbeatSec: number
  requiredApprovals: number
  /** Unanchored ticket key regex source (`board.ticket_key_pattern` without ^ and $). */
  ticketKey: string
  handle: string
  mailbox: 'on' | 'off'
  usage: J | null
}

export interface BuildOutput {
  snapshotId: string
  collectedAt: string
  reason: string
  docs: Record<string, J>
  openPrs: string[]
  closedPrs: string[]
  denominators: J
  summary: { hard: string[], soft: string[], alerts: string[], comments: { n: number, by: string, at: string, body: string }[] }
}

/** Buckets where a ticket QA closed sits; an open PR into the mainline that names it is out of step. */
const QA_CLOSED_BUCKETS = new Set(['tested', 'dropped']);
const EXPECTED_WHILE_OPEN = 'in review or in test';

// ---------------------------------------------------------------- jq helpers

const ts2e = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') { return null; }
  const t = Date.parse(String(v).replace(/\.\d+Z$/, 'Z'));
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
};
const isbot = (v: unknown) => /\[bot\]$/.test(String(v ?? '')) || v === 'dependabot';
const CLEAN_RE = /no (?:blocking |new )?(?:issues|findings|problems|blockers|concerns) (?:were )?found|no blockers|no issues|lgtm|looks good/i;
const FAILING_CONCLUSIONS = ['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure'];
const CLAUDE = /claude/i;
const CLAUDE_REVIEW = /claude.*review/i;
const arr = <T = J>(v: unknown): T[] => (Array.isArray(v) ? v as T[] : []);
/** jq `max` over strings: null for an empty list. */
const maxStr = (xs: (string | null | undefined)[]): string | null => {
  const ys = xs.filter((x): x is string => typeof x === 'string');
  return ys.length ? ys.reduce((a, b) => (b > a ? b : a)) : null;
};
/** The newest check run per check name (latest `started_at`, then the higher id), in first-seen order. */
const latestPerName = (runs: J[]): J[] => {
  const latest = new Map<string, J>();
  for (const c of runs) {
    const k = String(c.name ?? '');
    const prev = latest.get(k);
    const s = String(c.started_at ?? '');
    const ps = String(prev?.started_at ?? '');
    if (!prev || s > ps || (s === ps && Number(c.id) > Number(prev.id))) { latest.set(k, c); }
  }
  return [...latest.values()];
};
/** jq `unique`: sorted, distinct. */
const unique = (xs: string[]): string[] => [...new Set(xs)].sort();
/** jq `tonumber?`: a number, or null for '' and anything that does not parse. */
const num = (v: string | undefined): number | null => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Weekdays (Mon-Fri, UTC) strictly after `from` up to `to`, one per whole day elapsed. */
export function businessDays(from: number | null, to: number | null): number {
  if (from === null || to === null || to <= from) { return 0; }
  let n = 0;
  const whole = Math.floor((to - from) / 86400);
  for (let i = 1; i <= whole; i++) {
    const d = new Date((from + i * 86400) * 1000).getUTCDay();
    if (d >= 1 && d <= 5) { n++; }
  }
  return n;
}

const ticketsIn = (text: string, key: string): string[] => unique([...text.matchAll(new RegExp(key, 'g'))].map(m => m[0]));

export function buildDocuments(r: Reading, p: BuildParams, prev: J | null): BuildOutput {
  const nowE = ts2e(p.now)!;
  const P: J = prev?.docs ?? {};
  const pstate: J = P['meta/state'] ?? {};
  const pday: J = P['meta/day'] ?? {};
  const palerts: J[] = arr(P['meta/alerts']?.items);
  const open = r.pulls;
  const closedList = r.closed;
  const R = r.prs;
  const G = r.git ?? { pr: {}, pairs: [], mainSha: '' };
  const tracker = r.tracker;
  const remoteNames = r.lsRemote.map(x => (x[1] ?? '').replace(/^refs\/heads\//, ''));
  const worktrees = r.worktrees.map(x => ({ path: x[0], branch: x[1] ?? '' }));
  const wtName: Record<string, string | null> = Object.fromEntries(arr(r.orcaWorktrees?.result?.worktrees).map(w => [w.path, w.displayName ?? null]));
  const wtPaths = worktrees.map(w => w.path);
  const terms = arr(r.orcaTerminals?.result?.terminals)
    .filter(t => wtPaths.includes(t.worktreePath))
    .map(t => ({ title: String(t.title ?? '').replace(/^[^A-Z0-9#]+/i, ''), handle: t.handle, worktreePath: t.worktreePath }));
  const wtref = (path: string) => ({ path, name: wtName[path] ?? path.split('/').at(-1) });
  const termsOf = (path: string) => terms.filter(t => t.worktreePath === path).map(t => ({ title: t.title, handle: t.handle }));

  // ---------------------------------------------------------------- per-PR facts
  const buildPr = (n: string): J => {
    const rr = R[n];
    const pr = rr.pr;
    const author = pr.user?.login;
    const base = pr.base?.ref;
    const head = pr.head?.ref;
    const feeder = base !== p.mainBranch;
    // checks: the newest run of each check on the head, except the review bot's own run; an older run
    // that a later run of the same check superseded (a concurrency cancel, a re-run) no longer counts
    const runs = latestPerName(arr(rr.checks?.check_runs).filter(c => !CLAUDE_REVIEW.test(c.name ?? '')));
    const sts = arr(rr.status?.statuses);
    const pending = runs.filter(c => c.status !== 'completed').length + sts.filter(s => s.state === 'pending').length;
    const failing = [
      ...runs.filter(c => c.status === 'completed' && FAILING_CONCLUSIONS.includes(c.conclusion)).map(c => c.name),
      ...sts.filter(s => s.state === 'failure' || s.state === 'error').map(s => s.context),
    ];
    const total = runs.length + sts.length;
    const checks = {
      ...(total === 0
        ? { lamp: 'off', code: 'none' }
        : failing.length > 0
          ? { lamp: 'st', code: 'failing' }
          : pending > 0 ? { lamp: 'ca', code: 'pending' } : { lamp: 'go', code: 'green' }),
      total,
      failing: failing.slice(0, 5),
      pending,
      at: maxStr(runs.map(c => c.completed_at)),
    };
    // review: the latest claude review run on this head, and its items on all three surfaces
    const reviewRuns = arr(rr.checks?.check_runs).filter(c => CLAUDE_REVIEW.test(c.name ?? '')).sort((a, b) => String(a.started_at ?? '').localeCompare(String(b.started_at ?? '')));
    const run = reviewRuns.at(-1) ?? null;
    let review: J;
    if (run === null) {
      review = { lamp: 'off', code: 'none', open: 0, runSha: null, lastRunAt: null };
    }
    else if (run.status !== 'completed') {
      review = { lamp: 'ca', code: 'running', open: 0, runSha: pr.head?.sha, lastRunAt: run.started_at };
    }
    else {
      const t0 = ts2e(run.started_at) ?? 0;
      const bthreads = arr<{ resolved: boolean, author: string }>(rr.threads).filter(t => CLAUDE.test(t.author ?? ''));
      const ics = [...arr(rr.icomments)].sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
      const plain = ics.filter(c => CLAUDE.test(c.user?.login ?? '') && (ts2e(c.created_at) ?? 0) >= t0 && !CLEAN_RE.test(c.body ?? ''));
      const rsum = arr(rr.reviews).filter(v => CLAUDE.test(v.user?.login ?? '') && (ts2e(v.submitted_at) ?? 0) >= t0 && (v.body ?? '') !== '' && !CLEAN_RE.test(v.body ?? ''));
      const unanswered = [...plain, ...rsum].filter((x) => {
        const at = ts2e(x.created_at ?? x.submitted_at) ?? 0;
        return !ics.some(c => !CLAUDE.test(c.user?.login ?? '') && (ts2e(c.created_at) ?? 0) > at);
      });
      const openN = bthreads.filter(t => !t.resolved).length + unanswered.length;
      const items = bthreads.length + plain.length + rsum.length;
      review = {
        ...(items === 0 ? { lamp: 'go', code: 'clean' } : openN === 0 ? { lamp: 'go', code: 'answered' } : { lamp: 'ca', code: 'open' }),
        open: openN,
        runSha: pr.head?.sha,
        lastRunAt: run.completed_at ?? run.started_at,
      };
    }
    // approval: computed from people, never from reviewDecision
    const byLogin = new Map<string, J[]>();
    for (const v of arr(rr.reviews)) {
      const login = v.user?.login;
      if (login === author || isbot(login) || !['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(v.state)) { continue; }
      byLogin.set(login, [...(byLogin.get(login) ?? []), v]);
    }
    const latest = [...byLogin.keys()].sort().map(l => byLogin.get(l)!.sort((a, b) => String(a.submitted_at ?? '').localeCompare(String(b.submitted_at ?? ''))).at(-1)!);
    const approvedBy = latest.filter(v => v.state === 'APPROVED').map(v => v.user.login);
    const changesBy = latest.filter(v => v.state === 'CHANGES_REQUESTED').map(v => v.user.login);
    const requested = arr(pr.requested_reviewers).map(x => x.login).filter(Boolean).map((l: string) => ({
      login: l,
      since: maxStr(arr(rr.events).filter(e => e.event === 'review_requested' && e.requested_reviewer?.login === l).map(e => e.created_at)) ?? pr.created_at,
    }));
    const approval = {
      ...(feeder
        ? { ...(checks.lamp === 'go' && review.lamp === 'go' ? { lamp: 'go' } : { lamp: 'ca' }), code: 'self_merge' }
        : changesBy.length > 0
          ? { lamp: 'st', code: 'changes' }
          : approvedBy.length >= p.requiredApprovals
            ? { lamp: 'go', code: 'approved' }
            : requested.length > 0 ? { lamp: 'ca', code: 'requested' } : { lamp: 'off', code: 'nobody' }),
      requested,
      approvedBy,
      changesBy,
      required: p.requiredApprovals,
    };
    const lamps = [checks.lamp, review.lamp, approval.lamp];
    let cleared = 0;
    for (const l of lamps) { if (l !== 'go') { break; } cleared++; }
    const g = G.pr?.[n] ?? {} as Partial<GitReading['pr'][string]>;
    // a ticket NAMED in the branch or title carries a tracker expectation; one only MENTIONED in the
    // body is listed without one (a trunk PR's body names every ticket it carries)
    const tks = ticketsIn(`${head} ${pr.title ?? ''}`, p.ticketKey);
    const mentioned = ticketsIn(pr.body ?? '', p.ticketKey).filter(t => !tks.includes(t));
    // owner: checkout > title > sticky > bot > none
    const co = worktrees.find(w => w.branch === head);
    const titleRe = new RegExp(`(^|[^0-9])#?${n}([^0-9]|$)`);
    const tt = terms.filter(t => titleRe.test(t.title) || t.title.includes(head));
    const po = P[`prs/${n}`]?.owner ?? null;
    let o: J;
    if (co) { o = { basis: 'checkout', worktree: wtref(co.path), terminals: termsOf(co.path) }; }
    else if (tt.length > 0) { o = { basis: 'title', worktree: wtref(tt[0].worktreePath), terminals: tt.map(t => ({ title: t.title, handle: t.handle })) }; }
    else if (po !== null && ['checkout', 'title', 'sticky'].includes(po.basis) && (nowE - (ts2e(po.since) ?? 0)) < 7 * 86400) { o = { basis: 'sticky', worktree: po.worktree, terminals: po.worktree ? termsOf(po.worktree.path) : [], since: po.since }; }
    else if (isbot(author)) { o = { basis: 'bot', worktree: null, terminals: [] }; }
    else { o = { basis: 'none', worktree: null, terminals: [] }; }
    const owner = { ...o, since: o.since ?? (po !== null && po.basis === o.basis && (po.worktree?.path ?? '') === (o.worktree?.path ?? '') ? po.since : p.now) };
    return {
      schema: 1,
      snapshotId: p.snap,
      collectedAt: p.now,
      n: Number(n),
      state: 'open',
      draft: pr.draft ?? false,
      title: pr.title,
      url: pr.html_url,
      author,
      authorIsBot: isbot(author),
      base,
      head,
      headSha: pr.head?.sha,
      feeder,
      trunkPr: open.find(x => x.head?.ref === base)?.number ?? null,
      openedAt: pr.created_at,
      updatedAt: pr.updated_at,
      mergedAt: null,
      mergedBy: null,
      closedAt: null,
      size: { files: pr.changed_files ?? arr(rr.files).length, add: pr.additions ?? 0, del: pr.deletions ?? 0 },
      labels: arr(pr.labels).map(l => l.name),
      assignees: arr(pr.assignees).map(a => a.login),
      behindMain: g.behind ?? null,
      aheadMain: g.ahead ?? null,
      mergePrediction: g.merge ?? 'unknown',
      gates: { checks, review, approval },
      cleared,
      lamp: lamps.includes('st') ? 'st' : lamps.every(l => l === 'go') ? 'go' : 'ca',
      tickets: [
        ...tks.map((tk) => {
          const row = tracker[tk];
          const s = row?.status ?? null;
          const e = feeder ? null : EXPECTED_WHILE_OPEN;
          return { tk, status: s, expected: e, ok: e === null || row === undefined ? null : !QA_CLOSED_BUCKETS.has(row.bucket ?? '') };
        }),
        ...mentioned.map(tk => ({ tk, status: tracker[tk]?.status ?? null, expected: null, ok: null, mentioned: true })),
      ],
      owner,
    };
  };

  const openNs = open.map(x => String(x.number));
  const prevPrNs = Object.keys(P).sort().filter(k => k.startsWith('prs/')).map(k => k.slice('prs/'.length));
  const goneNs = prevPrNs.filter(x => !openNs.includes(x));
  const openDocs: Record<string, J> = Object.fromEntries(openNs.map(n => [`prs/${n}`, buildPr(n)]));
  // PRs that left the board since the last reading: merged or closed, kept until the close
  const goneDocs: Record<string, J> = Object.fromEntries(goneNs.map((n) => {
    const c = closedList.find(x => String(x.number) === n);
    const pd = P[`prs/${n}`];
    return [`prs/${n}`, {
      ...pd,
      snapshotId: p.snap,
      collectedAt: p.now,
      state: c?.merged_at ? 'merged' : 'closed',
      mergedAt: c?.merged_at ?? null,
      closedAt: c?.closed_at ?? null,
      mergeSha: String(c?.merge_commit_sha ?? '').slice(0, 7),
      // Code merged into the mainline sets no expectation: the ticket moves through QA after it.
      tickets: arr(pd?.tickets).map(t => ({ tk: t.tk, status: tracker[t.tk]?.status ?? t.status, expected: null, ok: null })),
    }];
  }));

  // ---------------------------------------------------------------- interference
  const fl = openNs.map(n => ({ n, files: arr<string>(R[n]?.files) }));
  const pairs: J[] = [];
  for (let i = 0; i < fl.length; i++) {
    for (let j = i + 1; j < fl.length; j++) {
      const a = fl[i];
      const b = fl[j];
      const shared = a.files.filter(f => b.files.includes(f));
      if (shared.length === 0) { continue; }
      pairs.push({ a: Number(a.n), b: Number(b.n), count: shared.length, files: shared.slice(0, 12), conflict: G.pairs.find(x => String(x.a) === a.n && String(x.b) === b.n)?.conflict ?? false });
    }
  }
  for (const x of fl) {
    const mf = G.pr?.[x.n]?.mainFiles ?? [];
    const shared = x.files.filter(f => mf.includes(f));
    if (shared.length === 0) { continue; }
    pairs.push({ a: Number(x.n), b: 'main', count: shared.length, files: shared.slice(0, 12), conflict: false });
  }

  // ---------------------------------------------------------------- branches
  const rc = Object.fromEntries(r.refCounts.map(x => [x[0], { behind: num(x[1]), ahead: num(x[2]) }]));
  const locals = r.refs.map(x => ({ name: x[0], track: x[2] ?? '', date: x[3] ?? null }));
  const bnames = unique([...locals.map(l => l.name), ...worktrees.filter(w => w.branch !== '').map(w => w.branch)]);
  const branches = bnames.map((b) => {
    const l = locals.find(x => x.name === b);
    const w = worktrees.find(x => x.branch === b);
    return {
      name: b,
      local: l !== undefined,
      remote: remoteNames.includes(b),
      upstreamGone: /gone/.test(l?.track ?? ''),
      behindMain: rc[b]?.behind ?? null,
      aheadMain: rc[b]?.ahead ?? null,
      worktree: w ? wtref(w.path) : null,
      lastCommitAt: l?.date || null,
      pr: open.find(x => x.head?.ref === b)?.number ?? null,
    };
  });
  const openHeads = open.map(x => x.head?.ref);
  const remoteOnly = remoteNames.filter(x => !bnames.includes(x) && !openHeads.includes(x)).length;

  // ---------------------------------------------------------------- alerts
  const akey = (a: J) => `${a.code}:${a.subject}:${a.params.tk ?? a.params.login ?? a.params.with ?? a.params.against ?? ''}`;
  const alert = (code: string, subject: string, severity: 'stop' | 'caution', params: J): J => {
    const a = { code, subject, severity, params };
    return { ...a, since: palerts.find(x => akey(x) === akey(a))?.since ?? p.now };
  };
  const alerts: J[] = [];
  for (const d of Object.values(openDocs)) {
    const s = `#${d.n}`;
    if (d.gates.checks.code === 'failing') { alerts.push(alert('checks_failing', s, 'stop', { failing: d.gates.checks.failing })); }
    if (d.gates.review.code === 'open') { alerts.push(alert('review_open', s, 'caution', { open: d.gates.review.open })); }
    if (d.gates.review.code === 'none' && arr(R[String(d.n)]?.icomments).some(c => CLAUDE.test(c.user?.login ?? ''))) { alerts.push(alert('review_stale', s, 'caution', { headSha: String(d.headSha ?? '').slice(0, 7) })); }
    if (!d.feeder) {
      for (const q of d.gates.approval.requested) {
        if (businessDays(ts2e(q.since), nowE) > 2) { alerts.push(alert('reviewer_wait', s, 'caution', { login: q.login, since: q.since })); }
      }
    }
    if (!d.feeder && d.gates.approval.code === 'nobody') { alerts.push(alert('no_reviewer', s, 'caution', {})); }
    if (!d.feeder && (d.behindMain ?? 0) > 0) { alerts.push(alert('behind_main', s, 'caution', { behind: d.behindMain })); }
    if (d.mergePrediction === 'conflict') { alerts.push(alert('conflict', s, 'stop', { against: d.base })); }
    // a trunk PR can name dozens of tickets; past three, one alert per PR instead of one per ticket
    const mm = arr(d.tickets).filter(t => t.ok === false);
    if (mm.length <= 3) { for (const t of mm) { alerts.push(alert('tracker_mismatch', s, 'caution', { tk: t.tk, status: t.status, expected: t.expected })); } }
    else { alerts.push(alert('tracker_mismatch_many', s, 'caution', { count: mm.length, first: mm.slice(0, 4).map(t => t.tk).join(', '), expected: mm[0].expected, tickets: mm.map(t => ({ tk: t.tk, status: t.status })) })); }
    if (d.owner.basis === 'none') { alerts.push(alert('no_owner', s, 'caution', {})); }
  }
  for (const x of pairs) { alerts.push(x.conflict ? alert('conflict', `#${x.a}`, 'stop', { against: x.b }) : alert('shared_files', `#${x.a}`, 'caution', { with: x.b, count: x.count })); }
  for (const d of Object.values(goneDocs)) {
    for (const t of arr(d.tickets).filter(t => t.ok === false)) { alerts.push(alert('tracker_mismatch', `#${d.n}`, 'caution', { tk: t.tk, status: t.status, expected: t.expected })); }
  }
  // one aggregated alert, or a long tail of stale local branches buries every other fault
  const orph = branches.filter(b => b.pr === null && b.name !== p.mainBranch && (b.upstreamGone || (b.worktree !== null && b.aheadMain === 0 && (b.behindMain ?? 0) > 0)));
  if (orph.length > 0) { alerts.push(alert('orphan_branch', 'branches', 'caution', { count: orph.length, branches: orph.map(b => b.name).slice(0, 8), worktrees: orph.filter(b => b.worktree !== null).map(b => b.worktree!.name) })); }

  // ---------------------------------------------------------------- meta
  const boot = p.mode === 'boot';
  const since: string = boot ? (pstate.closedAt ?? p.todayStart) : (pday.since ?? p.todayStart);
  const openedAt: string = boot ? p.now : (pstate.openedAt ?? p.now);
  const sinceE = ts2e(since) ?? 0;
  const openedE = ts2e(openedAt) ?? 0;
  const merged = closedList.filter(c => c.merged_at != null && (ts2e(c.merged_at) ?? 0) > sinceE).map(c => ({
    n: c.number,
    title: c.title,
    base: c.base?.ref,
    mergedAt: c.merged_at,
    mergedBy: c.merged_by?.login ?? null,
    mergeSha: String(c.merge_commit_sha ?? '').slice(0, 7),
    overnight: (ts2e(c.merged_at) ?? 0) < openedE,
  }));
  const closedToday = closedList.filter(c => c.merged_at == null && (ts2e(c.closed_at) ?? 0) > sinceE).map(c => ({ n: c.number, title: c.title, closedAt: c.closed_at, overnight: (ts2e(c.closed_at) ?? 0) < openedE }));
  // wake counters live on meta/state, which is written every wake anyway; on meta/day they
  // would rewrite that document on every quiet heartbeat
  const w0: Record<string, number> = boot ? {} : (pstate.wakes ?? {});
  const wakes = { ...w0, [p.reason]: (w0[p.reason] ?? 0) + 1 };
  const day = {
    schema: 1,
    snapshotId: p.snap,
    collectedAt: p.now,
    date: p.today,
    since,
    merged,
    closed: closedToday,
    usage: p.mode === 'close' ? (p.usage ?? null) : (pday.usage ?? null),
    previous: boot && (pday.date ?? null) !== null && pday.date !== p.today
      ? { date: pday.date, wakes: pstate.wakes ?? {}, usage: pday.usage ?? null }
      : (pday.previous ?? null),
  };
  const counts = {
    open: open.length,
    toMain: open.filter(x => x.base?.ref === p.mainBranch).length,
    feeders: open.filter(x => x.base?.ref !== p.mainBranch).length,
    cleared: Object.values(openDocs).filter(d => d.cleared === 3).length,
  };
  const den = { prs: open.length, branches: branches.length, worktrees: worktrees.length, terminals: terms.length, tickets: Object.keys(tracker).length };
  const mainSha = String(G.mainSha ?? '').slice(0, 7);
  const state: J = p.degraded !== ''
    ? {
        ...pstate,
        schema: 1,
        snapshotId: p.snap,
        collectedAt: p.now,
        lastAttemptAt: p.now,
        health: { code: 'degraded', source: p.degraded, since: (pstate.health?.source ?? null) === p.degraded ? pstate.health.since : p.now },
        lastWake: { reason: p.reason, at: p.now, detail: null },
        wakes,
      }
    : {
        schema: 1,
        snapshotId: p.snap,
        collectedAt: p.now,
        checkedAt: p.now,
        lastAttemptAt: p.now,
        health: { code: 'ok', source: null, since: null },
        window: p.mode === 'close' ? 'closed' : 'open',
        openedAt,
        closedAt: p.mode === 'close' ? p.now : boot ? null : (pstate.closedAt ?? null),
        nextOpen: p.nextOpen,
        mainSha,
        mainMovedAt: (pstate.mainSha ?? '') === mainSha ? (pstate.mainMovedAt ?? p.now) : p.now,
        lastWake: { reason: p.reason, at: p.now, detail: null },
        viewer: r.viewer === '' ? null : r.viewer,
        // Added to the source's document: the page links PRs to this repository.
        repo: p.repo,
        mailbox: p.mailbox,
        session: { handle: p.handle === '' ? null : p.handle },
        wakes,
        counts,
        denominators: den,
      };
  const config = {
    schema: 1,
    snapshotId: p.snap,
    collectedAt: p.now,
    repo: p.repo,
    mainBranch: p.mainBranch,
    timezone: p.timezone,
    window: { days: p.days.split(' ').map(Number), open: p.winOpen, close: p.winClose },
    heartbeatSec: p.heartbeatSec,
    freshness: { lateSec: 3600, staleSec: 4500 },
    requiredApprovals: p.requiredApprovals,
    keeper: 'Git Flow Master',
  };

  // ---------------------------------------------------------------- summary for the model
  const prevAt = ts2e(pstate.collectedAt ?? null);
  const hard: string[] = [];
  if ((pstate.mainSha ?? '') !== '' && pstate.mainSha !== state.mainSha) { hard.push('push:main'); }
  for (const [k, d] of Object.entries(openDocs)) {
    const pd = P[k];
    if (pd == null) { hard.push(`pr:#${d.n}:opened`); continue; }
    if (pd.headSha !== d.headSha) { hard.push(`push:#${d.n}`); }
    if (pd.gates?.checks?.code !== d.gates.checks.code) { hard.push(`checks:#${d.n}`); }
    if (pd.gates?.review?.code !== d.gates.review.code || pd.gates?.review?.open !== d.gates.review.open) { hard.push(`review:#${d.n}`); }
    if (pd.gates?.approval?.code !== d.gates.approval.code || JSON.stringify(arr(pd.gates?.approval?.requested).map(x => x.login)) !== JSON.stringify(d.gates.approval.requested.map((x: J) => x.login))) { hard.push(`approval:#${d.n}`); }
  }
  for (const [k, d] of Object.entries(goneDocs)) { if ((P[k]?.state ?? 'open') === 'open') { hard.push(`pr:#${d.n}:${d.state}`); } }
  const soft: string[] = [];
  for (const [k, d] of Object.entries(openDocs)) {
    const pd = P[k];
    if (pd == null) { continue; }
    if ((pd.owner?.basis ?? '') !== d.owner.basis || (pd.owner?.worktree?.path ?? '') !== (d.owner.worktree?.path ?? '')) { soft.push(`owner:#${d.n}(${d.owner.basis})`); }
    if (JSON.stringify(arr(pd.tickets).map(t => t.status)) !== JSON.stringify(arr(d.tickets).map(t => t.status))) { soft.push(`tracker:#${d.n}`); }
  }
  const ak = alerts.map(akey);
  const pak = palerts.map(akey);
  const alertDiff = [...ak.filter(x => !pak.includes(x)).map(x => `+${x}`), ...pak.filter(x => !ak.includes(x)).map(x => `-${x}`)];
  const comments = openNs.flatMap((n) => {
    const rr = R[n];
    return [...arr(rr?.icomments), ...arr(rr?.rcomments), ...arr(rr?.reviews).filter(v => (v.body ?? '') !== '')]
      .map(c => ({ n: Number(n), by: c.user?.login, at: c.created_at ?? c.submitted_at, body: c.body ?? '' }))
      .filter(c => prevAt === null || (ts2e(c.at) ?? 0) > prevAt);
  }).sort((a, b) => String(a.at).localeCompare(String(b.at)));

  return {
    snapshotId: p.snap,
    collectedAt: p.now,
    reason: p.reason,
    docs: p.degraded !== ''
      ? { 'meta/state': state }
      : {
          'meta/config': config,
          'meta/state': state,
          'meta/day': day,
          'meta/alerts': { schema: 1, snapshotId: p.snap, collectedAt: p.now, items: alerts },
          'meta/chords': { schema: 1, snapshotId: p.snap, collectedAt: p.now, pairs },
          'meta/branches': { schema: 1, snapshotId: p.snap, collectedAt: p.now, items: branches, remoteOnly },
          ...openDocs,
          ...(p.mode === 'close' ? {} : goneDocs),
        },
    openPrs: openNs,
    closedPrs: goneNs,
    denominators: den,
    summary: { hard, soft, alerts: alertDiff, comments: prevAt === null ? [] : comments },
  };
}

/** jq `-S`: keys sorted at every level, so a document hashes the same however it was built. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) { return `[${v.map(stableJson).join(',')}]`; }
  if (v && typeof v === 'object') { return `{${Object.keys(v as J).sort().map(k => `${JSON.stringify(k)}:${stableJson((v as J)[k])}`).join(',')}}`; }
  return JSON.stringify(v);
}

/** The write plan: documents whose content changed against the ledger, deletions on boot/close, and meta/state always. */
export function planOf(o: { snapshotId: string, mode: BuildParams['mode'], ledger: Record<string, { hash?: string }>, docs: { key: string, hash: string, file: string }[], openPrs: string[], closedPrs: string[] }): J {
  const changed = o.docs.filter(d => d.key !== 'meta/state' && (o.ledger[d.key]?.hash ?? '') !== d.hash);
  const stamp = o.docs.filter(d => d.key === 'meta/state');
  const known = Object.keys(o.ledger).sort().filter(k => k.startsWith('prs/') || k.startsWith('notes/'));
  const bare = (k: string) => k.replace(/^prs\//, '').replace(/^notes\//, '');
  // boot drops every PR that is no longer open; close drops the ones that left today
  const del = o.mode === 'boot' ? known.map(bare).filter(n => !o.openPrs.includes(n)) : o.mode === 'close' ? o.closedPrs : [];
  return {
    snapshotId: o.snapshotId,
    mode: o.mode,
    entries: [
      ...changed.map(d => ({ op: 'set', key: d.key, file: d.file, hash: d.hash })),
      ...known.filter(k => del.includes(bare(k))).map(key => ({ op: 'delete', key })),
      ...stamp.map(d => ({ op: 'set', key: d.key, file: d.file, hash: d.hash })),
    ],
    unchanged: o.docs.length - changed.length - stamp.length,
  };
}
