import path from "node:path";
import { Font } from "@react-pdf/renderer";

// Gotham for server-rendered PDFs, read from the same files as brand/fonts.ts.
// Only the .woff files: react-pdf embeds the .woff2 files with corrupt glyphs.
// The webfont subset has no "×" or "³"; documents avoid them (react-pdf would
// silently fall back to Helvetica).
export const PDF_FONT_FAMILY = "Gotham";

const fontFile = (name: string) => path.join(process.cwd(), "app/fonts", name);

Font.register({
  family: PDF_FONT_FAMILY,
  fonts: [
    { src: fontFile("gotham-book-webfont.woff"), fontWeight: 400 },
    { src: fontFile("gotham-medium-webfont.woff"), fontWeight: 500 },
    { src: fontFile("gotham-bold-webfont.woff"), fontWeight: 700 },
  ],
});

// react-pdf hyphenates with English rules by default; wrap Spanish text at word boundaries instead.
Font.registerHyphenationCallback((word) => [word]);
