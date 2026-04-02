# {Module Name} - Test Automation Roadmap

> **Module**: {Module Name} (`/{route-path}`)
> **Total Tickets**: {count}
> **Total Items**: {n} TCs + {n} Test Scenarios = {total}
> **Created**: {date}
> **Master Document**: [{module}-test-plan.md](../{module-name}-test-plan.md)

---

## Roadmap Overview

```
PHASE 1: {Phase Name} (P0)                          PHASE 2: {Phase Name} (P1)
───────────────────────                              ───────────────────────
 {MODULE}-T01  {Title}         ({n} TC + {n} TS)      {MODULE}-T04  {Title}         ({n} TC)
 {MODULE}-T02  {Title}         ({n} TC)                {MODULE}-T05  {Title}         ({n} TC)
 {MODULE}-T03  {Title}         ({n} TC + {n} TS)

                                                     PHASE 3: {Phase Name} (P2)
                                                     ───────────────────────
                                                      {MODULE}-T06  {Title}         ({n} TC + {n} TS)
```

---

## Ticket Index

| Ticket | Title | Priority | Phase | TCs | TSs | Dependencies |
|--------|-------|----------|-------|-----|-----|--------------|
| [{MODULE}-T01]({MODULE}-T01-{slug}.md) | {title} | P0 | 1 | {n} | {n} | None |
| [{MODULE}-T02]({MODULE}-T02-{slug}.md) | {title} | P0 | 1 | {n} | {n} | {MODULE}-T01 |
| [{MODULE}-T03]({MODULE}-T03-{slug}.md) | {title} | P0 | 1 | {n} | {n} | {MODULE}-T01 |
| [{MODULE}-T04]({MODULE}-T04-{slug}.md) | {title} | P1 | 2 | {n} | {n} | {MODULE}-T02 |
| [{MODULE}-T05]({MODULE}-T05-{slug}.md) | {title} | P1 | 2 | {n} | {n} | {MODULE}-T01 |
| [{MODULE}-T06]({MODULE}-T06-{slug}.md) | {title} | P2 | 3 | {n} | {n} | {MODULE}-T01, {MODULE}-T04 |

---

## Phase Summary

| Phase | Priority | Tickets | TCs | TSs | Total | Focus |
|-------|----------|---------|-----|-----|-------|-------|
| **Phase 1** | P0 | {n} | {n} | {n} | {n} | {focus description} |
| **Phase 2** | P1 | {n} | {n} | {n} | {n} | {focus description} |
| **Phase 3** | P2 | {n} | {n} | {n} | {n} | {focus description} |
| **Total** | | **{n}** | **{n}** | **{n}** | **{n}** | |

---

## TC vs Test Scenario Distinction

| Type | Definition | Example |
|------|-----------|---------|
| **TC (ATC)** | Atomic: 1 user action → 1 set of expected outputs. Reusable as component. | `{verbResourceScenario}` → single verifiable outcome |
| **Test Scenario (TS)** | Flow: chains multiple TCs/actions to validate broader behavior. | Action A → observe → Action B → verify transition |

---

## Dependency Graph

```
{MODULE}-T01 ({Title}) ←── Foundation for everything
  │
  ├── {MODULE}-T02 ({Title})
  │     └── {MODULE}-T04 ({Title})
  │
  ├── {MODULE}-T03 ({Title})
  │     └── {MODULE}-T05 ({Title})
  │
  └── {MODULE}-T06 ({Title})
```

---

## Progress Tracker

| Ticket | Backlog | In Progress | PR | Merged |
|--------|---------|-------------|-----|--------|
| {MODULE}-T01 | [ ] | [ ] | [ ] | [ ] |
| {MODULE}-T02 | [ ] | [ ] | [ ] | [ ] |
| {MODULE}-T03 | [ ] | [ ] | [ ] | [ ] |
| {MODULE}-T04 | [ ] | [ ] | [ ] | [ ] |
| {MODULE}-T05 | [ ] | [ ] | [ ] | [ ] |
| {MODULE}-T06 | [ ] | [ ] | [ ] | [ ] |
