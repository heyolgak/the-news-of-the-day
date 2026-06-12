import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import "./globals.css";

const serifWeb = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif-web",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The News of the Day",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${serifWeb.variable}`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
