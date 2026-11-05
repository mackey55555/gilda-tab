"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { formatYen } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = {
  paymentId: string;
  total: number;
  onClose: () => void;
};

type Ready = {
  qrSrc: string;
  expiresAt: string;
  /** お客様が既に宛名を確定していれば番号と宛名が入る */
  number: string | null;
  addressee: string | null;
};

/**
 * 領収書ページの QR を全画面で出す。お客様が自分のスマホで読み取って受け取る。
 *
 * QR は正方形で読み取りの向きを問わないので、お客様向け表示のような 90 度回転はしない。
 * 暗い背景のままだと読めないカメラがあるため、QR は白い台紙に載せる。
 */
export function ReceiptQr({ paymentId, total, onClose }: Props) {
  const [ready, setReady] = useState<Ready | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function issue() {
      const supabase = getSupabaseBrowserClient();

      // 何度押しても同じトークンが返り、期限だけ延びる（先に読んだお客様のリンクを無駄にしない）
      const { data: token, error: issueError } = await supabase.rpc("issue_receipt", {
        target_payment_id: paymentId,
      });
      if (issueError || !token) {
        if (!cancelled) setError(issueError?.message ?? "領収書を発行できませんでした");
        return;
      }

      const [{ data: receipt }, qrSvg] = await Promise.all([
        supabase
          .from("receipts")
          .select("expires_at, number, addressee")
          .eq("payment_id", paymentId)
          .single(),
        // 本番では Vercel のドメイン、実機確認では LAN の IP になる。どちらもお客様の端末から開ける
        QRCode.toString(`${window.location.origin}/r/${token}`, {
          type: "svg",
          errorCorrectionLevel: "M",
          margin: 1,
        }),
      ]);

      if (cancelled) return;
      setReady({
        qrSrc: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`,
        expiresAt: receipt?.expires_at ?? "",
        number: receipt?.number ?? null,
        addressee: receipt?.addressee ?? null,
      });
    }

    void issue();
    return () => {
      cancelled = true;
    };
  }, [paymentId]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-canvas px-6 py-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm tracking-widest text-accent">gilda</p>
          <p className="mt-0.5 text-lg text-ink-muted">領収書</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-tap rounded-lg border border-line px-4 text-sm text-ink-muted"
        >
          閉じる
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-5">
        <p className="text-3xl font-bold tabular-nums">{formatYen(total)}</p>

        {error ? (
          <p role="alert" className="text-center text-sm text-danger">
            {error}
          </p>
        ) : ready ? (
          <>
            <div className="rounded-2xl bg-white p-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URI の SVG なので next/image の最適化対象外 */}
              <img src={ready.qrSrc} alt="領収書ページの QR コード" className="size-[min(70vw,18rem)]" />
            </div>
            <div className="text-center text-sm text-ink-muted">
              <p>スマートフォンのカメラで読み取ってください</p>
              <p className="mt-1">
                宛名を入力して PDF で保存できます
                {ready.expiresAt && (
                  <>
                    （
                    {new Date(ready.expiresAt).toLocaleDateString("ja-JP", {
                      timeZone: "Asia/Tokyo",
                      month: "numeric",
                      day: "numeric",
                    })}
                    まで）
                  </>
                )}
              </p>
            </div>
            {ready.number && (
              <p className="rounded-lg border border-line px-3 py-2 text-xs text-ink-muted">
                発行済み No.{ready.number}（{ready.addressee}）
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-ink-muted">準備中…</p>
        )}
      </div>
    </div>
  );
}
