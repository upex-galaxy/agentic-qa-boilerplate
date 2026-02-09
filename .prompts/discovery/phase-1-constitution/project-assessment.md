# Project Assessment

> **Phase**: 1 - Constitution (Project Onboarding)
> **Objective**: Evaluate the current state of the project and identify gaps for QA implementation

---

## 📥 Input Required

### From Previous Prompts:

- `.context/project-config.md` (from `project-connection.md`)

### From Source Code Analysis:

| Information         | How to Obtain                                 |
| ------------------- | --------------------------------------------- |
| Test coverage       | Look for `/tests`, `/spec`, `*.test.ts` files |
| Documentation state | Check `/docs`, README completeness            |
| Code quality tools  | Look for eslint, prettier, husky configs      |
| CI/CD maturity      | Analyze `.github/workflows/` or equivalent    |

---

## 🎯 Objective

Perform an initial assessment of the project to:

1. Understand current testing maturity
2. Identify documentation gaps
3. Flag potential risks or blockers
4. Prioritize which discovery phases need more attention

---

## 🔍 Assessment Process

### Step 1: Testing Maturity Assessment

**Analyze the codebase for:**

```bash
# Look for test files
find . -name "*.test.ts" -o -name "*.spec.ts" -o -name "*.test.js" | head -20

# Check test directories
ls -la tests/ test/ __tests__/ spec/ 2>/dev/null

# Look for test configuration
cat package.json | grep -A5 '"test"'
```

**Classify testing maturity:**

| Level        | Indicators                                | Score |
| ------------ | ----------------------------------------- | ----- |
| **None**     | No test files, no test scripts            | 0     |
| **Basic**    | Some unit tests, no integration           | 1     |
| **Moderate** | Unit + some integration, manual E2E       | 2     |
| **Good**     | Unit + integration + some E2E automation  | 3     |
| **Mature**   | Full coverage, CI integration, monitoring | 4     |

### Step 2: Documentation Assessment

**Check for:**

| Document           | Location                   | Found? |
| ------------------ | -------------------------- | ------ |
| README             | `/README.md`               | [ ]    |
| API docs           | `/docs/api/` or Swagger    | [ ]    |
| Architecture       | `/docs/architecture/`      | [ ]    |
| Setup guide        | `/docs/setup.md` or README | [ ]    |
| Contributing guide | `CONTRIBUTING.md`          | [ ]    |

**Classify documentation state:**

| Level        | Indicators                              |
| ------------ | --------------------------------------- |
| **Minimal**  | Only basic README                       |
| **Partial**  | README + some API docs                  |
| **Good**     | README + API + setup guide              |
| **Complete** | All above + architecture + contributing |

### Step 3: Code Quality Assessment

**Look for quality tools:**

```bash
# Check for linting/formatting
cat package.json | grep -E "eslint|prettier|husky|lint-staged"

# Check for type safety
ls tsconfig.json 2>/dev/null && echo "TypeScript configured"

# Check for pre-commit hooks
ls .husky/ 2>/dev/null
```

**Quality indicators:**

- [ ] ESLint configured
- [ ] Prettier configured
- [ ] TypeScript strict mode
- [ ] Pre-commit hooks (Husky)
- [ ] CI checks on PRs

### Step 4: CI/CD Assessment

**Analyze CI/CD configuration:**

```bash
# GitHub Actions
ls .github/workflows/

# Check for test jobs
grep -l "test" .github/workflows/*.yml 2>/dev/null

# Check for deployment
grep -l "deploy" .github/workflows/*.yml 2>/dev/null
```

**CI/CD maturity:**

| Level        | Indicators                                 |
| ------------ | ------------------------------------------ |
| **None**     | No CI/CD                                   |
| **Basic**    | Build only                                 |
| **Moderate** | Build + lint                               |
| **Good**     | Build + lint + tests                       |
| **Mature**   | Build + lint + tests + deploy + monitoring |

### Step 5: Risk Identification

**Common risks to look for:**

| Risk              | How to Detect                | Impact |
| ----------------- | ---------------------------- | ------ |
| No tests          | Empty test directories       | HIGH   |
| Outdated deps     | Check for security warnings  | MEDIUM |
| No types          | Missing tsconfig.json        | MEDIUM |
| Hardcoded secrets | Grep for API keys, passwords | HIGH   |
| No CI             | Missing workflow files       | MEDIUM |

---

## 📤 Output Generated

### Primary Output: Assessment Summary in CLAUDE.md

Update `CLAUDE.md` with the assessment results:

```markdown
## Project Assessment (Phase 1)

**Assessment Date**: [Date]

### Testing Maturity: [Score]/4

- Current state: [None/Basic/Moderate/Good/Mature]
- Test files found: [count]
- Test frameworks: [list]
- Coverage: [unknown/X%]

### Documentation State: [Minimal/Partial/Good/Complete]

- README: [Yes/No] - [quality notes]
- API docs: [Yes/No]
- Architecture docs: [Yes/No]
- Setup guide: [Yes/No]

### Code Quality

- [ ] ESLint: [configured/missing]
- [ ] Prettier: [configured/missing]
- [ ] TypeScript: [strict/loose/none]
- [ ] Pre-commit hooks: [configured/missing]

### CI/CD Maturity: [None/Basic/Moderate/Good/Mature]

- Pipeline: [tool]
- Stages: [list]
- Test automation in CI: [Yes/No]

### Identified Risks

| Risk     | Severity        | Mitigation |
| -------- | --------------- | ---------- |
| [Risk 1] | HIGH/MEDIUM/LOW | [Action]   |
| [Risk 2] | HIGH/MEDIUM/LOW | [Action]   |

### Recommendations for Phase Prioritization

1. **Phase 1 (Constitution)**: [Normal/Extended] - [reason]
2. **Phase 2 (Architecture)**: [Normal/Extended] - [reason]
3. **Phase 3 (Infrastructure)**: [Normal/Skip] - [reason]
4. **Phase 4 (Specification)**: [Normal/Extended] - [reason]

### Blockers

- [ ] [Blocker 1 - action needed]
- [ ] [Blocker 2 - action needed]
```

### Secondary Output: Risk Report (if HIGH risks found)

If critical risks are identified, create `.context/risk-assessment.md`:

```markdown
# Risk Assessment Report

## Critical Findings

### [Risk Name]

- **Severity**: HIGH
- **Description**: [What was found]
- **Impact**: [How it affects QA]
- **Recommendation**: [What to do]
- **Owner**: [Who should address this]

## Action Items

1. [ ] [Action 1]
2. [ ] [Action 2]
```

---

## 🔗 Next Prompt

| Condition                        | Next Prompt                                                    |
| -------------------------------- | -------------------------------------------------------------- |
| Assessment complete, no blockers | `discovery/phase-1-constitution/business-model-discovery.md`   |
| Critical blockers found          | Resolve blockers first                                         |
| Need more tech context           | `discovery/phase-1-constitution/business-model-discovery.md`   |

---

## Assessment Quick Reference

### Testing Maturity Score Guide

| Score | State       | Action                       |
| ----- | ----------- | ---------------------------- |
| 0     | No tests    | Prioritize Stage 1, 4        |
| 1     | Basic       | Normal flow                  |
| 2     | Moderate    | Normal flow                  |
| 3-4   | Good/Mature | May streamline Stage 4       |

### Phase Prioritization Matrix

| Assessment Result | Priority                      |
| ----------------- | ----------------------------- |
| No documentation  | Phase 1, 2 (extended)         |
| No tests          | Stage 1, 4 (critical)         |
| No CI             | Phase 3, Stage 5 (add CI)     |
| Good baseline     | Normal flow                   |

---

## Tips

1. **Don't be alarmed by gaps** - Most projects have them. Document and plan.
2. **Focus on HIGH risks** - Address blockers before proceeding.
3. **Use assessment to set expectations** - Share findings with stakeholders.
4. **Revisit after Phase 4** - Re-assess before implementing tests.
