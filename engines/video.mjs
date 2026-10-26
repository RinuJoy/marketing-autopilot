// Video factory: short vertical videos (1080×1920, 30 fps) for YouTube Shorts, Instagram Reels and TikTok, made from
// the real app. Each app that wants videos has apps/<app>/videos.mjs with two exports:
//   shots(kit)  opens the app in a phone-sized browser and captures the screens the videos show (name → PNG path);
//   videos      the videos: { id, title, description, tags[], theme?, scenes[] }. A scene is
//               { secs, title, sub?, chips?[], shot?, pan?: [fromY, toY] (CSS px down the captured screen), theme? };
//               a scene with a shot shows it in a phone under the caption, one without is a big text card.
// Every video ends on a card with the site address. The text carries the message, so the videos work with the sound
// off. --music <folder> mixes in a licensed track; without it the track is silent and music is added in the
// platform's own app when posting. --voice <command> reads each scene's `say` line aloud with a text-to-speech command
// (called as `<command> <out.wav> <voice name> <text>`, see tools/say-kokoro.py); a scene grows to fit its line and the
// music drops under the voice. The app's videos.mjs may export `voice` = { name, pronounce: { word: "how to say it" } }; a video's own `voice` names
// a different voice for that video. --clips <folder> lets a scene play a short film clip full-screen behind its
// caption: { clip: "<file name without .mp4>", clipFrom?: seconds into the clip }; the clip's last frame holds if
// the scene runs longer, and a scene whose clip isn't there falls back to a text card.
// Frames are drawn one by one (no screen recording), so the timing is exact however slow the machine.
// Writes out/<app>/videos/<id>.mp4, <id>.txt (title, description, tags for the upload) and <id>-sheet.jpg (one frame
// a second, for checking by eye). Needs Playwright and ffmpeg. --only <id> makes one video.
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import { readFile, readdir, mkdir, writeFile, access } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { serve } from "../core/serve.mjs";
import { outPath } from "../core/util.mjs";

const FPS = 30, W = 1080, H = 1920;
// The phone the screens are captured in: 360×760 CSS px at 3×, as in Picproved's store screenshots.
export const PHONE = { viewport: { width: 360, height: 760 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: "reduce", bypassCSP: true };

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3);

// The end card every video closes on.
export function withEnd(video, config) {
  const site = String(config.site || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  return [...video.scenes, { secs: 3, title: site, sub: video.end || "Link in the description", end: true }];
}

export function timeline(scenes) {
  let t = 0;
  return scenes.map(s => { const at = t; t += s.secs; return { ...s, at }; });
}
export const length = scenes => scenes.reduce((a, s) => a + s.secs, 0);

// Problems a video would have on the platforms: too long for a Short, a scene too quick to read, a missing shot.
export function checkVideo(v, shotNames) {
  const p = [], total = length(v.scenes);
  if (!v.id || !/^[a-z0-9-]+$/.test(v.id)) p.push(`bad id ${v.id}`);
  if (total > 57) p.push(`${v.id}: ${total}s, over a minute with the end card`);
  for (const s of v.scenes) {
    const words = `${s.title || ""} ${s.sub || ""} ${(s.chips || []).join(" ")}`.split(/\s+/).filter(Boolean).length;
    if (s.secs < 1 + words / 4.5) p.push(`${v.id}: "${s.title}" has ${words} words for ${s.secs}s`);
    for (const k of [s.shot, s.photo]) if (k && shotNames && !shotNames.includes(k)) p.push(`${v.id}: no shot "${k}"`);
  }
  return p;
}

function stageHTML({ scenes, theme, font, logo, qr }) {
  const pw = 640, bezel = 15, sw = pw - 2 * bezel, bar = Math.round(sw * 24 / 360), apph = Math.round(sw * 760 / 360), r = 76;
  const scene = (s, i) => {
    const cls = `scene ${s.clip ? "dark has-clip" : s.theme || theme}${s.shot || s.photo ? " has-shot" : s.clip ? "" : " card"}${s.end ? " end" : ""}`;
    const chips = (s.chips || []).map(c => `<span class="chip">${esc(c)}</span>`).join("");
    const head = s.end ? `<div class="brand">${logo}</div>` : "";
    const code = s.end && qr ? `<div class="qr"><div>${qr}</div><span>Scan to open</span></div>` : "";
    const phone = s.shot ? `<div class="phone" style="width:${pw}px;padding:${bezel}px;border-radius:${r}px">
      <div class="screen" style="height:${apph + bar}px;border-radius:${r - bezel}px"><div class="status" style="height:${bar}px"><span>9:41</span><i class="punch"></i><span>●●● ▮</span></div>
      <div class="win" style="height:${apph}px"><img class="shot" src="/__shot/${esc(s.shot)}.png"></div></div></div>` : "";
    // A photo on its own, as a print lying on the scene (the photo as taken, before the app has touched it).
    const print = s.photo ? `<div class="slide"><div class="print"><img class="photo" src="/__shot/${esc(s.photo)}.png"></div></div>` : "";
    const film = s.clip ? `<div class="film"><img class="frame" alt=""></div>` : "";
    return `<section class="${cls}" id="s${i}">${film}<header class="cap">${head}<h1>${esc(s.title || "")}</h1>${s.sub ? `<p>${esc(s.sub)}</p>` : ""}${chips ? `<div class="chips">${chips}</div>` : ""}${code}</header>${phone}${print}</section>`;
  };
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  ${font ? `@font-face { font-family: "Brand"; src: url(${font}) format("woff2"); font-weight: 400 800; }` : ""}
  * { box-sizing: border-box; } html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: #0a7646; }
  body { font-family: "Brand", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  .scene { position: absolute; inset: 0; opacity: 0; }
  .green { background: radial-gradient(900px 700px at 50% 64%, rgba(255,255,255,.13), rgba(255,255,255,0) 70%), linear-gradient(160deg, #0f9159 0%, #0d8752 40%, #0a7646 100%); color: #fff; }
  .soft { background: radial-gradient(900px 700px at 50% 64%, rgba(255,255,255,.75), rgba(255,255,255,0) 70%), linear-gradient(160deg, #e8f9f0 0%, #dff5ea 50%, #cdeedc 100%); color: #0b3a26; }
  .dark { background: linear-gradient(160deg, #13202f 0%, #0a1220 100%); color: #fff; }
  .cap { position: absolute; left: 80px; right: 80px; top: 110px; height: 430px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  .card .cap { top: 0; bottom: 0; height: auto; padding-bottom: 260px; }
  h1 { margin: 0; font-size: 78px; line-height: 1.08; font-weight: 800; letter-spacing: -0.028em; text-wrap: balance; }
  .card h1 { font-size: 104px; }
  p { margin: 26px 0 0; font-size: 42px; line-height: 1.3; font-weight: 600; opacity: .92; text-wrap: balance; }
  .card p { font-size: 52px; }
  .chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 16px; margin-top: 30px; }
  .chip { padding: 12px 26px; border-radius: 999px; font-size: 36px; font-weight: 700; background: rgba(255,255,255,.18); opacity: 0; }
  .soft .chip { background: #0b3a26; color: #fff; }
  .card .chip { font-size: 44px; padding: 16px 32px; }
  .brand svg { width: 220px; height: 220px; margin-bottom: 40px; filter: drop-shadow(0 12px 24px rgba(0,0,0,.25)); }
  .end h1 { font-size: 92px; }
  .end .cap { padding-bottom: 420px; }
  .qr { margin-top: 56px; width: 300px; padding: 18px 18px 10px; background: #fff; border-radius: 28px; box-shadow: 0 24px 50px -16px rgba(0,0,0,.45); }
  .qr div { width: 264px; height: 264px; } .qr span { display: block; color: #0b3a26; font-size: 30px; font-weight: 700; }
  .phone { position: absolute; left: ${(W - pw) / 2}px; top: 560px; background: #12181f; box-shadow: inset 0 0 0 3px #2d3640, inset 0 0 0 6px #0b0f14, 0 50px 90px -30px rgba(0,0,0,.55); }
  .screen { position: relative; overflow: hidden; background: #fff; }
  .status { display: flex; align-items: center; justify-content: space-between; padding: 0 44px; font-size: 22px; font-weight: 700; color: #111; background: #f4f6f3; position: relative; }
  .punch { position: absolute; left: 50%; top: 50%; width: 26px; height: 26px; transform: translate(-50%, -50%); border-radius: 50%; background: #0b0f14; }
  .win { position: relative; overflow: hidden; }
  .slide { position: absolute; left: 0; right: 0; top: 600px; }
  .print { margin: 0 auto; width: 660px; padding: 22px; background: #fff; border-radius: 14px; transform: rotate(-3deg); box-shadow: 0 40px 70px -25px rgba(0,0,0,.5); }
  .print .photo { display: block; width: 100%; border-radius: 4px; }
  .shot { display: block; width: 100%; will-change: transform; }
  .film { position: absolute; inset: 0; overflow: hidden; background: #000; }
  .film .frame { width: 100%; height: 100%; object-fit: cover; will-change: transform; }
  .film::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.62) 0%, rgba(0,0,0,.35) 32%, rgba(0,0,0,0) 55%); }
  .has-clip .cap { z-index: 1; text-shadow: 0 4px 24px rgba(0,0,0,.45); }
  </style></head><body>${scenes.map(scene).join("")}
  <script>
  const S = ${JSON.stringify(scenes.map(s => ({ at: s.at, secs: s.secs, pan: s.pan || null, frames: s.frames || 0 })))}, k = ${sw / 360};
  const ease = ${ease.toString()};
  const els = S.map((_, i) => document.getElementById("s" + i));
  // A clip scene shows frame n of its clip at /__clip/<scene>/<n>.jpg, waiting until it is drawn, with a slow push in.
  const film = async (el, i, s, u) => {
    const img = el.querySelector(".frame"), n = Math.min(s.frames - 1, Math.max(0, Math.floor(u * ${FPS})));
    img.style.transform = "scale(" + (1.02 + 0.06 * Math.min(1, u / s.secs)) + ")";
    if (img.dataset.n === String(n)) return;
    img.dataset.n = n; img.src = "/__clip/" + i + "/" + n + ".jpg";
    await img.decode();
  };
  window.render = async t => {
    const wait = [];
    S.forEach((s, i) => {
      const el = els[i], u = t - s.at, on = u >= -0.001 && u < s.secs;
      // Each scene fades in over 0.3 s on top of the last; the last one stays until the end.
      el.style.opacity = on || (i === S.length - 1 && u >= s.secs) ? Math.min(1, u / 0.3 + (i === 0 ? 1 : 0)) : 0;
      el.style.zIndex = i;
      if (!on) return;
      if (s.frames) wait.push(film(el, i, s, u));
      const cap = el.querySelector(".cap"), ph = el.querySelector(".phone, .slide"), a = ease(u / 0.5);
      cap.style.transform = "translateY(" + (1 - a) * 50 + "px)";
      if (ph) ph.style.transform = "translateY(" + (1 - ease(u / 0.6)) * 160 + "px)";
      el.querySelectorAll(".chip").forEach((c, j) => { const b = ease((u - 0.5 - j * 0.25) / 0.3); c.style.opacity = b; c.style.transform = "scale(" + (0.85 + 0.15 * b) + ")"; });
      const img = el.querySelector(".shot");
      if (img && s.pan) { const p = ease((u - 0.7) / Math.max(0.5, s.secs - 1.4)); img.style.transform = "translateY(" + -(s.pan[0] + (s.pan[1] - s.pan[0]) * p) * k + "px)"; }
    });
    await Promise.all(wait);
  };
  window.ready = Promise.all([...document.images].filter(i => i.src).map(i => i.decode())).then(() => document.fonts.ready);
  </script></body></html>`;
}

// Sound: a music track (looped, levelled so tracks match, faded out over the last 1.5 s) when one is given, else
// silence; with a voiceover, each line starts at its moment and the music sits well under it.
export function ffmpegArgs(file, secs, music, lines = []) {
  const fade = `afade=t=in:d=0.5,afade=t=out:st=${Math.max(0, secs - 1.5)}:d=1.5`;
  const bed = music ? `[1:a]loudnorm=I=${lines.length ? -28 : -18}:TP=-2:LRA=11,aresample=44100,aformat=channel_layouts=stereo,${fade}[m]` : "[1:a]anull[m]";
  const said = lines.map((l, i) => `[${i + 2}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${Math.round(l.at * 1000)}:all=1[v${i}]`);
  const mix = lines.length ? [...said, `${lines.map((_, i) => `[v${i}]`).join("")}amix=inputs=${lines.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=7,aresample=44100[vo]`,
    "[m][vo]amix=inputs=2:normalize=0:duration=first[a]"] : ["[m]anull[a]"];
  return ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
    ...(music ? ["-stream_loop", "-1", "-i", music] : ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"]),
    ...lines.flatMap(l => ["-i", l.file]),
    "-filter_complex", [bed, ...mix].join(";"), "-map", "0:v", "-map", "[a]", "-t", String(secs),
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", music || lines.length ? "128k" : "64k", "-movflags", "+faststart", file];
}

// One spoken line as a WAV (kept, so a re-run only speaks changed lines) and how long it lasts.
function speak(cmd, voice, text, dir) {
  const said = Object.entries(voice.pronounce || {}).reduce((t, [w, how]) => t.replace(new RegExp(`\\b${w}\\b`, "g"), how), text);
  const file = join(dir, createHash("sha1").update(`${voice.name}\n${said}`).digest("hex").slice(0, 16) + ".wav");
  if (!existsSync(file)) execFileSync(cmd, [file, voice.name || "", said], { stdio: ["ignore", "ignore", "inherit"] });
  return { file, secs: Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString()) };
}
// A scene with a line lasts at least the line plus a breath either side, in half seconds.
export const fitLine = (secs, said) => Math.max(secs, Math.ceil((VOICE_IN + said + 0.45) * 2) / 2);
const VOICE_IN = 0.35;

// A scene's clip as JPEG frames at the video's frame rate, from clipFrom for as long as the scene (or the clip) lasts.
function clipFrames(src, s, dir) {
  const file = join(src, s.clip + ".mp4");
  if (!existsSync(file)) return null;
  const at = join(dir, `${s.clip}-${s.clipFrom || 0}-${s.secs}`);
  if (!existsSync(join(at, "0.jpg"))) {
    execFileSync("mkdir", ["-p", at]);
    // A clip shorter than its scene plays slower, up to half speed, before its last frame holds.
    const left = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString()) - (s.clipFrom || 0);
    const slow = Math.min(2, Math.max(1, s.secs / left));
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(s.clipFrom || 0), "-i", file, "-t", String(s.secs / slow), "-vf", `setpts=${slow.toFixed(3)}*PTS,fps=${FPS}`, "-q:v", "2", "-start_number", "0", join(at, "%d.jpg")]);
  }
  return { at, frames: readdirSync(at).filter(f => f.endsWith(".jpg")).length };
}

async function renderVideo(browser, { base, scenes, theme, font, logo, qr, shots, file, music, lines }) {
  const html = stageHTML({ scenes, theme, font, logo, qr });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route(base + "__stage", r => r.fulfill({ contentType: "text/html", body: html }));
  // The stage asks for /__shot/<name>.png; those are the captures, not files of the app.
  await page.route(base + "__shot/**", async r => r.fulfill({ contentType: "image/png", body: await readFile(shots[decodeURIComponent(new URL(r.request().url()).pathname.slice(8, -4))]) }));
  await page.route(base + "__clip/**", async r => { const [, i, n] = new URL(r.request().url()).pathname.match(/__clip\/(\d+)\/(\d+)\.jpg$/);
    r.fulfill({ contentType: "image/jpeg", body: await readFile(join(scenes[i].film, n + ".jpg")) }); });
  await page.goto(base + "__stage");
  await page.evaluate(() => window.ready);
  const ff = spawn("ffmpeg", ffmpegArgs(file, length(scenes), music, lines), { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((ok, no) => ff.on("close", c => c ? no(new Error("ffmpeg exited " + c)) : ok()));
  const frames = Math.round(length(scenes) * FPS);
  for (let f = 0; f < frames; f++) {
    await page.evaluate(t => window.render(t), f / FPS);
    const jpg = await page.screenshot({ type: "jpeg", quality: 92 });
    if (!ff.stdin.write(jpg)) await new Promise(r => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await done;
  await ctx.close();
  return frames;
}

export async function run(app, { only, music, voice, clips } = {}) {
  const def = join(app.dir, "videos.mjs");
  try { await access(def); } catch { return { summary: "no videos.mjs for this app", files: [], problems: [] }; }
  const mod = await import(pathToFileURL(def).href);
  const list = mod.videos.filter(v => !only || v.id === only);
  if (!list.length) return { summary: `no video called ${only}`, files: [], problems: [] };
  const problems = list.flatMap(v => checkVideo(v));
  const { chromium } = createRequire(import.meta.url)("playwright");
  const out = outPath(app.name, "videos"), raw = join(out, "shots");
  await mkdir(raw, { recursive: true });
  const { server, base } = await serve(app.src);
  const browser = await chromium.launch();
  const files = [];
  try {
    const kit = { browser, base, src: app.src, raw, PHONE, ffmpeg: (...a) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a]),
      need: new Set(list.flatMap(v => v.scenes.flatMap(s => [s.shot, s.photo]).filter(Boolean))) };
    const shots = await mod.shots(kit);
    problems.push(...list.flatMap(v => checkVideo(v, Object.keys(shots))).filter(p => /no shot/.test(p)));
    const font = mod.font ? `data:font/woff2;base64,${(await readFile(join(app.src, mod.font))).toString("base64")}` : null;
    const logo = mod.logo ? (await readFile(join(app.src, mod.logo), "utf8")).replace(/<\?xml[^>]*>/, "") : "";
    // A QR code on the end card (an SVG kept with the app's videos), so a video seen on another screen can be scanned.
    const qr = mod.qr ? (await readFile(join(app.dir, mod.qr), "utf8")).replace(/<\?xml[^>]*>/, "").replace(/width="(\d+)" height="(\d+)"/, 'viewBox="0 0 $1 $2" width="100%" height="100%"') : "";
    // --music <folder>: the tracks in it (mp3, m4a, wav) take turns, one per video in list order.
    const tracks = music ? (await readdir(music)).filter(f => /\.(mp3|m4a|wav|ogg)$/i.test(f)).sort().map(f => join(music, f)) : [];
    if (music && !tracks.length) problems.push(`no music files in ${music}`);
    const spoken = { name: "", ...(mod.voice || {}) }, said = join(out, "voice");
    if (voice) await mkdir(said, { recursive: true });
    for (const v of list) {
      let scenes = withEnd(v, app.config), lines = [];
      if (voice) {
        const end = scenes[scenes.length - 1];
        end.say ??= v.endSay ?? mod.endSay;
        const clips = scenes.map(s => s.say ? speak(voice, { ...spoken, name: v.voice || spoken.name }, s.say, said) : null);
        scenes = timeline(scenes.map((s, i) => clips[i] ? { ...s, secs: fitLine(s.secs, clips[i].secs) } : s));
        lines = scenes.flatMap((s, i) => clips[i] ? [{ file: clips[i].file, at: s.at + VOICE_IN }] : []);
        if (length(scenes) > 57) problems.push(`${v.id}: ${length(scenes)}s with the voiceover, over a minute`);
        const quiet = v.scenes.filter(s => !s.say).length;
        if (quiet) problems.push(`${v.id}: ${quiet} scene(s) with no line to say`);
      } else scenes = timeline(scenes);
      if (scenes.some(s => (s.shot && !shots[s.shot]) || (s.photo && !shots[s.photo]))) continue;
      scenes = scenes.map(s => {
        if (!s.clip) return s;
        const got = clips && clipFrames(clips, s, join(out, "clips"));
        if (!got) { problems.push(`${v.id}: no clip "${s.clip}"${clips ? "" : " (no --clips folder)"}, shown as a text card`); const { clip, ...card } = s; return card; }
        return { ...s, film: got.at, frames: got.frames };
      });
      const file = join(out, v.id + ".mp4");
      const track = tracks.length ? tracks[mod.videos.indexOf(v) % tracks.length] : null;
      const frames = await renderVideo(browser, { base, scenes, theme: v.theme || "green", font, logo, qr, shots, file, music: track, lines });
      kit.ffmpeg("-i", file, "-vf", "fps=1,scale=270:-1,tile=8x" + Math.ceil(frames / FPS / 8), "-frames:v", "1", join(out, v.id + "-sheet.jpg"));
      const text = `Title: ${v.title}\n\nDescription:\n${v.description}\n\n${(v.tags || []).map(t => "#" + t).join(" ")}\n\nLength: ${length(scenes)} s. ${track ? "Music: " + track.split("/").pop() : "Silent: add music in the app when you post."}${lines.length ? ` AI voiceover (${v.voice || spoken.name || "text to speech"}): tick "altered or synthetic content" on YouTube and the AI label on Instagram and TikTok.` : ""}\n`;
      await writeFile(join(out, v.id + ".txt"), text);
      files.push(file);
      console.log("made", v.id, length(scenes) + "s");
    }
  } finally { await browser.close(); server.close(); }
  return { summary: `${files.length} of ${list.length} videos made`, files, problems };
}
