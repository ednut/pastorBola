/* POST /api/payment-webhook  Korapay calls this when a payment succeeds (see lib/payments.js). */
import { handleWebhook } from "../lib/payments.js";
import { offer } from "../lib/offer.js";
import { mailer } from "../lib/forms.js";
import { siteOrigin, parsedBody } from "../lib/http.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false }); }
  const sendEmail = mailer();
  const { status, body } = await handleWebhook(parsedBody(req), req.headers, {
    offer: offer(),
    origin: siteOrigin(req),
    sendEmail: sendEmail || (async () => { throw new Error("email is not set up"); }),
  });
  return res.status(status).json(body);
}
