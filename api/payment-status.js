/* GET /api/payment-status?reference=...  (see lib/payments.js) */
import { paymentStatus } from "../lib/payments.js";
import { offer } from "../lib/offer.js";
import { rateLimited } from "../lib/forms.js";
import { clientIp } from "../lib/http.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ ok: false, error: "method_not_allowed" }); }
  if (rateLimited("status:" + clientIp(req))) return res.status(429).json({ ok: false, error: "too_many_requests" });
  const { status, body } = await paymentStatus(req.query?.reference, { offer: offer() });
  return res.status(status).json(body);
}
