# Private Report Hosting — AI-Executed Setup Protocol

> **Purpose**: switch a project's CI Allure reports from public GitHub Pages to
> the PRIVATE, auth-walled **Test Report Portal**
> ([upex-test-report-portal](https://github.com/upex-galaxy/upex-test-report-portal),
> v2). Reports become reachable only after login, bytes live in a private
> Cloudflare R2 bucket, trends/retention keep working, and the portal indexes
> every run by environment/strategy.
>
> **Execution model**: THE AI RUNS THIS SETUP. Every step below is a command
> the AI executes, except the blocks marked `HUMAN CHECKPOINT` — those are the
> only actions that require the human (account sign-ups, one-time auth
> handshakes, and the optional OAuth app, which has no API). Announce each
> checkpoint, wait for the human, verify, continue.
>
> **When to use**: "reports must be private", "no publiques evidencia
> pública", "protege los reportes con login". If the org has **GitHub
> Enterprise Cloud**, offer the zero-infra shortcut first (repo Settings →
> Pages → visibility Private).

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
  dual-mode: portal **iff the `PORTAL_URL` secret exists**, else public Pages.
- Publisher: `scripts/ci/publish-allure-portal.ts` (synced downstream by
  `bun run update`). Retention is server-side (portal cron).
- In portal mode gh-pages is unused: after verification, disable Pages
  serving (Settings → Pages → Source: None); deleting the gh-pages branch
  requires explicit user confirmation (Critical Rule #6).

## Part 0 — Already-configured detection (idempotency gate, run FIRST)

Probe before provisioning anything — every level short-circuits:

```bash
gh secret list | grep -E "PORTAL_URL|PORTAL_PROJECT|PORTAL_API_KEY|R2_"   # repo already wired?
```

| Probe result | Meaning | Action |
|---|---|---|
| All 7 secrets present | **This repo is fully wired** | Nothing to install. Offer: verify (Part C), rotate key, or change retention. |
| Some secrets present | Partial/broken wiring | Diff against the Part B table, fill only the missing ones. |
| No secrets, but user/org has a portal (ask; also check Engram `mem_search "portal URL"`) | Part A done previously | `curl -s -o /dev/null -w "%{http_code}" <PORTAL_URL>/api/metrics` → `401` = portal alive and walled → skip to Part B. |
| No secrets, no portal | Fresh install | Run Part A → Part B → Part C. |

Part A steps are themselves check-before-create: `supabase projects list`
before `projects create`, `wrangler r2 bucket list` before `bucket create`,
`vercel ls` before `vercel link`, and `create-project.ts` upserts (re-running
it ROTATES the project's API key — only do that deliberately, it invalidates
the old key in CI secrets).

## Part A — Portal deployment (once per organization)

Skip to Part B if the org already runs a portal instance (ask for its URL).
Otherwise, **FORK the portal** (not a plain clone): the org gets its OWN
repo — Vercel connects to it (every push auto-deploys), branding/tweaks have
a home, and upstream updates arrive via the `upstream` remote that `gh` wires
automatically:

```bash
gh repo fork upex-galaxy/upex-test-report-portal --clone -- ../test-report-portal
cd ../test-report-portal && bun install
# Later upgrades: git pull upstream main && git push   (auto-redeploys)
```

The local checkout is the deploy vehicle for the org's own infrastructure —
after setup it is only revisited for upgrades and `create-project` runs.
(Humans without an AI can use the "Deploy to Vercel" button in the portal
README instead — same fork-and-deploy result in one click.)

### A0 — HUMAN CHECKPOINT: accounts + three one-time credentials

Ask the human for (offer `! <command>` where interactive):

1. **Supabase Personal Access Token** — dashboard → account → Access Tokens →
   generate. Or run `! supabase login` (browser handshake). Export as
   `SUPABASE_ACCESS_TOKEN`.
2. **Cloudflare**: account with **R2 enabled** (R2 → activate; asks for a
   payment method even though the free 10 GB tier is $0) + a **user API token**
   with permission **API Tokens: Edit** (dashboard → My Profile → API Tokens).
   Export as `CF_MASTER_TOKEN`. Alternative: `! wrangler login`.
3. **Vercel**: `! vercel login` (or a token from vercel.com/account/tokens →
   export `VERCEL_TOKEN`).

Never echo these values into logs, commits, or files.

### A1 — Supabase project + schema (AI)

```bash
supabase orgs list                                   # get org id
supabase projects create test-report-portal \
  --org-id <ORG_ID> --region <closest> \
  --db-password "$(openssl rand -hex 16)"            # record ref from output
supabase link --project-ref <REF>
supabase db push                                     # applies supabase/migrations/002_v2_schema.sql
supabase projects api-keys --project-ref <REF>       # collect keys
```

Collect: `NEXT_PUBLIC_SUPABASE_URL=https://<REF>.supabase.co`, the
**publishable** key (`sb_publishable_...` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
and the **secret** key (`sb_secret_...` → `SUPABASE_SERVICE_KEY`). New
Supabase projects no longer issue legacy `anon`/`service_role` JWTs — the
`sb_*` keys are drop-in replacements.

### A2 — R2 bucket + scoped S3 credentials (AI)

```bash
bunx wrangler r2 bucket create test-reports          # keep public access OFF (default)
```

Create the bucket-scoped S3 credentials **via API** (no dashboard needed):
`POST https://api.cloudflare.com/client/v4/user/tokens` with
`Authorization: Bearer $CF_MASTER_TOKEN` and an R2 Object Read & Write policy
scoped to the bucket (see
developers.cloudflare.com/r2/api/tokens → "Create API tokens via API").
Then derive:

- `R2_ACCESS_KEY_ID` = the created token's `id`
- `R2_SECRET_ACCESS_KEY` = `echo -n "<token value>" | shasum -a 256` (hex)
- `R2_ACCOUNT_ID` = `bunx wrangler whoami` account id · `R2_BUCKET` = bucket name

Sanity-check before continuing:

```bash
AWS_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY AWS_DEFAULT_REGION=auto \
aws s3 ls "s3://$R2_BUCKET/" --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"
```

### A3 — HUMAN CHECKPOINT (optional): OAuth app

Google/GitHub OAuth clients **cannot be created via any API or CLI** — this
is the one irreducible dashboard step (~5 min). The portal works WITHOUT it
(admin credentials login), so offer both paths:

- Skip now → deploy with credentials-only login; add OAuth later.
- Do now → Google Cloud console → OAuth client (Web), redirect URI
  `https://<portal-domain>/api/auth/callback/google` → human hands over
  `GOOGLE_ID` + `GOOGLE_SECRET`.

### A4 — Vercel deploy (AI)

From the portal repo clone (CLI shown; the Vercel MCP is an equivalent path):

```bash
vercel link --yes                                    # create/link the project
# Set every env var (production): loop `vercel env add <NAME> production`
#   NEXTAUTH_URL=https://<assigned-domain>   NEXTAUTH_SECRET=$(openssl rand -hex 32)
#   LOGIN_EMAIL / LOGIN_PASSWORD (bcrypt: bun scripts/generate-password-hash.ts)
#   AUTHORIZED_EMAIL_DOMAINS=<company.com>   AUTHORIZED_EMAILS=
#   GOOGLE_ID / GOOGLE_SECRET (if A3 done)
#   Supabase trio (A1) · R2 quartet (A2) · CRON_SECRET=$(openssl rand -hex 24)
#   NEXT_PUBLIC_APP_URL=https://<assigned-domain>
vercel deploy --prod --yes
```

The retention cron registers automatically from `vercel.json`.

### A5 — Wall verification (AI, mandatory)

```bash
curl -s -o /dev/null -w "%{http_code}" https://<portal>/api/metrics   # expect 401
```

Then with browser automation (or ask the human for an incognito check):
portal root → login page renders; login with admin credentials → dashboard.

## Part B — Per-project wiring (each downstream repo) (AI)

1. **Provision the project** (in the portal repo clone, Supabase envs loaded):

   ```bash
   bun scripts/create-project.ts <project-slug> "<Display Name>" --retention-runs 30
   ```

   Capture the one-time API key from stdout — transfer it ONLY into the
   secret below, never into a file or log.

2. **Secrets** in the consuming repo:

   ```bash
   gh secret set PORTAL_URL --body "https://<portal-domain>"
   gh secret set PORTAL_PROJECT --body "<project-slug>"
   gh secret set PORTAL_API_KEY --body "<one-time key>"
   gh secret set R2_ACCOUNT_ID --body "..."     # + R2_ACCESS_KEY_ID,
   gh secret set R2_BUCKET --body "..."         #   R2_SECRET_ACCESS_KEY
   ```

3. **Trigger a suite** (`gh workflow run smoke.yml`) and watch the publish
   step: history GET → generate → s3 sync → history PUT → run registered.

   No CI available yet? Run the manual publish test instead — portal repo
   `SETUP.md` §6.5 has the copy-paste flow with any local `allure-report/`.

## Part C — Verification checklist (MANDATORY before declaring done)

- [ ] CI publish step green; job summary shows the portal `viewUrl`.
- [ ] `viewUrl` logged in → report renders (iframe via `/api/view/...`).
- [ ] `viewUrl` + a direct asset URL in incognito/curl → login wall / 401,
      never bytes.
- [ ] Second run on the same stream → trend charts render (history works).
- [ ] Portal dashboard lists the run under the right environment/strategy.
- [ ] If migrating from public Pages: Pages serving disabled after user
      confirms.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `Missing required environment variable: PORTAL_*` in CI | Secret not set | Part B step 2 |
| `401 Invalid credentials` on history/runs | Wrong `PORTAL_API_KEY` / slug mismatch | Re-run create-project (rotates key), update secret |
| `400 reportPrefix must be ...` | Publisher/portal contract drift | `bun run update` in the consuming repo |
| Report iframe 404s assets | Sync hit wrong bucket/prefix | Check `R2_BUCKET` secret + CI log line `r2://...` |
| `aws s3 ls` in A2 fails with 403 | Token policy not scoped to the bucket / wrong secret derivation | Recreate token; secret = SHA-256 of the token VALUE, not the id |
| OAuth login rejects a valid teammate | Domain missing in `AUTHORIZED_EMAIL_DOMAINS` | Add + redeploy |
| Trends empty after 2+ runs | History PUT failing | Check publish log; key rotated mid-stream? |
| Cron never runs | `CRON_SECRET` unset in Vercel | Set + redeploy |

## Boundaries

- NEVER print `PORTAL_API_KEY`, R2 secrets, or Supabase secret keys into
  logs, commits, Jira, or chat transcripts beyond what the human must copy.
- The publisher never deletes from R2; only the portal cron does.
- One R2 bucket serves ALL projects — isolation is enforced by the portal
  (API key ↔ slug ↔ prefix validation).
- Human-only steps are ONLY: account sign-ups, the three A0 handshakes, R2
  payment-method activation, and the optional A3 OAuth app. Everything else
  is yours to execute.
