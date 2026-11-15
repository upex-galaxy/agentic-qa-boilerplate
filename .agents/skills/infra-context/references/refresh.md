# Refresh — keeping `infra-map.html` honest

> Loaded by `infra-context` when a session observes something the map contradicts, or when someone asks whether the map is stale. The generic procedure (anatomy, the five steps, the write scope) is SYNCED doctrine in `agentic-qa-core/references/business-context-maps.md` §5-§6; this file holds only what is specific to this aspect and belongs to the project.

## Staleness signals for this aspect

| Signal in `data-sources` | Stale when | Check |
|---|---|---|
| a dependency manifest, `Dockerfile` or compose file | a commit touched it after `data-updated` (runtime, framework or service changed) | `git -C <repo> log --since=<data-updated> --oneline -- <path>` |
| a CI workflow path | the pipeline changed | `git -C <repo> log --since=<data-updated> --oneline -- <workflow>` |
| an auth module or middleware path | the login request or session model changed | `git log` on the path named, then one real login request |
| `env:<name>` | the environment was added, removed or re-hosted | `.agents/project.yaml` `environments`, the deploy config |
| a command observed in a session | it no longer runs as the section says | the session's own output (command, exit code, session label) |

A section with no declared sources is `unknown`, never fresh.

## Two paths, never mixed

| Situation | Who writes | How |
|---|---|---|
| one section contradicted by something a session observed | this skill, after approval | the five steps of `agentic-qa-core/references/business-context-maps.md` §6: locate, evidence, propose, apply on approval, verify |
| several sections stale, or a new service, environment or pipeline the map lacks | `project-discovery` Phases 2-3 update | it regenerates only the stale sections and shows a section-level diff; hand the user those phases instead of rebuilding sections here |

## The proposal, in one message

```
infra-context · proposed edit to section <id> (updated <date>)
evidence: <what was observed, how, where: command + exit code, file@commit, request, session label>
before: <the sentence or row as the map has it>
after:  <the replacement>
figure: <unchanged | redraw: why>
apply? (yes / no)
```

Name the `.env` key instead of putting a secret, token or password in the evidence or the section. Only `yes` applies the edit; silence is not approval. With nobody to answer (a routine), leave the proposal in the report and apply nothing, unless the delegating brief approves that exact edit. Decision rules: `agentic-qa-core/references/decision-protocol.md`.

## Never

- Edit a file outside this skill's `references/`.
- Rewrite a section that nothing contradicted, or regenerate the whole map.
- Change a section id. A renamed service is a new section plus one line in `discovery-gaps` for one refresh.
