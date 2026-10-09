import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "New Closet · 我的衣橱",
  description: "原图、搭配和穿搭日历。属于你，也能随时带走的私人衣橱。",
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
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
