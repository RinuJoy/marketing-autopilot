# marketing-autopilot

One marketing automation setup shared by all of Rinu's apps. Each app plugs in with two files:

- `apps/<app>/app.json`: name, site, store ids, prices, languages, channels and their post templates, seasons,
  directories, words never to use, and an optional `focus`: the audience to win first, counted in the Monday
  report (orders from one country for some documents since a date, against a target by a review date).
- `apps/<app>/adapter.mjs`: turns the app's own data into **items** (anything worth its own page, post or video).
  Picproved's items are its documents (read from `js/presets.js`), Awayline's are the away grounds (from
  `data/clubs.json` and `data/grounds.json`). The fields are in `core/item.mjs`.

The engines are written once and work for every app. Nothing is posted, sent or emailed without `--live`, and
nothing ever posts in groups, buys reviews or fakes engagement: those stay human on purpose.

## Run

Needs Node 22 or later and no packages. The apps' repositories sit next to this one (`../picproved`,
`../awayline`), or set `APP_SOURCE_PICPROVED=...` to point elsewhere.

```sh
npm test                                              # unit tests, plus every app's setup check
node bin/autopilot.mjs check --all                    # is each app's setup healthy?
node bin/autopilot.mjs post-bank --app picproved      # 90 days of posts per channel into out/picproved/posts/
node bin/autopilot.mjs rule-watch --app picproved     # which official source pages changed since last week, with proposed fixes
node bin/autopilot.mjs blocked-checklist --app picproved   # the pages the cloud can't open, as a checklist for your PC
node bin/autopilot.mjs weekly-report --app picproved --live   # write and email the Monday report
```

On Windows use the same commands in PowerShell. Engines write to `out/<app>/` (not committed) and remember what they
need in `state/<app>/` (committed, so next week can compare).

## Engines

| Engine | What it does | Needs | When |
| --- | --- | --- | --- |
| `check` | Settings complete, items valid, seasons match, no banned words | Nothing | Every run, in tests |
| `seasons` | The next 12 months of seasonal peaks and which items they bring forward | Nothing | Monthly |
| `post-bank` | A post per item and channel, season first, each with its own tracking link; CSV per channel for bulk schedulers | Nothing | Monthly |
| `publish` | Posts today's queued posts on channels marked `auto` that have an API (Bluesky now; YouTube once the video factory exists) | `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD` | Daily |
| `rule-watch` | Opens every cited source page (PDFs too, with `pdftotext`) and lists the sentences that changed. When a page's numbers change (size, pixels, head, background, file size, how recent) and match a value the app uses, it writes the fix as a patch with a plain-English summary in `state/<app>/rule-proposals/`, on a `rules/<date>-<id>` branch that `--push` pushes. Never merges, never bumps a version | Open internet; push access to the app's repository for `--push` | Weekly |
| `blocked-checklist` | The official pages the cloud can't open, each with the values the app uses, as a checklist to open on your own computer (`out/<app>/blocked-checklist.html`); the first weekly report of each month emails it | Nothing | Monthly |
| `launch-kit` | Every launch-day text: hour-by-hour plan, launch post, friends email, directory entries, press note | Nothing | Once, before launch |
| `llms-txt` | `llms.txt` for AI assistants (ChatGPT, Perplexity, Gemini) to quote and link the site | Nothing | On each site publish |
| `indexnow` | Sends new and changed pages to Bing, Yandex, Seznam and Naver | `INDEXNOW_KEY` and `<key>.txt` on the site | On each site publish |
| `search-opportunities` | Pages Google shows often but people rarely click, to retitle | `GOOGLE_SERVICE_ACCOUNT` (Search Console) | Weekly |
| `search-ideas` | What people search about each item that no page answers yet | Open internet | Monthly |
| `reply-drafts` | A draft reply for each unanswered Play review, never posted by itself | `GOOGLE_SERVICE_ACCOUNT` (Play Console) | Daily or weekly |
| `video` | 30-second vertical Shorts made from the real app (screens in a phone, big rule text, QR end card), from `apps/<app>/videos.mjs`; `--only <id>` for one, `--music <folder>` for music, `--voice tools/say-kokoro.py` for an AI voiceover of each scene's `say` line, `--clips <folder>` for film clips behind a caption (`clip:` on a scene) | Playwright and ffmpeg (run it where they are installed) | When a new video is written |
| `weekly-report` | Sales by country, the focus count, website visits, Google clicks, Play reviews, season, and the 3 things to do this week | `PADDLE_API_KEY`, `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (Web Analytics read), `GOOGLE_SERVICE_ACCOUNT`, `BREVO_API_KEY`, `MAIL_FROM`, `REPORT_EMAIL` | Mondays |

Every key is optional: an engine whose key is missing says "not switched on" and carries on.

## When an official rule changes

1. Monday's `rule-watch` finds the page changed, reads its numbers before and after (`core/rule-facts.mjs`) and matches
   them to every item that cites the page (the adapter's `ruleTargets`). A value the app uses that went away and has
   exactly one replacement becomes an edit (the adapter's `applyRule`: the field, the same number in the notes, and
   `checked: "<date>"`).
2. The edit is committed on `rules/<date>-<id>` in a throwaway worktree of the app's repository, and saved as
   `state/<app>/rule-proposals/<date>-<id>.patch`, whose message holds the summary and the page's changed sentences.
3. The weekly report lists it first under "This week", with the summary. Wording-only changes, PDFs it can't read and
   numbers it can't match are listed as pages to read, with no patch.
4. To take it: say go, and a thread applies it in the app's repository (`git am <patch>` or the pushed branch), runs the
   tests and hands it to the next release. Nothing ships without that.

## Where it runs

GitHub Actions minutes are too tight, so the schedule runs as **Claude routines** (scheduled cloud tasks): each
routine clones this repository and the app's, runs the engine, commits `state/`, and writes the drafts for a person
to approve. Their cloud environment needs **Full** network access, because the rule pages, Google and Paddle are
not on the default allow list. The prompts are in `routines/`. A Windows Task Scheduler job on a PC that's on is
the free fallback.

## Add a new app (about a day)

1. Copy `apps/_template` to `apps/<app>`, set `"id"` to the folder name, fill in `app.json`.
2. Write `adapter.mjs` so it reads the app's own data and returns items.
3. `node bin/autopilot.mjs check --app <app>` until it's clean, then `npm test`.
4. Add the app's keys to the routines' environment and the app to each routine's list.

## Rules every engine keeps

- Posts and pages state facts from the app's own data and link the official source.
- Words in `neverSay` are never used (for Picproved: no "guaranteed", "100% acceptance", "#1", "best").
- One post a day per channel, each about a different item, so nothing reads as spam.
- Community groups, public replies, outreach and ad spend are done by a person.
