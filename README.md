# Pastor Bola Akinlabi website

Static website for Pastor Bola Akinlabi, built with [Eleventy](https://www.11ty.dev/) (Nunjucks templates, JSON data files, plain CSS and JavaScript). The structure is designed to map onto a WordPress theme later. See `docs/WORDPRESS-PLAN.md`.

## Requirements

Node.js 18 or newer.

## Commands

```bash
npm install
npm run dev      # local server at http://localhost:8080 with live reload
npm run build    # writes the finished site to _site/
npm run clean    # removes _site/
```

## Project structure

```
src/
  *.njk                  Page templates (index, about, ministry, made-for-more, books, media, speaking, press-kit, contact, privacy, 404)
  _includes/layouts/     base.njk, the page shell (head, header, footer, video dialog)
  _includes/partials/    header, footer, newsletter, macros (image, media card, book cover, page hero)
  _data/                 Content as JSON (see below)
  assets/css/style.css   All styles. Design tokens are at the top.
  assets/js/main.js      Navigation, scroll reveals, video dialog, forms, filters
  assets/fonts/          Self-hosted WOFF2 fonts (Bodoni Moda, DM Sans)
  assets/images/         WebP images with JPG fallbacks
docs/                    WordPress plan, theme.json draft, source images
eleventy.config.js       Eleventy configuration and filters
```

## Where to edit things

| What | File |
| --- | --- |
| Site name, social links, preview flag | `src/_data/site.json` |
| Menus | `src/_data/nav.json` |
| Messages (videos and podcasts) | `src/_data/messages.json` |
| Made for More editions | `src/_data/editions.json` |
| Book | `src/_data/books.json` |
| Speaking topics | `src/_data/topics.json` |
| Press articles | `src/_data/press.json` |
| Colours, type, spacing | Tokens at the top of `src/assets/css/style.css` |
| Page copy | `src/*.njk` |

### Book links

The book page and the homepage teaser read `src/_data/books.json`.

- `amazonUrl`: when set, the page shows an "Order on Amazon" button and switches from "Coming soon" to "Available now".
- `downloadUrl`: when set, the page also shows a direct download button.

## Forms

Four forms post to one serverless function, `api/forms.js` (logic in `lib/forms.js`): the newsletter, the book waiting list, the speaking invitation and the contact form.

- **Email** is sent through [ZeptoMail](https://www.zoho.com/zeptomail/). If ZeptoMail is not set up, the function falls back to Brevo for email.
- **Contact lists** (the waiting list and the newsletter) are saved in [Brevo](https://www.brevo.com), whose free plan is enough. Brevo only holds the contacts when ZeptoMail sends the email.

| Form | Notifies the office | Confirmation to the person | Saved to a Brevo list |
| --- | --- | --- | --- |
| Newsletter (the section is not shown on pages at the moment; the form is `partials/newsletter.njk`) | Yes | Yes | `BREVO_NEWSLETTER_LIST_ID` |
| Book waiting list (name, email, phone) | Yes | Yes | `BREVO_WAITLIST_LIST_ID` |
| Speaking invitation | Yes | Yes | No |
| Contact | Yes | Yes | No |

Nothing is sent until these settings are added in Vercel (Project, Settings, Environment Variables). The names are listed in `.env.example`:

- `ZEPTOMAIL_API_URL` and `ZEPTOMAIL_API_KEY`: from the ZeptoMail agent's Send Mail API tab. The key works with or without its `Zoho-enczapikey` prefix.
- `FORMS_FROM_EMAIL` and `FORMS_FROM_NAME`: the sender. The domain must be verified in ZeptoMail.
- `FORMS_NOTIFY_EMAIL`: the inbox that receives submissions. Separate several with commas.
- `FORMS_REPLY_TO` (optional)
- `BREVO_API_KEY`, `BREVO_WAITLIST_LIST_ID`, `BREVO_NEWSLETTER_LIST_ID`: for the saved contact lists.

Setup in ZeptoMail: create an agent, add the website domain, then add the DKIM and CNAME records ZeptoMail shows to the domain's DNS. Do not add a second SPF record. Until the settings exist, the forms show a "not switched on yet" message instead of pretending to send.

Spam protection: a hidden field that only bots fill in, a check that the form was sent from the site itself, and a small per-visitor limit.

```bash
npm test         # checks every form against pretend email and list services
```

The function runs on Vercel only. `npm run dev` serves the pages, but submitting a form locally needs `vercel dev` or the preview deployment.

## E-book payments (Korapay)

The e-book is sold through [Korapay](https://developers.korapay.com)'s hosted checkout. Card details never touch this site. There is no database.

1. The buyer fills in a name and email on the book page. `/api/checkout` asks Korapay for a checkout link and sends them there.
2. The buyer pays on Korapay's page and returns to `/books/thank-you/`.
3. That page asks `/api/payment-status`, which checks the payment with Korapay and returns a signed download link that expires after 48 hours.
4. Korapay also calls `/api/payment-webhook`. The call is checked with the secret key, the payment is confirmed again with Korapay, and the buyer is emailed the same kind of link through ZeptoMail.
5. `/api/ebook-download` checks the link and streams the file from a private Vercel Blob store. The file has no public address.

The code is in `lib/payments.js` and the four functions in `api/`. The price is read from `src/_data/books.json`, so the page and the charge cannot disagree.

### Turning it on

Until both of these are set, the e-book is off: the book page keeps its waiting list and the payment functions answer "not configured".

1. In `src/_data/books.json`, under `ebook`, set `public` to `true` only when the e-book should show on the public pages (the payment functions work as soon as a file and price exist, so a hidden test page at `/books/buy-test/` can be used first), and set `prices` (a map of currency code to whole-number price, for example `"NGN": 8000, "GBP": 5, "USD": 8, "EUR": 6, "CAD": 11`) and `file` (the path of the file in the Blob store, for example `ebooks/women-who-build.pdf`). `filename` is the name the buyer's download gets.
2. In Vercel, create a **private** Blob store (Project, Storage, Create, Blob, Private) and connect it to the project. Upload the e-book to that path. The store can be created and uploaded to with the `vercel blob` command or the dashboard.
3. Add the settings below in Vercel (Project, Settings, Environment Variables). Use the test key first, then swap in the live key when testing is done.

| Setting | What it is |
| --- | --- |
| `KORAPAY_SECRET_KEY` | Korapay secret key (test while testing, live at launch) |
| `SITE_URL` | Optional. The site's address, for example `https://www.bolaakinlabi.org`. Used in the return and webhook addresses and in emails. Defaults to the address the visitor used |
| `EBOOK_LINK_SECRET` | Optional. A long random value used to sign download links. Defaults to a value derived from the Korapay key |

### Testing

`npm test` checks the whole flow against a pretend Korapay. To try it for real, use Korapay's test mode and its test cards (see "Testing your Integration" in the Korapay docs) on a preview deployment. Note that Vercel's login protection on preview deployments blocks Korapay's webhook, so on a preview the email will not be sent. The thank-you page and download still work. Test the email on a production deployment, or turn off protection for a short time.

Things to confirm in test mode, because Korapay's documentation does not spell them out: whether the account can take card payments in each foreign currency (Korapay's overview lists cards for naira only; remove any currency that is rejected from `prices`), the exact address and response of the charge-check call (`GET /charges/{reference}`), whether the buyer's email comes back in the charge `metadata`, and whether amounts are in whole naira.

## Preview mode

While `isPreview` is `true` in `src/_data/site.json`, every page has a `noindex` tag, the footer shows "Preview build", and `src/robots.txt` disallows crawling. To launch, set `isPreview` to `false` and remove the `Disallow` line from `src/robots.txt`.

## Deployment

`npm run build` produces a static site in `_site/`, so any static host works. `netlify.toml` sets the build command, output folder and asset caching headers for Netlify. On Vercel, use the build command `npm run build` and the output directory `_site`.

## Before launch

- [ ] Set the production URL in `src/_data/site.json`
- [ ] Add the Amazon link or download link in `src/_data/books.json`
- [ ] Add an office email and connect form notifications
- [ ] Turn off preview mode (see above)
- [ ] Add a mailing-list service for the newsletter
