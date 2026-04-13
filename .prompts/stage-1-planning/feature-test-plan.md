# Feature Test Plan

Act as a QA Lead expert in Shift-Left Testing, Test Strategy, and Quality Analysis.

**⚠️ WORKFLOW:** This prompt follows the **JIRA-FIRST → LOCAL MIRROR** principle

---

## 📥 Required Input

### 1. Local Epic Path (REQUIRED)

**Format:** `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/`
**Example:** `.context/PBI/epics/EPIC-UPEX-13-user-authentication/`

**Important:** {ISSUE_NUM} is assigned sequentially by Jira (1, 2, 13, 45...) without leading zeros

**⚠️ IMPORTANT - Difference Between Naming Conventions:**

- **Local Path (folder):** `EPIC-UPEX-13-user-authentication` ← Folder naming convention
- **Jira Key (real):** `UPEX-13` ← Real issue key in Jira

**Note:** Issue numbers are identical in both formats (e.g., 13). The difference is only in the prefix:

- Local folder: `EPIC-` + Jira Key
- Jira: Only the Key (without EPIC- prefix)

**Process:**

1. **User provides:** Local epic folder path
2. **Prompt reads:** `epic.md` file from that folder
3. **Prompt extracts:** `**Jira Key:**` field from epic.md (real format: UPEX-123)
4. **Prompt uses:** That real Jira Key for Atlassian MCP operations

**Path usage:**

- Read local epic.md to get real Jira Key
- Read current epic from Jira with MCP (Step 5)
- Update epic in Jira with findings (Step 5)
- Add comment with complete test plan (Step 6)
- Generate feature-test-plan.md file in that folder (Step 7)

---

### 2. Business Context (REQUIRED)

- Business Model: [read .context/idea/business-model.md]
- Executive Summary: [read .context/PRD/executive-summary.md]
- User Personas: [read .context/PRD/user-personas.md]
- User Journeys: [read .context/PRD/user-journeys.md]

---

### 3. Technical Context (REQUIRED)

- Functional Specs: [read .context/SRS/functional-specs.md - COMPLETE]
- Non-Functional Specs: [read .context/SRS/non-functional-specs.md]
- Architecture Specs: [read .context/SRS/architecture-specs.md]
- API Contracts: [read .context/SRS/api-contracts.yaml]

---

### 4. Feature Context (REQUIRED)

**Step 1: Read Local Epic and Extract Jira Key**

- Epic (local): [read {EPIC_PATH}/epic.md provided by user]
- **Extract from epic.md:** `**Jira Key:**` field (e.g., UPEX-123)
- **Save:** Real Jira Key to use in MCP operations

**Step 2: Get Epic from Jira**

- Epic (Jira): [use Atlassian MCP with real Jira Key extracted from step 1]

**Step 3: Read Stories**

- All epic stories: [read all story.md files in {EPIC_PATH}/stories/]

---

## 📤 Generated Output

### In Jira (via Atlassian MCP):

1. **Epic updated** with test strategy summary and label `test-plan-ready`
2. **Comment added** with complete test plan and team tags

### Locally:

1. **File:** `.context/PBI/epics/EPIC-{...}/feature-test-plan.md`
2. **Content:** Exact mirror of the Jira comment

### For User:

1. **Report:** Executive summary with critical questions and next steps (Step 8)

---

## 🎯 WORKFLOW

This prompt works in **8 steps** organized in 2 parts, following **JIRA-FIRST → LOCAL MIRROR**:

---

### 📊 PART 1: ANALYSIS AND DESIGN

#### Step 1: Context Analysis

- Understand the epic's business value
- Identify affected users
- Analyze involved architecture

#### Step 2: Risk Analysis

- Identify technical risks
- Identify business risks
- Identify critical integration points

#### Step 3: Testing Strategy

- Define required testing levels
- Define test types per story
- Define testing scope

#### Step 4: Critical Analysis & Test Planning

- Identify ambiguities in epic/stories
- Generate questions for PO/Dev
- Suggest improvements before implementation
- Entry/Exit criteria
- Test data requirements
- Test case estimates per story

---

### 🔄 PART 2: INTEGRATION AND OUTPUT

#### Step 5: Update Epic in Jira

- Add test strategy summary and label `test-plan-ready`

#### Step 6: Add Test Plan as Comment in Jira Epic

- Add complete test plan as comment with team tags

#### Step 7: Generate Local feature-test-plan.md

- Create local mirror of Jira comment

#### Step 8: Final QA Feedback Report

- Generate executive summary for user

---

# Feature Test Plan: EPIC-{PROJECT_KEY}-{ISSUE_NUM} - [Epic Title]

**Date:** [YYYY-MM-DD]
**QA Lead:** [Name or "TBD"]
**Epic Jira Key:** [{PROJECT_KEY}-{ISSUE_NUM}]
**Status:** Draft | In Review | Approved

---

## 📋 Business Context Analysis

### Business Value

[Explain the epic's business value according to Business Model Canvas and Executive Summary]

**Key Value Proposition:**

- [Value 1 provided to user]
- [Value 2 provided to business]

**Success Metrics (KPIs):**

- [KPI 1 from Executive Summary that this epic impacts]
- [KPI 2 from Executive Summary that this epic impacts]

**User Impact:**
(Analyze .context/PRD/user-personas.md to identify which personas are affected by this epic)

- [User Persona identified from PRD]: [How specifically affected according to epic.md]
- [Another User Persona if applicable]: [How affected]

**Critical User Journeys:**
(Analyze .context/PRD/user-journeys.md to identify which journeys this epic enables or modifies)

- [Journey identified from PRD]
- [Another Journey if applicable]

(Where personas and journeys are determined by analyzing the current project's PRD and relating them to the epic's scope)

---

## 🏗️ Technical Architecture Analysis

### Architecture Components Involved

**Frontend:**
(Analyze .context/SRS/architecture-specs.md and epic.md to identify)

- Components to create/modify: [list according to SRS analysis]
- Affected pages/routes: [list according to SRS analysis]

**Backend:**
(Analyze .context/SRS/api-contracts.yaml and architecture-specs.md)

- APIs to create/modify: [reference specific endpoints from api-contracts.yaml]
- Affected business services: [list according to SRS analysis]

**Database:**
(Analyze .context/SRS/architecture-specs.md)

- Tables involved: [list specific schema tables according to SRS]
- Critical queries: [identify complex or high-impact queries]

**External Services:**
(Analyze .context/SRS/architecture-specs.md and epic.md)

- External APIs: [list specific external services according to SRS]
- Third-party services: [e.g., payment processor, email service, etc.]

(Where all components, APIs, tables, and services are determined by analyzing the current project's SRS/PRD/epic)

### Integration Points (Critical for Testing)

[Based on architecture-specs.md, identify integration points]

**Internal Integration Points:**

- Frontend ↔ Backend API
- Backend ↔ Database
- Backend ↔ Auth Service
- [Other internal modules]

**External Integration Points:**

- [System] ↔ [External service 1]
- [System] ↔ [External service 2]

**Data Flow:**

```
[Describe critical data flow]
User → Frontend → API Gateway → Service X → Database
                              ↓
                         External Service
```

---

## 🚨 Risk Analysis

### Technical Risks

#### Risk 1: [Technical risk description]

- **Impact:** High | Medium | Low
- **Likelihood:** High | Medium | Low
- **Area Affected:** [Frontend | Backend | Database | Integration]
- **Mitigation Strategy:**
  - [Strategy 1]
  - [Specific testing approach]
- **Test Coverage Required:** [What test cases we need to mitigate]

#### Risk 2: [Technical risk description]

- **Impact:** ...
- **Likelihood:** ...
- **Area Affected:** ...
- **Mitigation Strategy:** ...
- **Test Coverage Required:** ...

---

### Business Risks

#### Risk 1: [Business risk description]

- **Impact on Business:** [How it affects KPIs or user experience]
- **Impact on Users:** [Which user personas are affected]
- **Likelihood:** High | Medium | Low
- **Mitigation Strategy:**
  - [What testing we do to prevent]
  - [What business validations we add]
- **Acceptance Criteria Validation:** [Validate that acceptance criteria cover this risk]

#### Risk 2: [Business risk description]

- **Impact on Business:** ...
- **Impact on Users:** ...
- **Likelihood:** ...
- **Mitigation Strategy:** ...

---

### Integration Risks

[Identify risks in previously identified integration points]

#### Integration Risk 1: [Description]

- **Integration Point:** [Frontend ↔ API | API ↔ Database | etc.]
- **What Could Go Wrong:** [Failure scenarios]
- **Impact:** High | Medium | Low
- **Mitigation:**
  - Specific integration tests
  - Contract testing (if applicable)
  - Mocking strategy for isolated testing

---

## ⚠️ Critical Analysis & Questions for PO/Dev

### Ambiguities Identified

[Analyze epic.md and all story.md files from the epic to identify ambiguities]

**Ambiguity 1:** [Ambiguity description]

- **Found in:** STORY-{PROJECT_KEY}-{ISSUE_NUM}
- **Question for PO:** [Specific question]
- **Impact if not clarified:** [What problems it can cause]

**Ambiguity 2:** [Description]

- **Found in:** EPIC-{PROJECT_KEY}-{ISSUE_NUM} scope
- **Question for Dev:** [Technical question]
- **Impact if not clarified:** ...

---

### Missing Information

[Identify what information is missing in epic.md or stories to test correctly]

**Missing 1:** [What's missing]

- **Needed for:** [Why it's critical for testing]
- **Suggestion:** [What to add to the story/epic]

**Missing 2:** [What's missing]

- **Needed for:** ...
- **Suggestion:** ...

---

### Suggested Improvements (Before Implementation)

[Suggestions to improve stories BEFORE Dev starts implementing]

**Improvement 1:** [Suggestion]

- **Story Affected:** STORY-{PROJECT_KEY}-{ISSUE_NUM}
- **Current State:** [How it is now]
- **Suggested Change:** [How it should be]
- **Benefit:** [Why it improves quality]

**Improvement 2:** [Suggestion]

- **Story Affected:** ...
- **Current State:** ...
- **Suggested Change:** ...
- **Benefit:** ...

---

## 🎯 Test Strategy

### Test Scope

**In Scope:**

- Functional testing (UI, API, Database)
- Integration testing (internal + external services)
- Non-functional testing (Performance, Security per NFRs)
- Cross-browser testing (Chrome, Firefox, Safari)
- Mobile responsiveness (iOS Safari, Android Chrome)
- API contract validation (per api-contracts.yaml)
- Data validation (input/output per SRS)

**Out of Scope (For This Epic):**

- [Features NOT tested in this epic]
- [Testing left for other epics]
- [Testing contracted externally: penetration testing, extreme load testing, etc.]

---

### Test Levels

#### Unit Testing

- **Coverage Goal:** > 80% code coverage
- **Focus Areas:**
  - Business logic functions/methods
  - Data validation functions
  - Utility functions
- **Responsibility:** Dev team (but QA validates they exist)

#### Integration Testing

- **Coverage Goal:** All integration points identified above
- **Focus Areas:**
  - Frontend ↔ Backend API (per api-contracts.yaml)
  - Backend ↔ Database
  - Backend ↔ External Services (mocked)
- **Responsibility:** QA + Dev (pair programming)

#### End-to-End (E2E) Testing

- **Coverage Goal:** Complete critical user journeys
- **Tool:** Playwright
- **Focus Areas:**
  - [User Journey 1 identified above]
  - [User Journey 2 identified above]
  - Complete happy paths
  - Critical error scenarios
- **Responsibility:** QA team

#### API Testing

- **Coverage Goal:** 100% of this epic's endpoints (per api-contracts.yaml)
- **Tool:** Postman/Newman or Playwright API
- **Focus Areas:**
  - Contract validation (request/response per OpenAPI spec)
  - Correct status codes
  - Error handling
  - Authentication/Authorization
- **Responsibility:** QA team

---

### Test Types per Story

For each story in this epic, the following should be covered:

**Positive Test Cases:**

- Happy path (successful flow)
- Valid data variations (different valid data)

**Negative Test Cases:**

- Invalid input data
- Missing required fields
- Unauthorized access attempts
- Boundary violations

**Boundary Test Cases:**

- Min/max values
- Empty/null values
- Domain-specific edge cases

**Exploratory Testing:**

- [Areas requiring exploratory testing - explain why]
- Suggestion: Do exploratory testing BEFORE implementation (using mockups/prototypes)

---

## 📊 Test Cases Summary by Story

[For each story in the epic, estimate how many test cases are needed - WITHOUT forcing minimum number]

### STORY-{PROJECT_KEY}-{ISSUE_NUM}: [Story Title]

**Complexity:** Low | Medium | High
**Estimated Test Cases:** [Realistic number - could be 1, could be 20]

- Positive: [X] test cases
- Negative: [Y] test cases
- Boundary: [Z] test cases
- Integration: [W] test cases (if applicable)
- API: [V] test cases (if applicable)

**Rationale for estimate:**
[Explain why that number - complexity, integration points, identified edge cases]

**Parametrized Tests Recommended:** Yes | No
[If Yes, explain which tests benefit from parametrization]

---

### STORY-{PROJECT_KEY}-{ISSUE_NUM}: [Story Title]

**Complexity:** ...
**Estimated Test Cases:** ...

- ...

**Rationale for estimate:** ...
**Parametrized Tests Recommended:** ...

---

[Repeat for all stories in the epic]

---

### Total Estimated Test Cases for Epic

**Total:** [Sum of all estimated test cases]
**Breakdown:**

- Positive: [X]
- Negative: [Y]
- Boundary: [Z]
- Integration: [W]
- API: [V]

---

## 🗂️ Test Data Requirements

### Test Data Strategy

**Valid Data Sets:**
[Based on user personas and SRS, define realistic valid data]

- User data: [Examples of valid users per personas]
- Transaction data: [Examples of valid transactions/operations]
- [Other data per domain]

**Invalid Data Sets:**

- [Examples of invalid data we must test]
- [Malicious input cases - SQL injection, XSS, etc.]

**Boundary Data Sets:**

- Min/Max values: [Per SRS validations]
- Empty/null values
- Special characters
- Unicode characters (if internationalization applies)

**Test Data Management:**

- ✅ Use Faker.js for generating realistic test data
- ✅ Create data factories for common entities
- ❌ DON'T hardcode static data in tests
- ✅ Clean up test data after test execution

---

### Test Environments

**Staging Environment:**

- URL: [Staging URL]
- Database: [Staging DB]
- External Services: [Mocked | Real staging versions]
- **Purpose:** Primary testing environment

**Production Environment:**

- URL: [Production URL]
- **Purpose:** ONLY smoke tests post-deployment
- **Restrictions:** NO destructive tests, NO test data creation

---

## ✅ Entry/Exit Criteria

### Entry Criteria (Per Story)

Testing can start when:

- [ ] Story is fully implemented and deployed to staging
- [ ] Code review is approved by 2+ reviewers
- [ ] Unit tests exist and are passing (>80% coverage)
- [ ] Dev has done smoke testing and confirms basic functionality works
- [ ] No blocker bugs exist in dependent stories
- [ ] Test data is prepared and available in staging
- [ ] API documentation is updated (if API changes)

### Exit Criteria (Per Story)

Story is considered "Done" from QA perspective when:

- [ ] All test cases are executed
- [ ] Critical/High priority test cases: 100% passing
- [ ] Medium/Low priority test cases: ≥95% passing
- [ ] All critical and high bugs are resolved and verified
- [ ] Medium bugs have mitigation plan or are scheduled
- [ ] Regression testing passed (if changes affect other features)
- [ ] Non-functional requirements validated (performance, security)
- [ ] Test execution report is generated and shared
- [ ] Known issues are documented in release notes

### Epic Exit Criteria

Epic is considered "Done" from QA perspective when:

- [ ] ALL stories meet individual exit criteria
- [ ] Integration testing across all stories is complete
- [ ] E2E testing of critical user journeys is complete and passing
- [ ] API contract testing is complete (all endpoints validated)
- [ ] Non-functional testing is complete (NFRs from SRS validated)
- [ ] Exploratory testing session completed (findings documented)
- [ ] No critical or high bugs open
- [ ] QA sign-off document is created and approved

---

## 📝 Non-Functional Requirements Validation

[Based on .context/SRS/non-functional-specs.md, identify NFRs that apply to this epic]

### Performance Requirements

**NFR-P-XXX:** [Performance NFR description]

- **Target:** [Specific metric - e.g., "Page load < 2s"]
- **Test Approach:** [How we will validate]
- **Tools:** [Lighthouse, WebPageTest, etc.]

### Security Requirements

**NFR-S-XXX:** [Security NFR description]

- **Requirement:** [Specific requirement - e.g., "All passwords hashed with bcrypt"]
- **Test Approach:** [How we will validate]
- **Tools:** [OWASP ZAP, manual testing, etc.]

### Usability Requirements

**NFR-U-XXX:** [Usability NFR description]

- **Requirement:** [Specific requirement]
- **Test Approach:** [How we will validate]

---

## 🔄 Regression Testing Strategy

**Regression Scope:**
[Identify which areas of the existing system could be affected by this epic]

- [ ] Feature A: [How it could be affected]
- [ ] Feature B: [How it could be affected]

**Regression Test Execution:**

- Run automated regression suite before starting epic testing
- Re-run after all stories are complete
- Focus on integration points identified in architecture analysis

---

## 📅 Testing Timeline Estimate

**Estimated Duration:** [X sprints | Y weeks]

**Breakdown:**

- Test case design: [X days]
- Test data preparation: [Y days]
- Test execution (per story): [Z days per story]
- Regression testing: [W days]
- Bug fixing cycles: [V days - buffer]
- Exploratory testing: [U days]

**Dependencies:**

- Depends on: [Epics that must be completed first]
- Blocks: [Epics that depend on this one]

---

## 🛠️ Tools & Infrastructure

**Testing Tools:**

- E2E Testing: Playwright
- API Testing: Postman/Newman or Playwright API
- Unit Testing: Vitest (frontend), Jest (backend)
- Performance Testing: Lighthouse, WebPageTest
- Security Testing: OWASP ZAP (if applicable)
- Test Data: Faker.js

**CI/CD Integration:**

- [ ] Tests run automatically on PR creation
- [ ] Tests run on merge to main branch
- [ ] Tests run on deployment to staging
- [ ] Smoke tests run on deployment to production

**Test Management:**

- Jira + Xray (test cases linked to stories)
- Test execution reports in Xray
- Bug tracking in Jira

---

## 📊 Metrics & Reporting

**Test Metrics to Track:**

- Test cases executed vs. total
- Test pass rate
- Bug detection rate
- Bug fix rate
- Test coverage (code coverage from unit tests)
- Time to test (per story)

**Reporting Cadence:**

- Daily: Test execution status
- Per Story: Test completion report
- Per Epic: Comprehensive QA sign-off report

---

## 📝 PART 2: Integration and Output

**⚠️ IMPORTANT:** This part implements the **JIRA-FIRST → LOCAL MIRROR** flow to maintain consistency with the epic management process.

---

### Step 5: Update Epic in Jira

**Objective:** Update the epic in Jira WITH critical findings from testing analysis, BEFORE generating local file.

**Tool:** Atlassian MCP

**Steps to execute:**

1. **Read current epic from Jira:**
   - Use Atlassian MCP to get the epic
   - Input: Real Jira Key extracted from epic.md (e.g., UPEX-123)
   - ⚠️ **DO NOT use** folder naming convention (EPIC-UPEX-001)
   - Get: current description

2. **Prepare summary content:**

   Based on Steps 1-4 analysis, prepare:
   - **Top Critical Risks** (from Step 2)
   - **Test Coverage Summary** (from Step 4)
   - **Critical Questions** (from Step 4)

3. **Update epic in Jira:**
   - Use Atlassian MCP to edit the epic
   - Add new section to description with the following content:

   ***

   ## 🧪 QA Test Strategy - Shift-Left Analysis

   **Analysis Date:** [YYYY-MM-DD]
   **Status:** Test Plan Ready

   ### Critical Risks Identified

   [Summary of top 3 technical/business risks with highest impact]

   ### Test Coverage Summary
   - **Total Estimated Test Cases:** [X]
   - **Integration Points:** [Y]
   - **Critical User Journeys:** [Z]
   - **Test Complexity:** Low | Medium | High

   ### Critical Questions for Team

   [Indicate there are critical questions in comment - see details below]

   ### Test Strategy
   - Levels: Unit, Integration, E2E, API
   - Tools: Playwright, Vitest, Postman
   - Timeline: [X sprints/weeks estimated]

   ***
   - Add label: `test-plan-ready`

**Expected output:**

- ✅ Epic updated in Jira with test strategy summary
- ✅ Label `test-plan-ready` added
- ✅ Description enriched with QA analysis

---

### Step 6: Add Feature Test Plan as Comment in Jira

**Objective:** Add the ENTIRE feature test plan as a comment in the Jira epic for maximum team visibility.

**Tool:** Atlassian MCP

**Comment structure:**

```
## 📋 Feature Test Plan - Generated [Date]

**QA Lead:** [Name or "AI-Generated"]
**Status:** Draft - Pending Team Review

---

> The AI must compile all generated content from "Feature Test Plan: EPIC-..." through "Metrics & Reporting" into this section. Do not ask the user to paste anything.

---

## 📢 Action Required

**@[Product Owner]:**

- [ ] Review ambiguities and missing information (see Critical Analysis section)
- [ ] Answer critical questions for PO
- [ ] Validate risk analysis and business impact
- [ ] Confirm test scope is complete and correct

**@[Dev Lead]:**

- [ ] Review technical risks and mitigation strategies
- [ ] Validate integration points identified
- [ ] Confirm architecture analysis is accurate
- [ ] Answer technical questions

**@[QA Team]:**

- [ ] Review test strategy and estimates
- [ ] Validate test levels and types per story
- [ ] Confirm test data requirements
- [ ] Prepare test environments and tools

---

**Next Steps:**

1. Team discusses critical questions and ambiguities in refinement
2. PO/Dev provide answers and clarifications
3. QA begins test case design per story (use story-test-cases.md prompt)
4. Team validates entry/exit criteria before sprint starts
5. Dev starts implementation ONLY after critical questions resolved

---

**Documentation:** Full test plan also available at:
`.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/feature-test-plan.md`
```

**Steps to execute:**

1. Use Atlassian MCP to add comment to epic
2. Input: Epic Jira Key + complete comment content
3. Mention team members in comment (@PO, @Dev, @QA) per project configuration

**Expected output:**

- ✅ Comment created in Jira with complete test plan
- ✅ Team notified via mentions
- ✅ Action checklist added for follow-up

---

### Step 7: Generate Local feature-test-plan.md (Mirroring)

**Objective:** Create local `.md` file as MIRROR of Jira comment for version control and offline documentation.

**Path:** `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/feature-test-plan.md`

**Content:** IDENTICAL to content generated in Step 6 (entire test plan)

**Expected output:**

- ✅ `feature-test-plan.md` file created locally
- ✅ Content is EXACT MIRROR of Jira comment
- ✅ Available for git versioning

---

### Step 8: Final QA Feedback Report

**Objective:** Report to USER the executive summary and pending actions.

**Report format:**

---

## ✅ Feature Test Plan - Execution Summary

**Epic:** [EPIC-KEY] - [Title]
**Analysis Date:** [YYYY-MM-DD]

---

### 📊 Summary

**Epic Complexity:** Low | Medium | High
**Total Estimated Test Cases:** [X]
**Critical Risks Identified:** [Y]
**Integration Points:** [Z]
**Estimated Testing Duration:** [X sprints/weeks]

---

### 🚨 Top 3 Critical Risks

**Risk 1:** [Description]

- **Impact:** High
- **Area:** [Technical | Business | Integration]
- **Mitigation:** [Strategy]

**Risk 2:** [Description]

- **Impact:** High/Medium
- **Area:** [Technical | Business | Integration]
- **Mitigation:** [Strategy]

**Risk 3:** [Description]

- **Impact:** Medium
- **Area:** [Technical | Business | Integration]
- **Mitigation:** [Strategy]

---

### ❓ Critical Questions Requiring PO/Dev Input

**Question 1 (For PO):** [Business question]

- **Context:** [Why it's important]
- **Impact if not answered:** [What risk it represents]

**Question 2 (For Dev):** [Technical question]

- **Context:** [Why it's important]
- **Impact if not answered:** [What risk it represents]

**Question 3 (For PO/Dev):** [Additional question if applicable]

- **Context:** ...
- **Impact if not answered:** ...

---

### 💡 Suggested Epic/Story Improvements

**Improvement 1:** [Suggestion]

- **Story/Epic Affected:** [KEY]
- **Current State:** [Problem identified]
- **Suggested Change:** [How to improve it]
- **Benefit:** [Why it's important]

**Improvement 2:** [If applicable]

- **Story/Epic Affected:** ...
- **Current State:** ...
- **Suggested Change:** ...
- **Benefit:** ...

---

### 🎯 Test Strategy Highlights

**Test Levels:**

- Unit Testing: Dev responsibility (>80% coverage goal)
- Integration Testing: QA + Dev collaboration
- E2E Testing: [X] critical user journeys
- API Testing: [Y] endpoints to validate

**Test Types per Story:**

- Positive: [X] test cases
- Negative: [Y] test cases
- Boundary: [Z] test cases
- Integration: [W] test cases

**Key Integration Points:**

- [Integration Point 1]
- [Integration Point 2]
- [Integration Point 3]

---

### ✅ What Was Done

**Jira Updates:**

- ✅ Epic updated with test strategy summary
- ✅ Label `test-plan-ready` added
- ✅ Test plan added as comment in Jira epic
- ✅ Team members tagged for review (@PO, @Dev, @QA)

**Local Files:**

- ✅ `feature-test-plan.md` created at: `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/`

**Analysis Completed:**

- ✅ Business context analyzed (value, users, journeys)
- ✅ Technical architecture analyzed (components, integration points)
- ✅ Risk analysis completed (technical, business, integration)
- ✅ Test strategy defined (levels, types, scope)
- ✅ Test estimates per story calculated
- ✅ Entry/Exit criteria defined

---

### 🎯 Next Steps (Team Action Required)

**Immediate Actions:**

1. **PO:** Review critical questions in Jira comment and provide answers
2. **Dev Lead:** Review technical risks and validate integration points
3. **Team:** Schedule refinement session to discuss ambiguities and improvements
4. **QA:** Wait for clarifications before starting test case design per story

**Before Sprint Starts:**

5. **All:** Ensure all critical questions are answered
6. **PO:** Approve or provide feedback on suggested improvements
7. **QA:** Begin test case design for each story using `story-test-cases.md` prompt
8. **Team:** Validate entry criteria can be met for each story

**During Epic Implementation:**

9. **QA:** Execute test cases as stories are completed
10. **Team:** Address bugs and issues as they arise
11. **QA:** Track metrics and report progress daily

---

**⚠️ BLOCKER:** Epic should NOT start implementation until critical questions are resolved by PO/Dev.

**Jira Link:** [Link to epic in Jira]
**Local Test Plan:** `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/feature-test-plan.md`

---

---

## 🎓 Notes & Assumptions

**Assumptions:**

- [List assumptions being made for this plan]

**Constraints:**

- [List constraints - time, resources, tools, etc.]

**Known Limitations:**

- [What CANNOT be fully tested or validated]

**Exploratory Testing Sessions:**

- Recommended: [X] exploratory testing sessions BEFORE implementation
  - Session 1: [Objective - e.g., Test with mockups/prototypes]
  - Session 2: [Objective - e.g., Test edge cases not covered in stories]

---

## 📎 Related Documentation

- **Epic:** `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/epic.md`
- **Stories:** `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/stories/STORY-*/story.md`
- **Business Model:** `.context/idea/business-model.md`
- **PRD:** `.context/PRD/` (all files)
- **SRS:** `.context/SRS/` (all files)
- **Architecture:** `.context/SRS/architecture-specs.md`
- **API Contracts:** `.context/SRS/api-contracts.yaml`

---

**Format:** Structured Markdown following **JIRA-FIRST → LOCAL MIRROR** flow

---

## 🔧 Prerequisites to Execute This Prompt

- ✅ ALL context files (idea, PRD, SRS) must be complete
- ✅ Epic.md and all story.md files from the epic must exist
- ✅ **Local Epic Path available** (e.g., `.context/PBI/epics/EPIC-UPEX-13-feature/`)
- ✅ **Epic.md must contain `Jira Key:` field** with real key (e.g., UPEX-13)
- ✅ **Atlassian MCP access configured and working**
- ✅ Time to critically analyze, not just generate checklist

**⚠️ epic.md Validation:**

The epic.md file must contain in its metadata:

```markdown
**Jira Key:** UPEX-13
```

This is the REAL Jira Key of the issue in Jira (NOT the folder naming convention).

**Note:** The issue number (e.g., 13) is the same in the folder naming convention and in the Jira Key.

---

## 📋 Execution Flow (For AI)

### Required user input:

```
Epic Path: .context/PBI/epics/EPIC-UPEX-13-feature-name/
```

**⚠️ Automatic Process:**

1. Prompt reads: `.context/PBI/epics/EPIC-UPEX-13-feature-name/epic.md`
2. Prompt extracts: `**Jira Key:**` field (e.g., UPEX-13)
3. Prompt uses: Real Jira Key UPEX-13 for MCP operations

**Note:** The issue number (13) is the same in the folder and in Jira. Formats like 001 or XXX are NOT used.

### Execution order:

**Pre-requisite: Extract Jira Key**

1. Read `{EPIC_PATH}/epic.md` provided by user
2. Extract `**Jira Key:**` field (e.g., UPEX-13)
3. Save real Jira Key to use in Steps 5 and 6

**PART 1 - Analysis and Design:** 4. **Steps 1-4:** Analyze context, risks, strategy, test cases (Markdown content)

**PART 2 - Integration and Output:** 5. **Step 5:** Update epic in Jira with test strategy summary (Atlassian MCP + real Jira Key) 6. **Step 6:** Create comment in Jira with complete test plan (Atlassian MCP + real Jira Key) 7. **Step 7:** Generate local `feature-test-plan.md` file in {EPIC_PATH}/ (Write tool) 8. **Step 8:** Report summary to user (Output)

### Tools to use:

**Atlassian MCP:**

- To read epic from Jira
- To update epic description and labels
- To add comment to epic

**File Operations:**

- To create local feature-test-plan.md file
- To read context files (PRD, SRS, epic, stories)

---

## ⚠️ IMPORTANT: Execution Principles

### Shift-Left Testing Philosophy:

- ✅ **Critical analysis first, test planning second**
- ✅ **Early feedback is MORE valuable than perfect test plan**
- ✅ **Identify risks BEFORE implementation** (shift-left!)
- ✅ **Test plan in comments** for team visibility

### Test Planning Guidelines:

- ❌ **DON'T force minimum number of test cases** - depends on each story's complexity
- ✅ **Analyze risks exhaustively** - technical, business, integration
- ✅ **Identify ambiguities** in epic and stories
- ✅ **Ask critical questions** - better to clarify than assume

### Jira-First Workflow:

- ✅ **ALWAYS update Jira first, then local** (consistency)
- ✅ **Test plan goes in comment** for maximum visibility
- ✅ **Tag the team** (@PO, @Dev, @QA)
- ✅ **Add label `test-plan-ready`** for tracking

---

## 🎯 Post-Generation: Team Actions

### Immediately after executing this prompt:

1. **PO must:**
   - Review comment in Jira with test plan
   - Answer "Critical Questions for PO"
   - Validate risk analysis and business impact
   - Confirm test scope is complete and correct

2. **Dev Lead must:**
   - Review comment in Jira with test plan
   - Answer "Technical Questions for Dev"
   - Validate identified integration points
   - Confirm architecture analysis is accurate
   - **DO NOT start epic** until critical questions resolved

3. **QA must:**
   - Review test strategy and estimates
   - Wait for PO/Dev answers before starting test case design
   - Prepare test environments and tools
   - Begin test case design per story using `story-test-cases.md` prompt

4. **User (who executed the prompt) must:**
   - Share Jira epic link with team
   - Facilitate critical questions discussion in refinement
   - Ensure questions are answered before sprint

---

## 🚀 Complete Workflow: Epic → Stories

### Recommended order:

1. ✅ **Execute `feature-test-plan.md` prompt** for complete epic
2. ⏸️ **Wait for feedback** from PO/Dev on critical questions
3. ✅ **Execute `story-test-cases.md` prompt** for each individual story
4. ⏸️ **Wait for feedback** from PO/Dev on each story
5. ✅ **Begin sprint** only when all questions are resolved

**Benefit of this workflow:**

- Test plan at epic level identifies global risks
- Test cases at story level identify specific gaps
- Both provide feedback to PO/Dev BEFORE implementation
- Reduces bugs, rework, and misunderstandings

---

**Version:** 3.1 - Jira-First + Atlassian MCP + Shift-Left Philosophy
**Last updated:** 2025-01-05
**Main changes:**

- ✅ Added Jira-First flow (Steps 5-8)
- ✅ Integration with Atlassian MCP
- ✅ Test plan in comments (not separate artifacts)
- ✅ Automatic epic refinement in Jira
- ✅ Consistency with `story-test-cases.md` prompt
