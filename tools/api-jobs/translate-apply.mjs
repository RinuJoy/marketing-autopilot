// Applies the translation review's suggestions to a Picproved clone's js/lang/<code>.js files.
//   node tools/api-jobs/translate-apply.mjs --repo <picproved> [--severity wrong,placeholder,unclear] [--langs hi,ta]
// Only the string after the matching key changes; each file is re-imported afterwards to check that every applied
// key now holds the suggestion and every other key is untouched. Run on a Picproved branch, never on main.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { args, picprovedRepo, ROOT } from "./lib.mjs";

const A = args();
const REPO = picprovedRepo(A);
const IN = path.join(ROOT, "out/api-jobs/translate-review");
const SEV = new Set(String(A.severity || "wrong,placeholder,unclear").split(","));
const holes = s => (String(s).match(/\{[a-z0-9]*\}/gi) || []).sort().join(",");
// Picproved's own test (tests/app.test.mjs "no stray English"): in a non-Latin language, any Latin word must also be in the English.
const NON_LATIN = new Set(["hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa", "ur", "ar", "ru", "zh"]);
const words = s => String(s).replace(/\{\w+\}/g, "").match(/[A-Za-z]+/g) || [];
const strayLatin = (code, en, tr) => NON_LATIN.has(code) && words(tr).some(w => w.length > 2 && !words(en).some(e => e.toLowerCase().startsWith(w.toLowerCase()) || w.toLowerCase().startsWith(e.toLowerCase())));

// Finds `key: "..."` (or "key": / 'key': ) inside the given export block and returns the string literal's span.
function findValue(src, key, from, to) {
  const keyPats = /^[A-Za-z_$][\w$]*$/.test(key) ? [key + ":", JSON.stringify(key) + ":", `'${key}':`] : [JSON.stringify(key) + ":", `'${key}':`];
  for (const kp of keyPats) {
    let i = from;
    while ((i = src.indexOf(kp, i)) !== -1 && i < to) {
      const before = src[i - 1];
      if (i > 0 && /[\w$"']/.test(before)) { i += kp.length; continue; }
      let j = i + kp.length;
      while (src[j] === " ") j++;
      const q = src[j];
      if (q !== '"' && q !== "'" && q !== "`") { i = j; continue; }
      let k = j + 1;
      while (k < src.length && src[k] !== q) k += src[k] === "\\" ? 2 : 1;
      return [j, k + 1];
    }
  }
  return null;
}

async function loadEnglish() {
  const src = fs.readFileSync(path.join(REPO, "js/i18n.js"), "utf8").replace(/^const EN = \{/m, "export const EN = {");
  const tmp = path.join(REPO, "js", `.__en_${process.pid}.mjs`);
  fs.writeFileSync(tmp, src);
  try { return (await import(pathToFileURL(tmp).href)).EN; } finally { fs.rmSync(tmp, { force: true }); }
}

const langs = fs.readdirSync(IN).filter(f => /^[a-z]{2}\.json$/.test(f)).map(f => f.slice(0, 2)).filter(c => !A.langs || String(A.langs).split(",").includes(c));
const EN = await loadEnglish();
let total = 0;
for (const code of langs) {
  const file = path.join(REPO, "js/lang", code + ".js");
  const before = await import(pathToFileURL(file).href + "?b");
  let src = fs.readFileSync(file, "utf8");
  const docsAt = src.indexOf("export const DOCS");
  const sugg = JSON.parse(fs.readFileSync(path.join(IN, code + ".json"), "utf8"));
  const applied = {}, skipped = [];
  // Work from the end of the file backwards so earlier offsets stay valid.
  const edits = [];
  for (const [key, s] of Object.entries(sugg)) {
    if (!SEV.has(s.severity)) continue;
    const isDoc = key.startsWith("DOCS:"), k = isDoc ? key.slice(5) : key;
    const old = isDoc ? before.DOCS?.[k] : before.default[k];
    if (old === undefined) { skipped.push(key + " (not in file)"); continue; }
    if (!isDoc && holes(old) !== holes(s.suggestion)) { skipped.push(key + " (placeholders differ)"); continue; }
    if (!isDoc && strayLatin(code, EN[k], s.suggestion) && !strayLatin(code, EN[k], old)) { skipped.push(key + " (adds an English word)"); continue; }
    const span = isDoc ? findValue(src, k, docsAt, src.length) : findValue(src, k, 0, docsAt === -1 ? src.length : docsAt);
    if (!span) { skipped.push(key + " (not found)"); continue; }
    edits.push([span, JSON.stringify(s.suggestion), key, k, isDoc]);
  }
  edits.sort((a, b) => b[0][0] - a[0][0]);
  for (const [[a, b], lit, key, k, isDoc] of edits) { src = src.slice(0, a) + lit + src.slice(b); applied[key] = [k, isDoc]; }
  fs.writeFileSync(file, src);
  const after = await import(pathToFileURL(file).href + "?a");
  // Check: applied keys hold the suggestion, everything else unchanged.
  for (const part of ["default", "DOCS", "SAY"]) {
    const b = before[part] || {}, a = after[part] || {};
    for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
      const key = part === "DOCS" ? "DOCS:" + k : k;
      const want = applied[key] && (part === "DOCS") === applied[key][1] && part !== "SAY" ? sugg[key].suggestion : b[k];
      if (a[k] !== want) throw new Error(`${code}: ${part}.${k} is wrong after the edit`);
    }
  }
  total += edits.length;
  console.log(`${code}: ${edits.length} applied${skipped.length ? `, skipped ${skipped.join("; ")}` : ""}`);
}
console.log(`${total} strings changed in ${langs.length} files.`);
