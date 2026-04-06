# Session Start

Act as a Senior QA Engineer preparing a testing session for a ticket (User Story or Bug).

---

## TASK

**INITIALIZE TESTING SESSION FOR A TICKET**

This is the ENTRY POINT for all QA testing. Execute all steps before proceeding to any workflow.

**Works for:**
- User Stories → then use `us-qa-workflow.md` or `stage-1-planning/feature-test-plan.md`
- Bugs → then use `bug-qa-workflow.md`

---

## PREREQUISITE

> **Before executing any TMS commands**, load the TMS CLI Skill (if configured for your project):
> - Xray: `Use skill: xray-cli`
> - Other TMS: Load the relevant CLI or MCP tool
>
> The Skill contains complete command reference, ID formats, and traceability workflow.

---

## INPUT REQUIRED

**Ticket ID:** `TK-{number}`

---

## WORKFLOW

### Step 1: Fetch Ticket from TMS

Retrieve ticket details using the configured TMS tool:

```bash
# Examples by TMS:
# Xray:  bun xray test list --project PROJ
# Jira MCP: Use MCP Atlassian to fetch issue
# Other: Use your project's TMS CLI
```

Extract and note:
- **Title**: Full ticket title
- **Project/Module**: For folder structure
- **Status**: Should be ready for testing
- **Sprint**: Current sprint
- **Acceptance Criteria**: All ACs to test
- **Dependencies**: Related tickets
- **Comments/Discussions**: Team discussions (included in jira_get_issue response)

---

### Step 1b: Extract Team Discussions from Ticket Comments

The `jira_get_issue` response from Step 1 includes ticket comments. Process them now.

**Extract from comments:**
- **Decisions**: Agreed-upon behavior, scope changes, AC clarifications
- **Technical notes**: Implementation details shared by developers
- **Edge cases**: Scenarios or concerns raised by team members
- **Blockers/warnings**: Known issues or constraints

**Formatting rules:**

| Rule | Detail |
|------|--------|
| Format | `[Author] (date): key point` per relevant comment |
| Grouping | If 5+ comments, group by theme (decisions, technical, edge cases) |
| Skip | Automated comments (bot messages, status transitions, CI notifications) |
| Skip | Social comments ("thanks!", "looks good", emoji-only) |
| Images | Note as `[image attachment: {filename}]` — not downloadable |
| >10 threads | Include 10 most recent substantive comments, note total count |

**This step is NON-BLOCKING:**

| Scenario | Action |
|----------|--------|
| Comments exist | Format into "Team Discussion" section for context.md (Step 7) |
| No comments | Note: "No team discussions found on this ticket" |
| MCP unavailable | Log warning, note "Comments not loaded (MCP unavailable)", continue |
| Step 1 failed entirely | Skip Step 1b, continue to Step 2 |

---

### Step 2: Explain to User (REQUIRED)

**STOP and explain the story to the user:**

Provide a brief, easy-to-understand summary:
- What is this feature about?
- How does it work?
- What will we be testing?
- Any important team decisions from ticket comments (scope changes, dev notes, PO clarifications)

**Example:**
```
This story is about showing empty states in the Dashboard.
When a user hasn't uploaded their data yet,
the page should show "Awaiting Data" instead of the normal dashboard.

We'll test 4 acceptance criteria:
- AC1: Show "Awaiting Data" when no file exists
- AC2: Show "Synced" when integration completes
- AC3: Only one empty state at a time
- AC4: Show file reception date

The team discussed in the comments:
- Dev confirmed: API returns 204 (No Content) when no data exists
- PM clarified: admin view is out of scope for this story

Shall we proceed?
```

> **Note:** If team discussions reveal decisions that modify or extend the ACs,
> highlight them explicitly so the user is aware of context beyond the original ticket.

**WAIT for user confirmation before continuing.**

---

### Step 3: Load Project Context (MUST-READ Files)

Read these files to understand the system:

```bash
# REQUIRED - Read all available context files
.context/business-data-map.md      # Business flows and state machines
.context/api-architecture.md       # API endpoints and authentication
.context/project-test-guide.md     # Testing guide (what to test)
```

These provide:
- Business flows and state machines
- API endpoints and authentication
- System architecture and testing strategy

> **Note:** Not all files may exist yet. Read what's available. If none exist, run the Discovery prompts first (`discovery/`).

---

### Step 4: Check Module Context (3-Level Hierarchy)

**Context Hierarchy:**
```
Project Context (system-wide)
    ↓
Module Context (feature area - e.g., Orders, Dashboard)
    ↓
Story Context (individual ticket - TK-XXX)
```

**Check if module context exists:**
```bash
# Module folder naming: kebab-case from project/module name
# Example: "Monthly Statement Improvements" → "monthly-statement"

ls .context/PBI/{module-name}/module-context.md
```

**Decision:**
| Module Context | Action |
|----------------|--------|
| **Exists** | Read it → Skip full code exploration → Use existing knowledge |
| **Not exists** | Create module folder → Do full exploration → Generate module-context.md |

---

### Step 4a: Load OR Create Module Context

**IF module-context.md EXISTS:**
```bash
# Read existing module context
.context/PBI/{module-name}/module-context.md

# Skip to Step 4c with this knowledge loaded
```

**IF module-context.md DOES NOT EXIST:**

Search for code related to this ticket in the application repositories:

**Backend (`{backend-repo}`):**
```bash
# Search for controllers, services, models related to the feature
# Example patterns:
# - src/{Module}/Controllers/
# - src/{Module}/Services/
# - src/{Module}/Models/
```

**Frontend (`{frontend-repo}`):**
```bash
# Search for routes, state, components related to the feature
# Example patterns:
# - src/routes/{feature}.ts
# - src/state/{feature}-state.ts
# - src/components/{feature}/
```

> **Note:** Replace `{backend-repo}` and `{frontend-repo}` with the paths configured in `CLAUDE.md` → Project Identity table.

---

### Step 4b: Generate Module Context (if new module)

**Create module-context.md using template:**
```bash
# Template location:
.context/PBI/module-context-template.md

# Output location:
.context/PBI/{module-name}/module-context.md
```

Fill with:
- Routes discovered
- State files found
- API endpoints
- Database tables
- Key entities for testing

**This is REUSABLE** — next ticket in same module will skip exploration!

---

### Step 4c: Document Story-Specific Findings

After loading/creating module context, note any **story-specific** code not in module context.

---

### Step 5: Load Playwright CLI Skill

```
Use skill: playwright-cli
```

This activates the Playwright CLI for browser interactions during testing.

---

### Step 6: Create PBI Structure (3-Level Hierarchy)

Create the local documentation structure.

**Derive `{module-name}` from the ticket's project or module field:**
1. Get the project/module field from the ticket (e.g., `Order Management`)
2. Convert to kebab-case: `order-management`

**Create these folders/files:**

```bash
# If module folder doesn't exist, create it:
mkdir -p .context/PBI/{module-name}/TK-{number}-{brief-title}/evidence

# Structure after creation:
.context/PBI/
├── templates/                      # Templates (do not edit)
│   └── module-context.md
├── {module-name}/                  # MODULE LEVEL (reusable)
│   ├── module-context.md           # Module documentation (persists)
│   └── TK-{number}-{brief-title}/  # STORY LEVEL ← CREATE THIS
│       ├── context.md              # Story-specific context ← CREATE IN STEP 7
│       ├── test-analysis.md        # ATP mirror (if exists)
│       ├── test-report.md          # ATR mirror (if exists)
│       └── evidence/               # Screenshots (gitignored) ← CREATE NOW
```

**Folder naming:**
- `{module-name}`: kebab-case from the ticket's project/module field
- `{brief-title}`: AI-generated summary (max ~5 words, kebab-case)

**Key Principle:** Module context is SHARED across stories in the same module!

---

### Step 7: Create Initial context.md

Write the context.md file with all gathered information:

```markdown
# TK-{number}: {Title}

**Ticket:** TK-{number}
**Module:** {module-name}
**Status:** {status}
**Sprint:** {sprint}

---

## Acceptance Criteria

- AC1: {description}
- AC2: {description}
...

---

## Team Discussion

> Extracted from ticket comments. Reflects team decisions and context
> beyond the formal AC definitions.

### Key Decisions
- [{Author}] ({date}): {decision or clarification}

### Technical Notes
- [{Author}] ({date}): {implementation detail or constraint}

### Edge Cases Raised
- [{Author}] ({date}): {edge case or concern}

{If no comments: "No team discussions found on this ticket."}
{If MCP failed: "Comments not loaded (MCP unavailable)."}

---

## Related Code

### Backend
- `{path}` - {description}

### Frontend
- `{path}` - {description}

### Database
- Tables: {tables}

---

## TMS Artifacts

| Artifact | ID | Status |
|----------|----|--------|
| ATP | Pending | Created in Stage 1 |
| ATR | Pending | Created in Stage 3 |

**Note:** TMS artifacts (ATP, ATR, TCs) are created in Stage 1 (Planning).

---

## Session Notes

### Session 1 - {today's date}

**Context loaded:** business-data-map, api-architecture
**Code explored:** {list of files}
**Environment:** {staging/dev}

{Notes will be added during testing}
```

---

## OUTPUT

After completing all steps, provide summary:

```markdown
## Session Initialized: TK-{number}

**Ticket:** {Title}
**Module:** {module-name}
**ACs to Test:** {count}
**Team Discussions:** {count} relevant comments extracted

### Context Loaded (3-Level Hierarchy)
**Project Level:**
- [x] business-data-map.md
- [x] api-architecture.md
- [x] project-test-guide.md

**Module Level:**
- [{loaded/created}] .context/PBI/{module-name}/module-context.md

**Story Level:**
- [x] .context/PBI/{module-name}/TK-{number}-{brief-title}/context.md

### Code Explored
- Module Context: {existing/new}
- Story-specific files: {files found}

### TMS Artifacts
- ATP/ATR/TCs: Created in next workflow step

### PBI Structure
```
.context/PBI/{module-name}/
├── module-context.md        # {existing/created}
└── TK-{number}-{brief-title}/
    ├── context.md           # Created
    └── evidence/            # Ready for screenshots
```

### Next Step

**For User Stories:**
- `us-qa-workflow.md` (full workflow) OR
- `stage-1-planning/feature-test-plan.md` (Stage 1 only)

**For Bugs:**
- `bug-qa-workflow.md`
```

---

## ERROR HANDLING

| Situation | Action |
|-----------|--------|
| Ticket not found | Verify ticket ID, check TMS |
| Ticket not ready for testing | Wait for deployment |
| No ACs defined | Request ACs before testing |
| No test data found | Expand query, ask user for alternatives |
| Code not found | Search with alternative terms |
| No comments on ticket | Continue — note in context.md |
| Too many comments (>10) | Summarize 10 most recent, note earlier omitted |
| Comments contain only images | Note as `[image attachment]`, continue |

---

## BEHAVIOR REMINDERS

1. **Explain to user** — Always explain the story before proceeding
2. **Wait for confirmation** — Don't continue without user approval
3. **Document in English** — All files and TMS content in English
4. **ALWAYS explore code** — Never skip the code exploration step
5. **Save context** — Everything goes to PBI for persistence
6. **Include team discussions** — Extract and use ticket comments to enrich context

---

## NEXT STEP

After session start, proceed to the appropriate workflow:

| Ticket Type | Workflow | Purpose |
|-------------|----------|---------|
| **User Story** | `us-qa-workflow.md` | Full workflow (Stages 1-6) |
| **User Story** | `stage-1-planning/feature-test-plan.md` | Stage 1 only (Planning) |
| **Bug** | `bug-qa-workflow.md` | Complete bug retesting |

**Note:** Test Data Discovery and Playwright configuration are done in the next workflow, not here.
