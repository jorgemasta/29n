// Page text of each published programme, for the live free question (#15). The data pipeline
// writes one file per party next to the static site (public/texts/<party>.json); the Cloudflare
// function reads it through its ASSETS binding. The site never links to it and the function
// refuses direct requests to /textos/: it is only an input of the endpoint.
import { z } from 'zod';

export const ManifestoText = z.object({
  party: z.string().min(1),
  /** sha256 of the PDF the text comes from: a text whose hash differs from the dataset is stale. */
  hashPdf: z.string().min(1),
  /** Text of each page, in order (index 0 = page 1), as extracted for the V1/V2 checks. */
  pages: z.array(z.string()),
});
export type ManifestoText = z.infer<typeof ManifestoText>;

/** Path relative to the site root (and to `public/` in the repo). */
export const textPath = (party: string) => `texts/${party}.json`;
