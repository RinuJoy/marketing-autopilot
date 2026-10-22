Weekly marketing autopilot run (Mondays 07:00 UK).

1. Clone RinuJoy/marketing-autopilot, and next to it each app repository listed in its apps/*/app.json "source.repo".
2. Run `node bin/autopilot.mjs check --all`. If it fails, stop and report the problems.
3. Run `rule-watch --all`, `search-opportunities --all`, `reply-drafts --all`, then `weekly-report --all --live`.
4. For rule-watch changes: open each changed official page, decide whether the app's data (for Picproved, js/presets.js)
   is now wrong, and if so open a pull request in the app's repository with the fix and the source. Never guess.
5. For search opportunities: draft a better title and description for each page (under 60 and 155 characters,
   the document name first, facts not hype, no word from app.json "neverSay"). Put them in the report thread.
6. For reply drafts: rewrite each draft in the reviewer's language, specific to what they said. Do not post.
7. Commit state/ to main with the message "Weekly run <date>".
8. Post a summary: what changed, what needs approval, the 3 things to do this week.
