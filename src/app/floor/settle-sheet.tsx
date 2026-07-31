"use client";

import { useState } from "react";

import { formatYen } from "@/lib/format";

import { CustomerView } from "./customer-view";

export type SettleLine = {
  key: string;
  label: string;
  amount: number;
  /** 「¥770 × 2」のような補足。明細を出すときに使う。 */
  detail?: string;
};

type Props = {
  title: string;
  lines: SettleLine[];
  total: number;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
};

/**
 * 会計の確認シート。単独会計とまとめて会計で共用する。
 * 押し間違いが金銭事故になるので、確定前に必ず内訳と合計を出す。
 */
export function SettleSheet({ title, lines, total, pending, error, onConfirm, onClose }: Props) {
  const [showCustomer, setShowCustomer] = useState(false);

  return (
    <>
      <div className="fixed inset-0 z-30 flex flex-col justify-end bg-black/60">
        <button
          type="button"
          aria-label="閉じる"
          onClick={onClose}
          disabled={pending}
          className="flex-1 cursor-default"
        />

        <div className="max-h-[80dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface px-5 pt-4 pb-safe">
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold">{title}</span>
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="min-h-tap px-2 text-sm text-ink-muted disabled:opacity-50"
            >
              閉じる
            </button>
          </div>

          <ul className="mt-3 flex flex-col gap-1">
            {lines.map((line) => (
              <li key={line.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-ink-muted">
                  {line.label}
                  {line.detail && <span className="ml-2 text-xs">{line.detail}</span>}
                </span>
                <span className="shrink-0 tabular-nums">{formatYen(line.amount)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
            <span className="text-sm text-ink-muted">合計</span>
            <span className="text-4xl font-bold tabular-nums">{formatYen(total)}</span>
          </div>

          {error && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => setShowCustomer(true)}
            className="mt-3 min-h-14 w-full rounded-xl border border-line text-base font-bold"
          >
            お客様に見せる
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="mt-2 min-h-14 w-full rounded-xl bg-accent text-lg font-bold text-accent-ink disabled:opacity-40"
          >
            {pending ? "会計中…" : "会計を確定する"}
          </button>
        </div>
      </div>

      {showCustomer && (
        <CustomerView
          title={title}
          lines={lines}
          total={total}
          onClose={() => setShowCustomer(false)}
        />
      )}
    </>
  );
}
