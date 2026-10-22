/* POST /api/checkout  (see lib/payments.js) */
import { startCheckout } from "../lib/payments.js";
import { offer } from "../lib/offer.js";
import { rateLimited } from "../lib/forms.js";
import { siteOrigin, sameOrigin, clientIp, parsedBody } from "../lib/http.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false, error: "method_not_allowed" }); }
  if (!sameOrigin(req)) return res.status(403).json({ ok: false, error: "forbidden" });
  if (rateLimited(clientIp(req))) return res.status(429).json({ ok: false, error: "too_many_requests" });
  const { status, body } = await startCheckout(parsedBody(req), { offer: offer(), origin: siteOrigin(req) });
  return res.status(status).json(body);
}
