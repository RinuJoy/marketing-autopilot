Weekly marketing autopilot run (Mondays 07:00 UK).

1. Clone RinuJoy/marketing-autopilot, and next to it each app repository listed in its apps/*/app.json "source.repo".
2. Run `node bin/autopilot.mjs check --all`. If it fails, stop and report the problems.
3. Run `rule-watch --all`, `search-opportunities --all`, `reply-drafts --all`, then `weekly-report --all --live`.
4. rule-watch writes its own proposed fixes: for each changed page whose numbers (size, pixels, head, background,
   file size, how recent) map to the app's values, a patch with a plain-English summary in
   state/<app>/rule-proposals/<date>-<id>.patch (and .md), listed in state/<app>/rule-proposals.json and in the report.
   With `--push` (only if this run may push to the app's repository) it also pushes branch `rules/<date>-<id>`; it never
   opens a pull request, merges or bumps a version. Open each proposal's official page and say in the summary whether
   the patch reads it right. Wording-only changes and numbers it couldn't map are in the report under "Changed, but no
   fix proposed": read those pages and list any fix you would make, with the source. Never guess.
5. For search opportunities: draft a better title and description for each page (under 60 and 155 characters,
   the document name first, facts not hype, no word from app.json "neverSay"). Put them in the report thread.
6. For reply drafts: rewrite each draft in the reviewer's language, specific to what they said. Do not post.
7. Commit state/ to main with the message "Weekly run <date>".
8. Post a summary: what changed, what needs approval, the 3 things to do this week.
