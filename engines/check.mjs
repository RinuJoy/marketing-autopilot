// Health check of one app's setup: settings complete, items valid, seasons match something, no banned words.
import { inSeason } from "./seasons.mjs";
import { schedule } from "./post-bank.mjs";

export async function run(app) {
  const c = app.config, problems = [];
  for (const k of ["id", "name", "site", "tagline", "channels"]) if (!c[k]) problems.push(`app.json has no ${k}`);
  if (c.site && !/^https:\/\/.+\/$/.test(c.site)) problems.push("site must be https and end with /");
  const items = await app.items();
  if (!items.length) problems.push("adapter returned no items");
  for (const s of c.seasons || []) if (!inSeason({ seasons: [s] }, items, s.months[0]).items.size) problems.push(`season "${s.name}" matches no item`);
  problems.push(...schedule(c, items, { days: 7 }).problems);
  const sources = new Set(items.flatMap(i => i.sources.map(s => s.url))).size;
  return { summary: `${c.name}: ${items.length} items, ${sources} source pages, ${(c.channels || []).length} channels`, problems };
}
