"use client";

import { formatBusinessDate, formatYen, guestLabel } from "@/lib/format";
import type { PaymentSummary, TabSummary } from "@/lib/types";

type Props = {
  businessDate: string;
  openTabs: TabSummary[];
  payments: PaymentSummary[];
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
};

/**
 * 営業終了の確認シート。
 *
 * クローズすると、その営業日のデータはスタッフでは書き換えられなくなる（RLS で admin のみ）。
 * 未会計の伝票が残っていると後から直せないので、spec 6 の通り必ず警告を出す。
 */
export function CloseDaySheet({
  businessDate,
  openTabs,
  payments,
  pending,
  error,
  onConfirm,
  onClose,
}: Props) {
  const paidTotal = payments.reduce((sum, payment) => sum + payment.total, 0);
  const openTotal = openTabs.reduce((sum, tab) => sum + tab.total, 0);
  const hasOpenTabs = openTabs.length > 0;

  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-end bg-black/60">
      <button
        type="button"
        aria-label="閉じる"
        onClick={onClose}
        disabled={pending}
        className="flex-1 cursor-default"
      />

      <div className="max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface px-5 pt-4 pb-safe">
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold">
            {formatBusinessDate(businessDate)} の営業を終了
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="min-h-tap px-2 text-sm text-ink-muted disabled:opacity-50"
          >
            閉じる
          </button>
        </div>

        <dl className="mt-3 flex flex-col gap-1 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-ink-muted">会計済み {payments.length}件</dt>
            <dd className="tabular-nums">{formatYen(paidTotal)}</dd>
          </div>
          {hasOpenTabs && (
            <div className="flex items-center justify-between text-danger">
              <dt>未会計 {openTabs.length}枚</dt>
              <dd className="tabular-nums">{formatYen(openTotal)}</dd>
            </div>
          )}
        </dl>

        {hasOpenTabs && (
          <div className="mt-3 rounded-xl border border-danger px-3 py-2">
            <p className="text-sm font-bold text-danger">
              未会計の伝票が {openTabs.length} 枚残っています
            </p>
            <ul className="mt-1 flex flex-col gap-0.5 text-sm">
              {openTabs.map((tab) => (
                <li key={tab.id} className="flex items-center justify-between gap-3">
                  <span className="truncate">{guestLabel(tab.guestName, tab.seq)}</span>
                  <span className="shrink-0 tabular-nums">{formatYen(tab.total)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-muted">
              このまま終了すると、これらの伝票はスタッフでは編集も会計もできなくなります
              （修正できるのは管理者だけになります）。
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className={`mt-3 min-h-14 w-full rounded-xl text-lg font-bold disabled:opacity-40 ${
            hasOpenTabs ? "bg-danger text-ink" : "bg-accent text-accent-ink"
          }`}
        >
          {pending
            ? "終了中…"
            : hasOpenTabs
              ? "未会計のまま終了する"
              : "営業を終了する"}
        </button>
      </div>
    </div>
  );
}
