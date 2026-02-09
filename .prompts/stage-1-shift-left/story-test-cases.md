# Story Test Cases

Act as a QA Engineer expert in Shift-Left Testing, Test Case Design, and Critical Analysis.

**⚠️ WORKFLOW:** This prompt follows the **JIRA-FIRST → LOCAL MIRROR** principle

---

## 📥 Required Input

### 1. Local Story Path (REQUIRED)

**Format:** `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}/`
**Example:** `.context/PBI/epics/EPIC-UPEX-13-auth/stories/STORY-UPEX-45-login/`

**⚠️ IMPORTANT - Difference Between Naming Conventions:**

- **Local Path (folder):** `STORY-UPEX-45-login` ← Folder naming convention
- **Jira Key (real):** `UPEX-45` ← Real issue key in Jira

**Note:** Issue numbers are identical in both formats (e.g., 45). The difference is only in the STORY- prefix

**Process:**

1. **User provides:** Local story folder path
2. **Prompt reads:** `story.md` file from that folder
3. **Prompt extracts:** `**Jira Key:**` field from story.md (real format: UPEX-456)
4. **Prompt uses:** That real Jira Key for Atlassian MCP operations

**Path usage:**

- Read local story.md to get real Jira Key
- Read current story from Jira with MCP (Step 5)
- Update story in Jira with refinements (Step 5)
- Add comment with test cases (Step 6)
- Generate test-cases.md file in that folder (Step 7)

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

### 4. Story Context (REQUIRED)

**Step 1: Read Local Story and Extract Jira Keys**

- Story (local): [read {STORY_PATH}/story.md provided by user]
- **Extract from story.md:**
  - `**Jira Key:**` field of the story (e.g., UPEX-456)
  - `**Epic:**` field to get local epic path
- **Save:** Real Jira Keys to use in MCP operations

**Step 2: Read Local Epic and Extract Epic Jira Key**

- Epic (local): [read epic.md from epic path found in story]
- **Extract from epic.md:** `**Jira Key:**` field of the epic (e.g., UPEX-123)
- **Save:** Real Epic Jira Key to read comments

**Step 3: Get Epic from Jira and Comments**

- Epic (Jira): [use Atlassian MCP with real Epic Jira Key extracted]
- **Epic Comments (Jira):** [use Atlassian MCP to read epic comments - look for "Feature Test Plan"]
- Feature Test Plan (local): [read feature-test-plan.md from epic path]

**Step 4: Get Story from Jira**

- Story (Jira): [use Atlassian MCP with real Story Jira Key extracted from step 1]

**⚠️ IMPORTANT:** Reading epic comments in Jira provides updated context including:

- PO/Dev answers to critical questions
- Additional discussions and clarifications
- Updates to test plan after refinements

---

## 📤 Generated Output

### In Jira (via Atlassian MCP):

1. **Story updated** with refined acceptance criteria and label `shift-left-reviewed`
2. **Comment added** with complete test cases and team tags

### Locally:

1. **File:** `.context/PBI/epics/EPIC-{...}/stories/STORY-{...}/test-cases.md`
2. **Content:** Exact mirror of Jira comment

### For User:

1. **Report:** Executive summary with critical questions and next steps (Step 8)

### In Git (Branch Naming Convention):

**Branch format:** `test/{JIRA_ISSUE_KEY}/{short-description}`

**Examples:**

- `test/UPEX-45/user-login-flow`
- `test/UPEX-123/profile-update`
- `test/UPEX-78/checkout-validation`

**Rules:**

1. `test/` prefix required (indicates QA/testing work)
2. Jira Issue Key in uppercase (e.g., UPEX-45) - extracted from `**Jira Key:**` field in story.md
3. Short description in kebab-case (max 3-4 words) - derived from story name
4. Base branch: always `staging` (never `main`)

**⚠️ IMPORTANT:**

- This branch should ONLY contain changes to story documentation files (test-cases.md)
- DO NOT include production code, testing framework configuration, or implementation
- Branch name must be derived from the analyzed story context

---

## 🎯 WORKFLOW

This prompt works in **10 steps** (Step 0-9) organized in 3 parts, following the **JIRA-FIRST → LOCAL MIRROR** principle:

---

### 🌿 PART 0: GIT PREPARATION

#### Step 0: Create working branch

- Checkout from `staging` and pull changes
- Create branch with format `test/{JIRA_KEY}/{short-description}`
- Jira Key is extracted from story.md, description from story title

---

### 📊 PART 1: ANALYSIS AND DESIGN

#### Step 1: Critical Analysis

- Analyze story from business perspective
- Identify ambiguities in acceptance criteria
- Identify what's missing in the story

#### Step 2: Story Refinement & Gap Identification

- Refine acceptance criteria with specific data
- Identify edge cases NOT mentioned in original story
- Validate that EVERYTHING is testable

#### Step 3: Test Strategy Planning

- Determine how many test cases are really needed
- Identify parametrization opportunities
- Plan integration/API tests if applicable

#### Step 4: Test Design

- Generate test cases (positive, negative, boundary)
- Design parametrized tests when applicable
- Design integration/API tests based on architecture

---

### 🔄 PART 2: INTEGRATION AND OUTPUT

#### Step 5: Update Story in Jira

- Refine description and acceptance criteria in Jira

#### Step 6: Add Test Cases as Comment in Jira

- Add complete test cases as comment with team tags

#### Step 7: Generate Local test-cases.md

- Create local mirror of Jira comment

#### Step 8: Final QA Feedback Report

- Generate executive summary for user

#### Step 9: Commit test-cases.md file

- Commit `test-cases.md` file to working branch
- Commit message: `test({JIRA_KEY}): add shift-left test cases for {story-title}`

---

# Test Cases: STORY-{PROJECT_KEY}-{ISSUE_NUM} - [Story Title]

**Date:** [YYYY-MM-DD]
**QA Engineer:** [Name or "TBD"]
**Story Jira Key:** [{PROJECT_KEY}-{ISSUE_NUM}]
**Epic:** EPIC-{PROJECT_KEY}-{ISSUE_NUM} - [Epic Title]
**Status:** Draft | In Review | Approved

---

## 📋 Step 1: Critical Analysis

### Business Context of This Story

**User Persona Affected:**
[From User Personas, identify who uses this functionality]

- **Primary:** [Persona name] - [How affected]
- **Secondary:** [Persona name] - [If applicable]

**Business Value:**
[From Business Model and Executive Summary, explain this story's value]

- **Value Proposition:** [What value it provides to user]
- **Business Impact:** [How it contributes to business KPIs]

**Related User Journey:**
[From User Journeys, identify which journey this story fits into]

- Journey: [Journey name]
- Step: [Which step of the journey this functionality is in]

---

### Technical Context of This Story

**Architecture Components:**
[From Architecture Specs, identify involved components]

**Frontend:**

- Components: [List specific React/Vue components]
- Pages/Routes: [Affected routes]
- State Management: [If applicable - Redux, Context, etc.]

**Backend:**

- API Endpoints: [List endpoints - per api-contracts.yaml]
- Services: [Business services involved]
- Database: [Affected tables/collections]

**External Services:**

- [If story integrates with external services - list]

**Integration Points:**

- [List specific integration points for this story]

---

### Story Complexity Analysis

**Overall Complexity:** Low | Medium | High

**Complexity Factors:**

- Business logic complexity: [Low | Medium | High] - [Reason]
- Integration complexity: [Low | Medium | High] - [Reason]
- Data validation complexity: [Low | Medium | High] - [Reason]
- UI complexity: [Low | Medium | High] - [If applicable]

**Estimated Test Effort:** [Low | Medium | High]
**Rationale:** [Explain why this effort level]

---

### Epic-Level Context (From Feature Test Plan in Jira)

**⚠️ IMPORTANT:** This section extracts information from the "Feature Test Plan" comment in the epic in Jira to provide updated context.

**Critical Risks Already Identified at Epic Level:**

[Extract from epic comment in Jira - "Critical Risks" section]

- Risk 1: [Risk description identified at epic level]
  - **Relevance to This Story:** [How this risk specifically affects this story]
- Risk 2: [If applicable to this story]
  - **Relevance to This Story:** [How it affects]

**Integration Points from Epic Analysis:**

[Extract from epic comment - "Integration Points" section]

- Integration Point 1: [E.g., Frontend ↔ Backend API]
  - **Applies to This Story:** ✅ Yes | ❌ No
  - **If Yes:** [How this story uses this integration point]
- Integration Point 2: [If applicable]
  - **Applies to This Story:** ...

**Critical Questions Already Asked at Epic Level:**

[Extract from epic comment - "Critical Questions" section]

**Questions for PO:**

- Question 1: [Question already asked at epic level]
  - **Status:** ⏳ Pending | ✅ Answered | ❌ Not Relevant to This Story
  - **If Answered:** [PO's answer - search in epic comments in Jira]
  - **Impact on This Story:** [How the answer affects this story]

**Questions for Dev:**

- Question 1: [Question already asked at epic level]
  - **Status:** ⏳ Pending | ✅ Answered | ❌ Not Relevant to This Story
  - **If Answered:** [Dev's answer - search in epic comments in Jira]
  - **Impact on This Story:** [How the answer affects this story]

**Test Strategy from Epic:**

[Extract from epic comment - "Test Strategy" section]

- Test Levels: [Unit, Integration, E2E, API - per epic]
- Tools: [Playwright, Vitest, etc. - per epic]
- **How This Story Aligns:** [Explain which levels/tools apply to this specific story]

**Updates and Clarifications from Epic Refinement:**

[If there are PO/Dev answers in Jira epic comments after initial test plan, extract them here]

- Update 1: [Important clarification]
- Update 2: [If applicable]

**Summary: How This Story Fits in Epic:**

[Synthesize how this specific story fits into the broader epic context based on all the above information]

- **Story Role in Epic:** [E.g., "This story implements the frontend of the integration point identified in the epic"]
- **Inherited Risks:** [Which epic risks directly apply]
- **Unique Considerations:** [What is unique to this story that was NOT covered at epic level]

---

## 🚨 Step 2: Story Quality Analysis

### Ambiguities Identified

[Analyze story.md in detail to identify ambiguities]

**Ambiguity 1:** [Ambiguity description]

- **Location in Story:** [Where it is - acceptance criteria, description, etc.]
- **Question for PO/Dev:** [Specific question to clarify]
- **Impact on Testing:** [What we can't test without clarifying this]
- **Suggested Clarification:** [How it should be clarified]

**Ambiguity 2:** [If applicable]

- **Location in Story:** ...
- **Question for PO/Dev:** ...
- **Impact on Testing:** ...
- **Suggested Clarification:** ...

**If NO ambiguities found:** ✅ Story is clear and well-defined

---

### Missing Information / Gaps

[Identify what's missing in the story to test correctly]

**Gap 1:** [What information is missing]

- **Type:** [Acceptance Criteria | Technical Details | Business Rule | etc.]
- **Why It's Critical:** [Why we need it for testing]
- **Suggested Addition:** [What should be added to the story]
- **Impact if Not Added:** [What risk not adding it poses]

**Gap 2:** [If applicable]

- **Type:** ...
- **Why It's Critical:** ...
- **Suggested Addition:** ...
- **Impact if Not Added:** ...

**If NO gaps found:** ✅ Story has complete information for testing

---

### Edge Cases NOT Covered in Original Story

[Identify edge cases the story does NOT mention but are critical]

**Edge Case 1:** [Edge case description]

- **Scenario:** [What happens if...]
- **Expected Behavior:** [How system should behave - infer or ask]
- **Criticality:** High | Medium | Low
- **Action Required:** [Add to story | Add to test cases only | Ask PO]

**Edge Case 2:** [If applicable]

- **Scenario:** ...
- **Expected Behavior:** ...
- **Criticality:** ...
- **Action Required:** ...

**If NO edge cases identified:** ✅ Story covers all edge cases adequately

---

### Testability Validation

**Is this story testable as written?** ✅ Yes | ⚠️ Partially | ❌ No

**Testability Issues (if any):**

- [ ] Acceptance criteria are vague or subjective
- [ ] Expected results are not specific enough
- [ ] Missing test data examples
- [ ] Missing error scenarios
- [ ] Missing performance criteria (if NFR applies)
- [ ] Cannot be tested in isolation (missing dependencies info)

**Recommendations to Improve Testability:**
[If there are issues, list specific recommendations]

---

## ✅ Step 3: Refined Acceptance Criteria

[Take acceptance criteria from story.md and refine them with specific data + add identified edge cases]

### Scenario 1: [Refined scenario name - Happy Path]

**Type:** Positive
**Priority:** Critical

- **Given:**
  - [Initial system state - VERY SPECIFIC with data]
  - [Preconditions - user logged in as X, existing data Y, etc.]

- **When:**
  - [User action - SPECIFIC with exact data]
  - [E.g., User enters email "john@example.com" and clicks "Submit"]

- **Then:**
  - [Expected result 1 - SPECIFIC and VERIFIABLE]
  - [Expected result 2 - with exact data]
  - [Expected result 3 - system/DB changes]
  - [Expected status code if API: 200 OK]
  - [Expected response format if API]

---

### Scenario 2: [Error scenario - invalid data]

**Type:** Negative
**Priority:** High

- **Given:**
  - [Initial state]

- **When:**
  - [Action with SPECIFIC INVALID data]
  - [E.g., User enters invalid email "notanemail"]

- **Then:**
  - [EXACT error message that should display]
  - [Status code: 400 Bad Request]
  - [Response: {success: false, error: {code: "INVALID_EMAIL", message: "Email format is invalid"}}]
  - [Verification: system did NOT change state/DB]

---

### Scenario 3: [Edge case - boundary]

**Type:** Boundary
**Priority:** Medium/High

- **Given:**
  - [Initial state]

- **When:**
  - [Action with boundary value - min, max, empty, etc.]

- **Then:**
  - [Specific expected behavior]

---

### Scenario 4: [Additional edge case NOT in original story]

**Type:** Edge Case
**Priority:** Medium
**Source:** Identified during critical analysis (Step 2)

- **Given:**
  - [Edge case initial state]

- **When:**
  - [Specific edge case action]

- **Then:**
  - [Expected behavior - NEEDS PO/DEV VALIDATION]
  - **⚠️ NOTE:** This scenario was NOT in original story - needs PO/Dev confirmation

---

[Continue with all necessary scenarios - DO NOT force minimum number]

---

## 🧪 Step 4: Test Design

### Test Coverage Analysis

**Total Test Cases Needed:** [Realistic number based on complexity]

**Breakdown:**

- Positive: [X] test cases
- Negative: [Y] test cases
- Boundary: [Z] test cases
- Integration: [W] test cases (if applicable)
- API: [V] test cases (if story has API endpoints)

**Rationale for This Number:**
[Explain why this number is adequate - consider complexity, integration points, identified edge cases]

---

### Parametrization Opportunities

**Parametrized Tests Recommended:** ✅ Yes | ❌ No

**If Yes:**

**Parametrized Test Group 1:** [Descriptive name]

- **Base Scenario:** [What is being tested]
- **Parameters to Vary:** [What data varies]
- **Test Data Sets:**

| Parameter 1 | Parameter 2 | Parameter 3 | Expected Result |
| ----------- | ----------- | ----------- | --------------- |
| [value 1]   | [value 2]   | [value 3]   | [result 1]      |
| [value 4]   | [value 5]   | [value 6]   | [result 2]      |
| [value 7]   | [value 8]   | [value 9]   | [result 3]      |

**Total Tests from Parametrization:** [Number of combinations]
**Benefit:** [Why parametrize this case - reduces duplication, better coverage, etc.]

---

**Parametrized Test Group 2:** [If applicable]

- **Base Scenario:** ...
- **Parameters to Vary:** ...
- **Test Data Sets:** [Similar table]

---

**If No Parametrization:**
[Explain why not recommended - e.g., scenarios are too different, no common pattern, etc.]

---

### Test Cases

#### **TC-001: [Descriptive and specific title]**

**Related Scenario:** Scenario 1 (Refined AC above)
**Type:** Positive | Negative | Boundary
**Priority:** Critical | High | Medium | Low
**Test Level:** UI | API | Integration | E2E
**Parametrized:** ✅ Yes (Group 1) | ❌ No

---

**Preconditions:**

- [Required initial system state]
- [Pre-existing data in DB if applicable - BE SPECIFIC]
- [User logged in as: [role/email]]
- [Necessary system configuration]

---

**Test Steps:**

1. [Step 1 - specific action with exact data]
   - **Data:** Field1: "value1", Field2: "value2"
2. [Step 2 - specific action]
   - **Data:** [If applicable]
3. [Step 3 - specific verification]
   - **Verify:** [What to verify exactly - UI element, API response, DB state]

---

**Expected Result:**

- **UI:** [If applicable - what should be seen, what message, what visual change]
- **API Response:** [If applicable]
  - Status Code: [200 OK | 201 Created | etc.]
  - Response Body:

    ```json
    {
      "success": true,
      "data": {
        "field1": "expected value",
        "field2": 123
      }
    }
    ```

- **Database:** [If applicable - what should change in DB]
  - Table: [table]
  - Record: [what record was created/modified/deleted]
  - Fields: [specific fields with expected values]
- **System State:** [Changes in system state]

---

**Test Data:**

```json
{
  "input": {
    "field1": "specific value",
    "field2": 123,
    "field3": true
  },
  "user": {
    "email": "testuser@example.com",
    "role": "user_role_from_PRD"
  }
}
```

---

**Post-conditions:**

- [System state after test]
- [Cleanup needed if applicable]

---

#### **TC-002: [Title - negative test]**

**Related Scenario:** Scenario 2
**Type:** Negative
**Priority:** High
**Test Level:** API
**Parametrized:** ❌ No

**Preconditions:**

- [Initial state]

**Test Steps:**

1. [Step with SPECIFIC INVALID data]
2. [Verify error response]

**Expected Result:**

- **Status Code:** 400 Bad Request
- **Response Body:**

  ```json
  {
    "success": false,
    "error": {
      "code": "INVALID_INPUT",
      "message": "Email format is invalid",
      "field": "email"
    }
  }
  ```

- **Database:** NO changes (verify data was NOT created/modified)
- **UI:** [If applicable - error message should display]

**Test Data:**

```json
{
  "input": {
    "email": "invalid-email-format",
    "password": "Valid123!"
  }
}
```

---

#### **TC-003: [Title - boundary test]**

**Related Scenario:** Scenario 3
**Type:** Boundary
**Priority:** Medium
**Test Level:** Integration
**Parametrized:** ✅ Yes (Group 1)

[... similar structure ...]

---

[Continue with ALL necessary test cases - as many as identified in "Test Coverage Analysis"]

---

## 🔗 Integration Test Cases (If Applicable)

[If story involves integration points identified in Step 1]

### Integration Test 1: [Description - e.g., Frontend ↔ Backend API]

**Integration Point:** [Frontend → Backend API]
**Type:** Integration
**Priority:** High

**Preconditions:**

- Backend API is running
- Frontend can reach API endpoint
- [Other prerequisites]

**Test Flow:**

1. Frontend sends request to API endpoint [URL]
2. API processes request
3. API returns response
4. Frontend receives and processes response

**Contract Validation:**
[Based on api-contracts.yaml, validate contract]

- Request format matches OpenAPI spec: ✅ Yes
- Response format matches OpenAPI spec: ✅ Yes
- Status codes match spec: ✅ Yes

**Expected Result:**

- Integration successful
- Data flows correctly: Frontend → API → DB → API → Frontend
- No data loss or transformation errors

---

### Integration Test 2: [If applicable - e.g., Backend ↔ External Service]

**Integration Point:** [Backend → External Service (Stripe/Email/etc.)]
**Type:** Integration
**Priority:** High

**Mock Strategy:**

- External service will be MOCKED for automated tests
- Real integration tested manually in staging environment
- Mock tool: [MSW | Nock | etc.]

**Test Flow:**

1. [Integration step]
2. [Verification]

**Expected Result:**

- [Expected integration result]

---

## 📊 Edge Cases Summary

[Consolidate all identified edge cases]

| Edge Case     | Covered in Original Story? | Added to Refined AC?     | Test Case | Priority |
| ------------- | -------------------------- | ------------------------ | --------- | -------- |
| [Edge case 1] | ❌ No                      | ✅ Yes (Scenario 4)      | TC-XXX    | High     |
| [Edge case 2] | ✅ Yes                     | ✅ Yes (Scenario 3)      | TC-YYY    | Medium   |
| [Edge case 3] | ❌ No                      | ⚠️ Needs PO confirmation | TBD       | Low      |

---

## 🗂️ Test Data Summary

### Data Categories

| Data Type       | Count | Purpose         | Examples                |
| --------------- | ----- | --------------- | ----------------------- |
| Valid data      | [X]   | Positive tests  | [Specific examples]     |
| Invalid data    | [Y]   | Negative tests  | [Specific examples]     |
| Boundary values | [Z]   | Boundary tests  | [min, max, empty, null] |
| Edge case data  | [W]   | Edge case tests | [Specific examples]     |

### Data Generation Strategy

**Static Test Data:**
[Data that is hardcoded because it's critical/specific]

- [Example 1]
- [Example 2]

**Dynamic Test Data (using Faker.js):**
[Data generated dynamically]

- User data: `faker.internet.email()`, `faker.person.firstName()`
- Numbers: `faker.number.int({ min: X, max: Y })`
- Dates: `faker.date.recent()`

**Test Data Cleanup:**

- ✅ All test data is cleaned up after test execution
- ✅ Tests are idempotent (can run multiple times)
- ✅ Tests do not depend on execution order

---

## 📝 PART 2: Integration and Output

**⚠️ IMPORTANT:** This part implements the **JIRA-FIRST → LOCAL MIRROR** flow to maintain consistency with the story management process.

---

### Step 5: Update Story in Jira

**Objective:** Refine story in Jira WITH refinements identified in Step 2, BEFORE generating test cases.

**Tool:** Atlassian MCP

**Steps to execute:**

1. **Read current story from Jira:**
   - Use Atlassian MCP to get the issue
   - Input: Real Jira Key extracted from story.md (e.g., UPEX-45)
   - ⚠️ **DO NOT use** folder naming convention (STORY-UPEX-45)
   - Get: description, current acceptance criteria

2. **Prepare refined content:**

   Based on Step 2 analysis, prepare:
   - **Refined Acceptance Criteria** (from Step 3)
   - **Identified Edge Cases** (from Step 2)
   - **Clarified Business Rules** (from Step 2)

3. **Update story in Jira:**
   - Use Atlassian MCP to edit the issue
   - Add new section to description with the following content:

   ***

   ## 🧪 QA Refinements (Shift-Left Analysis)

   **Analysis Date:** [YYYY-MM-DD]
   **Status:** Refined by QA

   ### Refined Acceptance Criteria

   [Paste refined scenarios from Step 3]

   ### Edge Cases Identified

   [List edge cases from Step 2]

   ### Clarified Business Rules

   [Add clarifications from Step 2]

   ***
   - Add label: `shift-left-reviewed`

**Expected output:**

- ✅ Story updated in Jira with refinements
- ✅ Label `shift-left-reviewed` added
- ✅ Description enriched with QA analysis

---

### Step 6: Add Test Cases Comment in Jira

**Objective:** Add ALL test cases as comment in Jira story for maximum team visibility.

**Tool:** Atlassian MCP

**Comment structure:**

```
## 🧪 Shift-Left Test Cases - Generated [Date]

**QA Engineer:** [Name or "AI-Generated"]
**Status:** Draft - Pending PO/Dev Review

---

[PASTE HERE ALL CONTENT GENERATED FROM "Test Cases: STORY-..." TO "Test Execution Tracking"]

---

## 📢 Action Required

**@[Product Owner]:**

- [ ] Review and answer Critical Questions (see Step 8 below)
- [ ] Validate suggested story improvements
- [ ] Confirm expected behavior for identified edge cases

**@[Dev Lead]:**

- [ ] Review Technical Questions (see Step 8 below)
- [ ] Validate integration points and test approach
- [ ] Confirm test data strategy

**@[QA Team]:**

- [ ] Review test cases for completeness
- [ ] Validate parametrization strategy
- [ ] Prepare test environment

---

**Next Steps:**

1. Team discusses critical questions and ambiguities
2. PO/Dev provide answers and clarifications
3. QA updates test cases based on feedback
4. Dev starts implementation with clear acceptance criteria

---

**Documentation:** Full test cases also available at:
`.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}/test-cases.md`
```

**Steps to execute:**

1. Use Atlassian MCP to add comment to issue
2. Input: Story Jira Key + complete comment content
3. Mention team members in comment (@PO, @Dev, @QA) per project configuration

**Expected output:**

- ✅ Comment created in Jira with complete test cases
- ✅ Team notified via mentions
- ✅ Action checklist added for follow-up

---

### Step 7: Generate Local test-cases.md (Mirroring)

**Objective:** Create local `.md` file as MIRROR of Jira comment for version control and offline documentation.

**Path:** `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}/test-cases.md`

**Content:** IDENTICAL to content generated in Step 6 (entire Test Cases template)

**Expected output:**

- ✅ `test-cases.md` file created locally
- ✅ Content is EXACT MIRROR of Jira comment
- ✅ Available for git versioning

---

### Step 8: Final QA Feedback Report

**Objective:** Report to USER the executive summary and pending actions.

**Report format:**

---

## ✅ Shift-Left Test Cases - Execution Summary

**Story:** [STORY-KEY] - [Title]
**Analysis Date:** [YYYY-MM-DD]

---

### 📊 Summary for PO/Dev

**Story Quality Assessment:** ✅ Good | ⚠️ Needs Improvement | ❌ Significant Issues

**Key Findings:**

1. [Finding 1 - e.g., Story is clear but missing edge case X]
2. [Finding 2 - e.g., Acceptance criteria should specify error messages]
3. [Finding 3 - if applicable]

---

### 🚨 Critical Questions for PO

[Questions that MUST be answered before implementation]

**Question 1:** [Specific question about business or behavior]

- **Context:** [Why we're asking this]
- **Impact if not answered:** [What risk it poses]
- **Suggested Answer:** [If we have suggestion based on user journey/business model]

**Question 2:** [If applicable]

- **Context:** ...
- **Impact if not answered:** ...
- **Suggested Answer:** ...

---

### 🔧 Technical Questions for Dev

[Technical questions that affect testing approach]

**Question 1:** [Technical question - e.g., how concurrency is handled]

- **Context:** [Why we're asking]
- **Impact on Testing:** [How it affects our test cases]

**Question 2:** [If applicable]

- **Context:** ...
- **Impact on Testing:** ...

---

### 💡 Suggested Story Improvements

[Suggestions to improve story BEFORE implementing - based on Step 2 analysis]

**Improvement 1:** [Specific suggestion]

- **Current State:** [How the acceptance criteria / description currently is]
- **Suggested Change:** [How it should be]
- **Benefit:**
  - Clarity: [How it improves clarity]
  - Testability: [How it improves testability]
  - Quality: [How it reduces risks]

**Improvement 2:** [If applicable]

- **Current State:** ...
- **Suggested Change:** ...
- **Benefit:** ...

---

### 🧪 Testing Recommendations

**Pre-Implementation Testing:**

- ✅ Recommended: Exploratory testing with mockups/prototypes
- ✅ Recommended: Review API contracts with Dev before implementation
- [Other specific recommendations]

**During Implementation:**

- ✅ Pair with Dev for integration testing approach
- ✅ Review unit tests as Dev writes them
- [Other recommendations]

**Post-Implementation:**

- ✅ Run all test cases designed here
- ✅ Additional exploratory testing session
- ✅ Performance testing (if NFRs apply)
- [Other recommendations]

---

### ⚠️ Risks & Mitigation

[Specific risks for this story]

**Risk 1:** [Risk description]

- **Likelihood:** High | Medium | Low
- **Impact:** High | Medium | Low
- **Mitigation:** [Which test cases mitigate this risk]

**Risk 2:** [If applicable]

- **Likelihood:** ...
- **Impact:** ...
- **Mitigation:** ...

---

### ✅ What Was Done

**Jira Updates:**

- ✅ Story refined in Jira with acceptance criteria improvements
- ✅ Label `shift-left-reviewed` added
- ✅ Test cases added as comment in Jira story
- ✅ Team members tagged for review (@PO, @Dev, @QA)

**Local Files:**

- ✅ `test-cases.md` created at: `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}/`

**Test Coverage:**

- Total test cases designed: [X]
  - Positive: [Y]
  - Negative: [Z]
  - Boundary: [W]
  - Integration: [V]

---

### 🎯 Next Steps (Team Action Required)

1. **PO:** Review critical questions in Jira comment and provide answers
2. **Dev:** Review technical questions and validate test approach
3. **Team:** Discuss suggested story improvements in refinement session
4. **QA:** Wait for clarifications, then finalize test cases
5. **Dev:** Start implementation ONLY after critical questions are resolved

---

**⚠️ BLOCKER:** Dev should NOT start implementation until critical questions are answered by PO.

**Jira Link:** [Link to story in Jira]
**Local Test Cases:** `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}/test-cases.md`

---

---

## 🎯 Definition of Done (QA Perspective)

This story is considered "Done" from QA when:

- [ ] All ambiguities and questions from this document are resolved
- [ ] Story is updated with suggested improvements (if accepted by PO)
- [ ] All test cases are executed and passing
- [ ] Critical/High test cases: 100% passing
- [ ] Medium/Low test cases: ≥95% passing
- [ ] All critical and high bugs resolved and verified
- [ ] Integration tests passing (if applicable)
- [ ] API contract validation passed (if applicable)
- [ ] NFRs validated (if applicable)
- [ ] Regression tests passed
- [ ] Exploratory testing completed
- [ ] Test execution report generated
- [ ] No blockers for next stories in epic

---

## 📎 Related Documentation

- **Story:** `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}/story.md`
- **Epic:** `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/epic.md`
- **Feature Test Plan:** `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/feature-test-plan.md`
- **Business Model:** `.context/idea/business-model.md`
- **PRD:** `.context/PRD/` (all files)
- **SRS:** `.context/SRS/` (all files)
- **Architecture:** `.context/SRS/architecture-specs.md`
- **API Contracts:** `.context/SRS/api-contracts.yaml`

---

## 📋 Test Execution Tracking

[This section is completed during execution]

**Test Execution Date:** [TBD]
**Environment:** Staging
**Executed By:** [Name]

**Results:**

- Total Tests: [X]
- Passed: [Y]
- Failed: [Z]
- Blocked: [W]

**Bugs Found:**

- [Bug ID 1]: [Brief description]
- [Bug ID 2]: [Brief description]

**Sign-off:** [QA Name] - [Date]

---

**Format:** Structured Markdown following **JIRA-FIRST → LOCAL MIRROR** flow

---

## 🔧 Prerequisites to Execute This Prompt

- ✅ ALL context files (idea, PRD, SRS) must be complete
- ✅ Feature test plan must exist
- ✅ Local Story.md must exist
- ✅ **Local Story Path available** (e.g., `.context/PBI/epics/EPIC-UPEX-13-name/stories/STORY-UPEX-45-name/`)
- ✅ **Story.md must contain `Jira Key:` field** with real key (e.g., UPEX-45)
- ✅ **Epic.md must contain `Jira Key:` field** with real epic key (e.g., UPEX-13)
- ✅ **Atlassian MCP access configured and working**
- ✅ Time to critically analyze and not just mechanically generate test cases

**⚠️ story.md Validation:**

The story.md file must contain in its metadata:

```markdown
**Jira Key:** UPEX-45
**Epic:** EPIC-UPEX-13-feature-name
```

These are the real data. Note: The issue number (45, 13) is the same in the folder naming convention and in the Jira Key.

---

## 📋 Execution Flow (For AI)

### Step 0: Create working branch

**Objective:** Create a specific branch for Shift-Left Testing work before generating test cases.

**Steps to execute:**

1. Checkout from `staging`: `git checkout staging && git pull`
2. Create branch using format: `test/{CODA_KEY}/{short-description}`
3. `{JIRA_KEY}` is extracted from `**Jira Key:**` field in story.md
4. `{short-description}` is derived from story name/title in kebab-case (max 3-4 words)

**Example:**

```bash
git checkout staging && git pull
git checkout -b test/UPEX-45/user-login-flow
```

**⚠️ IMPORTANT:** This branch will only contain the generated `test-cases.md` file. DO NOT include other changes.

---

### Required user input:

```
Story Path: .context/PBI/epics/EPIC-UPEX-13-name/stories/STORY-UPEX-45-name/
```

**⚠️ Automatic Process:**

1. Prompt reads: `{STORY_PATH}/story.md`
2. Prompt extracts: `**Jira Key:**` field (e.g., UPEX-45)
3. Prompt extracts: `**Epic:**` field to find epic path
4. Prompt reads: Epic.md and extracts Epic Jira Key (e.g., UPEX-13)
5. Prompt uses: Real Jira Keys for MCP operations

### Execution order:

**Step 0: Create working branch**

1. Read `{STORY_PATH}/story.md` provided by user
2. Extract `**Jira Key:**` field from story (e.g., UPEX-45)
3. Derive `{short-description}` from story title in kebab-case
4. Execute: `git checkout staging && git pull`
5. Create branch: `git checkout -b test/{JIRA_KEY}/{short-description}`

**Pre-requisite: Extract Jira Keys** 6. Extract `**Epic:**` field to get epic path 7. Read epic.md and extract Epic Jira Key (e.g., UPEX-13) 8. Save both real Jira Keys for Steps 5 and 6

**Read Complete Context:** 9. Read all context files (PRD, SRS, local epic.md, feature-test-plan.md, story.md) 10. Read current story from Jira with MCP (using real Story Jira Key) 11. Read epic from Jira with MCP (using real Epic Jira Key) 12. **Read epic comments in Jira** - especially "Feature Test Plan"

**PART 1 - Analysis and Design:** 13. **Step 1:** Critical Analysis (includes Epic-Level Context from comments) 14. **Step 2:** Story Quality Analysis 15. **Step 3:** Refined Acceptance Criteria 16. **Step 4:** Test Design

**PART 2 - Integration and Output:** 17. **Step 5:** Update story in Jira with refinements (MCP + real Story Jira Key) 18. **Step 6:** Create comment in Jira with complete test cases (MCP + real Story Jira Key) 19. **Step 7:** Generate local `test-cases.md` file in {STORY_PATH}/ (Write tool) 20. **Step 8:** Report summary to user (Output) 21. **Step 9:** Commit `test-cases.md` file to working branch

### Tools to use:

**Git (Bash):**

- To checkout from `staging` and pull recent changes
- To create working branch with format `test/{JIRA_KEY}/{short-description}`
- To commit the generated `test-cases.md` file

**Atlassian MCP:**

- To read story from Jira
- To read epic from Jira (updated description)
- **To read epic comments in Jira** (especially "Feature Test Plan")
- To update story description and labels
- To add comments to issues

**File Operations:**

- To create local test-cases.md file
- To read context files (PRD, SRS, epic, feature-test-plan, story.md)

---

## ⚠️ IMPORTANT: Execution Principles

### Shift-Left Testing Philosophy:

- ✅ **Critical analysis first, test design second**
- ✅ **Early feedback is MORE valuable than perfect test cases**
- ✅ **Refine story BEFORE implementation** (shift-left!)
- ✅ **Exploratory test cases = comments in Jira** (not separate issues)
- ✅ **Epic context is critical** - ALWAYS read epic comments in Jira to get:
  - Already identified risks
  - Questions already answered by PO/Dev
  - Critical integration points
  - Updates after initial test plan

### Test Design Guidelines:

- ❌ **DON'T force minimum number of test cases** - depends on complexity
- ✅ **Use parametrization when applicable** - reduces duplication
- ✅ **Identify edge cases NOT covered** in original story
- ✅ **Ask critical questions to PO/Dev** - better to clarify than assume

### Jira-First Workflow:

- ✅ **ALWAYS update Jira first, then local** (consistency with story flow)
- ✅ **Test cases go in comments, NOT in subtasks** (exploratory nature)
- ✅ **Tag the team** (@PO, @Dev, @QA) for visibility
- ✅ **Add label `shift-left-reviewed`** for tracking

---

## 🎯 Post-Generation: Team Actions

### Immediately after executing this prompt:

1. **PO must:**
   - Review comment in Jira with test cases
   - Answer "Critical Questions for PO" in Step 8
   - Validate "Suggested Story Improvements"
   - Confirm expected behavior for identified edge cases

2. **Dev must:**
   - Review comment in Jira with test cases
   - Answer "Technical Questions for Dev" in Step 8
   - Validate integration points and test approach
   - **DO NOT start implementation** until critical questions resolved

3. **QA must:**
   - Wait for PO/Dev answers
   - Update test cases based on feedback
   - Prepare test environment

4. **User (who executed the prompt) must:**
   - Share Jira story link with team
   - Facilitate critical questions discussion
   - Ensure questions are answered before sprint

---

## 🚀 Test Cases Evolution (Post Shift-Left)

### Options for formalizing test cases:

Once PO/Dev have clarified all questions and story is refined:

**Option A: Keep in comments** (Recommended for simple stories)

- Test cases stay in Jira comment
- Local file serves as documentation
- QA executes from local file or comment

**Option B: Migrate to Xray Test Repository** (For complex or critical stories)

- Create Test Set/Suite in test management tool
- Link with story using "IsTestedBy"
- Maintain local file as mirror

**Option C: Automate** (Once test cases are stable)

- Use test cases as base for automation scripts
- Generate tests with Playwright/Cypress based on test-cases.md
- Integrate into CI/CD pipeline

---

## 🔄 Integrated Workflow: Epic ↔ Story Context

### Information Flow:

```
1. Epic Test Plan generated → Comment in Epic (Jira)
                           ↓
2. PO/Dev answer questions in Epic comments
                           ↓
3. Story Test Cases reads Epic comments
                           ↓
4. Story Test Cases inherits context:
   - Identified risks
   - Already answered questions
   - Integration points
   - Test strategy
                           ↓
5. Story Test Cases focuses on story-specific gaps
                           ↓
6. Comment added to Story (Jira) with test cases
                           ↓
7. PO/Dev answer story-specific questions
                           ↓
8. Implementation begins with complete context
```

**Benefits of this flow:**

- ✅ **Avoids duplication** of questions between epic and stories
- ✅ **Cumulative context** - each story inherits epic knowledge
- ✅ **Complete traceability** - everything documented in Jira comments
- ✅ **Improved collaboration** - PO/Dev see analysis evolution
- ✅ **Informed decisions** - Dev implements with complete risk context

---

## 📚 KATA Philosophy (Komponent-Action-Test-Architecture)

This prompt follows KATA principles:

- **Komponent:** Stories in Jira + local .md files
- **Action:** Shift-Left Testing - early analysis and refinement
- **Test:** Exploratory test cases in comments → later formalization
- **Architecture:** Jira-First → Local Mirror → Version Control → Automation (eventual)

**Traceability:**

```
Epic (Jira)
  ↓ contains
Story (Jira + .md)
  ↓ IsTestedBy (via comment)
Test Cases (Comment + test-cases.md)
  ↓ eventually migrates to
Test Suite (Xray Test Repository - optional)
  ↓ automates to
Test Scripts (Playwright/Cypress - optional)
```

---

**Version:** 3.2 - Git Branch Naming Convention + Step 0
**Last updated:** 2025-12-06
**Main changes:**

- ✅ Added Jira-First flow (Steps 5-8)
- ✅ Integration with Atlassian MCP
- ✅ Test cases in comments (not subtasks)
- ✅ Automatic story refinement in Jira
- ✅ KATA philosophy integrated
- ✅ **Reading epic comments in Jira** for updated context
- ✅ **New "Epic-Level Context" sub-section** in Step 1 that extracts:
  - Critical risks identified at epic level
  - Integration points from epic analysis
  - Critical questions already asked and answered
  - Test strategy from epic
  - Updates and clarifications from refinement
  - How story fits in epic
- ✅ **Git Branch Naming Convention** - format `test/{CODA_KEY}/{short-description}`
- ✅ **Step 0: Create working branch** - checkout from `staging` before generating test cases
- ✅ **Step 9: Commit file** - commit `test-cases.md` to working branch
