// Shared bits for the Claude API jobs: the client, prices, argument parsing and the output folder.
// The key is read from PICPROVED_API_KEY (preferred, so it never clashes with Claude Code's own ANTHROPIC_API_KEY),
// then ANTHROPIC_API_KEY. Requests always go to api.anthropic.com, so the API org's credits pay for them.
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "../..");

// $ per million tokens, standard rate (Claude API, Nov 2026). Batch is half of this.
export const PRICES = {
  "claude-fable-5-1": { in: 10, out: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

export function args(argv = process.argv.slice(2)) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i];
    if (s.startsWith("--")) {
      const [k, v] = s.slice(2).split("=");
      if (v !== undefined) a[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith("--")) a[k] = argv[++i];
      else a[k] = true;
    } else a._.push(s);
  }
  return a;
}

export function picprovedRepo(a) {
  const p = path.resolve(a.repo || process.env.PICPROVED_REPO || path.join(ROOT, "../picproved"));
  if (!fs.existsSync(path.join(p, "js/presets.js"))) {
    console.error(`Picproved repo not found at ${p}. Pass --repo <path to your picproved clone>.`);
    process.exit(2);
  }
  return p;
}

export function client() {
  const apiKey = process.env.PICPROVED_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error([
      "No API key. Set one for this window only, then run again:",
      "  PowerShell:  $env:PICPROVED_API_KEY = \"sk-ant-...\"",
      "  bash:        export PICPROVED_API_KEY=sk-ant-...",
    ].join("\n"));
    process.exit(2);
  }
  return new Anthropic({ apiKey, baseURL: "https://api.anthropic.com", maxRetries: 4 });
}

export function cost(usage, model, { batch = false } = {}) {
  const p = PRICES[model] || PRICES["claude-opus-5-5"];
  const m = batch ? 0.5 : 1;
  const u = usage || {};
  return m * ((u.input_tokens || 0) * p.in + (u.output_tokens || 0) * p.out
    + (u.cache_read_input_tokens || 0) * p.cacheRead + (u.cache_creation_input_tokens || 0) * p.cacheWrite) / 1e6;
}

export function addUsage(total, u) {
  for (const k of ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"]) total[k] = (total[k] || 0) + (u?.[k] || 0);
  return total;
}

export function outDir(job) {
  const d = path.join(ROOT, "out/api-jobs", job);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// Rough token count for estimates before anything is sent. Latin text ~4 chars a token; other scripts ~1.5.
export function roughTokens(s) {
  const str = String(s);
  const latin = (str.match(/[\x00-\x7F]/g) || []).length;
  return Math.ceil(latin / 4 + (str.length - latin) / 1.5);
}

export const money = n => "$" + n.toFixed(2);

// The text of a message, with any thinking left out.
export const textOf = msg => (msg.content || []).filter(b => b.type === "text").map(b => b.text).join("");

// The last ```json block in a reply (or the reply itself if it is bare JSON).
export function lastJson(text) {
  const blocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)].map(m => m[1]);
  const raw = blocks.length ? blocks[blocks.length - 1] : text.trim();
  try { return JSON.parse(raw); } catch { return null; }
}
