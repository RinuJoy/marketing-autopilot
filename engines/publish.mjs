// Publisher: posts today's queued posts (from post-bank) on channels that allow it by API and are marked "auto".
// Bluesky works today with an app password. YouTube needs the video factory first; Facebook, Instagram and
// Threads go through Meta Business Suite's free scheduler using the CSV files instead.
// Dry run unless --live. Each post is posted once: what was sent is kept in state/<app>/published.json.
import { readJson, writeJson, statePath, outPath, today } from "../core/util.mjs";

export async function bluesky(post, env) {
  const id = env.BLUESKY_HANDLE, pw = env.BLUESKY_APP_PASSWORD;
  if (!id || !pw) throw new Error("BLUESKY_HANDLE and BLUESKY_APP_PASSWORD not set");
  const base = "https://bsky.social/xrpc/";
  const s = await fetch(base + "com.atproto.server.createSession", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier: id, password: pw }) });
  if (!s.ok) throw new Error(`Bluesky sign-in HTTP ${s.status}`);
  const { accessJwt, did } = await s.json();
  // Make the link clickable: Bluesky needs its byte range as a "facet".
  const text = post.text, at = text.indexOf(post.link);
  const bytes = str => Buffer.byteLength(str);
  const facets = at < 0 ? [] : [{ index: { byteStart: bytes(text.slice(0, at)), byteEnd: bytes(text.slice(0, at)) + bytes(post.link) }, features: [{ $type: "app.bsky.richtext.facet#link", uri: post.link }] }];
  const r = await fetch(base + "com.atproto.repo.createRecord", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${accessJwt}` },
    body: JSON.stringify({ repo: did, collection: "app.bsky.feed.post", record: { $type: "app.bsky.feed.post", text, facets, createdAt: new Date().toISOString() } }),
  });
  if (!r.ok) throw new Error(`Bluesky post HTTP ${r.status}`);
}

const POSTERS = { bluesky };

export async function run(app, { live = false, env = process.env, date = new Date(), posters = POSTERS } = {}) {
  const posts = await readJson(outPath(app.name, "posts", "posts.json"), null);
  if (!posts) return { summary: "no post bank yet: run post-bank first", problems: ["no posts.json"] };
  const auto = new Set((app.config.channels || []).filter(c => c.auto && posters[c.kind]).map(c => c.id));
  const kinds = Object.fromEntries((app.config.channels || []).map(c => [c.id, c.kind]));
  const file = statePath(app.name, "published.json"), done = await readJson(file, {});
  const due = posts.filter(p => p.date === today(date) && auto.has(p.channel) && !done[`${p.channel}:${p.date}:${p.item}`]);
  if (!live) return { summary: `${due.length} posts due today (dry run)`, text: due.map(p => `- ${p.channel}: ${p.text}`).join("\n"), problems: [] };
  const problems = [];
  for (const p of due) {
    try { await posters[kinds[p.channel]](p, env); done[`${p.channel}:${p.date}:${p.item}`] = new Date().toISOString(); }
    catch (e) { problems.push(`${p.channel}: ${e.message}`); }
  }
  await writeJson(file, done);
  return { summary: `${due.length - problems.length} of ${due.length} posts published`, problems };
}
