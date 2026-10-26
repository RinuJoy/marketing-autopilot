import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { parseReel, parseShow, checkReel, timeReel, cueTimes, chunks, spread, reelLength } from "../engines/reel.mjs";

const demo = `title: Demo
description: Line one
description: Line two
tags: #a, b
voice.kokoro: bf_emma
pronounce: OCI=O.C.I.
---
show: title
text: Hello there
say: Hello there, friend.
---
show: photo face=44 bg="cream" size=35x45mm on=above
say: Take it from above.
---
show: list ✓ Eyes closed | ✗ No toys
say: Their eyes can be closed. No toys.
`;

test("a reel script reads into a header and scenes", () => {
  const r = parseReel(demo, "demo");
  assert.equal(r.description, "Line one\nLine two");
  assert.deepEqual(r.tags, ["a", "b"]);
  assert.equal(r.voice.kokoro, "bf_emma");
  assert.equal(r.pronounce.OCI, "O.C.I.");
  assert.equal(r.scenes.length, 3);
  assert.deepEqual(parseShow('photo face=44 bg="light grey" a | b'), { type: "photo", args: { face: "44", bg: "light grey" }, items: ["a", "b"] });
  assert.deepEqual(r.scenes[2].show.items, ["✓ Eyes closed", "✗ No toys"]);
  assert.deepEqual(checkReel(r, { faces: ["44"] }), []);
  assert.ok(checkReel(r, { faces: [], neverSay: ["toys"] }).some(p => /no face 44/.test(p)));
  assert.ok(checkReel(r, { faces: ["44"], neverSay: ["toys"] }).some(p => /says "toys"/.test(p)));
});

test("scenes are timed to the voice, and list items land on their words", () => {
  const r = parseReel(demo, "demo");
  const said = r.scenes.map(s => ({ secs: 2, words: null }));
  const scenes = timeReel(r, said);
  assert.deepEqual(scenes.map(s => s.at), [0, 3, 6]);
  assert.equal(reelLength(scenes), 9);
  const ws = scenes[2].words;
  assert.equal(ws[0].s, 6 + 0.35);
  const cues = cueTimes(scenes[2].show.items, ws, scenes[2].secs, scenes[2].at);
  assert.ok(cues[0] > 0 && cues[0] < cues[1], cues.join());
  assert.ok(Math.abs(cues[1] - (ws.find(w => w.w === "toys.").s - 6)) < 1e-9);
  // Silent: reading pace, and never shorter than asked.
  assert.ok(timeReel(r)[0].secs >= 2);
  assert.deepEqual(chunks(spread("One two three four five six.", 3)).map(c => c.words.length), [4, 2]);
});

test("every Picproved reel script is complete", async () => {
  const faces = readdirSync("apps/picproved/reels/assets").map(f => f.match(/^face-(\w+)\./)?.[1]).filter(Boolean);
  const { neverSay } = JSON.parse(readFileSync("apps/picproved/app.json", "utf8"));
  const files = readdirSync("apps/picproved/reels").filter(f => f.endsWith(".txt"));
  assert.ok(files.length >= 3);
  for (const f of files) assert.deepEqual(checkReel(parseReel(readFileSync("apps/picproved/reels/" + f, "utf8"), f.slice(0, -4)), { faces, neverSay }), [], f);
});
