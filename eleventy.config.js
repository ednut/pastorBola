// Eleventy config. Templates in src/ mirror the future WordPress theme:
//   _includes/layouts/base.njk   -> header.php + footer.php
//   _includes/partials/*.njk     -> template-parts/*.php
//   _data/*.json                 -> custom post types / ACF options (see docs/WORDPRESS-PLAN.md)
export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  const SYMBOLS = { NGN: "₦", GBP: "£", USD: "$", EUR: "€", CAD: "CA$" };
  const NAMES = { NGN: "Nigerian naira", GBP: "British pounds", USD: "US dollars", EUR: "Euros", CAD: "Canadian dollars" };
  eleventyConfig.addFilter("money", (n, code) => (SYMBOLS[code] || code + " ") + Number(n).toLocaleString("en-GB"));
  eleventyConfig.addFilter("currencyName", (code) => NAMES[code] || code);
  eleventyConfig.addFilter("year", () => new Date().getFullYear());
  eleventyConfig.addFilter("where", (arr, key, value) => (arr || []).filter((i) => i[key] === value));
  eleventyConfig.addFilter("limit", (arr, n) => (arr || []).slice(0, n));
  eleventyConfig.addFilter("readableDate", (iso) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  );

  eleventyConfig.setServerOptions({ showAllHosts: true });

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    templateFormats: ["njk", "md", "html"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
}
