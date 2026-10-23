/* Decides whether the public pages show the e-book buy button or the waiting list.

   The buy button appears only when payments are live: the Korapay secret key is a live key
   (it starts with "sk_live"), or EBOOK_PUBLIC is set to "true" in Vercel.
   With a test key, visitors keep seeing the waiting list, because in test mode anyone could
   "buy" the book for free with Korapay's published test card.

   This is read when the site is built, so after changing the key in Vercel, redeploy the site. */
const key = process.env.KORAPAY_SECRET_KEY || "";
export default process.env.EBOOK_PUBLIC === "true" || /^sk_live/i.test(key);
