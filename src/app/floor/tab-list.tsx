"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { formatBusinessDate, formatYen, guestLabel } from "@/lib/format";
import { groupOrderItems } from "@/lib/order-groups";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  toPaymentSummary,
  toTabSummary,
  type Category,
  type PaymentSummary,
  type Product,
  type TabSummary,
} from "@/lib/types";

import { CloseDaySheet } from "./close-day-sheet";
import { PaidSection } from "./paid-section";
import { SettleSheet, type SettleLine } from "./settle-sheet";
import { SignOutButton } from "./sign-out-button";
import { TabCard } from "./tab-card";

/** 経過時間表示を更新する間隔 */
const ELAPSED_TICK_MS = 30_000;

type Props = {
  businessDayId: string;
  businessDate: string;
  staffName: string;
  staffId: string;
  isAdmin: boolean;
  products: Product[];
  categories: Category[];
  initialTabs: TabSummary[];
  initialPayments: PaymentSummary[];
};

export function TabList({
  businessDayId,
  businessDate,
  staffName,
  staffId,
  isAdmin,
  products,
  categories,
  initialTabs,
  initialPayments,
}: Props) {
  const router = useRouter();
  const [tabs, setTabs] = useState(initialTabs);
  const [payments, setPayments] = useState(initialPayments);
  const [now, setNow] = useState(() => Date.now());
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settleTargets, setSettleTargets] = useState<TabSummary[] | null>(null);
  const [settleLines, setSettleLines] = useState<SettleLine[]>([]);
  const [settling, setSettling] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  // useState の初期値はマウント時にしか使われないため、router.refresh() などで
  // サーバから新しい値が来ても反映されない。届いたらレンダー中に追随させる
  // （effect で setState すると余分なレンダーを挟むため、React 公式の
  //  「レンダー中に状態を調整する」パターンを使う）。
  const [lastServerTabs, setLastServerTabs] = useState(initialTabs);
  if (initialTabs !== lastServerTabs) {
    setLastServerTabs(initialTabs);
    setTabs(initialTabs);
  }

  const [lastServerPayments, setLastServerPayments] = useState(initialPayments);
  if (initialPayments !== lastServerPayments) {
    setLastServerPayments(initialPayments);
    setPayments(initialPayments);
  }

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();

    const [tabsResult, paymentsResult] = await Promise.all([
      supabase
        .from("tab_summaries")
        .select("*")
        .eq("business_day_id", businessDayId)
        .eq("status", "open")
        .order("created_at", { ascending: true }),
      supabase
        .from("payment_summaries")
        .select("*")
        .eq("business_day_id", businessDayId)
        .order("paid_at", { ascending: false }),
    ]);

    if (tabsResult.data) {
      setTabs(
        tabsResult.data.map(toTabSummary).filter((tab): tab is TabSummary => tab !== null),
      );
    }
    if (paymentsResult.data) {
      setPayments(
        paymentsResult.data
          .map(toPaymentSummary)
          .filter((payment): payment is PaymentSummary => payment !== null),
      );
    }
  }, [businessDayId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ELAPSED_TICK_MS);
    return () => clearInterval(timer);
  }, []);



  // 端末 2〜3 台での同時操作を前提に、伝票・明細・会計の変更を購読して作り直す
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`floor:${businessDayId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tabs" }, () => void refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => void refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => void refetch())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [businessDayId, refetch]);

  async function createTab() {
    setCreating(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const { data, error: insertError } = await supabase
      .from("tabs")
      .insert({ business_day_id: businessDayId })
      .select("id")
      .single();

    setCreating(false);

    if (insertError || !data) {
      setError("伝票を作成できませんでした。もう一度お試しください。");
      return;
    }

    // 画面遷移せず、そのまま開いて注文を入れられるようにする
    setExpandedId(data.id);
    await refetch();
  }

  /**
   * 会計シートを開く。単独会計のときは明細を引き直して内訳を出す。
   * お客様に見せる画面でも同じ内訳を使うため、名前と合計だけでは足りない。
   */
  async function openSettle(targets: TabSummary[]) {
    setSettleError(null);

    if (targets.length !== 1) {
      setSettleLines(
        targets.map((tab) => ({
          key: tab.id,
          label: guestLabel(tab.guestName, tab.seq),
          amount: tab.total,
        })),
      );
      setSettleTargets(targets);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from("order_items")
      .select("id, product_id, name_snapshot, price_snapshot, qty, created_at")
      .eq("tab_id", targets[0].id)
      .order("created_at", { ascending: true });

    setSettleLines(
      groupOrderItems(data ?? []).map((group) => ({
        key: group.key,
        label: group.name,
        amount: group.price * group.qty,
        detail: `${formatYen(group.price)} × ${group.qty}`,
      })),
    );
    setSettleTargets(targets);
  }

  async function settle(targets: TabSummary[]) {
    setSettling(true);
    setSettleError(null);

    const supabase = getSupabaseBrowserClient();
    // 合計はサーバ側で明細から再計算される
    const { data: paymentId, error: rpcError } = await supabase.rpc("settle_tabs", {
      tab_ids: targets.map((tab) => tab.id),
    });

    if (rpcError) {
      setSettling(false);
      setSettleError(rpcError.message);
      return;
    }

    const { data: payment } = await supabase
      .from("payments")
      .select("total")
      .eq("id", paymentId)
      .maybeSingle();

    setSettling(false);
    setSettleTargets(null);
    setExpandedId(null);
    exitSelecting();
    setNotice(payment ? `${formatYen(payment.total)} を会計しました` : "会計しました");
    await refetch();
  }

  async function closeBusinessDay() {
    setClosing(true);
    setCloseError(null);

    const supabase = getSupabaseBrowserClient();
    // status と closed_at は CHECK 制約で対になっているため、必ず両方入れる
    const { data, error: updateError } = await supabase
      .from("business_days")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("id", businessDayId)
      .select("id");

    if (updateError || (data?.length ?? 0) === 0) {
      setClosing(false);
      setCloseError("営業を終了できませんでした。通信状況を確認して再試行してください。");
      return;
    }

    router.refresh();
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelecting() {
    setSelecting(false);
    setSelected(new Set());
  }

  const selectedTabs = tabs.filter((tab) => selected.has(tab.id));
  const selectedTotal = selectedTabs.reduce((sum, tab) => sum + tab.total, 0);
  const openTotal = tabs.reduce((sum, tab) => sum + tab.total, 0);

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-canvas/95 px-5 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold tracking-widest text-accent">gilda</span>
            <span className="text-sm text-ink-muted">
              {formatBusinessDate(businessDate)} 営業中
            </span>
          </div>
          <SignOutButton staffName={staffName} />
        </div>

        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm text-ink-muted">
            {tabs.length}組 / 合計 {formatYen(openTotal)}
          </span>
          {selecting ? (
            <button type="button" onClick={exitSelecting} className="min-h-tap px-2 text-sm text-ink-muted">
              選択をやめる
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setExpandedId(null);
                setSelecting(true);
              }}
              disabled={tabs.length === 0}
              className="min-h-tap px-2 text-sm text-accent disabled:opacity-40"
            >
              まとめて会計
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-2 px-5 py-4">
        {tabs.length === 0 ? (
          <p className="mt-16 text-center text-sm text-ink-muted">
            伝票がありません
            <br />
            右下の「＋お客さん」から作成してください
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tabs.map((tab) => (
              <TabCard
                key={tab.id}
                tab={tab}
                now={now}
                staffId={staffId}
                products={products}
                categories={categories}
                expanded={expandedId === tab.id}
                selecting={selecting}
                selected={selected.has(tab.id)}
                onToggleExpand={(id) => setExpandedId((prev) => (prev === id ? null : id))}
                onToggleSelect={toggleSelected}
                onSettle={(target) => void openSettle([target])}
                onDeleted={() => void refetch()}
                onChanged={() => void refetch()}
              />
            ))}
          </ul>
        )}

        {!selecting && <PaidSection payments={payments} onVoided={() => void refetch()} />}

        {/* 1 晩に 1 回の操作なので、誤タップしないよう一覧の末尾に置く */}
        {!selecting && (
          <button
            type="button"
            onClick={() => {
              setCloseError(null);
              setCloseOpen(true);
            }}
            className="mt-6 min-h-tap self-center rounded-lg border border-line px-4 text-sm text-ink-muted"
          >
            本日の営業を終了
          </button>
        )}
      </div>

      {notice && (
        <p role="status" className="px-5 pb-2 text-center text-sm text-accent">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="px-5 pb-2 text-sm text-danger">
          {error}
        </p>
      )}

      {selecting ? (
        <div className="sticky bottom-0 border-t border-line bg-surface px-5 pt-3 pb-safe">
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-muted">{selectedTabs.length}枚を選択</span>
            <span className="text-2xl font-bold tabular-nums">{formatYen(selectedTotal)}</span>
          </div>
          <button
            type="button"
            onClick={() => void openSettle(selectedTabs)}
            disabled={selectedTabs.length === 0}
            className="mt-2 min-h-14 w-full rounded-xl bg-accent text-lg font-bold text-accent-ink disabled:opacity-40"
          >
            まとめて会計
          </button>
        </div>
      ) : (
        <div className="pointer-events-none sticky bottom-0 flex items-center justify-between px-5 pb-safe">
          {isAdmin ? (
            <Link
              href="/admin/sales"
              className="pointer-events-auto flex min-h-14 items-center rounded-full border border-line bg-surface px-5 text-sm font-bold text-ink-muted shadow-lg shadow-black/40"
            >
              管理画面
            </Link>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={createTab}
            disabled={creating}
            className="pointer-events-auto min-h-16 rounded-full bg-accent px-6 text-lg font-bold text-accent-ink shadow-lg shadow-black/40 disabled:opacity-60"
          >
            {creating ? "作成中…" : "＋お客さん"}
          </button>
        </div>
      )}

      {settleTargets && (
        <SettleSheet
          title={
            settleTargets.length === 1
              ? `${guestLabel(settleTargets[0].guestName, settleTargets[0].seq)} の会計`
              : `まとめて会計（${settleTargets.length}枚）`
          }
          lines={settleLines}
          total={settleLines.reduce((sum, line) => sum + line.amount, 0)}
          pending={settling}
          error={settleError}
          onConfirm={() => void settle(settleTargets)}
          onClose={() => setSettleTargets(null)}
        />
      )}

      {closeOpen && (
        <CloseDaySheet
          businessDate={businessDate}
          openTabs={tabs}
          payments={payments}
          pending={closing}
          error={closeError}
          onConfirm={() => void closeBusinessDay()}
          onClose={() => setCloseOpen(false)}
        />
      )}
    </main>
  );
}
