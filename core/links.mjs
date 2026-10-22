import { tracked } from "./utm.mjs";
// Where a post about an item should send people: the item's own page once the app has them, else the home page.
export const pageOf = (config, item) => (config.itemPages ? item.url : config.site);
export const linkFor = (config, item, channel, campaign = "autopilot") =>
  tracked(pageOf(config, item), { source: channel, medium: "social", campaign, content: item.id });
