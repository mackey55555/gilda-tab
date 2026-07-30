import { requireStaff } from "@/lib/auth";

/**
 * /floor 配下の認証ガード。
 * proxy.ts の判定は楽観的なものなので、ここで実際のセッションを確認する。
 * 画面の枠組みは各ページ側に持たせる（一覧と詳細でヘッダーが別物のため）。
 */
export default async function FloorLayout({ children }: { children: React.ReactNode }) {
  await requireStaff();
  return children;
}
