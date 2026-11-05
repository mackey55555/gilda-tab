"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { formatYen } from "@/lib/format";
import {
  formatReceiptDate,
  isFinalized,
  RECEIPT_PURPOSE,
  splitAddressee,
  type Receipt,
} from "@/lib/receipt";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = { token: string; receipt: Receipt };

/** DB 側の上限と同じ。超えると finalize_receipt が拒否する */
const ADDRESSEE_MAX = 40;

export function ReceiptView({ token, receipt }: Props) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [addressee, setAddressee] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const finalized = isFinalized(receipt);
  const pdfUrl = `/r/${token}/pdf`;
  const expiresLabel = new Date(receipt.expires_at).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  });

  // iOS Safari はタップから時間が空くと共有シートを開かせないため、PDF は先に読み込んでおく
  useEffect(() => {
    if (!finalized || typeof navigator.share !== "function") return;

    let cancelled = false;
    fetch(pdfUrl)
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (cancelled || !blob) return;
        setPdfFile(new File([blob], `receipt-${receipt.number}.pdf`, { type: "application/pdf" }));
      })
      .catch(() => {
        // 読み込めなくても URL の共有に切り替えるだけなので握りつぶす
      });

    return () => {
      cancelled = true;
    };
  }, [finalized, pdfUrl, receipt.number]);
  const preview = finalized ? receipt.addressee : addressee.trim() || "上様";
  const { name, honorific } = splitAddressee(preview);

  async function finalize() {
    setSubmitting(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const { error: rpcError } = await supabase.rpc("finalize_receipt", {
      receipt_token: token,
      addressee: addressee.trim(),
    });

    setSubmitting(false);

    if (rpcError) {
      setError(rpcError.message);
      setConfirming(false);
      // 別の端末で先に確定された場合などは、最新の内容を見せる
      startRefresh(() => router.refresh());
      return;
    }

    startRefresh(() => router.refresh());
  }

  /**
   * 共有シートで PDF そのものを渡せる端末（iOS / Android の主要ブラウザ）ではファイルを渡す。
   * リンクは 45 日で切れるので、メールに残すなら PDF の方が確実なため。
   * ファイル共有ができなければ URL を共有し、共有シート自体がなければメールアプリを開く。
   * navigator.share は secure context 限定だが、お客様が開くのは本番の https なので問題ない。
   */
  async function share() {
    setSharing(true);
    setError(null);

    const pageUrl = window.location.href;
    const title = `${receipt.issuer_name} 領収書`;

    try {
      if (typeof navigator.share === "function") {
        if (pdfFile && navigator.canShare?.({ files: [pdfFile] })) {
          await navigator.share({ title, files: [pdfFile] });
          return;
        }
        await navigator.share({ title, url: pageUrl });
        return;
      }

      const body = `${title}\n${pageUrl}\n\n※リンクの有効期限は ${expiresLabel} までです。`;
      window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    } catch (shareError) {
      // 共有シートを閉じただけのときは AbortError になる。失敗ではないので何も出さない
      if (!(shareError instanceof DOMException && shareError.name === "AbortError")) {
        setError("共有できませんでした。PDF をダウンロードしてお使いください。");
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* PDF と同じ並びのプレビュー。紙の領収書として見えるよう、ここだけ白地にする */}
      <section className="rounded-xl bg-white p-5 text-[#1a1a1a] shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xl font-bold tracking-[0.4em]">領収書</p>
          <div className="text-right text-xs text-[#6b6b6b]">
            <p>No. {receipt.number ?? "（発行時に採番）"}</p>
            <p>{formatReceiptDate(receipt.receipt_date)}</p>
          </div>
        </div>

        <p className="mt-5 flex items-end justify-between gap-2 border-b border-[#1a1a1a] pb-1">
          <span className="min-w-0 text-lg break-all">{name}</span>
          {honorific && <span className="shrink-0">{honorific}</span>}
        </p>

        <div className="mt-4 flex items-baseline justify-center gap-3 bg-[#f3f1ec] py-3">
          <span className="text-xs text-[#6b6b6b]">金額</span>
          <span className="text-3xl font-bold tabular-nums">{formatYen(receipt.amount)}-</span>
          <span className="text-xs text-[#6b6b6b]">（税込）</span>
        </div>

        <p className="mt-3 text-sm">
          <span className="mr-3 text-[#6b6b6b]">但し</span>
          {RECEIPT_PURPOSE}
        </p>

        <div className="mt-4 flex flex-col gap-3 text-xs">
          <div className="border-y border-[#cfcfcf] py-1.5 tabular-nums">
            <p className="flex justify-between">
              <span>10%対象</span>
              <span>{formatYen(receipt.amount)}</span>
            </p>
            <p className="flex justify-between text-[#6b6b6b]">
              <span>（内消費税）</span>
              <span>{formatYen(receipt.tax)}</span>
            </p>
          </div>
          <div className="text-right text-[#6b6b6b]">
            <p className="text-sm font-bold text-[#1a1a1a]">{receipt.issuer_name}</p>
            <p>{receipt.issuer_address}</p>
            <p>TEL {receipt.issuer_phone}</p>
            {receipt.registration_number && <p>登録番号 {receipt.registration_number}</p>}
          </div>
        </div>
      </section>

      {finalized ? (
        <section className="flex flex-col gap-3">
          <a
            href={pdfUrl}
            download={`receipt-${receipt.number}.pdf`}
            className="flex min-h-tap items-center justify-center rounded-xl bg-accent font-bold text-accent-ink"
          >
            PDF をダウンロード
          </a>
          <button
            type="button"
            onClick={() => void share()}
            disabled={sharing}
            className="min-h-tap rounded-xl border border-line text-ink disabled:opacity-50"
          >
            {sharing ? "準備中…" : "メールなどで送る"}
          </button>
          <p className="text-xs leading-relaxed text-ink-muted">
            このページは {expiresLabel} まで開けます。PDF を保存しておくと安心です。
          </p>
        </section>
      ) : confirming ? (
        <section className="flex flex-col gap-3 rounded-xl border border-accent p-4">
          <p className="text-sm">
            宛名「{name}
            {honorific && ` ${honorific}`}」で発行します。
            <br />
            <span className="text-ink-muted">発行後は宛名を変更できません。</span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void finalize()}
              disabled={submitting || refreshing}
              className="min-h-tap flex-1 rounded-xl bg-accent font-bold text-accent-ink disabled:opacity-50"
            >
              {submitting || refreshing ? "発行中…" : "発行する"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={submitting}
              className="min-h-tap rounded-xl border border-line px-5 text-ink-muted"
            >
              戻る
            </button>
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm">宛名</span>
            <input
              value={addressee}
              onChange={(event) => setAddressee(event.target.value)}
              maxLength={ADDRESSEE_MAX}
              placeholder="株式会社〇〇"
              autoComplete="organization"
              className="min-h-tap rounded-xl border border-line bg-raised px-3 text-base outline-none focus:border-accent"
            />
            <span className="text-xs text-ink-muted">
              空欄の場合は「上様」になります。「様」は自動で付きます。
            </span>
          </label>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setConfirming(true);
            }}
            className="min-h-tap rounded-xl bg-accent font-bold text-accent-ink"
          >
            この宛名で発行する
          </button>
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
