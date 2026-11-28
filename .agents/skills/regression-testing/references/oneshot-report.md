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

The report is built to leave the machine, so two layers keep secrets out of it:

1. The model redacts every string on the way in: secret-shaped text, plus the exact values held by the local `.env*` files, the MCP configs, `.auth/` and secret-named environment variables. Arguments in decorator-shaped step titles (`@atc` and `@step`) are dropped.
2. A final scan of the finished page runs before the write. Any hit exits 1, writes nothing, and prints the rule name and a count, never the value.

The redactor over-redacts on purpose, because it fails closed: harmless text shaped like a secret, such as a test name with a word after `password:`, is masked too.

When the gate refuses, find the string in the test or the helper that produced it and fix it there. Never edit the HTML or skip the gate.

What the gate cannot see, so look at the file before sending it when the run touched sensitive data:

- Pixels in screenshots and video.
- An opaque token in free text with no key name and no known prefix, whose value this machine does not hold. A report built from CI artifacts is the usual case, since CI secrets can differ from local ones.
- Local values shorter than eight characters.
- Values encoded more than once, compressed, or split across lines.

## Known defects

An expected failure that failed is filed by Allure as `passed`. The report shows it as a known defect instead, keeps it out of the passes, and counts it as executed. A marked expected failure that passed is an **unexpected pass**: the run is red and the defect may be fixed.

The bug key reaches the report only when the results carry it: `knownDefect('<BUG-KEY>')` from `tests/utils/knownDefect.ts`, an annotation declared on the test (`{ type: 'known-defect', description: '<BUG-KEY>' }`), a `@blocked:<BUG-KEY>` tag, or a declared `fail` description starting `Blocked by <BUG-KEY>`. An annotation pushed by hand while the test runs is missing from the Allure results: such a test shows as a known defect with no defect key, and its unexpected pass shows as a failure with no error. Use the helper, or take the key from `reports/test-outcomes.json`.

## Reading it out

Report distinct failures, not failing tests: the report groups failures by the shape of their error. Classification and the release verdict stay with the three phases of this skill; the one-shot file only shows the run.
