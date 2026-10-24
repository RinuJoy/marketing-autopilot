// Picproved's Shorts (engines/video.mjs). Focus from 24 Oct 2026: Indians in the UK first (OCI, Indian passport
// renewal, a baby's first passport), the UK passport as the catch-all. Facts from
// /mnt/project-files/marketing-autopilot/picproved/outreach/facts-uk-indians.md, which cites HCI London, VFS Global UK
// and GOV.UK. The people are the app's own fictional AI-made tour faces (icons/tour/face-N.webp), never real people.
import { join } from "node:path";
import { existsSync } from "node:fs";

export const font = "fonts/plus-jakarta-sans-latin.woff2";
export const logo = "icons/logo.svg";
export const qr = "qr-video.svg";   // https://picproved.com/?utm_source=qr&utm_medium=video

const UK = { locale: "en-GB", timezoneId: "Europe/London" };
// Hidden in every capture, as in the store screenshots: the "hold to compare" pill, toasts and a blinking caret.
const HIDE = ".stage .compare, #toast { visibility: hidden !important; } * { caret-color: transparent !important; }";

export async function shots({ browser, base, src, raw, PHONE, ffmpeg, need }) {
  const out = {};
  const face = n => {
    const file = join(raw, `face-${n}-3x.png`);
    if (!existsSync(file)) ffmpeg("-i", join(src, `icons/tour/face-${n}.webp`), "-vf", "scale=iw*3:-2:flags=lanczos", "-frames:v", "1", file);
    return file;
  };
  async function phone(prefs = {}) {
    const ctx = await browser.newContext({ ...PHONE, ...UK });
    await ctx.addInitScript(p => localStorage.setItem("snap-prefs", JSON.stringify({ welcomed: true, home: "GB", ties: ["IN"], ...p })), prefs);
    await ctx.addInitScript(css => document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = css; document.head.append(s); }), HIDE);
    return ctx.newPage();
  }
  async function snap(page, name, { full = false } = {}) {
    await page.evaluate(async () => { document.activeElement?.blur(); await document.fonts.ready; });
    await page.waitForTimeout(400);
    const path = join(raw, name + ".png");
    await page.screenshot({ path, fullPage: full });
    out[name] = path;
    console.log("shot", name);
  }
  async function editor(page, doc, file) {
    await page.goto(base + "doc/" + doc);
    await page.waitForSelector(".savebar");
    const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click('button:has-text("Upload")')]);
    await fc.setFiles(file);
    await page.waitForFunction(() => !/Measuring/.test(document.body.innerText) && /KB/.test(document.querySelector(".savebar")?.innerText || ""), null, { timeout: 90000 });
    await page.waitForSelector(".stage .proc", { state: "detached" });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; scrollTo(0, 0); });
  }
  const checks = async page => {
    await page.evaluate(() => { const el = document.querySelector(".chance")?.closest("section"); const bar = document.querySelector(".topbar").getBoundingClientRect().height;
      if (el) scrollTo(0, el.getBoundingClientRect().top + scrollY - bar - 12); });
    await page.waitForTimeout(500);
  };
  // The document's own rules card ("Requirements"), opened and scrolled under the top bar.
  const rules = async page => {
    await page.evaluate(() => { scrollTo(0, 0); const s = [...document.querySelectorAll("details > summary")].find(x => x.textContent.trim().startsWith("Requirements"));
      if (!s) return; s.parentElement.open = true; const bar = document.querySelector(".topbar").getBoundingClientRect().height;
      scrollTo(0, s.getBoundingClientRect().top + scrollY - bar - 12); });
    await page.waitForTimeout(600);
  };
  const want = n => !need || need.has(n);

  if (want("oci-editor") || want("oci-checks") || want("oci-rules")) {
    const page = await phone();
    await editor(page, "in-oci", face(26));
    await snap(page, "oci-editor");
    await checks(page); await snap(page, "oci-checks");
    await rules(page); await snap(page, "oci-rules");
    await page.context().close();
  }
  if (want("passport-editor") || want("passport-checks") || want("passport-rules")) {
    const page = await phone();
    await editor(page, "in-passport", face(41));
    await snap(page, "passport-editor");
    await checks(page); await snap(page, "passport-checks");
    await rules(page); await snap(page, "passport-rules");
    await page.context().close();
  }
  if (want("baby-editor")) {
    const page = await phone({ baby: true });
    await editor(page, "in-birthreg-35", face(25));
    await snap(page, "baby-editor");
    await page.context().close();
  }
  if (want("uk-editor") || want("uk-checks") || want("print")) {
    const page = await phone();
    await editor(page, "uk-passport-digital", face(8));
    await snap(page, "uk-editor");
    await checks(page); await snap(page, "uk-checks");
    await page.evaluate(() => scrollTo(0, 0));
    await page.click('summary:has-text("Print sheet")');
    await page.evaluate(() => { const s = [...document.querySelectorAll("details.card > summary")].find(x => x.textContent.trim().startsWith("Print sheet")); const bar = document.querySelector(".topbar").getBoundingClientRect().height;
      scrollTo(0, s.getBoundingClientRect().top + scrollY - bar - 12); });
    await snap(page, "print");
    await page.context().close();
  }
  for (const [name, path] of [["oci-pack", "oci-pack"], ["nri-gb", "nri-passport/gb"], ["newborn", "newborn-passport"], ["living-uk", "living/indians-in-uk"]]) {
    if (!want(name)) continue;
    const page = await phone();
    await page.goto(base + path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);
    await snap(page, name, { full: true });
    await page.context().close();
  }
  return out;
}

const tags = { in: ["IndiansInUK", "BritishIndian", "NRI"], uk: ["ukpassport", "passportphoto"] };
const link = c => `https://picproved.com/?utm_source=youtube&utm_medium=shorts&utm_campaign=${c}`;

export const videos = [
  {
    id: "uk-in-oci", title: "OCI photo from the UK: why your UK passport photo won't work",
    description: `OCI from the UK: a square upload under 200 KB on a light (not bright white) background, two 2×2 inch prints for VFS UK, and a wide signature file.\nVFS UK OCI checklist: https://www.vfsglobal.com/one-pager/india/uk/oci/english/pdf/OCI_Checklist_2025_October.pdf\nMake yours: ${link("uk-in-oci").replace("/?", "/oci-pack?")}`,
    tags: ["OCI", "OCIcard", ...tags.in],
    scenes: [
      { secs: 4, title: "Your UK passport photo won't work for OCI", sub: "Flying to India this winter?" },
      { secs: 5.5, shot: "oci-editor", theme: "soft", title: "OCI wants a square", sub: "Not the 35×45 mm UK booth size", chips: ["Square upload", "Under 200 KB"] },
      { secs: 5, shot: "oci-rules", title: "Light background, not bright white", chips: ["No border", "Face about 80%"] },
      { secs: 5.5, shot: "oci-pack", theme: "soft", pan: [300, 600], title: "Prints for VFS UK", sub: "Two 2×2 inch photos, the same as the upload" },
      { secs: 4.5, title: "The signature is its own wide file", sub: "Little ones can use a thumb print" },
      { secs: 4.5, title: "Photo, signature and prints in one go", sub: "Checked against the UK rules before you pay" },
    ],
  },
  {
    id: "uk-in-passport", title: "Indian passport renewal in the UK: the 630×810 photo rule",
    description: `Indian passport renewal from the UK: upload exactly 630×810 px JPEG under 250 KB, white background, no glasses; two matching prints for VFS (ask VFS for the size).\nVFS UK: https://visa.vfsglobal.com/one-pager/india/uk/passport-services/english/\nMake yours: ${link("uk-in-passport").replace("/?", "/nri-passport/gb?")}`,
    tags: ["IndianPassport", "VFS", "passportrenewal", ...tags.in],
    scenes: [
      { secs: 4, title: "Indian passport photo upload failing?", sub: "Renewing in the UK?" },
      { secs: 5, shot: "passport-editor", theme: "soft", title: "Exactly 630 × 810 pixels", chips: ["JPEG", "Under 250 KB"] },
      { secs: 5.5, shot: "passport-rules", title: "ICAO style since 2025", chips: ["White background", "No glasses", "Face 80–85%"] },
      { secs: 4.5, theme: "dark", title: "Wear a dark top", sub: "A white shirt disappears into the white background" },
      { secs: 5.5, shot: "nri-gb", theme: "soft", pan: [0, 900], title: "The whole VFS UK list", sub: "Upload, prints, signature and page copies" },
      { secs: 3.5, title: "Only 12 upload tries", sub: "Check it first" },
    ],
  },
  {
    id: "uk-in-newborn", title: "Baby born in the UK? The two photos for an Indian passport",
    description: `Indian passport for a baby born in the UK: register the birth at the High Commission within a year (35×35 mm square, light non-white background, £19), then the passport through VFS (ICAO photo on white).\nHCI London: https://www.hcilondon.gov.in/page/children-eligible/\nMake both photos: ${link("uk-in-newborn").replace("/?", "/newborn-passport?")}`,
    tags: ["newbornpassport", "newmum", "newdad", ...tags.in],
    scenes: [
      { secs: 4.5, title: "Baby born in the UK?", sub: "An Indian passport needs two different photos" },
      { secs: 5.5, shot: "baby-editor", theme: "soft", title: "1. Birth registration", sub: "Square 35 × 35 mm, light background, not white" },
      { secs: 5, title: "Register within one year", chips: ["£19", "Cash or postal order", "No cards"] },
      { secs: 5, shot: "newborn", theme: "soft", pan: [1550, 1950], title: "2. The passport through VFS", sub: "A normal ICAO photo on white" },
      { secs: 5, title: "The baby doesn't have to go to VFS", sub: "Both parents go, or one with a letter" },
    ],
  },
  {
    id: "uk-in-family", title: "One India trip, three different photos",
    description: `The three photo rules a British-Indian family meets: UK passport 35×45 mm cream or grey, OCI square on a light background, Indian passport white at 630×810 px.\nSources on each page: ${link("uk-in-family").replace("/?", "/living/indians-in-uk?")}`,
    tags: ["OCI", "IndianPassport", ...tags.in, "ukpassport"],
    scenes: [
      { secs: 4, title: "One India trip, three different photos" },
      { secs: 4.5, shot: "uk-editor", theme: "soft", title: "UK passport", chips: ["35×45 mm", "Cream or light grey"] },
      { secs: 4.5, shot: "oci-editor", title: "OCI", chips: ["Square", "Light, not white"] },
      { secs: 4.5, shot: "passport-editor", theme: "soft", title: "Indian passport", chips: ["White", "630×810 px"] },
      { secs: 4, title: "Same face. One app makes all three." },
    ],
  },
  {
    id: "uk-in-apostille", title: "The OCI mistake that isn't the photo",
    description: `VFS UK OCI checklist (Oct 2025): certificates issued outside India need a paper apostille (no e-apostille), and ages 12 to 70 give biometrics.\nhttps://www.vfsglobal.com/one-pager/india/uk/oci/english/pdf/OCI_Checklist_2025_October.pdf\nOCI pack: ${link("uk-in-oci-apostille").replace("/?", "/oci-pack?")}`,
    tags: ["OCI", "apostille", ...tags.in],
    scenes: [
      { secs: 4, theme: "dark", title: "The OCI mistake that isn't the photo" },
      { secs: 5, title: "Certificates from outside India need a paper apostille" },
      { secs: 4, title: "VFS UK doesn't accept an e-apostille" },
      { secs: 5, title: "Ages 12 to 70 give fingerprints at VFS", sub: "Book enough time" },
      { secs: 4.5, shot: "oci-pack", theme: "soft", pan: [2650, 2900], title: "The full UK checklist" },
    ],
  },
  {
    id: "uk-pp-home", title: "UK passport photo at home in two minutes",
    description: `UK online passport photo rules and how to take it at home.\nOfficial rules: https://www.gov.uk/photos-for-passports\nCheck it before you upload: ${link("uk-pp-home").replace("/?", "/doc/uk-passport-digital?")}`,
    tags: [...tags.uk, "moneysavinguk"],
    scenes: [
      { secs: 4.5, title: "Don't pay for a UK passport photo", sub: "Renewing online? Take it at home." },
      { secs: 4.5, theme: "soft", title: "Plain cream or light grey wall", sub: "Face a window. No flash." },
      { secs: 4, title: "Someone else takes it", sub: "Eye level, about 1.5 m away" },
      { secs: 5, shot: "uk-editor", theme: "soft", title: "Check it before you upload", chips: ["Size", "Background", "Light"] },
      { secs: 4.5, shot: "uk-checks", title: "See your score first", sub: "Then save the digital photo" },
    ],
  },
  {
    id: "uk-pp-rejected", title: "5 reasons passport photos get rejected",
    description: `The five most common passport photo mistakes and how to fix each one at home.\nUK rules: https://www.gov.uk/photos-for-passports\nCheck yours: ${link("uk-pp-rejected")}`,
    tags: [...tags.uk, "travelhacks"],
    scenes: [
      { secs: 4, theme: "dark", title: "5 reasons passport photos get rejected" },
      { secs: 4, title: "1. Shadow behind you", sub: "Step half a metre from the wall" },
      { secs: 3.5, title: "2. Ceiling light", sub: "Face a window instead" },
      { secs: 3.5, title: "3. Arm's-length selfie", sub: "Have someone take it" },
      { secs: 4, title: "4. Glasses", sub: "For a UK passport, take them off" },
      { secs: 4, title: "5. Beauty mode or filters", sub: "Any editing gets it rejected" },
      { secs: 4, shot: "uk-checks", theme: "soft", title: "Check yours first", sub: "Every rule, before you pay" },
    ],
  },
  {
    id: "uk-pp-print-sheet", title: "Print your own passport photos on one 6×4",
    description: `Save a 6×4 print sheet with cut marks and print it at any photo kiosk.\n${link("uk-pp-print-sheet").replace("/?", "/print-sheet?")}`,
    tags: [...tags.uk, "moneysaving", "lifehack"],
    scenes: [
      { secs: 4.5, title: "Print your own passport photos", sub: "One 6×4 print at any photo kiosk" },
      { secs: 5, shot: "print", theme: "soft", title: "Save a 6×4 sheet", chips: ["Cut marks", "PDF or JPG"] },
      { secs: 4, title: "Print it as a normal 6×4", sub: "At any supermarket kiosk" },
      { secs: 4.5, title: "Cut along the marks", sub: "Check one against a bank card first" },
    ],
  },
];
