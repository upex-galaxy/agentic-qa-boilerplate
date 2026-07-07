# Private Report Hosting — Test Report Portal Setup Runbook

> **Purpose**: switch a project's CI Allure reports from public GitHub Pages to
> the PRIVATE, auth-walled **Test Report Portal**
> ([upex-test-report-portal](https://github.com/upex-galaxy/upex-test-report-portal),
> v2 architecture). Reports become reachable only after login (work-email
> domain rule), report bytes live in a private Cloudflare R2 bucket, trends
> and retention keep working, and the portal indexes every run by
> environment/strategy.
>
> **When to use**: the user says any variant of "reports must be private",
> "no publiques evidencia pública", "protege los reportes con login".
> If the org has **GitHub Enterprise Cloud**, mention the zero-infra shortcut
> first (Settings → Pages → visibility Private) — it may be all they need.

## Architecture (what you are wiring)

```
CI (this repo)                                  Portal (deployed once per org)
  1. tests -> allure-results                      Vercel (Next.js + NextAuth)
  2. GET history from portal        ------->      Supabase Postgres (runs index)
  3. bunx allure generate                         Cloudflare R2 PRIVATE bucket
  4. aws s3 sync -> R2 (direct)     ------->        {project}/{env}/{suite}/{run}/
  5. PUT history + POST /api/runs   ------->        {project}/{env}/{suite}/history.jsonl
                                                  Viewer: login -> /api/view proxy streams bytes
```

- The publish step in `regression.yml` / `smoke.yml` / `sanity.yml` is already
  dual-mode: it uses the portal **iff the `PORTAL_URL` secret exists**,
  otherwise it falls back to public Pages. You only wire secrets.
- Publisher script: `scripts/ci/publish-allure-portal.ts` (synced to
  downstream repos by `bun run update`).
- Retention is server-side (portal daily cron, per-project policy) — the
  gh-pages `--keep` pruning does not apply in portal mode.
- gh-pages is NOT used in portal mode. Once the portal is verified, disable
  GitHub Pages serving (repo Settings → Pages → Source: None) so old public
  reports stop being reachable, and optionally delete the gh-pages branch
  (ASK the user first — Critical Rule #6).

## Part A — One-time portal deployment (per organization)

Skip to Part B if the org already runs the portal. All steps are guided; the
human does dashboard clicks, you do everything scriptable.

1. **Supabase** (free tier): create project → SQL Editor → run BOTH
   migrations from the portal repo in order: `supabase/migrations/001_*.sql`
   is superseded — run ONLY `002_v2_schema.sql` on a fresh database.
   Collect: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_KEY`.
2. **Cloudflare R2** (free 10 GB): dashboard → R2 → Create bucket (e.g.
   `test-reports`, public access OFF) → Manage R2 API Tokens → create token
   with **Object Read & Write** scoped to that bucket. Collect:
   `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
3. **OAuth app** (recommended: Google): create OAuth client, redirect URI
   `https://<portal-domain>/api/auth/callback/google`. Collect `GOOGLE_ID`,
   `GOOGLE_SECRET`. (GitHub OAuth analogous.)
4. **Vercel**: import the portal repo → set every env var from the portal's
   `.env.example` (NextAuth, Supabase, R2, `CRON_SECRET`,
   `AUTHORIZED_EMAIL_DOMAINS=<company.com>`, admin `LOGIN_EMAIL`/`LOGIN_PASSWORD`).
   Deploy. The `vercel.json` cron (retention, daily 05:00 UTC) registers
   automatically.
5. **Verify the wall**: open the portal URL in an incognito window → login
   page, never data. Log in with a work-domain account → dashboard loads.

## Part B — Per-project wiring (each downstream repo)

1. **Create the project in the portal** (run inside the portal repo, or ask
   the portal admin):

   ```bash
   bun scripts/create-project.ts <project-slug> "<Display Name>" --retention-runs 30
   ```

   Copy the printed API key NOW — it is shown once.

2. **GitHub Secrets** in the consuming repo (`gh secret set <NAME>`):

   | Secret | Value |
   |---|---|
   | `PORTAL_URL` | `https://<portal-domain>` (no trailing slash) |
   | `PORTAL_PROJECT` | the project slug from step 1 |
   | `PORTAL_API_KEY` | the one-time key from step 1 |
   | `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | from Part A step 2 |

3. **Trigger any suite** (`gh workflow run smoke.yml`) and watch the publish
   step log: history GET → generate → s3 sync → history PUT → run registered
   with the private `viewUrl` in the job summary.

## Part C — Verification checklist (MANDATORY before declaring done)

- [ ] CI publish step green; job summary shows the portal `viewUrl`.
- [ ] `viewUrl` in a **normal session**: login → report renders in the
      portal (iframe streams via `/api/view/...`).
- [ ] `viewUrl` in an **incognito window**: login wall. Also try a direct
      asset URL (`<portal>/api/view/<runId>/index.html`) → 401, never bytes.
- [ ] Second CI run on the same stream → Allure report shows trend charts
      (history round-trip works).
- [ ] Portal dashboard lists the run under the right environment/strategy.
- [ ] If migrating from public Pages: GitHub Pages serving disabled
      (Settings → Pages → Source: None) after the user confirms.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Publish step: `Missing required environment variable: PORTAL_*` | Secret not set in the consuming repo | Part B step 2 |
| `401 Invalid credentials` on history/runs | Wrong `PORTAL_API_KEY` or `PORTAL_PROJECT` mismatch | Re-run create-project (rotates the key) and update the secret |
| `400 reportPrefix must be ...` | Publisher and portal disagree on coordinates | Update `scripts/ci/` via `bun run update` (contract drift) |
| Report iframe 404s on assets | R2 sync ran against the wrong bucket/prefix | Check `R2_BUCKET` secret and the sync log line `r2://...` |
| Trends empty after 2+ runs | History PUT failing (check step log) | Verify the API key has not been rotated mid-stream |
| Vercel cron never runs | `CRON_SECRET` unset in Vercel env | Set it and redeploy |

## Boundaries

- NEVER print the `PORTAL_API_KEY` or R2 secrets into logs, commits, or Jira.
- The publisher never deletes anything in R2; only the portal cron does.
- One R2 bucket serves ALL projects — per-project isolation is enforced by
  the portal (API key ↔ slug ↔ prefix validation), so downstream repos never
  need bucket-level separation.
