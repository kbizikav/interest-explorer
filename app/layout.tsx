import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Lending Interest Dashboard",
  description: "Cross-chain lending interest dashboard for Aave v3 and Morpho.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
