// Picproved's Shorts (engines/video.mjs). Focus from 24 Oct 2026: Indians in the UK first (OCI, Indian passport
// renewal, a baby's first passport), the UK passport as the catch-all. Facts from
// /mnt/project-files/marketing-autopilot/picproved/outreach/facts-uk-indians.md, which cites HCI London, VFS Global UK
// and GOV.UK. The people are the app's own fictional AI-made tour faces (icons/tour/face-N.webp), never real people.
import { join } from "node:path";
import { existsSync } from "node:fs";

export const font = "fonts/plus-jakarta-sans-latin.woff2";
export const logo = "icons/logo.svg";
export const qr = "qr-video.svg";   // https://picproved.com/?utm_source=qr&utm_medium=video
// The voiceover (--voice tools/say-google.mjs): Google Chirp 3 HD voices, British English, and Indian English (a mix of
// women's and men's voices) on the videos for Indians in the UK; and how to say the letters it might read as words
// (Google already spells OCI and VFS out).
export const voice = { name: "en-GB-Chirp3-HD-Kore", pronounce: { ICAO: "I K O", JPEG: "jay peg" } };
export const endSay = "Link in the description.";

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
  // "Will this photo pass?": a tour face cut out and set on a plain cream wall with room around it (the tour photos
  // themselves are cropped too tight for a passport frame), then made to fail one rule. Each is put in the UK passport
  // editor; the editor and its score are the shots `<name>-editor` and `<name>-checks`.
  const WALL = "color=c=0xe6e1d6:s=1200x1400:d=1", TILT = "rotate=12*PI/180:c=none:ow=rotw(12*PI/180):oh=roth(12*PI/180)";
  const PEOPLE = {
    good: [41, ""], dark: [41, ",eq=brightness=-0.35:contrast=0.7:gamma=0.7"], blur: [41, ",gblur=sigma=5"],
    tilt: [41, "", TILT], smile: [6, ""], glasses: [28, ""],
  };
  const person = name => {
    const [n, after, turn] = PEOPLE[name], cut = join(raw, `cut-${n}.png`), file = join(raw, `person-${name}.png`);
    if (!existsSync(cut)) ffmpeg("-i", join(src, `icons/tour/face-${n}-cut.webp`), "-vf", "scale=iw*3:-2:flags=lanczos", "-frames:v", "1", cut);
    ffmpeg("-f", "lavfi", "-i", WALL, "-i", cut, "-filter_complex", `[1]${turn || "null"}[p];[0][p]overlay=(W-w)/2:H-h${turn ? "+40" : ""}${after}`, "-frames:v", "1", file);
    return file;
  };
  for (const name of Object.keys(PEOPLE)) {
    if (!["-editor", "-checks", "-photo"].some(k => want(name + k))) continue;
    const page = await phone();
    await editor(page, "uk-passport-digital", person(name));
    out[name + "-photo"] = join(raw, `person-${name}.png`);
    await snap(page, name + "-editor");
    await checks(page); await snap(page, name + "-checks");
    await page.context().close();
  }
  // The pay sheet as a buyer sees it once payments are on (the app's test mode), for the price video.
  if (want("price")) {
    const page = await phone();
    await page.goto(base + "shop-test");
    await page.waitForFunction(() => /Orders and keys/.test(document.body.innerText));
    await editor(page, "uk-passport-digital", person("good"));
    await page.click('button:has-text("Save photo")');
    await page.waitForSelector(".paysheet");
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; scrollTo(0, 0); document.querySelectorAll(".paysheet .callout.warn").forEach(e => e.remove()); });
    await page.waitForTimeout(800);
    await snap(page, "price");
    await page.context().close();
  }
  return out;
}

const tags = { in: ["IndiansInUK", "BritishIndian", "NRI"], uk: ["ukpassport", "passportphoto"] };
// Links in Shorts descriptions can't be clicked, so they are short addresses people can type (24 Oct 2026).

export const videos = [
  {
    id: "uk-in-oci", voice: "en-IN-Chirp3-HD-Aoede", title: "OCI photo from the UK: why your UK passport photo won't work",
    description: `OCI from the UK: a square upload under 200 KB on a light (not bright white) background, two 2×2 inch prints for VFS UK, and a wide signature file.\nVFS UK OCI checklist: https://www.vfsglobal.com/one-pager/india/uk/oci/english/pdf/OCI_Checklist_2025_October.pdf\nMake yours: picproved.com/oci-pack\nFree while we launch, £5.99 after.`,
    tags: ["OCI", "OCIcard", ...tags.in],
    scenes: [
      { clip: "clip-1-airport", secs: 4, say: "Getting OCI for the kids before India this winter? Your UK passport photo won't work.", title: "Your UK passport photo won't work for OCI", sub: "Flying to India this winter?" },
      { secs: 5.5, say: "OCI wants a square, not the 35 by 45 booth size. And the upload must be under 200 kilobytes.", shot: "oci-editor", theme: "soft", title: "OCI wants a square", sub: "Not the 35×45 mm UK booth size", chips: ["Square upload", "Under 200 KB"] },
      { secs: 5, say: "Use a light background, but not bright white. No border.", shot: "oci-rules", title: "Light background, not bright white", chips: ["No border", "Face about 80%"] },
      { secs: 5.5, say: "For VFS UK, bring two prints at 2 by 2 inches, the same as the upload.", shot: "oci-pack", theme: "soft", pan: [300, 600], title: "Prints for VFS UK", sub: "Two 2×2 inch photos, the same as the upload" },
      { secs: 4.5, say: "Your signature is its own wide file. Little ones can use a thumb print.", title: "The signature is its own wide file", sub: "Little ones can use a thumb print" },
      { secs: 4.5, say: "Picproved makes the photo, signature and prints in one go, checked against the UK rules.", title: "Photo, signature and prints in one go", sub: "Checked against the UK rules before you pay" },
    ],
  },
  {
    id: "uk-in-passport", voice: "en-IN-Chirp3-HD-Charon", title: "Indian passport renewal in the UK: the 630×810 photo rule",
    description: `Indian passport renewal from the UK: upload exactly 630×810 px JPEG under 250 KB, white background, no glasses; two matching prints for VFS (ask VFS for the size).\nVFS UK: https://visa.vfsglobal.com/one-pager/india/uk/passport-services/english/\nMake yours: picproved.com/nri-passport/gb\nFree while we launch, £5.99 after.`,
    tags: ["IndianPassport", "VFS", "passportrenewal", ...tags.in],
    scenes: [
      { clip: "clip-2-passport-hands", clipFrom: 2.5, secs: 4, say: "Renewing your Indian passport in the UK, and the photo won't upload?", title: "Indian passport photo upload failing?", sub: "Renewing in the UK?" },
      { secs: 5, say: "It must be exactly 630 by 810 pixels, a JPEG under 250 kilobytes.", shot: "passport-editor", theme: "soft", title: "Exactly 630 × 810 pixels", chips: ["JPEG", "Under 250 KB"] },
      { secs: 5.5, say: "Since 2025 it's ICAO style. White background, no glasses.", shot: "passport-rules", title: "ICAO style since 2025", chips: ["White background", "No glasses", "Face 80–85%"] },
      { secs: 4.5, say: "Wear a dark top. A white shirt disappears into the background.", theme: "dark", title: "Wear a dark top", sub: "A white shirt disappears into the white background" },
      { secs: 5.5, say: "Here's the whole VFS UK list: upload, prints, signature and page copies.", shot: "nri-gb", theme: "soft", pan: [0, 900], title: "The whole VFS UK list", sub: "Upload, prints, signature and page copies" },
      { secs: 3.5, say: "You only get 12 upload tries, so check it first.", title: "Only 12 upload tries", sub: "Check it first" },
    ],
  },
  {
    id: "uk-in-newborn", voice: "en-IN-Chirp3-HD-Kore", title: "Baby born in the UK? The two photos for an Indian passport",
    description: `Indian passport for a baby born in the UK: register the birth at the High Commission within a year (35×35 mm square, light non-white background, £19), then the passport through VFS (ICAO photo on white).\nHCI London: https://www.hcilondon.gov.in/page/children-eligible/\nMake both photos: picproved.com/newborn-passport\nFree while we launch, £5.99 after.`,
    tags: ["newbornpassport", "newmum", "newdad", ...tags.in],
    scenes: [
      { secs: 4.5, say: "Baby born in the UK? An Indian passport needs two different photos.", title: "Baby born in the UK?", sub: "An Indian passport needs two different photos" },
      { secs: 5.5, say: "First, the birth registration. A square, 35 by 35 millimetres, on a light background, not white.", shot: "baby-editor", theme: "soft", title: "1. Birth registration", sub: "Square 35 × 35 mm, light background, not white" },
      { secs: 5, say: "Register within one year. It's 19 pounds, cash or postal order. No cards.", title: "Register within one year", chips: ["£19", "Cash or postal order", "No cards"] },
      { secs: 5, say: "Then the passport through VFS, with a normal photo on white.", shot: "newborn", theme: "soft", pan: [1550, 1950], title: "2. The passport through VFS", sub: "A normal ICAO photo on white" },
      { secs: 5, say: "And the baby doesn't have to go to VFS. Both parents go, or one with a letter.", title: "The baby doesn't have to go to VFS", sub: "Both parents go, or one with a letter" },
    ],
  },
  {
    id: "uk-in-family", voice: "en-IN-Chirp3-HD-Puck", title: "One India trip, three different photos",
    description: `The three photo rules a British-Indian family meets: UK passport 35×45 mm cream or grey, OCI square on a light background, Indian passport white at 630×810 px.\nSources on each page: picproved.com/living/indians-in-uk\nFree while we launch, £5.99 after.`,
    tags: ["OCI", "IndianPassport", ...tags.in, "ukpassport"],
    scenes: [
      { clip: "clip-1-airport", clipFrom: 1.5, secs: 4, say: "Flying to India from the UK? One trip, three different photos.", title: "One India trip, three different photos" },
      { secs: 4.5, say: "UK passport: 35 by 45, cream or light grey.", shot: "uk-editor", theme: "soft", title: "UK passport", chips: ["35×45 mm", "Cream or light grey"] },
      { secs: 4.5, say: "OCI: a square, on a light background, not white.", shot: "oci-editor", title: "OCI", chips: ["Square", "Light, not white"] },
      { secs: 4.5, say: "Indian passport: white, and 630 by 810 pixels to upload.", shot: "passport-editor", theme: "soft", title: "Indian passport", chips: ["White", "630×810 px"] },
      { secs: 4, say: "Same face. Picproved makes all three.", title: "Same face. One app makes all three." },
    ],
  },
  {
    id: "uk-in-apostille", voice: "en-IN-Chirp3-HD-Leda", title: "The OCI mistake that isn't the photo",
    description: `VFS UK OCI checklist (Oct 2025): certificates issued outside India need a paper apostille (no e-apostille), and ages 12 to 70 give biometrics.\nhttps://www.vfsglobal.com/one-pager/india/uk/oci/english/pdf/OCI_Checklist_2025_October.pdf\nOCI pack: picproved.com/oci-pack\nFree while we launch, £5.99 after.`,
    tags: ["OCI", "apostille", ...tags.in],
    scenes: [
      { secs: 4, say: "Applying for OCI in the UK? This mistake isn't the photo.", theme: "dark", title: "The OCI mistake that isn't the photo" },
      { secs: 5, say: "Certificates issued outside India need a paper apostille.", title: "Certificates from outside India need a paper apostille" },
      { secs: 4, say: "VFS UK doesn't accept an e-apostille.", title: "VFS UK doesn't accept an e-apostille" },
      { secs: 5, say: "Anyone from 12 to 70 gives fingerprints at VFS, so book enough time.", title: "Ages 12 to 70 give fingerprints at VFS", sub: "Book enough time" },
      { secs: 4.5, say: "Here's the full UK checklist.", shot: "oci-pack", theme: "soft", pan: [2650, 2900], title: "The full UK checklist" },
    ],
  },
  {
    id: "uk-pp-home", title: "UK passport photo at home in two minutes",
    description: `UK online passport photo rules and how to take it at home.\nOfficial rules: https://www.gov.uk/photos-for-passports\nCheck it before you upload: picproved.com/doc/uk-passport-digital\nFree while we launch, £5.99 after.`,
    tags: [...tags.uk, "moneysavinguk"],
    scenes: [
      { secs: 4.5, say: "Renewing your UK passport online? Don't pay for a photo. Take it at home.", title: "Don't pay for a UK passport photo", sub: "Renewing online? Take it at home." },
      { secs: 4.5, say: "Stand by a plain cream or light grey wall. Face a window. No flash.", theme: "soft", title: "Plain cream or light grey wall", sub: "Face a window. No flash." },
      { secs: 4, say: "Have someone else take it, at eye level, about one and a half metres away.", title: "Someone else takes it", sub: "Eye level, about 1.5 m away" },
      { secs: 5, say: "Then check it before you upload: size, background and light.", shot: "uk-editor", theme: "soft", title: "Check it before you upload", chips: ["Size", "Background", "Light"] },
      { secs: 4.5, say: "See your score first, then save the digital photo.", shot: "uk-checks", title: "See your score first", sub: "Then save the digital photo" },
    ],
  },
  {
    id: "uk-pp-rejected", title: "5 reasons passport photos get rejected",
    description: `The five most common passport photo mistakes and how to fix each one at home.\nUK rules: https://www.gov.uk/photos-for-passports\nCheck yours: picproved.com\nFree while we launch, £5.99 after.`,
    tags: [...tags.uk, "travelhacks"],
    scenes: [
      { secs: 4, say: "Passport photo rejected? It's usually one of these five.", theme: "dark", title: "5 reasons passport photos get rejected" },
      { secs: 4, say: "One. A shadow behind you. Step half a metre from the wall.", title: "1. Shadow behind you", sub: "Step half a metre from the wall" },
      { secs: 3.5, say: "Two. Ceiling light. Face a window instead.", title: "2. Ceiling light", sub: "Face a window instead" },
      { secs: 3.5, say: "Three. An arm's length selfie. Have someone take it.", title: "3. Arm's-length selfie", sub: "Have someone take it" },
      { secs: 4, say: "Four. Glasses. For a UK passport, take them off.", title: "4. Glasses", sub: "For a UK passport, take them off" },
      { secs: 4, say: "Five. Beauty mode or filters. Any editing gets it rejected.", title: "5. Beauty mode or filters", sub: "Any editing gets it rejected" },
      { secs: 4, say: "Check yours first, against every rule, before you pay.", shot: "uk-checks", theme: "soft", title: "Check yours first", sub: "Every rule, before you pay" },
    ],
  },
  {
    id: "uk-pp-print-sheet", title: "Print your own passport photos on one 6×4",
    description: `Save a 6×4 print sheet with cut marks and print it at any photo kiosk.\npicproved.com/print-sheet\nFree while we launch, £5.99 after.`,
    tags: [...tags.uk, "moneysaving", "lifehack"],
    scenes: [
      { secs: 4.5, say: "Print your own passport photos on one 6 by 4.", title: "Print your own passport photos", sub: "One 6×4 print at any photo kiosk" },
      { secs: 5, say: "Save a 6 by 4 sheet with cut marks.", shot: "print", theme: "soft", title: "Save a 6×4 sheet", chips: ["Cut marks", "PDF or JPG"] },
      { clip: "clip-4-printing", secs: 4, say: "Print it as a normal 6 by 4 at any supermarket kiosk.", title: "Print it as a normal 6×4", sub: "At any supermarket kiosk" },
      { secs: 4.5, say: "Cut along the marks, and check one against a bank card first.", title: "Cut along the marks", sub: "Check one against a bank card first" },
    ],
  },
  {
    id: "pass-dark", title: "Will this photo pass? Taken in a dim room",
    description: `Will this UK passport photo pass? Face too dark. Light in front of you. Face a window in daylight. No flash.\nUK rules: https://www.gov.uk/photos-for-passports\nCheck yours before you upload: picproved.com/doc/uk-passport-digital\nFree while we launch, £5.99 after.`,
    tags: [...tags.uk, "passportrejected"],
    scenes: [
      { secs: 3.5, say: "Will this photo pass? A UK passport photo, taken at home.", theme: "dark", title: "Will this photo pass?", sub: "UK passport, taken at home" },
      { secs: 4, say: "Taken in a dim room.", photo: "dark-photo", theme: "soft", title: "Taken in a dim room" },
      { secs: 4.5, say: "The check says: face too dark. Likely to be rejected.", shot: "dark-checks", title: "Face too dark", sub: "Likely to be rejected" },
      { secs: 4.5, say: "Put the light in front of you. Face a window in daylight, no flash.", title: "Light in front of you", sub: "Face a window in daylight. No flash." },
      { secs: 4, say: "Fixed. Ready to submit, 10 out of 10 checks.", shot: "good-checks", theme: "soft", title: "Ready to submit", chips: ["10 of 10 checks"] },
    ],
  },
  {
    id: "pass-blur", title: "Will this photo pass? Phone moved a little",
    description: `Will this UK passport photo pass? Photo looks blurry. Hold the phone still. More light, and tap your face to focus.\nUK rules: https://www.gov.uk/photos-for-passports\nCheck yours before you upload: picproved.com/doc/uk-passport-digital\nFree while we launch, £5.99 after.`,
    tags: [...tags.uk, "passportrejected"],
    scenes: [
      { secs: 3.5, say: "Will this photo pass? A UK passport photo, taken at home.", theme: "dark", title: "Will this photo pass?", sub: "UK passport, taken at home" },
      { secs: 4, say: "The phone moved a little.", photo: "blur-photo", theme: "soft", title: "Phone moved a little" },
      { secs: 4.5, say: "The check says: photo looks blurry. Not a clear likeness.", shot: "blur-checks", title: "Photo looks blurry", sub: "Not a clear likeness" },
      { secs: 4.5, say: "Hold the phone still. Use more light, and tap your face to focus.", title: "Hold the phone still", sub: "More light, and tap your face to focus." },
      { secs: 4, say: "Fixed. Ready to submit, 10 out of 10 checks.", shot: "good-checks", theme: "soft", title: "Ready to submit", chips: ["10 of 10 checks"] },
    ],
  },
  {
    id: "pass-tilt", title: "Will this photo pass? Head tilted to one side",
    description: `Will this UK passport photo pass? Big tilt. Head straight, chin level. Look straight at the camera.\nUK rules: https://www.gov.uk/photos-for-passports\nCheck yours before you upload: picproved.com/doc/uk-passport-digital\nFree while we launch, £5.99 after.`,
    tags: [...tags.uk, "passportrejected"],
    scenes: [
      { secs: 3.5, say: "Will this photo pass? A UK passport photo, taken at home.", theme: "dark", title: "Will this photo pass?", sub: "UK passport, taken at home" },
      { secs: 4, say: "The head is tilted to one side.", photo: "tilt-photo", theme: "soft", title: "Head tilted to one side" },
      { secs: 4.5, say: "The check says: big tilt. The shoulders end up slanted.", shot: "tilt-checks", title: "Big tilt", sub: "The shoulders end up slanted" },
      { secs: 4.5, say: "Keep your head straight, chin level, and look straight at the camera.", title: "Head straight, chin level", sub: "Look straight at the camera." },
      { secs: 4, say: "Fixed. Ready to submit, 10 out of 10 checks.", shot: "good-checks", theme: "soft", title: "Ready to submit", chips: ["10 of 10 checks"] },
    ],
  },
  {
    id: "pass-smile", title: "Will this photo pass? A friendly smile",
    description: `Will this UK passport photo pass? Expression not neutral. Mouth closed, no smile. Babies and children under 6 are let off.\nUK rules: https://www.gov.uk/photos-for-passports\nCheck yours before you upload: picproved.com/doc/uk-passport-digital\nFree while we launch, £5.99 after.`,
    tags: [...tags.uk, "passportrejected"],
    scenes: [
      { secs: 3.5, say: "Will this photo pass? A UK passport photo, taken at home.", theme: "dark", title: "Will this photo pass?", sub: "UK passport, taken at home" },
      { secs: 4, say: "A friendly smile.", photo: "smile-photo", theme: "soft", title: "A friendly smile" },
      { secs: 4.5, say: "The check says: expression not neutral. UK passports want a neutral face.", shot: "smile-checks", title: "Expression not neutral", sub: "UK passports want a neutral face" },
      { secs: 4.5, say: "Keep your mouth closed, no smile. Babies and children under 6 are let off.", title: "Mouth closed, no smile", sub: "Babies and children under 6 are let off." },
    ],
  },
  {
    id: "pass-glasses", title: "Will this photo pass? Wearing glasses",
    description: `Will this UK passport photo pass? Possible glasses. Take them off. Unless you have a medical reason.\nUK rules: https://www.gov.uk/photos-for-passports\nCheck yours before you upload: picproved.com/doc/uk-passport-digital\nFree while we launch, £5.99 after.`,
    tags: [...tags.uk, "passportrejected"],
    scenes: [
      { secs: 3.5, say: "Will this photo pass? A UK passport photo, taken at home.", theme: "dark", title: "Will this photo pass?", sub: "UK passport, taken at home" },
      { secs: 4, say: "Wearing glasses.", photo: "glasses-photo", theme: "soft", title: "Wearing glasses" },
      { secs: 4.5, say: "The check says: possible glasses. UK passports don't allow them.", shot: "glasses-checks", title: "Possible glasses", sub: "UK passports don't allow glasses" },
      { secs: 4.5, say: "Take them off, unless you have a medical reason.", title: "Take them off", sub: "Unless you have a medical reason." },
    ],
  },
  {
    id: "uk-pp-price", title: "Passport photo price: booth or phone?",
    description: `Photo booths and shops often charge £10 to £15 for passport photos. Picproved is £5.99 for one person in every size the document needs, with a print sheet, checked before you pay.\nCheck the current price: picproved.com/pricing\nFree while we launch, £5.99 after.`,
    tags: [...tags.uk, "moneysavinguk"],
    scenes: [
      { secs: 4, say: "Passport photos can cost 10 to 15 pounds at a booth or shop.", theme: "dark", title: "Passport photos: £10 to £15 at a booth or shop" },
      { secs: 5, say: "Or take it at home, checked against the official rules.", shot: "good-editor", theme: "soft", title: "Or take it at home", sub: "Checked against the official rules" },
      { secs: 5, say: "Picproved is 5 pounds 99, for every size, with a print sheet. No subscription.", shot: "price", title: "£5.99", chips: ["Every size", "Print sheet", "No subscription"] },
      { secs: 4.5, say: "Rejected? Tell us within 90 days for a free redo and a refund.", title: "Rejected?", sub: "Tell us within 90 days. Free redo and a refund." },
    ],
  },
];
