# KATA Framework Adaptation

> **Purpose**: Adapt the KATA template to your specific project.
> **When to Use**: After cloning this template and completing Discovery.
> **Output**: `.context/PBI/kata-framework-adaptation-plan.md` + Implementation (on approval).

---

## Overview

This prompt transforms the generic KATA boilerplate into a project-specific test automation framework. It operates in two phases:

1. **Phase 1: Analysis + Plan** - Generate an adaptation plan
2. **Phase 2: Implementation** - Execute the plan (requires user approval)

---

## PHASE 1: ANALYSIS + PLAN

### STEP 1.1: Read Project Context

**Read ALL files in these directories (MANDATORY):**

```
.context/
├── SRS/                    # ALL files (architecture, contracts, specs)
├── PRD/                    # ALL files (personas, features, journeys)
├── idea/                   # ALL files (business-model, domain-glossary)
├── api-architecture.md     # If exists
├── business-data-map.md    # If exists
└── project-test-guide.md   # If exists
```

**Purpose**: Understand the target project's:
- Business domain and terminology
- Technical architecture (API, frontend, database)
- Authentication system
- Main entities and flows
- Testing priorities

### STEP 1.2: Read KATA Guidelines

**Read these files (MANDATORY):**

```
.context/guidelines/TAE/
├── kata-ai-index.md                    # Entry point - concepts overview
├── playwright-automation-system.md     # DI, fixtures, session reuse
├── automation-standards.md             # ATC rules, naming conventions
├── typescript-patterns.md              # Code patterns
└── kata-architecture.md                # 4-layer architecture
```

**Purpose**: Understand how to properly implement KATA patterns.

### STEP 1.3: Read Template Structure

**Run this command to see the full structure:**

```bash
tree tests/ -L 3
```

**Read these critical files:**

```
tests/
├── setup/
│   ├── global.setup.ts         # CRITICAL: Session preparation
│   ├── ui-auth.setup.ts        # CRITICAL: UI authentication flow
│   └── api-auth.setup.ts       # CRITICAL: API authentication flow
├── components/
│   ├── TestContext.ts          # Layer 1: Base utilities
│   ├── TestFixture.ts          # Layer 4: DI entry point
│   ├── ApiFixture.ts           # Layer 4: API DI container
│   ├── UiFixture.ts            # Layer 4: UI DI container
│   ├── api/
│   │   ├── ApiBase.ts          # Layer 2: HTTP helpers
│   │   └── AuthApi.ts          # Layer 3: Auth component (example)
│   └── ui/
│       ├── UiBase.ts           # Layer 2: Playwright helpers
│       └── LoginPage.ts        # Layer 3: Login component (example)
├── data/
│   ├── DataFactory.ts          # Test data generation
│   └── types.ts                # Shared types
└── utils/
    └── decorators.ts           # @atc decorator
```

**Also read:**

```
config/
└── variables.ts                # Environment configuration

playwright.config.ts            # Playwright projects configuration
package.json                    # Dependencies and scripts
.env.example                    # Required environment variables
```

### STEP 1.4: Analyze Authentication Strategy

Based on project context, determine:

**For API Authentication:**
- Authentication method (Bearer token, API key, OAuth, JWT)
- Login endpoint
- Token format and expiration
- Refresh strategy (if any)

**For UI Authentication:**
- Login page URL
- Login form fields
- Success indicator (URL change, element visible)
- Session storage method

**Key Concept - Session Reuse:**

```
┌─────────────────────────────────────────────────────────────────┐
│ global-setup                                                    │
│ └─ Prepares environment, creates directories                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         ▼                               ▼
┌───────────────────┐           ┌───────────────────┐
│ ui-setup          │           │ api-setup         │
│ • Login via UI    │           │ • Login via API   │
│ • Save storageState│          │ • Save token      │
│ → .auth/user.json │           │ → .auth/api-state.json │
└─────────┬─────────┘           └─────────┬─────────┘
          │                               │
          ▼                               ▼
┌───────────────────┐           ┌───────────────────┐
│ E2E tests         │           │ Integration tests │
│ • Use storageState│           │ • Use saved token │
│ • Already logged in│          │ • Auth header set │
└───────────────────┘           └───────────────────┘
```

### STEP 1.5: Identify Components to Create

Based on project entities, determine which components are needed:

**API Components (tests/components/api/):**
- AuthApi.ts (always needed - adapt existing)
- {Entity}Api.ts for each main entity

**UI Components (tests/components/ui/):**
- LoginPage.ts (always needed - adapt existing)
- {Entity}Page.ts for each main page/feature

**Flows (tests/components/flows/):**
- Setup flows for common preconditions

### STEP 1.6: Ask User Questions (If Needed)

If any critical information is missing from context, ask:

```markdown
To complete the adaptation plan, I need clarification:

1. **Authentication Endpoint**: What is the API endpoint for login?
   - Example: `/auth/token`, `/api/login`, `/connect/token`

2. **Test User Credentials**: Where are the test credentials stored?
   - Options: .env file, secrets manager, hardcoded in config

3. **First Priority Entity**: Which domain entity should we implement first?
   - Examples: Users, Products, Orders, Bookings

4. **Environment URLs**: What are the staging/dev URLs?
   - UI Base URL: ___
   - API Base URL: ___
```

### STEP 1.7: Generate Adaptation Plan

Create file: `.context/PBI/kata-framework-adaptation-plan.md`

**Use this template:**

```markdown
# KATA Framework Adaptation Plan

> **Generated**: {DATE}
> **Project**: {PROJECT_NAME}
> **Status**: PENDING APPROVAL

---

## 1. Project Summary

| Aspect | Value |
|--------|-------|
| Target Application | {name} |
| Stack | {frontend} + {backend} + {database} |
| Auth System | {OAuth/JWT/Session/etc} |
| Main Entities | {list of entities} |

---

## 2. Authentication Strategy

### 2.1 Global Setup

**Current file**: `tests/setup/global.setup.ts`
**Changes needed**: {minimal/none - creates directories}

### 2.2 API Authentication

**Current file**: `tests/setup/api-auth.setup.ts`
**Auth method**: {Bearer token / API key / OAuth}
**Token endpoint**: {endpoint}
**Changes needed**:
- Update endpoint in AuthApi
- Modify token extraction if different format
- Update credentials source

**Implementation**:
```typescript
// Example: What the modified authenticateSuccessfully should look like
```

### 2.3 UI Authentication

**Current file**: `tests/setup/ui-auth.setup.ts`
**Login URL**: {url}
**Form fields**: {email, password / username, password}
**Changes needed**:
- Update locators in LoginPage
- Modify success assertion
- Update token interception endpoint

**Implementation**:
```typescript
// Example: What the modified loginSuccessfully should look like
```

---

## 3. Components to Create

### 3.1 API Components

| Component | File | Endpoints | Priority |
|-----------|------|-----------|----------|
| AuthApi | Modify existing | /auth/login | Critical |
| {Entity}Api | Create new | /{entities}/* | High |

### 3.2 UI Components

| Component | File | Pages | Priority |
|-----------|------|-------|----------|
| LoginPage | Modify existing | /login | Critical |
| {Entity}Page | Create new | /{entities}/* | High |

---

## 4. Files to Modify

| File | Section | Changes |
|------|---------|---------|
| `config/variables.ts` | urls, auth | Update baseUrl, apiUrl, login endpoint |
| `tests/components/api/AuthApi.ts` | endpoints | Match project's auth API |
| `tests/components/ui/LoginPage.ts` | locators | Match project's login form |
| `tests/components/ApiFixture.ts` | components | Add new API components |
| `tests/components/UiFixture.ts` | components | Add new UI components |
| `playwright.config.ts` | baseURL | Update to project URL |
| `.env` | credentials | Add test user credentials |

---

## 5. Environment Variables

```env
# Application URLs
BASE_URL={staging_url}
API_URL={api_url}

# Test User Credentials
TEST_USER_EMAIL={email}
TEST_USER_PASSWORD={password}

# TMS (Optional)
XRAY_CLIENT_ID=
XRAY_CLIENT_SECRET=
```

---

## 6. Implementation Steps

### Phase A: Core Authentication (Critical)

1. [ ] Update `config/variables.ts` with project URLs
2. [ ] Update `tests/components/api/AuthApi.ts` with correct endpoint
3. [ ] Update `tests/components/ui/LoginPage.ts` with correct locators
4. [ ] Verify `tests/setup/api-auth.setup.ts` works
5. [ ] Verify `tests/setup/ui-auth.setup.ts` works
6. [ ] Run smoke test to confirm auth

### Phase B: First Domain Components (High)

7. [ ] Create first `{Entity}Api.ts` component
8. [ ] Create first `{Entity}Page.ts` component
9. [ ] Add components to fixtures
10. [ ] Write first domain test

### Phase C: Validation

11. [ ] Run `bun run type-check` - must pass
12. [ ] Run `bun run lint` - must pass
13. [ ] Run `bun run test --grep @smoke` - must pass
14. [ ] Verify session reuse (run 2+ tests)

---

## 7. AI Implementation Guidelines

### KATA Rules to Follow

- **ATCs are complete flows**: Each ATC = one test case with expected output
- **Locators inline**: Extract to constructor only if used in 2+ ATCs
- **ATCs don't call ATCs**: Use Flows module for chains
- **Use @atc decorator**: All ATCs must be decorated
- **Import aliases mandatory**: Use @utils/, @api/, @ui/, @variables

### Authentication Implementation

- `global.setup.ts` runs ONCE before all tests
- UI setup saves `storageState` to `.auth/user.json`
- API setup saves token to `.auth/api-state.json`
- Tests automatically load saved auth state

### Component Creation Pattern

```typescript
// API Component
import { ApiBase } from '@api/ApiBase';
import { atc } from '@utils/decorators';

export class {Entity}Api extends ApiBase {
  private readonly endpoints = {
    list: '/api/{entities}',
    get: (id: string) => `/api/{entities}/${id}`,
  };

  @atc('PROJ-API-001')
  async get{Entity}Successfully(id: string) {
    const [response, body] = await this.apiGET<{Entity}Response>(
      this.endpoints.get(id)
    );
    expect(response.status()).toBe(200);
    expect(body.id).toBeDefined();
    return [response, body];
  }
}
```

```typescript
// UI Component
import { UiBase } from '@ui/UiBase';
import { atc } from '@utils/decorators';

export class {Entity}Page extends UiBase {
  async goto() {
    await this.page.goto('/{entities}');
  }

  @atc('PROJ-UI-001')
  async view{Entity}Successfully() {
    // Locators inline
    await expect(this.page.getByTestId('{entity}-title')).toBeVisible();
  }
}
```

### Fixture Update Pattern

```typescript
// In ApiFixture.ts
import { {Entity}Api } from '@api/{Entity}Api';

export class ApiFixture extends ApiBase {
  {entity}: {Entity}Api;

  constructor(options: TestContextOptions) {
    super(options);
    this.{entity} = new {Entity}Api(options);
  }
}
```

---

## 8. Questions Answered

{Include any questions asked and user responses}

---

## 9. Approval Checklist

Before proceeding to implementation, confirm:

- [ ] Authentication strategy is correct
- [ ] Environment URLs are accurate
- [ ] Components to create are appropriate
- [ ] Test user credentials are available
- [ ] Ready to proceed with implementation

---

**Next Step**: Review this plan and confirm approval to proceed with Phase 2 implementation.
```

---

## PHASE 2: IMPLEMENTATION

> **Trigger**: User approves the plan generated in Phase 1

### STEP 2.1: Read Approved Plan

Read `.context/PBI/kata-framework-adaptation-plan.md` to understand:
- Exact changes needed for each file
- Order of implementation
- Authentication specifics

### STEP 2.2: Update Configuration

**File**: `config/variables.ts`

Update:
- `urlMap` with project URLs
- `auth.loginEndpoint` with correct endpoint
- Verify `testUser` reads from environment correctly

### STEP 2.3: Update Auth Components

**File**: `tests/components/api/AuthApi.ts`

- Update endpoint URL
- Modify request body format if needed
- Adjust response parsing

**File**: `tests/components/ui/LoginPage.ts`

- Update form field locators
- Modify success assertion
- Keep `goto()` separate from ATCs

### STEP 2.4: Verify Auth Setup Files

**File**: `tests/setup/api-auth.setup.ts`

- Should work with updated AuthApi
- Test by running: `bun run test --project=api-setup`

**File**: `tests/setup/ui-auth.setup.ts`

- Should work with updated LoginPage
- Test by running: `bun run test --project=ui-setup`

### STEP 2.5: Create Domain Components

For each identified component:

1. Create the component file
2. Add to corresponding fixture
3. Write at least one ATC

### STEP 2.6: Update Fixtures

**File**: `tests/components/ApiFixture.ts`

- Import new API components
- Add as class properties
- Initialize in constructor

**File**: `tests/components/UiFixture.ts`

- Import new UI components
- Add as class properties
- Initialize in constructor

### STEP 2.7: Create First Test

Create a smoke test that verifies:
- Authentication works
- Basic navigation works
- At least one domain operation works

**Location**: `tests/e2e/{feature}/smoke.test.ts`

### STEP 2.8: Validate

Run validation commands:

```bash
bun run type-check    # TypeScript compilation
bun run lint          # ESLint
bun run test --grep @smoke  # Smoke test
```

### STEP 2.9: Report Completion

After implementation, update:
- Plan file status to COMPLETED
- CLAUDE.md with project-specific information

Report to user:
- What was implemented
- What tests were created
- Any issues encountered
- Next recommended steps

---

## Implementation Notes

### Common Adaptation Points

| Area | Template Value | Adapt To |
|------|----------------|----------|
| Login endpoint | `/connect/token` | Project's auth endpoint |
| Login locators | `#email`, `#password` | Project's form selectors |
| Token format | `access_token` | Project's token field |
| Success URL | `/dashboard` | Project's post-login URL |
| API prefix | `/api` | Project's API prefix |

### Troubleshooting

**Auth fails in setup**:
- Check endpoint URL in AuthApi
- Verify credentials in .env
- Check token response format

**UI login fails**:
- Check locators match actual form
- Verify success assertion
- Check token interception URL

**Type errors**:
- Run `bun run type-check` for details
- Check import aliases
- Verify interface definitions

---

## Checklist

- [ ] Phase 1: Context read completely
- [ ] Phase 1: Guidelines understood
- [ ] Phase 1: Template structure analyzed
- [ ] Phase 1: Auth strategy determined
- [ ] Phase 1: Components identified
- [ ] Phase 1: Plan generated
- [ ] Phase 1: User approved plan
- [ ] Phase 2: Configuration updated
- [ ] Phase 2: Auth components modified
- [ ] Phase 2: Setup files verified
- [ ] Phase 2: Domain components created
- [ ] Phase 2: Fixtures updated
- [ ] Phase 2: Smoke test passing
- [ ] Phase 2: Type-check passing
- [ ] Phase 2: Lint passing

---

**Version**: 1.0
**Last Updated**: 2026-02-13
