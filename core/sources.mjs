// Data the report and other engines read. Each returns plain numbers, or throws a clear "not set" error that the
// report shows as a line to switch on, never as a crash.
import { gapi, SC, PLAY } from "./google.mjs";

const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

// Search Console: rows by page or query over the last 7 days (data lags about 3 days).
export async function searchConsole(config, { dimension = "page", days = 7, rowLimit = 500, env } = {}) {
  const site = env?.SEARCH_CONSOLE_SITE || `sc-domain:${new URL(config.site).host}`;
  const j = await gapi(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
    scope: SC, method: "POST", env, body: { startDate: day(days + 3), endDate: day(3), dimensions: [dimension], rowLimit },
  });
  return (j.rows || []).map(r => ({ key: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
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
