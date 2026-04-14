# Phase 1 — Constitution

The first phase of project discovery. Goal: make the project legible. Produces four outputs, in this exact order. Each sub-step reads the previous one's output.

```
1. Project Connection    -> .context/project-config.md
2. Project Assessment    -> CLAUDE.md §Project Assessment + .context/risk-assessment.md (if HIGH risks)
3. Business Model        -> .context/idea/business-model.md
4. Domain Glossary       -> .context/idea/domain-glossary.md
```

Rule: no sub-step starts until the previous one's file exists on disk.

---

## 1. Project Connection

### Inputs to gather

| Priority | Information | How to get it |
|----------|-------------|---------------|
| HIGH | Repository URLs | Ask user, or `gh repo view <owner/repo>` |
| HIGH | Tech stack | Detect from `package.json` / `pyproject.toml` / `go.mod` etc. |
| MEDIUM | Environment URLs (dev/staging/prod) | Read `.env.example`, `docker-compose.yml`, CI secrets inventory, then ask |
| MEDIUM | Issue tracker | Ask user ("Jira / Linear / GitHub Issues?") |
| LOW | Team contacts | Ask only if needed to unblock access |

Ask incrementally -- never dump all five questions up front.

### Detection commands

```bash
# Repository shape
gh repo view <owner/repo> --json name,description,defaultBranchRef
ls -la <repo-root>
find <repo-root> -maxdepth 2 -name "docker-compose*.yml" -o -name "Dockerfile" -o -name "turbo.json" -o -name "pnpm-workspace.yaml"

# JS / TS stack
cat <repo-root>/package.json | jq '.dependencies, .devDependencies, .scripts'

# Python stack
cat <repo-root>/pyproject.toml
cat <repo-root>/requirements.txt

# Framework fingerprints (file-based)
ls <repo-root>/next.config.* <repo-root>/angular.json <repo-root>/vite.config.* <repo-root>/nest-cli.json 2>/dev/null

# CI/CD
ls <repo-root>/.github/workflows/
gh workflow list -R <owner/repo>
```

### Output: `.context/project-config.md`

```markdown
# Project Configuration

> Project: {{PROJECT_NAME}}
> Generated: <YYYY-MM-DD>

## Repositories

| Repository | URL | Branch | Purpose |
|------------|-----|--------|---------|
| {{FRONTEND_REPO}} | <url> | main | Web application |
| {{BACKEND_REPO}}  | <url> | main | API services |

## Tech Stack

### Frontend
- Framework: <name + version>
- Language: <TypeScript / JavaScript / ...>
- Styling: <Tailwind / styled-components / ...>
- State: <Zustand / Redux / Context / ...>

### Backend
- Framework: <Express / NestJS / FastAPI / ...>
- Language: <TypeScript / Python / Go / ...>
- ORM: <Prisma / TypeORM / SQLAlchemy / ...>

### Database
- Type: <PostgreSQL / MySQL / MongoDB / ...>
- Provider: <Supabase / AWS RDS / Atlas / ...>
- Access: <MCP name / connection string source>

### Infrastructure
- Cloud: <Vercel / AWS / GCP / Azure / ...>
- CI/CD: <GitHub Actions / CircleCI / ...>
- Monitoring: <Sentry / DataDog / ...>

## Environments

| Environment | URL | Purpose | Access |
|-------------|-----|---------|--------|
| Local       | {{SPA_URL_LOCAL}}   | Dev | Direct |
| Staging     | {{SPA_URL_STAGING}} | Pre-prod testing | <VPN? Auth?> |
| Production  | <URL> | Live | Read-only |

## Tools and Access

- Issue tracker: <Jira / Linear / GitHub Issues> -- resolved via [ISSUE_TRACKER_TOOL]
- Project key: {{PROJECT_KEY}}
- Database: resolved via [DB_TOOL]
- Docs: <Confluence / Notion / GitHub Wiki>

## Access Checklist

- [ ] Repository read access
- [ ] Database access (MCP or direct)
- [ ] Issue tracker access
- [ ] Staging environment reachable
- [ ] CI/CD visibility

## Discovery Gaps

- [ ] <item you could not verify, where to get the source of truth>
```

### Completion criteria

- `.context/project-config.md` exists.
- At least Repositories + Tech Stack + Environments sections are filled.
- Access Checklist has known state per row (checked or flagged as blocker in Discovery Gaps).

---

## 2. Project Assessment

Assess current testing maturity to decide where to invest effort in later phases.

### Testing maturity scale

| Score | State | Indicators |
|-------|-------|------------|
| 0 | None | No test files, no test scripts |
| 1 | Basic | Some unit tests, no integration |
| 2 | Moderate | Unit + some integration, manual E2E |
| 3 | Good | Unit + integration + some E2E automation |
| 4 | Mature | Full coverage, CI integration, monitoring |

### Documentation scale

| State | Indicators |
|-------|------------|
| Minimal | Only basic README |
| Partial | README + some API docs |
| Good | README + API + setup guide |
| Complete | All above + architecture + contributing |

### CI/CD maturity

| Level | Indicators |
|-------|------------|
| None | No workflows |
| Basic | Build only |
| Moderate | Build + lint |
| Good | Build + lint + tests |
| Mature | Build + lint + tests + deploy + monitoring |

### Commands

```bash
# Test inventory
find <repo-root> -type f \( -name "*.test.*" -o -name "*.spec.*" \) | wc -l
ls -d <repo-root>/{tests,test,__tests__,spec,e2e,integration} 2>/dev/null

# Quality tools
cat <repo-root>/package.json | jq '.devDependencies | with_entries(select(.key | test("eslint|prettier|husky|lint-staged|typescript")))'
ls <repo-root>/tsconfig.json <repo-root>/.eslintrc* <repo-root>/.prettierrc* <repo-root>/.husky 2>/dev/null

# CI test jobs
grep -l "test\|jest\|vitest\|playwright" <repo-root>/.github/workflows/*.yml

# Secret leak sweep (report only -- do not fix secrets in discovery)
grep -rE "(api[_-]?key|secret|password|token)\s*[:=]\s*['\"]" <repo-root>/src
```

### Risks to flag

| Risk | Detection | Impact |
|------|-----------|--------|
| No tests | Empty test dirs | HIGH |
| Outdated dependencies | `npm audit` / `pip-audit` warnings | MEDIUM |
| No type checking | Missing `tsconfig.json` on a TS project | MEDIUM |
| Hardcoded secrets | grep hits above | HIGH |
| No CI | Missing workflow files | MEDIUM |

### Output

Append to `CLAUDE.md` in a `## Project Assessment (Phase 1)` block:

```markdown
## Project Assessment (Phase 1)

Assessment Date: <YYYY-MM-DD>

### Testing Maturity: <score>/4
- Current state: <None / Basic / Moderate / Good / Mature>
- Test files: <count>
- Frameworks: <Jest, Vitest, Playwright, ...>
- Coverage: <unknown / X%>

### Documentation State: <Minimal / Partial / Good / Complete>
- README: <yes/no>
- API docs: <yes/no>
- Architecture: <yes/no>
- Setup guide: <yes/no>

### Code Quality
- [ ] ESLint: <configured / missing>
- [ ] Prettier: <configured / missing>
- [ ] TypeScript: <strict / loose / none>
- [ ] Pre-commit hooks: <configured / missing>

### CI/CD Maturity: <None / Basic / Moderate / Good / Mature>

### Identified Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| <name> | HIGH/MEDIUM/LOW | <action> |

### Phase Prioritization

- Phase 1: <Normal / Extended> -- <reason>
- Phase 2: <Normal / Extended> -- <reason>
- Phase 3: <Normal / Skip> -- <reason>
- Phase 4: <Normal / Extended> -- <reason>

### Blockers
- [ ] <blocker + action>
```

If HIGH risks exist, also write `.context/risk-assessment.md` with per-risk Severity, Description, Impact, Recommendation, Owner.

### Completion criteria

- `## Project Assessment (Phase 1)` section present in `CLAUDE.md`.
- HIGH risks (if any) captured in `.context/risk-assessment.md`.

---

## 3. Business Model Discovery

Produce a Business Model Canvas by **discovering** from the code, not by inventing.

### Mindset shift

- Original (product creation): "Define your value proposition."
- Discovery: "What value proposition does this product already deliver?" Every statement in the output must cite a source in the repo.

### Discovery commands

```bash
# Product overview
cat <repo-root>/README.md

# User types / roles
grep -rE "\b(role|userType|UserRole|userRole)\b" --include="*.ts" --include="*.js" --include="*.py" <repo-root>/src | head -50

# Features -- main routes
ls <repo-root>/src/app <repo-root>/src/pages 2>/dev/null
ls <repo-root>/src/api <repo-root>/src/routes <repo-root>/src/controllers 2>/dev/null

# Revenue signals
grep -rE "\b(price|subscription|plan|tier|stripe|paypal)\b" --include="*.ts" --include="*.js" <repo-root>/src | head -30
grep -E "stripe|paypal|paddle|lemonsqueezy" <repo-root>/package.json
```

### Output: `.context/idea/business-model.md`

Sections (in this order):

1. **Problem Statement** -- 2-3 paragraphs; cite each claim ("Source: README line 12" / "Source: src/app/landing/page.tsx").
2. **Business Model Canvas** -- nine blocks. Only include evidence you actually found; mark unknown blocks as "Unknown -- requires user input".
   - Customer Segments
   - Value Propositions
   - Channels (web, mobile, API, ...)
   - Customer Relationships (self-service, automated, personal)
   - Revenue Streams (mark Unknown if unclear)
   - Key Resources (infra, content, data)
   - Key Activities (map to core features discovered)
   - Key Partners (from `package.json` integrations)
   - Cost Structure (from infra + paid services)
3. **Discovery Gaps** -- explicit list of what you could not find.
4. **QA Relevance** -- one table mapping (Business aspect) -> (Testing implication).
5. **Sources Used** -- provenance list for every claim.

### Quality rules

- Every row has a `Found in:` column. If empty, the row does not get written.
- Confidence level (High / Medium / Low) is required on top of the doc.
- Never copy marketing copy blindly -- if the deployed site says "revolutionary platform", classify it as marketing language and downgrade confidence.

### Completion criteria

- `.context/idea/business-model.md` exists.
- At least Customer Segments + Value Propositions + Key Activities + Sources are populated with real evidence.
- Discovery Gaps section lists everything marked Unknown.

---

## 4. Domain Glossary

Extract domain-specific terminology from the codebase. Bridges developer language (`user`, `order`) and business language (Customer, Purchase).

### Discovery commands

```bash
# Entities / models
find <repo-root> -name "*.model.ts" -o -name "*.entity.ts" -o -name "*.schema.ts" -o -name "*.dto.ts"
cat <repo-root>/prisma/schema.prisma 2>/dev/null
ls <repo-root>/src/entities <repo-root>/src/models 2>/dev/null

# Database
[DB_TOOL] List Tables:
  schema: public
  include: columns, types, constraints

# Enums / constants
grep -rE "enum\s+[A-Z][A-Za-z]+" --include="*.ts" <repo-root>/src
grep -rE "export\s+const\s+[A-Z_]+\s*=" --include="*.ts" <repo-root>/src/constants <repo-root>/src/types 2>/dev/null

# Relationships
grep -A2 "@relation" <repo-root>/prisma/schema.prisma 2>/dev/null
grep -B2 -A2 "ManyToOne\|OneToMany\|ManyToMany" <repo-root>/src/entities/*.ts 2>/dev/null

# Business rules
grep -rE "validate|throw new (Error|.+Exception)" --include="*.ts" <repo-root>/src/services <repo-root>/src/domain 2>/dev/null | head -40

# UI labels (i18n)
cat <repo-root>/src/locales/en.json 2>/dev/null
cat <repo-root>/public/locales/en/*.json 2>/dev/null
```

### Output: `.context/idea/domain-glossary.md`

Required sections:

1. **Core Entities** -- one subsection per entity with this table:
   ```
   Technical Name | Business Name | Description | Table/Collection | Key Attributes | Found In
   ```
   Plus `Relationships` list (Has many / Belongs to) and a JSON example.
2. **Enumerations and Constants** -- one table per enum: `Value | Business Meaning | Usage Context`. Note file path.
3. **Business Rules** -- one subsection per rule with Description, Entities Affected, Validation, Error Message, Found In. Include a Given/When/Then example.
4. **Entity Relationships Diagram** -- a Mermaid `erDiagram` block.
5. **Terminology Mapping** -- two tables:
   - Technical -> Business terms (`user` -> `Customer`, `order` -> `Purchase`).
   - Abbreviations and acronyms.
6. **Status / State Flows** -- Mermaid `stateDiagram-v2` per stateful entity.
7. **UI Labels Reference** -- form field table and action button table.
8. **Discovery Gaps** -- terms needing clarification.
9. **QA Usage Guide** -- how future test-case authors should use this file.

### Quality rules

- Every entity must include its file path (`Found In` column).
- Enumeration values use the code constant (`PENDING`, `ACTIVE`), not the free text.
- State diagrams are mandatory for entities with more than two states -- QA testing of state transitions depends on this.
- If i18n exists, pull UI labels from i18n files (the real ones shipped), not from component JSX (which may be hardcoded fallbacks).

### Completion criteria

- `.context/idea/domain-glossary.md` exists.
- At least all `Core Entities` found in the schema are documented (no skipping).
- One `erDiagram` is present and parses as valid Mermaid.

---

## Phase 1 — exit gate

Before proceeding to Phase 2:

- [ ] `.context/project-config.md` exists and is non-empty.
- [ ] `## Project Assessment (Phase 1)` block present in `CLAUDE.md`.
- [ ] `.context/idea/business-model.md` exists with real sources cited.
- [ ] `.context/idea/domain-glossary.md` exists with at least Core Entities + Relationships Diagram.
- [ ] All Discovery Gaps are listed explicitly (no silent skipping).
- [ ] The user has confirmed "Phase 1 complete, proceed to Phase 2".

Never auto-advance. Phase 2 only starts after explicit user confirmation.

---

## Phase 1 gotchas

- **Ask incrementally.** Do not dump all five Project Connection questions at once -- get repo first, then tech stack, then environments.
- **Credentials never land in these docs.** Point to `.env` keys instead.
- **Confidence levels are mandatory.** Business-model discovery especially -- if the README is marketing prose, mark Medium or Low.
- **Do not invent sources.** If something is not in the code, it goes in Discovery Gaps.
- **Monorepo caveat.** If the repo is a monorepo, Tech Stack in project-config lists per-package entries, and Core Entities in the glossary note which package they belong to.
- **Prefer schema over ORM models.** If both exist, the migration file / schema dump is authoritative. ORM models can drift.
- **HIGH risks block progress.** No tests + hardcoded secrets + no CI = stop, fix secrets, re-assess before Phase 2.
- **Extract UI labels from i18n files when they exist.** Component JSX strings may be fallback text; the production label lives in the translation bundle.
