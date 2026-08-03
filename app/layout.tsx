import type { Metadata } from "next";

import { brandConfig, gothamSans } from "@/brand";
import { DevToolsProvider, DevToolsToolbar } from "@/components/dev-tools";
import "./globals.css";

export const metadata: Metadata = {
  title: brandConfig.shortName,
  description: `${brandConfig.productName} ${brandConfig.descriptor}`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const devOutline = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEBUG_OUTLINE === "1";
  const devGrid = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEBUG_GRID === "1";
  const devSpacing = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEBUG_SPACING === "1";
  const devPageBreaks = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEBUG_PAGE_BREAKS === "1";
  const historicalEditingAvailable =
    process.env.NODE_ENV === "development" &&
    process.env.TB810_ALLOW_HISTORICAL_READING_EDITS === "true";

  return (
    <html lang={brandConfig.defaultLocale} className={`${gothamSans.variable} h-full antialiased`}>
      <body
        className="min-h-full flex flex-col"
        data-dev-outline={devOutline ? "1" : undefined}
        data-dev-grid={devGrid ? "1" : undefined}
        data-dev-spacing={devSpacing ? "1" : undefined}
        data-dev-page-breaks={devPageBreaks ? "1" : undefined}
        data-dev-historical-editing-available={historicalEditingAvailable ? "1" : undefined}
      >
        <DevToolsProvider>
          {children}
          <DevToolsToolbar />
        </DevToolsProvider>
      </body>
    </html>
  );
}
