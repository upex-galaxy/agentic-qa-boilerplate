# Refresh: keeping `business-domain-map.html` honest

> Loaded by `business-domain-context` when a session observes something the map contradicts, or when someone asks whether the map is stale. The generic procedure (anatomy, the five steps, the write scope) is synced doctrine in `agentic-qa-core/references/business-context-maps.md` §5-§6. This file holds only what is specific to this aspect, and it is the project's own.

## Staleness signals for this aspect

| Signal in `data-sources` | Stale when | Check |
|---|---|---|
| a UI copy or i18n path | a commit touched it after `data-updated` (a label was renamed) | `git -C {{FRONTEND_REPO}} log --since=<data-updated> --oneline -- <path>` |
| a model, enum or domain module path | a commit touched it after `data-updated` | `git -C {{BACKEND_REPO}} log --since=<data-updated> --oneline -- <path>` |
| a story or AC that uses the term (`jira:<KEY>`) | the team writes the term with another meaning than the section gives | the synced story under `.context/PBI/` |
| a pricing, plan or billing source | it changed (the `business-model` section is stale) | `git log` on the file named, or the source the section cites |

A section with no declared sources is `unknown`, never fresh.

## Two paths, never mixed

The two paths stay separate because a one-term fix is cheap and reviewable, while a regeneration rebuilds sections and needs its own diff.

| Situation | Who writes | How |
|---|---|---|
| one term missing or contradicted by something a session observed | this skill, after approval | the five steps of `agentic-qa-core/references/business-context-maps.md` §6: locate, evidence, propose, apply on approval, verify |
| several sections stale, or the business model itself changed | `project-discovery` Phase 1 UPDATE | it regenerates only the stale sections and shows a section-level diff; hand the user that phase instead of rebuilding sections here |

## The proposal, in one message

```
business-domain-context · proposed edit to section <id> (updated <date>)
evidence: <what was observed, how, where: UI screenshot, file@commit, story key, session label>
before: <the sentence or row as the map has it>
after:  <the replacement>
figure: <none | unchanged | redraw: why>
apply? (yes / no)
```

A new term is a new `term-<slug>` section proposed the same way, with `before: (absent)`. Only `yes` applies it; silence is not approval.

Who answers `apply?` depends on who is running:

- A person is present: they answer.
- A supervised worker: send the proposal to the conductor, which holds the gate. Write nothing until it answers `yes`.
- A routine with nobody: the delegating brief approves only when it names this edit. Otherwise leave the map as it is and put the proposal in the report.

`agentic-qa-core/references/decision-protocol.md` says what else may reach a person.

## Never

- Edit a file outside this skill's `references/`.
- Rewrite a section that was not contradicted, or regenerate the whole map.
- Change a section id. A renamed term becomes a new section plus one line in `discovery-gaps` for one refresh.
