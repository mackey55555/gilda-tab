"use client";

import { useState } from "react";

import { formatCompactYen, formatYen } from "@/lib/format";

export type Bar = { key: string; label: string; value: number; sublabel?: string };

type Props = {
  bars: Bar[];
  /** ラベルを間引く間隔。日別のように本数が多いときに使う。 */
  labelEvery?: number;
  emptyMessage?: string;
};

const PLOT_HEIGHT = 180;
const TOP_PAD = 16;
const AXIS_WIDTH = 48;
const LABEL_HEIGHT = 28;
const BAR_WIDTH = 26;
const BAR_GAP = 10;
const TICK_COUNT = 4;

/**
 * 棒グラフ。ホバー（タップ）で数値を出し、目盛り線付きの縦軸を描く。
 *
 * ライブラリを入れずに自前で描いているのは、必要なのがこの形の 2 枚だけで、
 * ダークテーマに合わせた見た目も自分で決めたいため。依存を増やす理由が薄い。
 */
export function BarChart({ bars, labelEvery = 1, emptyMessage = "データがありません" }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (bars.length === 0) {
    return <p className="py-10 text-center text-sm text-ink-muted">{emptyMessage}</p>;
  }

  const rawMax = Math.max(0, ...bars.map((bar) => bar.value));
  const rawMin = Math.min(0, ...bars.map((bar) => bar.value));
  // 上端ではなく刻み幅を切りのいい値にする。上端を丸めると 1.25万 のような目盛りが出てしまう。
  const step = niceStep(Math.max(rawMax, -rawMin) / TICK_COUNT);
  const max = Math.ceil(rawMax / step) * step;
  const min = rawMin === 0 ? 0 : -Math.ceil(-rawMin / step) * step;
  const span = max - min || 1;

  const chartWidth = AXIS_WIDTH + bars.length * (BAR_WIDTH + BAR_GAP) + BAR_GAP;
  const totalHeight = TOP_PAD + PLOT_HEIGHT + LABEL_HEIGHT;
  const yOf = (value: number) => TOP_PAD + ((max - value) / span) * PLOT_HEIGHT;
  const zeroY = yOf(0);

  const ticks = buildTicks(min, max, step);
  const active = activeIndex === null ? null : bars[activeIndex];
  const activeX = activeIndex === null ? 0 : AXIS_WIDTH + BAR_GAP + activeIndex * (BAR_WIDTH + BAR_GAP);
  // 値ラベルが重ならない本数のときだけ棒の上に直接出す
  const showInlineValues = bars.length <= 12;

  return (
    <div className="relative overflow-x-auto">
      <svg
        width={chartWidth}
        height={totalHeight}
        viewBox={`0 0 ${chartWidth} ${totalHeight}`}
        className="max-w-none"
        role="img"
        aria-label="棒グラフ"
        onPointerLeave={() => setActiveIndex(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={AXIS_WIDTH}
              y1={yOf(tick)}
              x2={chartWidth}
              y2={yOf(tick)}
              stroke="currentColor"
              strokeWidth={1}
              className={tick === 0 ? "text-line" : "text-line/50"}
            />
            <text
              x={AXIS_WIDTH - 8}
              y={yOf(tick) + 4}
              textAnchor="end"
              className="fill-current text-[10px] text-ink-muted"
            >
              {formatCompactYen(tick)}
            </text>
          </g>
        ))}

        {bars.map((bar, index) => {
          const x = AXIS_WIDTH + BAR_GAP + index * (BAR_WIDTH + BAR_GAP);
          const barTop = bar.value >= 0 ? yOf(bar.value) : zeroY;
          const height = Math.max(Math.abs(yOf(bar.value) - zeroY), bar.value === 0 ? 0 : 2);
          const isActive = activeIndex === index;

          return (
            <g
              key={bar.key}
              onPointerEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex(null)}
              tabIndex={0}
              className="outline-none"
            >
              {/* ホバー判定を広げるための透明な帯 */}
              <rect
                x={x - BAR_GAP / 2}
                y={TOP_PAD}
                width={BAR_WIDTH + BAR_GAP}
                height={PLOT_HEIGHT}
                className={isActive ? "fill-raised/60" : "fill-transparent"}
              />
              <rect
                x={x}
                y={barTop}
                width={BAR_WIDTH}
                height={height}
                rx={2}
                className={bar.value < 0 ? "fill-danger" : isActive ? "fill-accent" : "fill-accent/80"}
              />
              {showInlineValues && bar.value !== 0 && (
                <text
                  x={x + BAR_WIDTH / 2}
                  y={bar.value >= 0 ? barTop - 4 : barTop + height + 11}
                  textAnchor="middle"
                  className="fill-current text-[10px] text-ink-muted"
                >
                  {formatCompactYen(bar.value)}
                </text>
              )}
              <text
                x={x + BAR_WIDTH / 2}
                y={TOP_PAD + PLOT_HEIGHT + 18}
                textAnchor="middle"
                className={`fill-current text-[10px] ${isActive ? "text-ink" : "text-ink-muted"}`}
              >
                {index % labelEvery === 0 || isActive ? bar.label : ""}
              </text>
            </g>
          );
        })}
      </svg>

      {active && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-line bg-raised px-2 py-1 text-xs whitespace-nowrap shadow-lg shadow-black/40"
          style={{ left: activeX + BAR_WIDTH / 2 }}
        >
          <span className="text-ink-muted">{active.label}</span>
          <span className="ml-2 font-bold tabular-nums">{formatYen(active.value)}</span>
          {active.sublabel && (
            <span className="ml-2 text-ink-muted">{active.sublabel}</span>
          )}
        </div>
      )}
    </div>
  );
}

/** 目盛りの刻み幅を 1 / 2 / 2.5 / 5 × 10^n のいずれかに揃える */
function niceStep(value: number): number {
  if (value <= 0) return 1;

  const unit = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / unit;
  const stepped = [1, 2, 2.5, 5, 10].find((candidate) => normalized <= candidate) ?? 10;

  return stepped * unit;
}

function buildTicks(min: number, max: number, step: number): number[] {
  const ticks: number[] = [];
  for (let value = min; value <= max + step / 2; value += step) {
    ticks.push(Math.round(value));
  }
  return ticks;
}
