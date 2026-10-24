import test from "node:test";
import assert from "node:assert/strict";
import { checkItem } from "../core/item.mjs";
import { fill, pageText, stableText, csv } from "../core/util.mjs";
import { tracked } from "../core/utm.mjs";
import { inSeason, seasonOrder } from "../engines/seasons.mjs";
import { render, schedule, banned } from "../engines/post-bank.mjs";
import { compare } from "../engines/rule-watch.mjs";
import { llms } from "../engines/llms-txt.mjs";
import { kit } from "../engines/launch-kit.mjs";
import { urlsFromSitemap } from "../engines/indexnow.mjs";
import { pick } from "../engines/search-opportunities.mjs";
import { uncovered } from "../engines/search-ideas.mjs";
import { draft } from "../engines/reply-drafts.mjs";
import { compose, focusLine } from "../engines/weekly-report.mjs";

const item = (id, extra = {}) => ({ id, title: `Item ${id}`, summary: "Facts.", url: `https://x.test/doc/${id}`, country: "GB", countryName: "United Kingdom",
  facts: ["35×45 mm", "White background"], questions: [], sources: [{ label: "gov", url: "https://gov.test/a" }], tags: ["visa"], ...extra });
const config = {
  id: "demo", name: "Demo", site: "https://x.test/", itemPages: true, tagline: "Photos to the rules", promise: "No ads.",
  neverSay: ["guaranteed"], channels: [{ id: "bluesky", kind: "bluesky", auto: true, perDay: 1, time: "09:00", max: 120, text: "{title}: {facts.0}. {summary} {link}" }],
  seasons: [{ name: "DV", months: [10], ids: ["b"] }, { name: "Exams", months: [11], tags: ["exam"] }],
  directories: [{ name: "AlternativeTo", url: "https://alternativeto.net/" }],
};

test("items are checked", () => {
  assert.deepEqual(checkItem(item("a")), []);
  assert.ok(checkItem({ ...item("a"), id: "Bad Id" }).length);
  assert.ok(checkItem({ ...item("a"), url: "http://x" }).length);
});

test("templates, text and links", () => {
  assert.equal(fill("{title} {facts.0} {nope}", item("a")), "Item a 35×45 mm {nope}");
  assert.equal(pageText("<head><title>x</title></head><p>Hi&nbsp;<b>there</b></p><script>1</script>"), "Hi there");
  assert.equal(stableText("Rules. Last updated 3 March 2026 12:30"), "Rules.");
  assert.equal(csv([["a", 'b"c', "d,e"]]), 'a,"b""c","d,e"\n');
  assert.equal(tracked("https://x.test/doc/a", { source: "Blue Sky", campaign: "launch" }), "https://x.test/doc/a?utm_source=blue-sky&utm_medium=social&utm_campaign=launch");
});

test("seasons pick items by id and tag and order queues", () => {
  const items = [item("a"), item("b"), item("c", { tags: ["exam"] })];
  assert.deepEqual([...inSeason(config, items, 10).items.keys()], ["b"]);
  assert.deepEqual(seasonOrder(config, items, new Date("2026-10-05")).map(i => i.id), ["b", "c", "a"]);
});

test("posts keep the link within the length limit and skip banned words", () => {
  const long = item("a", { summary: "word ".repeat(80) });
  const p = render(config, config.channels[0], long, "c");
  assert.ok(p.text.length <= 120, p.text.length);
  assert.ok(p.text.endsWith(p.link));
  assert.deepEqual(banned(config, "Approval GUARANTEED"), ["guaranteed"]);
  const { posts, problems } = schedule(config, [item("a"), item("b", { summary: "guaranteed" })], { start: new Date("2026-10-01"), days: 4 });
  assert.equal(posts.length, 4);
  assert.ok(posts.every(p => p.item === "a"));
  assert.deepEqual(problems, ["bluesky/b: uses guaranteed"]);
  assert.deepEqual(posts.map(p => p.date), ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
});

test("rule watch reports added and removed sentences", () => {
  const d = compare("The photo must be 35 by 45 millimetres. Background must be light grey.", "The photo must be 35 by 45 millimetres. Background must be plain white or cream.");
  assert.deepEqual(d.added, ["Background must be plain white or cream."]);
  assert.deepEqual(d.removed, ["Background must be light grey."]);
});

test("llms.txt, launch kit, sitemap", () => {
  const t = llms(config, [item("a")]);
  assert.match(t, /^# Demo/);
  assert.match(t, /- \[Item a\]\(https:\/\/x.test\/doc\/a\): 35×45 mm; White background\. Source: https:\/\/gov.test\/a/);
  const k = kit(config, [item("a")]);
  assert.match(k.text, /- \[ \] \[AlternativeTo\]/);
  assert.deepEqual(k.problems, []);
  assert.deepEqual(urlsFromSitemap("<urlset><url><loc>https://x.test/</loc></url><url><loc> https://x.test/a?b=1&amp;c=2 </loc></url></urlset>"), ["https://x.test/", "https://x.test/a?b=1&c=2"]);
});

test("search and replies", () => {
  const rows = [{ key: "a", impressions: 500, ctr: 0.01, position: 8, clicks: 5 }, { key: "b", impressions: 500, ctr: 0.1, position: 3, clicks: 50 }];
  assert.deepEqual(pick(rows).map(r => r.key), ["a"]);
  assert.deepEqual(uncovered(["item a united kingdom", "baby passport photo india"], [item("a")]), ["baby passport photo india"]);
  assert.match(draft({ name: "Demo", contact: "help@x.test" }, { stars: 1 }), /help@x.test/);
  assert.match(draft({ name: "Demo" }, { stars: 5 }), /Thank you/);
});

test("weekly report lists what is off and the week's to-dos", () => {
  const text = compose({ name: "demo", config }, [item("a"), item("c", { tags: ["exam"] })], {
    data: { searchConsole: [{ key: "https://x.test/doc/a", clicks: 2, impressions: 300, ctr: 0.006, position: 9 }] }, off: ["paddle: PADDLE_API_KEY not set"],
  }, new Date("2026-10-12"));
  assert.match(text, /## This week\n\n1\. Rewrite the title/);
  assert.match(text, /Next month: Exams/);
  assert.match(text, /paddle: PADDLE_API_KEY not set/);
});

test("the focus line counts the target country's orders for its documents", () => {
  const focus = { name: "Indians in the UK", from: "2026-10-24", review: "2027-01-31", country: "GB", docs: ["in-", "sig-oci"], target: 30, else: "switch" };
  const orders = [{ country: "GB", doc: "in-oci" }, { country: "GB", doc: "sig-oci" }, { country: "GB", doc: "uk-passport-digital" }, { country: "US", doc: "in-oci" }];
  const a = focusLine(focus, orders, new Date("2026-11-01"));
  assert.equal(a.n, 2);
  assert.match(a.text, /2 of 30 orders since 2026-10-24/);
  assert.match(a.text, /13 weeks left/);
  const b = focusLine(focus, orders, new Date("2027-02-01"));
  assert.ok(b.due);
  assert.match(b.text, /Under target: switch/);
  const text = compose({ name: "demo", config: { ...config, focus } }, [item("a")], { data: { focus: { orders } }, off: [] }, new Date("2027-02-01"));
  assert.match(text, /## This week\n\n1\. Decide the focus: 2 of 30/);
});

test("the Google key can be pasted as JSON or base64", async () => {
  const { readKey } = await import("../core/google.mjs");
  const key = { client_email: "a@b.iam.gserviceaccount.com", private_key: "x\ny" };
  assert.deepEqual(readKey(JSON.stringify(key, null, 2)), key);
  assert.deepEqual(readKey(" " + Buffer.from(JSON.stringify(key)).toString("base64") + "\n"), key);
});

test("video scenes add up, end on the site card, and each has time to be read", async () => {
  const { timeline, withEnd, length, checkVideo } = await import("../engines/video.mjs");
  const v = { id: "demo", scenes: [{ secs: 4, title: "One two three" }, { secs: 2, title: "A much longer line of text than two seconds allows for anyone", shot: "x" }] };
  const all = timeline(withEnd(v, { site: "https://x.test/" }));
  assert.deepEqual(all.map(s => s.at), [0, 4, 6]);
  assert.equal(all.at(-1).title, "x.test");
  assert.equal(length(all), 9);
  const p = checkVideo(v, ["y"]);
  assert.ok(p.some(x => /has 12 words for 2s/.test(x)));
  assert.ok(p.some(x => /no shot "x"/.test(x)));
  const { videos } = await import("../apps/picproved/videos.mjs");
  for (const pv of videos) assert.deepEqual(checkVideo(pv), [], pv.id);
});
