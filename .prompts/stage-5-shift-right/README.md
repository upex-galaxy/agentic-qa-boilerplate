# Stage 5: Shift-Right Testing

> **Purpose**: Observability and testing in production.
> **When to use**: After deployment to production, for ongoing monitoring.

## Overview

Shift-Right Testing extends testing into production environments through monitoring, observability, and automated smoke tests. This complements Shift-Left Testing by catching issues that only manifest in real production conditions.

**Benefits:**
- Catch production-specific issues
- Monitor real user experience
- Rapid incident response
- Continuous quality validation

## Components

- **Monitoring** (Sentry, logs)
- **Smoke tests** post-deploy
- **Incident response** playbook

## Prompts in This Stage

| Order | Prompt                   | Purpose                       | Output                      |
| ----- | ------------------------ | ----------------------------- | --------------------------- |
| 1     | `monitoring-setup.md`    | Configure production monitoring | Active monitoring setup    |
| 2     | `smoke-tests.md`         | Create post-deploy smoke tests | Automated production tests |
| 3     | `incident-response.md`   | Document incident playbook     | Response procedures        |

## Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SHIFT-RIGHT TESTING WORKFLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

         ┌─────────────────────────────────────────┐
         │  Deploy to Production                   │
         └────────────────┬────────────────────────┘
                          │
         ┌────────────────┴────────────────┐
         │                                 │
         ▼                                 ▼
┌─────────────────────────┐   ┌─────────────────────────┐
│ 1. monitoring-setup.md  │   │ 2. smoke-tests.md       │
│    - Configure Sentry   │   │    - Post-deploy tests  │
│    - Set up logging     │   │    - Health checks      │
│    - Create alerts      │   │    - CI/CD integration  │
└────────────┬────────────┘   └────────────┬────────────┘
             │                             │
             └──────────────┬──────────────┘
                            │
                            ▼
         ┌─────────────────────────────────────────┐
         │  3. incident-response.md                │
         │     - Severity definitions              │
         │     - Response playbooks                │
         │     - Investigation checklist           │
         └────────────────┬────────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────────────┐
         │  Production Monitoring Active           │
         │     - Errors tracked                    │
         │     - Alerts configured                 │
         │     - Playbook ready                    │
         └─────────────────────────────────────────┘
```

## Key Concepts

### Shift-Left vs Shift-Right

| Aspect         | Shift-Left                  | Shift-Right                |
| -------------- | --------------------------- | -------------------------- |
| **When**       | Before development          | After deployment           |
| **Focus**      | Prevention                  | Detection                  |
| **Testing**    | Test cases, exploratory     | Monitoring, smoke tests    |
| **Environment**| Local, staging              | Production                 |
| **Feedback**   | Pre-release                 | Real user data             |

### Monitoring Components

1. **Error Tracking** (Sentry)
   - Exception capture
   - Stack traces
   - User context
   - Release tracking

2. **Logging**
   - Application logs
   - API request/response
   - Performance metrics
   - Audit trail

3. **Alerting**
   - Critical error thresholds
   - Response time degradation
   - API error rates
   - Deployment issues

### Incident Severity Levels

| Level | Name     | Description                   | Response Time |
| ----- | -------- | ----------------------------- | ------------- |
| 1     | Critical | Service completely down       | Immediate     |
| 2     | High     | Partial functionality loss    | < 1 hour      |
| 3     | Medium   | Non-critical issue            | < 1 day       |
| 4     | Low      | Minor issue                   | Next sprint   |

## Prerequisites

- Production deployment pipeline configured
- Access to monitoring tools (Sentry, etc.)
- CI/CD pipeline for smoke tests
- On-call rotation established

## Output

- Monitoring active
- Alerts configured
- Incident playbook documented
- Smoke tests running post-deploy

---

**Related**: [Stage 4 - Automation](../stage-4-automation/) | [Stage 1 - Shift-Left](../stage-1-shift-left/)
