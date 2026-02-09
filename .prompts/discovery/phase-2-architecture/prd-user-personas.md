# PRD: User Personas Discovery

> **Phase**: 2 - Architecture
> **Objective**: Identify and document user types from the existing system

---

## 📥 Input Required

### From Previous Prompts:

- `.context/idea/business-model.md` (customer segments)
- `.context/PRD/executive-summary.md` (target users overview)

### From Discovery Sources:

| Information          | Primary Source             | Fallback            |
| -------------------- | -------------------------- | ------------------- |
| User roles           | Auth/permissions code      | Database user table |
| User characteristics | UI variations, dashboards  | Ask user            |
| User workflows       | Navigation, feature access | Route analysis      |
| User needs           | Form fields, actions       | Support docs        |

---

## 🎯 Objective

Create user personas by DISCOVERING who actually uses the system, based on:

- How the system authenticates users
- What different views/permissions exist
- What actions different users can perform

**Key insight**: In existing products, personas are defined by the **code**, not by research.

---

## 🔍 Discovery Process

### Step 1: Role/Permission Discovery

**Actions:**

1. Find authentication/authorization code:

   ```bash
   # Look for role definitions
   grep -r "enum.*Role\|type.*Role\|const.*ROLE" --include="*.ts" src/

   # Look for permission checks
   grep -r "hasPermission\|canAccess\|isAdmin\|isAuth" --include="*.ts" src/
   ```

2. Check database for user-related fields:

   ```bash
   # Prisma schema
   grep -A20 "model User" prisma/schema.prisma 2>/dev/null

   # Look for role/type columns
   grep -r "role\|userType\|accountType" prisma/schema.prisma 2>/dev/null
   ```

3. Check middleware for role-based access:
   ```bash
   grep -r "middleware\|guard\|protect" --include="*.ts" src/middleware/ src/guards/ 2>/dev/null
   ```

**Output:**

- List of defined roles
- Permission levels
- Role hierarchy (if exists)

### Step 2: UI Variation Discovery

**Actions:**

1. Find role-based UI rendering:

   ```bash
   # Conditional rendering based on role
   grep -r "role.*===\|isAdmin\|canEdit\|hasAccess" --include="*.tsx" src/components/
   ```

2. Check for different dashboards/views:

   ```bash
   # Look for role-specific pages
   ls src/app/admin/ src/app/dashboard/ src/pages/admin/ 2>/dev/null

   # Check for conditional navigation
   grep -r "nav.*role\|menu.*admin" --include="*.tsx" src/
   ```

3. Identify feature access patterns:
   ```bash
   # Features behind permissions
   grep -r "disabled.*role\|hidden.*permission" --include="*.tsx" src/
   ```

**Output:**

- Different UI experiences per role
- Feature access by role
- Navigation differences

### Step 3: User Attribute Discovery

**Actions:**

1. Analyze user profile fields:

   ```bash
   # Profile component fields
   grep -r "profile\|account" --include="*.tsx" src/components/ | head -20

   # User update forms
   grep -r "updateUser\|editProfile" --include="*.ts" src/
   ```

2. Check registration/signup flow:

   ```bash
   # Signup form fields
   grep -r "signup\|register" --include="*.tsx" src/ | head -20
   ```

3. Review user-related validations:
   ```bash
   # User validation schemas
   grep -r "userSchema\|profileSchema" --include="*.ts" src/
   ```

**Output:**

- User attributes collected
- Required vs optional fields
- User categorization fields

### Step 4: Synthesize Personas

Map discovered roles to personas with:

- Role name → Persona name
- Permissions → Goals/Needs
- UI access → Workflows
- Attributes → Demographics (inferred)

---

## 📤 Output Generated

### Primary Output: `.context/PRD/user-personas.md`

```markdown
# User Personas - [Product Name]

> **Discovered from**: Auth code, UI components, database schema
> **Discovery Date**: [Date]
> **Total Personas**: [Count]

---

## Persona Discovery Summary

| Persona  | System Role | Access Level | Primary Goal |
| -------- | ----------- | ------------ | ------------ |
| [Name 1] | `admin`     | Full         | [Goal]       |
| [Name 2] | `user`      | Standard     | [Goal]       |
| [Name 3] | `guest`     | Limited      | [Goal]       |

---

## Persona 1: [Name] (Primary User)

### Identity

| Attribute                | Value                   | Evidence                       |
| ------------------------ | ----------------------- | ------------------------------ |
| **System Role**          | `[role_value]`          | Found in: `src/types/user.ts`  |
| **Access Level**         | [Full/Standard/Limited] | Permissions: [list]            |
| **Estimated % of Users** | [X%]                    | Based on: [DB query/analytics] |

### Goals (Inferred from Features)

Based on accessible features, this user wants to:

| Goal     | Supporting Feature | Route/Component   |
| -------- | ------------------ | ----------------- |
| [Goal 1] | [Feature]          | `src/app/[route]` |
| [Goal 2] | [Feature]          | `src/app/[route]` |
| [Goal 3] | [Feature]          | `src/app/[route]` |

### Pain Points (Inferred from Validation/Errors)

Based on validation rules and error handling:

| Pain Point     | Evidence                   |
| -------------- | -------------------------- |
| [Pain point 1] | Error message: "[message]" |
| [Pain point 2] | Validation: [rule]         |

### Feature Access

| Feature     | Access     | Evidence               |
| ----------- | ---------- | ---------------------- |
| [Feature 1] | ✅ Full    | No restrictions        |
| [Feature 2] | ⚠️ Limited | Requires: [permission] |
| [Feature 3] | ❌ None    | Admin only             |

### User Journey Summary
```

Login → [Dashboard] → [Primary Action] → [Secondary Action] → [Complete/Logout]

````

### Profile Attributes (from schema)

| Attribute | Type | Required | Purpose |
|-----------|------|----------|---------|
| `email` | string | Yes | Authentication |
| `name` | string | Yes | Display |
| [Other fields from User model] |

### Representative Quote (Inferred)
> "[Based on the product's value proposition, what would this user say?]"

---

## Persona 2: [Name] (Secondary User)

[Same structure as Persona 1]

---

## Persona 3: [Name] (Admin/Support)

[Same structure as Persona 1]

---

## Role Hierarchy

```mermaid
graph TD
    SUPER_ADMIN[Super Admin]
    ADMIN[Admin]
    USER[Standard User]
    GUEST[Guest]

    SUPER_ADMIN --> ADMIN
    ADMIN --> USER
    USER --> GUEST

    SUPER_ADMIN -.-> |"All permissions"| ALL[*]
    ADMIN -.-> |"Manage users, content"| MANAGE
    USER -.-> |"CRUD own data"| OWN
    GUEST -.-> |"Read only"| READ
````

---

## Permission Matrix

| Permission       | Super Admin | Admin | User | Guest |
| ---------------- | ----------- | ----- | ---- | ----- |
| View content     | ✅          | ✅    | ✅   | ✅    |
| Create content   | ✅          | ✅    | ✅   | ❌    |
| Edit own content | ✅          | ✅    | ✅   | ❌    |
| Edit all content | ✅          | ✅    | ❌   | ❌    |
| Manage users     | ✅          | ✅    | ❌   | ❌    |
| System settings  | ✅          | ❌    | ❌   | ❌    |

---

## Discovery Gaps

**Needs user input:**

| Gap                      | Why It Matters         | Question to Ask                         |
| ------------------------ | ---------------------- | --------------------------------------- |
| Actual user demographics | Better test data       | "What's the typical user age/location?" |
| User acquisition channel | Test registration flow | "How do users find the product?"        |
| [Other gaps]             | [Impact]               | [Question]                              |

---

## QA Relevance

### Test Account Requirements

Based on personas, testing requires:

| Persona     | Test Account     | Permissions Needed |
| ----------- | ---------------- | ------------------ |
| [Persona 1] | `test_user@...`  | [role]             |
| [Persona 2] | `test_admin@...` | [role]             |

### Critical Persona Flows to Test

| Persona     | Critical Flow | Why               |
| ----------- | ------------- | ----------------- |
| [Persona 1] | [Flow]        | [Business impact] |
| [Persona 2] | [Flow]        | [Business impact] |

### Edge Cases by Persona

| Persona     | Edge Case   | Test Scenario |
| ----------- | ----------- | ------------- |
| [Persona 1] | [Edge case] | [How to test] |
| [Persona 2] | [Edge case] | [How to test] |

````

### Update CLAUDE.md:

```markdown
## Phase 2 Progress - PRD
- [x] prd-executive-summary.md ✅
- [x] prd-user-personas.md ✅
  - Personas discovered: [count]
  - Roles found: [list]
````

---

## 🔗 Next Prompt

| Condition               | Next Prompt                     |
| ----------------------- | ------------------------------- |
| Personas documented     | `prd-user-journeys.md`          |
| Need role clarification | Ask user                        |
| Missing permission info | Check middleware, then continue |

---

## Tips

1. **Roles ARE personas** - In code, roles define user types
2. **Permissions reveal goals** - What users CAN do = what they WANT to do
3. **UI variations show differences** - Different dashboards = different needs
4. **Don't over-complicate** - 2-4 personas usually enough
