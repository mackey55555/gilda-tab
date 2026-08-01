"use client";

import { useState } from "react";

import { formatYen } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { PaymentSummary } from "@/lib/types";

import { TaxNote } from "./tax-note";

type Props = {
  payments: PaymentSummary[];
  onVoided: () => void;
};

/**
 * 当日（= open な営業日）の会計済み一覧。
 * 打ち間違いを現場で直せるように、取り消しをここから行えるようにしている。
 */
export function PaidSection({ payments, onVoided }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (payments.length === 0) return null;

  const total = payments.reduce((sum, payment) => sum + payment.total, 0);

  async function voidPayment(paymentId: string) {
    setVoidingId(paymentId);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const { error: rpcError } = await supabase.rpc("void_payment", { payment_id: paymentId });

    setVoidingId(null);
    setConfirmingId(null);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    onVoided();
  }

  return (
    <section className="mt-2 rounded-xl border border-line">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex min-h-tap w-full items-center justify-between gap-3 px-4 py-2 text-left"
      >
        <span className="text-sm text-ink-muted">
          会計済み {payments.length}件
          <span aria-hidden className="ml-2">
            {expanded ? "▲" : "▼"}
          </span>
        </span>
        <span className="text-sm tabular-nums text-ink-muted">{formatYen(total)}</span>
      </button>

      {expanded && <TaxNote total={total} className="border-t border-line px-4 py-2 text-right" />}

      {expanded && (
        <ul className="flex flex-col gap-1 border-t border-line p-2">
          {payments.map((payment) => (
            <li key={payment.id} className="rounded-lg bg-surface px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">
                    {payment.guestLabels.join("・") || "伝票なし"}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {new Date(payment.paidAt).toLocaleTimeString("ja-JP", {
                      timeZone: "Asia/Tokyo",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {payment.staffName && ` / ${payment.staffName}`}
                  </span>
                </div>
                <span className="shrink-0 font-bold tabular-nums">
                  {formatYen(payment.total)}
                </span>
              </div>

              {/* 会計後に領収書を書く場面があるので、外税の内訳をここでも出す */}
              <TaxNote total={payment.total} className="mt-1 text-right" />

              {confirmingId === payment.id ? (
                <div className="mt-2 flex items-center gap-2">
                  <span className="flex-1 text-xs text-ink-muted">
                    取り消すと伝票が未会計に戻ります
                  </span>
                  <button
                    type="button"
                    onClick={() => void voidPayment(payment.id)}
                    disabled={voidingId === payment.id}
                    className="min-h-tap shrink-0 rounded-lg border border-danger px-3 text-sm text-danger disabled:opacity-50"
                  >
                    {voidingId === payment.id ? "取消中…" : "取り消す"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingId(null)}
                    className="min-h-tap shrink-0 px-2 text-sm text-ink-muted"
                  >
                    やめる
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setConfirmingId(payment.id);
                  }}
                  className="mt-1 min-h-tap text-sm text-ink-muted"
                >
                  会計を取り消す
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="px-4 pb-2 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
