// Instant indexing: tells Bing, Yandex, Seznam and Naver (through IndexNow) which pages are new or changed, so they
// are crawled in hours. Google ignores IndexNow; it reads the sitemap from Search Console.
// Needs INDEXNOW_KEY and a file <key>.txt holding the key at the site root. Without --live it only lists the pages.
import { get } from "../core/http.mjs";
import { readJson, writeJson, statePath, sha } from "../core/util.mjs";

export function urlsFromSitemap(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1].replace(/&amp;/g, "&"));
}

export async function run(app, { live = false, env = process.env, sitemap } = {}) {
  const site = app.config.site, host = new URL(site).host;
  let urls;
  try {
    const xml = sitemap ?? await (await get(site + "sitemap.xml")).text();
    urls = urlsFromSitemap(xml);
  } catch (e) {
    return { summary: "sitemap not reachable", text: String(e.message), problems: ["sitemap.xml could not be read"] };
  }
  if (!app.config.itemPages) urls = urls.filter(u => !u.includes("/away/"));
  // Only send what changed: the item list's fingerprint per address, kept in state.
  const file = statePath(app.name, "indexnow.json"), sent = await readJson(file, {});
  const items = await app.items(), print = new Map(items.map(i => [i.url, sha(JSON.stringify(i))]));
  const todo = urls.filter(u => sent[u] !== (print.get(u) || "page"));
  if (!live || !todo.length) return { summary: `${todo.length} of ${urls.length} pages to send${live ? "" : " (dry run)"}`, text: todo.slice(0, 50).join("\n"), problems: [] };
  const key = env.INDEXNOW_KEY;
  if (!key) return { summary: "INDEXNOW_KEY not set", problems: ["INDEXNOW_KEY missing"] };
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST", headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key, keyLocation: `${site}${key}.txt`, urlList: todo.slice(0, 10000) }),
  });
  if (res.status !== 200 && res.status !== 202) return { summary: `IndexNow said ${res.status}`, problems: [`IndexNow HTTP ${res.status}`] };
  for (const u of todo) sent[u] = print.get(u) || "page";
  await writeJson(file, sent);
  return { summary: `${todo.length} pages sent to IndexNow`, problems: [] };
}
