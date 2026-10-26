// Rule-change automation: the number reader on saved official page text, matching to the app's values, the edit to
// js/presets.js, the branch and patch, the report section and the checklist of blocked pages.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extract, diffFacts } from "../core/rule-facts.mjs";
import { propose, summary, branch } from "../core/rule-propose.mjs";
import { proposals } from "../engines/rule-watch.mjs";
import { applyRule } from "../apps/picproved/adapter.mjs";
import { values, html, markdown } from "../engines/blocked-checklist.mjs";
import { compose, checklistDue } from "../engines/weekly-report.mjs";

const page = name => readFileSync(new URL(`./fixtures/rule-pages/${name}.txt`, import.meta.url), "utf8");
const BG = ["white", "offwhite", "grey", "cream", "blue"];
const ukDigital = { id: "uk-passport-digital", url: "https://www.gov.uk/photos-for-passports", file: "js/presets.js", mm: [35, 45], px: [700, 900], head: [29 / 45, 34 / 45], bg: ["cream", "grey"], kb: [50, 10240], notes: ["At least 600×750 px", "JPEG, 50 KB to 10 MB"] };
const inEvisa = { id: "in-evisa", url: "https://indianvisaonline.gov.in/visa/instruction.html", file: "js/presets.js", mm: [51, 51], px: [600, 600], head: [0.49, 0.69], bg: ["white"], kb: [10, 300], notes: ["JPEG, 10 to 300 KB"] };

test("the number reader finds sizes, file limits, head size, background and how recent", () => {
  assert.deepEqual(extract(page("gov-uk-passport.before")), { mm: [], px: [[600, 750]], kb: [50, 10240], headMm: [], headPct: [], bg: ["lightcolour"], valid: ["1 month"] });
  const iv = extract(page("india-evisa.before"));
  assert.deepEqual([iv.kb, iv.headMm, iv.bg], [[10, 300], [[25, 35]], ["lightcolour", "white"]]);
  const t = extract("Photo 35mm x 45mm (or 3.5 x 4.5 cm), 2 x 2 inches for the US, 45mm high and 35mm wide. Face 70-80% of the photo. Taken within the last 6 months. File 10 to 250 KB, at most 2 MB. Plain white or off-white background, not blue.");
  assert.deepEqual(t.mm, [[35, 45], [50.8, 50.8]]);
  assert.deepEqual(t.kb, [10, 250, 2048]);
  assert.deepEqual(t.headPct, [[70, 80]]);
  assert.deepEqual(t.bg, ["offwhite", "white"]);
  assert.deepEqual(t.valid, ["6 months"]);
  assert.deepEqual(diffFacts(extract("Size 35 x 45 mm."), extract("Size 40 x 50 mm.")), { mm: { removed: [[35, 45]], added: [[40, 50]] } });
});

test("a file-size change on gov.uk becomes a fix for the document that uses it, notes included", () => {
  const p = propose({ url: ukDigital.url, label: "gov.uk", before: page("gov-uk-passport.before"), after: page("gov-uk-passport.after"), targets: [ukDigital], bgKeys: BG });
  assert.equal(p.kind, "proposal");
  assert.deepEqual(p.changes[0].fields, { kb: [50, 6144] });
  assert.deepEqual(p.changes[0].swap, [["10 MB", "6 MB"]]);
  assert.deepEqual(p.unmapped, []);
  const text = summary(p, "2026-11-02");
  assert.match(text, /file size: was 10240 KB; now 6144 KB/);
  assert.match(text, /uk-passport-digital: kb \[50,10240\] -> \[50,6144\]/);
  assert.match(text, /no more than 6MB/);
  assert.match(text, /Not merged and no version bump/);
});

test("head size in mm and file size on the India e-Visa page both map; two new sizes for one old one do not", () => {
  const p = propose({ url: inEvisa.url, label: "indianvisaonline.gov.in", before: page("india-evisa.before"), after: page("india-evisa.after"), targets: [inEvisa], bgKeys: BG });
  assert.equal(p.kind, "proposal");
  assert.deepEqual(p.changes[0].fields, { kb: [10, 500], head: { mm: [27, 35], of: 51 } });
  assert.deepEqual(p.changes[0].swap, [["300 KB", "500 KB"]]);
  const q = propose({ url: inEvisa.url, label: "x", before: page("india-evisa.before"), after: page("india-evisa.two-sizes"), targets: [inEvisa], bgKeys: BG });
  assert.equal(q.kind, "unmapped");
  assert.match(q.unmapped.join(), /was 300 KB; now 400 KB, 500 KB/);
});

test("wording-only changes and pages nobody cites stay notes", () => {
  const w = propose({ url: ukDigital.url, label: "gov.uk", before: page("gov-uk-passport.before"), after: page("gov-uk-passport.wording"), targets: [ukDigital], bgKeys: BG });
  assert.equal(w.kind, "wording");
  assert.ok(w.sentences.added.some(s => s.includes("usually approved more quickly")));
  const n = propose({ url: "https://x.test", label: "x", before: "Size 35 x 45 mm.", after: "Size 40 x 50 mm.", targets: [] });
  assert.equal(n.kind, "unmapped");
});

test("background and how-recent changes map when the old values match the document", () => {
  const t = { id: "x", mm: [35, 45], bg: ["white"], notes: ["Taken within the last 6 months"] };
  const p = propose({ url: "u", label: "u", before: "Use a plain white background. Photos taken within the last 6 months.", after: "Use a plain light grey background. Photos taken within the last 3 months.", targets: [t], bgKeys: BG });
  assert.deepEqual(p.changes[0].fields, { bg: ["grey"] });
  assert.deepEqual(p.changes[0].swap, [["6 months", "3 months"]]);
});

const PRESETS = `export const PRESETS = [
  { id: "uk-passport-digital", region: "Europe", mm: [35, 45], px: [700, 900], head: r(29, 34, 45), bg: ["cream", "grey"], kb: [50, 10240], src: ["gov.uk", "https://www.gov.uk/photos-for-passports"], notes: ["JPEG, 50 KB to 10 MB"] },
  { id: "uk-passport-baby", region: "Europe", mm: [35, 45], px: [700, 900], head: r(29, 34, 45), bg: ["cream", "grey"], kb: [50, 10240], src: ["gov.uk", "https://www.gov.uk/photos-for-passports"], notes: ["JPEG, 50 KB to 10 MB"] },
  { id: "in-oci", region: "South Asia", mm: [51, 51], head: [0.70, 0.80], bg: ["offwhite", "grey"], kb: [0, 200], src: SRC.oci, notes: ["Face 70–80%"], check: "x" },
];
`;

test("the edit changes only that document's line in js/presets.js and stamps the date", () => {
  let out = applyRule(PRESETS, { id: "uk-passport-digital", fields: { kb: [50, 6144], head: { mm: [30, 35], of: 45 } }, swap: [["10 MB", "6 MB"]] }, "2026-11-02");
  const [, a, b] = out.split("\n");
  assert.match(a, /^ {2}\{ id: "uk-passport-digital", checked: "2026-11-02", region/);
  assert.match(a, /head: r\(30, 35, 45\)/);
  assert.match(a, /kb: \[50, 6144\]/);
  assert.match(a, /notes: \["JPEG, 50 KB to 6 MB"\]/);
  assert.equal(b, PRESETS.split("\n")[2]);
  out = applyRule(out, { id: "in-oci", fields: { head: { share: [0.7, 0.85] }, bg: ["white"] }, swap: [["70–80%", "70–85%"]] }, "2026-11-03");
  assert.match(out, /\{ id: "in-oci", checked: "2026-11-03", .*head: \[0\.70, 0\.85\], bg: \["white"\], .*notes: \["Face 70–85%"\], check: "x" \}/);
  assert.match(applyRule(out, { id: "uk-passport-digital" }, "2026-12-07"), /id: "uk-passport-digital", checked: "2026-12-07", region/);
  assert.throws(() => applyRule(PRESETS, { id: "nope" }, "d"), /nope not found/);
});

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "app-"));
  const git = (...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  execFileSync("mkdir", ["-p", join(dir, "js")]);
  writeFileSync(join(dir, "js/presets.js"), PRESETS);
  git("add", ".");
  git("commit", "-q", "-m", "start");
  return { dir, git };
}

test("the fix goes on a branch with the summary as its message, the checkout stays put, and nothing is pushed", () => {
  const { dir, git } = repo();
  const b = branch({ src: dir, branch: "rules/2026-11-02-uk", files: { "js/presets.js": s => s.replace("10240", "6144") }, message: "Rule change: gov.uk\n\nWhy.", push: false });
  assert.equal(b.error, undefined);
  assert.equal(b.pushed, false);
  assert.match(b.patch, /Subject: \[PATCH\] Rule change: gov.uk/);
  assert.match(b.patch, /^\+.*kb: \[50, 6144\]/m);
  assert.equal(git("rev-parse", "--abbrev-ref", "HEAD").trim(), "main");
  assert.equal(readFileSync(join(dir, "js/presets.js"), "utf8"), PRESETS);
  assert.match(git("log", "--format=%s", "rules/2026-11-02-uk", "-1"), /Rule change: gov.uk/);
  const p = branch({ src: dir, branch: "rules/again", files: { "js/presets.js": s => s }, message: "nothing", push: false });
  assert.ok(p.error, "an empty change is an error, not an empty commit");
});

test("rule-watch proposals: one branch and patch per changed page, notes for the rest", async () => {
  const { dir } = repo();
  const adapter = {
    ruleTargets: async () => ({ targets: [ukDigital, { ...ukDigital, id: "uk-passport-baby" }], bgKeys: BG }),
    applyRule,
  };
  const app = { name: "demo", src: dir };
  const out = await proposals(app, [
    { url: ukDigital.url, label: "gov.uk", before: page("gov-uk-passport.before"), after: page("gov-uk-passport.after") },
    { url: ukDigital.url + "/x", label: "gov.uk wording", before: page("gov-uk-passport.before"), after: page("gov-uk-passport.wording") },
  ], { date: "2026-11-02", adapter, write: false });
  assert.equal(out.proposals.length, 1);
  assert.deepEqual(out.proposals[0].ids, ["uk-passport-digital", "uk-passport-baby"]);
  assert.equal(out.proposals[0].slug, "2026-11-02-uk-passport-digital-and-1");
  assert.equal(out.proposals[0].branch, null);
  assert.equal(out.notes.length, 1);
  assert.equal(out.notes[0].kind, "wording");
});

test("the report shows proposed fixes and puts them first in this week's list", () => {
  const app = { name: "demo", config: { name: "Demo", seasons: [] } };
  const rules = { date: "2026-11-02", proposals: [{ label: "gov.uk", ids: ["uk-passport-digital"], patch: "state/demo/rule-proposals/a.patch", summary: "Rule change\n\n- file size: was 10240 KB; now 6144 KB" }], notes: [{ label: "canada.ca", url: "https://c.test", why: "The wording changed." }] };
  const text = compose(app, [], { data: { rules }, off: [] }, new Date("2026-11-02T08:00:00Z"));
  assert.match(text, /## This week\n\n1\. Check 1 proposed rule fix \(uk-passport-digital\) and say go\./);
  assert.match(text, /## Official rule changes/);
  assert.match(text, /Patch state\/demo\/rule-proposals\/a\.patch/);
  assert.match(text, /canada\.ca \(https:\/\/c\.test\): The wording changed\./);
  assert.doesNotMatch(compose(app, [], { data: { rules }, off: [] }, new Date("2026-11-20T08:00:00Z")), /Official rule changes/);
  assert.equal(checklistDue(new Date("2026-11-02")), true);
  assert.equal(checklistDue(new Date("2026-11-09")), false);
});

test("the blocked-pages checklist shows each page's link and the values the app uses", () => {
  assert.deepEqual(values(ukDigital), ["35×45 mm", "700×900 px", "head 29–34 mm (64–76% of the height)", "background cream or grey", "50–10240 KB"]);
  assert.deepEqual(values({ px: [600, 600], head: [0.7, 0.8], kb: [0, 200] }), ["600×600 px", "head 70–80% of the height", "up to 200 KB"]);
  const pages = [{ url: "https://www.hcilondon.gov.in/a?b=1&c=<2>", label: "HCI London", error: 403, lastRead: null, docs: [{ id: "in-birthreg-35", title: "India birth registration", values: ["35×35 mm"], notes: [], check: null }] }];
  const h = html({ config: { name: "Picproved" } }, pages, "2026-11-02");
  assert.match(h, /href="https:\/\/www\.hcilondon\.gov\.in\/a\?b=1&amp;c=&lt;2&gt;"/);
  assert.match(h, /never from the cloud/);
  assert.match(h, /Copy my answers/);
  assert.match(markdown({ config: { name: "Picproved" } }, pages, "2026-11-02"), /- \[ \] India birth registration \(in-birthreg-35\): 35×35 mm/);
});
