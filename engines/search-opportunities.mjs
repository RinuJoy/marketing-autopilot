// Search opportunities: pages Google shows often but people rarely click (position 4 to 20, CTR under 2%).
// A better title and description there is the cheapest growth there is. Lists them with the current title so a
// person (or the weekly Claude routine) can write a better one.
import { searchConsole } from "../core/sources.mjs";

export function pick(rows, { minImpressions = 50 } = {}) {
  return rows.filter(r => r.impressions >= minImpressions && r.position >= 4 && r.position <= 20 && r.ctr < 0.02)
    .sort((a, b) => b.impressions - a.impressions).slice(0, 15);
}

export async function run(app, { env = process.env, rows } = {}) {
  try { rows ??= await searchConsole(app.config, { dimension: "page", env }); }
  catch (e) { return { summary: `not switched on: ${e.message}`, problems: [] }; }
  const items = new Map((await app.items()).map(i => [i.url, i]));
  const list = pick(rows);
  const text = list.map(r => `- ${r.key}: ${r.impressions} views, ${(r.ctr * 100).toFixed(1)}% clicked, position ${r.position.toFixed(1)}` +
    (items.get(r.key) ? `\n  Now: "${items.get(r.key).title}". ${items.get(r.key).summary}` : "")).join("\n");
  return { summary: `${list.length} pages worth a better title`, text, problems: [] };
}
