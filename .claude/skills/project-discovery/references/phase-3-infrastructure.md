# Phase 3 — Infrastructure Discovery

> Read this when running any Phase 3 sub-step: Backend Discovery, Frontend Discovery, or Infrastructure Mapping. Phase 3 runs after Phase 2 is complete (Architecture + API contracts are the inputs).

---

## Phase 3 outputs

| File | Purpose |
|------|---------|
| `.context/infrastructure/backend.md` | Runtime, dependencies, env vars, DB setup, test/build commands, local-dev recipe. |
| `.context/infrastructure/frontend.md` | Build config, client env vars, static assets, bundle/perf, browser targets. |
| `.context/infrastructure/infrastructure.md` | CI/CD workflows, deployment targets, environment matrix, IaC, monitoring, rollback. |

Some teams merge backend + frontend sections into `.context/SRS/architecture.md`. Either layout is acceptable; pick one and be consistent. Prefer `.context/infrastructure/` when the target is a monorepo or has non-trivial ops surface.

Every output MUST include a `## Discovery Gaps` section.

---

## Stack detection — decision tree

Run this BEFORE any discovery step. Never ask the user "what stack is this?" — detect, then confirm.

### Backend signals

| Signal file | Stack inference |
|-------------|-----------------|
| `package.json` with `next` dep | Next.js (API routes in `src/app/api/` or `pages/api/`) |
| `package.json` with `express` or `fastify` | Node API server — look in `src/routes/` or `src/app.ts` |
| `package.json` with `@nestjs/core` | NestJS — controllers under `src/*/` with `@Controller()` decorator |
| `package.json` with `koa` | Koa — `src/app.js` + router middleware |
| `pyproject.toml` + `django` | Django — `urls.py` is the route map, views in `views.py` |
| `pyproject.toml` + `fastapi` | FastAPI — `@app.get/@app.post` decorators |
| `pyproject.toml` + `flask` | Flask — `@app.route` decorators |
| `composer.json` + `laravel/framework` | Laravel — `routes/*.php` |
| `Gemfile` + `rails` | Rails — `config/routes.rb` |
| `go.mod` + `gin`/`echo`/`fiber`/`chi` | Go web framework — grep handler registrations |
| `pom.xml` or `build.gradle` + Spring | Spring Boot — `@RestController` / `@RequestMapping` |

### Frontend signals

| Signal file | Stack inference |
|-------------|-----------------|
| `next.config.*` | Next.js SSR/SSG/ISR. Check `app/` vs `pages/` dir to detect router. |
| `vite.config.*` + `react` dep | Vite + React SPA (CSR) |
| `vite.config.*` + `vue` dep | Vite + Vue SPA |
| `nuxt.config.*` | Nuxt (Vue SSR/SSG) |
| `angular.json` | Angular — modules/components under `src/app/` |
| `svelte.config.*` | SvelteKit |
| `astro.config.*` | Astro — content-first, island architecture |
| `remix.config.*` or `vite.config` with `@remix-run` | Remix |
| No build config but `public/index.html` | Legacy CRA / custom webpack — check `package.json` scripts |

### Infrastructure signals

| Signal | Inference |
|--------|-----------|
| `.github/workflows/*.yml` | GitHub Actions |
| `.gitlab-ci.yml` | GitLab CI |
| `azure-pipelines.yml` | Azure DevOps |
| `.circleci/config.yml` | CircleCI |
| `Jenkinsfile` | Jenkins |
| `vercel.json` or `now.json` | Vercel |
| `netlify.toml` | Netlify |
| `Dockerfile` | Containerized — check for multi-stage |
| `docker-compose.yml` | Local multi-service dev — service list is authoritative |
| `k8s/` or `kubernetes/` or `helm/` | Kubernetes |
| `serverless.yml` / `serverless.ts` | Serverless Framework |
| `*.tf` files | Terraform |
| `Pulumi.yaml` | Pulumi |
| `cdk.json` | AWS CDK |
| `.do/app.yaml` | DigitalOcean App Platform |
| `render.yaml` | Render |
| `fly.toml` | Fly.io |

### Monorepo signals

`pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`, `rush.json`, root `package.json` with `workspaces` field.

If any of these are present: Phase 3 must be run ONCE PER PACKAGE. Each package gets its own sub-section inside the output files (`## packages/api`, `## packages/web`, ...).

---

## 1. Backend discovery

### Discovery process

1. **Runtime configuration**:
   - Language + version: `.nvmrc`, `.node-version`, `engines` in `package.json`, `.python-version`, `.ruby-version`, `go.mod`, `java` version in `pom.xml`.
   - Package manager: lock files decide (`package-lock.json` = npm, `yarn.lock` = yarn, `pnpm-lock.yaml` = pnpm, `bun.lockb` = bun).
   - Build tooling: `tsconfig.json` for TS; framework-specific config files.
   - Scripts: `cat package.json | jq .scripts` (or equivalent for the stack).

2. **Dependency analysis**:
   - Critical categories: framework, ORM (Prisma / TypeORM / Drizzle / Sequelize / SQLAlchemy), auth (NextAuth / Passport / jose / jsonwebtoken), validation (Zod / Yup / Pydantic / class-validator), HTTP client (axios / got / ky).
   - Note exact versions — downstream tests may pin against them.
   - Check for `peerDependencies` conflicts.

3. **Environment requirements**:
   - Start with `.env.example` / `.env.template`.
   - Cross-check against code: `grep -rh "process\.env\." src/ | sed 's/.*process\.env\.\([A-Z_]*\).*/\1/' | sort -u` (or `os.environ.get` / `ENV[]` for other langs).
   - Classify each var: Required (app won't start without it), Optional (has default), External Service (only needed when feature enabled), Build-time vs Runtime.
   - NEVER paste actual secret values — document the KEY and provide an example format only.

4. **Database setup**:
   - Provider from DATABASE_URL format (`postgres://`, `mysql://`, `mongodb://`).
   - Migration tool: `prisma/migrations/`, `migrations/` (TypeORM / Knex / Alembic), `db/migrate/` (Rails).
   - Seed mechanism: `prisma/seed.ts`, `db/seeds/`, custom scripts.
   - Connection pooling config and pool size.

5. **Test & build commands** — identify exactly what CI runs:
   - Test runner: jest, vitest, mocha, playwright, cypress, pytest, rspec, go test.
   - Build command + output dir.
   - Type check command (if separate from build).
   - Lint command.

### Required sections in `.context/infrastructure/backend.md`

- Runtime Environment table (runtime / version / language / package manager)
- Package Scripts table (name / command / purpose)
- Core Dependencies table (category / package / version / purpose)
- Environment Variables — three sub-tables (Required / Optional / External Service)
- Database Configuration (type / provider / ORM / migration tool)
- Migration Commands block (create / apply / reset / seed)
- Build Configuration (output dir, standalone flag, bundler settings)
- Local Development Setup — copy-pasteable `bash` block from `git clone` to `npm run dev`
- Health Check Endpoints (if implemented)
- Discovery Gaps

### Local dev recipe template

```bash
# 1. Install dependencies
<pkg-manager> install

# 2. Set up environment
cp .env.example .env.local
# Edit .env.local:
#   DATABASE_URL=<your local DB connection>
#   <other required vars>

# 3. Set up database
<migrate-command>
<seed-command>  # if seed exists

# 4. Start development server
<dev-command>

# 5. Verify
curl http://localhost:<port>/api/health
```

---

## 2. Frontend discovery

### Discovery process

1. **Build configuration**:
   - Framework config file (`next.config.*`, `vite.config.*`, `angular.json`, etc.).
   - Bundler: Webpack (default), Turbopack (Next 13+), Rollup (Vite), esbuild (various), SWC.
   - Output mode: SSR, SSG, ISR, SPA, standalone server.
   - TypeScript settings (strict mode, paths, jsx).
   - Custom webpack / plugin additions.

2. **Client env vars** — vars exposed to the browser:
   - Next.js: `NEXT_PUBLIC_*` prefix — `grep -rh "NEXT_PUBLIC_" --include="*.ts" --include="*.tsx" src/`.
   - Vite: `VITE_*` prefix — `grep -rh "import\.meta\.env\.VITE_" src/`.
   - CRA: `REACT_APP_*` prefix.
   - SECURITY CHECK: scan for any secret-looking names in the public prefix (e.g., `NEXT_PUBLIC_STRIPE_SECRET_KEY` is a red flag). Flag, don't fix — it's a security finding.
   - Document per-environment values (Development / Staging / Production).

3. **Static assets**:
   - Inventory `public/` contents (favicon, robots, sitemap, og images, fonts, locales).
   - Image optimization: `next/image` domains config, custom loader, formats (AVIF/WebP).
   - CDN: `assetPrefix`, CDN domain overrides.

4. **Bundle & performance**:
   - Bundle analyzer: `@next/bundle-analyzer`, `rollup-plugin-visualizer`, `webpack-bundle-analyzer`.
   - Code splitting signals: `dynamic(...)` (Next), `React.lazy`, `import(...)`.
   - Font optimization: `next/font`, `@fontsource/*`, self-hosted with preload.
   - Core Web Vitals measurement: `web-vitals` package, Lighthouse CI, Sentry Performance.

5. **Routing + state + auth integration points** — what the test framework needs to hook:
   - Router: Next App Router, Pages Router, React Router, Vue Router, Angular Router.
   - State: Redux, Zustand, Jotai, Recoil, Pinia, NgRx.
   - Data fetching: TanStack Query, SWR, Apollo, Relay, RTK Query, native fetch.
   - Auth client: NextAuth `useSession()`, Clerk, Auth0, Supabase Auth, custom cookie/JWT.
   - Test IDs strategy: `data-testid` (preferred), `data-cy`, id/class selectors.

### Required sections in `.context/infrastructure/frontend.md`

- Build Configuration table (framework / bundler / output mode / TS settings)
- Framework config snippet (key settings extracted from `next.config.*` / `vite.config.*`)
- Client Environment Variables table
- Environment-Specific Values table (dev / staging / prod)
- Static Assets tree + Image Handling table
- Code Splitting Strategy
- Bundle Size Notes (measured or flagged as gap)
- Performance Configuration table (image opt / font opt / prefetching / script opt)
- SEO Configuration (metadata / OG / sitemap / robots)
- Browser Support / Polyfills
- Routing + State + Auth integration points (for KATA adaptation)
- Discovery Gaps

---

## 3. Infrastructure mapping

### Discovery process

1. **CI/CD pipelines**:
   - Identify platform from signal files above.
   - Read ALL workflow files — typically a main `ci.yml` (lint/test/build) and a `deploy.yml`.
   - Extract triggers (`on:` block), jobs, steps, env vars, secrets referenced.
   - Note approval gates, branch protection references, reusable workflows.
   - Record the exact commands CI runs — tests must match those commands locally.

2. **Deployment targets**:
   - Primary platform from signal files (Vercel / Netlify / AWS / Fly / Render / k8s / bare Docker).
   - Deployment method: platform build, Docker image push, static upload, `kubectl apply`.
   - Regions and replica counts (if known).
   - Preview environments per PR (Vercel default, Netlify deploy previews, manual k8s).

3. **Environment matrix**:
   - List all environments (dev / preview / staging / prod / others).
   - Map environment -> branch -> auto-deploy yes/no -> URL -> database.
   - Secrets storage: platform env vars, Vault, AWS Secrets Manager, Doppler, 1Password CLI.
   - DO NOT read actual secret values; record the storage mechanism and rotation cadence if known.

4. **Infrastructure as code** (if any):
   - Tool (Terraform / Pulumi / CDK / Serverless / Ansible).
   - Location (`infra/`, `terraform/`, `cdk/`).
   - State backend (local vs remote — S3, Terraform Cloud, etc.).
   - Resource inventory: databases, buckets, queues, CDN distributions, DNS, secrets.

5. **Monitoring & rollback**:
   - Error tracking (Sentry, Rollbar, Bugsnag).
   - Uptime monitoring (UptimeRobot, Pingdom, BetterStack).
   - Metrics/APM (Datadog, New Relic, Grafana Cloud, CloudWatch).
   - Log shipping destination + retention.
   - Rollback mechanism: `vercel rollback`, `kubectl rollout undo`, redeploy prior Git SHA.

### Required sections in `.context/infrastructure/infrastructure.md`

- Overview diagram (Mermaid `graph TB` showing Dev -> CI -> Envs -> Infra)
- CI/CD Configuration — Platform + Workflows, per workflow (triggers, jobs, steps, env names)
- Deployment Configuration — Hosting platform, platform-specific config snippet, Docker/Compose summary if applicable
- Environments Matrix (env / URL / branch / auto-deploy)
- Environment Variables by Environment table
- Secrets Management table (secret / storage / access scope)
- Cloud Services table (service / provider / purpose)
- Database Infrastructure (provider / type / region / backups / connection)
- Infrastructure Resources diagram (Mermaid — apps, DBs, external services, CDN)
- IaC section (tool / location / state / resources)
- Monitoring & Observability (error tracking, uptime, logging)
- Deployment Checklist (pre-deploy / post-deploy / rollback)
- Discovery Gaps
- QA Relevance (test environment access, CI integration points for test jobs)

### Environment matrix template

```markdown
| Environment | URL | Branch | Auto Deploy | Approval |
|-------------|-----|--------|-------------|----------|
| Development | http://localhost:3000 | - | - | - |
| Preview | <pattern>.vercel.app | PR | Yes | - |
| Staging | <staging URL> | develop | Yes | - |
| Production | <prod URL> | main | <Yes/No> | <Manual/Automatic> |
```

---

## Stack detection gotchas

- **Monorepos hide their internals.** A top-level `package.json` with no deps of its own is a workspace root. Run detection per package.
- **Hybrid stacks are common.** Next.js + separate Express API, Next.js + tRPC, Rails API + React SPA. Treat the two halves as separate backend/frontend discoveries and link them in the infrastructure mapping diagram.
- **Missing Dockerfile is not a red flag.** Many modern deployments (Vercel, Netlify, Fly) build without a Dockerfile. Check for platform-specific config (`vercel.json`, `fly.toml`) before assuming "no deploy config".
- **Old `pages/` next to new `app/`.** Next.js apps mid-migration have both. Document both routing models — tests may need to target either.
- **Serverless edge runtime.** Next.js middleware and edge functions run in a restricted V8 runtime (no `fs`, limited `crypto`). Flag if tests assume Node APIs.
- **CI uses different commands than devs.** Read `.github/workflows/*.yml` for the authoritative command set. Local `package.json` scripts can drift.
- **Preview deployments have unstable URLs.** Don't hard-code preview URLs in tests; use the PR's deployment URL from the CI output.
- **Secrets in `.env.example`.** Some repos commit real secrets by mistake into `.env.example`. If you see values that look like tokens (long hex/base64), flag as a security finding rather than copying.
- **Database URL format lies about provider.** `postgres://` can point to Supabase, Neon, RDS, local Postgres. Check the host to identify the real provider.
- **Python projects split tools.** `pyproject.toml` (Poetry / Hatch / Rye) vs `requirements.txt` + `setup.py` — check both.
- **Turbopack vs Webpack in Next.js.** `next dev --turbo` behaves differently from Webpack for some plugins. Note which CI/local uses.

---

## Deliverables checklist

Before the Phase 3 completion gate, verify:

- [ ] `.context/infrastructure/backend.md` exists with Runtime, Scripts, Dependencies, Env Vars, Database, Local Dev Recipe, Discovery Gaps.
- [ ] `.context/infrastructure/frontend.md` exists with Build Config, Client Env Vars, Static Assets, Bundle/Perf, Routing/State/Auth integration points, Discovery Gaps.
- [ ] `.context/infrastructure/infrastructure.md` exists with CI/CD, Deployment, Environments, Secrets, IaC (or "Not present"), Monitoring, Rollback, Discovery Gaps.
- [ ] Every command block is copy-pasteable (no `<placeholder>` mixed with real commands).
- [ ] No secret values committed; only keys + example formats.
- [ ] Monorepos have per-package sub-sections.
- [ ] Each environment URL is reachable (or flagged as gap if cannot verify from code).
- [ ] User confirms "Phase 3 complete" before Setup (KATA adaptation) begins.
