# Turning this into a WordPress theme

The static build was written so each piece has an obvious home in a classic PHP theme, which is a good fit for an ACF-driven site that editors manage. A block theme is possible too (see the end of this file).

## 1. File mapping

| Eleventy (now) | WordPress theme (later) |
| --- | --- |
| `_includes/layouts/base.njk` (top half) | `header.php` |
| `_includes/layouts/base.njk` (bottom half) | `footer.php` |
| `_includes/partials/header.njk` | `template-parts/site-header.php` |
| `_includes/partials/footer.njk` | `template-parts/site-footer.php` |
| `_includes/partials/newsletter.njk` | `template-parts/newsletter.php` |
| `macros.njk` → `mediaCard` | `template-parts/content-message.php` |
| `macros.njk` → `bookCover` | `template-parts/content-book.php` |
| `macros.njk` → `picture` | `wp_get_attachment_image()` |
| `index.njk` | `front-page.php` |
| `about.njk`, `ministry.njk`, `made-for-more.njk`, `speaking.njk`, `press-kit.njk`, `contact.njk` | `page-{slug}.php` templates with ACF fields for editable copy |
| `media.njk` | `archive-message.php` |
| `books.njk` | `archive-book.php` + `single-book.php` |
| `privacy.njk` | `page.php` (normal editor content) |
| `404.njk` | `404.php` |
| `assets/css/style.css` | `assets/css/style.css`, enqueued in `functions.php` (theme `style.css` holds only the header comment) |
| `assets/js/main.js` | enqueued with `defer` in `functions.php` |
| `assets/fonts/*` | ship in the theme; `@font-face` paths already relative |
| `nav.json` | `register_nav_menus( primary, footer-explore, footer-connect )` |
| `site.json` | ACF Options page "Site settings" (social links, office email, preview flag) |

## 2. Content types (from `_data/*.json`)

| Data file | Custom post type | Fields (ACF) |
| --- | --- | --- |
| `messages.json` | `message` | category (taxonomy: Teaching / Better Half / Conversations), kind, context, description, youtube_id, external_url, featured (bool), featured image |
| `books.json` | `book` | status (forthcoming / available), kicker, cover_title, subtitle, release, summary, buy_links (repeater: label + url), cover image |
| `editions.json` | `edition` (Made for More) | year, theme, detail, source_url, is_current |
| `topics.json` | `topic` | summary (order by menu_order) |
| `press.json` | `press_item` | outlet, date_label, url |

Keep the field names identical to the JSON keys so the PHP templates read like the Nunjucks ones (`{{ m.title }}` → `<?php echo esc_html( get_the_title() ); ?>`, `{{ m.youtube }}` → `get_field('youtube_id')`).

## 3. Forms

Netlify Forms will not exist on WordPress. Swap each `<form data-netlify>` for:

- Newsletter and book launch list → the chosen mailing-list plugin (MC4WP for Mailchimp, or Brevo).
- Speaking invitation and contact → Gravity Forms or Fluent Forms, with the same fields and notifications to the office email.

Keep the class names (`.form`, `.field`, `.input`, `.panel`) so the styling carries over.

## 4. Design tokens → `theme.json`

`docs/theme.json.draft` holds the palette, fonts and type sizes from the `:root` tokens in `style.css`. Use it so the block editor offers only the brand colours and fonts, even in a classic theme.

## 5. Suggested build order

1. Scaffold the theme (`style.css` header, `functions.php`, `header.php`, `footer.php`, `index.php`) and enqueue the CSS, JS and fonts.
2. Register the menus, CPTs and taxonomies, and add the ACF field groups (export them to `acf-json/` in the theme).
3. Port the template parts, then `front-page.php`, then each page template.
4. Import the content from the JSON files with a small WP-CLI script.
5. Replace the forms, add SEO (Yoast or Rank Math), then remove the preview flag.

## Block-theme alternative

Each homepage `<section>` is self-contained, so each can become a block pattern (`patterns/hero.php`, `patterns/ministry.php`, and so on). Pair that with `theme.json` and the same CSS, and Pastor Bola's team could rearrange sections in the Site Editor. This gives more editor freedom but makes it more likely someone breaks the design.
