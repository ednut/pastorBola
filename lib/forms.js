/* Form handling for the website.
   Used by api/forms.js, a Vercel serverless function. All four forms post here:
   newsletter, waitlist (book waiting list), contact and speaking-invitation.

   Email is sent through ZeptoMail (https://www.zoho.com/zeptomail/), or through Brevo if ZeptoMail is not set up:
   - a notification goes to the office inbox
   - a confirmation goes to the person who filled in the form
   The newsletter and waiting list contacts are saved to a Brevo contact list (Brevo is used for the list only
   when ZeptoMail sends the email).

   Nothing is sent until the settings in .env.example are added in Vercel. */

const BREVO = "https://api.brevo.com/v3";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_INTL_RE = /^\+[0-9][0-9 ()-]{6,18}$/; // +234 803 000 0000
const PHONE_LOOSE_RE = /^[0-9+ ()-]{6,25}$/;

const text = (max = 200) => ({ type: "text", max });
const long = () => ({ type: "long", max: 3000 });

export const FORMS = {
  newsletter: {
    label: "Newsletter",
    list: "BREVO_NEWSLETTER_LIST_ID",
    fields: { email: { type: "email", required: true } },
    confirm: {
      subject: "You’re on the list",
      body: (v) => ["Thank you for joining the list.", "You’ll hear from Pastor Bola’s team with encouragement, news from Made for More and news about her book."],
    },
  },
  waitlist: {
    label: "Book waiting list",
    list: "BREVO_WAITLIST_LIST_ID",
    fields: {
      name: { ...text(120), required: true },
      email: { type: "email", required: true },
      phone: { type: "phone-intl", required: true },
      consent: { type: "consent", required: true },
    },
    confirm: {
      subject: "You’re on the waiting list for Women Who Build",
      body: (v) => [
        `Thank you, ${firstName(v.name)}. You’re on the waiting list for Women Who Build by Pastor Bola Akinlabi.`,
        "We’ll be in touch as soon as the book is available.",
      ],
    },
  },
  contact: {
    label: "Contact message",
    fields: {
      name: { ...text(120), required: true },
      email: { type: "email", required: true },
      topic: text(80),
      message: { ...long(), required: true },
    },
    confirm: {
      subject: "We’ve received your message",
      body: (v) => [`Thank you, ${firstName(v.name)}. Your message has reached Pastor Bola’s office.`, "Her team reads every message and will reply where they can."],
    },
  },
  "speaking-invitation": {
    label: "Speaking invitation",
    fields: {
      name: { ...text(120), required: true },
      email: { type: "email", required: true },
      organisation: { ...text(160), required: true },
      phone: { type: "phone" },
      event: { ...text(160), required: true },
      date: { ...text(20), required: true },
      location: { ...text(160), required: true },
      audience: text(120),
      format: text(120),
      topic: text(160),
      message: { ...long(), required: true },
    },
    confirm: {
      subject: "We’ve received your invitation",
      body: (v) => [
        `Thank you, ${firstName(v.name)}. Your invitation for ${v.event} has been received.`,
        "Pastor Bola’s office considers each request prayerfully alongside her ministry calendar. If she is available, the team will be in touch about topic, format and logistics.",
      ],
    },
  },
};

const LABELS = {
  name: "Name", email: "Email", phone: "Phone", consent: "Agreed to be contacted", topic: "Topic", message: "Message",
  organisation: "Organisation or church", event: "Event", date: "Proposed date", location: "City and country",
  audience: "Expected audience", format: "Format",
};

const firstName = (name = "") => String(name).trim().split(/\s+/)[0] || "there";
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const oneLine = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const multiLine = (v, max) => String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);

/* Check the fields for one form. Returns cleaned values and any errors by field. */
export function validate(def, body) {
  const values = {};
  const errors = {};
  for (const [key, rule] of Object.entries(def.fields)) {
    const raw = body?.[key];
    let value = rule.type === "long" ? multiLine(raw, rule.max) : oneLine(raw, rule.max ?? 320);
    if (rule.type === "consent") value = ["on", "true", "yes", "1", true].includes(raw) ? "Yes" : "";
    if (!value) {
      if (rule.required) errors[key] = rule.type === "consent" ? "Please tick the box so we can contact you." : "Please fill in this field.";
      continue;
    }
    if (rule.type === "email" && !EMAIL_RE.test(value)) errors[key] = "Please enter a valid email address.";
    if (rule.type === "phone-intl" && !PHONE_INTL_RE.test(value)) errors[key] = "Please include your country code, for example +234 or +44.";
    if (rule.type === "phone" && !PHONE_LOOSE_RE.test(value)) errors[key] = "Please enter a valid phone number.";
    values[key] = value;
  }
  return { values, errors };
}

export function readConfig(env = process.env) {
  const list = (v) => String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    apiKey: env.BREVO_API_KEY || "",
    zepto: { key: env.ZEPTOMAIL_API_KEY || "", url: env.ZEPTOMAIL_API_URL || "" },
    fromEmail: env.FORMS_FROM_EMAIL || "",
    fromName: env.FORMS_FROM_NAME || "Pastor Bola Akinlabi",
    notify: list(env.FORMS_NOTIFY_EMAIL),
    replyTo: env.FORMS_REPLY_TO || "",
    listIds: { BREVO_NEWSLETTER_LIST_ID: Number(env.BREVO_NEWSLETTER_LIST_ID) || 0, BREVO_WAITLIST_LIST_ID: Number(env.BREVO_WAITLIST_LIST_ID) || 0 },
  };
}

async function brevo(fetchImpl, apiKey, path, payload) {
  const res = await fetchImpl(`${BREVO}${path}`, {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Brevo ${path} responded ${res.status}${await detail(res)}`);
}

/* A short, email-free summary of an error response, so the Vercel logs say what went wrong. */
async function detail(res) {
  try {
    const t = typeof res.text === "function" ? await res.text() : "";
    return t ? `: ${t.replace(/[^\s"',:{}]+@[^\s"',:{}]+/g, "[email]").replace(/\s+/g, " ").slice(0, 300)}` : "";
  } catch { return ""; }
}

/* ZeptoMail "Send Mail" API. The key may be pasted with or without its "Zoho-enczapikey" prefix. */
async function zeptomail(fetchImpl, cfg, { to, replyTo, subject, html }) {
  const key = cfg.zepto.key.trim();
  const res = await fetchImpl(cfg.zepto.url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: /^zoho-enczapikey/i.test(key) ? key : `Zoho-enczapikey ${key}`,
    },
    body: JSON.stringify({
      from: { address: cfg.fromEmail, name: cfg.fromName },
      to: to.map((t) => ({ email_address: { address: t.email, ...(t.name ? { name: t.name } : {}) } })),
      ...(replyTo ? { reply_to: [{ address: replyTo.email, ...(replyTo.name ? { name: replyTo.name } : {}) }] } : {}),
      subject,
      htmlbody: html,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`ZeptoMail responded ${res.status}${await detail(res)}`);
}

/* Send one email with whichever service is set up. */
function sendEmail(fetchImpl, cfg, message) {
  if (cfg.zepto.key && cfg.zepto.url) return zeptomail(fetchImpl, cfg, message);
  return brevo(fetchImpl, cfg.apiKey, "/smtp/email", {
    sender: { email: cfg.fromEmail, name: cfg.fromName },
    to: message.to,
    ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    subject: message.subject,
    htmlContent: message.html,
  });
}

const paragraphs = (lines) => lines.map((l) => `<p style="margin:0 0 14px">${escapeHtml(l)}</p>`).join("");
const wrap = (inner) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#261a20;max-width:560px">${inner}</div>`;

function notificationEmail(def, type, values) {
  const rows = Object.keys(def.fields)
    .filter((k) => values[k])
    .map((k) => `<tr><td style="padding:6px 16px 6px 0;color:#6b5560;vertical-align:top;white-space:nowrap">${escapeHtml(LABELS[k] || k)}</td><td style="padding:6px 0;white-space:pre-wrap">${escapeHtml(values[k])}</td></tr>`)
    .join("");
  const who = values.name || values.email;
  return {
    subject: `[Website] ${def.label}: ${who}`,
    html: wrap(`<p style="margin:0 0 14px"><strong>${escapeHtml(def.label)}</strong> from the website.</p><table style="border-collapse:collapse">${rows}</table>`),
  };
}

function confirmationEmail(def, values) {
  const lines = def.confirm.body(values);
  return {
    subject: def.confirm.subject,
    html: wrap(`${paragraphs(lines)}<p style="margin:24px 0 0">With thanks,<br>Pastor Bola’s team</p>`),
  };
}

/* A ready-to-use email sender for other parts of the site (such as e-book receipts).
   Returns null when email is not set up. */
export function mailer({ env = process.env, fetchImpl = fetch } = {}) {
  const cfg = readConfig(env);
  const hasService = Boolean((cfg.zepto.key && cfg.zepto.url) || cfg.apiKey);
  if (!hasService || !cfg.fromEmail) return null;
  return (message) => sendEmail(fetchImpl, cfg, message);
}

/* Main entry point. `body` is the parsed form data. Returns { status, body }. */
export async function handleSubmission(body, { env = process.env, fetchImpl = fetch } = {}) {
  const type = oneLine(body?.["form-name"] ?? body?.form, 40);
  const def = FORMS[type];
  if (!def) return { status: 400, body: { ok: false, error: "unknown_form" } };

  // Hidden "company" field: people never see it, so anything in it is a bot. Pretend it worked.
  if (oneLine(body?.company, 200)) return { status: 200, body: { ok: true } };

  const { values, errors } = validate(def, body);
  if (Object.keys(errors).length) return { status: 422, body: { ok: false, error: "invalid", fields: errors } };

  const cfg = readConfig(env);
  const listId = def.list ? cfg.listIds[def.list] : 0;
  const hasEmailService = Boolean((cfg.zepto.key && cfg.zepto.url) || cfg.apiKey);
  const canEmail = Boolean(hasEmailService && cfg.fromEmail);
  const canNotify = canEmail && cfg.notify.length > 0;
  const canList = Boolean(cfg.apiKey && listId);

  // A form needs somewhere to go. Contact and speaking go to the office inbox.
  // Newsletter and waitlist go to a saved contact list, or at least the office inbox.
  const hasDestination = def.list ? canList || canNotify : canNotify;
  if (!hasDestination) return { status: 503, body: { ok: false, error: "not_configured" } };

  const tasks = [];
  const names = [];
  if (canList) {
    const [first, ...rest] = (values.name || "").split(" ");
    const attributes = {};
    if (values.name) { attributes.FIRSTNAME = first; if (rest.length) attributes.LASTNAME = rest.join(" "); }
    if (values.phone && PHONE_INTL_RE.test(values.phone)) attributes.SMS = "+" + values.phone.replace(/\D/g, "");
    tasks.push(brevo(fetchImpl, cfg.apiKey, "/contacts", { email: values.email, attributes, listIds: [listId], updateEnabled: true }));
    names.push("save");
  }
  if (canNotify) {
    const n = notificationEmail(def, type, values);
    tasks.push(sendEmail(fetchImpl, cfg, {
      to: cfg.notify.map((email) => ({ email })),
      replyTo: { email: values.email, ...(values.name ? { name: values.name } : {}) },
      subject: n.subject,
      html: n.html,
    }));
    names.push("notify");
  }
  if (canEmail && values.email) {
    const c = confirmationEmail(def, values);
    tasks.push(sendEmail(fetchImpl, cfg, {
      to: [{ email: values.email, ...(values.name ? { name: values.name } : {}) }],
      ...(cfg.replyTo ? { replyTo: { email: cfg.replyTo } } : {}),
      subject: c.subject,
      html: c.html,
    }));
    names.push("confirm");
  }

  const results = await Promise.allSettled(tasks);
  const outcome = Object.fromEntries(names.map((n, i) => [n, results[i].status === "fulfilled"]));
  for (const [i, r] of results.entries()) if (r.status === "rejected") console.error(`[forms] ${type} ${names[i]} failed: ${r.reason?.message}`);

  // Success means the submission reached somewhere safe. A failed confirmation email alone does not lose anything.
  const saved = def.list ? outcome.save || outcome.notify : outcome.notify;
  if (!saved) return { status: 502, body: { ok: false, error: "delivery_failed" } };
  return { status: 200, body: { ok: true } };
}

/* Very small in-memory limit: 6 submissions per 10 minutes per visitor. Best effort only. */
const hits = new Map();
export function rateLimited(ip, now = Date.now(), limit = 6) {
  const recent = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > limit;
}
