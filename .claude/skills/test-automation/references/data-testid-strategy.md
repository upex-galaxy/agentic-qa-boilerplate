# Data-testid Strategy for KATA + Playwright

How to select elements in Playwright tests that live inside KATA Page components. Load when writing UI ATCs, reviewing brittle locators, or deciding what to do when the app is missing testids.

---

## 1. Locator priority (strict)

Always pick the highest-priority option that works:

| Priority | Locator | When to use |
|----------|---------|-------------|
| 1 | `page.getByTestId('name')` | Always preferred when a `data-testid` exists |
| 2 | `page.getByRole(role, { name })` | Semantic elements (button, link, heading) with unambiguous accessible name |
| 3 | `page.getByLabel('label text')` | Inputs with a real associated `<label>` |
| 4 | `page.getByText('unique text')` | Unique visible content that the test's purpose requires |
| 5 | CSS / XPath | Last resort only. Flag in review. |

If a `data-testid` exists on the target, use it. Period. It is the most stable selector and the most resilient to design / copy / structure changes.

---

## 2. Naming conventions

When reading the app code, expect this pattern (and when asking the dev team for new testids, request this pattern):

| Context | Convention | Example |
|---------|-----------|---------|
| Component root | `camelCase` | `data-testid="shoppingCart"` |
| Specific element | `snake_case` | `data-testid="email_input"` |
| Component section | `snake_case` | `data-testid="billing_section"` |
| Action button | `snake_case` | `data-testid="checkout_button"` |

Pattern: `{description}_{type}` where `type` ∈ `input`, `button`, `link`, `section`, `list`, `item`, `modal`, `toast`, `badge`.

For repeated elements in lists, put the testid on the **container** with the same name for each item; use `.nth(i)` or `.filter()` for specific ones. Do not embed dynamic IDs into the testid (`product_123`) unless that's the *only* way the app distinguishes them.

---

## 3. Syntax — getByTestId vs locator

```typescript
// Preferred
const loginButton = this.page.getByTestId('login_submit_button');

// Equivalent (older syntax, still valid)
const loginButton = this.page.locator('[data-testid="login_submit_button"]');

// Wrong — fragile, breaks on every CSS refactor
const loginButton = this.page.locator('.btn.btn-primary');
```

`getByTestId` uses the `testIdAttribute` configured in `playwright.config.ts` (`data-testid` by default). If the project uses a non-default attribute (`data-qa`, `data-test`), configure it once in `playwright.config.ts` and keep using `getByTestId`.

---

## 4. KATA integration — where locators live

| Case | Where to put the locator | Why |
|------|-------------------------|-----|
| Used in 2+ ATCs within the same Page | Private property on the Page component (lazy function form) | DRY within the component; single source of truth for that element |
| Used in only 1 ATC | Inline inside the ATC | No premature abstraction; easier to read |
| Used across multiple Page components | Still inline or on each Page — do NOT lift to UiBase | A shared locator means two pages share layout, which is usually wrong |

Lazy function form prevents "target closed" errors when the page reloads mid-ATC:

```typescript
// tests/components/ui/LoginPage.ts
export class LoginPage extends UiBase {
  private readonly emailInput    = () => this.page.getByTestId('email_input');
  private readonly passwordInput = () => this.page.getByTestId('password_input');
  private readonly submitButton  = () => this.page.getByTestId('login_submit_button');
  private readonly errorMessage  = () => this.page.getByTestId('login_error_message');

  @atc('AUTH-UI-001')
  async loginSuccessfully(email: string, password: string) {
    await this.emailInput().fill(email);
    await this.passwordInput().fill(password);
    await this.submitButton().click();
    await expect(this.page).toHaveURL(/.*\/dashboard.*/);
  }

  @atc('AUTH-UI-002')
  async loginWithInvalidCredentials(email: string, password: string) {
    await this.emailInput().fill(email);
    await this.passwordInput().fill(password);
    await this.submitButton().click();
    await expect(this.errorMessage()).toBeVisible();
  }
}
```

For locators used in only one ATC, keep them inline — do not lift:

```typescript
@atc('ACCOUNT-UI-010')
async deleteAccount(confirmation: string) {
  await this.page.getByTestId('account_delete_button').click();
  await this.page.getByTestId('delete_confirmation_input').fill(confirmation);
  await this.page.getByTestId('delete_confirm_button').click();
  await expect(this.page).toHaveURL(/.*\/goodbye.*/);
}
```

---

## 5. Common patterns

### Lists

```typescript
const cards = this.page.getByTestId('product_card');
const count = await cards.count();

const firstCard = cards.first();
const lastCard  = cards.last();
const thirdCard = cards.nth(2);

for (const card of await cards.all()) {
  // iterate
}
```

### Filter by visible child text

```typescript
const targetRow = this.page
  .getByTestId('user_row')
  .filter({ hasText: userEmail });

await targetRow.getByTestId('edit_button').click();
```

### Dynamic IDs in the testid

When the app embeds an ID (`edit_product_123`), prefer a container-plus-filter pattern:

```typescript
// Better: match pattern via RegExp
const button = this.page.getByTestId(/^edit_product_/);

// Or: scope by a parent container with a stable testid
await this.page
  .getByTestId('product_card')
  .filter({ hasText: productName })
  .getByTestId('edit_button')
  .click();
```

### Element states

```typescript
// Loading
await expect(this.page.getByTestId('loading_spinner')).toBeVisible();
await expect(this.page.getByTestId('loading_spinner')).toBeHidden();

// Empty state
await expect(this.page.getByTestId('empty_state_message')).toHaveText('No results found');

// Error toast
await expect(this.page.getByTestId('error_toast')).toContainText(/validation failed/i);
```

---

## 6. When the app is missing testids

Order of escalation:

1. **Check the design system.** Often testids are on the primitive component, not the app-level wrapper. `page.getByTestId('Button')` sometimes works surprisingly often.
2. **Try priorities 2-4** (role / label / unique text) first. Prefer `getByRole` with an accessible name; it's resilient and also validates a11y.
3. **File a request** with the frontend team. Include the screen, the element, the proposed testid name, and the ATC that needs it. Link to `data-testid-strategy.md` §2 for naming.
4. **Temporary workaround**: use `getByRole` + `getByText` scoped by a stable parent. Mark the ATC with `// TODO: data-testid needed for <desc>` and add the TODO to the PBI's `context.md`.

Never ship a CSS-class-based selector as a permanent solution. They decay silently on every component refactor.

---

## 7. Anti-patterns (reject on review)

| Anti-pattern | Example | Why it fails |
|--------------|---------|--------------|
| CSS class selector | `.locator('.btn-primary')` | Breaks on every design-system refactor |
| Structural CSS | `.locator('div > div > button:nth-child(2)')` | Breaks on any DOM restructure, even cosmetic |
| Hard-coded index on an unlabeled list | `.locator('button').nth(3)` | Fails when a new button is added |
| XPath | `.locator('//div[@class="x"]/..//span')` | Brittle and unreadable |
| Sharing a locator across Pages | `uiBase.loginButton` | Two Pages sharing a locator signals two Pages should be one, or one is wrong |
| Inline literal string used in 4 ATCs | `.getByTestId('header_cart')` x4 | Extract to a Page property |

---

## 8. Debugging

```bash
# UI mode — visualize locators and replay
bun run test:ui

# Debug mode — step through, inspect locators
bun run test -- --debug

# Codegen — record interactions and emit getByTestId
bunx playwright codegen https://staging.example.com
```

Quick inventory of all testids on the current page (paste into DevTools):

```js
[...document.querySelectorAll('[data-testid]')].map(e => e.getAttribute('data-testid')).sort()
```

Use this when you need to compare the ATP's assumed testids against the actual UI.

---

## 9. Configuration

`playwright.config.ts`:

```typescript
export default defineConfig({
  use: {
    testIdAttribute: 'data-testid',   // default; override if the project uses `data-qa` etc.
  },
});
```

If the project uses a non-standard attribute, the skill still writes `page.getByTestId('...')` — only the config differs.
