// Rule watch: opens every source page the app cites (official photo rules, away guides) and reports which changed
// since the last run, with the sentences that appeared or went. When a changed page's numbers (size, head, background,
// file size, how recent) move and the app's adapter can map them (ruleTargets + applyRule), it also writes the fix:
// a branch in the app's repository (pushed only with --push) and a patch file with a plain-English summary in
// state/<app>/rule-proposals/. Wording-only changes and numbers it can't map become notes in the report.
// State lives in state/<app>/rule-watch.json so the next run can compare; commit it after each run.
import { spawnSync } from "node:child_process";
import { get, pool } from "../core/http.mjs";
import { pageText, stableText, sha, readJson, writeJson, writeText, statePath, today } from "../core/util.mjs";
import { compare, propose, summary, branch, slugOf } from "../core/rule-propose.mjs";

export { compare };

// The words in a PDF, when pdftotext (poppler-utils) is installed; without it a PDF is watched by its hash alone.
export function pdfText(buf) {
  try {
    const r = spawnSync("pdftotext", ["-q", "-", "-"], { input: buf, maxBuffer: 20e6, timeout: 30000 });
    return r.status === 0 ? stableText(r.stdout.toString("utf8").replace(/\s+/g, " ")).slice(0, 60000) || undefined : undefined;
  } catch { return undefined; }
}

export async function check(url) {
  try {
    const res = await get(url);
    if (!res.ok) return { status: res.status };
    const type = res.headers.get("content-type") || "";
    if (/pdf|octet/.test(type) || /\.pdf($|\?)/i.test(url)) {
      const buf = Buffer.from(await res.arrayBuffer());
      return { status: 200, hash: sha(buf), pdf: true, text: pdfText(buf) };
    }
    const text = stableText(pageText(await res.text()));
    return { status: 200, hash: sha(text), text: text.slice(0, 60000) };
  } catch (e) {
    return { status: 0, error: e.name === "TimeoutError" ? "timed out" : e.cause?.code || e.message };
  }
}

// Each changed page with old and new text becomes a proposal (branch + patch), or a note. Returns what the report shows.
export async function proposals(app, pages, { date = today(), push = false, adapter, write = true } = {}) {
  const hooks = adapter || await app.adapter?.();
  const { targets = [], bgKeys = [] } = hooks?.ruleTargets ? await hooks.ruleTargets({ src: app.src }) : {};
  const out = { date, proposals: [], notes: [] };
  for (const pg of pages) {
    const p = propose({ ...pg, targets: targets.filter(t => t.url === pg.url), bgKeys });
    if (p.kind !== "proposal" || !hooks?.applyRule) {
      out.notes.push({ url: p.url, label: p.label, ids: p.ids, kind: p.kind, why: p.why || "The app has no rule editor.", facts: p.facts, sentences: p.sentences });
      continue;
    }
    let slug = slugOf(`${date}-${p.changes[0].id}${p.changes.length > 1 ? `-and-${p.changes.length - 1}` : ""}`);
    if (out.proposals.some(x => x.slug === slug)) slug += `-${out.proposals.length + 1}`;
    const message = summary(p, date), files = {};
    for (const c of p.changes) {
      const prev = files[c.file] || (s => s);
      files[c.file] = s => hooks.applyRule(prev(s), c, date);
    }
    const b = branch({ src: app.src, branch: `rules/${slug}`, files, message, push });
    const entry = { slug, url: p.url, label: p.label, ids: p.changes.map(c => c.id), branch: b.pushed ? b.branch : null, error: b.error, summary: message };
    if (write) {
      if (b.patch) entry.patch = `state/${app.name}/rule-proposals/${slug}.patch`;
      await writeText(statePath(app.name, `rule-proposals/${slug}.md`), message + "\n");
      if (b.patch) await writeText(statePath(app.name, `rule-proposals/${slug}.patch`), b.patch);
    }
    out.proposals.push(entry);
  }
  if (write) await writeJson(statePath(app.name, "rule-proposals.json"), out);
  return out;
}

export function proposalText(out) {
  const s = [];
  if (out.proposals.length) s.push("\n## Proposed fixes\n\n" + out.proposals.map(p =>
    `### ${p.label}: ${p.ids.join(", ")}\n${p.branch ? `Branch: ${p.branch}` : p.patch ? `Patch: ${p.patch} (branch not pushed${p.error ? `: ${p.error}` : ""})` : `No patch: ${p.error}`}\n\n${p.summary}`).join("\n\n"));
  if (out.notes.length) s.push("\n## Changed, but no fix proposed\n\n" + out.notes.map(n =>
    `- ${n.label} (${n.url}), used by ${n.ids.join(", ") || "nothing"}: ${n.why}${n.facts?.length ? " " + n.facts.join("; ") + "." : ""}`).join("\n"));
  return s.join("\n");
}

export async function run(app, { fetcher = check, concurrency = 4, push = false, adapter, date = today() } = {}) {
  const items = await app.items(), file = statePath(app.name, "rule-watch.json");
  const state = await readJson(file, {});
  const byUrl = new Map();
  for (const it of items) for (const s of it.sources) {
    if (!byUrl.has(s.url)) byUrl.set(s.url, { label: s.label, items: [] });
    byUrl.get(s.url).items.push(it.id);
  }
  const urls = [...byUrl.keys()], changed = [], broken = [], fresh = [], pages = [];
  const results = await pool(urls, concurrency, fetcher);
  urls.forEach((url, i) => {
    const r = results[i], prev = state[url], who = byUrl.get(url).items.join(", ");
    if (r.status !== 200) {
      broken.push(`- ${url} (${r.error || "HTTP " + r.status}) used by ${who}`);
      state[url] = { ...prev, lastError: r.error || r.status, lastTried: date };
      return;
    }
    if (!prev?.hash) fresh.push(url);
    else if (prev.hash !== r.hash) {
      const canRead = prev.text && r.text;
      const d = canRead ? compare(prev.text, r.text) : { added: ["(PDF changed: open it and compare)"], removed: [] };
      changed.push(`### ${byUrl.get(url).label}\n${url}\nUsed by: ${who}\n` +
        d.added.map(s => `+ ${s}`).join("\n") + (d.removed.length ? "\n" + d.removed.map(s => `- ${s}`).join("\n") : ""));
      pages.push({ url, label: byUrl.get(url).label, before: prev.text || "", after: r.text || "", unreadable: !canRead });
    }
    state[url] = { hash: r.hash, text: r.text, pdf: r.pdf || undefined, since: prev?.hash === r.hash ? prev.since : date, checked: date };
  });
  await writeJson(file, state);
  const readable = pages.filter(p => !p.unreadable);
  const out = await proposals(app, readable, { date, push, adapter });
  for (const p of pages.filter(p => p.unreadable)) out.notes.push({ url: p.url, label: p.label, ids: byUrl.get(p.url).items, kind: "pdf", why: "A PDF changed and its text couldn't be read: open it and compare." });
  await writeJson(statePath(app.name, "rule-proposals.json"), out);
  const text = [
    `${urls.length} source pages checked: ${changed.length} changed, ${broken.length} not reachable, ${fresh.length} seen for the first time.`,
    changed.length ? "\n## Changed\n\n" + changed.join("\n\n") : "",
    proposalText(out),
    broken.length ? "\n## Not reachable (check by hand; some sites block robots)\n\n" + broken.join("\n") : "",
  ].join("\n");
  const problems = [];
  if (changed.length) problems.push(`${changed.length} source pages changed`);
  if (out.proposals.length) problems.push(`${out.proposals.length} rule fixes proposed: ${out.proposals.map(p => p.branch || p.patch || p.slug).join(", ")}`);
  return { summary: `${app.config.name}: ${changed.length} changed (${out.proposals.length} fixes proposed), ${broken.length} unreachable of ${urls.length}`, text, problems };
}
