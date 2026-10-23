/* Vercel serverless function: POST /api/forms
   Receives every form on the site. The logic lives in lib/forms.js. */
import { handleSubmission, rateLimited } from "../lib/forms.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  // Only accept forms sent from the site itself.
  const origin = req.headers.origin;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (origin) {
    let originHost = "";
    try { originHost = new URL(origin).host; } catch { /* ignore */ }
    if (originHost !== host) return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (rateLimited("forms:" + ip)) return res.status(429).json({ ok: false, error: "too_many_requests" });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = Object.fromEntries(new URLSearchParams(body)); }
  }

  const { status, body: payload } = await handleSubmission(body || {});
  return res.status(status).json(payload);
}
