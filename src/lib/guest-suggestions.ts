/**
 * 過去に使った客名の候補。
 *
 * 常連の名前を毎回入力し直すのは手間なので、入力欄に候補を出す。
 * 専用のテーブルは作らず tabs.guest_name をそのまま集計する
 * （週 3 営業・1 晩数組の規模なら、全件読んでも数十 KB に収まる）。
 */
export type GuestSuggestion = { name: string; count: number };

/** 候補として保持する上限。多すぎても選べないので絞る。 */
const MAX_SUGGESTIONS = 60;

/**
 * 新しい順に並んだ行から、よく使う順の候補を作る。
 * 同じ回数なら直近に使ったものを優先する（rows が新しい順である前提）。
 */
export function buildGuestSuggestions(
  rows: { guest_name: string | null }[],
  limit = MAX_SUGGESTIONS,
): GuestSuggestion[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const name = row.guest_name?.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  // Map は挿入順（= 直近に使った順）を保つので、回数が同じなら先に入ったものが残る
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** 入力途中の文字で候補を絞る。前方一致を優先し、その後に部分一致を並べる。 */
export function filterGuestSuggestions(
  suggestions: GuestSuggestion[],
  keyword: string,
  limit = 6,
): GuestSuggestion[] {
  const trimmed = keyword.trim();
  if (trimmed === "") return suggestions.slice(0, limit);

  const startsWith = suggestions.filter((s) => s.name.startsWith(trimmed));
  const includes = suggestions.filter(
    (s) => !s.name.startsWith(trimmed) && s.name.includes(trimmed),
  );

  return [...startsWith, ...includes].slice(0, limit);
}
