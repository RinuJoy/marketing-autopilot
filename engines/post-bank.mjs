// Post bank: a post for every item and channel, ordered by season, each with its own tracking link.
// Writes out/<app>/posts/<channel>.csv (date, time, text, link) ready for a scheduler's bulk upload, and posts.json.
// It never posts by itself; the scheduler engine does that for channels marked "auto" once switched on.
import { fill, csv, writeJson, writeText, outPath } from "../core/util.mjs";
import { linkFor } from "../core/links.mjs";
import { seasonOrder } from "./seasons.mjs";

export function render(config, channel, item, campaign) {
  const link = linkFor(config, item, channel.id, campaign);
  const data = {
    ...item, link, promise: config.promise || "", appName: config.name,
    factsList: item.facts.slice(0, 4).map(f => "• " + f).join("\n"),
    sourceUrl: item.sources[0]?.url || "", countryTag: (item.countryName || "").replace(/[^A-Za-z]/g, "").toLowerCase(),
  };
  let text = fill(channel.text, data).replace(/\n{3,}/g, "\n\n").trim();
  if (channel.max && text.length > channel.max) {
    // Keep the link: trim the words before it.
    const room = channel.max - link.length - 2;
    text = text.replace(link, "").trim().slice(0, Math.max(0, room - 1)).replace(/\s+\S*$/, "") + "… " + link;
  }
  const title = channel.title ? fill(channel.title, data).slice(0, channel.maxTitle || 100) : null;
  return { channel: channel.id, item: item.id, title, text, link };
}

// Words the app must never use (app.json "neverSay"); a post that has one is dropped and reported.
export function banned(config, text) {
  const low = text.toLowerCase();
  return (config.neverSay || []).filter(w => low.includes(w.toLowerCase()));
}

export function schedule(config, items, { start = new Date(), days = 90, campaign = "autopilot" } = {}) {
  const order = seasonOrder(config, items, start), posts = [], problems = [];
  for (const ch of config.channels || []) {
    // An item whose post would break a rule is left out of the queue (and reported), so no day goes empty.
    const ready = order.map(item => render(config, ch, item, campaign)).filter(p => {
      const full = render(config, { ...ch, max: 0 }, order.find(i => i.id === p.item), campaign);
      const bad = banned(config, (full.title || "") + " " + full.text);
      if (bad.length) problems.push(`${ch.id}/${p.item}: uses ${bad.join(", ")}`);
      return !bad.length;
    });
    const per = ch.perDay || 1;
    for (let i = 0; ready.length && i < days * per; i++) {
      const day = new Date(start.getTime() + Math.floor(i / per) * 864e5).toISOString().slice(0, 10);
      posts.push({ date: day, time: ch.time || "12:00", ...ready[i % ready.length] });
    }
  }
  return { posts, problems };
}

export async function run(app, { start = new Date(), days = 90 } = {}) {
  const { posts, problems } = schedule(app.config, await app.items(), { start, days });
  const files = [await writeJson(outPath(app.name, "posts", "posts.json"), posts)];
  for (const ch of app.config.channels || []) {
    const rows = posts.filter(p => p.channel === ch.id).map(p => [p.date, p.time, p.title || "", p.text, p.link]);
    files.push(await writeText(outPath(app.name, "posts", ch.id + ".csv"), csv([["date", "time", "title", "text", "link"], ...rows])));
  }
  return { summary: `${posts.length} posts for ${days} days on ${(app.config.channels || []).length} channels`, files, problems };
}
