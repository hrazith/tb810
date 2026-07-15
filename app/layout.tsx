import type { Metadata } from "next";

import { brandConfig, gothamSans } from "@/brand";
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
  return (
    <html lang={brandConfig.defaultLocale} className={`${gothamSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
