/**
 * 営業日の日付。DB の current_business_date() と同じ規則で計算する。
 *
 * 営業は 24 時を越えることがあるため、朝 6 時を営業日の切り替わりとする。
 * 単純な「JST の今日」を使うと、0:30 に営業を開いたときに翌日扱いになってしまう。
 *
 * これは表示ラベル用。実際に保存される値は DB の default が決めるので、
 * 両者の規則がずれないよう変更するときは必ず両方直す。
 */
const CUTOFF_HOURS = 6;

export function currentBusinessDate(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() - CUTOFF_HOURS * 60 * 60 * 1000);
  // sv-SE ロケールは YYYY-MM-DD 形式で返る
  return shifted.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}
