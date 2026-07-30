import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 実機（スマホ）確認は同一 Wi-Fi から dev server を開くため、
  // プライベート IP からのリクエストを許可する。開発時のみ影響する設定。
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*"],
};

export default nextConfig;
