# TMS Integration (Test Management System)

Integration guide for syncing KATA test results with Xray Cloud or Jira Direct.

**Budget-Dependent**: This project supports **two TMS approaches** based on client budget:

1. **Xray Cloud** (Premium) - Full-featured TMS with advanced reporting
2. **Jira Direct** (Budget-Friendly) - Use Jira custom fields without Xray

---

## 1. Overview

### What is TMS Integration?

TMS Integration connects KATA's `@atc` decorators with test cases in Jira, enabling:

- **Automatic traceability**: Each ATC maps 1:1 to a Jira issue
- **Result synchronization**: Test results (PASS/FAIL) sync to Jira automatically
- **Granular reporting**: See which ATCs passed/failed, not just tests
- **Audit trail**: History of test executions in Jira comments

### Sync Flow

```
Test Execution (Playwright)
    ↓
ATCs execute with @atc('PROJECT-XXX') decorator
    ↓
Decorator captures results (PASS/FAIL/ERROR)
    ↓
Generate JSON Report (atc_results.json)
    ↓
Sync Script runs (jiraSync.ts)
    ↓
POST to Jira/Xray API
    ↓
Jira issues updated with test results
```

---

## 2. Option 1: Xray Cloud Integration (Premium)

### 2.1 Setup Requirements

**Prerequisites:**

- Jira Cloud instance
- Xray Cloud app installed from Atlassian Marketplace
- API credentials (Client ID + Client Secret)

**Cost**: ~$10-50/month depending on users

### 2.2 Configuration

**Step 1: Get Xray API Credentials**

1. Go to Xray Cloud Settings API Keys
2. Create new API Key
3. Copy **Client ID** and **Client Secret**

**Step 2: Configure Environment Variables**

```env
# .env (DO NOT commit to git)

# Enable auto-sync
AUTO_SYNC=true
TMS_PROVIDER=xray

# Xray Cloud credentials
XRAY_CLIENT_ID=your_client_id_here
XRAY_CLIENT_SECRET=your_client_secret_here
XRAY_PROJECT_KEY=PROJECT
```

### 2.3 Using the Sync Script

The sync is handled by `tests/utils/jiraSync.ts`:

```typescript
import { syncToXray } from '@utils/jiraSync';

// In playwright.config.ts globalTeardown
await syncToXray();
```

### 2.4 Hook into Playwright

In `playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  globalTeardown: async () => {
    if (process.env.AUTO_SYNC === 'true') {
      console.log('\n Syncing test results to TMS...');
      const { syncToXray } = await import('./tests/utils/jiraSync');
      await syncToXray();
    }
  },
});
```

---

## 3. Option 2: Jira Direct Integration (Budget-Friendly)

### 3.1 Setup Requirements

**Prerequisites:**

- Jira Cloud instance
- Jira API token
- Custom field in Jira for test status

**Cost**: Free (included with Jira)

### 3.2 Configuration

**Step 1: Create Custom Field in Jira**

1. Go to Jira Settings Issues Custom Fields
2. Create new field:
   - Type: **Select List (single choice)**
   - Name: **Test Status**
   - Options: `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN`
3. Note the custom field ID (e.g., `customfield_10100`)

**Step 2: Get Jira API Token**

1. Go to <https://id.atlassian.com/manage-profile/security/api-tokens>
2. Create API Token
3. Copy token

**Step 3: Configure Environment Variables**

```env
# .env

# Enable auto-sync
AUTO_SYNC=true
TMS_PROVIDER=jira

# Jira Direct
JIRA_URL=https://your-domain.atlassian.net
JIRA_USER=your-email@example.com
JIRA_API_TOKEN=your_api_token_here
JIRA_TEST_STATUS_FIELD=customfield_10100
```

### 3.3 Using the Sync Script

```typescript
import { syncToJiraDirect } from '@utils/jiraSync';

// In playwright.config.ts globalTeardown
await syncToJiraDirect();
```

---

## 4. Implementation Details

### 4.1 Decorator Usage

```typescript
import { atc } from '@utils/decorators';

class LoginPage extends UiBase {
  @atc('PROJECT-001')
  async loginWithValidCredentials(credentials: Credentials) {
    await this.goto('/');
    await this.page.fill('#email', credentials.email);
    await this.page.fill('#password', credentials.password);
    await this.page.click('button[type="submit"]');
    await expect(this.page).toHaveURL(/.*dashboard.*/);
  }
}
```

### 4.2 Sync Script Location

The sync functionality is in `tests/utils/jiraSync.ts`:

```typescript
// Available exports
export async function syncToXray(): Promise<void>;
export async function syncToJiraDirect(): Promise<void>;
```

---

## 5. Choosing the Right Approach

| Feature                    | Xray Cloud                                    | Jira Direct                     |
| -------------------------- | --------------------------------------------- | ------------------------------- |
| **Cost**                   | ~$10-50/month                                 | Free                            |
| **Setup Complexity**       | Medium                                        | Low                             |
| **Reporting**              | Advanced (test plans, dashboards, metrics)    | Basic (custom field + comments) |
| **Traceability**           | Excellent (bi-directional linking)            | Good (manual linking)           |
| **Test Execution History** | Full history with trends                      | Limited (via comments)          |
| **Automation Support**     | Native API                                    | Generic Jira API                |
| **Best For**               | Teams with QA budget, need advanced reporting | Small teams, tight budget       |

**Recommendation:**

- **Start with Jira Direct** for MVP/early stage
- **Upgrade to Xray** when team grows or reporting needs increase

---

## 6. Test ID Format

Both approaches use the same test ID format:

```typescript
@atc('PROJECT-XXX') // e.g., @atc('UPEX-123')
```

**Format**: `{PROJECT_KEY}-{ISSUE_NUMBER}`

**Examples:**

- `UPEX-123` - Maps to <https://your-domain.atlassian.net/browse/UPEX-123>
- `DEMO-456` - Maps to <https://your-domain.atlassian.net/browse/DEMO-456>

**Requirements:**

- Must match Jira issue key exactly
- Issue must exist in Jira before sync
- Issue can be any type (Story, Task, Test, etc.)

---

## 7. Creating Test Cases in Jira

### For Xray Cloud

1. Create issues with type **Test** (provided by Xray)
2. Write test steps in Xray format
3. Note the issue key (e.g., `UPEX-123`)
4. Use that key in `@atc('UPEX-123')`

### For Jira Direct

1. Create issues with type **Task** or **Story**
2. Add label `test-case` for filtering
3. Ensure custom field "Test Status" is available
4. Note the issue key (e.g., `UPEX-123`)
5. Use that key in `@atc('UPEX-123')`

---

## 8. Xray CLI Commands

The Xray CLI is available in `cli/xray.ts`:

```bash
# Authenticate
bun xray auth --client-id "xxx" --client-secret "xxx"

# Import test results
bun xray results import --file test-results/results.json

# Create test execution
bun xray execution create --project UPEX --summary "Sprint 10 Regression"

# Update test status
bun xray test update UPEX-123 --status PASS

# List tests
bun xray test list --project UPEX --status FAIL
```

---

## 9. Troubleshooting

### Issue: "401 Unauthorized"

**Cause**: Invalid credentials

**Solution**:

- Verify `XRAY_CLIENT_ID` / `JIRA_API_TOKEN` are correct
- Check credentials haven't expired
- Ensure API token has required permissions

### Issue: "Test key not found"

**Cause**: Test ID doesn't exist in Jira

**Solution**:

- Create the Jira issue first
- Verify issue key matches exactly (case-sensitive)
- Check project key is correct

### Issue: "Custom field not found" (Jira Direct)

**Cause**: Custom field ID is incorrect

**Solution**:

- Get correct field ID from Jira API:

  ```bash
  curl -u email@example.com:api_token \
    https://your-domain.atlassian.net/rest/api/3/field | grep -i "test status"
  ```

- Update `JIRA_TEST_STATUS_FIELD` in `.env`

### Issue: Sync is slow

**Cause**: Sequential API calls

**Solution**:

- The sync script uses batch operations where possible
- Implement retry logic for rate limits
- Run sync only in CI/CD, not locally

---

## 10. Best Practices

**DO:**

- Create Jira issues before writing ATCs
- Use meaningful test IDs that map to requirements
- Add comments in Jira with execution context (build ID, environment)
- Run sync in CI/CD, not locally (avoid noise)
- Monitor sync failures (set up alerts)

**DON'T:**

- Hardcode test IDs in multiple places
- Sync from local runs (pollutes Jira)
- Skip error handling in sync scripts
- Use generic test IDs (`TEST-001`, `TEST-002`)
- Sync without authentication

---

## 11. CI/CD Integration

In GitHub Actions, enable sync only on `main` branch:

```yaml
# .github/workflows/test.yml
- name: Run tests
  run: bun run test

- name: Sync results to Jira
  if: github.ref == 'refs/heads/main'
  env:
    AUTO_SYNC: true
    TMS_PROVIDER: xray
    XRAY_CLIENT_ID: ${{ secrets.XRAY_CLIENT_ID }}
    XRAY_CLIENT_SECRET: ${{ secrets.XRAY_CLIENT_SECRET }}
    BUILD_ID: ${{ github.run_id }}
  run: bun run test:sync
```

---

## 12. References

- **Xray Cloud API**: <https://docs.getxray.app/display/XRAYCLOUD/REST+API>
- **Jira Cloud API**: <https://developer.atlassian.com/cloud/jira/platform/rest/v3/>
- **Xray Pricing**: <https://marketplace.atlassian.com/apps/1211769/xray-test-management-for-jira>
- **Jira API Tokens**: <https://id.atlassian.com/manage-profile/security/api-tokens>
- **Xray CLI**: `cli/xray.ts` in this repo
- **Jira Sync**: `tests/utils/jiraSync.ts` in this repo

---

**Last Updated**: 2026-02-12
