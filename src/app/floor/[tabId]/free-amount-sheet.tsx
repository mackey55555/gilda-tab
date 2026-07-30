"use client";

import { useState } from "react";

import { formatYen } from "@/lib/format";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0"] as const;

type Props = {
  onSubmit: (name: string, price: number) => void;
  onClose: () => void;
};

/**
 * マスタ未登録の注文を入れるボトムシート（product_id = null の明細になる）。
 * 割引・サービスはマイナス金額で表現する仕様なので、符号を切り替えられるようにしている。
 */
export function FreeAmountSheet({ onSubmit, onClose }: Props) {
  const [digits, setDigits] = useState("");
  const [discount, setDiscount] = useState(false);
  const [name, setName] = useState("");

  const amount = Number(digits || "0");
  const signedAmount = discount ? -amount : amount;
  const defaultName = discount ? "値引き" : "その他";

  function push(key: string) {
    // 桁あふれで誤入力しないよう 7 桁で止める
    const next = (digits + key).replace(/^0+(?=\d)/, "");
    if (next.length > 7) return;
    setDigits(next);
  }

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-end bg-black/60">
      <button
        type="button"
        aria-label="閉じる"
        onClick={onClose}
        className="flex-1 cursor-default"
      />

      <div className="rounded-t-2xl border-t border-line bg-surface px-5 pt-4 pb-safe">
        <div className="flex items-center justify-between">
          <span className="font-bold">{discount ? "値引きを入力" : "その他を入力"}</span>
          <button type="button" onClick={onClose} className="min-h-tap px-2 text-sm text-ink-muted">
            閉じる
          </button>
        </div>

        <p className="mt-2 text-right text-4xl font-bold tabular-nums">
          {formatYen(signedAmount)}
        </p>

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
              onClick={() => push(key)}
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

        <button
          type="button"
          disabled={amount === 0}
          onClick={() => onSubmit(name.trim() || defaultName, signedAmount)}
          className="mt-3 min-h-14 w-full rounded-xl bg-accent text-lg font-bold text-accent-ink disabled:opacity-40"
        >
          追加する
        </button>
      </div>
    </div>
  );
}
