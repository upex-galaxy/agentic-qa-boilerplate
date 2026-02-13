# Testing Guide Generator

Act as a **Senior QA** who deeply knows the project and is explaining to another tester what should be validated and why.

---

## MISSION

Generate a **conversational guide** that provides orientation on:

- WHAT to test in each system flow
- What scenarios are important and why
- What dependencies and side effects to consider
- Ideas of cases that might break

**Philosophy:**

- **Conversational:** As if a colleague were explaining what to validate
- **WHAT, not HOW:** Guide on what to test, not dictate test implementation
- **Assume existing infrastructure:** The reader already has their testing framework
- **Visual when helpful:** ASCII diagrams to show flows and dependencies

**DON'T include:** Test snippets, exact payloads, specific commands

**Prerequisite:** `.context/business-data-map.md` must exist

**Output:** `.context/project-test-guide.md`

---

## PHASE 0: VALIDATION

### 0.1 Verify Business Data Map

```
Does .context/business-data-map.md exist?
  → NO: STOP. Indicate that business-data-map.md must be run first
  → YES: Continue
```

### 0.2 Understand the System

Read the business-data-map.md and understand:

- Business flows (these are the flows to test)
- State machines (transitions to validate)
- Automatic processes (triggers, cron, webhooks)
- External integrations
- Business rules

---

## PHASE 1: DOCUMENT GENERATION

### Generate: `.context/project-test-guide.md`

The document should feel like a conversation with a senior QA explaining what's important to validate and why.

---

### OUTPUT STRUCTURE

```markdown
# Testing Guide: [Project Name]

╔══════════════════════════════════════════════════════════════════════════════╗
║ TESTING GUIDE                                                                 ║
║ "What to validate and why it matters"                                        ║
╚══════════════════════════════════════════════════════════════════════════════╝

> This document assumes you've already read `.context/business-data-map.md` to
> understand the flows. Here I explain what you should test and what to consider.
```

---

#### 1. OVERVIEW

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🎯 OVERVIEW                                                                   │
└──────────────────────────────────────────────────────────────────────────────┘

## The Most Critical Flows

[Conversational explanation of which flows are most important and why]

"If I had to prioritize what to test first, I'd focus on:

1. **[Most critical flow]** - Because [business reason]...
2. **[Second flow]** - Because [reason]...
3. **[Third flow]** - Because [reason]..."

## Flow Dependency Diagram

[ASCII diagram showing how flows affect each other]

    ┌─────────────┐
    │ Registration│
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐     ┌─────────────┐
    │   Booking   │────►│   Payment   │
    └──────┬──────┘     └──────┬──────┘
           │                   │
           ▼                   ▼
    ┌─────────────┐     ┌─────────────┐
    │   Review    │     │   Payout    │
    └─────────────┘     └─────────────┘

"This means that if something fails in [upstream flow], it will probably
affect [downstream flows]..."
```

---

#### 2. WHAT TO TEST BY FLOW

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🔄 WHAT TO TEST BY FLOW                                                       │
└──────────────────────────────────────────────────────────────────────────────┘

[For each main flow from business-data-map, conversationally explain
what should be validated]

---

## Flow: [Flow Name]

[Simplified ASCII diagram of the flow]

### Why It's Important to Test

[Business context that justifies the importance]

"This flow is critical because [business impact]. If it fails,
[consequence for user/system]..."

### The Happy Path

[Conversational description of the happy path]

"The basics that should work are:

1. The user [initial action]...
2. The system [expected response]...
3. At the end, [expected final state]..."

### Scenarios That Might Break

[Ideas of edge cases and problematic situations]

"Based on how this flow works, these scenarios would worry me:

- **What happens if [situation A]?** It should [expected behavior]...

- **What if [situation B] happens mid-process?** The system would
  need to [behavior]...

- **An interesting case would be [situation C]...** Because [reason]..."

### Business Rules to Validate

[List of important rules that must be met]

"This flow has some rules that aren't obvious:

- [Rule 1]: For example, [explanation of the rule and why it exists]...
- [Rule 2]: This means that [implication]...
- [Rule 3]: Be careful because [consideration]..."

### Side Effects

[ASCII diagram if helpful]

"When this flow completes successfully, other things also happen:"

    Flow completed
           │
           ├──► [notification/email] is sent
           ├──► [other entity] is updated
           └──► [automatic process] is triggered

"These effects should also be validated..."

---

[Repeat for each important flow]
```

---

#### 3. STATE MACHINES

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ 📊 VALIDATING STATE MACHINES                                                  │
└──────────────────────────────────────────────────────────────────────────────┘

"State machines are critical. If an invalid transition is possible,
the system can end up in an inconsistent state..."

## [Entity with states]

[ASCII diagram of the state machine]

    ┌──────────┐         ┌──────────┐         ┌──────────┐
    │ State A  │ ──(1)─► │ State B  │ ──(2)─► │ State C  │
    └──────────┘         └──────────┘         └──────────┘
         │                    │
         │                    └──(3)─► ┌──────────┐
         └──────(4)──────────────────► │ Cancelled│
                                       └──────────┘

### Transitions to Validate

"For each transition, you should verify:

- **(1) A → B:** Under what conditions should it occur? What should
  prevent it if conditions aren't met?

- **(2) B → C:** What side effects does it trigger? Do they execute
  correctly?

- **(3) B → Cancelled:** Are there time restrictions or conditions?

- **(4) A → Cancelled:** Is canceling from here different than from B?"

### Transitions That SHOULD NOT Be Possible

"Equally important is validating that these transitions DON'T occur:

- A → C directly (skipping B)
- C → any other state (C is terminal)
- Cancelled → any other state"

### Terminal States

"States [X] and [Y] are terminal. Once there, the entity should not
be able to change. This is important to validate..."
```

---

#### 4. AUTOMATIC PROCESSES

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ ⚡ TESTING AUTOMATIC PROCESSES                                                │
└──────────────────────────────────────────────────────────────────────────────┘

"Automatic processes are easy to forget in testing, but they're
critical because they run without supervision..."

## Triggers

### [Trigger name]

"This trigger fires when [event]. It should be validated that:

- It executes when it should...
- It does NOT execute when it shouldn't...
- If it fails, [expected behavior]..."

## Cron Jobs

### [Cron job name]

"This job runs [frequency] and processes [what]. To test it:

- What happens if there's nothing to process?
- What happens if there are many items?
- What happens if an item fails mid-process?
- Is it idempotent? (Can it run twice without problems?)"

## Webhooks

### [Webhook name]

"Webhooks from [service] arrive when [event]. Considerations:

- What happens if the webhook arrives duplicated?
- What happens if it arrives late or out of order?
- What happens if the payload comes incomplete or malformed?
- Does the system respond correctly so the service doesn't retry?"
```

---

#### 5. EXTERNAL INTEGRATIONS

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🔗 TESTING INTEGRATIONS                                                       │
└──────────────────────────────────────────────────────────────────────────────┘

"Integrations with external services are common failure points.
Not only should you test the happy path, but what happens when they fail..."

## [External Service]

### What to Validate in the Happy Path

[Conversational description]

"When everything works well, the flow with [service] should:

1. [Step 1]...
2. [Step 2]...
3. [Expected result]..."

### What Could Go Wrong

"These are failure scenarios to consider:

- **Service doesn't respond:** Does the system have a timeout? What happens
  with the ongoing operation?

- **Service responds with error:** Is it handled correctly?
  Is the user notified?

- **Service responds late:** Are there possible race conditions?

- **Webhook never arrives:** Is there a reconciliation mechanism?"

### Integration Diagram

[ASCII diagram showing the flow with the external service]

    Your System                    External Service
         │                              │
         │──── request ────────────────►│
         │                              │
         │◄─── immediate response ─────│
         │                              │
    [continues process]                 │
         │                              │
         │◄──── webhook (async) ───────│
         │                              │
    [updates state]
```

---

#### 6. INTEGRATION SCENARIOS

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🧩 INTEGRATION SCENARIOS                                                      │
└──────────────────────────────────────────────────────────────────────────────┘

"Beyond testing each flow individually, there are scenarios that
involve multiple flows and are important to validate..."

## Chained Flows

[ASCII diagram of flows that connect]

### [Scenario: Complete flow from X to Y]

"An important end-to-end scenario would be:

1. A user [does initial action]...
2. This triggers [flow A]...
3. Which in turn affects [flow B]...
4. And finally [final result]...

What could fail along this path?

- If [flow A] fails midway, what happens to the state?
- If [flow B] takes too long, does the user see something weird?
- Is the data consistent at the end?"

## Concurrency

"There are concurrency scenarios that could cause problems:

- What happens if two users try to [action] at the same time?
- What happens if an automatic process and a user touch the same
  entity simultaneously?
- Do unique indexes and constraints correctly prevent duplicates?"
```

---

#### 7. EDGE CASE IDEAS

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ 💡 EDGE CASE IDEAS                                                            │
└──────────────────────────────────────────────────────────────────────────────┘

"After understanding the system, these are edge cases that seem
interesting to explore..."

## For Each Flow

[Conversational list of ideas]

### [Flow 1]

- "What happens if [unusual situation]?"
- "Is it handled well when [extreme condition]?"
- "Does the system recover if [fails midway]?"

### [Flow 2]

- "An interesting case would be [scenario]..."
- "You should verify what happens when [situation]..."

## Data Cases

- "What happens with very long or very short data?"
- "Are special characters handled well?"
- "Values at boundaries (0, maximum, negative)?"

## Time Cases

- "What happens near midnight / day change?"
- "Are time zones handled correctly?"
- "Session / token expiration?"
```

---

#### 8. FINAL CONSIDERATIONS

```markdown
┌──────────────────────────────────────────────────────────────────────────────┐
│ 📋 FINAL CONSIDERATIONS                                                       │
└──────────────────────────────────────────────────────────────────────────────┘

## Suggested Prioritization

"If time is limited, I would prioritize:

1. **Critical:** [flows that if they fail, the business stops]
2. **High:** [important flows but with workarounds]
3. **Medium:** [secondary flows]
4. **Low:** [nice to have]"

## What to Check Before a Release

[Conversational list of sanity checks]

"Before any release, at minimum I would validate:

- Do the main flows work?
- Are state transitions correct?
- Are automatic processes still running?
- Do external integrations respond?"

## Related Resources

- `.context/business-data-map.md` - To understand flows in detail
- `.context/api-architecture.md` - To understand the APIs
```

---

## PHASE 2: INTEGRATION

### Update System Prompt

If a "Testing Guide" section doesn't exist in the system prompt, add:

```markdown
## Testing Guide

See `.context/project-test-guide.md` for orientation on:

- What to test in each business flow
- Important scenarios and edge cases
- State machine validations
- Integration testing considerations

**Based on:** Business Data Map
```

---

## FINAL CHECKLIST

Before saving, verify:

- [ ] The tone is conversational, like a QA explaining
- [ ] There are NO test snippets or exact payloads
- [ ] Each flow has its section with what to validate
- [ ] ASCII diagrams help visualize dependencies
- [ ] Edge case ideas are useful
- [ ] Reference to business-data-map

---

## FINAL REPORT

```markdown
# ✅ Testing Guide Generated

## File Created:

`.context/project-test-guide.md`

## Based on:

`.context/business-data-map.md`

## Content:

- [N] flows with scenarios to test
- [N] state machines with transitions to validate
- [N] automatic processes explained
- [N] integrations with considerations
- Edge case ideas by flow
```

---

## PHILOSOPHY OF THIS PROMPT

- **Conversational:** Like a QA explaining what to validate
- **WHAT, not HOW:** Guide on what to test, not how to implement tests
- **Visual:** ASCII diagrams to show flows and dependencies
- **Ideas, not recipes:** Give ideas of scenarios to explore
- **Assume infrastructure:** The reader already has their testing framework
