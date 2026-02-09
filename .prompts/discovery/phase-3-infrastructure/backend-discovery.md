# Backend Discovery

> **Phase**: 3 - Infrastructure
> **Objective**: Document backend service configuration and runtime requirements

---

## 📥 Input Required

### From Previous Prompts:

- `.context/SRS/architecture-specs.md` (tech stack)
- `.context/project-config.md` (repository info)

### From Discovery Sources:

| Information      | Primary Source         | Fallback           |
| ---------------- | ---------------------- | ------------------ |
| Runtime config   | package.json, tsconfig | Docker files       |
| Dependencies     | package.json           | Lock file analysis |
| Environment vars | .env.example           | Code grep          |
| Database setup   | Prisma/migrations      | Docker compose     |

---

## 🎯 Objective

Document backend infrastructure by:

1. Analyzing runtime configuration
2. Mapping dependencies and versions
3. Documenting environment requirements
4. Understanding database setup

---

## 🔍 Discovery Process

### Step 1: Runtime Configuration

**Actions:**

1. Analyze package.json scripts:

   ```bash
   cat package.json | grep -A30 '"scripts"'
   ```

2. Check Node.js version requirements:

   ```bash
   cat package.json | grep -E '"node"|"engines"' -A3
   cat .nvmrc .node-version 2>/dev/null
   ```

3. Review TypeScript configuration:

   ```bash
   cat tsconfig.json | head -50
   ```

4. Check for build configuration:
   ```bash
   cat next.config.js next.config.mjs vite.config.ts 2>/dev/null | head -50
   ```

**Output:**

- Available scripts (dev, build, start, test)
- Node.js version requirement
- TypeScript settings
- Build output configuration

### Step 2: Dependency Analysis

**Actions:**

1. List production dependencies:

   ```bash
   cat package.json | grep -A100 '"dependencies"' | grep -B100 '"devDependencies"' | head -50
   ```

2. Identify critical dependencies:

   ```bash
   # Framework
   grep -E "next|express|fastify|nest" package.json

   # Database
   grep -E "prisma|typeorm|drizzle|mongoose" package.json

   # Auth
   grep -E "next-auth|passport|jose|jsonwebtoken" package.json
   ```

3. Check for peer dependencies issues:
   ```bash
   cat package.json | grep -A10 '"peerDependencies"'
   ```

**Output:**

- Core framework and version
- Database ORM
- Authentication library
- Key utilities

### Step 3: Environment Requirements

**Actions:**

1. Find environment template:

   ```bash
   cat .env.example .env.template .env.sample 2>/dev/null
   ```

2. Extract required variables from code:

   ```bash
   grep -rh "process.env\." --include="*.ts" --include="*.tsx" src/ | \
     sed 's/.*process\.env\.\([A-Z_]*\).*/\1/' | sort | uniq
   ```

3. Categorize variables:

   ```bash
   # Database
   grep -i "database\|db_\|postgres\|mysql" .env.example 2>/dev/null

   # Auth/Secrets
   grep -i "secret\|key\|token\|auth" .env.example 2>/dev/null

   # External services
   grep -i "api_\|url\|endpoint" .env.example 2>/dev/null
   ```

**Output:**

- Required environment variables
- Optional variables
- Secret management approach

### Step 4: Database Setup

**Actions:**

1. Check database configuration:

   ```bash
   # Prisma
   cat prisma/schema.prisma | head -20

   # Check for migrations
   ls prisma/migrations/ 2>/dev/null | head -10
   ```

2. Analyze database connection:

   ```bash
   grep -r "DATABASE_URL\|connectionString" --include="*.ts" src/
   ```

3. Check for seeding:
   ```bash
   cat prisma/seed.ts package.json | grep -E "seed|prisma db seed"
   ```

**Output:**

- Database type and provider
- Migration strategy
- Seed data availability

---

## 📤 Output Generated

### Primary Output: Update `.context/SRS/architecture-specs.md`

Add or update the following section:

````markdown
## Backend Infrastructure

### Runtime Environment

| Aspect              | Value                | Evidence         |
| ------------------- | -------------------- | ---------------- |
| **Runtime**         | Node.js              | package.json     |
| **Version**         | [version]            | .nvmrc / engines |
| **Language**        | TypeScript [version] | tsconfig.json    |
| **Package Manager** | [npm/yarn/pnpm/bun]  | Lock file        |

### NPM Scripts

| Script       | Command                 | Purpose            |
| ------------ | ----------------------- | ------------------ |
| `dev`        | `next dev`              | Development server |
| `build`      | `next build`            | Production build   |
| `start`      | `next start`            | Production server  |
| `test`       | `jest`                  | Run tests          |
| `lint`       | `eslint .`              | Code linting       |
| `db:migrate` | `prisma migrate deploy` | Run migrations     |
| `db:seed`    | `prisma db seed`        | Seed database      |

### Core Dependencies

| Category   | Package        | Version | Purpose           |
| ---------- | -------------- | ------- | ----------------- |
| Framework  | next           | 14.x    | React framework   |
| ORM        | @prisma/client | 5.x     | Database access   |
| Auth       | next-auth      | 5.x     | Authentication    |
| Validation | zod            | 3.x     | Schema validation |
| HTTP       | axios          | 1.x     | API client        |

### Environment Variables

#### Required Variables

| Variable          | Type              | Description           | Example                 |
| ----------------- | ----------------- | --------------------- | ----------------------- |
| `DATABASE_URL`    | Connection string | PostgreSQL connection | `postgresql://...`      |
| `NEXTAUTH_SECRET` | Secret            | Session encryption    | Random 32+ chars        |
| `NEXTAUTH_URL`    | URL               | Auth callback base    | `http://localhost:3000` |

#### Optional Variables

| Variable    | Type   | Default | Description              |
| ----------- | ------ | ------- | ------------------------ |
| `LOG_LEVEL` | Enum   | `info`  | Logging verbosity        |
| `CACHE_TTL` | Number | `3600`  | Cache duration (seconds) |

#### External Service Variables

| Variable            | Service  | Required        |
| ------------------- | -------- | --------------- |
| `STRIPE_SECRET_KEY` | Stripe   | If payments     |
| `SENDGRID_API_KEY`  | SendGrid | If emails       |
| `SENTRY_DSN`        | Sentry   | If monitoring   |
| `S3_BUCKET`         | AWS S3   | If file uploads |

### Database Configuration

| Aspect         | Value          | Evidence             |
| -------------- | -------------- | -------------------- |
| **Type**       | PostgreSQL     | prisma/schema.prisma |
| **Provider**   | Supabase       | DATABASE_URL format  |
| **ORM**        | Prisma         | @prisma/client       |
| **Migrations** | Prisma Migrate | prisma/migrations/   |

#### Migration Commands

```bash
# Development: create and apply migration
npx prisma migrate dev --name <migration_name>

# Production: apply pending migrations
npx prisma migrate deploy

# Reset database (development only)
npx prisma migrate reset
```
````

#### Database Schema Location

- Schema: `prisma/schema.prisma`
- Migrations: `prisma/migrations/`
- Seed: `prisma/seed.ts`

### Build Configuration

| Aspect              | Value              |
| ------------------- | ------------------ |
| **Output**          | `.next/`           |
| **Standalone**      | [Yes/No]           |
| **Bundle Analyzer** | [Enabled/Disabled] |

```javascript
// next.config.js key settings
{
  output: 'standalone', // For Docker deployment
  experimental: {
    serverActions: true,
  },
  images: {
    domains: ['...'],
  },
}
```

### Local Development Setup

```bash
# 1. Install dependencies
npm install  # or yarn, pnpm, bun

# 2. Set up environment
cp .env.example .env.local
# Edit .env.local with your values

# 3. Set up database
npx prisma migrate dev
npx prisma db seed  # if seed exists

# 4. Start development server
npm run dev
```

### Health Check Endpoints

| Endpoint         | Purpose        | Expected Response     |
| ---------------- | -------------- | --------------------- |
| `/api/health`    | Basic health   | `{ status: "ok" }`    |
| `/api/health/db` | Database check | `{ db: "connected" }` |

````

### Update CLAUDE.md:

```markdown
## Phase 3 Progress
- [x] backend-discovery.md ✅
  - Runtime: Node.js [version]
  - Framework: [name]
  - Database: [type]
  - Env vars: [count]
````

---

## 🔗 Next Prompt

| Condition            | Next Prompt               |
| -------------------- | ------------------------- |
| Backend documented   | `frontend-discovery.md`   |
| Missing .env.example | Create template           |
| Complex setup        | Document additional steps |

---

## Tips

1. **package.json is the source of truth** - Scripts and deps tell the story
2. **.env.example should exist** - If not, create it from code analysis
3. **Lock files matter** - They show exact versions in use
4. **Check Docker files** - They often have complete setup instructions
