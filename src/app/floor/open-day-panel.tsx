"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { currentBusinessDate } from "@/lib/business-date";
import { formatBusinessDate } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

import { SignOutButton } from "./sign-out-button";

/**
 * open な営業日が無いときの画面。
 * 営業開始は PC を開かずスマホから行えないと現場が止まるので、/floor に置いている。
 */
type Props = {
  staffName: string;
  isAdmin: boolean;
  /** 直近のクローズ済み営業日。管理者のときだけ渡され、誤クローズからの復帰に使う。 */
  reopenTarget: { id: string; date: string } | null;
};

export function OpenDayPanel({ staffName, isAdmin, reopenTarget }: Props) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 実際に保存される日付は DB の current_business_date() が決める。表示を合わせるため同じ規則で計算する。
  const today = formatBusinessDate(currentBusinessDate());

  async function openBusinessDay() {
    setOpening(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const { error: insertError } = await supabase.from("business_days").insert({});

    if (insertError) {
      setOpening(false);
      setError(
        insertError.code === "23505"
          ? "この日付の営業日はすでに登録されています。画面を再読み込みしてください。"
          : "営業を開始できませんでした。通信状況を確認して再試行してください。",
      );
      return;
    }

    router.refresh();
  }

  /** 管理者のみ。クローズ済み営業日の更新は RLS でも admin に限定されている。 */
  async function reopenBusinessDay() {
    if (!reopenTarget) return;

    setReopening(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const { data, error: updateError } = await supabase
      .from("business_days")
      .update({ status: "open", closed_at: null })
      .eq("id", reopenTarget.id)
      .select("id");

    if (updateError || (data?.length ?? 0) === 0) {
      setReopening(false);
      setError(
        updateError?.code === "23505"
          ? "他の端末で別の営業日が開かれています。画面を再読み込みしてください。"
          : "営業を再開できませんでした",
      );
      return;
    }

    router.refresh();
  }

  return (
    <main className="flex min-h-dvh flex-col px-5 pt-6 pb-safe">
      <header className="flex items-center justify-between">
        <span className="text-lg font-bold tracking-widest text-accent">gilda</span>
        <SignOutButton staffName={staffName} />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <div>
          <p className="text-sm text-ink-muted">営業日が開いていません</p>
          <p className="mt-1 text-2xl font-bold">{today}</p>
        </div>

        <button
          type="button"
          onClick={openBusinessDay}
          disabled={opening}
          className="min-h-14 w-full max-w-xs rounded-xl bg-accent px-6 text-lg font-bold text-accent-ink disabled:opacity-50"
        >
          {opening ? "開始中…" : "本日の営業を開始"}
        </button>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {reopenTarget && (
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => void reopenBusinessDay()}
              disabled={reopening || opening}
              className="min-h-tap rounded-lg border border-line px-4 text-sm text-ink-muted disabled:opacity-50"
            >
              {reopening
                ? "再開中…"
                : `${formatBusinessDate(reopenTarget.date)} の営業を再開`}
            </button>
            <span className="text-xs text-ink-muted">
              誤って終了したときに戻すためのものです（管理者のみ）
            </span>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="flex justify-start">
          <Link
            href="/admin/sales"
            className="flex min-h-14 items-center rounded-full border border-line bg-surface px-5 text-sm font-bold text-ink-muted"
          >
            管理画面
          </Link>
        </div>
      )}
    </main>
  );
}
