/* The e-book on sale, read from the same data file the pages use, so the price on the page
   and the price we charge can never differ. */
import books from "../src/_data/books.json" with { type: "json" };
import { ebookOffer } from "./payments.js";

export const offer = () => ebookOffer(books);
