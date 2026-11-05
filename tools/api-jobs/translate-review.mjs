// Second-pass review of Picproved's 19 AI-written interface translations, as a stand-in for a native speaker.
// Runs through the Message Batches API (half price). Three steps:
//   node tools/api-jobs/translate-review.mjs estimate            free: local checks + rough cost, no key needed
//   node tools/api-jobs/translate-review.mjs submit [--langs hi,ta] [--model claude-opus-5-5] [--effort high]
//   node tools/api-jobs/translate-review.mjs collect             waits for the batch, writes one report per language
// Reports go to out/api-jobs/translate-review/: <lang>.md (for people) and <lang>.json (suggested replacements,
// keyed by i18n key, for a later "apply" step on a Picproved branch). Nothing in the Picproved repo is changed.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { args, picprovedRepo, client, cost, addUsage, outDir, roughTokens, money, textOf, PRICES } from "./lib.mjs";

const A = args();
const STEP = A._[0] || "estimate";
const REPO = picprovedRepo(A);
const OUT = outDir("translate-review");
const STATE = path.join(OUT, "state.json");
const MODEL = A.model || "claude-opus-5-5";
const EFFORT = A.effort || "high";
const CHUNK = Number(A.chunk || 110);

const NAMES = { hi: "Hindi", bn: "Bengali", ta: "Tamil", te: "Telugu", mr: "Marathi", gu: "Gujarati", kn: "Kannada", ml: "Malayalam",
  pa: "Punjabi (Gurmukhi)", ur: "Urdu", ar: "Arabic", es: "Spanish", fr: "French", pt: "Portuguese", de: "German", ru: "Russian",
  tr: "Turkish", id: "Indonesian", zh: "Simplified Chinese" };

// English lives in a non-exported const in js/i18n.js; load it through a temporary copy that exports it.
async function loadEnglish() {
  const src = fs.readFileSync(path.join(REPO, "js/i18n.js"), "utf8").replace(/^const EN = \{/m, "export const EN = {");
  const tmp = path.join(REPO, "js", `.__en_${process.pid}.mjs`);
  fs.writeFileSync(tmp, src);
  try { return (await import(pathToFileURL(tmp).href)).EN; } finally { fs.rmSync(tmp, { force: true }); }
}

async function loadLang(code) {
  const m = await import(pathToFileURL(path.join(REPO, "js/lang", code + ".js")).href);
  return { dict: m.default || {}, docs: m.DOCS || {}, say: m.SAY || {} };
}

const holes = s => (String(s).match(/\{[a-z0-9]*\}/gi) || []).sort().join(",");

// Free checks that need no model: placeholders that don't match, text still in English, empty strings.
function localChecks(EN, dict) {
  const out = [];
  for (const [k, v] of Object.entries(dict)) {
    if (!(k in EN)) continue;
    const en = String(EN[k]), tr = String(v);
    if (holes(en) !== holes(tr)) out.push({ key: k, kind: "placeholder", note: `English has ${holes(en) || "none"}, translation has ${holes(tr) || "none"}` });
    if (!tr.trim() && en.trim()) out.push({ key: k, kind: "empty" });
    else if (tr === en && /[a-z]{4,}\s+[a-z]{4,}/i.test(en)) out.push({ key: k, kind: "still English" });
  }
  return out;
}

const SYSTEM = `You review the interface translations of Picproved (picproved.com), a passport, visa, ID and exam photo app.
Users are ordinary people, many of them Indians living in the UK, applying for passports, visas, OCI cards and Indian exams.
The English text is the source of truth. The translations were written by an AI and have never been checked by a native speaker.
You are standing in for that native speaker.

House rules the translations must keep:
- Placeholders like {n}, {x}, {d}, {kb} stay exactly as written, once each.
- "Picproved" is never translated. Official document names (Passport, OCI, PAN, Aadhaar, e-Visa, DS-160 and so on) may stay in English or be
  transliterated, because the official forms use the English name. Do not flag that.
- Plain, polite, short words, as a careful local person would write on a government-help app. Use the polite form of address where the language has one.
- Numbers, sizes (mm, px, KB, MB) and prices keep their meaning exactly.
- Text in a key ending "1" is the singular form.

Report only real problems, in this order of importance:
1. wrong: the meaning differs from the English, a fact or number changed, or a reader would do the wrong thing.
2. unclear: a native reader would stumble or misunderstand (literal machine phrasing, wrong term for a common thing, broken grammar).
3. awkward: correct but clearly unnatural; only flag if a native speaker would wince.
4. placeholder: a placeholder lost, added or changed.
Do not report matters of taste. Do not rewrite text that is fine. An empty list is a good answer.
For each problem give a short English explanation and the full corrected translation for that key.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["issues"],
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "severity", "problem", "suggestion"],
        properties: {
          key: { type: "string" },
          severity: { type: "string", enum: ["wrong", "unclear", "awkward", "placeholder"] },
          problem: { type: "string" },
          suggestion: { type: "string" },
        },
      },
    },
  },
};

function chunksFor(code, EN, L) {
  const rows = Object.keys(L.dict).filter(k => k in EN).map(k => [k, String(EN[k]), String(L.dict[k])]);
  const docRows = Object.entries(L.docs).map(([en, tr]) => ["DOCS:" + en, en, String(tr)]);
  const all = [...rows, ...docRows];
  const out = [];
  for (let i = 0; i < all.length; i += CHUNK) out.push(all.slice(i, i + CHUNK));
  return out;
}

function request(code, i, rows) {
  const body = rows.map(([k, en, tr]) => JSON.stringify({ key: k, en, [code]: tr })).join("\n");
  return {
    custom_id: `${code}-${String(i).padStart(3, "0")}`,
    params: {
      model: MODEL,
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      output_config: { effort: EFFORT, format: { type: "json_schema", schema: SCHEMA } },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: `Language: ${NAMES[code]} (${code}). Keys starting "DOCS:" are document names shown in lists.\n` +
          `One JSON object per line: key, English, ${NAMES[code]}.\n\n${body}`,
      }],
    },
  };
}

async function build() {
  const EN = await loadEnglish();
  const langs = (A.langs ? String(A.langs).split(",") : Object.keys(NAMES)).filter(c => NAMES[c]);
  const reqs = [], local = {};
  for (const code of langs) {
    const L = await loadLang(code);
    local[code] = localChecks(EN, L.dict);
    chunksFor(code, EN, L).forEach((rows, i) => reqs.push(request(code, i, rows)));
  }
  return { EN, langs, reqs, local };
}

if (STEP === "estimate") {
  const { langs, reqs, local } = await build();
  const p = PRICES[MODEL];
  const inTok = reqs.reduce((n, r) => n + roughTokens(r.params.messages[0].content), 0) + reqs.length * roughTokens(SYSTEM);
  const outTok = reqs.length * 5000; // thinking + JSON; a guess until the first run measures it
  const usd = (inTok * p.in + outTok * p.out) / 1e6 / 2;
  console.log(`${langs.length} languages, ${reqs.length} requests of up to ${CHUNK} strings, model ${MODEL}, effort ${EFFORT}`);
  console.log(`~${(inTok / 1e6).toFixed(2)}M input + ~${(outTok / 1e6).toFixed(2)}M output tokens => about ${money(usd)} at batch price`);
  for (const c of langs) if (local[c].length) console.log(`  ${c}: ${local[c].length} local findings (placeholders/empty/still English)`);
  fs.writeFileSync(path.join(OUT, "local-checks.json"), JSON.stringify(local, null, 1));
} else if (STEP === "submit") {
  const { langs, reqs, local } = await build();
  const c = client();
  const batch = await c.messages.batches.create({ requests: reqs });
  fs.writeFileSync(STATE, JSON.stringify({ id: batch.id, model: MODEL, effort: EFFORT, langs, submitted: new Date().toISOString(), n: reqs.length, local }, null, 1));
  console.log(`Submitted batch ${batch.id} with ${reqs.length} requests. Run "collect" in an hour or so (it waits if not done).`);
} else if (STEP === "collect") {
  const st = JSON.parse(fs.readFileSync(STATE, "utf8"));
  const c = client();
  let b;
  for (;;) {
    b = await c.messages.batches.retrieve(st.id);
    if (b.processing_status === "ended") break;
    console.log(`${new Date().toISOString().slice(11, 16)} ${b.processing_status}: ${JSON.stringify(b.request_counts)}`);
    await new Promise(r => setTimeout(r, 60_000));
  }
  const EN = await loadEnglish();
  const per = {}, usage = {}, failed = [];
  for await (const r of await c.messages.batches.results(st.id)) {
    const code = r.custom_id.split("-")[0];
    per[code] ||= [];
    if (r.result.type !== "succeeded") { failed.push(`${r.custom_id}: ${r.result.type}`); continue; }
    const msg = r.result.message;
    addUsage(usage, msg.usage);
    if (msg.stop_reason === "refusal" || msg.stop_reason === "max_tokens") { failed.push(`${r.custom_id}: ${msg.stop_reason}`); continue; }
    try { per[code].push(...JSON.parse(textOf(msg)).issues); } catch { failed.push(`${r.custom_id}: unreadable JSON`); }
  }
  const spent = cost(usage, st.model, { batch: true });
  const order = { wrong: 0, placeholder: 1, unclear: 2, awkward: 3 };
  const summary = [`# Translation review: ${new Date().toISOString().slice(0, 10)}`, "",
    `Model ${st.model}, effort ${st.effort}, batch ${st.id}. Cost ${money(spent)} (${usage.input_tokens + (usage.cache_read_input_tokens || 0)} in, ${usage.output_tokens} out).`, "",
    "| Language | Wrong | Placeholder | Unclear | Awkward | Local checks |", "|---|---|---|---|---|---|"];
  for (const code of st.langs) {
    const issues = (per[code] || []).sort((a, b) => order[a.severity] - order[b.severity]);
    const n = s => issues.filter(i => i.severity === s).length;
    summary.push(`| ${NAMES[code]} (${code}) | ${n("wrong")} | ${n("placeholder")} | ${n("unclear")} | ${n("awkward")} | ${(st.local[code] || []).length} |`);
    const md = [`# ${NAMES[code]} (${code}): ${issues.length} issues`, "",
      "Each row: the key, what is wrong (in English), the English source, today's text and the suggested text.", ""];
    for (const i of issues) {
      const key = i.key.replace(/^DOCS:/, "");
      md.push(`## ${i.severity}: \`${i.key}\``, "", i.problem, "",
        `- English: ${i.key.startsWith("DOCS:") ? key : EN[i.key] ?? "?"}`, `- Suggested: ${i.suggestion}`, "");
    }
    if ((st.local[code] || []).length) md.push("## Local checks", "", ...st.local[code].map(l => `- \`${l.key}\`: ${l.kind}${l.note ? " (" + l.note + ")" : ""}`), "");
    fs.writeFileSync(path.join(OUT, code + ".md"), md.join("\n"));
    fs.writeFileSync(path.join(OUT, code + ".json"), JSON.stringify(Object.fromEntries(issues.map(i => [i.key, { severity: i.severity, problem: i.problem, suggestion: i.suggestion }])), null, 1));
  }
  if (failed.length) summary.push("", "Requests that need a re-run:", ...failed.map(f => "- " + f));
  fs.writeFileSync(path.join(OUT, "SUMMARY.md"), summary.join("\n") + "\n");
  console.log(summary.join("\n"));
} else {
  console.error("Use: estimate | submit | collect");
  process.exit(2);
}
