// The official pages the cloud can't open (bot walls, 403s, PDFs behind Cloudflare), as a checklist a person opens on
// their own computer: each page's link, when it was last read, and the values the app uses from it, so a glance
// confirms them or flags a change. Writes out/<app>/blocked-checklist.html (and .md); the weekly report attaches it to
// the first report of each month. Answers are copied back as text with one button.
import { readJson, statePath, outPath, writeText, today } from "../core/util.mjs";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pct = v => Math.round(v * 100);

// The app's values for one item, in words.
export function values(t) {
  const out = [];
  if (t.mm) out.push(`${t.mm[0]}×${t.mm[1]} mm`);
  if (t.px) out.push(`${t.px[0]}×${t.px[1]} px`);
  if (t.head) out.push(t.mm ? `head ${Math.round(t.head[0] * t.mm[1] * 10) / 10}–${Math.round(t.head[1] * t.mm[1] * 10) / 10} mm (${pct(t.head[0])}–${pct(t.head[1])}% of the height)` : `head ${pct(t.head[0])}–${pct(t.head[1])}% of the height`);
  if (t.bg) out.push(`background ${t.bg.join(" or ")}`);
  if (t.kb && t.kb[1]) out.push(t.kb[0] ? `${t.kb[0]}–${t.kb[1]} KB` : `up to ${t.kb[1]} KB`);
  return out;
}

// Pages whose latest visit failed, with the items that cite them.
export async function blocked(app) {
  const state = await readJson(statePath(app.name, "rule-watch.json"), {});
  const items = await app.items(), hooks = await app.adapter?.();
  const { targets = [] } = hooks?.ruleTargets ? await hooks.ruleTargets({ src: app.src }) : {};
  const pages = new Map();
  for (const it of items) for (const s of it.sources) {
    const st = state[s.url];
    if (!st?.lastError || (st.checked && st.checked > st.lastTried)) continue;
    if (!pages.has(s.url)) pages.set(s.url, { url: s.url, label: s.label, error: st.lastError, lastRead: st.checked || null, docs: [] });
    const t = targets.find(x => x.id === it.id && x.url === s.url);
    pages.get(s.url).docs.push({ id: it.id, title: t?.doc || it.title, values: t ? values(t) : it.facts.slice(0, 4), notes: (t?.notes || []).slice(0, 2), check: t?.check || null });
  }
  return [...pages.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function markdown(app, pages, date) {
  return [`# ${app.config.name}: official pages to check by hand (${date})`, "",
    `${pages.length} pages block the cloud robot. Open each one on your own computer and check the values below.`, "",
    ...pages.map(p => `## ${p.label}\n${p.url}\nLast read: ${p.lastRead || "never from the cloud"} (now: ${p.error})\n\n` +
      p.docs.map(d => `- [ ] ${d.title} (${d.id}): ${d.values.join(", ") || "no numbers stored"}${d.notes.length ? `. Notes: ${d.notes.join(" / ")}` : ""}`).join("\n") + "\n")].join("\n");
}

export function html(app, pages, date) {
  const rows = pages.map((p, i) => `<section class="page" data-url="${esc(p.url)}">
<h2><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.label)}</a></h2>
<p class="meta">${esc(p.url)}<br>Last read ${p.lastRead ? `on ${esc(p.lastRead)}` : "never from the cloud"} · cloud gets: ${esc(p.error)}</p>
<ul>${p.docs.map(d => `<li><b>${esc(d.title)}</b> <span class="id">${esc(d.id)}</span><br>${esc(d.values.join(" · ") || "no numbers stored")}${d.notes.length ? `<br><span class="note">${esc(d.notes.join(" / "))}</span>` : ""}${d.check ? `<br><span class="note">Unofficial value: ${esc(d.check)}</span>` : ""}</li>`).join("")}</ul>
<div class="answer" role="radiogroup" aria-label="What the page says">
<label><input type="radio" name="a${i}" value="Same"> Same</label>
<label><input type="radio" name="a${i}" value="Changed"> Changed</label>
<label><input type="radio" name="a${i}" value="Could not open"> Couldn't open</label>
</div>
<textarea name="n${i}" rows="2" placeholder="What's different (paste the new wording)"></textarea>
</section>`).join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pages to check by hand</title>
<style>
:root { --bg: #f7f7f5; --card: #fff; --ink: #1c1c1a; --muted: #5f5f5a; --line: #deded8; --accent: #0f766e; }
@media (prefers-color-scheme: dark) { :root { --bg: #161615; --card: #20201e; --ink: #ecece8; --muted: #a3a39c; --line: #3a3a36; --accent: #4fb3a9; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 1rem/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 52rem; margin: 0 auto; padding: 1.5rem 1rem 6rem; }
h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
h2 { font-size: 1.05rem; margin: 0 0 .25rem; }
a { color: var(--accent); }
.lead, .meta, .id, .note { color: var(--muted); }
.meta { font-size: .85rem; margin: 0 0 .5rem; overflow-wrap: anywhere; }
.id, .note { font-size: .85rem; }
.page { background: var(--card); border: 1px solid var(--line); border-radius: .5rem; padding: 1rem; margin: 1rem 0; }
.page.done { border-left: .3rem solid var(--accent); }
ul { padding-left: 1.1rem; margin: .5rem 0; }
li { margin: .35rem 0; }
.answer { display: flex; gap: 1rem; flex-wrap: wrap; margin: .5rem 0; }
textarea { width: 100%; font: inherit; color: inherit; background: var(--bg); border: 1px solid var(--line); border-radius: .35rem; padding: .4rem; }
.bar { position: fixed; left: 0; right: 0; bottom: 0; background: var(--card); border-top: 1px solid var(--line); padding: .75rem 1rem; display: flex; gap: 1rem; align-items: center; justify-content: center; flex-wrap: wrap; }
button { font: inherit; background: var(--accent); color: #fff; border: 0; border-radius: .35rem; padding: .5rem 1rem; cursor: pointer; }
</style></head>
<body><main>
<h1>${esc(app.config.name)}: pages to check by hand</h1>
<p class="lead">${pages.length} official pages block the cloud robot, so they're checked here once a month (${esc(date)}). Open each link on this computer, compare it with the values the app uses, and pick Same or Changed. Then press <b>Copy my answers</b> and paste them to Claude.</p>
${rows}
</main>
<div class="bar"><span id="count"></span><button type="button" id="copy">Copy my answers</button></div>
<script>
const KEY = "blocked-checklist-${esc(date)}";
const pages = [...document.querySelectorAll(".page")];
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
function read() {
  return pages.map((p, i) => ({ url: p.dataset.url, title: p.querySelector("h2").textContent, answer: (p.querySelector("input:checked") || {}).value || "", note: p.querySelector("textarea").value.trim() }));
}
function update() {
  const all = read();
  pages.forEach((p, i) => p.classList.toggle("done", !!all[i].answer));
  document.getElementById("count").textContent = all.filter(a => a.answer).length + " of " + all.length + " checked";
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {}
}
pages.forEach((p, i) => {
  const s = (saved[i] && saved[i].url === p.dataset.url) ? saved[i] : null;
  if (s) { const r = p.querySelector('input[value="' + s.answer + '"]'); if (r) r.checked = true; p.querySelector("textarea").value = s.note || ""; }
});
document.addEventListener("input", update);
document.getElementById("copy").addEventListener("click", async () => {
  const text = "Blocked pages check ${esc(date)}\\n" + read().map(a => "- " + a.title + " (" + a.url + "): " + (a.answer || "not checked") + (a.note ? ": " + a.note : "")).join("\\n");
  try { await navigator.clipboard.writeText(text); document.getElementById("copy").textContent = "Copied"; }
  catch { const t = document.createElement("textarea"); t.value = text; document.body.append(t); t.select(); document.execCommand("copy"); t.remove(); document.getElementById("copy").textContent = "Copied"; }
});
update();
</script>
</body></html>
`;
}

export async function run(app, { date = today() } = {}) {
  const pages = await blocked(app);
  const files = [
    await writeText(outPath(app.name, "blocked-checklist.html"), html(app, pages, date)),
    await writeText(outPath(app.name, "blocked-checklist.md"), markdown(app, pages, date) + "\n"),
  ];
  return { summary: `${pages.length} blocked official pages listed for a person to check`, text: markdown(app, pages, date), files, problems: [], pages };
}
