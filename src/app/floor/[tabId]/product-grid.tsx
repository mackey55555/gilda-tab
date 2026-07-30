"use client";

import { useMemo, useState } from "react";

import { formatYen } from "@/lib/format";
import type { Product } from "@/lib/types";

const ALL = "__all__";

type Props = {
  products: Product[];
  disabled: boolean;
  onPick: (product: Product) => void;
  onPickFreeAmount: () => void;
};

/**
 * 商品グリッド。タップ 1 回で明細が 1 行増える。
 * products は sort_order 昇順で渡ってくる（よく出る商品が上位）。
 */
export function ProductGrid({ products, disabled, onPick, onPickFreeAmount }: Props) {
  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const product of products) {
      const category = product.category ?? "その他";
      if (!seen.includes(category)) seen.push(category);
    }
    return seen;
  }, [products]);

  const [active, setActive] = useState<string>(ALL);

  const visible =
    active === ALL
      ? products
      : products.filter((product) => (product.category ?? "その他") === active);

  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        <CategoryTab label="すべて" active={active === ALL} onClick={() => setActive(ALL)} />
        {categories.map((category) => (
          <CategoryTab
            key={category}
            label={category}
            active={active === category}
            onClick={() => setActive(category)}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {visible.map((product) => (
          <button
            key={product.id}
            type="button"
            onClick={() => onPick(product)}
            disabled={disabled}
            className="flex min-h-16 flex-col justify-center gap-0.5 rounded-xl border border-line bg-surface px-3 py-2 text-left active:bg-raised disabled:opacity-40"
          >
            <span className="text-base leading-tight font-bold">{product.name}</span>
            <span className="text-xs text-ink-muted tabular-nums">
              {formatYen(product.price)}
            </span>
          </button>
        ))}

        <button
          type="button"
          onClick={onPickFreeAmount}
          disabled={disabled}
          className="flex min-h-16 flex-col justify-center gap-0.5 rounded-xl border border-dashed border-line bg-surface px-3 py-2 text-left active:bg-raised disabled:opacity-40"
        >
          <span className="text-base leading-tight font-bold">その他</span>
          <span className="text-xs text-ink-muted">¥直接入力</span>
        </button>
      </div>
    </div>
  );
}

function CategoryTab({
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
      className={`min-h-tap shrink-0 rounded-full border px-4 text-sm ${
        active ? "border-accent bg-accent font-bold text-accent-ink" : "border-line text-ink-muted"
      }`}
    >
      {label}
    </button>
  );
}
