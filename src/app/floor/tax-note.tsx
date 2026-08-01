import { formatYen, taxBreakdown, TAX_RATE } from "@/lib/format";

/**
 * 領収書に外税で書くときの内訳。
 * 価格は全て税込なので、手書きの領収書に「本体 / 消費税」を書く場面のために逆算して出す。
 */
export function TaxNote({ total, className }: { total: number; className?: string }) {
  const { net, tax } = taxBreakdown(total);

  return (
    <p className={`text-xs text-ink-muted tabular-nums ${className ?? ""}`}>
      領収書用: 税抜 {formatYen(net)} ／ 消費税{Math.round(TAX_RATE * 100)}% {formatYen(tax)}
    </p>
  );
}
