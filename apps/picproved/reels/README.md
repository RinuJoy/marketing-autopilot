# Picproved reels

Animated 20 to 30 second explainers for Shorts, Reels and TikTok, made by `engines/reel.mjs` from the scripts in this
folder. Everything on screen is drawn as code (no screen recording, no video AI), so a new reel is a new `.txt` file.

## Make a new reel (about 10 minutes)

1. Copy one of the `.txt` files here and rename it (lowercase and dashes: `uk-child-photo.txt`).
2. Change the header (title, description lines, tags, `end` address) and write 3 to 5 scenes, each after `---`:

   ```
   ---
   show: photo face=43 bg=cream size=35x45mm mark=tick on=above
   text: Lie them on a plain sheet
   say: Lie them on a plain, light sheet, and take it from above.
   ```

   - `text` is the big words on screen, `sub` an optional smaller line, `say` the voiceover (also the captions).
   - `clip: clip-1-airport` plays a film clip (an .mp4 in the `--clips` folder, such as a Runway clip) full screen behind the scene; `clipFrom: 2` starts it 2 seconds in. Picproved's clips are in `picproved/videos/clips/` in the project files.
   - `show` is one of:
     - `title` (the hook, big words only)
     - `photo face=<n> bg=cream|grey|light|white size=35x45mm [from=35x45mm] [mark=tick|cross] [on=<word>] [label="..."] [dims=off]`:
       a print with its size drawn on; with `from=` it changes shape on the word `on=`
     - `compare face=<n> bg=white,cream mark=cross,tick Left label | Right label`
     - `list ✓ Allowed thing | ✗ Not allowed thing | 1. A step`: each line ticks in on the first of its words that is said
     - `number value="600 × 750" unit="pixels"`: counts up
     - `strike text="PHOTO CODE" stamp="Optional" on=<word>`: a ticket crossed out
   - Faces are the fictional AI faces in `assets/`. Indian: `face-43` baby, `44` newborn, `45` woman, `47` man, `48` girl. Not Indian: `25` baby, `30` older bald man, `33` woman, `38` man, `42` Black woman. For other communities: `32` bearded South Asian man (Pakistani reels), `19` Black woman and `34` Black man (Nigerian reels).
   - Stock clips so far (Pexels, credits in the clips folder's CREDITS.md): airport, passport-hands, printing, baby x3, selfie, upload-frustrated, laptop-in, instant-photos(-face), phone-pk, laptop-ng, glasses, toddler, toddler-run, suitcase. Match the clip's person to the reel's face. Hero shots worth Runway credits are listed in `runway-shots.md`.
   - Rinu's rule: UK reels never show Indian-origin faces or people, and Indian reels (OCI, Indian passport) show only Indian people. Reels for another community (Pakistani, Nigerian) show people from that community. That covers stock and film clips too; a faceless clip (hands, people from behind) fits either.
     Never a real person's photo.
   - Keep each `say` to one or two short sentences: four scenes plus the end card come to about 20 to 25 seconds.
3. Make it:

   ```powershell
   node bin/autopilot.mjs reel --app picproved --only uk-child-photo
   ```

   With a voice: add `--voice tools/say-elevenlabs.mjs` (needs `ELEVENLABS_API_KEY`), `--voice tools/say-google.mjs`
   (needs `GOOGLE_TTS_KEY`) or `--voice tools/say-kokoro.py` (free, offline; see the top of that file). Add
   `--music <folder>` for a music bed. The reel lands in `out/picproved/reels/` with an upload `.txt` and a contact sheet.
4. `npm test` checks every script (known visuals, faces that exist, no banned words).

## What it needs

Node 22+, ffmpeg and Playwright's Chromium. On Windows: `winget install Gyan.FFmpeg`, then in this folder
`npm.cmd i --no-save playwright` and `npx.cmd playwright install chromium`. A 25-second reel takes about a minute and a half.

## Rules for every reel

Facts from the official page (cited in the description), "checked against the official rules", never "guaranteed".
An AI voice means ticking "altered or synthetic content" on YouTube and the AI label on Instagram and TikTok.

## Reach rules (Instagram, YouTube Shorts, Facebook Reels, checked 2 Nov 2026)

What the three platforms say they rank on, and what each reel does about it:

| Signal | Who says so | What the script does |
|---|---|---|
| Viewers choose to watch instead of swiping away | YouTube ("chose to view" vs "swiped away") | The first `say` line is the payoff, not backstory, and the first scene's words show on frame 1. Hook text 6 words or fewer. |
| Watch time and percentage watched | YouTube, Instagram, Facebook | Four scenes plus the end card, 20 to 28 seconds. Each `say` one sentence. Numbered lists ("4 things") keep people to the end. |
| Sends (shares by DM) per reach | Instagram, the strongest signal for people who don't follow you | `endSay` asks for a send or a tag ("Send this to whoever is renewing next"), and the caption repeats it. |
| Likes and saves per reach | Instagram, Facebook | Save-worthy numbers on screen (630 × 810, 2 × 2 in, 12 to 70) and "Save this for…" in the caption. |
| Original content | Instagram and Facebook demote reposts and watermarked clips | Code-drawn scenes, our own Runway clips and licensed stock; never another app's export or watermark. |
| Freshness on Facebook | Facebook shows more same-day Reels | Post when the audience is up (FB+IG 10:00, Wed 12:00, YouTube 16:00 UK). |
| Reaching non-followers on Instagram | Trial reels go to non-followers first | New reels go out as Trial Reels for the first week while the accounts have few followers. |
| Comments | All three | A first comment that asks a one-word question ("Which document are you doing?"). |
