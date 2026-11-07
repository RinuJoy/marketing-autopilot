// Finds the official passport photo rule for countries Picproved doesn't cover yet, using Claude's web search and
// web fetch on Anthropic's servers. One country at a time, resumable, with a hard spending cap.
//   node tools/api-jobs/country-research.mjs run --countries "Zimbabwe:ZW,Zambia:ZM" [--model claude-sonnet-5-5] [--cap 15] [--parallel 4]
//   node tools/api-jobs/country-research.mjs report
// Results: out/api-jobs/country-research/results.jsonl (one JSON per country) and REPORT.md.
// Nothing in the Picproved repo is changed; a Picproved branch turns "found" rows into presets.
import fs from "node:fs";
import path from "node:path";
import { args, client, cost, addUsage, outDir, money, textOf, lastJson } from "./lib.mjs";

const A = args();
const STEP = A._[0] || "run";
const OUT = outDir("country-research");
const RESULTS = path.join(OUT, "results.jsonl");
const MODEL = A.model || "claude-sonnet-5-5";
const PAR = Number(A.parallel || 4);
const CAP = Number(A.cap || 15);

const SYSTEM = `You research the official PASSPORT photo rule of one country for Picproved, a passport photo app.
Use web_search, then web_fetch the best official page: the government's passport/immigration office, the foreign
ministry, or that country's embassy or high commission (in the UK, US or elsewhere). Never use photo studios, photo apps,
blogs or visa agencies as the source. Prefer the page an applicant abroad would follow.
Many countries now take the passport photo themselves at the biometric appointment; if official pages say so, set
office_photo=true and quote it (verdict "found"). Budget your tools: search, then fetch the one or two best pages.

Report only what the source says. Fields: mm=[width,height] in millimetres; px=[width,height] if a digital upload size
is given, else null; head=[min,max] head height (chin to crown) in mm if given, else null; bg=allowed backgrounds from
"white","offwhite","grey","blue","red" (light grey = "grey", cream/off-white = "offwhite"); kb=[min,max] upload file size
in KB if given, else null; office_photo=true if the office takes the photo itself at the appointment (nothing to bring).

Finish with one \`\`\`json block:
{"verdict": "found" | "partial" | "not_found",
 "mm": [w,h] | null, "px": [w,h] | null, "head": [min,max] | null, "bg": [...] | null, "kb": [min,max] | null,
 "office_photo": true | false,
 "source_name": "short name, e.g. 'High Commission of Zambia, London'", "source_url": "https://...",
 "quote": "exact words from the source that give the size/background",
 "extra": ["up to 3 short rules worth showing, e.g. 'No glasses', 'Ears visible'"],
 "note": "one sentence for a human if anything is unclear"}
"found" = size and background both quoted from an official page. "partial" = an official page gives some of it.
"not_found" = no official page with photo rules. Never guess a value; use null.`;

const tools = [
  { type: "web_search_20260209", name: "web_search", max_uses: Number(A.searches || 4) },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: Number(A.fetches || 4), max_content_tokens: 20000 },
];

const rows = () => fs.existsSync(RESULTS) ? fs.readFileSync(RESULTS, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)) : [];
const spent = () => rows().reduce((n, r) => n + (r.usd || 0), 0);

async function one(c, name, iso) {
  const messages = [{ role: "user", content: `Country: ${name} (${iso}). Document: ordinary passport. Today is ${new Date().toISOString().slice(0, 10)}.` }];
  const usage = {};
  let msg, searches = 0;
  for (let turn = 0; turn < 5; turn++) {
    msg = await c.messages.create({ model: MODEL, max_tokens: 8000, output_config: { effort: A.effort || "medium" }, system: SYSTEM, tools, messages });
    addUsage(usage, msg.usage);
    searches += msg.usage?.server_tool_use?.web_search_requests || 0;
    if (msg.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: msg.content });
  }
  const r = lastJson(textOf(msg)) || { verdict: "not_found", note: `no JSON (stop: ${msg.stop_reason})` };
  return { country: name, iso, ...r, model: MODEL, usd: cost(usage, MODEL) + searches * 0.01 };
}

if (STEP === "run") {
  const want = String(A.countries || "").split(",").filter(Boolean).map(s => s.split(":"));
  const have = new Set(rows().map(r => r.iso));
  const todo = want.filter(([, iso]) => !have.has(iso));
  const c = client();
  let total = spent();
  console.log(`${todo.length} to do, ${money(total)} spent so far, cap ${money(CAP)}`);
  let i = 0;
  await Promise.all(Array.from({ length: PAR }, async () => {
    while (i < todo.length) {
      if (total >= CAP) { console.log("cap reached, stopping"); return; }
      const [name, iso] = todo[i++];
      try {
        const r = await one(c, name, iso);
        total += r.usd;
        fs.appendFileSync(RESULTS, JSON.stringify(r) + "\n");
        console.log(`${iso} ${r.verdict} ${JSON.stringify(r.mm)} ${r.bg} ${money(r.usd)} (total ${money(total)})`);
      } catch (e) { console.error(iso, e.status || "", e.message); }
    }
  }));
  STEP_REPORT();
} else STEP_REPORT();

function STEP_REPORT() {
  const all = rows();
  const md = [`# Country research: ${new Date().toISOString().slice(0, 10)}`, "", `${all.length} countries, ${money(spent())} spent.`, ""];
  for (const v of ["found", "partial", "not_found"]) {
    const g = all.filter(r => r.verdict === v);
    md.push(`## ${v} (${g.length})`, "");
    for (const r of g) md.push(`- **${r.country}** ${JSON.stringify(r.mm)} ${r.bg || ""} ${r.kb ? "kb " + JSON.stringify(r.kb) : ""}${r.office_photo ? " OFFICE TAKES PHOTO" : ""} — [${r.source_name || "?"}](${r.source_url || ""})${r.quote ? `: "${String(r.quote).slice(0, 200)}"` : ""}${r.note ? ` _${r.note}_` : ""}`);
    md.push("");
  }
  fs.writeFileSync(path.join(OUT, "REPORT.md"), md.join("\n"));
}
