// Launch-day kit: every text needed on launch day, written from app.json and the items, in one file to copy from.
// Submitting to directories and posting in groups stay with a person.
import { writeText, outPath } from "../core/util.mjs";
import { tracked } from "../core/utm.mjs";
import { banned } from "./post-bank.mjs";

export function kit(config, items) {
  // Items an adapter marks counted: false (signature specs, standard sizes) are not documents of their own, and "EU"
  // (the Schengen visa) is many countries at once, so neither inflates the counts a launch post quotes.
  const counted = items.filter(i => i.counted !== false);
  const countries = new Set(counted.map(i => i.country).filter(c => c && c !== "EU")).size;
  const extra = counted.some(i => i.country === "EU") ? " and the Schengen area" : "";
  const scope = `${counted.length} ${config.id === "picproved" ? "documents" : "items"}${countries > 1 ? ` in ${countries} countries${extra}` : ""}`;
  const link = src => tracked(config.site, { source: src, medium: "launch", campaign: "launch" });
  // Only once the store listing is public: a launch post must not send people to a page that 404s.
  const play = config.stores?.play && config.stores.playLive !== false ? `https://play.google.com/store/apps/details?id=${config.stores.play}` : null;
  const sample = items.slice(0, 5).map(i => `- ${i.title}: ${i.facts.slice(0, 2).join(", ")}`).join("\n");
  const s = [];
  s.push(`# ${config.name} launch kit\n\n${config.tagline}. ${config.promise}${config.redo ? ` ${config.redo}` : ""}\nCovers ${scope}.`);
  s.push(`## Launch day, hour by hour\n\n1. 08:00 Check the site${play ? " and the store page open" : " opens"}; go through it once yourself, start to finish (with a real card if payments are on).\n2. 09:00 The launch post goes out on your own channels (scheduler, or paste from below).\n3. 09:30 Send the friends and family email.\n4. 10:00 to 12:00 Submit to the directories below (about 10 minutes each).\n5. Afternoon: answer every comment and review by hand on day one.\n6. Evening: note sales and installs, so next Monday's report has a baseline.`);
  s.push(`## Launch post (own channels)\n\n${config.name} is live. ${config.tagline}. ${config.promise}\n\n${play ? `Android: ${play}\n` : ""}Web: ${link("own-channels")}`);
  s.push(`## Email to friends and family\n\nSubject: I launched ${config.name} today\n\nHi,\n\nToday I launched ${config.name}: ${config.tagline.charAt(0).toLowerCase() + config.tagline.slice(1)}. ${config.promise}\n\nIf you or anyone you know needs it, here it is: ${link("email-friends")}\n\nTwo things help a new app most: trying it, and an honest review if you used it. Please don't leave a review if you haven't.\n\nThank you!`);
  s.push(`## Directory entries\n\nName: ${config.name}\nOne line: ${config.tagline}\nDescription: ${config.tagline}. ${config.promise} Covers ${scope}.\nWebsite: ${link("directory")}\n${play ? `Play: ${play}\n` : ""}\n` +
    (config.directories || []).map(d => `- [ ] [${d.name}](${d.url})`).join("\n"));
  s.push(`## Press note (for local news, diaspora media and bloggers)\n\n${config.name} launches: ${config.tagline.charAt(0).toLowerCase() + config.tagline.slice(1)}.\n\n${config.name} covers ${scope}, each checked against its official source. ${config.promise}${config.owner ? `\n\n${config.name} is run by ${config.owner}.` : ""}${config.contact ? `\n\nContact: ${config.contact}` : ""}\n\nExamples:\n${sample}`);
  const text = s.join("\n\n");
  return { text, problems: banned(config, text).map(w => `launch kit uses "${w}"`) };
}

export async function run(app) {
  const { text, problems } = kit(app.config, await app.items());
  const file = await writeText(outPath(app.name, "launch-kit.md"), text + "\n");
  return { summary: `${app.config.name} launch kit written`, files: [file], problems };
}
