"use client";

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
export function OpenDayPanel({ staffName }: { staffName: string }) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
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
      </div>
    </main>
  );
}
