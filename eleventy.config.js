// Eleventy config. Templates in src/ mirror the future WordPress theme:
//   _includes/layouts/base.njk   -> header.php + footer.php
//   _includes/partials/*.njk     -> template-parts/*.php
//   _data/*.json                 -> custom post types / ACF options (see docs/WORDPRESS-PLAN.md)
export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/robots.txt": "robots.txt" });

  eleventyConfig.addFilter("naira", (n) => "₦" + Number(n).toLocaleString("en-NG"));
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
