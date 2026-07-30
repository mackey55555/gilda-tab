/** 円表記。値引き明細があるため負値も扱う。 */
export function formatYen(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}¥${Math.abs(amount).toLocaleString("ja-JP")}`;
}

/** 客名。未入力の伝票は営業日ごとの連番から「客1」「客2」を作る。 */
export function guestLabel(guestName: string | null, seq: number): string {
  const trimmed = guestName?.trim();
  return trimmed ? trimmed : `客${seq}`;
}

/**
 * 最終注文からの経過時間。
 * now を引数で受けるのは、一定間隔での再描画とテストのため。
 */
export function formatElapsed(iso: string | null, now: number): string {
  if (!iso) return "注文なし";

  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}時間前` : `${hours}時間${rest}分前`;
}

/** 営業日の日付表示（例: 7/30(木)） */
export function formatBusinessDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][
    new Date(year, month - 1, day).getDay()
  ];
  return `${month}/${day}(${weekday})`;
}
