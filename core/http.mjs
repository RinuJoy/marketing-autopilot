// fetch with a timeout and a plain browser-like user agent. Behind a proxy, run Node with NODE_USE_ENV_PROXY=1.
export async function get(url, { timeout = 20000, headers = {}, ...rest } = {}) {
  return fetch(url, {
    redirect: "follow", signal: AbortSignal.timeout(timeout), ...rest,
    headers: { "user-agent": "Mozilla/5.0 (compatible; marketing-autopilot; +rule-watch)", "accept-language": "en", ...headers },
  });
}

// Runs fn over items, n at a time.
export async function pool(list, n, fn) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (next < list.length) { const i = next++; out[i] = await fn(list[i], i); }
  }));
  return out;
}
