import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BRRRR Analyzer",
  description:
    "A clean, beginner-friendly BRRRR (Buy, Rehab, Rent, Refinance, Repeat) real estate deal calculator.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
