"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { presetRange, type Period, type PresetKey } from "@/lib/sales";

const PRESETS: { key: Exclude<PresetKey, "custom">; label: string }[] = [
  { key: "this-month", label: "今月" },
  { key: "last-month", label: "先月" },
  { key: "last-30", label: "直近30日" },
];

/** 期間は URL の searchParams に持たせる。リロードやブックマークで再現できるようにするため。 */
export function PeriodPicker({ period }: { period: Period }) {
  const router = useRouter();
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);

  function apply() {
    router.push(`/admin/sales?from=${from}&to=${to}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex items-center gap-2">
        {PRESETS.map((preset) => {
          const range = presetRange(preset.key);
          const active = period.preset === preset.key;
          return (
            <Link
              key={preset.key}
              href={`/admin/sales?from=${range.from}&to=${range.to}`}
              className={`rounded-full border px-3 py-1 text-sm ${
                active
                  ? "border-accent bg-accent font-bold text-accent-ink"
                  : "border-line text-ink-muted"
              }`}
            >
              {preset.label}
            </Link>
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
          onClick={apply}
          className="h-9 rounded-lg border border-line px-3 text-sm"
        >
          この期間で表示
        </button>
      </div>
    </div>
  );
}
