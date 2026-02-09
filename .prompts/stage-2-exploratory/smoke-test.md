# Smoke Test

Act as a Senior QA Engineer specialized in smoke testing and post-deployment validation.

---

## 🎯 TASK

**STAGE 2: SMOKE TEST ON STAGING**

Validate that the staging deployment is functional BEFORE starting full exploratory testing.

**This prompt is executed IMMEDIATELY** after deployment to staging and BEFORE exploratory testing.

---

## 📥 INPUT REQUIRED

### 1. Staging Deployment

**Verify:**

- Code deployed to staging
- Staging URL accessible
- CI/CD workflow passed successfully

**Information needed from user:**

- Staging URL: `https://[project]-develop.vercel.app`
- Recently deployed Feature/Story: `STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}`

### 2. Current Story

**Read:**

- `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}/story.md` - **CRITICAL** - Acceptance criteria
- `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}/test-cases.md` - Defined test cases (Stage 1)

**What to identify:**

1. What is the story's happy path?
2. What critical functionality must be validated?
3. Is there backend/auth integration to validate?

### 3. Deployment Context

**Read:**

- `.context/ci-cd-setup.md` - Deployment workflow
- `.context/environment-variables.md` - Staging variables
- `.context/infrastructure-setup.md` - URLs and configuration

---

## ⚙️ TOOLS VERIFICATION (MCP)

**MCP tools are NOT required for this phase.**

### Manual Tools

- Browser (Chrome/Firefox/Safari)
- DevTools (F12) to check console/network
- Access to staging URL

---

## 🎯 OBJECTIVE

Create a smoke test checklist to validate functional deployment:

**Includes:**

- ✅ Validate application loads without 500 errors
- ✅ Verify assets load (CSS, JS, images)
- ✅ Validate authentication works (if applicable)
- ✅ Validate story happy path works end-to-end
- ✅ Verify backend integration (APIs, DB)
- ✅ Validate basic navigation works

**Does NOT include:**

- ❌ Full exploratory testing (that's ui-exploration.md)
- ❌ Edge cases or negative testing (that's exploratory testing)
- ❌ Automated tests (that's Stage 4: Test Automation)

**Result:** Checklist that QA executes in **5-10 minutes** to confirm functional deployment.

---

## 📤 OUTPUT GENERATED

### Smoke Test Checklist

- ✅ `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}/smoke-test.md` - Executable checklist

**Checklist structure:**

```markdown
# Smoke Test: [STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name} - Name]

**Staging URL:** https://[project]-develop.vercel.app
**Date:** [Date]
**QA:** [Name]
**Duration:** 5-10 minutes

---

## ✅ Checklist

### 1. Basic Access

- [ ] Application loads without 500 errors
- [ ] No errors in console (F12)
- [ ] Assets load (CSS, JS, images)

### 2. Authentication (if applicable)

- [ ] Login works
- [ ] Logout works
- [ ] Session persists on refresh

### 3. Story Happy Path

- [ ] [Happy path step 1]
- [ ] [Happy path step 2]
- [ ] [Happy path step 3]

### 4. Backend Integration

- [ ] APIs respond correctly
- [ ] Data saves to DB
- [ ] Data retrieves correctly

---

## ✅ Result

- [ ] **PASSED:** Functional deployment, continue with exploratory testing
- [ ] **FAILED:** Broken deployment, DO NOT continue, report critical bug
```

---

## 🚨 CRITICAL RESTRICTIONS

### ❌ DO NOT

- **DO NOT do full exploratory testing** - Only quick smoke test
- **DO NOT test edge cases yet** - That's for exploratory testing
- **DO NOT create minor UX bugs** - Only critical bugs that block functionality
- **DO NOT spend more than 10 minutes** - Smoke test must be quick
- **DO NOT assume deployment works** - Validate manually

### ✅ DO

- **Validate the bare minimum** - Application loads + happy path works
- **Check console and network** - Identify technical errors
- **Report immediately if it fails** - Don't continue if smoke test fails
- **Document result** - PASSED or FAILED with evidence

---

## 🔄 WORKFLOW

---

## 📋 STEP 1: READ STORY ACCEPTANCE CRITERIA

**Objective:** Understand what should work in staging.

### Step 1.1: Read Story

**Action:** Read `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}/story.md`

**Identify:**

1. **Acceptance Criteria (AC):**
   - What should work?
   - What is the happy path?

2. **Critical functionality:**
   - Does it require authentication?
   - Is there backend integration?
   - Are there forms or inputs?

---

### Step 1.2: Read Test Cases

**Action:** Read `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}/test-cases.md`

**Identify:**

- Test case #1 (happy path) → Smoke test should cover this
- Minimum functionality that must work

---

## 🌐 STEP 2: OPEN STAGING URL AND VALIDATE BASIC ACCESS

**Objective:** Verify application loads without critical errors.

### Step 2.1: Open Staging URL

**Action:**

1. Open browser (Chrome recommended)
2. Open DevTools (F12)
3. Navigate to: `https://[project]-develop.vercel.app`

---

### Step 2.2: Validate Basic Access

**Checklist:**

**1. Application loads without 500 errors:**

- [ ] Landing page loads completely
- [ ] No 500 or 404 error screens
- [ ] Loading states complete correctly

**2. No errors in console:**

- Open Console tab (F12)
- [ ] No red errors in console
- [ ] Yellow warnings are acceptable (not critical)

**3. Assets load correctly:**

- [ ] CSS loads (page has styles)
- [ ] JavaScript loads (interactions work)
- [ ] Images load (no broken placeholders)

**If something fails here:**

```markdown
## ❌ SMOKE TEST FAILED - Basic Access

**Blocker:** [Error description]

**Evidence:**

- Screenshot: [Attach]
- Console errors:
```

[Copy console errors]

```

**Action:** Report to Development immediately, DO NOT continue.
```

---

## 🔐 STEP 3: VALIDATE AUTHENTICATION (If applicable)

**Objective:** Verify auth flow works.

### Step 3.1: Login

**Action:**

1. Navigate to `/login` (or the login route)
2. Use test credentials:
   - Email: `test@example.com` (or per `.env.example`)
   - Password: `Test123!`

**Validate:**

- [ ] Login form appears correctly
- [ ] Submit login works
- [ ] Redirect to dashboard/home after successful login
- [ ] No console errors during login

---

### Step 3.2: Session Persistence

**Action:**

1. After successful login, refresh page (F5)

**Validate:**

- [ ] Session persists (doesn't log you out)
- [ ] User info appears correctly (avatar, name, etc.)

---

### Step 3.3: Logout

**Action:**

1. Click on logout button

**Validate:**

- [ ] Logout works
- [ ] Redirect to landing/login page
- [ ] Session is cleared (can't access protected routes)

**If auth fails:**

```markdown
## ❌ SMOKE TEST FAILED - Authentication

**Blocker:** [Login/Logout doesn't work]

**Steps to reproduce:**

1. [Failing step]

**Action:** Report immediately, auth is critical.
```

---

## ✅ STEP 4: VALIDATE STORY HAPPY PATH

**Objective:** Verify main story functionality works.

### Step 4.1: Execute Happy Path

**Action:** Execute the main flow defined in acceptance criteria.

**Example adapted to YOUR story:**

```markdown
### Happy Path: [Flow name per AC]

1. [ ] [First step per acceptance criteria]
2. [ ] [Second step]
3. [ ] [Entity list appears]
4. [ ] [Each card shows: relevant fields]
5. [ ] [Click on entity opens detail]
6. [ ] [Detail shows complete information]

(Where [entities/fields] are determined from your story's AC.
Examples: mentors/skills in MYM, products/price in SHOP, posts/author in BLOG)
```

**For YOUR specific story, adapt the happy path:**

1. **Step 1:** [First AC step]
   - [ ] [What should happen]
   - [ ] [What to validate visually]

2. **Step 2:** [Second AC step]
   - [ ] [What should happen]
   - [ ] [What to validate]

3. **Step 3:** [Third AC step]
   - [ ] [Expected final result]

---

### Step 4.2: Visual Validation

**Visual checklist:**

- [ ] UI looks like designs (colors, spacing, fonts)
- [ ] Components render correctly
- [ ] Responsive design works (resize browser)
- [ ] Loading states are clear
- [ ] No broken layouts or overlapping elements

**If happy path fails:**

```markdown
## ❌ SMOKE TEST FAILED - Happy Path

**Blocker:** [Description of what doesn't work]

**Expected:** [What should happen per AC]

**Actual:** [What actually happens]

**Evidence:** [Screenshot or description]

**Action:** Report immediately.
```

---

## 🔗 STEP 5: VALIDATE BACKEND INTEGRATION

**Objective:** Verify APIs and DB work.

### Step 5.1: Check Network Tab

**Action:**

1. Open Network tab in DevTools (F12)
2. Execute happy path again
3. Observe requests

**Validate:**

- [ ] API calls to backend return 200 OK (not 500, not 404)
- [ ] Data sends correctly (payload in request)
- [ ] Data receives correctly (response has expected data)
- [ ] No continuously failing requests

**Validation example:**

```
GET /api/[entities] → 200 OK
Response: { "data": [...entities] }  ✅

POST /api/[resources] → 201 Created
Response: { "id": "xxx", "status": "created" }  ✅

(Where [entities/resources] depend on your project's domain.
Examples: mentors/sessions in MYM, products/orders in SHOP, posts/comments in BLOG)
```

---

### Step 5.2: Validate Data Persistence

**Action (if story modifies data):**

1. Create/modify data via UI (e.g.: create entity, edit profile, etc.)
2. Refresh page (F5)
3. Validate changes persist

**Validate:**

- [ ] Data saves to DB (persists after refresh)
- [ ] No data loss
- [ ] Data shows correct values

---

## 📝 STEP 6: GENERATE SMOKE TEST CHECKLIST

**Objective:** Document smoke test for QA reference.

### Step 6.1: Create File

**Action:** Create `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}/smoke-test.md`

**Content:**

```markdown
# Smoke Test: [STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name} - Name]

**Staging URL:** https://[project]-develop.vercel.app
**Date:** [Current date]
**QA:** [QA name]
**Duration:** 5-10 minutes

---

## ✅ Smoke Test Checklist

### 1. Basic Access

- [ ] **Application loads without 500 errors**
  - URL: https://[project]-develop.vercel.app
  - Landing page should load completely

- [ ] **No errors in console (F12)**
  - Console tab should not show red errors
  - Yellow warnings are acceptable

- [ ] **Assets load correctly**
  - [ ] CSS loads (page has styles)
  - [ ] JavaScript loads (interactions work)
  - [ ] Images load (no broken placeholders)

---

### 2. Authentication (if applicable)

- [ ] **Login works**
  - Email: `test@example.com`
  - Password: `Test123!`
  - Should redirect to dashboard after login

- [ ] **Session persists on refresh**
  - Refresh page (F5) → Session should maintain

- [ ] **Logout works**
  - Click logout → Should redirect to landing/login

---

### 3. Happy Path: [Happy Path Name]

**Description:** [Brief description of main flow]

**Steps:**

1. [ ] **[Step 1]**
   - Action: [What to do]
   - Validate: [What should happen]

2. [ ] **[Step 2]**
   - Action: [What to do]
   - Validate: [What should happen]

3. [ ] **[Step 3]**
   - Action: [What to do]
   - Validate: [Expected final result]

**Visual validation:**

- [ ] UI looks like designs
- [ ] No broken layouts
- [ ] Loading states are clear

---

### 4. Backend Integration

**Network Tab Validation:**

- [ ] **API calls return 200 OK**
  - Open DevTools → Network tab
  - Execute happy path
  - Validate requests to `/api/*` return 200

- [ ] **Data saves to DB (if applicable)**
  - Create/modify data via UI
  - Refresh page (F5)
  - Validate changes persist

- [ ] **Data retrieves correctly**
  - Data shown in UI matches expected

---

## 📊 Smoke Test Result

**Executed by:** [Name]
**Date:** [Date]
**Duration:** [Actual time]

### Final Result:

- [ ] **✅ PASSED:** Functional deployment, continue with exploratory testing
- [ ] **❌ FAILED:** Broken deployment, report critical bug immediately

---

### Notes (if applicable):

[Any additional observations]

---

### If FAILED:

**Blocker:** [Error description that blocks]

**Evidence:**

- Screenshot: [Attach]
- Console errors: [Copy]

**Next step:**

- Report to Development immediately
- DO NOT continue with exploratory testing until fixed
```

---

## 🎉 FINAL REPORT

**Show to user:**

````markdown
# ✅ SMOKE TEST CHECKLIST GENERATED

## File Created:

`.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{name}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}/smoke-test.md`

---

## Next Steps:

### ✅ If Smoke Test PASSED:

Continue with exploratory testing:

```bash
# 1. Execute UI exploration
Use: .prompts/stage-2-exploratory/ui-exploration.md

# 2. Execute API exploration (if applicable)
Use: .prompts/stage-2-exploratory/api-exploration.md

# 3. If you find bugs
Use: .prompts/stage-2-exploratory/bug-report.md
```
````

---

### ❌ If Smoke Test FAILED

**DO NOT continue with exploratory testing.**

**Immediate action:**

1. Report critical bug to Development
2. Include evidence (screenshots, console errors)
3. Deployment must be fixed before continuing

**Fix flow:**

```
Bug reported → Development fix → Re-deploy to staging → Re-run smoke test
```

---

## 📊 Generated Checklist

**Sections included:**

- ✅ Basic access (app loads, console no errors, assets OK)
- ✅ Authentication (login, logout, session persists)
- ✅ Story happy path (specific steps)
- ✅ Backend integration (API calls, data persistence)

**Estimated duration:** 5-10 minutes

**Ready to execute!**

```

---

## 📋 INTERNAL CHECKLIST (DO NOT SHOW)

**Validations before finishing:**

### Story Analyzed:
- [ ] Acceptance criteria read
- [ ] Happy path identified
- [ ] Critical functionality clear

### Checklist Generated:
- [ ] "Basic Access" section included
- [ ] "Authentication" section included (if applicable)
- [ ] "Happy Path" section with specific steps
- [ ] "Backend Integration" section included
- [ ] PASSED/FAILED result included

### Documentation:
- [ ] File created in correct path
- [ ] Staging URL included
- [ ] Estimated duration (5-10 min) mentioned
- [ ] Next steps clear

---

## 💡 BEST PRACTICES

### **1. Smoke Test ≠ Exploratory Testing**

**Smoke test (5-10 min):**
- Happy path only
- Validate deployment works
- Go/No-Go decision

**Exploratory testing (60-90 min):**
- Edge cases
- Negative testing
- UX review
- Full coverage

**Don't confuse:** Smoke test is quick, exploratory testing is deep.

---

### **2. FAILED Smoke Test = STOP**

**If smoke test fails:**
- ❌ DO NOT continue with exploratory testing
- ❌ DO NOT invest time testing something broken
- ✅ Report immediately
- ✅ Development fix → Re-deploy → Re-test

**Benefit:** Don't waste QA time on broken deployment.

---

### **3. ALWAYS Validate Backend Integration**

**Even if UI looks good:**
- Check Network tab (F12)
- Validate APIs return 200
- Validate data persists

**Why:** UI can render mock/hardcoded data but backend could be broken.

---

### **4. Document Evidence If It Fails**

**If smoke test fails, include:**
- Screenshot of the error
- Console errors (copy complete text)
- Network tab errors (copy request/response)
- Exact steps that caused the error

**Benefit:** Development can reproduce and fix faster.

---

### **5. Execute in Different Browsers (If time permits)**

**If you have 2-3 extra minutes:**
- Execute smoke test in Chrome
- Execute in Firefox or Safari

**Why:** Catch browser-specific issues early.

---

## 📚 REFERENCES

**Smoke testing best practices:**
- https://www.guru99.com/smoke-testing.html

**Exploratory testing:**
- `.prompts/stage-2-exploratory/ui-exploration.md` - UI exploration

**Testing strategy:**
- `.prompts/stage-4-automation/test-strategy.md` - Complete strategy

---

**✅ Smoke Test = Quick validation (5-10 min) + Go/No-Go decision + Foundation for exploratory testing**
```
