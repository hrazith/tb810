import type { Metadata } from "next";
import { cookies } from "next/headers";

import { brandConfig, gothamSans } from "@/brand";
import { DevToolsProvider, DevToolsToolbar } from "@/components/dev-tools";
import { getBusinessDateCookieName, parseBusinessDateCookieValue } from "@/server/business-date";
import { getActiveDevTestSessionSummary } from "@/server/dev-test-session";
import "./globals.css";

export const metadata: Metadata = {
  title: brandConfig.shortName,
  description: `${brandConfig.productName} ${brandConfig.descriptor}`,
};

export default async function RootLayout({
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
  const currentDate = new Date();
  const currentDateValue = `${currentDate.getUTCFullYear()}-${String(currentDate.getUTCMonth() + 1).padStart(2, "0")}-${String(currentDate.getUTCDate()).padStart(2, "0")}`;
  const businessDateValue =
    process.env.NODE_ENV === "development"
      ? parseBusinessDateCookieValue((await cookies()).get(getBusinessDateCookieName())?.value)
      : null;
  const devTestSession = await getActiveDevTestSessionSummary();

  return (
    <html lang={brandConfig.defaultLocale} className={`${gothamSans.variable} h-full antialiased`}>
      <body
        className="min-h-full flex flex-col"
        data-dev-outline={devOutline ? "1" : undefined}
        data-dev-grid={devGrid ? "1" : undefined}
        data-dev-spacing={devSpacing ? "1" : undefined}
        data-dev-page-breaks={devPageBreaks ? "1" : undefined}
        data-dev-historical-editing-available={historicalEditingAvailable ? "1" : undefined}
        data-dev-business-date-active={businessDateValue ? "1" : undefined}
        data-dev-business-date={businessDateValue ?? currentDateValue}
        data-dev-test-session-active={devTestSession ? "1" : undefined}
        data-dev-test-session-id={devTestSession?.id ?? undefined}
        data-dev-test-session-mutations={devTestSession ? String(devTestSession.mutationCount) : undefined}
      >
        <DevToolsProvider>
          {children}
          <DevToolsToolbar />
        </DevToolsProvider>
      </body>
    </html>
  );
}
