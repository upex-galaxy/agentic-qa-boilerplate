# What still asks a person

EDD removes the per-step OKs: the branch name, the commit set, the PR body, a direct push under `evidence`, a merge under `auto`. What is left is a closed list. An item on it is asked; anything off it is the agent's call, made and reported.

| # | Item | Why it survives EDD |
|---|---|---|
| 1 | Product behaviour: what the expected result is | it is the oracle of every agentic check, and only a person owns it |
| 2 | Force push, `--force-with-lease`, `--no-verify`, a rewrite of pushed history, deleting a remote branch, a repo-wide discard | git invariants; no policy relaxes them |
| 3 | An admin bypass beyond the standing one the project declared (`git_strategy.policy.admin_bypass` with its `accepted_divergences`) | outward and irreversible |
| 4 | Applying a schema migration to shared infrastructure when the project keeps migrations on confirm | irreversible, and it hits every concurrent agent |
| 5 | Writing the host's protection or the team's policy: `git:policy apply --yes`, `migrate --yes`, a strategy change, `--allow-loosening` | it changes the rules every later delivery runs under |
| 6 | A final OK the project reserves for a person, such as moving work on as not fully tested | the project said the signature stays with a person |
| 7 | The approval under `human-approves`, and the merge under `manual` | the team declared it wants the last word |
| 8 | A finding the author refutes after `evidence.review.max_rounds`, or a required check that cannot run (environment down, tool missing) | skipping a check or lowering depth weakens the contract; the agent reports and waits, never downgrades quietly |
| 9 | A new security posture, as opposed to applying a pattern already ratified | it decides what the system is allowed to do |
| 10 | Any `--auto` on a base where `git:policy verify --merge` fails | it would merge unverified |

A change that touches the gate itself (workflows, hooks, the evidence script, the contract, the policy keys) is not on the list. It is delivered like any other change: it takes depth `standard` or deeper, the record marks it `touches_gate` with the matched paths so the reader knows to look, and a repo on `human-approves` lists those paths in CODEOWNERS, which brings the change under item 7 there. This is the owner's final decision.

## How to ask

Ask once, with the options, what each one costs and the one you recommend. The delivery of that change waits for the answer; other work continues. A session launched by another session asks its launcher, never the person directly, and the launcher relays.
