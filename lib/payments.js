/* E-book payments with Korapay (https://developers.korapay.com).

   How it works, with no database:
   1. /api/checkout        asks Korapay for a checkout link and sends the buyer there.
   2. Korapay              takes the payment on its own secure page.
   3. /api/payment-webhook Korapay tells us a payment succeeded. We check the message is genuine,
                           confirm the payment with Korapay, and email the buyer a download link.
   4. /api/payment-status  the page the buyer returns to asks this whether the payment worked
                           and gets the download link if it did.
   5. /api/ebook-download  checks the signed, expiring link and streams the private file.

   The price comes from src/_data/books.json, never from the browser. */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const KORAPAY = "https://api.korapay.com/merchant/api/v1";
/* Korapay refuses some addresses that a simple check lets through (two dots in a row, a dot at an end,
   a missing top-level domain). Checking the same way here lets us tell the buyer to fix the address. */
const EMAIL_RE = /^(?!\.)(?!.*\.\.)[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+(?<!\.)@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;
export const isValidEmail = (v) => typeof v === "string" && v.length <= 254 && EMAIL_RE.test(v);
export const LINK_HOURS = 48;

const clean = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* The book that is for sale, or null while the e-book is not switched on.
   It needs the file and a `prices` map in the book data, for example { "NGN": 8000, "USD": 8 }.
   Each price is a whole number in that currency. Prices that are missing, zero or fractional are ignored. */
export function ebookOffer(books) {
  const book = books?.[0];
  const prices = {};
  for (const [code, value] of Object.entries(book?.ebook?.prices ?? {})) {
    const n = Number(value);
    if (/^[A-Z]{3}$/.test(code) && Number.isInteger(n) && n > 0) prices[code] = n;
  }
  if (!book?.ebook?.file || !Object.keys(prices).length) return null;
  return { title: book.title, prices, file: book.ebook.file, filename: book.ebook.filename || "Women-Who-Build.pdf" };
}

export const newReference = () => `WWB-${Date.now().toString(36)}-${randomBytes(12).toString("hex")}`;
const REFERENCE_RE = /^WWB-[a-z0-9]+-[a-f0-9]{24}$/;
export const isReference = (v) => REFERENCE_RE.test(String(v ?? ""));

/* ---- signed, expiring download links ---- */
const linkKey = (env) => createHmac("sha256", env.EBOOK_LINK_SECRET || env.KORAPAY_SECRET_KEY || "").update("ebook-link-v1").digest();
const b64 = (buf) => Buffer.from(buf).toString("base64url");

export function signDownloadToken(reference, env, now = Date.now(), hours = LINK_HOURS) {
  const payload = b64(JSON.stringify({ r: reference, e: now + hours * 3600 * 1000 }));
  const sig = b64(createHmac("sha256", linkKey(env)).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifyDownloadToken(token, env, now = Date.now()) {
  const [payload, sig] = String(token ?? "").split(".");
  if (!payload || !sig || !(env.EBOOK_LINK_SECRET || env.KORAPAY_SECRET_KEY)) return null;
  const expected = createHmac("sha256", linkKey(env)).update(payload).digest();
  let given;
  try { given = Buffer.from(sig, "base64url"); } catch { return null; }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const { r, e } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!isReference(r) || typeof e !== "number" || now > e) return null;
    return { reference: r, expires: e };
  } catch { return null; }
}

/* ---- Korapay calls ---- */
async function korapay(fetchImpl, env, method, path, body) {
  const res = await fetchImpl(`${KORAPAY}${path}`, {
    method,
    headers: { authorization: `Bearer ${env.KORAPAY_SECRET_KEY}`, "content-type": "application/json", accept: "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  let json = {};
  try { json = await res.json(); } catch { /* not JSON */ }
  return { ok: res.ok, status: res.status, json };
}

/* Start a payment. Returns { status, body } for the browser. */
export async function startCheckout(body, { env = process.env, fetchImpl = fetch, offer, origin }) {
  if (!env.KORAPAY_SECRET_KEY) return { status: 503, body: { ok: false, error: "not_configured" } }; // key missing
  if (!offer) return { status: 503, body: { ok: false, error: "not_for_sale" } }; // key is set, e-book is off
  if (clean(body?.company, 200)) return { status: 200, body: { ok: true } }; // bot trap
  const name = clean(body?.name, 120);
  const email = clean(body?.email, 320);
  const currency = clean(body?.currency, 3).toUpperCase() || (offer.prices.NGN ? "NGN" : Object.keys(offer.prices)[0]);
  const fields = {};
  if (!name) fields.name = "Please enter your name.";
  if (!isValidEmail(email)) fields.email = "Please check your email address. It looks mistyped.";
  if (!offer.prices[currency]) fields.currency = "Please choose how you would like to pay.";
  if (Object.keys(fields).length) return { status: 422, body: { ok: false, error: "invalid", fields } };

  const reference = newReference();
  const r = await korapay(fetchImpl, env, "POST", "/charges/initialize", {
    reference,
    amount: offer.prices[currency],
    currency,
    narration: `${offer.title} (e-book)`,
    customer: { name, email },
    redirect_url: `${origin}/books/thank-you/`,
    notification_url: `${origin}/api/payment-webhook`,
    metadata: { product: "ebook", email, name: name.slice(0, 60) },
  });
  const url = r.json?.data?.checkout_url;
  if (!r.ok || !url) {
    // Korapay's reply can name the field it disliked. Log that, with any email addresses hidden.
    const why = JSON.stringify(r.json?.data ?? r.json?.errors ?? {}).replace(/[^\s"',:{}\[\]]+@[^\s"',:{}\[\]]+/g, "[email]").slice(0, 300);
    console.error(`[payments] initialize failed for ${currency}: ${r.status} ${String(r.json?.message ?? "").slice(0, 200)} ${why}`);
    const bad = r.json?.data && typeof r.json.data === "object" ? r.json.data : {};
    if (r.status === 422 && bad["customer.email"]) return { status: 422, body: { ok: false, error: "invalid", fields: { email: "Please check your email address. It looks mistyped." } } };
    if (r.status === 422 && bad["customer.name"]) return { status: 422, body: { ok: false, error: "invalid", fields: { name: "Please check your name and try again." } } };
    return { status: 502, body: { ok: false, error: "checkout_failed" } };
  }
  return { status: 200, body: { ok: true, checkout_url: url } };
}

/* Ask Korapay what happened to a payment. Returns the facts we need, never trusting the browser.
   A payment only counts if it was in a currency we sell in and covers that currency's price. */
export async function checkPayment(reference, { env = process.env, fetchImpl = fetch, offer }) {
  if (!isReference(reference)) return { state: "unknown" };
  const r = await korapay(fetchImpl, env, "GET", `/charges/${encodeURIComponent(reference)}`);
  const d = r.json?.data;
  if (!r.ok || !d) {
    console.error(`[payments] charge check failed: ${r.status} ${String(r.json?.message ?? "").slice(0, 120)}`);
    return { state: r.status === 404 ? "unknown" : "error" };
  }
  const status = String(d.status ?? "").toLowerCase();
  if (status === "success") {
    const paid = Number(d.amount_paid ?? d.amount);
    const expected = offer.prices[String(d.currency || "NGN").toUpperCase()];
    if (!expected || !(paid >= expected)) {
      console.error(`[payments] a successful charge was not accepted: currency=${d.currency} amount=${d.amount} amount_paid=${d.amount_paid} expected=${expected}`);
      return { state: "wrong_amount" };
    }
    return { state: "paid", email: d.metadata?.email || d.customer?.email || "", name: d.metadata?.name || d.customer?.name || "" };
  }
  if (["failed", "cancelled", "canceled", "expired"].includes(status)) return { state: "failed" };
  return { state: "pending" };
}

/* What the thank-you page asks. */
export async function paymentStatus(reference, deps) {
  const { env = process.env } = deps;
  if (!env.KORAPAY_SECRET_KEY) return { status: 503, body: { ok: false, error: "not_configured" } }; // key missing
  if (!deps.offer) return { status: 503, body: { ok: false, error: "not_for_sale" } }; // key is set, e-book is off
  const p = await checkPayment(reference, deps);
  if (p.state === "paid") {
    return { status: 200, body: { ok: true, state: "paid", download_url: `/api/ebook-download?token=${signDownloadToken(reference, env)}`, email: p.email || undefined } };
  }
  if (p.state === "error") return { status: 502, body: { ok: false, error: "check_failed" } };
  return { status: 200, body: { ok: true, state: p.state } };
}

/* Check the webhook really came from Korapay: HMAC-SHA256 of the "data" object, keyed with the secret key. */
export function webhookSignatureValid(data, headers, env) {
  const given = String(headers["x-korapay-signature"] || headers["kora-signature"] || "").trim().toLowerCase();
  if (!given || !env.KORAPAY_SECRET_KEY || data == null) return false;
  const expected = createHmac("sha256", env.KORAPAY_SECRET_KEY).update(JSON.stringify(data)).digest("hex");
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* Korapay says a payment succeeded. Confirm it, then email the download link.
   sendEmail is passed in so this file does not depend on the form code. */
export async function handleWebhook(payload, headers, { env = process.env, fetchImpl = fetch, offer, origin, sendEmail }) {
  if (!offer || !env.KORAPAY_SECRET_KEY) return { status: 503, body: { ok: false } };
  if (!webhookSignatureValid(payload?.data, headers, env)) {
    console.error(`[payments] webhook rejected: signature did not match (header present: ${Boolean(headers["x-korapay-signature"] || headers["kora-signature"])})`);
    return { status: 401, body: { ok: false } };
  }
  if (payload.event !== "charge.success") return { status: 200, body: { ok: true, ignored: true } };

  const reference = payload.data?.payment_reference || payload.data?.reference;
  const p = await checkPayment(reference, { env, fetchImpl, offer });
  if (p.state !== "paid") return { status: 200, body: { ok: true, ignored: true } }; // not a real, full payment: do nothing
  if (!p.email || !isValidEmail(p.email)) {
    console.error("[payments] paid but no buyer email on the charge; the buyer can still download from the thank-you page");
    return { status: 200, body: { ok: true, emailed: false } };
  }
  const link = `${origin}/api/ebook-download?token=${signDownloadToken(reference, env)}`;
  const first = clean(p.name, 60).split(" ")[0] || "there";
  try {
    await sendEmail({
      to: [{ email: p.email, ...(p.name ? { name: p.name } : {}) }],
      subject: `Your e-book: ${offer.title}`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#261a20;max-width:560px">
<p style="margin:0 0 14px">Thank you, ${escapeHtml(first)}. Your payment was received.</p>
<p style="margin:0 0 14px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#8a1538;color:#ffffff;padding:12px 20px;text-decoration:none;border-radius:2px">Download ${escapeHtml(offer.title)}</a></p>
<p style="margin:0 0 14px">This link works for ${LINK_HOURS} hours. Please save the file to your device once you have downloaded it.</p>
<p style="margin:24px 0 0">With thanks,<br>Pastor Bola’s team</p></div>`,
    });
  } catch (e) {
    console.error(`[payments] download email failed: ${e.message}`);
    return { status: 500, body: { ok: false } }; // not 200, so Korapay tries again later
  }
  return { status: 200, body: { ok: true, emailed: true } };
}

/* The download step: check the link, then fetch the private file. getBlob is passed in so tests can fake it. */
export async function prepareDownload(token, { env = process.env, offer, getBlob }) {
  if (!offer) return { status: 503, message: "This download is not available yet." };
  if (!verifyDownloadToken(token, env)) {
    return { status: 403, message: "This download link is not valid or has expired. Please contact Pastor Bola's team." };
  }
  const result = await getBlob(offer.file);
  if (!result || result.statusCode !== 200) return { status: 404, message: "File not found." };
  return {
    status: 200,
    stream: result.stream,
    headers: {
      "Content-Type": result.blob?.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${offer.filename}"`,
      "X-Content-Type-Options": "nosniff",
    },
  };
}
