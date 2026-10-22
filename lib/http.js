/* Small helpers shared by the API functions. */

/* The site's own address, used for the links we give Korapay and in emails. */
export function siteOrigin(req, env = process.env) {
  if (env.SITE_URL) return env.SITE_URL.replace(/\/+$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const proto = /^localhost|^127\./.test(host) ? "http" : "https";
  return `${proto}://${host}`;
}

/* True when the browser sent the request from the site itself (or sent no Origin at all). */
export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  try { return new URL(origin).host === host; } catch { return false; }
}

export const clientIp = (req) => String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";

export function parsedBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = Object.fromEntries(new URLSearchParams(body)); }
  }
  return body || {};
}
