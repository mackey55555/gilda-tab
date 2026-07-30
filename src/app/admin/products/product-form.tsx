"use client";

import { useState } from "react";

export type ProductDraft = {
  name: string;
  price: number;
  category: string | null;
};

type Props = {
  /** 編集時の初期値。未指定なら新規作成。 */
  initial?: ProductDraft;
  categories: string[];
  submitLabel: string;
  pending: boolean;
  onSubmit: (draft: ProductDraft) => void;
  onCancel: () => void;
};

export function ProductForm({
  initial,
  categories,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [price, setPrice] = useState(String(initial?.price ?? ""));
  const [category, setCategory] = useState(initial?.category ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const trimmedName = name.trim();
    const parsedPrice = Number(price);

    if (!trimmedName) {
      setError("商品名を入力してください");
      return;
    }
    if (!Number.isInteger(parsedPrice) || parsedPrice < 0) {
      setError("価格は 0 以上の整数で入力してください");
      return;
    }

    setError(null);
    onSubmit({
      name: trimmedName,
      price: parsedPrice,
      category: category.trim() === "" ? null : category.trim(),
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">商品名</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-9 w-52 rounded-lg border border-line bg-raised px-2 outline-none focus:border-accent"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">価格（円・税込）</span>
        <input
          value={price}
          onChange={(event) => setPrice(event.target.value.replace(/[^\d]/g, ""))}
          inputMode="numeric"
          className="h-9 w-28 rounded-lg border border-line bg-raised px-2 text-right tabular-nums outline-none focus:border-accent"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">カテゴリ</span>
        <input
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          list="product-categories"
          className="h-9 w-40 rounded-lg border border-line bg-raised px-2 outline-none focus:border-accent"
        />
        <datalist id="product-categories">
          {categories.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      </label>

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="h-9 rounded-lg bg-accent px-4 text-sm font-bold text-accent-ink disabled:opacity-50"
      >
        {pending ? "保存中…" : submitLabel}
      </button>

      <button
        type="button"
        onClick={onCancel}
        className="h-9 rounded-lg px-3 text-sm text-ink-muted"
      >
        キャンセル
      </button>

      {error && (
        <p role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
