// Monday report: last week's sales by country, website visits, search clicks, Play rating and reviews, what's in season, and the
// three things to do this week. Each source that isn't connected yet shows as one "switch on" line.
import { paddleSales, searchConsole, searchWeek, indexStatus, playReviews, webVisits } from "../core/sources.mjs";
import { inSeason } from "./seasons.mjs";
import { pick } from "./search-opportunities.mjs";
import { send } from "../core/mail.mjs";
import { writeText, outPath, statePath, readJson, today } from "../core/util.mjs";
import { blocked, html as checklistHtml } from "./blocked-checklist.mjs";

const money = m => Object.entries(m).map(([c, v]) => `${c} ${v.toFixed(2)}`).join(" + ");

export async function gather(app, { env = process.env, fetchers = {} } = {}) {
  const f = { paddle: paddleSales, searchConsole, searchWeek, indexStatus, play: playReviews, webVisits, ...fetchers };
  const want = app.config.report?.sources || [];
  const data = {}, off = [];
  const tryIt = async (name, fn) => { if (!want.includes(name)) return; try { data[name] = await fn(); } catch (e) { off.push(`${name}: ${e.message}`); } };
  await tryIt("paddle", () => f.paddle(app.config, { env }));
  await tryIt("webVisits", () => f.webVisits(app.config, { env }));
  await tryIt("searchConsole", () => f.searchConsole(app.config, { dimension: "page", env }));
  // The week-on-week view and indexing ride on the same Search Console access; either can fail on its own.
  if (data.searchConsole) {
    try { data.searchWeek = await f.searchWeek(app.config, { env }); } catch (e) { off.push(`search week: ${e.message}`); }
    try { data.index = await f.indexStatus(app.config, { env }); } catch (e) { off.push(`indexing: ${e.message}`); }
  }
  await tryIt("play", () => f.play(app.config, { env }));
  const rules = await readJson(statePath(app.name, "rule-proposals.json"), null);
  if (rules) data.rules = rules;
  const focus = app.config.focus;
  if (focus && data.paddle) await tryIt("focus", () => f.paddle(app.config, { env, since: focus.from }));
  return { data, off };
}

// The audience the app is aiming at first (app.json "focus"): orders from that country for those documents since the
// focus began, against the target to reach by the review date.
export function focusLine(focus, orders, date = new Date()) {
  const n = orders.filter(o => o.country === focus.country && focus.docs.some(d => o.doc.startsWith(d))).length;
  const left = Math.ceil((new Date(focus.review) - date) / (7 * 864e5));
  const head = `## Focus: ${focus.name}: ${n} of ${focus.target} orders since ${focus.from}`;
  if (left > 0) return { n, text: `${head}\n\nReview on ${focus.review}, ${left} week${left === 1 ? "" : "s"} left.` };
  return { n, due: true, text: `${head}\n\nReview is due (${focus.review}). ${n >= focus.target ? "Target reached: keep the focus." : `Under target: ${focus.else}.`}` };
}

// "24 clicks (19, +26%)": this week, then the week before and the change. Position: lower is better.
export function searchTotals(now, before) {
  const pct = (a, b) => b ? `${a >= b ? "+" : ""}${Math.round((a - b) / b * 100)}%` : "new";
  const n = (label, a, b) => `- ${label}: ${a} (${b}, ${pct(a, b)})`;
  const ctr = x => (x * 100).toFixed(1) + "%", pos = x => x ? x.toFixed(1) : "none";
  const moved = now.position && before.position ? (now.position < before.position ? ", better" : now.position > before.position ? ", worse" : "") : "";
  return [n("Clicks", now.clicks, before.clicks), n("Views", now.impressions, before.impressions),
    `- Click rate: ${ctr(now.ctr)} (${ctr(before.ctr)})`, `- Average position: ${pos(now.position)} (${pos(before.position)}${moved})`].join("\n");
}

export function indexText({ sitemaps, pages }, path = u => u) {
  const maps = sitemaps.map(m => `- ${path(m.path)}: ${m.submitted} pages sent${m.indexed ? `, ${m.indexed} indexed` : ""}${m.errors ? `, ${m.errors} errors` : ""}${m.read ? `, last read ${m.read.slice(0, 10)}` : ""}`);
  const list = pages.map(p => `- ${path(p.url)}: ${p.state}${p.crawled ? `, crawled ${p.crawled}` : ""}`);
  return `## Indexing\n\n${maps.join("\n") || "- no sitemap submitted"}${list.length ? `\n\nKey pages:\n${list.join("\n")}` : ""}`;
}

export function compose(app, items, { data, off }, date = new Date()) {
  const m = date.getUTCMonth() + 1, next = (m % 12) + 1;
  const now = inSeason(app.config, items, m), soon = inSeason(app.config, items, next);
  const s = [`# ${app.config.name}: week to ${today(date)}`], todo = [];
  if (data.paddle) {
    const rows = Object.entries(data.paddle.byCountry).sort((a, b) => b[1].sales - a[1].sales);
    s.push(`## Sales: ${data.paddle.count}\n\n` + (rows.map(([c, v]) => `- ${c}: ${v.sales} (${money(v.money)})`).join("\n") || "- none"));
  }
  if (data.webVisits) {
    const w = data.webVisits, list = rows => rows.slice(0, 5).map(r => `${r.key} ${r.views}`).join(", ") || "none";
    s.push(`## Website: ${w.visits} visits, ${w.views} page views\n\n- Top pages: ${list(w.pages)}\n- Countries: ${list(w.countries)}`);
  }
  if (data.searchConsole) {
    const rows = data.searchConsole, w = data.searchWeek;
    const top = [...rows].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 10);
    const path = u => u.replace(/^https?:\/\/[^/]+/, "") || "/";
    const list = r => `- ${r.key.startsWith("http") ? path(r.key) : r.key}: ${r.clicks} clicks, ${r.impressions} views, position ${r.position.toFixed(1)}`;
    if (w) {
      const t = searchTotals(w.now, w.before);
      s.push(`## Google search, ${w.from} to ${w.to} (week before in brackets)

${t}

Top searches:
${w.queries.map(list).join("\n") || "- none yet"}

Top pages:
${top.map(list).join("\n") || "- none yet"}`);
    } else {
      const clicks = rows.reduce((a, r) => a + r.clicks, 0), views = rows.reduce((a, r) => a + r.impressions, 0);
      s.push(`## Google: ${clicks} clicks from ${views} views\n\n` + top.slice(0, 5).map(r => `- ${r.key}: ${r.clicks} clicks`).join("\n"));
    }
    if (data.index) s.push(indexText(data.index, path));
    const o = pick(rows)[0];
    if (o) todo.push(`Rewrite the title of ${o.key}: ${o.impressions} people saw it, ${(o.ctr * 100).toFixed(1)}% clicked.`);
    const missing = (data.index?.pages || []).filter(p => /not indexed|unknown to google|discovered/i.test(p.state));
    if (missing.length) todo.push(`Ask Google to index ${missing.length} page${missing.length === 1 ? "" : "s"} (Search Console, URL inspection, Request indexing): ${missing.slice(0, 3).map(p => path(p.url)).join(", ")}.`);
  }
  if (data.play) {
    const r = data.play, rated = r.filter(x => x.stars), avg = rated.length ? rated.reduce((a, x) => a + x.stars, 0) / rated.length : null;
    const open = r.filter(x => !x.answered && x.text);
    s.push(`## Play reviews this week: ${r.length}${avg ? `, average ${avg.toFixed(1)}★` : ""}`);
    if (open.length) todo.push(`Approve ${open.length} review replies (out/${app.name}/reply-drafts.md).`);
  }
  if (app.config.focus && data.focus) {
    const f = focusLine(app.config.focus, data.focus.orders || [], date);
    s.push(f.text);
    if (f.due) todo.unshift(`Decide the focus: ${f.n} of ${app.config.focus.target} ${app.config.focus.name} orders.`);
  }
  const rules = data.rules, fresh = rules && (date - new Date(rules.date)) / 864e5 < 7;
  if (fresh && (rules.proposals.length || rules.notes.length)) {
    const p = rules.proposals.map(x => `- ${x.label}: ${x.ids.join(", ")}. ${x.branch ? `Branch ${x.branch} in the app's repository.` : x.patch ? `Patch ${x.patch} in marketing-autopilot.` : `No patch (${x.error}).`}\n  ${x.summary.split("\n").filter(l => /^- /.test(l)).slice(0, 6).join("\n  ")}`);
    const n = rules.notes.map(x => `- ${x.label} (${x.url}): ${x.why}`);
    s.push(`## Official rule changes\n\n` + [p.length ? `Proposed fixes (not merged; say "go" to fold them into the next release):\n\n${p.join("\n")}` : "", n.length ? `To read by hand:\n\n${n.join("\n")}` : ""].filter(Boolean).join("\n\n"));
    if (rules.proposals.length) todo.unshift(`Check ${rules.proposals.length} proposed rule fix${rules.proposals.length === 1 ? "" : "es"} (${rules.proposals.flatMap(x => x.ids).slice(0, 4).join(", ")}) and say go.`);
  }
  s.push(`## Season\n\nThis month: ${now.active.join("; ") || "nothing special"}.\nNext month: ${soon.active.join("; ") || "nothing special"}.`);
  if (soon.items.size) todo.push(`Get next month's ${soon.items.size} in-season items ready: ${[...soon.items.keys()].slice(0, 5).join(", ")}.`);
  if (off.length) s.push(`## Not switched on yet\n\n` + off.map(x => "- " + x).join("\n"));
  s.splice(1, 0, `## This week\n\n` + (todo.slice(0, 3).map((t, i) => `${i + 1}. ${t}`).join("\n") || "Nothing urgent."));
  return s.join("\n\n");
}

// The first report of each month carries the checklist of official pages the cloud can't open.
export const checklistDue = date => date.getUTCDate() <= 7;

export async function run(app, { env = process.env, live = false, fetchers, date = new Date() } = {}) {
  let text = compose(app, await app.items(), await gather(app, { env, fetchers }), date);
  const attachments = [];
  if (checklistDue(date)) {
    const pages = await blocked(app);
    if (pages.length) {
      const page = checklistHtml(app, pages, today(date));
      await writeText(outPath(app.name, "blocked-checklist.html"), page);
      attachments.push({ name: `${app.name}-pages-to-check-${today(date)}.html`, content: page });
      text += `\n\n## Pages to check by hand\n\n${pages.length} official pages block the cloud robot. The attached checklist lists each with the values the app uses: open it on your computer, tick Same or Changed, and paste the answers to Claude.`;
    }
  }
  const file = await writeText(outPath(app.name, `report-${today(date)}.md`), text + "\n");
  let mail = { sent: false, why: "dry run" };
  if (live) {
    const to = String(app.config.report?.to || "").replace(/^env:(.*)$/, (_, k) => env[k] || "");
    mail = await send({ to, subject: `${app.config.name} weekly report`, text, attachments, env });
  }
  return { summary: `report written${mail.sent ? " and emailed" : ` (not emailed: ${mail.why})`}`, text, files: [file], problems: [] };
}
