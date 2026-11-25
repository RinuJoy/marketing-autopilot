// Checks four rules per Picproved document against its official page, the kinds the 5 Nov rule check didn't compare
// (25 Nov 2026, after the UAE Emirates ID review): whether edited photos are refused, a minimum resolution (DPI or
// pixels), glasses, and head coverings (religious, national dress, a statement, or none).
//   node tools/api-jobs/wear-check.mjs run [--ids ae-eid] [--limit 10] [--parallel 4] [--model claude-sonnet-5-5]
// Resumable like rule-check.mjs; writes out/api-jobs/wear-check/results.jsonl and REPORT.md. Changes nothing in Picproved.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { args, picprovedRepo, client, cost, addUsage, outDir, money, textOf, lastJson, PRICES } from "./lib.mjs";

const A = args();
const STEP = A._[0] || "estimate";
const REPO = picprovedRepo(A);
const OUT = outDir("wear-check");
const RESULTS = path.join(OUT, "results.jsonl");
const MODEL = A.model || "claude-sonnet-5-5";
const PAR = Number(A.parallel || 4);

const P = await import(pathToFileURL(path.join(REPO, "js/presets.js")).href);
let presets = P.PRESETS.filter(p => Array.isArray(p.src) && p.src[1] && !p.info && !p.custom);
if (A.ids) { const want = new Set(String(A.ids).split(",")); presets = presets.filter(p => want.has(p.id)); }

const SYSTEM = `You check four photo rules in Picproved, a passport, visa, ID and exam photo app, against official sources.
For one document you get what the app does now and its official source link. Open the source with web_fetch. If it is
dead, moved or silent on a point, you may use web_search for the issuing office's own page or PDF (a government, embassy,
consulate or the official application portal). Reputable national newspapers quoting the office count as "press".
Never use photo studios, photo apps or blogs.

The four rules:
1. edits: does the office refuse photos edited or altered by software (retouched, filtered, background replaced)?
   "forbidden" only with words like edited/altered/retouched/manipulated/digitally changed. Otherwise "not_stated".
2. min_res: a minimum resolution for the photo or upload, as DPI and/or pixels [w,h]. null if none is given.
3. glasses: "no" (not allowed, or only with a medical statement), "clear" (allowed when the eyes show, no glare or tint),
   "avoid" (allowed but the office says take them off if you can), or "not_stated".
4. covering: "religious" (allowed for religious/medical reasons with the face showing), "national" (also allowed as
   national dress, e.g. a ghutra), "statement" (allowed with a signed statement), "none" (bare head always), or "not_stated".

Finish with one \`\`\`json block:
{"source_used": "url", "source_kind": "official" | "press" | "none",
 "edits": "...", "edits_quote": "exact words or empty",
 "min_res": {"dpi": number|null, "px": [w,h]|null} | null, "min_res_quote": "...",
 "glasses": "...", "glasses_quote": "...",
 "covering": "...", "covering_quote": "...",
 "gaps": ["one short sentence per place the app differs from the source; empty if none"]}
Quote exactly. Do not guess: a rule the source does not state is "not_stated".`;

const tools = [
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: Number(A.fetches || 3), max_content_tokens: 25000 },
  { type: "web_search_20260209", name: "web_search", max_uses: Number(A.searches || 2) },
];
const done = () => fs.existsSync(RESULTS) ? new Set(fs.readFileSync(RESULTS, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l).id)) : new Set();

function prompt(p) {
  const w = P.wearRules(p), d = P.dims(p), range = (P.RANGE || {})[p.id];
  const app = {
    output_px: d.px, output_dpi: d.dpi, accepted_px_range: range || "exactly output_px (a larger file of the same shape is a warning)",
    background_replace: P.bgLocked(p) ? "not offered (US)" : P.keepsBg(p) ? "offered but off, with a warning" : "offered, on by default",
    glasses: w.glasses, covering: w.covering, notes: p.notes,
  };
  return `Document: ${p.country}, ${p.doc} (id ${p.id}).\nWhat the app does: ${JSON.stringify(app)}\nOfficial source on file: ${p.src[0]} ${p.src[1]}\nToday is ${new Date().toISOString().slice(0, 10)}.`;
}

async function checkOne(c, p) {
  const messages = [{ role: "user", content: prompt(p) }];
  const usage = {};
  let msg;
  for (let turn = 0; turn < 5; turn++) {
    msg = await c.messages.create({ model: MODEL, max_tokens: 12000, thinking: { type: "adaptive" }, output_config: { effort: A.effort || "low" }, system: SYSTEM, tools, messages });
    addUsage(usage, msg.usage);
    if (msg.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: msg.content });
  }
  const searches = usage.server_tool_use?.web_search_requests || msg.usage?.server_tool_use?.web_search_requests || 0;
  const r = lastJson(textOf(msg)) || { source_kind: "none", gaps: [`no JSON (stop: ${msg.stop_reason})`] };
  return { id: p.id, country: p.country, doc: p.doc, stored: p.src[1], ...r, usd: cost(usage, MODEL) + searches * 0.01 };
}

function report() {
  const rows = fs.readFileSync(RESULTS, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
  const spent = rows.reduce((n, r) => n + (r.usd || 0), 0);
  const md = [`# Edits, resolution, glasses and head coverings: ${new Date().toISOString().slice(0, 10)}`, "",
    `${rows.length} documents checked with ${MODEL}, ${money(spent)}.`, "", "## Gaps found", ""];
  for (const r of rows.filter(r => (r.gaps || []).length)) {
    md.push(`### ${r.country}: ${r.doc} (\`${r.id}\`)`, `Source (${r.source_kind}): ${r.source_used || r.stored}`, "");
    for (const g of r.gaps) md.push(`- ${g}`);
    for (const k of ["edits", "glasses", "covering"]) if (r[k + "_quote"]) md.push(`- ${k} = ${r[k]}: "${r[k + "_quote"]}"`);
    if (r.min_res) md.push(`- min_res = ${JSON.stringify(r.min_res)}: "${r.min_res_quote || ""}"`);
    md.push("");
  }
  md.push("## No gap", "", ...rows.filter(r => !(r.gaps || []).length).map(r => `- ${r.country}: ${r.doc} (\`${r.id}\`), ${r.source_kind}`));
  fs.writeFileSync(path.join(OUT, "REPORT.md"), md.join("\n") + "\n");
  console.log(md.slice(0, 3).join("\n"));
}

if (STEP === "estimate") {
  const p = PRICES[MODEL];
  const per = (20000 * p.in + 2000 * p.out) / 1e6 + 0.01;
  console.log(`${presets.length} documents, ${MODEL}, about ${money(per)} each, ${money(per * presets.length)} for all.`);
} else if (STEP === "run") {
  const skip = done();
  let todo = presets.filter(p => !skip.has(p.id));
  if (A.limit) todo = todo.slice(0, Number(A.limit));
  console.log(`${todo.length} to check (${skip.size} done), ${PAR} at a time.`);
  const c = client();
  let i = 0;
  await Promise.all(Array.from({ length: PAR }, async () => {
    while (i < todo.length) {
      const p = todo[i++];
      try { const r = await checkOne(c, p); fs.appendFileSync(RESULTS, JSON.stringify(r) + "\n"); console.log(`${String((r.gaps || []).length).padEnd(3)} ${p.id} ${money(r.usd)}`); }
      catch (e) { console.log(`error ${p.id}: ${e.status || ""} ${e.message}`); }
    }
  }));
  report();
} else if (STEP === "report") report();
