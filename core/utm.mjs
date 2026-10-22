// Tracking links: every post, video and email gets its own, so the Monday report can say which channel sells.
export function tracked(url, { source, medium = "social", campaign, content } = {}) {
  const u = new URL(url);
  if (source) u.searchParams.set("utm_source", slug(source));
  if (medium) u.searchParams.set("utm_medium", slug(medium));
  if (campaign) u.searchParams.set("utm_campaign", slug(campaign));
  if (content) u.searchParams.set("utm_content", slug(content));
  return u.toString();
}
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
