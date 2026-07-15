import localFont from "next/font/local";

export const gothamSans = localFont({
  src: [
    {
      path: "../app/fonts/gotham-thin-webfont.woff2",
      weight: "100",
      style: "normal",
    },
    {
      path: "../app/fonts/gotham-thin-webfont.woff",
      weight: "100",
      style: "normal",
    },
    {
      path: "../app/fonts/gotham-light-webfont.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../app/fonts/gotham-light-webfont.woff",
      weight: "300",
      style: "normal",
    },
    {
      path: "../app/fonts/gotham-book-webfont.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../app/fonts/gotham-book-webfont.woff",
      weight: "400",
      style: "normal",
    },
    {
      path: "../app/fonts/gotham-medium-webfont.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../app/fonts/gotham-medium-webfont.woff",
      weight: "500",
      style: "normal",
    },
    {
      path: "../app/fonts/gotham-bold-webfont.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../app/fonts/gotham-bold-webfont.woff",
      weight: "700",
      style: "normal",
    },
    {
      path: "../app/fonts/gotham-black-webfont.woff2",
      weight: "900",
      style: "normal",
    },
    {
      path: "../app/fonts/gotham-black-webfont.woff",
      weight: "900",
      style: "normal",
    },
  ],
  variable: "--font-gotham",
  display: "swap",
  fallback: [
    "system-ui",
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "sans-serif",
  ],
});
