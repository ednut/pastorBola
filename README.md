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

Four forms post to one serverless function, `api/forms.js` (logic in `lib/forms.js`): the newsletter, the book waiting list, the speaking invitation and the contact form. The function sends email and saves contacts through [Brevo](https://www.brevo.com).

| Form | Notifies the office | Confirmation to the person | Saved to a Brevo list |
| --- | --- | --- | --- |
| Newsletter | Yes | Yes | `BREVO_NEWSLETTER_LIST_ID` |
| Book waiting list (name, email, phone) | Yes | Yes | `BREVO_WAITLIST_LIST_ID` |
| Speaking invitation | Yes | Yes | No |
| Contact | Yes | Yes | No |

Nothing is sent until these settings are added in Vercel (Project, Settings, Environment Variables). The names are listed in `.env.example`:

- `BREVO_API_KEY`
- `FORMS_FROM_EMAIL`: a sender verified in Brevo, on the website domain
- `FORMS_FROM_NAME` (optional)
- `FORMS_NOTIFY_EMAIL`: the office inbox that receives submissions. Separate several with commas.
- `FORMS_REPLY_TO` (optional)
- `BREVO_WAITLIST_LIST_ID` and `BREVO_NEWSLETTER_LIST_ID`

Setup in Brevo: create the account, create two contact lists (waiting list and newsletter), add the website domain under Senders & Domains and add the DNS records Brevo shows, then create an API key. Until the settings exist, the forms show a "not switched on yet" message instead of pretending to send.

Spam protection: a hidden field that only bots fill in, a check that the form was sent from the site itself, and a small per-visitor limit.

```bash
npm test         # checks every form against a pretend Brevo
```

The function runs on Vercel only. `npm run dev` serves the pages, but submitting a form locally needs `vercel dev` or the preview deployment.

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
