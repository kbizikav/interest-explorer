import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Interest Explorer",
  icons: { icon: "/icon" },
  description: "Cross-chain lending interest dashboard for Aave v3, Morpho, and Compound v3.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
