import type { GuestRow } from "@/app/admin/sales/guest-ranking";

/** sales_items が返す行のうち、客別集計に必要な列だけ */
type ItemRow = {
  business_date: string | null;
  tab_id: string | null;
  guest_name: string | null;
  item_id: string | null;
  amount: number | null;
};

const UNNAMED = "名前なし";

/**
 * 明細から客別の集計を作る。
 *
 * 専用の集計関数は用意せず、既存の sales_items を集計し直している
 * （客名は伝票に手入力する自由記述なので、DB 側で正規化しても意味が薄いため）。
 *
 * 来店回数は「営業日の数」で数える。同じ晩に伝票が分かれていても 1 回にしたい。
 */
export function buildGuestRanking(rows: ItemRow[]): GuestRow[] {
  const byName = new Map<
    string,
    { unnamed: boolean; total: number; dates: Set<string>; itemCount: number }
  >();

  for (const row of rows) {
    // 明細 0 件の伝票も 1 行返ってくるので、売上には数えない
    if (row.item_id === null) continue;

    const trimmed = row.guest_name?.trim();
    const name = trimmed ? trimmed : UNNAMED;

    const entry = byName.get(name) ?? {
      unnamed: !trimmed,
      total: 0,
      dates: new Set<string>(),
      itemCount: 0,
    };

    entry.total += row.amount ?? 0;
    entry.itemCount += 1;
    if (row.business_date) entry.dates.add(row.business_date);

    byName.set(name, entry);
  }

  return [...byName.entries()]
    .map(([name, entry]) => ({
      name,
      unnamed: entry.unnamed,
      total: entry.total,
      visits: entry.dates.size,
      itemCount: entry.itemCount,
    }))
    .sort((a, b) => b.total - a.total);
}
