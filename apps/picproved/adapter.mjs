// Picproved's items are its documents, read straight from js/presets.js and js/meta.js in the app's repository,
// so a new document added to the app turns up in every engine with no change here.
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export async function items({ config, src }) {
  const load = f => import(pathToFileURL(join(src, f)).href);
  const { PRESETS, SIG_PRESETS, BG, COUNTRY_NAME } = await load("js/presets.js");
  const { pageMeta } = await load("js/meta.js");
  return [...PRESETS, ...SIG_PRESETS].filter(p => p.id !== "custom").map(p => {
    const meta = pageMeta("doc", p.id);
    const size = p.mm ? `${p.mm[0]}×${p.mm[1]} mm` : p.px ? `${p.px[0]}×${p.px[1]} px` : null;
    const bg = p.bg && BG[p.bg[0]] ? `${BG[p.bg[0]].label} background` : null;
    const kb = p.kb && p.kb[1] ? `File ${p.kb[0] ? p.kb[0] + " to " : "up to "}${p.kb[1]} KB` : null;
    const px = p.mm && p.px ? `${p.px[0]}×${p.px[1]} pixels` : null;
    const facts = [size, bg, kb, px, ...(p.notes || []).slice(0, 2)].filter(Boolean);
    const sources = p.src ? [{ label: p.src[0], url: p.src[1] }] : [];
    const questions = [
      size && { q: `What size is the ${meta.title}?`, a: `${size}${px ? ` (${px} for upload)` : ""}.` },
      bg && { q: `What background does the ${meta.title} need?`, a: `${bg}.` },
      kb && { q: `What file size does the ${meta.title} need?`, a: `${kb}.` },
    ].filter(Boolean);
    return {
      id: p.id, title: meta.title, summary: meta.desc, url: `${config.site}doc/${p.id}`,
      country: p.iso || null, countryName: COUNTRY_NAME?.[p.iso] || p.country, language: "en",
      facts, questions, sources, tags: [p.kind || "signature", (p.region || "").toLowerCase().replace(/\s+/g, "-")].filter(Boolean),
    };
  });
}
