import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Receipt Splitter",
  description: "Split receipts among friends easily",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <Script src="/pdf.mjs" type="module" strategy="beforeInteractive" />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
