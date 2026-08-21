"use client";

import { useEffect, useState } from "react";

import { formatYen, taxBreakdown, TAX_RATE } from "@/lib/format";

import type { SettleLine } from "./settle-sheet";

type Props = {
  lines: SettleLine[];
  total: number;
  onClose: () => void;
};

/** よく出す金額。お札で受け取ることがほとんどなので、1 タップで入る形にする。 */
const QUICK_AMOUNTS = [1000, 2000, 3000, 5000, 10000] as const;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0"] as const;

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
  const [changeMode, setChangeMode] = useState(false);
  const [digits, setDigits] = useState("");

  useEffect(() => {
    const query = window.matchMedia("(orientation: landscape)");
    const update = () => setLandscape(query.matches);

    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const received = Number(digits || "0");
  const change = received - total;
  const rotated = !landscape;

  function push(key: string) {
    const next = (digits + key).replace(/^0+(?=\d)/, "");
    if (next.length <= 7) setDigits(next);
  }

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
        className="flex flex-col px-8 py-5"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm tracking-widest text-accent">gilda</p>
            <p className="mt-0.5 text-lg text-ink-muted">お会計</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setChangeMode((prev) => !prev);
                setDigits("");
              }}
              className={`rounded-lg border px-4 py-2 text-sm ${
                changeMode ? "border-accent text-accent" : "border-line text-ink-muted"
              }`}
            >
              {changeMode ? "明細に戻る" : "お釣り計算"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line px-4 py-2 text-sm text-ink-muted"
            >
              閉じる
            </button>
          </div>
        </div>

        <div className="mt-3 flex min-h-0 flex-1 items-stretch gap-8">
          <div className="min-w-0 flex-1">
            {changeMode ? (
              <div className="flex h-full flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDigits(String(total))}
                    className="min-h-11 flex-1 rounded-lg border border-line bg-raised text-sm"
                  >
                    ちょうど
                  </button>
                  {QUICK_AMOUNTS.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setDigits(String(amount))}
                      className="min-h-11 flex-1 rounded-lg border border-line bg-raised text-sm tabular-nums"
                    >
                      {amount.toLocaleString("ja-JP")}
                    </button>
                  ))}
                </div>

                <div className="grid min-h-0 flex-1 grid-cols-6 gap-2">
                  {KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => push(key)}
                      className="rounded-lg border border-line bg-raised text-xl font-bold tabular-nums active:bg-surface"
                    >
                      {key}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDigits((prev) => prev.slice(0, -1))}
                    aria-label="1文字消す"
                    className="rounded-lg border border-line bg-raised text-xl active:bg-surface"
                  >
                    ⌫
                  </button>
                </div>
              </div>
            ) : (
              <ul className="max-h-full overflow-y-auto pr-2">
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
            )}
          </div>

          <div className="flex shrink-0 flex-col justify-center text-right">
            {changeMode ? (
              <>
                <div className="flex items-baseline justify-between gap-6">
                  <span className="text-sm text-ink-muted">合計</span>
                  <span className="text-2xl font-bold tabular-nums">{formatYen(total)}</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-6">
                  <span className="text-sm text-ink-muted">お預かり</span>
                  <span className="text-2xl font-bold tabular-nums">{formatYen(received)}</span>
                </div>

                <div className="mt-3 border-t border-line pt-3">
                  {received === 0 ? (
                    <p className="text-base text-ink-muted">お預かり金額を入力してください</p>
                  ) : change < 0 ? (
                    <>
                      <p className="text-base text-danger">不足</p>
                      <p className="text-[clamp(2.5rem,11vh,5rem)] leading-none font-bold tabular-nums text-danger">
                        {formatYen(-change)}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-base text-ink-muted">お釣り</p>
                      <p className="text-[clamp(2.5rem,11vh,5rem)] leading-none font-bold tabular-nums text-accent">
                        {formatYen(change)}
                      </p>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-base text-ink-muted">合計</p>
                <p className="text-[clamp(3rem,14vh,7rem)] leading-none font-bold tabular-nums text-accent">
                  {formatYen(total)}
                </p>
                <p className="mt-2 text-sm text-ink-muted">
                  税込（内 消費税{Math.round(TAX_RATE * 100)}% {formatYen(taxBreakdown(total).tax)}）
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
