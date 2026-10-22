// New page ideas: what people type into Google about each item, from Google's public search suggestions, keeping
// only questions no item title already covers. Monthly, gently (one request a second).
import { get } from "../core/http.mjs";

export async function suggest(q) {
  const res = await get(`https://suggestqueries.google.com/complete/search?client=firefox&hl=en&q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`suggest HTTP ${res.status}`);
  return (await res.json())[1] || [];
}

const words = s => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2));
// A suggestion is covered when some item title shares nearly all its words.
export function uncovered(suggestions, items) {
  const titles = items.map(i => words(i.title + " " + (i.countryName || "")));
  return suggestions.filter(s => {
    const w = [...words(s)];
    return !titles.some(t => w.filter(x => t.has(x)).length >= Math.max(2, w.length - 1));
  });
}

export async function run(app, { seeds, limit = 30, ask = suggest, wait = 1000 } = {}) {
  const items = await app.items();
  seeds ??= [...new Set(items.map(i => i.title.toLowerCase()))].slice(0, limit);
  const found = new Set();
  for (const s of seeds) {
    try { for (const x of await ask(s)) found.add(x); } catch (e) { return { summary: `suggestions not reachable: ${e.message}`, problems: [] }; }
    if (wait) await new Promise(r => setTimeout(r, wait));
  }
  const ideas = uncovered([...found], items);
  return { summary: `${ideas.length} searches no page answers yet (from ${seeds.length} seeds)`, text: ideas.map(i => "- " + i).join("\n"), problems: [] };
}
