# Refresh — keeping `infra-map.html` honest

> Loaded by `infra-context` when a session observes something the map contradicts, or when someone asks whether the map is stale. The generic procedure (anatomy, the five steps, the write scope) is SYNCED doctrine in `agentic-qa-core/references/business-context-maps.md` §5-§6; this file holds only what is specific to this aspect, and it is the project's own.

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
| one section contradicted by something a session observed | this skill, after approval | the five steps of `agentic-qa-core/references/business-context-maps.md` §6: locate, evidence, PROPOSE, apply on approval, verify |
| several sections stale, or a new service, environment or pipeline the map lacks | `project-discovery` Phases 2-3 UPDATE | they regenerate only the stale sections and show a section-level diff; hand the user those phases, do not rebuild sections here |

## The proposal, in one message

```
infra-context · proposed edit to section <id> (updated <date>)
evidence: <what was observed, how, where: command + exit code, file@commit, request, session label>
before: <the sentence or row as the map has it>
after:  <the replacement>
figure: <unchanged | redraw: why>
apply? (yes / no)
```

Never put a secret, a token or a password in the evidence or the section: name the `.env` key. Only `yes` applies it; silence is not approval.

## Never

- Edit a file outside this skill's `references/`.
- Rewrite a section that was not contradicted, or regenerate the whole map.
- Change a section id: a renamed service is a new section plus one line in `discovery-gaps` for one refresh.
