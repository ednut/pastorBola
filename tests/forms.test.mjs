import test from "node:test";
import assert from "node:assert/strict";
import { handleSubmission, validate, FORMS, rateLimited } from "../lib/forms.js";

const env = {
  BREVO_API_KEY: "test-key",
  FORMS_FROM_EMAIL: "office@example.org",
  FORMS_NOTIFY_EMAIL: "inbox@example.org, second@example.org",
  BREVO_WAITLIST_LIST_ID: "7",
  BREVO_NEWSLETTER_LIST_ID: "9",
};

// A pretend Brevo that records every call. `fail` lists paths that should return an error.
function fakeBrevo(fail = []) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const path = url.replace("https://api.brevo.com/v3", "");
    const body = JSON.parse(init.body);
    calls.push({ path, body, key: init.headers["api-key"] });
    const bad = fail.some((f) => (typeof f === "string" ? f === path : f(path, body)));
    return { ok: !bad, status: bad ? 500 : path === "/contacts" ? 201 : 201 };
  };
  return { calls, fetchImpl };
}

const waitlist = { "form-name": "waitlist", name: "Ada Okafor Smith", email: "ada@example.com", phone: "+234 803 000 0000", consent: "on", company: "" };

test("waitlist: saves the contact, notifies the office and confirms to the person", async () => {
  const { calls, fetchImpl } = fakeBrevo();
  const r = await handleSubmission(waitlist, { env, fetchImpl });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true });
  const contact = calls.find((c) => c.path === "/contacts");
  assert.deepEqual(contact.body, {
    email: "ada@example.com",
    attributes: { FIRSTNAME: "Ada", LASTNAME: "Okafor Smith", SMS: "+2348030000000" },
    listIds: [7],
    updateEnabled: true,
  });
  const mails = calls.filter((c) => c.path === "/smtp/email");
  assert.equal(mails.length, 2);
  const notify = mails.find((m) => m.body.to[0].email === "inbox@example.org");
  assert.equal(notify.body.to.length, 2);
  assert.equal(notify.body.replyTo.email, "ada@example.com");
  assert.match(notify.body.subject, /Book waiting list: Ada Okafor Smith/);
  const confirm = mails.find((m) => m.body.to[0].email === "ada@example.com");
  assert.match(confirm.body.htmlContent, /Thank you, Ada/);
  assert.equal(confirm.body.sender.email, "office@example.org");
  assert.ok(calls.every((c) => c.key === "test-key"));
});

test("waitlist: checks name, email, phone with country code, and consent", async () => {
  const { fetchImpl, calls } = fakeBrevo();
  const r = await handleSubmission({ "form-name": "waitlist", name: "", email: "nope", phone: "08030000000" }, { env, fetchImpl });
  assert.equal(r.status, 422);
  assert.deepEqual(Object.keys(r.body.fields).sort(), ["consent", "email", "name", "phone"]);
  assert.match(r.body.fields.phone, /country code/);
  assert.equal(calls.length, 0, "nothing is sent when the form is invalid");
});

test("honeypot: a filled hidden field is treated as a bot and nothing is sent", async () => {
  const { calls, fetchImpl } = fakeBrevo();
  const r = await handleSubmission({ ...waitlist, company: "Acme" }, { env, fetchImpl });
  assert.equal(r.status, 200);
  assert.equal(calls.length, 0);
});

test("not configured: says so honestly instead of pretending to send", async () => {
  const { calls, fetchImpl } = fakeBrevo();
  for (const form of [waitlist, { "form-name": "newsletter", email: "a@b.co" }, { "form-name": "contact", name: "A", email: "a@b.co", message: "Hi" }]) {
    const r = await handleSubmission(form, { env: {}, fetchImpl });
    assert.equal(r.status, 503);
    assert.equal(r.body.error, "not_configured");
  }
  assert.equal(calls.length, 0);
});

test("waitlist: still succeeds from the office inbox alone when no contact list is set up", async () => {
  const { calls, fetchImpl } = fakeBrevo();
  const e = { ...env, BREVO_WAITLIST_LIST_ID: "" };
  const r = await handleSubmission(waitlist, { env: e, fetchImpl });
  assert.equal(r.status, 200);
  assert.equal(calls.filter((c) => c.path === "/contacts").length, 0);
  assert.equal(calls.filter((c) => c.path === "/smtp/email").length, 2);
});

test("waitlist: a failed confirmation email does not lose the signup", async () => {
  const { fetchImpl } = fakeBrevo([(p, b) => p === "/smtp/email" && b.to[0].email === "ada@example.com"]);
  const r = await handleSubmission(waitlist, { env, fetchImpl });
  assert.equal(r.status, 200);
});

test("waitlist: reports a failure when nothing could be saved or sent", async () => {
  const { fetchImpl } = fakeBrevo(["/contacts", "/smtp/email"]);
  const r = await handleSubmission(waitlist, { env, fetchImpl });
  assert.equal(r.status, 502);
});

test("newsletter: saves to its own list and sends a confirmation", async () => {
  const { calls, fetchImpl } = fakeBrevo();
  const r = await handleSubmission({ "form-name": "newsletter", email: "reader@example.com" }, { env, fetchImpl });
  assert.equal(r.status, 200);
  const contact = calls.find((c) => c.path === "/contacts");
  assert.deepEqual(contact.body.listIds, [9]);
  assert.deepEqual(contact.body.attributes, {});
  assert.ok(calls.some((c) => c.path === "/smtp/email" && c.body.to[0].email === "reader@example.com"));
});

test("contact: goes to the office with reply-to set to the sender, no contact list", async () => {
  const { calls, fetchImpl } = fakeBrevo();
  const r = await handleSubmission({ "form-name": "contact", name: "Bola", email: "b@example.com", topic: "Media & press", message: "Hello <b>team</b>" }, { env, fetchImpl });
  assert.equal(r.status, 200);
  assert.equal(calls.some((c) => c.path === "/contacts"), false);
  const notify = calls.find((c) => c.path === "/smtp/email" && c.body.to[0].email === "inbox@example.org");
  assert.match(notify.body.htmlContent, /Hello &lt;b&gt;team&lt;\/b&gt;/, "user text is escaped in the email");
  assert.equal(notify.body.replyTo.email, "b@example.com");
});

test("speaking invitation: requires the event details and includes them in the email", async () => {
  const { calls, fetchImpl } = fakeBrevo();
  const bad = await handleSubmission({ "form-name": "speaking-invitation", name: "A", email: "a@b.co", message: "x" }, { env, fetchImpl });
  assert.equal(bad.status, 422);
  const ok = await handleSubmission({
    "form-name": "speaking-invitation", name: "Ada", email: "a@b.co", organisation: "Grace Church", phone: "07700 900123",
    event: "Women's Summit", date: "2027-03-14", location: "Manchester, UK", audience: "250 women", format: "Conference keynote", topic: "Women who build", message: "Please join us.",
  }, { env, fetchImpl });
  assert.equal(ok.status, 200);
  const notify = calls.find((c) => c.path === "/smtp/email" && c.body.to[0].email === "inbox@example.org");
  assert.match(notify.body.htmlContent, /Women&#39;s Summit/);
  assert.match(notify.body.htmlContent, /Manchester, UK/);
});

test("unknown form names are rejected", async () => {
  const r = await handleSubmission({ "form-name": "admin" }, { env, fetchImpl: fakeBrevo().fetchImpl });
  assert.equal(r.status, 400);
});

test("validate trims and limits input", () => {
  const { values } = validate(FORMS.contact, { name: "  Ada   Lovelace ", email: "a@b.co", message: "x".repeat(5000) });
  assert.equal(values.name, "Ada Lovelace");
  assert.equal(values.message.length, 3000);
});

test("rate limit: the 7th submission in ten minutes from one visitor is refused", () => {
  const t = Date.now();
  const results = Array.from({ length: 7 }, (_, i) => rateLimited("1.2.3.4", t + i));
  assert.deepEqual(results, [false, false, false, false, false, false, true]);
  assert.equal(rateLimited("5.6.7.8", t), false);
});

// ---- the web endpoint itself (api/forms.js) ----
import handler from "../api/forms.js";
function fakeRes() {
  const r = { code: 0, headers: {}, json(o) { r.payload = o; return r; }, status(c) { r.code = c; return r; }, setHeader(k, v) { r.headers[k] = v; } };
  return r;
}
const req = (over = {}) => ({ method: "POST", headers: { host: "www.example.org", origin: "https://www.example.org", "x-forwarded-for": "9.9." + Math.floor(Math.random() * 1e6) }, body: {}, ...over });

test("endpoint: only accepts POST", async () => {
  const res = fakeRes(); await handler(req({ method: "GET" }), res);
  assert.equal(res.code, 405); assert.equal(res.headers.Allow, "POST");
});

test("endpoint: refuses forms sent from another website", async () => {
  const res = fakeRes(); await handler(req({ headers: { host: "www.example.org", origin: "https://evil.example.com", "x-forwarded-for": "8.8.8.8" } }), res);
  assert.equal(res.code, 403);
});

test("endpoint: accepts form data sent as a JSON string and answers 422 for a bad form", async () => {
  const res = fakeRes(); await handler(req({ body: JSON.stringify({ "form-name": "newsletter", email: "bad" }) }), res);
  assert.equal(res.code, 422); assert.ok(res.payload.fields.email);
});

// ---- ZeptoMail sends the email; Brevo only keeps the waiting list / newsletter contacts ----
const ZEPTO_URL = "https://api.zeptomail.example/v1.1/email";
const zeptoEnv = {
  ZEPTOMAIL_API_KEY: "abc123",
  ZEPTOMAIL_API_URL: ZEPTO_URL,
  FORMS_FROM_EMAIL: "info@example.org",
  FORMS_FROM_NAME: "Pastor Bola Akinlabi",
  FORMS_NOTIFY_EMAIL: "inbox@example.org",
};
function fakeAll(failUrls = []) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return { ok: !failUrls.includes(url), status: failUrls.includes(url) ? 500 : 201 };
  };
  return { calls, fetchImpl };
}

test("zeptomail: a contact message is sent with the key, sender and reply-to in ZeptoMail's format", async () => {
  const { calls, fetchImpl } = fakeAll();
  const r = await handleSubmission({ "form-name": "contact", name: "Bola", email: "b@example.com", message: "Hello" }, { env: zeptoEnv, fetchImpl });
  assert.equal(r.status, 200);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.url === ZEPTO_URL), "nothing goes to Brevo");
  const notify = calls.find((c) => c.body.to[0].email_address.address === "inbox@example.org");
  assert.equal(notify.headers.authorization, "Zoho-enczapikey abc123");
  assert.deepEqual(notify.body.from, { address: "info@example.org", name: "Pastor Bola Akinlabi" });
  assert.deepEqual(notify.body.reply_to, [{ address: "b@example.com", name: "Bola" }]);
  assert.match(notify.body.subject, /Contact message: Bola/);
  assert.match(notify.body.htmlbody, /Hello/);
  const confirm = calls.find((c) => c.body.to[0].email_address.address === "b@example.com");
  assert.match(confirm.body.htmlbody, /Thank you, Bola/);
});

test("zeptomail: a key pasted with its Zoho-enczapikey prefix is not doubled", async () => {
  const { calls, fetchImpl } = fakeAll();
  await handleSubmission({ "form-name": "contact", name: "A", email: "a@b.co", message: "Hi" }, { env: { ...zeptoEnv, ZEPTOMAIL_API_KEY: "Zoho-enczapikey abc123" }, fetchImpl });
  assert.equal(calls[0].headers.authorization, "Zoho-enczapikey abc123");
});

test("zeptomail + brevo: email goes through ZeptoMail and the waiting list contact is saved in Brevo", async () => {
  const { calls, fetchImpl } = fakeAll();
  const e = { ...zeptoEnv, BREVO_API_KEY: "bk", BREVO_WAITLIST_LIST_ID: "7" };
  const r = await handleSubmission(waitlist, { env: e, fetchImpl });
  assert.equal(r.status, 200);
  const brevoCalls = calls.filter((c) => c.url.includes("api.brevo.com"));
  assert.deepEqual(brevoCalls.map((c) => c.url), ["https://api.brevo.com/v3/contacts"], "Brevo only saves the contact");
  assert.equal(calls.filter((c) => c.url === ZEPTO_URL).length, 2);
});

test("zeptomail: reports a failure when the email service rejects the message and nothing else saved it", async () => {
  const { fetchImpl } = fakeAll([ZEPTO_URL]);
  const r = await handleSubmission({ "form-name": "contact", name: "A", email: "a@b.co", message: "Hi" }, { env: zeptoEnv, fetchImpl });
  assert.equal(r.status, 502);
});

test("zeptomail: a key without its web address is treated as not set up", async () => {
  const { calls, fetchImpl } = fakeAll();
  const r = await handleSubmission({ "form-name": "contact", name: "A", email: "a@b.co", message: "Hi" }, { env: { ...zeptoEnv, ZEPTOMAIL_API_URL: "" }, fetchImpl });
  assert.equal(r.status, 503);
  assert.equal(calls.length, 0);
});
