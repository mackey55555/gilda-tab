import { currentBusinessDate } from "./business-date";

export type PresetKey = "this-month" | "last-month" | "last-30" | "custom";

export type Period = { from: string; to: string; preset: PresetKey };

/** YYYY-MM-DD の日付計算。タイムゾーンのずれを避けるため UTC で扱う。 */
function shift(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function monthEnd(date: string): string {
  const base = new Date(`${monthStart(date)}T00:00:00Z`);
  base.setUTCMonth(base.getUTCMonth() + 1);
  base.setUTCDate(0);
  return base.toISOString().slice(0, 10);
}

export function presetRange(preset: Exclude<PresetKey, "custom">, today = currentBusinessDate()) {
  switch (preset) {
    case "this-month":
      return { from: monthStart(today), to: today };
    case "last-month": {
      const lastMonthDay = shift(monthStart(today), -1);
      return { from: monthStart(lastMonthDay), to: monthEnd(lastMonthDay) };
    }
    case "last-30":
      return { from: shift(today, -29), to: today };
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * URL の searchParams から期間を決める。
 * リロードやブックマークで同じ集計を再現できるよう、状態は URL に持たせる。
 */
export function resolvePeriod(
  params: { from?: string; to?: string },
  today = currentBusinessDate(),
): Period {
  const fallback = presetRange("last-30", today);

  const from = params.from && DATE_PATTERN.test(params.from) ? params.from : fallback.from;
  const to = params.to && DATE_PATTERN.test(params.to) ? params.to : fallback.to;

  // 逆順に指定されていたら入れ替える
  const [start, end] = from <= to ? [from, to] : [to, from];

  const preset: PresetKey =
    (["this-month", "last-month", "last-30"] as const).find((key) => {
      const range = presetRange(key, today);
      return range.from === start && range.to === end;
    }) ?? "custom";

  return { from: start, to: end, preset };
}

/** 20〜29 時台の表示ラベル。24 時以降は営業の流れ通りに 24/25… と出す。 */
export function hourLabel(hour: number): string {
  return `${hour}時`;
}
