# Refresh — keeping `business-api-map.html` honest

> Loaded by `business-api-context` when a session observes something the map contradicts, or when someone asks whether the map is stale. The generic procedure (anatomy, the five steps, the write scope) is SYNCED doctrine in `agentic-qa-core/references/business-context-maps.md` §5-§6; this file holds only what is specific to this aspect, and it is the project's own.

## Staleness signals for this aspect

| Signal in `data-sources` | Stale when | Check |
|---|---|---|
| `openapi:<tag or path>` | the contract changed after `data-updated` | `bun run api:sync` output, or the spec file's `git log` |
| a route / controller path | a commit touched it after the date | `git -C {{BACKEND_REPO}} log --since=<data-updated> --oneline -- <path>` |
| `auth:<scheme>` | the auth middleware or its config changed | `git log` on the middleware file |
| an observed response | a real request answers a status, field or error the section does not describe | the `curl` evidence (`agentic-qa-core/references/api-testing-doctrine.md`) |

A section with no declared sources is `unknown`, never fresh.

## Two paths, never mixed

| Situation | Who writes | How |
|---|---|---|
| one section contradicted by something a session observed | this skill, after approval | the five steps of `agentic-qa-core/references/business-context-maps.md` §6: locate, evidence, PROPOSE, apply on approval, verify |
| several sections stale, or a new entity / flow / group the map lacks | `project-context` mode `api` UPDATE | it regenerates only the stale sections and shows a section-level diff; hand the user that mode, do not rebuild sections here |

## The proposal, in one message

```
business-api-context · proposed edit to section <id> (updated <date>)
evidence: <what was observed, how, where: query / request / file@commit / session label>
before: <the sentence or row as the map has it>
after:  <the replacement>
figure: <unchanged | redraw: why>
apply? (yes / no)
```

Verify the edit with the OpenAPI schema read (capability `api-schema`) before proposing it. Only `yes` applies it; silence is not approval.

## Never

- Edit a file outside this skill's `references/`.
- Rewrite a section that was not contradicted, or regenerate the whole map.
- Change a section id: a renamed entity is a new section plus one line in `discovery-gaps` for one refresh.
