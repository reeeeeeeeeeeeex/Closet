import type { Metadata } from "next";
import { I18nProvider } from "@/lib/i18n/provider";
import { requestLocale } from "@/lib/i18n/server";
import { messageForLocale } from "@/lib/i18n/core";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestLocale();
  return {
  title: messageForLocale(locale, "New Closet · 我的衣橱"),
  description: messageForLocale(locale, "原图、搭配和穿搭日历。属于你，也能随时带走的私人衣橱。"),
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await requestLocale();
  return (
    <html lang={locale}>
      <body className="antialiased"><I18nProvider initialLocale={locale}>{children}</I18nProvider></body>
    </html>
  );
}
