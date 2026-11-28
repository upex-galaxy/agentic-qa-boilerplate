# The evidence contract

The contract says which checks a delivery needs, how deep the agentic part goes and where each check runs. It lives in the `evidence:` block of `.agents/project.yaml`, next to the push and merge policy in `git_strategy.policy`. Values live only in that file; the keys are documented in the project's schema file beside it. The gate reads the contract from the base branch (`origin/<base>`), so a change cannot weaken the contract that judges it.

## Keys

| Key | Holds | Notes |
|---|---|---|
| `evidence.include` | skills whose `evidence.yaml` fragment adds checks | merged in list order, then the project's own lists; the same `id` twice keeps the project's |
| `evidence.static` | `{id, cmd, where}` rows | `where` is `pre-push`, `ci` or both. Commands come from `package.json`, never invented |
| `evidence.agentic` | `{id, kind, tool, envs, min_depth}` rows | `kind` names the artifact the check must leave (`screenshots`, `exploratory`, `test-run`, `api-calls`) |
| `evidence.depth.default` | depth of a file no rule matches | |
| `evidence.depth.rules` | `{paths, depth}` rows | the first matching rule decides a file's depth |
| `evidence.human.paths`, `evidence.human.keys` | paths and `project.yaml` keys that make up the gate itself | a match sets `touches_gate` in the record and adds one line to the PR's evidence block. It is information for the reader and stops nothing |
| `evidence.review.bot` | login of a review bot whose findings must be resolved before merge | `null` when there is none |
| `evidence.review.max_rounds` | how many fix rounds the agent runs against the bot | after the cap the finding goes to a person (`human-gates.md`) |
| `evidence.record.artifact_retention_days` | how long local artifacts stay after merge | records themselves are never pruned |
| `git_strategy.policy.direct_push_to_protected` | `forbidden`, `confirm`, `allowed` or `evidence` | `flows.md` |
| `git_strategy.policy.merge_mode` | `auto`, `human-approves` or `manual` | `flows.md` |

A missing `evidence:` block does not mean "no gate". The gate falls back to the static checks whose `package.json` scripts exist and to depth `none`, so a fresh project has a working gate before it declares anything. The exact fallback is the gate script's, read it there.

## Depth

The gate computes depth from the files the change touches (`git diff --name-only <base>...<head>`). Each file takes the depth of the first rule that matches it, else the default, and the change takes the highest. The order is `none < light < standard < deep`.

| Depth | Agentic requirement |
|---|---|
| `none` | static checks only |
| `light` | screenshots of every top-level page or view the app exposes, on one environment |
| `standard` | every agentic check with `min_depth` up to `standard`, run against the change's acceptance criteria |
| `deep` | `standard`, plus the flows next to the touched ones (the smoke of the touched modules), on every environment the check lists |

The agent may raise depth for one delivery with `--depth` when it judges the change riskier than its paths say. It never lowers it. A rule that sets the wrong depth is fixed in the contract, in its own change, so the reader sees the correction.

## Skill fragments

A workflow skill that knows its own risk ships an `evidence.yaml` with the same `static`, `agentic` and `depth.rules` shape. The project opts in by naming the skill in `evidence.include`. A fragment can only add checks or rules; the project's own list wins on a clash.

## Two shapes of contract

These are examples of shape, not this project's values. A repository of application code and a repository of test code differ in what their agentic checks exercise, not in how the contract works.

```yaml
# A web application
evidence:
  include: [<the repo's development skill>]
  static:
    - { id: lint, cmd: bun run lint:check, where: [pre-push, ci] }
    - { id: types, cmd: bun run types:check, where: [pre-push, ci] }
    - { id: unit, cmd: bun run test, where: [pre-push, ci] }
  agentic:
    - { id: app-screens, kind: screenshots, tool: playwright-cli, envs: [local], min_depth: light }
    - { id: api-contract, kind: api-calls, tool: openapi, envs: [local], min_depth: standard }
  depth:
    default: standard
    rules:
      - { paths: ['**/*.md', 'docs/**'], depth: none }
      - { paths: ['**/*.css', 'styles/**'], depth: light }
      - { paths: ['db/migrations/**', 'middleware.ts'], depth: deep }

# A test-automation repository
evidence:
  include: [<the repo's test-writing skill>, <the repo's manual-testing skill>]
  static:
    - { id: lint, cmd: bun run lint:check, where: [pre-push, ci] }
    - { id: unit, cmd: bun test, where: [pre-push, ci] }
  agentic:
    - { id: changed-specs, kind: test-run, tool: playwright, envs: [local, staging], min_depth: standard }
  depth:
    default: none
    rules:
      - { paths: ['tests/**'], depth: standard }
      - { paths: ['tests/fixtures/**', 'playwright.config.ts'], depth: deep }
```
