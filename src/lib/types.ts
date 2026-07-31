import type { Database } from "./database.types";

export type Product = Pick<
  Database["public"]["Tables"]["products"]["Row"],
  "id" | "name" | "price" | "category_id"
>;

export type Category = Pick<
  Database["public"]["Tables"]["categories"]["Row"],
  "id" | "name" | "sort_order"
>;

export type BusinessDay = Database["public"]["Tables"]["business_days"]["Row"];

/** DB に保存済みの注文明細（画面で必要な列だけ） */
export type OrderItem = Pick<
  Database["public"]["Tables"]["order_items"]["Row"],
  "id" | "product_id" | "name_snapshot" | "price_snapshot" | "qty" | "created_at"
>;

/**
 * 画面上の明細。楽観的更新の途中の行を表すため sync を持つ。
 *   pending … 送信中（DB 未確定）
 *   failed  … 送信失敗（再試行ボタンを出す）
 *   未設定  … DB と同期済み
 */
export type LocalOrderItem = OrderItem & { sync?: "pending" | "failed" };

/** 伝票一覧カードに出す情報。tab_summaries ビューの行を絞ったもの。 */
export type TabSummary = {
  id: string;
  businessDayId: string;
  seq: number;
  guestName: string | null;
  total: number;
  itemCount: number;
  lastOrderedAt: string | null;
  createdAt: string;
};

/** 会計済み一覧に出す情報。payment_summaries ビューの行を絞ったもの。 */
export type PaymentSummary = {
  id: string;
  total: number;
  paidAt: string;
  staffName: string | null;
  tabCount: number;
  guestLabels: string[];
};

type PaymentSummaryRow = Database["public"]["Views"]["payment_summaries"]["Row"];

export function toPaymentSummary(row: PaymentSummaryRow): PaymentSummary | null {
  if (row.id === null || row.paid_at === null) return null;

  return {
    id: row.id,
    total: row.total ?? 0,
    paidAt: row.paid_at,
    staffName: row.staff_name,
    tabCount: row.tab_count ?? 0,
    guestLabels: row.guest_labels ?? [],
  };
}

type TabSummaryRow = Database["public"]["Views"]["tab_summaries"]["Row"];

/**
 * ビューの列は Postgres が非 NULL を保証できないため生成型が全て nullable になる。
 * 画面で扱いやすい形に詰め直し、想定外の行は捨てる。
 */
export function toTabSummary(row: TabSummaryRow): TabSummary | null {
  if (
    row.id === null ||
    row.business_day_id === null ||
    row.seq === null ||
    row.created_at === null
  ) {
    return null;
  }

  return {
    id: row.id,
    businessDayId: row.business_day_id,
    seq: row.seq,
    guestName: row.guest_name,
    total: row.total ?? 0,
    itemCount: row.item_count ?? 0,
    lastOrderedAt: row.last_ordered_at,
    createdAt: row.created_at,
  };
}
