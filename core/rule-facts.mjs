// Reads the numbers a photo rule is made of out of an official page's text: print size, pixel size, head size, background
// colour, file size and how recent the photo must be. rule-watch compares them before and after a page changes, so a
// changed number can become a proposed fix and a change in wording alone stays a note for a person.
const N = String.raw`(\d+(?:[.,]\d+)?)`;
const X = String.raw`\s*(?:x|×|\*|by)\s*`;
const TO = String.raw`\s*(?:-|–|—|to|and)\s*`;
const LEN = String.raw`(mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?|inch(?:es)?|in\b|"|″|px|pixels?)`;
const num = s => Number(String(s).replace(",", "."));
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const toMm = (v, unit) => /^c/i.test(unit) ? round(v * 10) : /^(in|"|″)/i.test(unit) ? round(v * 25.4) : round(v);
const sortNum = list => [...new Set(list)].sort((a, b) => a - b);
const pairs = list => [...new Set(list.map(p => p.join("x")))].sort().map(s => s.split("x").map(Number));

// The page's sentences, so a number near "head" or "background" is read in its own sentence and not the next one's.
const sentencesOf = t => t.replace(/\s+/g, " ").split(/(?<=[.!?;])\s+(?=[A-Z0-9•\-–(])|\s+•\s+/);

export function extract(text = "") {
  const t = " " + String(text).replace(/ /g, " ").replace(/(\d)\s*[xX×]\s*(\d)/g, "$1 x $2") + " ";
  const mm = [], px = [], kb = [], headMm = [], headPct = [], bg = new Set(), valid = new Set();

  // Sizes: "35 x 45 mm", "35mm x 45mm", "3.5 x 4.5 cm", "2 x 2 inches", "600 x 600 pixels", "600 by 600 px".
  for (const m of t.matchAll(new RegExp(`${N}\\s*${LEN}?${X}${N}\\s*${LEN}?`, "gi"))) {
    const unit = (m[4] || m[2] || "").toLowerCase();
    if (!unit) continue;
    const a = num(m[1]), b = num(m[3]);
    if (/^(px|pixel)/.test(unit)) { if (a >= 50 && b >= 50) px.push([a, b]); continue; }
    const w = toMm(a, unit), h = toMm(b, unit);
    if (w >= 15 && w <= 120 && h >= 15 && h <= 120) mm.push([w, h]);
  }

  // Sizes written out: "600 pixels wide and 750 pixels tall", "45mm high and 35mm wide".
  for (const m of t.matchAll(new RegExp(`${N}\\s*${LEN}\\s*(wide|high|tall|width|height)\\s*(?:and|by|x|,)\\s*${N}\\s*${LEN}\\s*(wide|high|tall|width|height)`, "gi"))) {
    const unit = (m[5] || m[2]).toLowerCase(), first = /^wid/i.test(m[3]);
    const [w, h] = first ? [num(m[1]), num(m[4])] : [num(m[4]), num(m[1])];
    if (/^(px|pixel)/.test(unit)) px.push([w, h]);
    else mm.push([toMm(w, unit), toMm(h, unit)]);
  }

  // File sizes: "under 250 KB", "10 to 250 KB", "5 MB". MB counts as 1024 KB, as the app does.
  const kbOf = (v, u) => /^m/i.test(u) ? Math.round(num(v) * 1024) : num(v);
  for (const m of t.matchAll(new RegExp(`${N}\\s*(kb|kilobytes?|mb|megabytes?)?${TO}${N}\\s*(kb|kilobytes?|mb|megabytes?)\\b`, "gi")))
    kb.push(kbOf(m[1], m[2] || m[4]), kbOf(m[3], m[4]));
  for (const m of t.matchAll(new RegExp(`${N}\\s*(kb|kilobytes?|mb|megabytes?)\\b`, "gi"))) kb.push(kbOf(m[1], m[2]));

  for (const s of sentencesOf(t)) {
    const lower = s.toLowerCase();
    // Head size: "head between 32 mm and 36 mm", "chin to crown 29-34 mm", "face 70-80% of the photo".
    if (/\b(head|chin|crown|face)\b/.test(lower)) {
      for (const m of s.matchAll(new RegExp(`${N}\\s*(?:mm|millimet(?:re|er)s?)?${TO}${N}\\s*(mm|millimet(?:re|er)s?)\\b`, "gi")))
        if (num(m[2]) <= 60) headMm.push([num(m[1]), num(m[2])]);
      for (const m of s.matchAll(new RegExp(`${N}\\s*%?\\s*(?:-|–|—|to|and)\\s*${N}\\s*(%|per ?cent)`, "gi")))
        if (num(m[2]) <= 100) headPct.push([num(m[1]), num(m[2])]);
    }
    // Background colours, skipping the ones a page rules out ("not white", "no blue").
    if (/background/.test(lower)) {
      const words = lower.replace(/off[\s-]?white/g, "offwhite").replace(/gr[ae]y/g, "grey").replace(/light blue/g, "blue").replace(/light[\s-]colou?r(ed)?/g, "lightcolour");
      for (const m of words.matchAll(/\b(not|no|non|never|avoid)?\s*(?:a |an |plain |light |pale |solid )*(offwhite|white|grey|cream|blue|lightcolour)\b/g))
        if (!m[1]) bg.add(m[2]);
    }
    // How recent: "taken within the last 6 months", "not older than 1 month", "photos less than 30 days old".
    for (const m of lower.matchAll(/(?:within|not older than|no older than|less than|no more than|not more than|in) (?:the )?(last |past )?(?:(\d+|one|two|three|six) )?(month|week|day)s?(?: old)?\b/g)) {
      if (!/photo|picture|taken|old|recent/.test(lower) || (!m[2] && !m[1])) continue;
      const n = { one: 1, two: 2, three: 3, six: 6 }[m[2]] || num(m[2] || 1);
      valid.add(`${n} ${m[3]}${n === 1 ? "" : "s"}`);
    }
  }
  return {
    mm: pairs(mm), px: pairs(px), kb: sortNum(kb),
    headMm: pairs(headMm), headPct: pairs(headPct), bg: [...bg].sort(), valid: [...valid].sort(),
  };
}

const KINDS = { mm: "print size", px: "pixel size", kb: "file size", headMm: "head size", headPct: "head or face share", bg: "background", valid: "how recent" };
const key = v => Array.isArray(v) ? v.join("x") : String(v);

// What moved between two versions of a page: per kind, the values that went and the values that came.
export function diffFacts(before, after) {
  const out = {};
  for (const k of Object.keys(KINDS)) {
    const a = new Set((before[k] || []).map(key)), b = new Set((after[k] || []).map(key));
    const removed = (before[k] || []).filter(v => !b.has(key(v))), added = (after[k] || []).filter(v => !a.has(key(v)));
    if (removed.length || added.length) out[k] = { removed, added };
  }
  return out;
}

export const kindName = k => KINDS[k] || k;
export const show = (k, v) => k === "mm" ? `${v[0]}×${v[1]} mm` : k === "px" ? `${v[0]}×${v[1]} px` : k === "kb" ? `${v} KB`
  : k === "headMm" ? `${v[0]}–${v[1]} mm` : k === "headPct" ? `${v[0]}–${v[1]}%` : String(v);
