// Awayline's items are the away grounds: one per club, from data/clubs.json and data/grounds.json.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function items({ config, src }) {
  const read = async f => JSON.parse(await readFile(join(src, f), "utf8"));
  const { clubs, leagues } = await read("data/clubs.json");
  const grounds = await read("data/grounds.json");
  return clubs.filter(c => grounds[c.name]).map(c => {
    const g = grounds[c.name], pubs = g.pubs || [];
    const away = pubs.filter(p => p.type === "away");
    const facts = [
      `${g.ground}`,
      `Station: ${g.station}${g.walk ? `, about ${g.walk} min walk` : ""}`,
      pubs.length ? `${pubs.length} ${pubs.length === 1 ? "pub" : "pubs"} listed${away.length ? `, ${away.length} for away fans` : ""}` : null,
      leagues[c.league],
    ].filter(Boolean);
    const sources = pubs.map(p => p.src).filter(s => s?.url).map(s => ({ label: s.label, url: s.url }));
    return {
      id: c.slug, title: `Away at ${c.name}`,
      summary: `${g.ground} is about ${g.walk || "?"} minutes on foot from ${g.station} station${away[0] ? `; the away pub is ${away[0].name}` : ""}.`,
      url: `${config.site}away/${c.slug}`, country: "GB", countryName: "United Kingdom", language: "en",
      facts, sources,
      questions: [
        { q: `What is the nearest station to ${g.ground}?`, a: `${g.station}${g.walk ? `, about ${g.walk} minutes' walk` : ""}.` },
        ...(away[0] ? [{ q: `Where do away fans drink at ${c.name}?`, a: `${away.map(p => p.name).join(", ")}${away[0].note ? `. ${away[0].note}` : "."}` }] : []),
      ],
      tags: ["ground", c.league, g.checked === false ? "unchecked" : "checked"],
    };
  });
}
