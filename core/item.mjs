// The shape every adapter returns. Engines only rely on these fields, so any app can plug in.
//   id        stable, url-safe ("uk-passport-digital", "exeter-city")
//   title     what a person searches for ("UK passport photo (online)", "Away at Exeter City")
//   summary   one sentence with the key facts
//   url       the page on the app's site for this item (absolute)
//   country   ISO code or null; language (optional, default "en")
//   facts     short lines a post or video can show ("35×45 mm", "Station: St James Park, 5 min walk")
//   questions [{ q, a }] for FAQ pages, llms.txt and reply drafts
//   sources   [{ label, url }] official or cited pages, watched by rule-watch
//   tags      free words seasons and queues match on ("visa", "exam", "league-two")
export function checkItem(it) {
  const p = [];
  if (!it || typeof it !== "object") return ["not an object"];
  if (!/^[a-z0-9][a-z0-9-]*$/.test(it.id || "")) p.push("id must be lower-case letters, digits and dashes");
  if (!it.title) p.push("no title");
  if (!it.summary) p.push("no summary");
  if (!/^https:\/\//.test(it.url || "")) p.push("url must be https");
  for (const k of ["facts", "questions", "sources", "tags"]) if (!Array.isArray(it[k])) p.push(k + " must be a list");
  for (const s of it.sources || []) if (!/^https?:\/\//.test(s?.url || "")) p.push("source without a web address");
  return p;
}
