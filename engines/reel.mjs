// Reel maker: animated vertical explainers (1080×1920, 30 fps) for Shorts, Reels and TikTok, written as a short plain
// text script and drawn as code, so a new reel costs minutes and no video AI credits. Unlike `video`, it needs no
// checkout of the app: the faces, logo and font sit in apps/<app>/reels/assets/.
//
// A script is apps/<app>/reels/<id>.txt: a header of `key: value` lines (title, description (may repeat), tags, end,
// endSay, link, theme, voice, voice.<tool>, pronounce), then scenes, each after a line `---`:
//   text: the big words on screen          sub: a smaller line under them
//   show: what is drawn (see VISUALS)      say: the line read aloud, also shown as captions word by word
//   secs: the least time the scene stays (optional)
//   clip: a film clip (<name>.mp4 in the --clips folder) played full screen behind the words; clipFrom: seconds in
// Scenes are timed to the voiceover: each lasts as long as its line takes to say, and list items, ticks and stamps land
// on the word they belong to. Without --voice the reel is silent and timed at reading pace, captions included.
// --voice <command> reads each line with a text-to-speech command (`<command> <out.wav> <voice> <text>`; .mjs and .py
// commands are run with Node and Python, so it works on Windows too). The voice name comes from `voice.<tool>` in the
// script, where <tool> is the command's name after "say-" (voice.elevenlabs, voice.google, voice.kokoro), else `voice`.
// A command that also writes <out.wav>.words.json ([{ w, s, e }], as tools/say-elevenlabs.mjs does) gives exact word
// times; otherwise words are spread over the line by length. --music <folder> lays the folder's first track under it.
// Writes out/<app>/reels/<id>.mp4, <id>.txt (title, description, tags) and <id>-sheet.jpg (one frame a second).
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, readdirSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { ffmpegArgs } from "./video.mjs";
import { outPath } from "../core/util.mjs";

const FPS = 30, W = 1080, H = 1920;
const READ_RATE = 2.6, VOICE_IN = 0.35, VOICE_OUT = 0.45, FADE = 0.3;
export const VISUALS = {
  title: "the words alone, big in the middle (a hook)",
  photo: "face=<n> bg=cream|grey|light|white size=35x45mm [from=<size>] [mark=tick|cross] [on=<word>] [label=<text>] [dims=off]: a print with its size drawn on; from= turns one size into another on the word on=",
  compare: "face=<n> bg=<left>,<right> mark=<left>,<right> Left label | Right label: the same face twice",
  list: "✓ item | ✗ item | 1. item: lines that tick in as they are said",
  number: "value=\"600 × 750\" unit=\"pixels\": a number that counts up",
  strike: "text=\"PHOTO CODE\" stamp=\"Optional\" [on=<word>]: a ticket crossed out (on that word) and stamped",
};
const BG = { cream: "#efe8d6", grey: "#d9dcdf", light: "#e7edf3", white: "#ffffff", blue: "#2f5fd0" };
const THEMES = {
  navy: { bg: "radial-gradient(1100px 900px at 50% 42%, #1b3354 0%, rgba(27,51,84,0) 70%), linear-gradient(170deg, #12233b 0%, #0d1b2e 55%, #0a1524 100%)", fg: "#fff", accent: "#3ee09a" },
  green: { bg: "radial-gradient(1000px 800px at 50% 45%, rgba(255,255,255,.14), rgba(255,255,255,0) 70%), linear-gradient(160deg, #0f9159 0%, #0d8752 45%, #0a7646 100%)", fg: "#fff", accent: "#d6ffe9" },
};
const STOP = new Set("the a an and or of to in on at for with your you is it its be are can not no don't do does if as by from this that their they them".split(" "));

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const words = s => String(s || "").split(/\s+/).filter(Boolean);
const bare = w => w.toLowerCase().replace(/[^a-z0-9]/g, "");
const half = x => Math.ceil(x * 2) / 2;

// `photo face=44 bg="light grey" Some | items` → { type, args, items }
export function parseShow(line = "title") {
  const m = line.trim().match(/^(\S+)\s*(.*)$/) || [, "title", ""];
  const args = {}, rest = m[2].replace(/(\w+)=("([^"]*)"|\S+)/g, (_, k, v, q) => { args[k] = q ?? v; return ""; }).trim();
  return { type: m[1], args, items: rest ? rest.split("|").map(s => s.trim()).filter(Boolean) : [] };
}

export function parseReel(text, id) {
  const [head, ...blocks] = String(text).replace(/\r/g, "").split(/^---\s*$/m);
  const reel = { id, title: "", description: [], tags: [], voice: {}, pronounce: {}, theme: "navy", scenes: [] };
  for (const line of head.split("\n")) {
    const m = line.match(/^([\w.]+):\s?(.*)$/);
    if (!m || line.startsWith("#")) continue;
    const [, k, v] = m;
    if (k === "description") reel.description.push(v);
    else if (k === "tags") reel.tags = v.split(/[,\s]+/).map(t => t.replace(/^#/, "")).filter(Boolean);
    else if (k === "voice") reel.voice[""] = v.trim();
    else if (k.startsWith("voice.")) reel.voice[k.slice(6)] = v.trim();
    else if (k === "pronounce") for (const pair of v.split(";")) { const [w, how] = pair.split("="); if (how) reel.pronounce[w.trim()] = how.trim(); }
    else reel[k] = v.trim();
  }
  reel.description = reel.description.join("\n").trim();
  for (const b of blocks) {
    const s = {};
    for (const line of b.split("\n")) { const m = line.match(/^(text|sub|say|show|secs|clip|clipFrom):\s?(.*)$/); if (m) s[m[1]] = m[2].trim(); }
    if (!Object.keys(s).length) continue;
    reel.scenes.push({ ...s, show: parseShow(s.show), secs: s.secs ? Number(s.secs) : 0, clipFrom: s.clipFrom ? Number(s.clipFrom) : 0 });
  }
  return reel;
}

// Problems a reel would have: unknown visuals, missing faces, a scene with nothing to say, words the app never uses.
export function checkReel(r, { faces = null, neverSay = [] } = {}) {
  const p = [];
  if (!/^[a-z0-9-]+$/.test(r.id || "")) p.push(`bad id ${r.id}`);
  if (!r.title) p.push(`${r.id}: no title`);
  if (!r.scenes.length) p.push(`${r.id}: no scenes`);
  if (!THEMES[r.theme]) p.push(`${r.id}: no theme "${r.theme}"`);
  for (const s of r.scenes) {
    const name = `${r.id}: "${s.text || s.say || s.show.type}"`;
    if (!VISUALS[s.show.type]) p.push(`${name}: no visual "${s.show.type}" (${Object.keys(VISUALS).join(", ")})`);
    if (!s.say) p.push(`${name}: no say line`);
    for (const f of [s.show.args.face].filter(Boolean)) if (faces && !faces.includes(f)) p.push(`${name}: no face ${f} in assets`);
    if (["list", "compare"].includes(s.show.type) && !s.show.items.length) p.push(`${name}: ${s.show.type} with no items`);
    for (const b of String(s.show.args.bg || "").split(",").filter(Boolean)) if (!BG[b]) p.push(`${name}: no background "${b}" (${Object.keys(BG).join(", ")})`);
  }
  const all = [r.title, r.description, r.endSay, ...r.scenes.flatMap(s => [s.text, s.sub, s.say, ...s.show.items])].join(" ").toLowerCase();
  for (const w of neverSay) if (all.includes(w.toLowerCase())) p.push(`${r.id}: says "${w}"`);
  return p;
}

// Word times for a spoken line: the command's own (when it wrote them and they match the words), else spread by length.
export function spread(text, secs, from = 0) {
  const ws = words(text), weight = ws.map(w => w.length + 2), total = weight.reduce((a, b) => a + b, 0) || 1;
  let t = from;
  return ws.map((w, i) => { const d = secs * weight[i] / total, o = { w, s: t, e: t + d }; t += d; return o; });
}

// The scenes with their start (at), length (secs) and caption words on the reel's clock. `said` is per scene:
// { secs, words? } from the voice, or null when silent.
export function timeReel(r, said = [], endScene) {
  const scenes = [...r.scenes, endScene].filter(Boolean);
  let at = 0;
  return scenes.map((s, i) => {
    const v = said[i], n = words(s.say).length;
    const secs = v ? half(Math.max(s.secs || 0, VOICE_IN + v.secs + VOICE_OUT)) : half(Math.max(s.secs || 0, 1.2 + n / READ_RATE, s.end ? 3 : 0));
    const from = at + (v ? VOICE_IN : 0.25), span = v ? v.secs : n / READ_RATE;
    const w = v?.words && v.words.length === n ? v.words.map((x, j) => ({ w: words(s.say)[j], s: at + VOICE_IN + x.s, e: at + VOICE_IN + x.e }))
      : spread(s.say, span, from);
    const o = { ...s, at, secs, words: w };
    at += secs;
    return o;
  });
}
export const reelLength = scenes => scenes.reduce((a, s) => a + s.secs, 0);

// When each list item (or stamp) should land: on the first word of it that is said in the line, after the last one.
export function cueTimes(items, ws, secs, at = 0) {
  let from = 0;
  const even = i => 0.5 + (Math.max(0.6, secs - 1.2) - 0.5) * (items.length > 1 ? i / (items.length - 1) : 0);
  return items.map((it, i) => {
    const keys = words(it).map(bare).filter(k => k.length > 2 && !STOP.has(k));
    const j = ws.findIndex((w, k) => k >= from && keys.includes(bare(w.w)));
    if (j < 0) return even(i);
    from = j + 1;
    return ws[j].s - at;
  });
}

// Caption chunks: up to 4 words, or fewer at a full stop or comma, so they read in one or two short lines.
export function chunks(ws) {
  const out = [];
  let cur = [];
  for (const w of ws) {
    cur.push(w);
    if (cur.length >= 4 || /[.,?!:;]$/.test(w.w)) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out.map(c => ({ s: c[0].s, e: c[c.length - 1].e, words: c }));
}

const size = v => { const m = String(v || "35x45mm").match(/^([\d.]+)x([\d.]+)\s*(mm|in|px)?$/); return m ? { w: +m[1], h: +m[2], unit: m[3] || "mm" } : { w: 35, h: 45, unit: "mm" }; };
const dimLabel = (n, unit) => `${n} ${unit}`;
const MARK = { tick: "✓", cross: "✗", x: "✗" };

// One scene's drawing. Every element that moves has data-fx (how it comes in) and data-at (when, in seconds from the
// start of the scene); the page script plays them.
function visual(s, rel, assets) {
  const { type, args, items } = s.show, at = (t, fx, extra = "") => `data-fx="${fx}" data-at="${Math.max(0, t).toFixed(2)}"${extra}`;
  const face = n => assets.faces[n] || "";
  if (type === "photo") {
    const to = size(args.size), from = args.from ? size(args.from) : null, H0 = 700;
    const px = d => { const w = Math.round(H0 * d.w / d.h); return w > 780 ? { w: 780, h: Math.round(780 * d.h / d.w) } : { w, h: H0 }; };
    const a = px(from || to), b = px(to), morph = from ? Math.max(1.2, rel(args.on) ?? s.secs * 0.4) : 0;
    const mark = (m, t, cls = "") => m ? `<b class="mark ${m === "tick" ? "ok" : "no"} ${cls}" ${at(t, "stamp")}>${MARK[m]}</b>` : "";
    const dims = (d, cls, t) => `<div class="dim dw ${cls}" ${at(t, "draw")}><span>${esc(dimLabel(d.w, d.unit))}</span></div><div class="dim dh ${cls}" ${at(t + 0.15, "draw")}><span>${esc(dimLabel(d.h, d.unit))}</span></div>`;
    return `<div class="photo" ${at(0.1, "pop")} data-size="${a.w},${a.h},${b.w},${b.h},${morph}" style="width:${a.w}px;height:${a.h}px">
      <div class="paper" style="background:${BG[args.bg] || BG.cream}"><img src="${face(args.face)}"></div>
      ${from ? `${dims(from, "was", 0.5)}${mark("cross", 0.9, "was")}${dims(to, "", morph + 0.3)}${mark(args.mark || "tick", morph + 0.6)}`
        : `${args.dims === "off" ? "" : dims(to, "", 0.5)}${mark(args.mark, rel(args.on) ?? Math.max(1, s.secs - 1.4))}`}
      ${args.label ? `<div class="tag" ${at(1.1, "up")}>${esc(args.label)}</div>` : ""}</div>`;
  }
  if (type === "compare") {
    const bgs = String(args.bg || "white,cream").split(","), marks = String(args.mark || "cross,tick").split(","), cues = cueTimes(items, s.words, s.secs, s.at);
    return `<div class="compare">${[0, 1].map(i => `<figure ${at(cues[i] ?? 0.3 + i * 0.8, "pop")}><div class="paper" style="background:${BG[bgs[i]] || BG.cream}"><img src="${face(args.face)}"></div>
      <b class="mark ${marks[i] === "tick" ? "ok" : "no"}" ${at((cues[i] ?? 0.3 + i * 0.8) + 0.35, "stamp")}>${MARK[marks[i]] || ""}</b><figcaption>${esc(items[i] || "")}</figcaption></figure>`).join("")}</div>`;
  }
  if (type === "list") {
    const cues = cueTimes(items, s.words, s.secs, s.at);
    return `<ul class="list">${items.map((it, i) => {
      const m = it.match(/^(✓|✗|x |\d+\.)\s*(.*)$/), sign = m ? (m[1].trim() === "x" ? "✗" : m[1]) : "✓";
      return `<li ${at(cues[i] - 0.1, "slide")}><b class="${sign === "✗" ? "no" : sign === "✓" ? "ok" : "num"}">${esc(sign)}</b><span>${esc(m ? m[2] : it)}</span></li>`;
    }).join("")}</ul>`;
  }
  if (type === "number") return `<div class="number"><div class="big" ${at(0.3, "count", ` data-to="${esc(args.value || "")}"`)}>${esc(args.value || "")}</div>${args.unit ? `<div class="unit" ${at(0.7, "up")}>${esc(args.unit)}</div>` : ""}</div>`;
  if (type === "strike") return `<div class="strike"><div class="ticket" ${at(0.1, "pop")}><small>${esc(args.small || "Booth or shop")}</small><span>${esc(args.text || "PHOTO CODE")}</span><code>${esc(args.code || "K7P2 9QXM")}</code><i class="line" ${at(rel(args.on) ?? 1.1, "strike")}></i></div>
    ${args.stamp ? `<b class="stampword" ${at((rel(args.on) ?? 1.1) + 0.35, "stamp")}>${esc(args.stamp)}</b>` : ""}</div>`;
  return "";
}

function sceneHTML(s, i, assets, site) {
  // rel("word"): when that word is said in this scene, in seconds from the scene's start.
  const rel = w => { const k = bare(w || ""); const x = k && s.words.find(o => bare(o.w) === k); return x ? x.s - s.at : null; };
  const head = s.text ? `<h1 class="${s.show.type === "title" || s.end ? "big" : ""}">${words(s.text).map((w, j) => `<span data-fx="word" data-at="${(0.05 + j * 0.07).toFixed(2)}">${esc(w)}</span>`).join(" ")}</h1>` : "";
  const sub = s.sub ? `<p class="sub" data-fx="up" data-at="0.45">${esc(s.sub)}</p>` : "";
  if (s.end) return `<section class="scene end" id="s${i}"><div class="logo" data-fx="pop" data-at="0.05">${assets.logo}</div>
    <h1 class="site" data-fx="up" data-at="0.25">${esc(site)}</h1>${sub}${assets.qr ? `<div class="qr" data-fx="pop" data-at="0.6"><div>${assets.qr}</div><span>Scan to open</span></div>` : ""}</section>`;
  // A scene with a film clip plays it full screen behind the words, darkened at the top and bottom so they read.
  const film = s.frames ? `<div class="film"><img class="frame" alt=""></div>` : "", cls = s.frames ? " has-clip" : "";
  if (s.show.type === "title") return `<section class="scene hook${cls}" id="s${i}">${film}<div class="hookbox">${head}${sub}</div></section>`;
  return `<section class="scene${cls}" id="s${i}">${film}<header class="cap">${head}${sub}</header><div class="vis">${visual(s, rel, assets)}</div></section>`;
}

export function stageHTML(scenes, { theme = "navy", assets, site }) {
  const th = THEMES[theme] || THEMES.navy, caps = scenes.flatMap(s => chunks(s.words)), total = reelLength(scenes);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  ${assets.font ? `@font-face { font-family: "Brand"; src: url(${assets.font}) format("woff2"); font-weight: 200 800; }` : ""}
  * { box-sizing: border-box; } html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; }
  body { font-family: "Brand", system-ui, sans-serif; -webkit-font-smoothing: antialiased; background: ${th.bg}; color: ${th.fg}; }
  .glow { position: absolute; width: 900px; height: 900px; border-radius: 50%; background: radial-gradient(closest-side, ${th.accent}22, ${th.accent}00); }
  .bar { position: absolute; left: 0; top: 0; height: 10px; background: ${th.accent}; }
  .brandline { position: absolute; top: 96px; left: 0; right: 0; display: flex; justify-content: center; align-items: center; gap: 16px; font-size: 40px; font-weight: 800; letter-spacing: -0.02em; }
  .brandline svg { width: 64px; height: 64px; } .brandline em { font-style: normal; color: ${th.accent}; }
  .scene { position: absolute; inset: 0; opacity: 0; }
  [data-fx] { opacity: 0; display: inline-block; }
  .cap { position: absolute; left: 70px; right: 70px; top: 230px; height: 260px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  h1 { margin: 0; font-size: 84px; line-height: 1.06; font-weight: 800; letter-spacing: -0.03em; text-wrap: balance; }
  h1.big { font-size: 112px; }
  .sub { margin: 24px 0 0; font-size: 46px; line-height: 1.25; font-weight: 600; color: ${th.accent}; text-wrap: balance; display: block; }
  .hookbox { position: absolute; left: 70px; right: 70px; top: 420px; height: 760px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  .hook .sub { font-size: 58px; margin-top: 40px; }
  .vis { position: absolute; left: 0; right: 0; top: 520px; height: 760px; display: flex; justify-content: center; align-items: center; }
  .paper { position: absolute; inset: 0; overflow: hidden; border-radius: 6px; }
  .paper img { position: absolute; left: 50%; bottom: 0; height: 100%; transform: translateX(-50%); }
  .photo { position: relative; display: block; background: #fff; padding: 0; border: 16px solid #fff; border-radius: 14px; box-shadow: 0 40px 80px -30px rgba(0,0,0,.6); }
  .photo .paper { inset: 0; }
  .dim { position: absolute; display: block; color: ${th.accent}; font-size: 40px; font-weight: 800; }
  .dw { left: -16px; right: -16px; bottom: -86px; height: 4px; background: ${th.accent}; transform-origin: center; }
  .dh { top: -16px; bottom: -16px; right: -66px; width: 4px; background: ${th.accent}; transform-origin: center; }
  .dw::before, .dw::after, .dh::before, .dh::after { content: ""; position: absolute; background: ${th.accent}; }
  .dw::before, .dw::after { width: 4px; height: 30px; top: -13px; } .dw::before { left: 0; } .dw::after { right: 0; }
  .dh::before, .dh::after { height: 4px; width: 30px; left: -13px; } .dh::before { top: 0; } .dh::after { bottom: 0; }
  .dw span { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); white-space: nowrap; }
  .dh span { position: absolute; top: 50%; left: 22px; transform: translateY(-50%); white-space: nowrap; }
  .mark { position: absolute; right: -40px; top: -40px; width: 130px; height: 130px; border-radius: 50%; display: flex !important; align-items: center; justify-content: center; font-size: 84px; font-weight: 800; color: #fff; box-shadow: 0 16px 30px -10px rgba(0,0,0,.5); }
  .mark.ok { background: #12a467; } .mark.no { background: #e0483e; }
  .tag { position: absolute; left: 50%; bottom: 40px; transform: translateX(-50%); white-space: nowrap; padding: 14px 30px; border-radius: 999px; background: #0d1b2e; color: #fff; font-size: 38px; font-weight: 700; }
  .compare { display: flex; gap: 60px; }
  .compare figure { position: relative; margin: 0; width: 400px; display: block; }
  .compare .paper { position: relative; height: 500px; border: 12px solid #fff; border-radius: 12px; box-shadow: 0 30px 60px -25px rgba(0,0,0,.6); }
  .compare .mark { width: 110px; height: 110px; font-size: 70px; right: -30px; top: -30px; }
  .compare figcaption { margin-top: 34px; text-align: center; font-size: 44px; font-weight: 700; }
  .list { list-style: none; margin: 0; padding: 0 90px; width: 100%; display: flex; flex-direction: column; gap: 34px; }
  .list li { display: flex !important; align-items: center; gap: 30px; font-size: 54px; font-weight: 700; line-height: 1.15; padding: 26px 34px; border-radius: 28px; background: rgba(255,255,255,.08); }
  .list b { flex: 0 0 92px; height: 92px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 56px; color: #fff; }
  .list b.ok { background: #12a467; } .list b.no { background: #e0483e; } .list b.num { background: ${th.accent}; color: #0d1b2e; }
  .number { text-align: center; } .number .big { display: block; font-size: 190px; font-weight: 800; letter-spacing: -0.04em; color: ${th.accent}; font-variant-numeric: tabular-nums; }
  .number .unit { display: block; font-size: 60px; font-weight: 700; margin-top: 10px; }
  .strike { position: relative; } .ticket { position: relative; display: block; width: 760px; padding: 50px 60px; border-radius: 30px; background: #fff; color: #0d1b2e; text-align: center; box-shadow: 0 40px 80px -30px rgba(0,0,0,.6); }
  .ticket small { display: block; font-size: 38px; font-weight: 600; opacity: .6; } .ticket span { display: block; font-size: 96px; font-weight: 800; letter-spacing: -0.02em; }
  .ticket code { display: block; margin-top: 10px; font: 700 64px ui-monospace, monospace; letter-spacing: .12em; opacity: .75; }
  .ticket .line { position: absolute; left: 30px; right: 30px; top: 50%; height: 16px; border-radius: 8px; background: #e0483e; transform-origin: left center; transform: rotate(-8deg); display: block; }
  .stampword { position: absolute; left: 50%; bottom: -120px; padding: 18px 44px; border: 8px solid ${th.accent}; border-radius: 22px; color: ${th.accent}; font-size: 72px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
  .end { display: flex; flex-direction: column; align-items: center; justify-content: center; padding-bottom: 380px; text-align: center; }
  .end .logo svg { width: 230px; height: 230px; filter: drop-shadow(0 16px 30px rgba(0,0,0,.35)); }
  .end .site { margin-top: 44px; font-size: 84px; }
  .qr { margin-top: 50px; width: 300px; padding: 18px 18px 10px; background: #fff; border-radius: 28px; }
  .qr div { width: 264px; height: 264px; } .qr span { display: block; color: #0b3a26; font-size: 30px; font-weight: 700; }
  .film { position: absolute; top: 0; bottom: 0; left: -90px; right: -90px; overflow: hidden; background: #000; }
  .film .frame { width: 100%; height: 100%; object-fit: cover; }
  .film::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(5,12,22,.72) 0%, rgba(5,12,22,.25) 34%, rgba(5,12,22,0) 50%, rgba(5,12,22,.2) 62%, rgba(5,12,22,.78) 100%); }
  .has-clip h1, .has-clip .sub { text-shadow: 0 4px 26px rgba(0,0,0,.55); }
  .has-clip .list li { background: rgba(5,12,22,.66); }
  .has-clip .sub { padding: 10px 28px; border-radius: 999px; background: rgba(5,12,22,.62); text-shadow: none; }
  .has-clip .hookbox { top: 170px; height: 560px; }
  .brandline, .bar { z-index: 50; } .captions { z-index: 50; }
  .captions { position: absolute; left: 80px; right: 80px; top: 1340px; height: 220px; display: flex; align-items: center; justify-content: center; text-align: center; }
  .chunk { position: absolute; opacity: 0; font-size: 64px; font-weight: 800; line-height: 1.15; letter-spacing: -0.015em; text-wrap: balance; text-shadow: 0 4px 18px rgba(0,0,0,.45); }
  .chunk i { font-style: normal; opacity: .55; } .chunk i.on { opacity: 1; } .chunk i.now { color: ${th.accent}; }
  </style></head><body>
  <div class="glow" id="glow"></div><div class="bar" id="bar"></div>
  <div class="brandline">${assets.logo}<span><em>Pic</em>proved</span></div>
  ${scenes.map((s, i) => sceneHTML(s, i, assets, site)).join("")}
  <div class="captions">${caps.map((c, i) => `<div class="chunk" id="c${i}">${c.words.map(w => `<i>${esc(w.w)}</i>`).join(" ")}</div>`).join("")}</div>
  <script>
  const S = ${JSON.stringify(scenes.map(s => ({ at: s.at, secs: s.secs, frames: s.frames || 0 })))}, C = ${JSON.stringify(caps.map(c => ({ s: c.s, e: c.e, w: c.words.map(w => w.s) })))}, T = ${total};
  const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3);
  const back = x => { x = Math.min(1, Math.max(0, x)); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const els = S.map((_, i) => document.getElementById("s" + i)), cs = C.map((_, i) => document.getElementById("c" + i));
  const FX = {
    word: (e, p) => { e.style.opacity = ease(p * 1.6); e.style.transform = "translateY(" + (1 - ease(p)) * 40 + "px)"; },
    up: (e, p) => { e.style.opacity = ease(p * 1.4); e.style.transform = (e.classList.contains("tag") ? "translateX(-50%) " : "") + "translateY(" + (1 - ease(p)) * 40 + "px)"; },
    pop: (e, p) => { e.style.opacity = ease(p * 2); e.style.transform = "scale(" + (0.7 + 0.3 * back(p)) + ")"; },
    slide: (e, p) => { e.style.opacity = ease(p * 1.5); e.style.transform = "translateX(" + (1 - ease(p)) * 90 + "px)"; },
    draw: (e, p) => { e.style.opacity = p > 0 ? 1 : 0; e.style.transform = (e.classList.contains("dh") ? "scaleY(" : "scaleX(") + ease(p) + ")"; },
    stamp: (e, p) => { e.style.opacity = ease(p * 2.5); e.style.transform = (e.classList.contains("stampword") ? "translateX(-50%) " : "") + "scale(" + (1.8 - 0.8 * ease(p)) + ") rotate(" + (e.classList.contains("stampword") ? -8 : -12 + 12 * ease(p)) + "deg)"; },
    strike: (e, p) => { e.style.opacity = p > 0 ? 1 : 0; e.style.transform = "rotate(-8deg) scaleX(" + ease(p) + ")"; },
    count: (e, p) => { e.style.opacity = ease(p * 3); const to = e.dataset.to, q = ease(p * 0.9);
      e.textContent = to.replace(/\\d+/g, n => String(Math.round(+n * q))); },
  };
  const DUR = { word: 0.35, up: 0.45, pop: 0.5, slide: 0.4, draw: 0.5, stamp: 0.35, strike: 0.4, count: 1.1 };
  // A clip scene shows frame n of its clip (/__clip/<scene>/<n>.jpg), waiting until it is drawn, with a slow push in.
  const film = async (el, i, s, u) => {
    const img = el.querySelector(".frame"), n = Math.min(s.frames - 1, Math.max(0, Math.floor(u * ${FPS})));
    img.style.transform = "scale(" + (1.02 + 0.06 * Math.min(1, u / s.secs)) + ")";
    if (img.dataset.n === String(n)) return;
    img.dataset.n = n; img.src = "/__clip/" + i + "/" + n + ".jpg";
    await img.decode();
  };
  window.render = async t => {
    const wait = [];
    document.getElementById("bar").style.width = (t / T * 100) + "%";
    const g = document.getElementById("glow"); g.style.left = (90 + 160 * Math.sin(t / 3)) + "px"; g.style.top = (520 + 140 * Math.cos(t / 4)) + "px";
    S.forEach((s, i) => {
      const el = els[i], u = t - s.at, last = i === S.length - 1;
      const inn = i === 0 ? 1 : ease(u / ${FADE}), out = last ? 1 : 1 - ease((u - s.secs) / ${FADE});
      const vis = u >= 0 && (u < s.secs + ${FADE} || last);
      el.style.opacity = vis ? Math.min(inn, out) : 0;
      el.style.transform = vis ? "translateX(" + ((1 - inn) * 60 - (1 - out) * 60) + "px)" : "";
      if (!vis) return;
      if (s.frames) wait.push(film(el, i, s, Math.max(0, u)));
      el.querySelectorAll("[data-fx]").forEach(e => FX[e.dataset.fx](e, (u - +e.dataset.at) / DUR[e.dataset.fx]));
      const ph = el.querySelector(".photo");
      if (ph) { const [aw, ah, bw, bh, m] = ph.dataset.size.split(",").map(Number), q = m ? ease((u - m) / 0.6) : 0;
        ph.style.width = aw + (bw - aw) * q + "px"; ph.style.height = ah + (bh - ah) * q + "px";
        ph.querySelectorAll(".was").forEach(e => { if (q > 0) e.style.opacity = Math.min(+e.style.opacity, 1 - q); });
        ph.style.transform = (ph.style.transform || "") + " scale(" + (1 + 0.025 * Math.min(1, u / s.secs)) + ")"; }
    });
    C.forEach((c, i) => {
      const next = C[i + 1] ? C[i + 1].s : Infinity, on = t >= c.s - 0.05 && t < Math.min(next - 0.05, c.e + 0.8);
      cs[i].style.opacity = on ? 1 : 0;
      if (on) [...cs[i].children].forEach((w, j) => { const a = t >= c.w[j] - 0.02, b = a && (j === c.w.length - 1 || t < c.w[j + 1] - 0.02); w.className = a ? (b ? "on now" : "on") : ""; });
    });
    await Promise.all(wait);
  };
  window.ready = Promise.all([...document.images].filter(i => i.src).map(i => i.decode())).then(() => document.fonts.ready);
  </script></body></html>`;
}

// How to run a text-to-speech command on any system: Node for .mjs/.js, Python for .py, else as it is.
function sayCommand(cmd) {
  if (/\.(mjs|js)$/i.test(cmd)) return [process.execPath, [cmd]];
  if (/\.py$/i.test(cmd)) return [process.platform === "win32" ? "python" : "python3", [cmd]];
  return [cmd, []];
}
// A scene's clip as JPEG frames at the reel's frame rate, from clipFrom for as long as the scene (or the clip) lasts;
// a clip shorter than its scene plays slower, down to half speed, then holds its last frame.
function clipFrames(src, s, dir) {
  const file = join(src, s.clip + ".mp4");
  if (!existsSync(file)) return null;
  const at = join(dir, `${s.clip}-${s.clipFrom || 0}-${s.secs}`);
  if (!existsSync(join(at, "0.jpg"))) {
    mkdirSync(at, { recursive: true });
    const slow = Math.min(2, Math.max(1, s.secs / (probe(file) - (s.clipFrom || 0))));
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(s.clipFrom || 0), "-i", file, "-t", String(s.secs / slow), "-vf", `setpts=${slow.toFixed(3)}*PTS,fps=${FPS},scale=1260:-2`, "-q:v", "2", "-start_number", "0", join(at, "%d.jpg")]);
  }
  return { at, frames: readdirSync(at).filter(f => f.endsWith(".jpg")).length };
}
const probe = file => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString());

// One spoken line as a WAV, kept in out/<app>/reels/voice/ so a re-run only speaks changed lines.
function speak(cmd, name, pronounce, text, dir) {
  const said = Object.entries(pronounce).reduce((t, [w, how]) => t.replace(new RegExp(`\\b${w}\\b`, "g"), how), text);
  const file = join(dir, createHash("sha1").update(`${cmd}\n${name}\n${said}`).digest("hex").slice(0, 16) + ".wav");
  const [bin, pre] = sayCommand(cmd);
  if (!existsSync(file)) execFileSync(bin, [...pre, file, name || "", said], { stdio: ["ignore", "ignore", "inherit"] });
  let ws = null;
  try { ws = JSON.parse(readFileSync(file + ".words.json", "utf8")); } catch {}
  return { file, secs: probe(file), words: said === text ? ws : null };
}

async function assetsFor(app) {
  const dir = join(app.dir, "reels", "assets"), faces = {}, files = existsSync(dir) ? await readdir(dir) : [];
  for (const f of files) { const m = f.match(/^face-(\w+)\.(webp|png|jpg)$/); if (m) faces[m[1]] = `data:image/${m[2] === "jpg" ? "jpeg" : m[2]};base64,${(await readFile(join(dir, f))).toString("base64")}`; }
  const font = files.find(f => f.endsWith(".woff2"));
  const svg = async f => existsSync(f) ? (await readFile(f, "utf8")).replace(/<\?xml[^>]*>/, "") : "";
  return {
    faces, font: font ? `data:font/woff2;base64,${(await readFile(join(dir, font))).toString("base64")}` : null,
    logo: await svg(join(dir, "logo.svg")),
    qr: (await svg(join(app.dir, "qr-video.svg"))).replace(/width="(\d+)" height="(\d+)"/, 'viewBox="0 0 $1 $2" width="100%" height="100%"'),
  };
}

export async function loadReels(app) {
  const dir = join(app.dir, "reels");
  if (!existsSync(dir)) return [];
  const names = (await readdir(dir)).filter(f => f.endsWith(".txt")).sort();
  return Promise.all(names.map(async f => parseReel(await readFile(join(dir, f), "utf8"), f.replace(/\.txt$/, ""))));
}

export async function run(app, { only, music, voice, clips } = {}) {
  const all = await loadReels(app), list = all.filter(r => !only || r.id === only);
  if (!list.length) return { summary: only ? `no reel called ${only}` : "no reels in apps/" + app.name + "/reels", files: [], problems: [] };
  const assets = await assetsFor(app);
  const problems = list.flatMap(r => checkReel(r, { faces: Object.keys(assets.faces), neverSay: app.config.neverSay }));
  const { chromium } = createRequire(import.meta.url)("playwright");
  const out = outPath(app.name, "reels"), said = join(out, "voice");
  await mkdir(said, { recursive: true });
  const tracks = music ? (await readdir(music)).filter(f => /\.(mp3|m4a|wav|ogg)$/i.test(f)).sort().map(f => join(music, f)) : [];
  const tool = voice ? basename(voice).replace(/\.\w+$/, "").replace(/^say-/, "") : "";
  const browser = await chromium.launch(), files = [];
  try {
    for (const r of list) {
      const site = r.end || String(app.config.site || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
      const end = { end: true, text: site, sub: r.endSub || "Link in the description", say: r.endSay || "Link in the description.", show: { type: "end", args: {}, items: [] }, secs: 3 };
      const lines = [...r.scenes, end];
      const voices = voice ? lines.map(s => speak(voice, r.voice[tool] ?? r.voice[""] ?? "", r.pronounce, s.say, said)) : [];
      const scenes = timeReel(r, voices, end), total = reelLength(scenes);
      if (total > 59) problems.push(`${r.id}: ${total}s, over a minute`);
      for (const s of scenes.filter(s => s.clip)) {
        const got = clips && clipFrames(clips, s, join(out, "clips"));
        if (got) Object.assign(s, { film: got.at, frames: got.frames });
        else problems.push(`${r.id}: no clip "${s.clip}"${clips ? "" : " (no --clips folder)"}, drawn without it`);
      }
      const html = stageHTML(scenes, { theme: r.theme, assets, site });
      const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
      // The page asks for /__clip/<scene>/<n>.jpg: the clip's frames, cut out by ffmpeg.
      await page.route("http://reel.local/**", async route => {
        const m = new URL(route.request().url()).pathname.match(/^\/__clip\/(\d+)\/(\d+)\.jpg$/);
        if (m) return route.fulfill({ contentType: "image/jpeg", body: await readFile(join(scenes[m[1]].film, m[2] + ".jpg")) });
        route.fulfill({ contentType: "text/html", body: html });
      });
      await page.goto("http://reel.local/");
      await page.evaluate(() => window.ready);
      const file = join(out, r.id + ".mp4"), track = tracks.length ? tracks[all.indexOf(r) % tracks.length] : null;
      const spoken = voices.map((v, i) => ({ file: v.file, at: scenes[i].at + VOICE_IN }));
      const ff = spawn("ffmpeg", ffmpegArgs(file, total, track, spoken), { stdio: ["pipe", "inherit", "inherit"] });
      const done = new Promise((ok, no) => ff.on("close", c => c ? no(new Error("ffmpeg exited " + c)) : ok()));
      const frames = Math.round(total * FPS);
      for (let f = 0; f < frames; f++) {
        await page.evaluate(t => window.render(t), f / FPS);
        const jpg = await page.screenshot({ type: "jpeg", quality: 92 });
        if (!ff.stdin.write(jpg)) await new Promise(ok => ff.stdin.once("drain", ok));
      }
      ff.stdin.end();
      await done;
      await page.context().close();
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-vf", `fps=1,scale=270:-1,tile=8x${Math.ceil(total / 8)}`, "-frames:v", "1", join(out, r.id + "-sheet.jpg")]);
      const tags = r.tags.map(t => "#" + t).join(" ");
      await writeFile(join(out, r.id + ".txt"), `Title: ${r.title}\n\nDescription:\n${r.description}\n\n${tags}\n\nLength: ${total} s. ${track ? "Music: " + basename(track) + ". " : ""}${voices.length
        ? `AI voiceover (${tool}${r.voice[tool] || r.voice[""] ? " " + (r.voice[tool] || r.voice[""]) : ""}): tick "altered or synthetic content" on YouTube and the AI label on Instagram and TikTok.` : "Silent with captions: add a voice or music in the app when posting."}\n`);
      files.push(file);
      console.log("made", r.id, total + "s");
    }
  } finally { await browser.close(); }
  return { summary: `${files.length} of ${list.length} reels made`, files, problems };
}
