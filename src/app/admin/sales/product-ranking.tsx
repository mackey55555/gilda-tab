"use client";

import { useState } from "react";

import { formatYen } from "@/lib/format";

export type ProductRow = {
  product_id: string | null;
  name: string;
  category: string | null;
  qty: number;
  total: number;
};

type SortKey = "total" | "qty";

export function ProductRanking({ rows }: { rows: ProductRow[] }) {
  const [sort, setSort] = useState<SortKey>("total");

  const sorted = [...rows].sort((a, b) => b[sort] - a[sort]);
  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">商品別ランキング</h2>
        <div className="flex gap-2">
          <SortTab label="売上順" active={sort === "total"} onClick={() => setSort("total")} />
          <SortTab label="数量順" active={sort === "qty"} onClick={() => setSort("qty")} />
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">データがありません</p>
      ) : (
        <table className="w-full border-separate border-spacing-y-1 text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-muted">
              <th className="w-10 px-3 py-1 font-normal">#</th>
              <th className="px-3 py-1 font-normal">商品</th>
              <th className="w-32 px-3 py-1 font-normal">カテゴリ</th>
              <th className="w-24 px-3 py-1 text-right font-normal">数量</th>
              <th className="w-32 px-3 py-1 text-right font-normal">売上</th>
              <th className="w-20 px-3 py-1 text-right font-normal">構成比</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, index) => (
              <tr key={`${row.product_id ?? "free"}:${row.name}`}>
                <td className="rounded-l-lg bg-surface px-3 py-2 text-ink-muted tabular-nums">
                  {index + 1}
                </td>
                <td className="bg-surface px-3 py-2 font-bold">
                  {row.name}
                  {row.product_id === null && (
                    <span className="ml-2 text-xs font-normal text-ink-muted">都度入力</span>
                  )}
                </td>
                <td className="bg-surface px-3 py-2 text-ink-muted">{row.category ?? "—"}</td>
                <td className="bg-surface px-3 py-2 text-right tabular-nums">{row.qty}</td>
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
