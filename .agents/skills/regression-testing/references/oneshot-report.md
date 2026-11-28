# One-shot report

`bun run report:oneshot` turns a directory of Allure result files into one self-contained HTML file, small enough to attach to a chat message or publish as an artifact. It needs no `allure` binary, no network and no extra dependency.

It is a standard alternative to the Allure report, not a replacement. Allure stays the report published to Pages. Its single-file HTML is too heavy to load in a chat tool or an artifact, and that is the case this file covers.

The command sends nothing. It writes the file and prints its absolute path. Attaching or publishing it is an outward action (`agentic-qa-core/references/decision-protocol.md`).

## Run it

After a local run, no flag is needed:

```bash
bun run report:oneshot
```

For a CI run, download the results first, then point the command at them:

```bash
gh run download <RUN_ID> -n merged-allure-results-<env> -D ./analysis/allure/
bun run report:oneshot --results ./analysis/allure --env <env> --run-url <run url> --name "<report title>"
```

The artifact names come from the `upload-artifact` steps of the suite workflow under `.github/workflows/`, so read them there. When a regression run has no merged artifact, download each per-job results artifact into its own directory and copy every file into one flat directory, because the command reads a single level:

```bash
mkdir -p ./analysis/allure
find ./analysis/integration ./analysis/e2e -type f -exec cp {} ./analysis/allure/ \;
```

Copy all files, not only `*-result.json`: attachments and `environment.properties` sit beside them. Artifacts expire after the retention the workflow sets, so build the report inside that window.

## Flags

`bun run report:oneshot --help` prints every flag with its default. The defaults are the lean build for chat: step trees for failures only, no attachments, no video.

| Need | Flag |
|---|---|
| Screenshots and logs of what failed | `--attachments failures` |
| Playwright recordings | `--video failures`, the heaviest option |
| A smaller file | `--steps none` |
| A pass-rate trend | `--history <file>`, a JSON array of `{label, at, passed, failed, total, url}` |

The command prints the size after writing. Check it against the limit of the channel before attaching. Traces and archives are never embedded at any setting, because a trace carries every network response the run captured.

Exit codes: 0 means written, 1 means nothing was written (no results, a leak gate hit, an I/O error), 2 means a usage error. Every exit 1 removes the file already at `--out`, so an earlier report cannot pass for this run.

## Leak gate

The report is built to leave the machine, so two layers lower the chance that a secret leaves with it:

1. The model redacts every string on the way in: secret-shaped text, whatever was typed into a field (step titles, call logs, page snapshots), and the exact values held by the local `.env*` files, the MCP configs, `.auth/` and secret-named environment variables. Arguments in decorator-shaped step titles (`@atc` and `@step`) are dropped.
2. A final scan of the finished page runs before the write. Any hit exits 1, writes nothing, and prints the rule name and a count, never the value.

The redactor over-redacts on purpose, because it fails closed: a typed email, or a test name with a word after `password:`, is masked too.

When the gate refuses, find the string in the test or the helper that produced it and fix it there. Never edit the HTML or skip the gate.

## Before attaching the file

**A passed gate is not proof that the file is clean.** The gate knows secrets by their shape, by the name next to them, and by the values this machine holds. A secret with none of the three passes, and the command still reports success.

**The weakest case is a report built from CI artifacts on a machine that does not hold the CI secrets.** The exact-value check then has nothing to compare against, and only shapes and names are left. Open the file and read it before sending it, or build it where the run's secrets are loaded.

What passes, even so:

| What | Where it shows up |
|---|---|
| Anything visible in a screenshot or a video, on any machine | `--attachments`, `--video` |
| A value with no known token prefix and no secret-looking name beside it | error messages, assertion diffs (`Received: "..."`), logs, test and step names, parameter values, URL paths, `environment.properties` |
| A secret under a key the rules do not know, nested one level below a secret key, or written as XML, multipart or a `[name, value]` pair | API bodies in attachments |
| Part of a password that holds a quote followed by punctuation, a space, or an HTML closing tag | `password=...` text |
| A value shorter than eight characters in free text | anywhere |
| A value written as `$` followed by capitals, which reads as a variable name | `password=...` text |
| A value encoded in a way the check does not try, such as compressed, reversed, or base64 inside `user:password` | anywhere |
| A local value whose `.env` file sits outside the directory the command runs in | anywhere |

When the run touched real credentials or customer data, prefer the lean default (no attachments, no video) and read the failures before sending.

## Known defects

An expected failure that failed is filed by Allure as `passed`. The report shows it as a known defect instead, keeps it out of the passes, and counts it as executed. A marked expected failure that passed is an **unexpected pass**: the run is red and the defect may be fixed.

The bug key reaches the report only when the results carry it: `knownDefect('<BUG-KEY>')` from `tests/utils/knownDefect.ts`, an annotation declared on the test (`{ type: 'known-defect', description: '<BUG-KEY>' }`), a `@blocked:<BUG-KEY>` tag, or a declared `fail` description starting `Blocked by <BUG-KEY>`. An annotation pushed by hand while the test runs is missing from the Allure results: such a test shows as a known defect with no defect key, and its unexpected pass shows as a failure with no error. Use the helper, or take the key from `reports/test-outcomes.json`.

## Reading it out

Report distinct failures, not failing tests: the report groups failures by the shape of their error. Classification and the release verdict stay with the three phases of this skill; the one-shot file only shows the run.
