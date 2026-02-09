# Incident Response Playbook

> Document and standardize incident response procedures.

---

## Incident Severity Definitions

### Severity 1 (Critical)

**Definition:** Service completely down

**Characteristics:**
- Complete service outage
- Data loss or corruption
- Security breach
- Major revenue impact

**Actions:**

1. Alert team immediately (page on-call)
2. Assemble incident response team
3. Investigate logs/monitoring
4. Rollback if recent deployment
5. Implement fix + hotfix deploy
6. Communicate to stakeholders
7. Write post-mortem

**Response time:** Immediate
**Resolution target:** < 4 hours

---

### Severity 2 (High)

**Definition:** Partial functionality loss

**Characteristics:**
- Major feature broken
- Significant user impact
- No workaround available
- Performance severely degraded

**Actions:**

1. Notify stakeholders
2. Investigate + triage
3. Implement workaround if possible
4. Fix in next deployment (expedited)
5. Document impact

**Response time:** < 1 hour
**Resolution target:** < 24 hours

---

### Severity 3 (Medium)

**Definition:** Non-critical issue

**Characteristics:**
- Minor feature broken
- Limited user impact
- Workaround available
- Performance moderately affected

**Actions:**

1. Create ticket in backlog
2. Prioritize for next sprint
3. Document workaround
4. Fix in next sprint

**Response time:** < 1 day
**Resolution target:** Next sprint

---

### Severity 4 (Low)

**Definition:** Minor issue

**Characteristics:**
- Cosmetic issues
- Minimal user impact
- Easy workaround
- Nice-to-have fix

**Actions:**

1. Create ticket in backlog
2. Add to technical debt queue
3. Fix when time permits

**Response time:** None required
**Resolution target:** As capacity allows

---

## Investigation Checklist

When investigating an incident, follow this checklist:

### Immediate Actions

- [ ] Acknowledge the alert
- [ ] Check Sentry for recent errors
- [ ] Check application logs
- [ ] Check monitoring dashboards
- [ ] Check recent deployments
- [ ] Check infrastructure status

### Diagnosis

- [ ] Identify affected users/scope
- [ ] Reproduce the issue locally (if safe)
- [ ] Identify root cause
- [ ] Document timeline of events
- [ ] Determine if rollback needed

### Resolution

- [ ] Create fix
- [ ] Test fix locally
- [ ] Deploy fix (or rollback)
- [ ] Verify resolution in production
- [ ] Confirm error rates normalized

### Post-Incident

- [ ] Communicate resolution to stakeholders
- [ ] Create incident ticket with full details
- [ ] Schedule post-mortem (Sev 1-2 only)
- [ ] Document lessons learned
- [ ] Create follow-up tickets for improvements

---

## Communication Templates

### Incident Start

```
🚨 INCIDENT: [Brief description]

Severity: [1/2/3]
Impact: [What's broken]
Status: Investigating
Updates: [Channel/link]
```

### Incident Update

```
🔄 UPDATE: [Incident description]

Status: [Investigating/Mitigating/Resolved]
Current action: [What's being done]
ETA: [If known]
```

### Incident Resolution

```
✅ RESOLVED: [Incident description]

Root cause: [Brief explanation]
Resolution: [What fixed it]
Duration: [Start to end time]
Post-mortem: [Scheduled/N/A]
```

---

## Post-Mortem Template

For Severity 1-2 incidents, complete a post-mortem:

```markdown
# Post-Mortem: [Incident Title]

**Date:** [Date of incident]
**Duration:** [Start time] - [End time]
**Severity:** [1/2]
**Impact:** [Number of users affected]

## Summary
[Brief description of what happened]

## Timeline
- HH:MM - [Event 1]
- HH:MM - [Event 2]
- HH:MM - [Event 3]

## Root Cause
[Detailed explanation of why it happened]

## Resolution
[What was done to fix it]

## Lessons Learned
### What went well
- [Point 1]
- [Point 2]

### What could be improved
- [Point 1]
- [Point 2]

## Action Items
| Item | Owner | Due Date | Status |
|------|-------|----------|--------|
| [Action] | [Name] | [Date] | [ ] |
```

---

## Output

After completing this playbook:

- [ ] Playbook documented and accessible
- [ ] Team trained on procedures
- [ ] Severity definitions agreed upon
- [ ] Communication templates ready
- [ ] Post-mortem process established
- [ ] Incidents tracked in issue tracker
