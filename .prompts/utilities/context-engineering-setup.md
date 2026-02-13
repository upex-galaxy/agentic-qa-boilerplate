# Context Engineering Setup

> **Purpose:** Generate/update README.md and AI project memory file for the test automation project.
> **When to Use:** After KATA framework setup, after discovery, or to refresh documentation.
> **Output:** Updated `README.md` + AI-specific project memory file.

---

## Instructions for AI

This prompt generates two essential documents:

1. **README.md** - Professional documentation for the test automation project
2. **Project Memory File** - AI-specific configuration file (CLAUDE.md, GEMINI.md, etc.)

---

## STEP 0: Identify AI Tool

### 0.1 Detect Current Tool

First, identify which AI tool is being used. Check for existing configuration:

```bash
# Check for existing AI config files
ls CLAUDE.md 2>/dev/null && echo "✓ Claude Code detected (CLAUDE.md exists)"
ls GEMINI.md 2>/dev/null && echo "✓ Gemini CLI detected (GEMINI.md exists)"
ls AGENTS.md 2>/dev/null && echo "✓ Claude Agent SDK detected (AGENTS.md exists)"
ls .cursor/rules 2>/dev/null && echo "✓ Cursor detected (.cursor/rules exists)"
ls .github/copilot-instructions.md 2>/dev/null && echo "✓ GitHub Copilot detected"
```

### 0.2 AI Tool Reference

If no config file exists or unclear, **ASK THE USER**:

```markdown
Which AI tool are you using? I need to create the correct project memory file:

| Tool | Config File | Location |
|------|-------------|----------|
| **Claude Code** | `CLAUDE.md` | Project root |
| **Gemini CLI** | `GEMINI.md` | Project root |
| **Claude Agent SDK** | `AGENTS.md` | Project root |
| **Cursor** | `rules` | `.cursor/rules` |
| **GitHub Copilot** | `copilot-instructions.md` | `.github/copilot-instructions.md` |
| **Windsurf** | `rules` | `.windsurf/rules` |
| **Other** | Specify the file name and location |
```

### 0.3 Set Target File

Based on detection or user response:

| AI Tool | File Name | Location | Auto-loaded? |
|---------|-----------|----------|--------------|
| Claude Code | `CLAUDE.md` | `./CLAUDE.md` | Yes |
| Gemini CLI | `GEMINI.md` | `./GEMINI.md` | Yes |
| Claude Agent SDK | `AGENTS.md` | `./AGENTS.md` | Yes |
| Cursor | `rules` | `./.cursor/rules` | Yes |
| GitHub Copilot | `copilot-instructions.md` | `./.github/copilot-instructions.md` | Yes |
| Windsurf | `rules` | `./.windsurf/rules` | Yes |

**Important:** If the directory doesn't exist (e.g., `.cursor/`), create it first.

---

## STEP 1: Detect Project State

### 1.1 Check What Exists

Run these checks to understand the current state:

```bash
# KATA Framework
ls tests/components/TestContext.ts 2>/dev/null && echo "✓ TestContext exists"
ls tests/components/api/ApiBase.ts 2>/dev/null && echo "✓ ApiBase exists"
ls tests/components/ui/UiBase.ts 2>/dev/null && echo "✓ UiBase exists"
ls playwright.config.ts 2>/dev/null && echo "✓ Playwright config exists"

# Context Files
ls .context/business-data-map.md 2>/dev/null && echo "✓ Business data map exists"
ls .context/api-architecture.md 2>/dev/null && echo "✓ API architecture exists"
ls .context/project-test-guide.md 2>/dev/null && echo "✓ Test guide exists"

# Project Identity
ls .context/idea/business-model.md 2>/dev/null && echo "✓ Business model exists"
```

### 1.2 Determine Mode

Based on what exists:

| Condition | Mode | Action |
|-----------|------|--------|
| KATA + Context files exist | **Full Update** | Generate complete README + Update all sections |
| KATA exists, no context | **Minimal Update** | Generate basic README + Keep placeholders |
| No KATA framework | **Stop** | Guide user to run `setup/kata-framework-adaptation.md` first |

---

## STEP 2: Gather Information

### 2.1 Read Available Context

**If context files exist, read in order:**

```
Priority 1 (Project Identity):
├── .context/idea/business-model.md
└── .context/project-config.md (if exists)

Priority 2 (Technical Context):
├── .context/api-architecture.md
├── .context/business-data-map.md
└── .context/project-test-guide.md

Priority 3 (Configuration):
├── package.json
├── playwright.config.ts
└── .env.example (if exists)
```

### 2.2 Extract Key Information

**From context files:**
- Target project name
- Application URL(s) (dev, staging, prod)
- Tech stack (frontend, backend, database)
- Main entities/domains
- Critical APIs
- Test priorities

**From test project:**
- Available npm/bun scripts
- Playwright configuration (browsers, projects)
- Existing test directories structure
- Implemented components (count)

### 2.3 If No Context Exists

Ask the user to provide:

```markdown
To generate project-specific documentation, I need:

1. **Target Project Name**: What application are we testing?
2. **Application URL**: Staging/dev URL to test against
3. **Tech Stack**: Frontend, backend, database technologies
4. **Main Flows**: Top 3 user journeys to test

Or run discovery prompts first:
1. `.prompts/discovery/phase-1-constitution/project-connection.md`
2. `.prompts/utilities/business-data-map.md`
```

---

## STEP 3: Generate README.md

### 3.1 Security Rules

**README MUST NOT include:**
- Real credentials or API keys
- Production URLs with sensitive data
- Access tokens or secrets
- Personal user information

**Always use:**
- `.env.example` to document variables
- Placeholders: `{your-api-key}`, `{your-url}`
- References to internal documentation

### 3.2 README Structure

Generate README.md with this structure:

```markdown
# {Project Name} - Test Automation

> Test automation suite for [{Target Project Name}]({repo URL})
> Built with **KATA Framework** + Playwright

## Overview
[Brief description of what this test suite covers]

### Test Coverage
| Type | Status | Description |
|------|--------|-------------|
| E2E | ✅/🔄 | [Coverage description] |
| Integration | ✅/🔄 | [API coverage description] |

## Tech Stack
[Table with: Playwright version, TypeScript, Bun, reporters]

## Quick Start
[Installation steps, environment setup, run commands]

## Available Scripts
[Tables for: Test Execution, Reports, Code Quality, Utilities]
(Sync with actual package.json scripts)

## Project Structure
[Simplified tree of tests/ directory]

## KATA Framework
[Brief explanation with link to kata-ai-index.md]

## AI-Assisted Development
[Reference to project memory file and context engineering]

## Links
[Links to guidelines, target project, documentation]
```

### 3.3 Sync Scripts with package.json

Read `package.json` and ensure all scripts are documented:

```bash
# Extract scripts from package.json
cat package.json | jq '.scripts'
```

---

## STEP 4: Generate/Update Project Memory File

### 4.1 File Content Structure

The project memory file should contain:

```markdown
# {TOOL_NAME}.md - Project Memory

> **Purpose**: Operational context loaded every AI session.
> **Usage**: AI reads this file automatically at session start.

## Quick Start
[Commands and how to write tests]

## Project Identity
[Placeholders or real values for: Name, Type, Stack, Repos]

## Fundamental Rules (Always in Memory)
### TypeScript Patterns
[Summary table + reference link]

### KATA Architecture
[4-layer diagram + ATC rules + reference link]

### Git Flow
[Branches + commit prefixes + reference link]

## Context Loading by Task
[Table: Task → Files to load]

## MCPs Available
[Table: MCP → When to use → Guide location]

## CLI Tools
[Table: Script → Usage → Documentation location]

## Test Project Structure
[Simplified tree]

## Critical Test Priorities
[Placeholders]

## Discovery Progress
[Checklist of completed phases]

## Access Configuration
[Configured vs Pending checklist]

## Testing Decisions
[Table: Aspect → Decision → Rationale]

## Known Issues & Blockers
[Placeholder table]

## Session Log
[Placeholder for session entries]

## Next Actions
[Placeholder for priorities]
```

### 4.2 Sections to Update with Real Values

If context exists, update:
- **Project Identity**: Name, Type, Stack, URLs
- **Discovery Progress**: Mark completed phases
- **Access Configuration**: Check MCP configs, .env status
- **Critical Test Priorities**: Extract from project-test-guide.md

### 4.3 Sections to Preserve

Keep these sections unchanged (stable rules):
- Fundamental Rules (TypeScript, KATA, Git Flow)
- Context Loading by Task
- MCPs Available
- CLI Tools

### 4.4 Reference to This Prompt

Include in the Quick Start section:

```markdown
**Generate/Update Project Documentation:**
# Use this prompt to regenerate README.md and update this file
@.prompts/utilities/context-engineering-setup.md
```

---

## STEP 5: Validate Output

### 5.1 Security Check

Scan generated files for:
- [ ] No hardcoded passwords
- [ ] No API keys
- [ ] No production URLs with tokens
- [ ] No email addresses (except placeholders)

### 5.2 Reference Check

Verify that all referenced files exist:
- [ ] Guidelines referenced exist
- [ ] Scripts in README exist in package.json
- [ ] Directory structure matches actual structure

### 5.3 Consistency Check

- [ ] Project name matches between README and project memory file
- [ ] URLs are consistent
- [ ] Tech stack information matches

---

## STEP 6: Write Files

### 6.1 Write README.md

```
Location: ./README.md (project root)
Action: Replace existing file
```

### 6.2 Write Project Memory File

```
Location: Determined in STEP 0 (e.g., ./CLAUDE.md, ./GEMINI.md, ./.cursor/rules)
Action: Create new or update specific sections (preserve structure)
```

**If directory doesn't exist:**
```bash
# Example for Cursor
mkdir -p .cursor
```

---

## STEP 7: Notify User

After completion, report:

```markdown
✅ Project documentation updated successfully

**AI Tool Detected:** {Tool Name}

**Files Modified:**
├── README.md              # Complete rewrite with project info
└── {PROJECT_MEMORY_FILE}  # Updated: Project Identity, Discovery Progress, Access Config

**README.md includes:**
- Project overview and test coverage status
- Tech stack (synced with package.json)
- Installation and setup guide
- Available scripts (synced with package.json)
- Project structure
- KATA framework reference

**{PROJECT_MEMORY_FILE} updated with:**
- Project Identity: {name, type, stack}
- Discovery Progress: {completed phases}
- Access Configuration: {configured MCPs}

**Next Steps:**
1. Review README.md and adjust descriptions if needed
2. Verify {PROJECT_MEMORY_FILE} has correct information
3. Run a test to confirm setup: `bun run test --grep "example"`
```

---

## Examples

### Example: Claude Code (Full Update)

```markdown
# Detected
✓ AI Tool: Claude Code
✓ KATA Framework configured
✓ Context files exist

# Output
├── README.md           # Generated with project details
└── CLAUDE.md           # Updated with real values
```

### Example: Cursor (Minimal Update)

```markdown
# Detected
✓ AI Tool: Cursor
✓ KATA Framework configured
✗ No context files

# Output
├── README.md           # Generated with placeholders
└── .cursor/rules       # Created with template (placeholders preserved)
```

### Example: GitHub Copilot (New Setup)

```markdown
# Detected
✓ AI Tool: GitHub Copilot
✓ KATA Framework configured
✗ No existing config

# Output
├── README.md                           # Generated
└── .github/copilot-instructions.md     # Created (directory already existed)
```

---

## Final Checklist

- [ ] AI tool identified correctly
- [ ] Project state detected
- [ ] Available context read
- [ ] README.md generated
- [ ] Project memory file created/updated in correct location
- [ ] Security check passed
- [ ] References validated
- [ ] User notified of changes

---

**Version:** 3.0
**Last Updated:** 2026-02-12
