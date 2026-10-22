// Monday report: last week's sales by country, search clicks, Play rating and reviews, what's in season, and the
// three things to do this week. Each source that isn't connected yet shows as one "switch on" line.
import { paddleSales, searchConsole, playReviews } from "../core/sources.mjs";
import { inSeason } from "./seasons.mjs";
import { pick } from "./search-opportunities.mjs";
import { send } from "../core/mail.mjs";
import { writeText, outPath, today } from "../core/util.mjs";

const money = m => Object.entries(m).map(([c, v]) => `${c} ${v.toFixed(2)}`).join(" + ");

export async function gather(app, { env = process.env, fetchers = {} } = {}) {
  const f = { paddle: paddleSales, searchConsole, play: playReviews, ...fetchers };
  const want = app.config.report?.sources || [];
  const data = {}, off = [];
  const tryIt = async (name, fn) => { if (!want.includes(name)) return; try { data[name] = await fn(); } catch (e) { off.push(`${name}: ${e.message}`); } };
  await tryIt("paddle", () => f.paddle(app.config, { env }));
  await tryIt("searchConsole", () => f.searchConsole(app.config, { dimension: "page", env }));
  await tryIt("play", () => f.play(app.config, { env }));
  return { data, off };
}

export function compose(app, items, { data, off }, date = new Date()) {
  const m = date.getUTCMonth() + 1, next = (m % 12) + 1;
  const now = inSeason(app.config, items, m), soon = inSeason(app.config, items, next);
  const s = [`# ${app.config.name}: week to ${today(date)}`], todo = [];
  if (data.paddle) {
    const rows = Object.entries(data.paddle.byCountry).sort((a, b) => b[1].sales - a[1].sales);
    s.push(`## Sales: ${data.paddle.count}\n\n` + (rows.map(([c, v]) => `- ${c}: ${v.sales} (${money(v.money)})`).join("\n") || "- none"));
  }
  if (data.searchConsole) {
    const rows = data.searchConsole, clicks = rows.reduce((a, r) => a + r.clicks, 0), views = rows.reduce((a, r) => a + r.impressions, 0);
    const top = [...rows].sort((a, b) => b.clicks - a.clicks).slice(0, 5);
    s.push(`## Google: ${clicks} clicks from ${views} views\n\n` + top.map(r => `- ${r.key}: ${r.clicks} clicks`).join("\n"));
    const o = pick(rows)[0];
    if (o) todo.push(`Rewrite the title of ${o.key}: ${o.impressions} people saw it, ${(o.ctr * 100).toFixed(1)}% clicked.`);
  }
  if (data.play) {
    const r = data.play, rated = r.filter(x => x.stars), avg = rated.length ? rated.reduce((a, x) => a + x.stars, 0) / rated.length : null;
    const open = r.filter(x => !x.answered && x.text);
    s.push(`## Play reviews this week: ${r.length}${avg ? `, average ${avg.toFixed(1)}★` : ""}`);
    if (open.length) todo.push(`Approve ${open.length} review replies (out/${app.name}/reply-drafts.md).`);
  }
  s.push(`## Season\n\nThis month: ${now.active.join("; ") || "nothing special"}.\nNext month: ${soon.active.join("; ") || "nothing special"}.`);
  if (soon.items.size) todo.push(`Get next month's ${soon.items.size} in-season items ready: ${[...soon.items.keys()].slice(0, 5).join(", ")}.`);
  if (off.length) s.push(`## Not switched on yet\n\n` + off.map(x => "- " + x).join("\n"));
  s.splice(1, 0, `## This week\n\n` + (todo.slice(0, 3).map((t, i) => `${i + 1}. ${t}`).join("\n") || "Nothing urgent."));
  return s.join("\n\n");
}

export async function run(app, { env = process.env, live = false, fetchers, date = new Date() } = {}) {
  const text = compose(app, await app.items(), await gather(app, { env, fetchers }), date);
  const file = await writeText(outPath(app.name, `report-${today(date)}.md`), text + "\n");
  let mail = { sent: false, why: "dry run" };
  if (live) {
    const to = String(app.config.report?.to || "").replace(/^env:(.*)$/, (_, k) => env[k] || "");
    mail = await send({ to, subject: `${app.config.name} weekly report`, text, env });
  }
  return { summary: `report written${mail.sent ? " and emailed" : ` (not emailed: ${mail.why})`}`, text, files: [file], problems: [] };
}
