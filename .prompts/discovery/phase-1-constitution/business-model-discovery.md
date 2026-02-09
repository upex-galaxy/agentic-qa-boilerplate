# Business Model Discovery

> **Phase**: 1 - Constitution
> **Objective**: Discover and document the business model of an existing product

---

## 📥 Input Required

### From Previous Prompts:

- `.context/project-config.md` (from Phase 1)

### From Discovery Sources:

| Information       | MCP                       | CLI            | Code Analysis                   | User           |
| ----------------- | ------------------------- | -------------- | ------------------------------- | -------------- |
| Product overview  | `mcp__github` README      | `gh repo view` | README.md                       | Last resort    |
| Value proposition | -                         | -              | Landing page, marketing copy    | Ask if unclear |
| User types        | Atlassian MCP personas | -              | Auth/roles code                 | Ask if unclear |
| Revenue model     | -                         | -              | Pricing page, subscription code | Ask if needed  |

---

## 🎯 Objective

Create a Business Model Canvas by DISCOVERING information from the existing product, not by inventing it.

**Key mindset shift:**

- Original: "Define your value proposition"
- Discovery: "What value proposition does this product already deliver?"

---

## 🔍 Discovery Process

### Step 1: Product Overview Discovery

**Actions:**

1. Read the main README:

   ```bash
   cat README.md
   ```

2. Check for a landing page or marketing site:
   - Look in code for homepage content
   - Check deployed product if accessible

3. Look for "About" or mission statement in:
   - `/docs/`
   - `/public/` (static content)
   - Database seed files (initial content)

**Extract:**

- Product name and tagline
- Core problem statement
- Main value proposition

### Step 2: Customer Segments Discovery

**Actions:**

1. Analyze authentication/authorization code:

   ```bash
   # Look for user roles or types
   grep -r "role" --include="*.ts" --include="*.js" src/
   grep -r "userType" --include="*.ts" --include="*.js" src/
   ```

2. Check database for user-related tables:
   - If Supabase MCP available: query user/profile tables
   - If not: look at migration files or schema

3. Look at UI for different user flows:
   - Admin panels
   - Customer dashboards
   - Different navigation menus

**Extract:**

- Primary user type(s)
- Secondary user types (admin, support, etc.)
- User type characteristics

### Step 3: Value Proposition Discovery

**Actions:**

1. Analyze main features:

   ```bash
   # Look at main route files
   ls src/app/ src/pages/ 2>/dev/null

   # Look at API endpoints
   ls src/api/ src/routes/ 2>/dev/null
   ```

2. Check for feature flags or modules:

   ```bash
   grep -r "feature" --include="*.ts" config/
   ```

3. Review UI components for main functionality:
   - Dashboard widgets
   - Main navigation items
   - Key user actions

**Extract:**

- Core features (what the product DOES)
- Key benefits (what users GAIN)
- Pain points addressed (what problems it SOLVES)

### Step 4: Revenue Model Discovery (if applicable)

**Actions:**

1. Look for pricing or subscription code:

   ```bash
   grep -r "price\|subscription\|plan\|tier" --include="*.ts" src/
   ```

2. Check for payment integrations:

   ```bash
   grep -r "stripe\|paypal\|payment" package.json
   ```

3. Look at pricing page content or config

**Extract:**

- Revenue model type (SaaS, freemium, one-time, etc.)
- Pricing tiers (if any)
- Key monetization features

### Step 5: Synthesize Business Model Canvas

Compile findings into the standard canvas format.

---

## 📤 Output Generated

### Primary Output: `.context/idea/business-model.md`

```markdown
# Business Model - [Product Name]

> **Discovered from**: [List sources: README, code analysis, deployed product]
> **Discovery Date**: [Date]
> **Confidence Level**: [High/Medium/Low - based on source quality]

---

## Problem Statement

[2-3 paragraphs describing the core problem this product solves.
Base this on README content, marketing copy, or UI messaging.]

### Evidence:

- Source: [Where this was found]
- Quote: "[Exact quote if available]"

---

## Business Model Canvas

### 1. Customer Segments

**Who uses this product?**

| Segment          | Description   | Evidence                 |
| ---------------- | ------------- | ------------------------ |
| [Primary User]   | [Description] | Found in: [code/docs/UI] |
| [Secondary User] | [Description] | Found in: [code/docs/UI] |

### 2. Value Propositions

**What value does it deliver?**

| Value     | Description    | Evidence                   |
| --------- | -------------- | -------------------------- |
| [Value 1] | [How it helps] | [Feature that delivers it] |
| [Value 2] | [How it helps] | [Feature that delivers it] |

### 3. Channels

**How do users access the product?**

- [ ] Web application: [URL if known]
- [ ] Mobile app: [iOS/Android]
- [ ] API: [For integrations]
- [ ] Other: [Describe]

### 4. Customer Relationships

**How does the product engage users?**

| Type         | Implementation          | Evidence             |
| ------------ | ----------------------- | -------------------- |
| Self-service | [Yes/No]                | [UI patterns]        |
| Automated    | [Emails, notifications] | [Code references]    |
| Personal     | [Support channels]      | [Found in code/docs] |

### 5. Revenue Streams (if discovered)

**How does it generate revenue?**

| Stream     | Type                        | Evidence            |
| ---------- | --------------------------- | ------------------- |
| [Stream 1] | [Subscription/One-time/etc] | [Pricing code/page] |

_Note: Mark as "Unknown - requires user input" if not discoverable_

### 6. Key Resources

**What does the product need to operate?**

| Resource        | Type        | Evidence            |
| --------------- | ----------- | ------------------- |
| [Database]      | Technical   | [Schema analysis]   |
| [External APIs] | Integration | [package.json deps] |
| [Content]       | Data        | [Seed files, CMS]   |

### 7. Key Activities

**What are the main operations?**

Based on core features discovered:

1. [Activity 1] - [Related feature]
2. [Activity 2] - [Related feature]
3. [Activity 3] - [Related feature]

### 8. Key Partners

**External dependencies?**

| Partner/Service | Purpose            | Evidence                 |
| --------------- | ------------------ | ------------------------ |
| [Service 1]     | [What it provides] | [package.json or config] |
| [Service 2]     | [What it provides] | [API integrations]       |

### 9. Cost Structure (if discoverable)

**Main costs to operate?**

- Infrastructure: [Cloud services identified]
- Third-party services: [Paid APIs, SaaS tools]
- Other: [If discoverable]

---

## Discovery Gaps

**Information not found (requires user input):**

- [ ] [Gap 1] - Suggested source: [where to find it]
- [ ] [Gap 2] - Suggested source: [where to find it]

---

## QA Relevance

**How this informs testing:**

| Business Aspect    | Testing Implication               |
| ------------------ | --------------------------------- |
| [Customer Segment] | Test from [user type] perspective |
| [Value Prop]       | Ensure [feature] works correctly  |
| [Revenue Stream]   | Critical path: [payment flow]     |

---

## Sources Used

1. [Source 1]: [What was extracted]
2. [Source 2]: [What was extracted]
3. [Source 3]: [What was extracted]
```

### Update CLAUDE.md:

```markdown
## Phase 1 Progress

- [x] business-model-discovery.md ✅
  - Product: [Name]
  - Domain: [Industry/vertical]
  - Confidence: [High/Medium/Low]
```

---

## 🔗 Next Prompt

| Condition                   | Next Prompt                                          |
| --------------------------- | ---------------------------------------------------- |
| Business model documented   | `discovery/phase-1-constitution/domain-glossary.md`  |
| Need more context from user | Ask specific questions, then continue                |

---

## Tips

1. **Don't invent - discover**: Every statement should have a source
2. **Mark uncertainty**: Use "Unknown" or "Needs verification" for gaps
3. **Focus on QA relevance**: Highlight what matters for testing
4. **Be concise**: This is reference material, not a business plan
