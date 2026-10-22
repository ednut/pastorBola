/* GET /api/ebook-download?token=...  Streams the private e-book to someone with a valid, unexpired link. */
import { Readable } from "node:stream";
import { get } from "@vercel/blob";
import { prepareDownload } from "../lib/payments.js";
import { offer } from "../lib/offer.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).end(); }
  const r = await prepareDownload(req.query?.token, { offer: offer(), getBlob: (path) => get(path, { access: "private" }) });
  if (r.status !== 200) return res.status(r.status).send(r.message);
  for (const [k, v] of Object.entries(r.headers)) res.setHeader(k, v);
  Readable.fromWeb(r.stream).pipe(res);
}
