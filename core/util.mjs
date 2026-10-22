import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ROOT } from "./app.mjs";

export const sha = s => createHash("sha256").update(s).digest("hex").slice(0, 16);

// Fills "{title} in {facts.0}" from an object. Unknown keys stay visible so a broken template is easy to spot.
export function fill(tpl, data) {
  return tpl.replace(/\{([a-zA-Z0-9_.]+)\}/g, (m, path) => {
    const v = path.split(".").reduce((o, k) => (o == null ? o : o[k]), data);
    return v == null ? m : Array.isArray(v) ? v.join(", ") : String(v);
  });
}

// Page text without markup, scripts, styles or whitespace noise, so a hash changes only when the words change.
export function pageText(html) {
  return html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
}

// Lines that look like dates, times or counters change on every visit; dropping them keeps rule-watch quiet.
export function stableText(text) {
  return text
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, "")
    .replace(/\b(last (updated|modified|reviewed)|page last|updated on|published)[^.]{0,40}/gi, "")
    .replace(/\b\d{1,2} (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{4}\b/gi, "")
    .replace(/\s+/g, " ").trim();
}

export const statePath = (app, file) => join(ROOT, "state", app, file);
export const outPath = (app, ...parts) => join(ROOT, "out", app, ...parts);

export async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
}
export async function writeText(path, text) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
  return path;
}
export const writeJson = (path, data) => writeText(path, JSON.stringify(data, null, 1) + "\n");

export function csv(rows) {
  const cell = v => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return rows.map(r => r.map(cell).join(",")).join("\n") + "\n";
}

export const today = (d = new Date()) => d.toISOString().slice(0, 10);
