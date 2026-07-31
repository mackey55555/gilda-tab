import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 実機（スマホ）確認は同一 Wi-Fi から dev server を開くため、
  // プライベート IP からのリクエストを許可する。開発時のみ影響する設定。
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*"],

  // /admin の入口。page.tsx の redirect() だと loading.tsx の Suspense 境界により
  // ストリーミングになり、ステータスが 200 になってしまうため設定側で返す。
  async redirects() {
    return [{ source: "/admin", destination: "/admin/products", permanent: false }];
  },
};

export default nextConfig;
