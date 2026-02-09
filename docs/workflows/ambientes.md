# Development Environments - Guide for QA Engineers

## What are environments

An environment is an **independent copy of your application** where code is executed. Each environment has its own database, configuration, and specific purpose.

Environments allow you to test changes without affecting real users. They're like rehearsing a play before opening night.

## The 4 standard industry environments

### 1. Development (dev)

**Purpose:** Active code development.

This is where developers write new features, experiment, and make frequent changes. Code can break several times a day.

**Characteristics:**

- Constant changes
- Basic tests (unit, integration)
- Simple test data
- May be temporarily "broken"

**Who uses it:** Primarily developers

**Real example:** A dev is creating a new login form. They test it here first before sharing it.

---

### 2. Staging (stage/pre-prod)

**Purpose:** Formal testing before production.

This is an **almost exact replica of production**. All QA tests, validations, and final rehearsals are executed here.

**Characteristics:**

- Production replica (same OS, versions, configuration)
- Data similar to production (but not real)
- Complete QA tests
- Stability is important

**Who uses it:** QA Engineers, Product Owners, Stakeholders

**Real example:** You finished automating checkout tests. You run them in staging because it imitates exactly how production works.

---

### 3. Production (prod)

**Purpose:** Real users using the application.

The environment your customers see. **Never test here**, only monitor.

**Characteristics:**

- Real users
- Real data
- Maximum stability required
- 24/7 monitoring
- Quick rollback if something fails

**Who uses it:** End users

**Real example:** Your e-commerce app processing real purchases from real customers.

---

### 4. Local (your computer)

**Purpose:** Individual development and testing.

Not technically a "shared environment," but where you spend most of your time as QA.

**Characteristics:**

- Only you see it
- You can break everything without consequences
- Fast iteration
- Personalized test data

**Who uses it:** Each developer/QA on their machine

**Real example:** You're writing a Cypress test. You run it locally 20 times until it works perfectly.

## Typical code flow

```
Local → Development → Staging → Production
  ↓          ↓           ↓           ↓
 Dev       Devs        QA         Users
tests    integrate  validate     use
```

**Step by step:**

1. **Local:** Write code/tests on your computer
2. **Development:** Commit and push, integrates with others' code
3. **Staging:** Team validates everything works correctly
4. **Production:** If staging passes, deploy to real users

## Variations in companies

Not all companies use the same names or number of environments.

### Small companies (startup)

```
Local → Staging → Production
```

Only 2 shared environments. Development and staging are combined.

### Medium companies (most common)

```
Local → Development → Staging → Production
```

The industry standard.

### Large companies (enterprise)

```
Local → Development → QA → Staging → Production
```

Separate QA environment for extensive testing. Staging only for final validation.

### Very large companies (tech giants)

```
Local → Dev → QA → Staging → Canary → Production
```

Multiple intermediate environments. "Canary" deploys to a small % of real users first.

## Environments in this template repository

For this educational project, we use **3 environments**:

### Local (your machine)

You develop and test your automation tests here.

### Staging (branch `staging`)

Integration environment where all changes are validated before production.

**This is your main work environment as QA.**

### Production (branch `main`)

Stable and approved code.

## Why we DON'T use "qa" as a branch name

Although some companies have environments called "qa", **staging is the standard term** you'll find in:

- 90% of job postings
- CI/CD documentation (GitHub Actions, GitLab CI, Jenkins)
- Tutorials and courses
- Industry conventions

QA engineers **work in staging**, they don't need a separate environment called "qa".

## How Git branches relate to environments

Each branch usually has an associated environment:

```
Git Branch           Environment        Auto-deploy?
─────────────────────────────────────────────────────
feature/login    →    Local              No
staging          →    Staging            Yes (automatic)
main             →    Production         Yes (with approval)
```

**Auto-deploy:** When you push to `staging`, it automatically deploys to the staging environment via CI/CD.

## Configuration per environment

Each environment has its own configuration:

**Development/Staging:**

```
DATABASE_URL=postgres://staging-db.company.com
API_KEY=test_key_12345
DEBUG_MODE=true
```

**Production:**

```
DATABASE_URL=postgres://prod-db.company.com
API_KEY=live_key_67890
DEBUG_MODE=false
```

This is managed with `.env` files or environment variables on the server.

## Testing in each environment

### Local

- Unit tests
- Component tests
- Test debugging

### Staging

- Complete test suites (E2E)
- Regression testing
- Basic performance testing
- New feature validation

### Production

- **NO tests are run**
- Only monitoring and alerts
- Post-deploy smoke tests (quick verification)

## Data in each environment

### Local

Fictional data you create. You can reset it whenever you want.

### Staging

Realistic but not real test data. Fictional users with names like "Test User 1".

**Important:** Never use real customer data in staging.

### Production

Real data from real users. Protected by laws (GDPR, etc).

## Common mistakes to avoid

**❌ Testing in production**
Never run experimental tests in production. Always use staging.

**❌ Using production data in staging**
You would violate user privacy and possible legal regulations.

**❌ Pushing directly to main**
Always go through staging first.

**❌ Assuming staging = production**
Although they're similar, they can have subtle differences. Monitor production post-deploy.

## Vocabulary you'll hear

**Deploy:** Upload code to an environment
**Rollback:** Revert to previous version if something fails
**Hotfix:** Urgent fix that goes straight to production
**Smoke test:** Quick test of basic functionality
**Sanity test:** Similar to smoke test, verifies the system is "sane"

## Frequently asked questions

**Why can't I test in production?**
Because you would affect real users. A bug in a test can delete data, crash the app, or create a bad experience.

**Is staging always identical to production?**
Ideally yes, but sometimes there are differences in resources (staging uses smaller servers to save costs).

**How many environments are enough?**
For learning: Local + Staging + Production is perfect. In real work, it depends on company size.

**What happens if I find a bug in production?**
An immediate hotfix is created. Some teams test it quickly in staging first, others go straight to production if it's urgent.

## Resources to dive deeper

- **The Twelve-Factor App** - Best practices for modern applications
- **GitFlow Workflow** - More detailed branching strategy
- **CI/CD Pipelines** - Deploy automation between environments

## Executive summary

Environments protect you from costly errors. You test locally, integrate in staging, deploy to production only when everything is validated.

**As a QA Engineer, your main environment is staging.** There you execute your test suites, validate features, and ensure quality before code reaches real users.

The market mainly uses: Local → Dev → Staging → Production.

This template uses: Local → Staging → Production (simplified for learning).
