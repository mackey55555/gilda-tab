"use client";

import { useState } from "react";

import { formatYen } from "@/lib/format";

export type GuestRow = {
  name: string;
  /** 客名が未設定の伝票をまとめた行かどうか */
  unnamed: boolean;
  total: number;
  /** 来店回数（営業日の数）。同じ晩に複数伝票があっても 1 回と数える。 */
  visits: number;
  itemCount: number;
};

type SortKey = "total" | "visits" | "average";

export function GuestRanking({ rows }: { rows: GuestRow[] }) {
  const [sort, setSort] = useState<SortKey>("total");

  const average = (row: GuestRow) => (row.visits === 0 ? 0 : Math.round(row.total / row.visits));
  const sorted = [...rows].sort((a, b) =>
    sort === "average" ? average(b) - average(a) : b[sort] - a[sort],
  );
  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">客別ランキング</h2>
        <div className="flex gap-2">
          <SortTab label="売上順" active={sort === "total"} onClick={() => setSort("total")} />
          <SortTab label="来店回数順" active={sort === "visits"} onClick={() => setSort("visits")} />
          <SortTab label="客単価順" active={sort === "average"} onClick={() => setSort("average")} />
        </div>
      </div>

      <p className="text-xs text-ink-muted">
        伝票に入力された客名で集計しています。名前を付けていない伝票は「名前なし」にまとめています。
        来店回数は営業日の数で数えるので、同じ晩に伝票が分かれていても 1 回です。
      </p>

      {sorted.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">データがありません</p>
      ) : (
        <table className="w-full border-separate border-spacing-y-1 text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-muted">
              <th className="w-10 px-3 py-1 font-normal">#</th>
              <th className="px-3 py-1 font-normal">客名</th>
              <th className="w-24 px-3 py-1 text-right font-normal">来店</th>
              <th className="w-24 px-3 py-1 text-right font-normal">品数</th>
              <th className="w-32 px-3 py-1 text-right font-normal">客単価</th>
              <th className="w-32 px-3 py-1 text-right font-normal">売上</th>
              <th className="w-20 px-3 py-1 text-right font-normal">構成比</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, index) => (
              <tr key={row.name} className={row.unnamed ? "opacity-60" : ""}>
                <td className="rounded-l-lg bg-surface px-3 py-2 text-ink-muted tabular-nums">
                  {index + 1}
                </td>
                <td className="bg-surface px-3 py-2 font-bold">{row.name}</td>
                <td className="bg-surface px-3 py-2 text-right tabular-nums">{row.visits}</td>
                <td className="bg-surface px-3 py-2 text-right tabular-nums">{row.itemCount}</td>
                <td className="bg-surface px-3 py-2 text-right text-ink-muted tabular-nums">
                  {formatYen(average(row))}
                </td>
                <td className="bg-surface px-3 py-2 text-right tabular-nums">
                  {formatYen(row.total)}
                </td>
                <td className="rounded-r-lg bg-surface px-3 py-2 text-right text-ink-muted tabular-nums">
                  {grandTotal === 0 ? "—" : `${Math.round((row.total / grandTotal) * 100)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function SortTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-xs ${
        active ? "border-accent bg-accent font-bold text-accent-ink" : "border-line text-ink-muted"
      }`}
    >
      {label}
    </button>
  );
}
