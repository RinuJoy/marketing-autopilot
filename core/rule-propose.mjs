// Turns a changed official page into a proposed fix. The numbers on the page before and after (core/rule-facts.mjs)
// are matched against the app's own values for every item that cites the page; a number the app uses that went away
// and has exactly one replacement becomes a proposed edit. Everything else (wording only, or numbers that can't be
// matched) becomes a note for a person. The edit goes on a branch in the app's repository and into a patch file; it
// never merges and never changes the version.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extract, diffFacts, kindName, show } from "./rule-facts.mjs";

const sentences = t => new Set(t.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 20 && s.length < 400));

// The sentences that appeared and went between two versions of a page.
// Pages written as lists have few full stops, so when no whole sentence differs the words around the first change are shown.
export function compare(before, after) {
  const a = sentences(before || ""), b = sentences(after);
  const added = [...b].filter(s => !a.has(s)).slice(0, 8), removed = [...a].filter(s => !b.has(s)).slice(0, 8);
  if (added.length || removed.length || !before || before === after) return { added, removed };
  let i = 0, j = 0;
  while (i < before.length && i < after.length && before[i] === after[i]) i++;
  while (j < before.length - i && j < after.length - i && before[before.length - 1 - j] === after[after.length - 1 - j]) j++;
  const cut = (t, from, to) => "…" + t.slice(Math.max(0, from - 120), Math.min(t.length, to + 120)).trim() + "…";
  return { added: [cut(after, i, after.length - j)], removed: [cut(before, i, before.length - j)] };
}

const same = (p, q, tol = 0.5) => p.length === q.length && p.every((v, i) => Math.abs(v - q[i]) <= tol);
const has = (list, v, tol) => list.some(x => same([].concat(x), [].concat(v), tol));
const r2 = v => Math.round(v * 100) / 100;

// One app item against one page change. `t` holds the item's current values: mm, px, head (share of photo height),
// bg (colour keys), kb ([min, max]), notes. Returns the fields to change and the text to swap in its notes.
export function matchTarget(t, before, after, diff, bgKeys = []) {
  const fields = {}, swap = [], used = new Set();
  const pair = (k, label) => {
    const d = diff[k];
    if (!t[k] || !d || !has(before[k], t[k]) || has(after[k], t[k]) || d.added.length !== 1) return;
    fields[k] = d.added[0];
    swap.push([`${t[k][0]}×${t[k][1]}${label}`, `${d.added[0][0]}×${d.added[0][1]}${label}`]);
    used.add(k);
  };
  pair("mm", " mm");
  pair("px", "");

  if (t.kb && diff.kb) {
    // 1 MB is 1000 KB to some offices and 1024 KB to others, so a value within 3% counts as the same.
    const near = (list, v) => list.some(x => Math.abs(x - v) <= Math.max(0.5, v * 0.03));
    const gone = t.kb.map((v, i) => v > 0 && near(before.kb, v) && !near(after.kb, v) ? i : -1).filter(i => i >= 0);
    const add = [...diff.kb.added].sort((a, b) => a - b);
    if (gone.length && gone.length === add.length) {
      const next = [...t.kb];
      const mb = v => v % 1024 === 0 ? v / 1024 : v % 1000 === 0 ? v / 1000 : null;
      gone.forEach((i, n) => {
        const o = t.kb[i], w = add[n];
        next[i] = w;
        swap.push([`${o} KB`, `${w} KB`], [`${o}KB`, `${w}KB`]);
        if (mb(o)) swap.push([`${mb(o)} MB`, mb(w) ? `${mb(w)} MB` : `${w} KB`], [`${mb(o)}MB`, mb(w) ? `${mb(w)}MB` : `${w}KB`]);
      });
      if (next[0] <= next[1]) { fields.kb = next; used.add("kb"); }
    }
  }

  if (t.head) {
    const H = t.mm?.[1], mmNow = H && [t.head[0] * H, t.head[1] * H], pctNow = [t.head[0] * 100, t.head[1] * 100];
    const dm = diff.headMm, dp = diff.headPct;
    if (mmNow && dm && dm.added.length === 1 && dm.removed.some(x => same(x, mmNow, 0.6))) {
      fields.head = { mm: dm.added[0], of: H };
      swap.push([`${dm.removed.find(x => same(x, mmNow, 0.6)).join("–")} mm`, `${dm.added[0].join("–")} mm`]);
      used.add("headMm");
    } else if (dp && dp.added.length === 1 && dp.removed.some(x => same(x, pctNow, 2))) {
      fields.head = { share: dp.added[0].map(v => r2(v / 100)) };
      const old = dp.removed.find(x => same(x, pctNow, 2));
      swap.push([`${old[0]}–${old[1]}%`, `${dp.added[0][0]}–${dp.added[0][1]}%`], [`${old[0]}-${old[1]}%`, `${dp.added[0][0]}-${dp.added[0][1]}%`]);
      used.add("headPct");
    }
  }

  if (t.bg && diff.bg) {
    const known = list => list.filter(k => bgKeys.includes(k)).sort();
    const was = known(before.bg), now = known(after.bg);
    if (was.join() === [...t.bg].sort().join() && now.length && now.join() !== was.join()) { fields.bg = now; used.add("bg"); }
  }

  if (diff.valid && diff.valid.removed.length === 1 && diff.valid.added.length === 1) {
    const [old] = diff.valid.removed, [now] = diff.valid.added;
    if ((t.notes || []).some(n => n.includes(old))) { swap.push([old, now]); used.add("valid"); }
  }
  const notes = (t.notes || []).join("\n");
  return { fields, swap: swap.filter(([o]) => notes.includes(o)), used };
}

const describe = diff => Object.entries(diff).map(([k, d]) =>
  `${kindName(k)}: ${d.removed.length ? "was " + d.removed.map(v => show(k, v)).join(", ") : "nothing before"}; ${d.added.length ? "now " + d.added.map(v => show(k, v)).join(", ") : "now gone"}`);

// One changed page. targets: the app's items that cite this page, each with its current values.
export function propose({ url, label, before = "", after = "", targets = [], bgKeys = [] }) {
  const a = extract(before), b = extract(after), diff = diffFacts(a, b), text = compare(before, after);
  const base = { url, label, ids: targets.map(t => t.id), sentences: text, facts: describe(diff) };
  if (!Object.keys(diff).length) return { ...base, kind: "wording", why: "The wording changed but no size, head, background, file-size or date number did." };
  const changes = [], used = new Set();
  for (const t of targets) {
    const m = matchTarget(t, a, b, diff, bgKeys);
    m.used.forEach(k => used.add(k));
    if (Object.keys(m.fields).length || m.swap.length) changes.push({ id: t.id, file: t.file, before: t, fields: m.fields, swap: m.swap });
  }
  const left = Object.keys(diff).filter(k => !used.has(k));
  const unmapped = left.length ? describe(Object.fromEntries(left.map(k => [k, diff[k]]))) : [];
  if (!changes.length) return { ...base, kind: "unmapped", unmapped, why: targets.length ? "Numbers changed, but none is a value the app uses with a single clear replacement." : "No item in the app cites this page." };
  return { ...base, kind: "proposal", changes, unmapped };
}

export const slugOf = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);

const fmt = (k, v) => k === "head" ? (v.mm ? `${v.mm[0]}–${v.mm[1]} mm of ${v.of} mm` : `${v.share[0]}–${v.share[1]} of the height`) : JSON.stringify(v);
const was = (k, t) => k === "head" ? `${r2(t.head[0])}–${r2(t.head[1])} of the height` : JSON.stringify(t[k]);

// The plain-English note that goes in the commit message, the patch file and the report.
export function summary(p, date) {
  const lines = [`Rule change: ${p.label} (${date})`, "", `Official page: ${p.url}`, `Used by: ${p.ids.join(", ") || "nothing in the app"}`, "", "What the page says now:"];
  lines.push(...p.facts.map(f => `- ${f}`));
  if (p.changes?.length) {
    lines.push("", "Proposed change:");
    for (const c of p.changes) {
      for (const [k, v] of Object.entries(c.fields)) lines.push(`- ${c.id}: ${k} ${was(k, c.before)} -> ${fmt(k, v)}`);
      for (const [o, n] of c.swap) lines.push(`- ${c.id}: in its notes, "${o}" -> "${n}"`);
      lines.push(`- ${c.id}: checked: "${date}"`);
    }
  }
  if (p.unmapped?.length) lines.push("", "Not changed automatically (check by hand):", ...p.unmapped.map(u => `- ${u}`));
  if (p.sentences.added.length || p.sentences.removed.length) {
    lines.push("", "Sentences on the official page that changed:");
    lines.push(...p.sentences.removed.map(s => `- ${s}`), ...p.sentences.added.map(s => `+ ${s}`));
  }
  lines.push("", "Made by marketing-autopilot rule-watch. Not merged and no version bump: open the page, check the numbers, then fold it into the next release.");
  return lines.join("\n");
}

const git = (cwd, ...args) => execFileSync("git", ["-c", "user.name=Marketing autopilot", "-c", "user.email=support@picproved.com", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

// Puts the edited files on a new branch of the app's repository (in a throwaway worktree, so the checkout the engines
// read stays as it is), returns the patch, and pushes only when asked. Returns { branch, patch, pushed, error }.
export function branch({ src, branch: name, files, message, push = false }) {
  const dir = mkdtempSync(join(tmpdir(), "rule-"));
  try {
    git(src, "worktree", "add", "-q", "-B", name, dir, "HEAD");
    for (const [file, edit] of Object.entries(files)) writeFileSync(join(dir, file), edit(readFileSync(join(dir, file), "utf8")));
    git(dir, "commit", "-q", "-a", "-m", message);
    const patch = git(dir, "format-patch", "-1", "--stdout");
    let pushed = false, error;
    if (push) {
      try { git(dir, "push", "-q", "-u", "origin", name); pushed = true; } catch (e) { error = `push failed: ${(e.stderr || e.message).trim().split("\n").pop()}`; }
    }
    return { branch: name, patch, pushed, error };
  } catch (e) {
    return { branch: name, patch: "", pushed: false, error: (e.stderr || e.message || "").toString().trim().split("\n").pop() };
  } finally {
    try { git(src, "worktree", "remove", "--force", dir); } catch { rmSync(dir, { recursive: true, force: true }); }
  }
}
