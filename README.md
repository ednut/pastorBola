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

The newsletter, speaking and contact forms use Netlify Forms attributes (`data-netlify`) and are submitted by `main.js` with a POST to `/`. They only work on Netlify. On any other host, replace the submit handler with that host's form service, or use a form plugin when moving to WordPress.

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
