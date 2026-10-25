#!/usr/bin/env node
// node bin/autopilot.mjs <engine> --app <name> [--all] [--live] [--days 90] [--only <video id>] [--music <folder>] [--voice <tts command>] [--clips <folder>]
// Engines write to out/<app>/ and keep what they need to remember in state/<app>/. Nothing is posted or emailed
// without --live.
import { loadApp, listApps } from "../core/app.mjs";

const ENGINES = ["check", "seasons", "post-bank", "publish", "rule-watch", "launch-kit", "llms-txt", "indexnow", "search-ideas", "search-opportunities", "reply-drafts", "weekly-report", "video"];
const args = process.argv.slice(2), engine = args[0];
const flag = n => args.includes("--" + n);
const opt = n => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : undefined; };

if (!ENGINES.includes(engine)) {
  console.log(`Usage: node bin/autopilot.mjs <engine> --app <name> | --all [--live]\nEngines: ${ENGINES.join(", ")}\nApps: ${(await listApps()).join(", ")}`);
  process.exit(engine ? 1 : 0);
}
const apps = flag("all") ? await listApps() : [opt("app")].filter(Boolean);
if (!apps.length) { console.error("Say which app: --app <name> or --all"); process.exit(1); }

const { run } = await import(`../engines/${engine}.mjs`);
let failed = false;
for (const name of apps) {
  try {
    const r = await run(await loadApp(name), { live: flag("live"), days: opt("days") ? Number(opt("days")) : undefined, only: opt("only"), music: opt("music"), voice: opt("voice"), clips: opt("clips") });
    console.log(`\n== ${engine} · ${name}: ${r.summary}`);
    if (r.text && !flag("quiet")) console.log(r.text);
    for (const f of r.files || []) console.log("wrote " + f);
    for (const p of r.problems || []) console.log("! " + p);
    if (engine === "check" && r.problems?.length) failed = true;
  } catch (e) {
    console.error(`\n== ${engine} · ${name} failed: ${e.message}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
