import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  ebookOffer, signDownloadToken, verifyDownloadToken, startCheckout, checkPayment, paymentStatus,
  handleWebhook, webhookSignatureValid, prepareDownload, newReference, isReference, LINK_HOURS,
} from "../lib/payments.js";

const env = { KORAPAY_SECRET_KEY: "sk_test_abc" };
const offer = { title: "Women Who Build", prices: { NGN: 3500, USD: 10 }, file: "ebooks/women-who-build.pdf", filename: "Women-Who-Build.pdf" };
const origin = "https://www.example.org";

// A pretend Korapay. `charge` is what "GET /charges/:reference" returns.
function fakeKora({ initialize, charge, chargeStatus = 200, initStatus = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    if (url.endsWith("/charges/initialize")) return { ok: initStatus < 400, status: initStatus, json: async () => initialize ?? { status: true, data: { checkout_url: "https://checkout.korapay.example/abc", reference: "x" } } };
    return { ok: chargeStatus < 400, status: chargeStatus, json: async () => (charge ? { status: true, data: charge } : { status: false }) };
  };
  return { calls, fetchImpl };
}
const paid = (over = {}) => ({ status: "success", amount: 3500, amount_paid: 3500, currency: "NGN", metadata: { email: "ada@example.com", name: "Ada Okafor" }, ...over });

test("ebookOffer: off until there is a file and at least one whole-number price", () => {
  const mk = (ebook) => ebookOffer([{ title: "T", ebook }]);
  assert.equal(ebookOffer([{ title: "T" }]), null);
  assert.equal(mk({ priceNgn: 0, priceUsd: 0, file: "a.pdf" }), null);
  assert.equal(mk({ priceNgn: 3500, file: "" }), null);
  assert.equal(mk({ priceNgn: 35.5, file: "a.pdf" }), null, "no fractions");
  assert.deepEqual(mk({ priceNgn: 3500, priceUsd: 0, file: "a.pdf" }), { title: "T", prices: { NGN: 3500 }, file: "a.pdf", filename: "Women-Who-Build.pdf" });
  assert.deepEqual(mk({ priceNgn: 3500, priceUsd: 10, file: "a.pdf", filename: "x.pdf" }).prices, { NGN: 3500, USD: 10 });
  assert.deepEqual(mk({ priceUsd: 10, file: "a.pdf" }).prices, { USD: 10 });
});

test("references are random and recognisable", () => {
  const a = newReference(), b = newReference();
  assert.notEqual(a, b); assert.ok(isReference(a));
  assert.equal(isReference("../etc/passwd"), false); assert.equal(isReference(""), false);
});

test("download links: valid, expired, tampered, wrong secret", () => {
  const ref = newReference(), now = 1_000_000;
  const token = signDownloadToken(ref, env, now);
  assert.equal(verifyDownloadToken(token, env, now + 1000).reference, ref);
  assert.equal(verifyDownloadToken(token, env, now + (LINK_HOURS * 3600 + 1) * 1000), null, "expired");
  const [p, s] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ r: newReference(), e: now + 999999999 })).toString("base64url");
  assert.equal(verifyDownloadToken(`${forged}.${s}`, env, now), null, "payload changed");
  assert.equal(verifyDownloadToken(`${p}.${s}x`, env, now), null, "signature changed");
  assert.equal(verifyDownloadToken(token, { KORAPAY_SECRET_KEY: "other" }, now), null, "different key");
  assert.equal(verifyDownloadToken(token, {}, now), null, "no key");
  assert.equal(verifyDownloadToken("", env, now), null);
});

test("checkout: asks Korapay with the server's price and sends the buyer to the checkout page", async () => {
  const { calls, fetchImpl } = fakeKora();
  const r = await startCheckout({ name: "Ada Okafor", email: "ada@example.com", amount: 1, price: 1 }, { env, fetchImpl, offer, origin });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, checkout_url: "https://checkout.korapay.example/abc" });
  const c = calls[0];
  assert.equal(c.url, "https://api.korapay.com/merchant/api/v1/charges/initialize");
  assert.equal(c.headers.authorization, "Bearer sk_test_abc");
  assert.equal(c.body.amount, 3500, "the browser cannot change the price");
  assert.equal(c.body.currency, "NGN");
  assert.ok(isReference(c.body.reference));
  assert.equal(c.body.redirect_url, `${origin}/books/thank-you/`);
  assert.equal(c.body.notification_url, `${origin}/api/payment-webhook`);
  assert.deepEqual(c.body.customer, { name: "Ada Okafor", email: "ada@example.com" });
  assert.deepEqual(Object.keys(c.body.metadata).sort(), ["email", "name", "product"]);
});

test("checkout: naira is the default, dollars can be chosen, and unknown currencies are refused", async () => {
  const usd = fakeKora();
  const r = await startCheckout({ name: "Ada", email: "ada@example.com", currency: "usd" }, { env, fetchImpl: usd.fetchImpl, offer, origin });
  assert.equal(r.status, 200);
  assert.equal(usd.calls[0].body.amount, 10); assert.equal(usd.calls[0].body.currency, "USD");
  const def = fakeKora();
  await startCheckout({ name: "Ada", email: "ada@example.com" }, { env, fetchImpl: def.fetchImpl, offer, origin });
  assert.equal(def.calls[0].body.currency, "NGN"); assert.equal(def.calls[0].body.amount, 3500);
  const gbp = fakeKora();
  const bad = await startCheckout({ name: "Ada", email: "ada@example.com", currency: "GBP" }, { env, fetchImpl: gbp.fetchImpl, offer, origin });
  assert.equal(bad.status, 422); assert.ok(bad.body.fields.currency); assert.equal(gbp.calls.length, 0);
  const only = fakeKora();
  await startCheckout({ name: "Ada", email: "ada@example.com" }, { env, fetchImpl: only.fetchImpl, offer: { ...offer, prices: { USD: 10 } }, origin });
  assert.equal(only.calls[0].body.currency, "USD", "a dollars-only offer defaults to dollars");
});

test("checkout: validates, ignores bots, and says so when not switched on or when Korapay fails", async () => {
  const k = fakeKora();
  assert.equal((await startCheckout({ name: "", email: "bad" }, { env, fetchImpl: k.fetchImpl, offer, origin })).status, 422);
  assert.equal(k.calls.length, 0);
  assert.equal((await startCheckout({ name: "A", email: "a@b.co", company: "Acme" }, { env, fetchImpl: k.fetchImpl, offer, origin })).status, 200);
  assert.equal(k.calls.length, 0, "bot trap sends nothing");
  assert.equal((await startCheckout({ name: "A", email: "a@b.co" }, { env, fetchImpl: k.fetchImpl, offer: null, origin })).status, 503);
  assert.equal((await startCheckout({ name: "A", email: "a@b.co" }, { env: {}, fetchImpl: k.fetchImpl, offer, origin })).status, 503);
  const bad = fakeKora({ initStatus: 400, initialize: { status: false, message: "nope" } });
  assert.equal((await startCheckout({ name: "A", email: "a@b.co" }, { env, fetchImpl: bad.fetchImpl, offer, origin })).status, 502);
});

test("checkPayment: only a full, successful naira payment counts", async () => {
  const ref = newReference();
  const run = (charge, extra = {}) => checkPayment(ref, { env, offer, ...fakeKora({ charge, ...extra }) });
  assert.deepEqual(await run(paid()), { state: "paid", email: "ada@example.com", name: "Ada Okafor" });
  assert.equal((await run(paid({ amount_paid: 1000 }))).state, "wrong_amount");
  assert.equal((await run(paid({ currency: "GBP" }))).state, "wrong_amount", "a currency we do not sell in");
  assert.equal((await run(paid({ currency: "USD", amount: 10, amount_paid: 10 }))).state, "paid", "full dollar price");
  assert.equal((await run(paid({ currency: "USD", amount: 5, amount_paid: 5 }))).state, "wrong_amount", "dollar underpayment");
  assert.equal((await run({ status: "failed" })).state, "failed");
  assert.equal((await run({ status: "processing" })).state, "pending");
  assert.equal((await run(undefined, { chargeStatus: 404 })).state, "unknown");
  assert.equal((await run(undefined, { chargeStatus: 500 })).state, "error");
  assert.equal((await checkPayment("not-a-reference", { env, offer, ...fakeKora() })).state, "unknown");
});

test("status page: gives a working download link only after a real payment", async () => {
  const ref = newReference();
  const ok = await paymentStatus(ref, { env, offer, ...fakeKora({ charge: paid() }) });
  assert.equal(ok.body.state, "paid");
  const token = new URL(ok.body.download_url, origin).searchParams.get("token");
  assert.equal(verifyDownloadToken(token, env).reference, ref);
  const pending = await paymentStatus(ref, { env, offer, ...fakeKora({ charge: { status: "processing" } }) });
  assert.deepEqual(pending.body, { ok: true, state: "pending" });
  assert.equal(pending.body.download_url, undefined);
  assert.equal((await paymentStatus(ref, { env, offer: null, ...fakeKora() })).status, 503);
});

// ---- webhook ----
const sign = (data, key = env.KORAPAY_SECRET_KEY) => createHmac("sha256", key).update(JSON.stringify(data)).digest("hex");
function webhook(data, { event = "charge.success", key } = {}) {
  return { payload: { event, data }, headers: { "x-korapay-signature": sign(data, key) } };
}

test("webhook: rejects a message that is not signed with our key", async () => {
  const data = { reference: newReference(), status: "success" };
  const sent = [];
  const base = { env, offer, origin, sendEmail: async (m) => sent.push(m), ...fakeKora({ charge: paid() }) };
  assert.equal((await handleWebhook({ event: "charge.success", data }, {}, base)).status, 401);
  const forged = webhook(data, { key: "somebody-elses-key" });
  assert.equal((await handleWebhook(forged.payload, forged.headers, base)).status, 401);
  assert.equal(sent.length, 0);
});

test("webhook: a genuine, confirmed payment emails the buyer a working download link", async () => {
  const ref = newReference(); const data = { reference: "kora-1", payment_reference: ref, status: "success" };
  const sent = [];
  const w = webhook(data);
  const r = await handleWebhook(w.payload, w.headers, { env, offer, origin, sendEmail: async (m) => sent.push(m), ...fakeKora({ charge: paid() }) });
  assert.deepEqual(r, { status: 200, body: { ok: true, emailed: true } });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to[0].email, "ada@example.com");
  const link = sent[0].html.match(/href="([^"]+)"/)[1].replaceAll("&amp;", "&");
  assert.ok(link.startsWith(`${origin}/api/ebook-download?token=`));
  assert.equal(verifyDownloadToken(new URL(link).searchParams.get("token"), env).reference, ref);
  assert.match(sent[0].html, /Thank you, Ada/);
});

test("webhook: the other header name Korapay documents is accepted too", () => {
  const data = { reference: "r" };
  assert.equal(webhookSignatureValid(data, { "kora-signature": sign(data) }, env), true);
  assert.equal(webhookSignatureValid(data, { "x-korapay-signature": sign({ reference: "other" }) }, env), false);
});

test("webhook: nothing is emailed unless Korapay confirms a full payment", async () => {
  const sent = [];
  const mk = (charge) => ({ env, offer, origin, sendEmail: async (m) => sent.push(m), ...fakeKora({ charge }) });
  const data = { payment_reference: newReference() };
  const w = webhook(data);
  assert.equal((await handleWebhook(w.payload, w.headers, mk(paid({ amount_paid: 10 })))).body.ignored, true);
  assert.equal((await handleWebhook(w.payload, w.headers, mk({ status: "failed" }))).body.ignored, true);
  const other = webhook(data, { event: "transfer.success" });
  assert.equal((await handleWebhook(other.payload, other.headers, mk(paid()))).body.ignored, true);
  assert.equal(sent.length, 0);
});

test("webhook: a failed email returns an error so Korapay tries again; a missing buyer email is not a crash", async () => {
  const data = { payment_reference: newReference() }; const w = webhook(data);
  const failing = await handleWebhook(w.payload, w.headers, { env, offer, origin, sendEmail: async () => { throw new Error("down"); }, ...fakeKora({ charge: paid() }) });
  assert.equal(failing.status, 500);
  const noEmail = await handleWebhook(w.payload, w.headers, { env, offer, origin, sendEmail: async () => assert.fail("should not send"), ...fakeKora({ charge: paid({ metadata: {} }) }) });
  assert.deepEqual(noEmail, { status: 200, body: { ok: true, emailed: false } });
});

// ---- download ----
test("download: streams the private file for a valid link and refuses everything else", async () => {
  const ref = newReference(); const token = signDownloadToken(ref, env);
  const stream = new ReadableStream();
  const getBlob = async (path) => { assert.equal(path, offer.file); return { statusCode: 200, stream, blob: { contentType: "application/pdf" } }; };
  const ok = await prepareDownload(token, { env, offer, getBlob });
  assert.equal(ok.status, 200); assert.equal(ok.stream, stream);
  assert.equal(ok.headers["Content-Type"], "application/pdf");
  assert.match(ok.headers["Content-Disposition"], /attachment; filename="Women-Who-Build.pdf"/);
  assert.equal((await prepareDownload("garbage", { env, offer, getBlob })).status, 403);
  assert.equal((await prepareDownload(signDownloadToken(ref, env, 0), { env, offer, getBlob })).status, 403, "expired");
  assert.equal((await prepareDownload(token, { env, offer: null, getBlob })).status, 503);
  assert.equal((await prepareDownload(token, { env, offer, getBlob: async () => ({ statusCode: 404 }) })).status, 404);
});

test("the answers tell a missing key apart from an e-book that is simply not on sale", async () => {
  const k = fakeKora();
  const ref = newReference();
  const body = { name: "A", email: "a@b.co" };
  assert.equal((await startCheckout(body, { env: {}, fetchImpl: k.fetchImpl, offer, origin })).body.error, "not_configured");
  assert.equal((await startCheckout(body, { env, fetchImpl: k.fetchImpl, offer: null, origin })).body.error, "not_for_sale");
  assert.equal((await paymentStatus(ref, { env: {}, offer, ...k })).body.error, "not_configured");
  assert.equal((await paymentStatus(ref, { env, offer: null, ...k })).body.error, "not_for_sale");
  assert.equal(k.calls.length, 0, "no call to Korapay either way");
});
