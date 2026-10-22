// AI search file: /llms.txt in the llmstxt.org format, a plain list of what the site covers, so AI assistants
// (ChatGPT, Perplexity, Gemini) can quote it and link the right page. Copy out/<app>/llms.txt to the site root.
import { writeText, outPath } from "../core/util.mjs";
import { pageOf } from "../core/links.mjs";

export function llms(config, items) {
  const groups = new Map();
  for (const it of items) {
    const g = it.countryName || "Other";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(it);
  }
  const out = [`# ${config.name}`, "", `> ${config.tagline}. ${config.promise || ""}`.trim(), ""];
  out.push(`${config.name} covers ${items.length} items. Each line gives the key facts and where they come from.`, "");
  for (const [g, list] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    out.push(`## ${g}`, "");
    for (const it of list) {
      const src = it.sources[0] ? ` Source: ${it.sources[0].url}` : "";
      out.push(`- [${it.title}](${pageOf(config, it)}): ${it.facts.slice(0, 3).join("; ")}.${src}`);
    }
    out.push("");
  }
  return out.join("\n");
}

export async function run(app) {
  const file = await writeText(outPath(app.name, "llms.txt"), llms(app.config, await app.items()));
  return { summary: `llms.txt written for ${app.config.name}`, files: [file], problems: [] };
}
