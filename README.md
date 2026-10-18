# Pastor Bola Akinlabi — website

A rebuilt and expanded version of the ChatGPT concept (`~/Downloads/Pastor-Bola-Website`). It keeps the same identity: deep plum, oxblood and muted gold, with Bodoni Moda and DM Sans.

It is a static site built with [Eleventy](https://www.11ty.dev/). It is fast to share now, and its structure maps directly onto a WordPress theme later (see `docs/WORDPRESS-PLAN.md`).

## Run it

```bash
npm install
npm run dev      # http://localhost:8080 with live reload
npm run build    # outputs the finished site to _site/
```

## Share a preview (recommended: Netlify)

1. Push this folder to a GitHub repo, then on netlify.com choose **Add new site → Import from Git**. `netlify.toml` already sets the build command and output folder.
2. Alternatively, run `npm run build` and drag the `_site` folder onto app.netlify.com/drop.
3. Once the site is on Netlify, the three forms (newsletter, speaking invitation, contact) work with no extra code. Submissions appear under **Forms** in Netlify, and you can turn on email notifications to forward them to Pastor Bola's office.

The preview is hidden from search engines: `robots.txt` disallows crawling and every page has a `noindex` tag. At launch, set `"isPreview": false` in `src/_data/site.json` and remove the `Disallow` line in `src/robots.txt`.

## Where to edit things

| What | File |
| --- | --- |
| Site name, social links, preview banner | `src/_data/site.json` |
| Menus | `src/_data/nav.json` |
| Messages (videos and podcasts) | `src/_data/messages.json` |
| Made for More editions | `src/_data/editions.json` |
| Books | `src/_data/books.json` |
| Speaking topics | `src/_data/topics.json` |
| Press articles | `src/_data/press.json` |
| Colours, type, spacing | top of `src/assets/css/style.css` (tokens) |
| Page copy | `src/*.njk` |

## Pages

Home · Her story · Ministry · Made for More · Books · Watch & listen · Speaking · Press kit · Contact · Privacy · 404

## What changed from the ChatGPT version

- **Readable type.** Body text is now 17px (was 12–13px) and labels are 12px (were 7–9px). This also meets accessibility contrast.
- **New pages:** Made for More (purpose, what to expect, a timeline of editions from 2015 to 2026, gallery) and Press kit (short and full bios with copy buttons, fact sheet, photo downloads, name guidance).
- **Working forms** on Netlify: newsletter, speaking invitation and contact, each with spam protection. The old version only prepared a text draft.
- **Videos play in place** in a lightbox, using YouTube's privacy-enhanced mode.
- **More content:** six messages with filters, an "In the press" strip with four real articles, a "Where she has ministered" list, FAQs on Books and Speaking, a journey timeline and values on Her story, and Better Half and the conferences she co-hosts on Ministry.
- **Polish:** hero entrance animation, rotating "Made for More · Women who build" seal, scrolling identity marquee, scroll reveals (switched off for users who prefer reduced motion), and a header that compacts on scroll.
- **Performance:** fonts converted to WOFF2 and preloaded, images converted to WebP with JPG fallbacks, total images about 700 KB.
- **Clean architecture:** shared header, footer and components, with content in data files ready to become WordPress custom post types.

## Before launch — confirm with Pastor Bola's office

- [ ] Every biography detail, especially the bank, Oxford diploma and John Maxwell certification
- [ ] Book titles, covers, dates and buy links (`books.json`)
- [ ] Permission to use each photo, plus high-resolution originals for the press kit
- [ ] An office email for form notifications
- [ ] Whether the 2026 "Women Who Build" details and the other Made for More editions are correct
- [ ] The mailing-list service (Mailchimp, Brevo, or similar)
- [ ] The domain

Sources used for facts: ThisDay (2018), TheCable (2020), BusinessDay (2021, 2025), Outreach Magazine (2022), the TEC welcome script supplied for Made for More 2026, and the original concept's research notes.
