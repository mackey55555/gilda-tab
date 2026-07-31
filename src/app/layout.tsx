import type { Metadata, Viewport } from "next";
import "./globals.css";

import { ServiceWorkerRegistrar } from "./service-worker";

export const metadata: Metadata = {
  title: "gilda 注文管理",
  description: "バー gilda の注文・会計を記録する社内アプリ",
  // iOS はホーム画面追加時に manifest の icons を見ないので、apple-touch-icon が要る
  icons: { apple: "/icons/apple-180" },
  appleWebApp: {
    capable: true,
    title: "gilda",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#100e0c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="min-h-dvh antialiased">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
