// Deliberately boring rate limiting: a sliding window in the function instance's
// memory. No Redis, no KV, nothing to provision — a fork deploys and works.
//
// The honest caveat: serverless instances come and go, so a determined caller
// spread across cold starts gets more than the stated limit. That is fine here.
// The real ceiling on cost is structural — a ticket from /api/script is required
// to synthesise anything, and a meditation is capped at 18 short lines.

const windows = new Map();

export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

/**
 * @returns {{ok: true} | {ok: false, retryAfterSeconds: number}}
 */
export function rateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  const hits = (windows.get(key) || []).filter((t) => now - t < windowMs);

  if (hits.length >= limit) {
    windows.set(key, hits);
    return { ok: false, retryAfterSeconds: Math.ceil((windowMs - (now - hits[0])) / 1000) };
  }

  hits.push(now);
  windows.set(key, hits);

  // Keep the map from growing without bound on a long-lived instance.
  if (windows.size > 5000) {
    for (const [k, v] of windows) {
      if (!v.length || now - v[v.length - 1] > windowMs) windows.delete(k);
    }
  }

  return { ok: true };
}
