# Monitoring Setup

> Configure production observability.

---

## Purpose

Set up comprehensive monitoring and alerting for production environments to detect issues early and enable rapid response.

---

## 1. Sentry (Error Tracking)

### Installation

```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

### Configuration

Configure in your application:

- **DSN** in environment variables
- **Source maps** for debugging
- **Release tracking** for version correlation
- **User context** for issue reproduction

### Example Setup

```typescript
// sentry.client.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  environment: process.env.NODE_ENV,
});
```

---

## 2. Logging

### Configure Structured Logs

Set up logging for different categories:

| Log Type            | Purpose                      | Level   |
| ------------------- | ---------------------------- | ------- |
| Application logs    | General application events   | INFO    |
| API request/response| HTTP traffic debugging       | DEBUG   |
| Error logs          | Exception tracking           | ERROR   |
| Performance logs    | Response times, metrics      | INFO    |

### Logging Best Practices

- Use structured JSON format
- Include correlation IDs
- Log at appropriate levels
- Avoid sensitive data in logs

### Example Logger Setup

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export { logger };
```

---

## 3. Alerts

### Configure Notifications

Set up alerts for critical conditions:

| Condition                | Threshold        | Action          |
| ------------------------ | ---------------- | --------------- |
| Critical errors          | > 10/minute      | Page on-call    |
| Response time            | > 5 seconds      | Slack alert     |
| API error rate           | > 5%             | Email + Slack   |
| Deployment issues        | Any failure      | Page on-call    |

### Alert Channels

1. **Immediate** (Severity 1):
   - PagerDuty / OpsGenie
   - Phone call

2. **Urgent** (Severity 2):
   - Slack #incidents channel
   - Email to team

3. **Normal** (Severity 3-4):
   - Slack #monitoring channel
   - Daily digest email

### Example Sentry Alert Rules

```json
{
  "rules": [
    {
      "name": "Critical Error Spike",
      "conditions": [
        {"interval": "1m", "threshold": 10}
      ],
      "actions": [
        {"type": "slack", "channel": "#incidents"},
        {"type": "pagerduty"}
      ]
    }
  ]
}
```

---

## 4. Dashboard Setup

### Key Metrics to Track

| Metric              | Description                    | Target       |
| ------------------- | ------------------------------ | ------------ |
| Error rate          | % of failed requests           | < 0.1%       |
| P95 response time   | 95th percentile latency        | < 500ms      |
| Uptime              | Service availability           | > 99.9%      |
| Apdex score         | User satisfaction              | > 0.9        |

### Recommended Dashboards

1. **Overview Dashboard**
   - Error count over time
   - Response time distribution
   - Active users

2. **API Health Dashboard**
   - Endpoint response times
   - Error rates by endpoint
   - Request volume

3. **Infrastructure Dashboard**
   - CPU/Memory usage
   - Database connections
   - Queue depth

---

## Output

After completing this setup:

- [ ] Sentry configured and receiving errors
- [ ] Structured logs enabled
- [ ] Alert rules created
- [ ] Notification channels configured
- [ ] Monitoring dashboards set up
