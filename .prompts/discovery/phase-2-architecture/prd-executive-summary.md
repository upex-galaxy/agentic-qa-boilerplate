# PRD: Executive Summary Discovery

> **Phase**: 2 - Architecture
> **Objective**: Discover and document the product's purpose, value, and success metrics

---

## 📥 Input Required

### From Previous Prompts:

- `.context/idea/business-model.md` (from Phase 1)
- `.context/idea/domain-glossary.md` (from Phase 1)

### From Discovery Sources:

| Information     | Primary Source                 | Fallback       |
| --------------- | ------------------------------ | -------------- |
| Product purpose | README, landing page           | Ask user       |
| Core features   | Route structure, API endpoints | Code analysis  |
| Success metrics | Analytics config, monitoring   | Ask user       |
| Target users    | Auth roles, UI variations      | Business model |

---

## 🎯 Objective

Create an executive summary that captures:

1. What problem the product solves
2. How it solves it (high-level)
3. Who it serves
4. How success is measured

This document is the **entry point** for anyone needing to understand the product.

---

## 🔍 Discovery Process

### Step 1: Problem Statement Discovery

**Actions:**

1. Review README for problem description:

   ```bash
   head -50 README.md
   ```

2. Check landing/home page content:

   ```bash
   # Look for hero text, taglines
   grep -r "hero\|tagline\|headline" --include="*.tsx" src/
   cat src/app/page.tsx src/pages/index.tsx 2>/dev/null | head -100
   ```

3. Look for "About" or "Why" content:

   ```bash
   find . -name "*about*" -o -name "*why*" | head -10
   ```

4. Check existing documentation:
   - Confluence/Notion (via MCP if available)
   - `/docs/` folder

**Extract:**

- Core problem being solved
- Impact on users
- Why this solution exists

### Step 2: Solution Overview Discovery

**Actions:**

1. Identify core features from navigation:

   ```bash
   # Look at main navigation/routes
   grep -r "path.*:\|href=" --include="*.tsx" src/components/nav* src/app/layout* 2>/dev/null
   ```

2. Analyze main API capabilities:

   ```bash
   # List API routes
   ls src/app/api/ src/pages/api/ src/routes/ 2>/dev/null
   ```

3. Check feature flags or modules:
   ```bash
   grep -r "feature\|module\|enabled" --include="*.ts" config/ src/config/ 2>/dev/null
   ```

**Extract:**

- 3-5 core features
- How each addresses the problem
- What makes this solution unique

### Step 3: Success Metrics Discovery

**Actions:**

1. Check for analytics integration:

   ```bash
   grep -r "analytics\|track\|event\|metric" --include="*.ts" --include="*.tsx" src/ 2>/dev/null | head -20
   ```

2. Look for monitoring/observability:

   ```bash
   grep -r "sentry\|datadog\|newrelic\|prometheus" package.json 2>/dev/null
   ```

3. Check for conversion/engagement tracking:
   ```bash
   grep -r "conversion\|signup\|purchase\|complete" --include="*.ts" src/
   ```

**Extract:**

- What metrics are being tracked
- Key conversion points
- Engagement indicators

### Step 4: Target Users Overview

**Actions:**

1. Reference user types from auth code (found in Phase 1):

   ```bash
   grep -r "role\|userType\|permission" --include="*.ts" src/auth/ src/middleware/ 2>/dev/null
   ```

2. Summarize from business model discovered in Phase 1

**Extract:**

- Primary user type(s)
- Secondary users
- Brief description of each

---

## 📤 Output Generated

### Primary Output: `.context/PRD/executive-summary.md`

```markdown
# Executive Summary - [Product Name]

> **Discovered from**: [README, landing page, code analysis]
> **Discovery Date**: [Date]
> **Document Status**: [Draft/Review/Final]

---

## Problem Statement

### The Challenge

[2-3 paragraphs describing the problem this product addresses.
Include specific pain points and their impact on users.]

**Evidence:**

- Source: [Where this was found]
- Key quote: "[If available]"

### Current Alternatives

[Brief mention of how users solved this before, if discoverable]

---

## Solution Overview

### Product Vision

[One sentence describing what the product is and does]

### Core Capabilities

| #   | Feature        | Problem Addressed           | Evidence                             |
| --- | -------------- | --------------------------- | ------------------------------------ |
| 1   | [Feature name] | [What pain point it solves] | [Route/component that implements it] |
| 2   | [Feature name] | [What pain point it solves] | [Route/component that implements it] |
| 3   | [Feature name] | [What pain point it solves] | [Route/component that implements it] |
| 4   | [Feature name] | [What pain point it solves] | [Route/component that implements it] |
| 5   | [Feature name] | [What pain point it solves] | [Route/component that implements it] |

### Key Differentiators

[What makes this solution unique - discovered from marketing/docs]

---

## Success Metrics

### Tracked Metrics (Discovered)

| Metric     | Type                        | Implementation     | Source           |
| ---------- | --------------------------- | ------------------ | ---------------- |
| [Metric 1] | Adoption/Engagement/Revenue | [How it's tracked] | [Code reference] |
| [Metric 2] | Adoption/Engagement/Revenue | [How it's tracked] | [Code reference] |
| [Metric 3] | Adoption/Engagement/Revenue | [How it's tracked] | [Code reference] |

### Inferred KPIs (Based on features)

| KPI     | Why It Matters    | Related Feature |
| ------- | ----------------- | --------------- |
| [KPI 1] | [Business impact] | [Feature]       |
| [KPI 2] | [Business impact] | [Feature]       |

### Unknown Metrics

_The following would be valuable but weren't discovered:_

- [ ] [Metric type] - suggest: [how to implement]

---

## Target Users

### Primary User: [User Type Name]

| Aspect       | Description                              |
| ------------ | ---------------------------------------- |
| **Who**      | [Brief description]                      |
| **Need**     | [What they need from the product]        |
| **Evidence** | [Where this user type was found in code] |

### Secondary User: [User Type Name]

| Aspect       | Description                              |
| ------------ | ---------------------------------------- |
| **Who**      | [Brief description]                      |
| **Need**     | [What they need from the product]        |
| **Evidence** | [Where this user type was found in code] |

_Detailed personas in: `.context/PRD/user-personas.md`_

---

## Product Scope

### What's Included (Current State)

- [Feature/capability 1]
- [Feature/capability 2]
- [Feature/capability 3]

### What's Not Included (Discovered Limitations)

- [Known limitation 1]
- [Known limitation 2]

### Future Indicators (if found)

_Based on TODO comments, roadmap docs, or feature flags:_

- [Planned feature 1]
- [Planned feature 2]

---

## Discovery Gaps

**Information not found (may need user input):**

| Gap     | Impact           | Suggested Source   |
| ------- | ---------------- | ------------------ |
| [Gap 1] | [Why it matters] | [Where to find it] |
| [Gap 2] | [Why it matters] | [Where to find it] |

---

## QA Relevance

### Critical Testing Areas

Based on this executive summary, prioritize testing for:

1. **[Core Feature 1]** - High impact on value proposition
2. **[Core Feature 2]** - Key user workflow
3. **[Metric-related flow]** - Affects success metrics

### Risk Areas

- [Area where complexity is high]
- [Area where user impact is significant]

---

## Document References

| Document          | Purpose                | Status         |
| ----------------- | ---------------------- | -------------- |
| User Personas     | Detailed user profiles | [Link/Pending] |
| User Journeys     | Key user flows         | [Link/Pending] |
| Feature Inventory | Complete feature list  | [Link/Pending] |
```

### Update CLAUDE.md:

```markdown
## Phase 2 Progress - PRD

- [x] prd-executive-summary.md ✅
  - Product: [Name]
  - Core features: [count]
  - User types: [count]
```

---

## 🔗 Next Prompt

| Condition             | Next Prompt             |
| --------------------- | ----------------------- |
| Summary complete      | `prd-user-personas.md`  |
| Need business context | Return to Phase 1       |
| Missing critical info | Ask user, then continue |

---

## Tips

1. **Start with README** - Usually has the best overview
2. **Check marketing copy** - Landing pages have refined messaging
3. **Don't invent metrics** - Only document what's actually tracked
4. **Link to evidence** - Every claim should have a source
