// Seasonal calendar: which items are in season in a given month, from app.json "seasons".
// A season matches items by id, by tag or by country (all given filters must match). Queues put these first.
export function inSeason(config, items, month) {
  const active = (config.seasons || []).filter(s => s.months.includes(month));
  const hits = new Map();
  for (const s of active) {
    for (const it of items) {
      if (s.ids && !s.ids.includes(it.id)) continue;
      if (s.tags && !s.tags.some(t => it.tags.includes(t))) continue;
      if (s.countries && !s.countries.includes(it.country)) continue;
      if (!hits.has(it.id)) hits.set(it.id, []);
      hits.get(it.id).push(s.name);
    }
  }
  return { active: active.map(s => s.name), items: hits };
}

// Items in season this month first, then the rest; next month's season comes second, as content goes out early.
export function seasonOrder(config, items, date = new Date()) {
  const m = date.getUTCMonth() + 1, next = (m % 12) + 1;
  const now = inSeason(config, items, m).items, soon = inSeason(config, items, next).items;
  const rank = it => (now.has(it.id) ? 0 : soon.has(it.id) ? 1 : 2);
  return [...items].sort((a, b) => rank(a) - rank(b));
}

export async function run(app, { date = new Date() } = {}) {
  const items = await app.items(), lines = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + i, 1));
    const { active, items: hits } = inSeason(app.config, items, d.getUTCMonth() + 1);
    lines.push(`- ${d.toISOString().slice(0, 7)}: ${active.length ? active.join("; ") : "no season"}${hits.size ? ` (${hits.size} items)` : ""}`);
  }
  const unmatched = (app.config.seasons || []).filter(s => !inSeason({ seasons: [s] }, items, s.months[0]).items.size);
  return {
    summary: `${app.config.name}: next 12 months`,
    text: lines.join("\n") + (unmatched.length ? `\n\nSeasons matching no item (check ids): ${unmatched.map(s => s.name).join(", ")}` : ""),
    problems: unmatched.map(s => `season "${s.name}" matches no item`),
  };
}
