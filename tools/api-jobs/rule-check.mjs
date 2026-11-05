// Checks every Picproved document preset against its official source page, using Claude's web fetch and web search
// (run on Anthropic's servers, so sites that block this cloud or Rinu's PC usually still open).
//   node tools/api-jobs/rule-check.mjs estimate
//   node tools/api-jobs/rule-check.mjs run [--ids in-passport,uk-passport-digital] [--limit 10] [--parallel 4] [--model claude-opus-5-5]
// Resumable: results are appended to out/api-jobs/rule-check/results.jsonl and done ids are skipped on the next run
// (--fresh starts over). Writes REPORT.md with every page that CHANGED or could not be checked at the top.
// Nothing in the Picproved repo is changed; a later thread turns "changed" rows into a branch.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { args, picprovedRepo, client, cost, addUsage, outDir, money, textOf, lastJson, PRICES } from "./lib.mjs";

const A = args();
const STEP = A._[0] || "estimate";
const REPO = picprovedRepo(A);
const OUT = outDir("rule-check");
const RESULTS = path.join(OUT, "results.jsonl");
const MODEL = A.model || "claude-opus-5-5";
const PAR = Number(A.parallel || 4);

const P = await import(pathToFileURL(path.join(REPO, "js/presets.js")).href);
const KEEP = ["id", "country", "doc", "mm", "px", "head", "bg", "kb", "notes", "abroad", "upload", "smileOk", "strict", "info", "unaltered", "more"];
let presets = P.PRESETS.filter(p => Array.isArray(p.src) && p.src[1]);
if (A.ids) { const want = new Set(String(A.ids).split(",")); presets = presets.filter(p => want.has(p.id)); }

const SYSTEM = `You check the photo rules in Picproved, a passport, visa, ID and exam photo app, against official sources.
For one document you get the app's stored rule and its official source link. Open the source with web_fetch. If it is dead,
moved or has no photo rules, use web_search to find the current official page (a government, embassy, consulate or the
official visa/application portal; VFS Global or BLS only when the government sends applicants there). Never treat photo
studios, photo apps or blogs as a source.

Compare only what the app stores: photo size in mm, pixel size, head height (as a share of photo height, or mm),
background colour, file size in KB, and the notes. Field meanings: mm=[width,height]; px=[width,height] or null; head=[min,max]
share of photo height; kb=[min,max]; bg=allowed backgrounds. A rule the source does not mention is "not stated", not a change.

Finish with one \`\`\`json block:
{"verdict": "same" | "changed" | "cannot_verify",
 "source_used": "url you relied on",
 "source_ok": true | false,             // false if the stored link is dead, moved or no longer has the rules
 "changes": [{"field": "kb|px|mm|head|bg|notes|src", "app": "...", "official": "...", "quote": "exact words from the source"}],
 "evidence": "one or two short exact quotes that show the rules",
 "note": "one sentence for a human, if needed"}
"same" needs a quote. If you cannot reach any official page, say cannot_verify; do not guess.`;

const tools = [
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 4, max_content_tokens: 30000 },
  { type: "web_search_20260209", name: "web_search", max_uses: 3 },
];

const done = () => fs.existsSync(RESULTS) ? new Set(fs.readFileSync(RESULTS, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l).id)) : new Set();

function prompt(p) {
  const rule = Object.fromEntries(KEEP.filter(k => p[k] !== undefined).map(k => [k, p[k]]));
  return `Document: ${p.country}, ${p.doc} (id ${p.id}).\nApp rule: ${JSON.stringify(rule)}\nOfficial source on file: ${p.src[0]} ${p.src[1]}\nToday is ${new Date().toISOString().slice(0, 10)}.`;
}

async function checkOne(c, p) {
  const messages = [{ role: "user", content: prompt(p) }];
  const usage = {};
  let msg;
  for (let turn = 0; turn < 6; turn++) {
    msg = await c.messages.create({
      model: MODEL, max_tokens: 16000, thinking: { type: "adaptive" }, output_config: { effort: "medium" },
      system: SYSTEM, tools, messages,
    });
    addUsage(usage, msg.usage);
    if (msg.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: msg.content }); // the server carries on from here
  }
  const searches = msg.usage?.server_tool_use?.web_search_requests || 0;
  const r = lastJson(textOf(msg)) || { verdict: "cannot_verify", note: `no JSON (stop: ${msg.stop_reason})` };
  return { id: p.id, country: p.country, doc: p.doc, stored: p.src[1], ...r, usd: cost(usage, MODEL) + searches * 0.01 };
}

function report() {
  const rows = fs.readFileSync(RESULTS, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
  const spent = rows.reduce((n, r) => n + (r.usd || 0), 0);
  const by = v => rows.filter(r => r.verdict === v);
  const md = [`# Rule check: ${new Date().toISOString().slice(0, 10)}`, "",
    `${rows.length} of ${presets.length} documents checked with ${MODEL}. Same ${by("same").length}, changed ${by("changed").length}, cannot verify ${by("cannot_verify").length}. Stored link broken or moved: ${rows.filter(r => r.source_ok === false).length}. Cost so far ${money(spent)}.`, "",
    "## Changed", ""];
  for (const r of by("changed")) {
    md.push(`### ${r.country}: ${r.doc} (\`${r.id}\`)`, `Source: ${r.source_used || r.stored}`, "");
    for (const ch of r.changes || []) md.push(`- **${ch.field}**: app ${ch.app} / official ${ch.official}. "${ch.quote}"`);
    if (r.note) md.push("", r.note);
    md.push("");
  }
  md.push("## Cannot verify", "", ...by("cannot_verify").map(r => `- ${r.country}: ${r.doc} (\`${r.id}\`): ${r.note || ""} ${r.stored}`), "");
  md.push("## Same (stored link moved)", "", ...by("same").filter(r => r.source_ok === false).map(r => `- ${r.country}: ${r.doc} (\`${r.id}\`): use ${r.source_used} (was ${r.stored})`), "");
  md.push("## Same", "", "| Document | Evidence |", "|---|---|", ...by("same").map(r => `| ${r.country}: ${r.doc} | ${String(r.evidence || "").replace(/\|/g, "/").replace(/\n/g, " ").slice(0, 220)} |`));
  fs.writeFileSync(path.join(OUT, "REPORT.md"), md.join("\n") + "\n");
  console.log(md.slice(0, 3).join("\n"));
}

if (STEP === "estimate") {
  const p = PRICES[MODEL];
  const per = (25000 * p.in + 3000 * p.out) / 1e6 + 0.01; // ~25k tokens of fetched pages, ~3k thinking + answer, a search
  console.log(`${presets.length} documents with a source link, model ${MODEL}. About ${money(per)} each, ${money(per * presets.length)} for all (standard price; real cost is logged per row).`);
} else if (STEP === "run") {
  if (A.fresh === true || A.fresh === "true") fs.rmSync(RESULTS, { force: true });
  const skip = done();
  let todo = presets.filter(p => !skip.has(p.id));
  if (A.limit) todo = todo.slice(0, Number(A.limit));
  console.log(`${todo.length} to check (${skip.size} already done), ${PAR} at a time.`);
  const c = client();
  let i = 0;
  await Promise.all(Array.from({ length: PAR }, async () => {
    while (i < todo.length) {
      const p = todo[i++];
      try {
        const r = await checkOne(c, p);
        fs.appendFileSync(RESULTS, JSON.stringify(r) + "\n");
        console.log(`${r.verdict.padEnd(13)} ${p.id} ${money(r.usd)}`);
      } catch (e) { console.log(`error         ${p.id}: ${e.status || ""} ${e.message}`); }
    }
  }));
  report();
} else if (STEP === "report") {
  report();
} else {
  console.error("Use: estimate | run | report");
  process.exit(2);
}
