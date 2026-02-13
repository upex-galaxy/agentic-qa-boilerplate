# Business Data Map Generator

Act as a **Business Systems Analyst** and **Technical Storyteller**.

---

## MISSION

Your objective is to **DEEPLY UNDERSTAND** how this system works and generate a **visual and narrative map** that explains:

- How data flows through the system
- Why entities exist and their relationships
- Business flows for each important feature
- State machines and their transitions
- Automatic processes and their purpose

**Philosophy:**

- **Visual first:** Use ASCII diagrams for easy comprehension
- **Business narrative:** Explain the "why", not just the "what"
- **Don't duplicate MCP data:** Don't list schema, RLS, or functions (those are obtained via MCP in real-time)
- **Synthesis, not extraction:** Combine code + DB + logic to create understanding

**Output:** `.context/business-data-map.md`

---

## PHASE 0: DISCOVERY

### 0.1 Detect Configuration

**Automatically identify:**

1. **Project system prompt:**
   - Search for: `CLAUDE.md`, `GEMINI.md`, `CURSOR.md`, `COPILOT.md`, `.ai-instructions.md`
   - Save name for later update

2. **Project name and purpose:**
   - Read: `package.json`, `README.md`
   - Extract system description

3. **Database MCP available:**
   - Detect what tools you have to explore the DB
   - Use to UNDERSTAND, not to list

4. **Existing documentation:**
   - Search for: `.context/PRD/`, `.context/SRS/`, `docs/`
   - Use as business context if it exists

### 0.2 Detect Mode

```
Does .context/business-data-map.md exist?
  → YES: UPDATE mode (show diff, ask for confirmation)
  → NO: CREATE mode (generate from scratch)
```

---

## PHASE 1: DEEP EXPLORATION

### 📦 BUSINESS ENTITIES

**Understand:**

- What are the CORE domain concepts?
- What does each entity represent in the real world?
- Why does each entity exist? What problem does it solve?
- How do they relate to each other? Why those relationships?

**Explore code + DB to understand, NOT to list.**

---

### 🔄 BUSINESS FLOWS

**Identify each important feature of the system:**

- What are the main functionalities?
- How does data travel in each one?
- What endpoints, services, and tables participate?
- What business rules apply?

**For each flow, trace the complete journey:** User → API → Logic → DB → Response

---

### 📊 STATES AND TRANSITIONS

**Understand:**

- Which entities have states (pending, active, completed...)?
- What are the valid transitions?
- What events trigger each transition?
- What consequences does each state change have?

---

### ⚡ AUTOMATIC PROCESSES

**Identify:**

- **Triggers:** What executes automatically in the DB?
- **Cron jobs:** What processes run periodically?
- **Webhooks:** What external events trigger actions?

**For each one:** Why does it exist? What problem does it solve?

---

### 🔗 EXTERNAL INTEGRATIONS

**Understand:**

- What external services are used?
- How do they impact system data?
- What flows depend on them?

---

## PHASE 2: DOCUMENT GENERATION

### Generate: `.context/business-data-map.md`

The document should be **VISUAL** and **NARRATIVE**. Use ASCII diagrams extensively.

---

### OUTPUT STRUCTURE

```markdown
# Business Data Map: [Project Name]

╔══════════════════════════════════════════════════════════════════════════════╗
║ [NAME] - BUSINESS DATA MAP                                                    ║
║ [Short system description]                                                    ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

#### 1. EXECUTIVE SUMMARY

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ 📋 EXECUTIVE SUMMARY                                                          │
└──────────────────────────────────────────────────────────────────────────────┘

## What does this system do?

[2-3 paragraphs explaining the business purpose, the problem it solves,
and how it creates value for users]

## Main Actors

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    Actor 1      │    │    Actor 2      │    │    Actor 3      │
│  (description)  │    │  (description)  │    │  (description)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘

## Value Proposition

[How the system benefits each actor]
```

---

#### 2. ENTITY MAP

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ 📦 ENTITY MAP                                                                 │
└──────────────────────────────────────────────────────────────────────────────┘

[ASCII diagram showing main entities and their relationships]

Example:
┌───────────────────┐
│    auth.users     │
└─────────┬─────────┘
          │ trigger
          ▼
┌───────────────────┐
│     profiles      │──────────┬──────────┐
└───────────────────┘          │          │
          │                    │          │
          ▼                    ▼          ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│    bookings     │  │     reviews     │  │    messages     │
└─────────────────┘  └─────────────────┘  └─────────────────┘

### Entities and Their Business Role

| Entity   | Business Role     | Why It Exists           |
| -------- | ----------------- | ----------------------- |
| [name]   | [what it represents] | [problem it solves]  |
| ...      | ...               | ...                     |

### Key Relationships

[Narrative explaining WHY the main relationships exist,
not just that they exist]
```

---

#### 3. BUSINESS FLOWS

**Document EACH important feature of the system.**

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🔄 BUSINESS FLOWS                                                             │
└──────────────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════
FLOW 1: [FLOW/FEATURE NAME]
═══════════════════════════════════════════════════════════════════════════════

[ASCII diagram of the complete flow]

Example:
┌─────────────┐   POST /api/xxx   ┌─────────────────┐
│    User     │ ───────────────────► │   API Route     │
│             │      {payload}       │                 │
└─────────────┘                      └────────┬────────┘
                                              │
                                              ▼
                                    ┌─────────────────┐
                                    │    Service      │
                                    │    (logic)      │
                                    └────────┬────────┘
                                              │
                                              ▼
                                    ┌─────────────────┐
                                    │    Database     │
                                    │    (tables)     │
                                    └─────────────────┘

**Flow Narrative:**

1. The user [initial action]...
2. The system [validation/process]...
3. Data is persisted in [table] with state [state]...
4. [Side effects: emails, webhooks, etc.]

**Business Rules:**

- [Rule 1]: [Description and why it exists]
- [Rule 2]: [Description and why it exists]

**Code Involved:**

- `src/app/api/...` → [what it does]
- `src/lib/...` → [what it does]

═══════════════════════════════════════════════════════════════════════════════
FLOW 2: [FLOW/FEATURE NAME]
═══════════════════════════════════════════════════════════════════════════════

[Repeat structure for each important flow]
```

**Document ALL important system flows.** Don't limit yourself to 3.

---

#### 4. STATE MACHINES

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ 📊 STATE MACHINES                                                             │
└──────────────────────────────────────────────────────────────────────────────┘

### [Entity with states]

┌─────────────────────────────────────────────────────────────────────────────┐
│ [ENTITY] STATUS MACHINE                                                      │
│─────────────────────────────────────────────────────────────────────────────│
│                                                                              │
│   ┌──────────┐   (event)   ┌──────────┐   (event)   ┌──────────┐           │
│   │ State A  │ ─────────────► │ State B  │ ─────────────► │ State C  │      │
│   └──────────┘             └──────────┘             └──────────┘           │
│        │                         │                                          │
│        │ (cancellation)          │ (cancellation)                          │
│        ▼                         ▼                                          │
│   ┌──────────────────────────────────────────┐                             │
│   │              CANCELLED                    │                             │
│   └──────────────────────────────────────────┘                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

**Transitions:**

| From | To        | Triggering Event  | Effects         |
| ---- | --------- | ----------------- | --------------- |
| A    | B         | [what causes it]  | [what happens]  |
| B    | C         | [what causes it]  | [what happens]  |
| *    | Cancelled | [conditions]      | [consequences]  |

**Business Rules:**

- [Why these transitions and not others]
- [Important restrictions]
```

---

#### 5. AUTOMATIC PROCESSES

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ ⚡ AUTOMATIC PROCESSES                                                        │
└──────────────────────────────────────────────────────────────────────────────┘

### Database Triggers

| Trigger  | When It Executes  | What It Does | Why It Exists           |
| -------- | ----------------- | ------------ | ----------------------- |
| [name]   | INSERT on [table] | [action]     | [problem it solves]     |

### Cron Jobs

| Job      | Frequency  | What It Does | Why It Exists          |
| -------- | ---------- | ------------ | ---------------------- |
| [name]   | [when]     | [process]    | [business need]        |

[Diagram of cron job flow if complex]

### Incoming Webhooks

| Webhook    | Source     | What It Processes | System Effects          |
| ---------- | ---------- | ----------------- | ----------------------- |
| [endpoint] | [service]  | [event]           | [tables/states affected]|

[Diagram of webhook flow if complex]
```

---

#### 6. EXTERNAL INTEGRATIONS

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🔗 EXTERNAL INTEGRATIONS                                                      │
└──────────────────────────────────────────────────────────────────────────────┘

### [External Service 1]

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  [Your System]                              [External Service]              │
│       │                                           │                         │
│       │──── API call ────────────────────────────►│                         │
│       │                                           │                         │
│       │◄─── webhook/response ────────────────────│                         │
│       │                                           │                         │
└─────────────────────────────────────────────────────────────────────────────┘

**What it does:** [Purpose of the integration]

**How it affects data:**

- [Affected table/entity]: [how]

**Flows that depend on this:**

- [Flow 1]
- [Flow 2]
```

---

## PHASE 3: INTEGRATION

### 3.1 Update System Prompt

Search in the system prompt file (CLAUDE.md or similar) if a "Business Data Map" or "Database" section exists.

**If it DOESN'T exist, add:**

```markdown
## Business Data Map

See `.context/business-data-map.md` for comprehensive visual documentation of:

- System overview and business purpose
- Entity relationships and their business meaning
- Business flows for each major feature
- State machines and lifecycle management
- Automatic processes (triggers, cron jobs, webhooks)
- External integrations

**Key flows:** [list the main ones]

**Last updated:** [date]
```

**If it exists, update** with relevant information.

### 3.2 UPDATE Mode

If UPDATE mode was detected:

1. Generate the new map
2. Compare with the previous version
3. Show summary of changes:

```
📊 Changes detected:

ENTITIES:
+ new_table (added)
~ profiles (new relationships)

FLOWS:
+ Payment flow (new)
~ Booking flow (modified)

INTEGRATIONS:
+ Stripe webhook (new)

Do you want to apply these changes? (yes/no)
```

4. Only overwrite if user confirms

---

## FINAL CHECKLIST

Before saving, verify:

- [ ] Visual header with project name
- [ ] Executive summary clearly explains what the system does
- [ ] Entity map with ASCII diagram and business roles
- [ ] ALL important flows documented with ASCII diagrams
- [ ] State machines for entities with states
- [ ] Automatic processes with their reason for existing
- [ ] External integrations mapped
- [ ] System prompt updated with reference

---

## FINAL REPORT

When finished, show:

```markdown
# ✅ Business Data Map Generated

## File Created:

`.context/business-data-map.md`

## System Documented:

[Project name] - [brief description]

## Content:

- **Entities documented:** N
- **Business flows:** N
- **State machines:** N
- **Automatic processes:** N triggers, N cron jobs, N webhooks
- **External integrations:** N

## System Prompt Updated:

`[file]` - "Business Data Map" section added/updated

## Related Documents:

For development and testing guides based on this map, run:

- `.prompts/utilities/api-architecture.md`
- `.prompts/utilities/project-test-guide.md`
```

---

## PHILOSOPHY OF THIS PROMPT

- **Visual first:** ASCII diagrams are easier to understand than text
- **Business narrative:** Explain the "why", don't just list the "what"
- **Don't duplicate MCP:** Schema, RLS, functions are obtained via MCP in real-time
- **Valuable synthesis:** Combines code + DB + logic into something that cannot be obtained from a single place
- **Agnostic:** Works with any technology stack

**Use the tools you have available** (MCPs, file search, code reading) to freely explore the system and build genuine understanding.
