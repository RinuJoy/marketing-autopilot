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

// For rule-watch: every document's current values, by the official page it cites, so a changed page can be matched
// to the documents that use it. head is a share of the photo height; kb is [min, max].
export const ruleFile = "js/presets.js";
export async function ruleTargets({ src }) {
  const { PRESETS, SIG_PRESETS, BG } = await import(pathToFileURL(join(src, ruleFile)).href);
  const targets = [...PRESETS, ...SIG_PRESETS].filter(p => p.src?.[1]).map(p => ({
    id: p.id, url: p.src[1], label: p.src[0], file: ruleFile, doc: `${p.country} ${p.doc}`,
    mm: p.mm || null, px: p.px || null, head: p.head || null, bg: p.bg || null, kb: p.kb || null, notes: p.notes || [], check: p.check || null,
  }));
  return { targets, bgKeys: Object.keys(BG) };
}

// Edits one document's line in js/presets.js: the changed fields, the same numbers in its notes, and checked: "<date>".
// Each document sits on one line, so the edit never reaches another document.
export function applyRule(source, { id, fields = {}, swap = [] }, date) {
  const lines = source.split("\n"), i = lines.findIndex(l => l.includes(`{ id: "${id}"`));
  if (i < 0) throw new Error(`${id} not found in ${ruleFile}`);
  let line = lines[i];
  const list = v => `[${v.map(x => typeof x === "string" ? JSON.stringify(x) : x).join(", ")}]`;
  const set = (key, value) => {
    const re = new RegExp(`\\b${key}: (?:r\\([^)]*\\)|\\[[^\\]]*\\]|null)`);
    if (!re.test(line)) throw new Error(`${id} has no ${key} to change`);
    line = line.replace(re, `${key}: ${value}`);
  };
  for (const [k, v] of Object.entries(fields)) {
    if (k === "head") set("head", v.mm ? `r(${v.mm[0]}, ${v.mm[1]}, ${v.of})` : list(v.share.map(x => x.toFixed(2))).replace(/"/g, ""));
    else set(k, list(v));
  }
  const notes = line.match(/notes: \[.*?\](?=, [a-zA-Z]+:| \})/);
  if (notes) {
    let n = notes[0];
    for (const [o, w] of swap) n = n.split(o).join(w);
    line = line.replace(notes[0], n);
  }
  line = /\bchecked: "/.test(line) ? line.replace(/checked: "[^"]*"/, `checked: "${date}"`) : line.replace(`{ id: "${id}", `, `{ id: "${id}", checked: "${date}", `);
  lines[i] = line;
  return lines.join("\n");
}
