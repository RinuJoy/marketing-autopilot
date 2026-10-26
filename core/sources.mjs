// Data the report and other engines read. Each returns plain numbers, or throws a clear "not set" error that the
// report shows as a line to switch on, never as a crash.
import { gapi, SC, PLAY } from "./google.mjs";

const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

// Search Console: rows by page or query over the last 7 days (data lags about 3 days).
const scSite = (config, env) => env?.SEARCH_CONSOLE_SITE || `sc-domain:${new URL(config.site).host}`;
const scQuery = (config, env, body) =>
  gapi(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(scSite(config, env))}/searchAnalytics/query`, { scope: SC, method: "POST", env, body });
const row = r => ({ key: r.keys?.[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position });

export async function searchConsole(config, { dimension = "page", days = 7, rowLimit = 500, env } = {}) {
  const j = await scQuery(config, env, { startDate: day(days + 3), endDate: day(3), dimensions: [dimension], rowLimit });
  return (j.rows || []).map(row);
}

// The week in search against the week before: totals (clicks, views, CTR, average position) and the top searches.
// Each week is 7 full days ending 3 days ago, because Google's numbers take about that long to settle.
export async function searchWeek(config, { env, top = 10 } = {}) {
  const totals = async (from, to) => {
    const r = (await scQuery(config, env, { startDate: day(from), endDate: day(to) })).rows?.[0];
    return r ? row(r) : { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  };
  const [now, before, queries] = await Promise.all([
    totals(9, 3), totals(16, 10),
    scQuery(config, env, { startDate: day(9), endDate: day(3), dimensions: ["query"], rowLimit: top }).then(j => (j.rows || []).map(row)),
  ]);
  return { from: day(9), to: day(3), now, before, queries };
}

// Indexing: what the sitemaps report (pages sent, pages Google says it indexed) and, for the pages that matter most
// (app.json report.watch), Google's own verdict from URL Inspection. Each page that can't be read says why.
export async function indexStatus(config, { env, fetch: get } = {}) {
  const site = scSite(config, env), base = new URL(config.site);
  const call = get || ((url, o) => gapi(url, { scope: SC, env, ...o }));
  const maps = await call(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/sitemaps`);
  const sitemaps = (maps.sitemap || []).map(m => {
    const web = (m.contents || []).find(c => c.type === "web") || {};
    return { path: m.path, submitted: Number(web.submitted || 0), indexed: Number(web.indexed || 0), errors: Number(m.errors || 0), warnings: Number(m.warnings || 0), read: m.lastDownloaded || "" };
  });
  const pages = [];
  for (const p of config.report?.watch || ["/"]) {
    const url = new URL(p, base).href;
    try {
      const j = await call("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", { method: "POST", body: { inspectionUrl: url, siteUrl: site } });
      const r = j.inspectionResult?.indexStatusResult || {};
      pages.push({ url, state: r.coverageState || r.verdict || "unknown", crawled: (r.lastCrawlTime || "").slice(0, 10) });
    } catch (e) { pages.push({ url, state: `not read (${e.message.slice(0, 80)})`, crawled: "" }); }
  }
  return { sitemaps, pages };
}

// Play: the latest reviews (the API keeps the last 7 days of reviews with text).
export async function playReviews(config, { env } = {}) {
  if (!config.stores?.play) throw new Error("no Play id in app.json");
  const j = await gapi(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${config.stores.play}/reviews?maxResults=100`, { scope: PLAY, env });
  return (j.reviews || []).map(r => {
    const c = r.comments?.[0]?.userComment || {}, dev = r.comments?.find(x => x.developerComment);
    return { id: r.reviewId, author: r.authorName, stars: c.starRating, text: (c.text || "").trim(), lang: c.reviewerLanguage, version: c.appVersionName, answered: !!dev };
  });
}

// Paddle: completed transactions in the last 7 days (or since a date), by country and currency, plus each order's
// country and the document it was for (custom_data.doc, which Picproved's Worker sets).
export async function paddleSales(config, { env = process.env, days = 7, since: from } = {}) {
  if (!env.PADDLE_API_KEY) throw new Error("PADDLE_API_KEY not set");
  const base = env.PADDLE_ENV === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
  const since = from ? new Date(from).toISOString() : new Date(Date.now() - days * 864e5).toISOString();
  let url = `${base}/transactions?status=completed&created_at[GT]=${encodeURIComponent(since)}&per_page=200&include=address`, list = [];
  for (let page = 0; url && page < 20; page++) {
    const res = await fetch(url, { headers: { authorization: `Bearer ${env.PADDLE_API_KEY}` } });
    if (!res.ok) throw new Error(`Paddle HTTP ${res.status}`);
    const j = await res.json();
    list = list.concat(j.data || []);
    url = j.meta?.pagination?.has_more ? j.meta.pagination.next : null;
  }
  const by = {}, orders = [];
  for (const t of list) {
    const country = t.address?.country_code || t.billing_details?.address?.country_code || "??";
    const cur = t.currency_code, total = Number(t.details?.totals?.grand_total || 0) / 100;
    by[country] ??= { sales: 0, money: {} };
    by[country].sales++;
    by[country].money[cur] = (by[country].money[cur] || 0) + total;
    orders.push({ country, doc: t.custom_data?.doc || "", at: t.created_at });
  }
  return { count: list.length, byCountry: by, orders };
}

// Cloudflare Web Analytics: the website's visits and page views over the last 7 days, with the top pages and countries.
// Cookieless and anonymous, so these are counts, never people. Needs an API token with "Account Analytics: Read".
export async function webVisits(config, { env = process.env, days = 7, fetch: get = fetch } = {}) {
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) throw new Error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID not set");
  const host = new URL(config.site).host, to = new Date(), from = new Date(to - days * 864e5);
  const f = `filter: { datetime_geq: $from, datetime_lt: $to, requestHost: $host }`;
  const query = `query ($account: string!, $from: Time!, $to: Time!, $host: string!) { viewer { accounts(filter: { accountTag: $account }) {
    total: rumPageloadEventsAdaptiveGroups(limit: 1, ${f}) { count sum { visits } }
    pages: rumPageloadEventsAdaptiveGroups(limit: 10, orderBy: [count_DESC], ${f}) { count dimensions { requestPath } }
    countries: rumPageloadEventsAdaptiveGroups(limit: 10, orderBy: [count_DESC], ${f}) { count dimensions { countryName } }
  } } }`;
  const res = await get("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST", headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { account: env.CLOUDFLARE_ACCOUNT_ID, from: from.toISOString(), to: to.toISOString(), host } }),
  });
  if (!res.ok) throw new Error(`Cloudflare HTTP ${res.status}`);
  const j = await res.json();
  if (j.errors?.length) throw new Error(`Cloudflare: ${j.errors[0].message}`);
  const a = j.data?.viewer?.accounts?.[0] || {}, t = a.total?.[0];
  return {
    views: t?.count || 0, visits: t?.sum?.visits || 0,
    pages: (a.pages || []).map(r => ({ key: r.dimensions.requestPath, views: r.count })),
    countries: (a.countries || []).map(r => ({ key: r.dimensions.countryName, views: r.count })),
  };
}
