// Reply drafts: every unanswered Play review gets a draft reply in a file for a person to approve. Nothing is posted.
// The weekly Claude routine rewrites the drafts in the reviewer's own language before you see them.
import { playReviews } from "../core/sources.mjs";
import { writeText, outPath } from "../core/util.mjs";

export function draft(config, r) {
  const help = config.contact ? ` Please email ${config.contact} and we'll sort it out.` : "";
  if (r.stars >= 4) return `Thank you for the kind review! We're glad ${config.name} helped.`;
  if (r.stars === 3) return `Thanks for the honest review. What one thing would make ${config.name} better for you?${help}`;
  return `Sorry ${config.name} let you down.${help || " Tell us what went wrong and we'll fix it."}`;
}

export async function run(app, { env = process.env, reviews } = {}) {
  try { reviews ??= await playReviews(app.config, { env }); }
  catch (e) { return { summary: `not switched on: ${e.message}`, problems: [] }; }
  const open = reviews.filter(r => !r.answered && r.text);
  const text = open.map(r => `### ${"★".repeat(r.stars || 0)} ${r.author || "Someone"} (${r.lang || "?"}, v${r.version || "?"})\n> ${r.text}\n\nDraft: ${draft(app.config, r)}`).join("\n\n");
  const file = await writeText(outPath(app.name, "reply-drafts.md"), text + "\n");
  return { summary: `${open.length} reviews waiting for a reply`, text, files: [file], problems: open.filter(r => r.stars <= 2).length ? ["low-star reviews waiting"] : [] };
}
