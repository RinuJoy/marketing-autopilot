// Rule watch: opens every source page the app cites (official photo rules, away guides) and reports which changed
// since the last run, with the sentences that appeared or went. A person then checks whether the app needs a fix.
// State lives in state/<app>/rule-watch.json so the next run can compare; commit it after each run.
import { get, pool } from "../core/http.mjs";
import { pageText, stableText, sha, readJson, writeJson, statePath, today } from "../core/util.mjs";

const sentences = t => new Set(t.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 20 && s.length < 400));

export function compare(before, after) {
  const a = sentences(before || ""), b = sentences(after);
  return { added: [...b].filter(s => !a.has(s)).slice(0, 8), removed: [...a].filter(s => !b.has(s)).slice(0, 8) };
}

export async function check(url) {
  try {
    const res = await get(url);
    if (!res.ok) return { status: res.status };
    const type = res.headers.get("content-type") || "";
    if (/pdf|octet/.test(type) || /\.pdf($|\?)/i.test(url)) {
      const buf = Buffer.from(await res.arrayBuffer());
      return { status: 200, hash: sha(buf), pdf: true };
    }
    const text = stableText(pageText(await res.text()));
    return { status: 200, hash: sha(text), text: text.slice(0, 60000) };
  } catch (e) {
    return { status: 0, error: e.name === "TimeoutError" ? "timed out" : e.cause?.code || e.message };
  }
}

export async function run(app, { fetcher = check, concurrency = 4 } = {}) {
  const items = await app.items(), file = statePath(app.name, "rule-watch.json");
  const state = await readJson(file, {});
  const byUrl = new Map();
  for (const it of items) for (const s of it.sources) {
    if (!byUrl.has(s.url)) byUrl.set(s.url, { label: s.label, items: [] });
    byUrl.get(s.url).items.push(it.id);
  }
  const urls = [...byUrl.keys()], changed = [], broken = [], fresh = [];
  const results = await pool(urls, concurrency, fetcher);
  urls.forEach((url, i) => {
    const r = results[i], prev = state[url], who = byUrl.get(url).items.join(", ");
    if (r.status !== 200) {
      broken.push(`- ${url} (${r.error || "HTTP " + r.status}) used by ${who}`);
      state[url] = { ...prev, lastError: r.error || r.status, lastTried: today() };
      return;
    }
    if (!prev?.hash) fresh.push(url);
    else if (prev.hash !== r.hash) {
      const d = r.pdf ? { added: ["(PDF changed: open it and compare)"], removed: [] } : compare(prev.text, r.text);
      changed.push(`### ${byUrl.get(url).label}\n${url}\nUsed by: ${who}\n` +
        d.added.map(s => `+ ${s}`).join("\n") + (d.removed.length ? "\n" + d.removed.map(s => `- ${s}`).join("\n") : ""));
    }
    state[url] = { hash: r.hash, text: r.text, pdf: r.pdf || undefined, since: prev?.hash === r.hash ? prev.since : today(), checked: today() };
  });
  await writeJson(file, state);
  const text = [
    `${urls.length} source pages checked: ${changed.length} changed, ${broken.length} not reachable, ${fresh.length} seen for the first time.`,
    changed.length ? "\n## Changed\n\n" + changed.join("\n\n") : "",
    broken.length ? "\n## Not reachable (check by hand; some sites block robots)\n\n" + broken.join("\n") : "",
  ].join("\n");
  return { summary: `${app.config.name}: ${changed.length} changed, ${broken.length} unreachable of ${urls.length}`, text, problems: changed.length ? [`${changed.length} source pages changed`] : [] };
}
