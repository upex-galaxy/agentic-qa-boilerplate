# Project Connection

> **Phase**: 1 - Constitution (Project Onboarding)
> **Objective**: Connect to an existing project's repositories, environments, and tools

---

## 📥 Input Required

### From User (ask incrementally, not all at once):

| Information         | Priority | How to Ask                                                |
| ------------------- | -------- | --------------------------------------------------------- |
| Repository URLs     | HIGH     | "What are the repository URLs for this project?"          |
| Tech stack overview | HIGH     | "What's the tech stack? (frontend, backend, database)"    |
| Environment URLs    | MEDIUM   | "What are the environment URLs? (dev, staging, prod)"     |
| PM tool             | MEDIUM   | "Where do you manage tickets? (Jira, Azure DevOps, etc.)" |
| Team contacts       | LOW      | "Who are the key contacts? (PO, Tech Lead, QA Lead)"      |

### From Available Tools (try before asking user):

| Information     | MCP                       | CLI                | Fallback |
| --------------- | ------------------------- | ------------------ | -------- |
| Repo structure  | `mcp__github`             | `gh repo view`     | Ask user |
| Jira project    | Atlassian MCP          | -                  | Ask user |
| Database schema | `mcp__supabase`           | DB CLI             | Ask user |
| CI/CD config    | Read `.github/workflows/` | `gh workflow list` | Ask user |

---

## 🎯 Objective

Establish connections to all project resources and create a configuration file that serves as the foundation for all subsequent discovery phases.

---

## 🔍 Discovery Process

### Step 1: Repository Connection

**Actions:**

1. If repo URL provided, clone or analyze remotely:
   ```bash
   gh repo view [owner/repo] --json name,description,defaultBranchRef
   ```
2. Identify repository structure:
   - Monorepo vs multi-repo
   - Frontend/backend locations
   - Configuration files

**Verify:**

- [ ] Can access repository
- [ ] Identified main directories
- [ ] Found package.json or equivalent

### Step 2: Tech Stack Identification

**Actions:**

1. Analyze `package.json` (or equivalent):
   - Main dependencies
   - Dev dependencies
   - Scripts
2. Look for framework indicators:
   - `next.config.js` → Next.js
   - `angular.json` → Angular
   - `vite.config.ts` → Vite
   - `nest-cli.json` → NestJS

**Output format:**

```markdown
## Tech Stack

- **Frontend**: [framework] [version]
- **Backend**: [framework] [version]
- **Database**: [type] (e.g., PostgreSQL via Supabase)
- **Testing**: [frameworks] (e.g., Playwright, Jest)
- **Build**: [tool] (e.g., Turbo, npm workspaces)
```

### Step 3: Environment Discovery

**Actions:**

1. Look for environment configs:
   - `.env.example` or `.env.template`
   - `docker-compose.yml`
   - CI/CD environment variables
2. Ask user for URLs if not found

**Output format:**

```markdown
## Environments

| Environment | URL   | Access          |
| ----------- | ----- | --------------- |
| Development | [URL] | [VPN required?] |
| Staging     | [URL] | [Auth method]   |
| Production  | [URL] | [Read-only?]    |
```

### Step 4: Tool Access Configuration

**For Jira (priority PM tool):**

```
1. Check if Atlassian MCP is available
2. If yes: "Can you provide the Jira project key?"
3. If no: "Do you have Jira access? I can help set up the Jira CLI."
```

**For other tools:**

- GitHub: Usually available via `gh` CLI
- Database: Check for MCP (Supabase) or connection strings
- CI/CD: Usually in repo (.github/workflows, azure-pipelines.yml)

### Step 5: Team Contacts (Optional)

**Ask only if needed for blockers:**

```
"Who should I contact if I need access to [specific resource]?"
```

---

## 📤 Output Generated

### Primary Output: `.context/project-config.md`

```markdown
# Project Configuration

> **Project**: [Name]
> **Generated**: [Date]
> **Last Updated**: [Date]

---

## Repositories

| Repository    | URL   | Branch | Purpose          |
| ------------- | ----- | ------ | ---------------- |
| Main/Monorepo | [URL] | main   | Full application |
| Frontend      | [URL] | main   | Web application  |
| Backend       | [URL] | main   | API services     |

## Tech Stack

### Frontend

- **Framework**: [e.g., Next.js 14]
- **Language**: [e.g., TypeScript]
- **Styling**: [e.g., Tailwind CSS]
- **State**: [e.g., Zustand, Redux]

### Backend

- **Framework**: [e.g., NestJS, Express]
- **Language**: [e.g., TypeScript, Python]
- **ORM**: [e.g., Prisma, TypeORM]

### Database

- **Type**: [e.g., PostgreSQL]
- **Provider**: [e.g., Supabase, AWS RDS]
- **Access**: [MCP available? / Connection method]

### Infrastructure

- **Cloud**: [e.g., Vercel, AWS, GCP]
- **CI/CD**: [e.g., GitHub Actions, Azure Pipelines]
- **Monitoring**: [e.g., Sentry, DataDog]

## Environments

| Environment | URL   | Purpose          | Access    |
| ----------- | ----- | ---------------- | --------- |
| Development | [URL] | Local dev        | Direct    |
| Staging     | [URL] | Pre-prod testing | VPN       |
| Production  | [URL] | Live             | Read-only |

## Tools & Access

### Project Management

- **Tool**: [Jira / Azure DevOps / ClickUp]
- **Project**: [Project key or URL]
- **Access Method**: [MCP / CLI / Web]

### Documentation

- **Tool**: [Confluence / Notion / GitHub Wiki]
- **Space**: [Space key or URL]
- **Access Method**: [MCP / API / Web]

### Communication

- **Tool**: [Slack / Teams]
- **Channel**: [#channel-name]

## Team Contacts

| Role          | Name   | Contact       |
| ------------- | ------ | ------------- |
| Product Owner | [Name] | [Slack/Email] |
| Tech Lead     | [Name] | [Slack/Email] |
| QA Lead       | [Name] | [Slack/Email] |

---

## Access Checklist

- [x] Repository access
- [ ] Database access (MCP configured)
- [ ] Jira access (MCP configured)
- [ ] Staging environment access
- [ ] CI/CD visibility

## Notes

[Any special considerations, blockers, or pending access requests]
```

### Update CLAUDE.md:

Add to the Project Identity section:

```markdown
## Project Identity

- **Name**: [discovered]
- **Stack**: [Frontend] + [Backend] + [Database]

## Access Configured

- [x] GitHub repo
- [ ] Database MCP
- [ ] Jira MCP
```

---

## 🔗 Next Prompt

| Condition               | Next Prompt                                               |
| ----------------------- | --------------------------------------------------------- |
| Config complete         | `discovery/phase-1-constitution/project-assessment.md`    |
| Missing critical access | Stay here, resolve blockers                               |

---

## Tips

1. **Don't block on optional info** - Fill what you can, mark pending items
2. **Prioritize MCP over CLI** - Richer context, better integration
3. **Ask incrementally** - Get repo first, then ask about tools as needed
4. **Validate access** - Run a simple query to confirm each connection works
