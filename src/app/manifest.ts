import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "gilda 注文管理",
    short_name: "gilda",
    description: "バー gilda の注文・会計を記録する社内アプリ",
    // ホーム画面から起動したら営業画面を直接開く
    start_url: "/floor",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#100e0c",
    theme_color: "#100e0c",
    lang: "ja",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
