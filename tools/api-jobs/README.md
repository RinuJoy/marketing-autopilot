# Claude API jobs for Picproved

Jobs that spend the API org's credits ($200, expiring 26 Nov 2026) on work that improves Picproved.
They read a Picproved clone and write reports to `out/api-jobs/<job>/`. They never change the Picproved repo;
a follow-up thread turns the findings into a Picproved branch.

## Key

The scripts read `PICPROVED_API_KEY` (or `ANTHROPIC_API_KEY`) and always call api.anthropic.com.
Use a separate key, for example `picproved-jobs`, made at console.anthropic.com > API keys.
Never paste a key into a chat.

- **Cloud threads:** add `PICPROVED_API_KEY` as an environment variable in the project's cloud environment
  (Project settings > Cloud environment > gear). New threads pick it up.
- **Your PC (PowerShell):** `$env:PICPROVED_API_KEY = "sk-ant-..."` in the window you run the job from. It is gone when the window closes.

## Jobs

| Job | Command | What you get | Cost (estimate) |
|---|---|---|---|
| Translation review, 19 languages | `translate-review.mjs estimate`, then `submit`, then `collect` | `<lang>.md` report + `<lang>.json` suggested fixes, `SUMMARY.md` | about $20 (Batch API, Opus 5.5, high effort) |
| Apply translation fixes | `translate-apply.mjs --repo <picproved>` on a Picproved branch | edits js/lang/*.js, checks each change | free |
| Rule check, 204 documents | `rule-check.mjs estimate`, then `run` | `REPORT.md`: changed rules with quotes, dead links, cannot-verify list | about $0.30 a document, ~$65 for all (web fetch + search) |

All commands: `node tools/api-jobs/<job> <step> --repo <path to picproved>`.
Options: `--model claude-fable-5-1` (about 2.5x the cost, the strongest model), `--langs hi,ta`, `--ids in-passport`, `--limit 10`.

`estimate` needs no key. `rule-check run` can be stopped and run again; it skips documents already done.
`translate-review collect` waits for the batch (usually under an hour).
