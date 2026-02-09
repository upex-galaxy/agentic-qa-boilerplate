# Smoke Tests Post-Deploy

> Automated tests that run after each production deployment.

---

## Context

Post-deployment smoke tests validate that critical functionality works in the production environment. They run automatically after each deployment and alert the team if something is broken.

---

## Your Task

Create smoke tests with Playwright that validate critical paths:

### Basic Smoke Test Suite

```typescript
// tests/smoke/production.spec.ts
import { test, expect } from '@playwright/test';

const PRODUCTION_URL = process.env.PRODUCTION_URL || 'https://your-app.com';

test.describe('Production Smoke Tests', () => {
  test.describe.configure({ retries: 2 }); // Retry flaky tests

  test('homepage loads successfully', async ({ page }) => {
    await page.goto(PRODUCTION_URL);
    await expect(page).toHaveTitle(/.*/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('API health check returns 200', async ({ request }) => {
    const response = await request.get(`${PRODUCTION_URL}/api/health`);
    expect(response.status()).toBe(200);
  });

  test('authentication flow works', async ({ page }) => {
    // Navigate to login
    await page.goto(`${PRODUCTION_URL}/login`);
    await expect(page.locator('form')).toBeVisible();

    // Attempt login with test credentials
    await page.locator('#email').fill(process.env.SMOKE_TEST_EMAIL || 'test@example.com');
    await page.locator('#password').fill(process.env.SMOKE_TEST_PASSWORD || 'test123');
    await page.locator('button[type="submit"]').click();

    // Verify redirect to dashboard
    await expect(page).toHaveURL(/dashboard/);
  });

  test('critical API endpoint responds', async ({ request }) => {
    const response = await request.get(`${PRODUCTION_URL}/api/v1/status`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('status', 'ok');
  });
});
```

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/smoke-tests.yml
name: Production Smoke Tests

on:
  deployment_status:
  workflow_dispatch: # Allow manual trigger

jobs:
  smoke-tests:
    if: ${{ github.event_name == 'workflow_dispatch' || github.event.deployment_status.state == 'success' }}
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run smoke tests
        run: npx playwright test tests/smoke/
        env:
          PRODUCTION_URL: ${{ secrets.PRODUCTION_URL }}
          SMOKE_TEST_EMAIL: ${{ secrets.SMOKE_TEST_EMAIL }}
          SMOKE_TEST_PASSWORD: ${{ secrets.SMOKE_TEST_PASSWORD }}

      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: smoke-test-results
          path: test-results/

      - name: Notify on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          channel-id: 'incidents'
          slack-message: '🚨 Production smoke tests failed after deployment!'
        env:
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
```

---

## Smoke Test Best Practices

### What to Test

| Category         | Tests                          | Priority |
| ---------------- | ------------------------------ | -------- |
| **Availability** | Homepage loads, API health     | Critical |
| **Auth**         | Login/logout works             | Critical |
| **Core Feature** | Main user flow works           | High     |
| **Integrations** | Third-party services respond   | Medium   |

### What NOT to Test

- Complex edge cases (save for staging)
- Destructive operations (creates real data)
- Long-running processes
- Flaky tests

### Test Characteristics

- **Fast**: < 2 minutes total
- **Reliable**: No flaky tests
- **Isolated**: Don't modify production data
- **Read-only**: Prefer GET requests
- **Alertable**: Clear failure notifications

---

## Playwright Configuration for Smoke Tests

```typescript
// playwright.smoke.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/smoke',
  timeout: 30000,
  retries: 2,
  workers: 1, // Run sequentially
  use: {
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  reporter: [
    ['html', { outputFolder: 'smoke-test-results' }],
    ['github'], // GitHub Actions annotations
  ],
});
```

---

## Failure Response

When smoke tests fail:

1. **Immediate**: Alert on-call team
2. **Investigate**: Check what changed in deployment
3. **Decision**:
   - Rollback if critical
   - Hotfix if minor
4. **Verify**: Re-run smoke tests after fix

---

## Output

After implementing smoke tests:

- [ ] Smoke test suite created
- [ ] CI/CD pipeline configured
- [ ] Alerts set up for failures
- [ ] Tests running post-deploy
- [ ] Documentation updated
