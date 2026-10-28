import { readFile } from "node:fs/promises";

import type { FontFace } from "../layout";
import type { PdfFonts } from "../render";

/**
 * The font files the browser fetches, read from `public/fonts` - real bytes, not
 * a stub, so a test exercises the same fontkit path as a download.
 */
export const FONT_FILES: Readonly<Record<FontFace, string>> = {
  serif: "public/fonts/YoungSerif-Regular.ttf",
  regular: "public/fonts/NunitoSans-Regular.ttf",
  bold: "public/fonts/NunitoSans-Bold.ttf",
  boldItalic: "public/fonts/NunitoSans-BoldItalic.ttf",
};

export async function readPlanFonts(): Promise<PdfFonts> {
  const faces = Object.keys(FONT_FILES) as FontFace[];
  const bytes = await Promise.all(faces.map(async (face) => new Uint8Array(await readFile(FONT_FILES[face]))));
  return Object.fromEntries(faces.map((face, index) => [face, bytes[index]])) as Record<FontFace, Uint8Array>;
}
