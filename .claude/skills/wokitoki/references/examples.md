# WokiToki — Worked examples

Three copy-pasteable specs, one per shape: a pure decision-set, a pure long report, and a hybrid. Each is followed by an example Result (one plausible set of user answers). Field contract → `./schema.md`.

Run any of them with: write the spec to `.toki/spec-<name>.json`, then `bun run toki .toki/spec-<name>.json`, then parse stdout.

---

## 1. Pure decision-set

Several questions, no report paragraphs. Mixes `single`, `multi`, and `toggle`. Some controls/text are required, some are not.

### Spec

```json
{
  "title": "Auth implementation — decisions",
  "intro": "Pick the approach for each decision. Add context where it helps.",
  "submitLabel": "Lock decisions",
  "blocks": [
    {
      "id": "token-strategy",
      "content": "Which **token strategy** do we use?",
      "controls": {
        "type": "single",
        "options": [
          { "value": "jwt", "label": "JWT stateless" },
          { "value": "session", "label": "Server-side session" }
        ],
        "required": true
      },
      "text": { "required": false, "placeholder": "Optional rationale" }
    },
    {
      "id": "providers",
      "content": "Which **social providers** ship in v1?",
      "controls": {
        "type": "multi",
        "options": [
          { "value": "google", "label": "Google" },
          { "value": "github", "label": "GitHub" },
          { "value": "apple", "label": "Apple" }
        ],
        "required": true
      },
      "text": { "required": false }
    },
    {
      "id": "mfa",
      "content": "Require **MFA** at launch?",
      "controls": { "type": "toggle", "required": false },
      "text": { "required": true, "placeholder": "Why / why not?" }
    }
  ]
}
```

### Example Result

```json
{
  "submittedAt": "2026-05-30T10:00:00.000Z",
  "blocks": [
    { "id": "token-strategy", "controlAnswer": "jwt", "text": "Stateless scales horizontally", "quotes": ["token strategy"] },
    { "id": "providers", "controlAnswer": ["google", "github"], "text": "", "quotes": [] },
    { "id": "mfa", "controlAnswer": false, "text": "Defer to v2 — adds onboarding friction", "quotes": ["MFA"] }
  ],
  "meta": { "answered": 3, "total": 3 }
}
```

Decode: `single` → `string`, `multi` → `string[]`, `toggle` → `boolean`.

---

## 2. Pure long report

No controls anywhere — every block is a report paragraph. The user reacts paragraph-by-paragraph with free text and highlight-to-quote. `controlAnswer` is always `null`.

### Spec

```json
{
  "title": "Migration plan — review point by point",
  "intro": "React to each section. Highlight any phrase to quote it back to me.",
  "submitLabel": "Send my notes",
  "blocks": [
    {
      "id": "summary",
      "content": "## Summary\nWe move the orders service off the shared Postgres onto its own instance, behind a read replica for reporting queries.",
      "text": { "required": false, "placeholder": "Reaction to the summary" }
    },
    {
      "id": "risk",
      "content": "## Risk\nThe cutover needs a 15-minute write freeze. Reporting reads can fail over to the replica during that window, but write traffic must drain first.",
      "text": { "required": true, "placeholder": "Is a 15-minute freeze acceptable?" }
    },
    {
      "id": "rollback",
      "content": "## Rollback\nIf replication lag exceeds 30s post-cutover, we repoint the app back to the shared instance and re-sync deltas overnight.",
      "text": { "required": false }
    }
  ]
}
```

### Example Result

```json
{
  "submittedAt": "2026-05-30T10:05:00.000Z",
  "blocks": [
    { "id": "summary", "controlAnswer": null, "text": "Agree on the dedicated instance", "quotes": ["read replica for reporting queries"] },
    { "id": "risk", "controlAnswer": null, "text": "15 min is fine off-peak, not during business hours", "quotes": ["15-minute write freeze"] },
    { "id": "rollback", "controlAnswer": null, "text": "", "quotes": [] }
  ],
  "meta": { "answered": 2, "total": 3 }
}
```

Note `meta.answered` is 2: the `rollback` block was left fully untouched (no control on a report block, empty text), so it does not count.

---

## 3. Hybrid

Questions and report paragraphs mixed in one spec. The report blocks carry `controlAnswer: null`; the question blocks carry their typed answer.

### Spec

```json
{
  "title": "Release readiness — context + decisions",
  "intro": "Read the context blocks, then make the two calls at the end.",
  "submitLabel": "Submit readiness",
  "blocks": [
    {
      "id": "context-coverage",
      "content": "## Test coverage\nE2E covers the checkout happy path and two failure paths. Payment-webhook retries are NOT yet covered.",
      "text": { "required": false, "placeholder": "Any concern about this gap?" }
    },
    {
      "id": "go-no-go",
      "content": "Given the coverage gap above, do we **ship Friday**?",
      "controls": {
        "type": "single",
        "options": [
          { "value": "go", "label": "Go — ship Friday" },
          { "value": "hold", "label": "Hold — cover webhooks first" }
        ],
        "required": true
      },
      "text": { "required": true, "placeholder": "Justify the call" }
    },
    {
      "id": "flags",
      "content": "Which features stay **behind a flag** at launch?",
      "controls": {
        "type": "multi",
        "options": [
          { "value": "gift-cards", "label": "Gift cards" },
          { "value": "express-pay", "label": "Express pay" }
        ],
        "required": false
      },
      "text": { "required": false }
    }
  ]
}
```

### Example Result

```json
{
  "submittedAt": "2026-05-30T10:10:00.000Z",
  "blocks": [
    { "id": "context-coverage", "controlAnswer": null, "text": "Webhook retry gap is a launch blocker for me", "quotes": ["Payment-webhook retries are NOT yet covered"] },
    { "id": "go-no-go", "controlAnswer": "hold", "text": "Cover the webhook path first — too risky otherwise", "quotes": [] },
    { "id": "flags", "controlAnswer": ["express-pay"], "text": "", "quotes": [] }
  ],
  "meta": { "answered": 3, "total": 3 }
}
```

Decode by block: `context-coverage` is a report block → `null`; `go-no-go` is `single` → `string`; `flags` is `multi` → `string[]`. The `quotes` on `context-coverage` anchor the user's blocker to the exact sentence it is about.
