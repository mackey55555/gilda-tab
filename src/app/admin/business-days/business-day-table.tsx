"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { formatBusinessDate, formatYen } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type AdminBusinessDay = {
  id: string;
  date: string;
  status: string;
  opened_at: string;
  closed_at: string | null;
  total: number;
  tabCount: number;
};

export function BusinessDayTable({ initialDays }: { initialDays: AdminBusinessDay[] }) {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  const hasOpen = initialDays.some((day) => day.status === "open");

  const visible = useMemo(() => {
    const trimmed = keyword.trim();
    return trimmed === "" ? initialDays : initialDays.filter((day) => day.date.includes(trimmed));
  }, [initialDays, keyword]);

  function refresh() {
    startRefresh(() => router.refresh());
  }

  async function setStatus(day: AdminBusinessDay, close: boolean) {
    setBusyId(day.id);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    // status と closed_at は CHECK 制約で対になっているため、必ず両方入れる
    const { data, error: updateError } = await supabase
      .from("business_days")
      .update(
        close
          ? { status: "closed", closed_at: new Date().toISOString() }
          : { status: "open", closed_at: null },
      )
      .eq("id", day.id)
      .select("id");

    setBusyId(null);

    if (updateError || (data?.length ?? 0) === 0) {
      setError(
        updateError?.code === "23505"
          ? "同時に開ける営業日は 1 つだけです。先に開いている営業日を終了してください。"
          : close
            ? "営業日をクローズできませんでした"
            : "営業日を再開できませんでした",
      );
      return;
    }

    refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">営業日</h1>

      <p className="text-sm text-ink-muted">
        通常の開始・終了は営業画面（/floor）から行います。ここはクローズし忘れた営業日の後始末と、
        誤って終了した営業日の再開のためのものです。同時に開ける営業日は 1 つだけです。
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="日付で検索（2026-07 など）"
          className="h-9 w-64 rounded-lg border border-line bg-raised px-3 outline-none focus:border-accent"
        />
        <span className="text-xs text-ink-muted">
          {visible.length} / {initialDays.length} 日
        </span>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <table className="w-full border-separate border-spacing-y-1 text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-muted">
            <th className="px-3 py-1 font-normal">営業日</th>
            <th className="w-20 px-3 py-1 font-normal">状態</th>
            <th className="w-24 px-3 py-1 font-normal">開店</th>
            <th className="w-24 px-3 py-1 font-normal">閉店</th>
            <th className="w-20 px-3 py-1 text-right font-normal">伝票</th>
            <th className="w-32 px-3 py-1 text-right font-normal">売上</th>
            <th className="w-44 px-3 py-1 font-normal">操作</th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-ink-muted">
                営業日がありません
              </td>
            </tr>
          )}

          {visible.map((day) => {
            const open = day.status === "open";
            const busy = busyId === day.id || refreshing;

            return (
              <tr key={day.id}>
                <td className="rounded-l-lg bg-surface px-3 py-2">
                  <Link
                    href={`/admin/sales/${day.id}`}
                    className="font-bold underline-offset-4 hover:underline"
                  >
                    {formatBusinessDate(day.date)}
                  </Link>
                </td>
                <td className="bg-surface px-3 py-2">
                  <span className={open ? "text-accent" : "text-ink-muted"}>
                    {open ? "営業中" : "クローズ"}
                  </span>
                </td>
                <td className="bg-surface px-3 py-2 text-ink-muted tabular-nums">
                  {formatTime(day.opened_at)}
                </td>
                <td className="bg-surface px-3 py-2 text-ink-muted tabular-nums">
                  {formatTime(day.closed_at)}
                </td>
                <td className="bg-surface px-3 py-2 text-right tabular-nums">{day.tabCount}</td>
                <td className="bg-surface px-3 py-2 text-right font-bold tabular-nums">
                  {formatYen(day.total)}
                </td>
                <td className="rounded-r-lg bg-surface px-3 py-2">
                  {open ? (
                    <button
                      type="button"
                      onClick={() => void setStatus(day, true)}
                      disabled={busy}
                      className="rounded border border-line px-2 py-1 text-xs text-ink-muted disabled:opacity-40"
                    >
                      クローズする
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void setStatus(day, false)}
                      disabled={busy || hasOpen}
                      title={hasOpen ? "他に営業中の日があるため再開できません" : undefined}
                      className="rounded border border-line px-2 py-1 text-xs text-ink-muted disabled:opacity-40"
                    >
                      再開する
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  });
}
