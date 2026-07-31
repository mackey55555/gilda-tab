"use client";

import { useMemo, useState } from "react";

import { formatYen } from "@/lib/format";
import type { Category, Product } from "@/lib/types";

import type { NewItem } from "./use-tab-items";

const ALL = "__all__";
const UNCATEGORIZED = "__none__";
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0"] as const;

type Props = {
  title: string;
  products: Product[];
  categories: Category[];
  onPick: (item: NewItem) => void;
  onClose: () => void;
};

/**
 * 商品を選ぶモーダル。画面遷移させずに追加できるようにするためのもの。
 * 追加しても閉じないので、続けて何品でも入れられる。
 */
export function ProductModal({ title, products, categories, onPick, onClose }: Props) {
  const [activeCategory, setActiveCategory] = useState<string>(ALL);
  const [keyword, setKeyword] = useState("");
  const [freeAmount, setFreeAmount] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  const hasUncategorized = products.some((product) => product.category_id === null);

  const visibleCategories = useMemo(
    () => categories.filter((category) => products.some((p) => p.category_id === category.id)),
    [categories, products],
  );

  const visible = useMemo(() => {
    const trimmed = keyword.trim();
    return products.filter((product) => {
      const inCategory =
        activeCategory === ALL ||
        (activeCategory === UNCATEGORIZED
          ? product.category_id === null
          : product.category_id === activeCategory);
      const matches = trimmed === "" || product.name.includes(trimmed);
      return inCategory && matches;
    });
  }, [products, activeCategory, keyword]);

  function pick(item: NewItem) {
    onPick(item);
    setAdded(item.name);
    // 何が入ったか一瞬だけ出す。連続で入れても邪魔にならない程度に短く。
    window.setTimeout(() => setAdded(null), 1200);
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-end bg-black/70">
      <button type="button" aria-label="閉じる" onClick={onClose} className="h-[10dvh] w-full cursor-default" />

      <div className="flex h-[90dvh] flex-col rounded-t-2xl border-t border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <span className="min-w-0 truncate font-bold">{title}</span>
          <button type="button" onClick={onClose} className="min-h-tap shrink-0 px-2 text-sm text-ink-muted">
            閉じる
          </button>
        </div>

        {freeAmount ? (
          <FreeAmountPad
            onSubmit={(name, price) => {
              pick({ productId: null, name, price });
              setFreeAmount(false);
            }}
            onCancel={() => setFreeAmount(false)}
          />
        ) : (
          <>
            <div className="border-b border-line px-5 py-2">
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="商品を検索"
                enterKeyHint="search"
                className="min-h-tap w-full rounded-lg border border-line bg-raised px-3 outline-none focus:border-accent"
              />
            </div>

            <div className="flex gap-2 overflow-x-auto border-b border-line px-5 py-2">
              <CategoryTab label="すべて" active={activeCategory === ALL} onClick={() => setActiveCategory(ALL)} />
              {visibleCategories.map((category) => (
                <CategoryTab
                  key={category.id}
                  label={category.name}
                  active={activeCategory === category.id}
                  onClick={() => setActiveCategory(category.id)}
                />
              ))}
              {hasUncategorized && (
                <CategoryTab
                  label="未分類"
                  active={activeCategory === UNCATEGORIZED}
                  onClick={() => setActiveCategory(UNCATEGORIZED)}
                />
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {visible.length === 0 ? (
                <p className="py-10 text-center text-sm text-ink-muted">
                  {products.length === 0
                    ? "商品が登録されていません（管理画面から登録してください）"
                    : "該当する商品がありません"}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {visible.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => pick({ productId: product.id, name: product.name, price: product.price })}
                      className="flex min-h-16 flex-col justify-center gap-0.5 rounded-xl border border-line bg-raised px-3 py-2 text-left active:bg-surface"
                    >
                      <span className="text-base leading-tight font-bold">{product.name}</span>
                      <span className="text-xs text-ink-muted tabular-nums">{formatYen(product.price)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-line px-5 pt-3 pb-safe">
              {added && (
                <p role="status" className="mb-2 text-center text-sm text-accent">
                  {added} を追加しました
                </p>
              )}
              <button
                type="button"
                onClick={() => setFreeAmount(true)}
                className="min-h-14 w-full rounded-xl border border-dashed border-line text-base font-bold"
              >
                その他 ¥直接入力
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CategoryTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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

/** マスタ未登録の注文と値引き。割引はマイナス金額で表現する仕様。 */
function FreeAmountPad({
  onSubmit,
  onCancel,
}: {
  onSubmit: (name: string, price: number) => void;
  onCancel: () => void;
}) {
  const [digits, setDigits] = useState("");
  const [discount, setDiscount] = useState(false);
  const [name, setName] = useState("");

  const amount = Number(digits || "0");
  const signed = discount ? -amount : amount;
  const defaultName = discount ? "値引き" : "その他";

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pt-3 pb-safe">
      <p className="text-right text-4xl font-bold tabular-nums">{formatYen(signed)}</p>

      <div className="mt-3 flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={defaultName}
          className="min-h-tap min-w-0 flex-1 rounded-lg border border-line bg-raised px-3 outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={() => setDiscount((prev) => !prev)}
          aria-pressed={discount}
          className={`min-h-tap shrink-0 rounded-lg border px-3 text-sm ${
            discount ? "border-accent bg-accent font-bold text-accent-ink" : "border-line"
          }`}
        >
          値引き（−）
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              const next = (digits + key).replace(/^0+(?=\d)/, "");
              if (next.length <= 7) setDigits(next);
            }}
            className="min-h-14 rounded-xl border border-line bg-raised text-xl font-bold tabular-nums active:bg-surface"
          >
            {key}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setDigits((prev) => prev.slice(0, -1))}
          aria-label="1文字消す"
          className="min-h-14 rounded-xl border border-line bg-raised text-xl active:bg-surface"
        >
          ⌫
        </button>
      </div>

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onCancel} className="min-h-14 flex-1 rounded-xl border border-line text-base">
          戻る
        </button>
        <button
          type="button"
          disabled={amount === 0}
          onClick={() => onSubmit(name.trim() || defaultName, signed)}
          className="min-h-14 flex-2 rounded-xl bg-accent text-lg font-bold text-accent-ink disabled:opacity-40"
        >
          追加する
        </button>
      </div>
    </div>
  );
}
