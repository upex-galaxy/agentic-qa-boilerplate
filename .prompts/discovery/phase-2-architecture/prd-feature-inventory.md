# PRD: Feature Inventory Discovery

> **Phase**: 2 - Architecture
> **Objective**: Catalog all existing features in the product

---

## 📥 Input Required

### From Previous Prompts:

- `.context/PRD/executive-summary.md` (core capabilities)
- `.context/PRD/user-journeys.md` (user flows)
- `.context/idea/domain-glossary.md` (entities)

### From Discovery Sources:

| Information     | Primary Source          | Fallback            |
| --------------- | ----------------------- | ------------------- |
| Features        | API endpoints, routes   | Component analysis  |
| Feature status  | Feature flags, configs  | Code comments       |
| CRUD operations | API routes, forms       | Database operations |
| Integrations    | Package.json, API calls | Config files        |

---

## 🎯 Objective

Create a comprehensive inventory of ALL features by:

1. Mapping API endpoints to capabilities
2. Identifying UI features from components
3. Documenting integrations and dependencies
4. Noting feature maturity and completeness

---

## 🔍 Discovery Process

### Step 1: API-Based Feature Discovery

**Actions:**

1. List all API endpoints:

   ```bash
   # Next.js API routes
   find src/app/api -name "route.ts" | sort

   # Express/NestJS routes
   grep -r "get\|post\|put\|delete\|patch" --include="*.ts" src/routes/ src/controllers/ 2>/dev/null

   # Look for OpenAPI spec
   cat openapi.yaml swagger.json api-spec.json 2>/dev/null
   ```

2. Categorize by resource/entity:

   ```bash
   # Group endpoints by resource
   find src/app/api -name "route.ts" -exec dirname {} \; | sort | uniq
   ```

3. Identify CRUD operations:
   ```bash
   # Methods per endpoint
   grep -l "GET\|POST\|PUT\|DELETE" src/app/api/**/route.ts
   ```

**Output:**

```
/api/users      → User management (CRUD)
/api/products   → Product catalog (CRUD)
/api/orders     → Order processing (CRU)
/api/payments   → Payment processing
```

### Step 2: UI Feature Discovery

**Actions:**

1. Find feature components:

   ```bash
   # Major UI components
   ls src/components/features/ src/features/ 2>/dev/null

   # Form components (indicate user actions)
   find src -name "*Form*.tsx" -o -name "*form*.tsx"
   ```

2. Analyze dashboard widgets:

   ```bash
   # Dashboard components
   grep -r "dashboard\|widget\|card" --include="*.tsx" src/components/ | head -30
   ```

3. Find modals and dialogs (indicate actions):
   ```bash
   # Modal components
   find src -name "*Modal*.tsx" -o -name "*Dialog*.tsx"
   ```

**Output:**

- Feature components list
- User action points
- Interactive elements

### Step 3: Feature Flag Discovery

**Actions:**

1. Find feature flag configuration:

   ```bash
   # Look for feature flags
   grep -r "feature.*flag\|featureFlag\|isEnabled\|FEATURE_" --include="*.ts" src/

   # Environment-based features
   grep -r "process.env.*FEATURE\|NEXT_PUBLIC.*FEATURE" --include="*.ts" src/
   ```

2. Check for A/B testing:
   ```bash
   grep -r "experiment\|variant\|abtest" --include="*.ts" src/
   ```

**Output:**

- Active features
- Disabled/WIP features
- Experimental features

### Step 4: Integration Discovery

**Actions:**

1. Check external service integrations:

   ```bash
   # Package.json dependencies
   cat package.json | grep -E "stripe|twilio|sendgrid|auth0|firebase|aws-sdk"

   # API client configurations
   find src -name "*client*.ts" -o -name "*service*.ts" | head -20
   ```

2. Find external API calls:
   ```bash
   # Fetch calls to external services
   grep -r "fetch.*http\|axios\|api\." --include="*.ts" src/services/
   ```

**Output:**

- Third-party integrations
- External API dependencies

### Step 5: Categorize and Organize

Group features by:

- Domain area (from glossary)
- User type (from personas)
- Maturity level (stable, beta, planned)

---

## 📤 Output Generated

### Primary Output: `.context/PRD/feature-inventory.md`

```markdown
# Feature Inventory - [Product Name]

> **Discovered from**: API routes, UI components, configurations
> **Discovery Date**: [Date]
> **Total Features**: [Count]
> **Last Updated**: [Date]

---

## Inventory Summary

| Category  | Features | Status         |
| --------- | -------- | -------------- |
| Core      | [count]  | Stable         |
| Secondary | [count]  | Stable         |
| Beta      | [count]  | Testing        |
| Planned   | [count]  | In Development |

---

## Feature Catalog

### Category: User Management

#### Feature: User Registration

| Aspect            | Value                                |
| ----------------- | ------------------------------------ |
| **ID**            | `FEAT-001`                           |
| **Status**        | ✅ Stable                            |
| **Endpoints**     | `POST /api/auth/register`            |
| **UI Components** | `RegisterForm`, `EmailVerification`  |
| **User Types**    | Public                               |
| **Dependencies**  | Email service, Database              |
| **Evidence**      | `src/app/api/auth/register/route.ts` |

**Capabilities:**

- [x] Email/password registration
- [x] Email verification
- [ ] Social login (Google) - _found in code but disabled_
- [ ] Social login (GitHub) - _not implemented_

---

#### Feature: User Authentication

| Aspect            | Value                                           |
| ----------------- | ----------------------------------------------- |
| **ID**            | `FEAT-002`                                      |
| **Status**        | ✅ Stable                                       |
| **Endpoints**     | `POST /api/auth/login`, `POST /api/auth/logout` |
| **UI Components** | `LoginForm`, `LogoutButton`                     |
| **User Types**    | All                                             |
| **Dependencies**  | Session management                              |
| **Evidence**      | `src/app/api/auth/`                             |

**Capabilities:**

- [x] Email/password login
- [x] Remember me
- [x] Session management
- [x] Logout

---

### Category: [Domain Area from Glossary]

#### Feature: [Feature Name]

| Aspect            | Value                 |
| ----------------- | --------------------- |
| **ID**            | `FEAT-XXX`            |
| **Status**        | [Stable/Beta/Planned] |
| **Endpoints**     | [List]                |
| **UI Components** | [List]                |
| **User Types**    | [Who can use it]      |
| **Dependencies**  | [External services]   |
| **Evidence**      | [Code path]           |

**Capabilities:**

- [x] [Capability 1]
- [x] [Capability 2]
- [ ] [Missing capability]

---

## CRUD Matrix

| Entity   | Create   | Read     | Update     | Delete   | Evidence        |
| -------- | -------- | -------- | ---------- | -------- | --------------- |
| User     | ✅       | ✅       | ✅         | ⚠️ Soft  | `api/users/`    |
| Product  | ✅       | ✅       | ✅         | ✅       | `api/products/` |
| Order    | ✅       | ✅       | ⚠️ Limited | ❌       | `api/orders/`   |
| [Entity] | [status] | [status] | [status]   | [status] | [path]          |

**Legend:**

- ✅ Full support
- ⚠️ Partial/conditional
- ❌ Not available

---

## API Endpoint Inventory

### Authentication (`/api/auth/`)

| Method | Endpoint           | Purpose           | Auth Required |
| ------ | ------------------ | ----------------- | ------------- |
| POST   | `/register`        | Create new user   | No            |
| POST   | `/login`           | Authenticate user | No            |
| POST   | `/logout`          | End session       | Yes           |
| POST   | `/forgot-password` | Reset request     | No            |
| POST   | `/reset-password`  | Reset password    | Token         |

### [Resource] (`/api/[resource]/`)

| Method | Endpoint | Purpose  | Auth Required |
| ------ | -------- | -------- | ------------- |
| GET    | `/`      | List all | Yes           |
| GET    | `/:id`   | Get one  | Yes           |
| POST   | `/`      | Create   | Yes           |
| PUT    | `/:id`   | Update   | Yes           |
| DELETE | `/:id`   | Delete   | Yes (Admin)   |

---

## UI Component Inventory

### Forms

| Component      | Purpose      | Route            | Features           |
| -------------- | ------------ | ---------------- | ------------------ |
| `RegisterForm` | User signup  | `/auth/register` | Validation, submit |
| `LoginForm`    | User login   | `/auth/login`    | Remember me        |
| `ProfileForm`  | Edit profile | `/profile`       | Avatar upload      |
| [Component]    | [Purpose]    | [Route]          | [Features]         |

### Dashboards/Views

| Component   | Purpose       | Route        | Data Source   |
| ----------- | ------------- | ------------ | ------------- |
| `Dashboard` | Main overview | `/dashboard` | Multiple APIs |
| `Analytics` | Usage stats   | `/analytics` | Analytics API |
| [Component] | [Purpose]     | [Route]      | [Data Source] |

---

## Third-Party Integrations

| Service   | Purpose    | Package             | Status    |
| --------- | ---------- | ------------------- | --------- |
| Stripe    | Payments   | `@stripe/stripe-js` | ✅ Active |
| SendGrid  | Emails     | `@sendgrid/mail`    | ✅ Active |
| Sentry    | Monitoring | `@sentry/nextjs`    | ✅ Active |
| [Service] | [Purpose]  | [Package]           | [Status]  |

### Integration Details

#### Stripe Integration

| Aspect            | Value                                     |
| ----------------- | ----------------------------------------- |
| **Purpose**       | Payment processing                        |
| **Features Used** | Checkout, Subscriptions                   |
| **Endpoints**     | `/api/payments/*`, `/api/webhooks/stripe` |
| **Evidence**      | `src/services/stripe.ts`                  |

---

## Feature Flags

| Flag                    | Description          | Default   | Environment   |
| ----------------------- | -------------------- | --------- | ------------- |
| `FEATURE_NEW_DASHBOARD` | New dashboard UI     | `false`   | Staging only  |
| `FEATURE_BETA_EXPORT`   | Export functionality | `false`   | All           |
| [Flag]                  | [Description]        | [Default] | [Environment] |

---

## Planned/WIP Features

| Feature     | Evidence                    | Estimated Status       |
| ----------- | --------------------------- | ---------------------- |
| [Feature 1] | TODO comments, partial code | 60% complete           |
| [Feature 2] | Empty route handler         | Not started            |
| [Feature 3] | Feature flag disabled       | Complete, not released |

---

## Discovery Gaps

| Gap                 | Impact                 | How to Resolve  |
| ------------------- | ---------------------- | --------------- |
| [Hidden features]   | May miss test coverage | Check with team |
| [Undocumented APIs] | Integration issues     | Review API logs |

---

## QA Relevance

### Feature Test Coverage Matrix

| Feature ID | Unit Tests | Integration | E2E      | Status    |
| ---------- | ---------- | ----------- | -------- | --------- |
| FEAT-001   | ✅         | ✅          | ⚠️       | Needs E2E |
| FEAT-002   | ✅         | ✅          | ✅       | Complete  |
| FEAT-XXX   | [status]   | [status]    | [status] | [notes]   |

### High-Risk Features (Prioritize Testing)

| Feature   | Risk Factor | Reason         |
| --------- | ----------- | -------------- |
| Payments  | HIGH        | Revenue impact |
| Auth      | HIGH        | Security       |
| [Feature] | [Level]     | [Reason]       |
```

### Update CLAUDE.md:

```markdown
## Phase 2 Progress - PRD

- [x] prd-executive-summary.md ✅
- [x] prd-user-personas.md ✅
- [x] prd-user-journeys.md ✅
- [x] prd-feature-inventory.md ✅
  - Features: [count]
  - Endpoints: [count]
  - Integrations: [count]
```

---

## 🔗 Next Prompt

| Condition          | Next Prompt                 |
| ------------------ | --------------------------- |
| Inventory complete | `srs-architecture-specs.md` |
| Missing API docs   | Extract from code           |
| Need Jira mapping  | Use Atlassian MCP           |

---

## Tips

1. **API endpoints = Features** - Each endpoint is a capability
2. **Forms indicate actions** - Every form is a user operation
3. **Integrations matter** - Third-party services are features too
4. **Feature flags reveal roadmap** - Disabled features show plans
