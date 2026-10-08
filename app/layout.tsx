import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SAS · Supplier Advertising System",
  description: "Manage supplier advertising, Canada and USA tickers, packages and app connections across your child care network.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
