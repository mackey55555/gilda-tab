"use client";

import Link from "next/link";

import { formatElapsed, formatYen, guestLabel } from "@/lib/format";
import type { TabSummary } from "@/lib/types";

type Props = {
  tab: TabSummary;
  now: number;
  selecting: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
};

export function TabCard({ tab, now, selecting, selected, onToggle }: Props) {
  const body = (
    <>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-lg font-bold">
          {guestLabel(tab.guestName, tab.seq)}
        </span>
        <span className="text-xs text-ink-muted">
          {tab.itemCount === 0 ? "注文なし" : formatElapsed(tab.lastOrderedAt, now)}
        </span>
      </div>
      <span className="shrink-0 text-xl font-bold tabular-nums">
        {formatYen(tab.total)}
      </span>
    </>
  );

  const base =
    "flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border bg-surface px-4 py-3 text-left";

  if (selecting) {
    return (
      <button
        type="button"
        onClick={() => onToggle(tab.id)}
        aria-pressed={selected}
        className={`${base} ${selected ? "border-accent" : "border-line"}`}
      >
        <span
          aria-hidden
          className={`grid size-6 shrink-0 place-items-center rounded-md border text-sm ${
            selected ? "border-accent bg-accent text-accent-ink" : "border-line"
          }`}
        >
          {selected ? "✓" : ""}
        </span>
        {body}
      </button>
    );
  }

  return (
    <Link href={`/floor/${tab.id}`} className={`${base} border-line active:bg-raised`}>
      {body}
    </Link>
  );
}
