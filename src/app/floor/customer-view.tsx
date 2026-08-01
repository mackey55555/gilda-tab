"use client";

import { useEffect, useState } from "react";

import { formatYen, taxBreakdown, TAX_RATE } from "@/lib/format";

import type { SettleLine } from "./settle-sheet";

type Props = {
  lines: SettleLine[];
  total: number;
  onClose: () => void;
};

/**
 * お客様に金額を見せるための表示。
 *
 * こちらで設定した客名は出さない。仮名や打ち間違いをお客様に見せると気まずいため。
 *
 * 端末を横に倒して渡す前提だが、スマホは回転ロックしていることが多く
 * 端末の向きに任せると縦のままになる。そこで縦向きのときは中身を 90 度回して
 * 常に横長で出す。すでに横向きなら二重に回さない。
 */
export function CustomerView({ lines, total, onClose }: Props) {
  const [landscape, setLandscape] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(orientation: landscape)");
    const update = () => setLandscape(query.matches);

    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const rotated = !landscape;

  return (
    <div className="fixed inset-0 z-40 overflow-hidden bg-canvas">
      <div
        style={
          rotated
            ? {
                // 縦画面の中で横長の領域を作って 90 度回す
                width: "100dvh",
                height: "100dvw",
                transform: "rotate(90deg) translateY(-100%)",
                transformOrigin: "top left",
              }
            : { width: "100%", height: "100%" }
        }
        className="flex flex-col px-8 py-6"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm tracking-widest text-accent">gilda</p>
            <p className="mt-0.5 text-lg text-ink-muted">お会計</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 text-sm text-ink-muted"
          >
            閉じる
          </button>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 items-center gap-8">
          <ul className="max-h-full min-w-0 flex-1 overflow-y-auto pr-2">
            {lines.map((line) => (
              <li
                key={line.key}
                className="flex items-baseline justify-between gap-4 border-b border-line/60 py-1.5"
              >
                <span className="min-w-0 truncate text-lg">
                  {line.label}
                  {line.detail && (
                    <span className="ml-2 text-sm text-ink-muted">{line.detail}</span>
                  )}
                </span>
                <span className="shrink-0 text-lg tabular-nums">{formatYen(line.amount)}</span>
              </li>
            ))}
          </ul>

          <div className="shrink-0 text-right">
            <p className="text-base text-ink-muted">合計</p>
            <p className="text-[clamp(3rem,14vh,7rem)] leading-none font-bold tabular-nums text-accent">
              {formatYen(total)}
            </p>
            <p className="mt-2 text-sm text-ink-muted">
              税込（内 消費税{Math.round(TAX_RATE * 100)}% {formatYen(taxBreakdown(total).tax)}）
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
