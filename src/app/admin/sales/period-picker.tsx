"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { presetRange, type Period, type PresetKey } from "@/lib/sales";

const PRESETS: { key: Exclude<PresetKey, "custom">; label: string }[] = [
  { key: "this-month", label: "今月" },
  { key: "last-month", label: "先月" },
  { key: "last-30", label: "直近30日" },
];

/**
 * 期間は URL の searchParams に持たせる。リロードやブックマークで再現できるようにするため。
 * 日付の入力欄は URL が変わっても初期値のまま残るので、呼び出し側で period ごとに key を変えて作り直す。
 */
export function PeriodPicker({ period }: { period: Period }) {
  const router = useRouter();
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  const [pending, startTransition] = useTransition();

  const unchanged = from === period.from && to === period.to;
  const invalid = !from || !to || from > to;

  // 集計の再取得には少し時間がかかるので、押した時点で入力欄とボタンの見た目を先に変える
  function show(nextFrom: string, nextTo: string) {
    setFrom(nextFrom);
    setTo(nextTo);
    startTransition(() => router.push(`/admin/sales?from=${nextFrom}&to=${nextTo}`));
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex items-center gap-2">
        {PRESETS.map((preset) => {
          const range = presetRange(preset.key);
          const active = range.from === from && range.to === to;
          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => show(range.from, range.to)}
              disabled={pending}
              className={`rounded-full border px-3 py-1 text-sm select-none ${
                active
                  ? "border-accent bg-accent font-bold text-accent-ink"
                  : "border-line text-ink-muted hover:border-accent hover:text-ink"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">開始</span>
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="h-9 rounded-lg border border-line bg-raised px-2 outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">終了</span>
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="h-9 rounded-lg border border-line bg-raised px-2 outline-none focus:border-accent"
          />
        </label>
        <button
          type="button"
          onClick={() => show(from, to)}
          disabled={pending || unchanged || invalid}
          title={unchanged ? "いま表示している期間です" : invalid ? "開始日は終了日以前にしてください" : undefined}
          className="h-9 rounded-lg border border-accent px-3 text-sm font-bold text-accent select-none hover:bg-accent hover:text-accent-ink active:opacity-70 disabled:border-line disabled:font-normal disabled:text-ink-muted disabled:hover:bg-transparent"
        >
          {pending ? "表示中…" : "この期間で表示"}
        </button>
      </div>
    </div>
  );
}
