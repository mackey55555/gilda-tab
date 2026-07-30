"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { formatBusinessDate, formatYen, guestLabel } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  toPaymentSummary,
  toTabSummary,
  type PaymentSummary,
  type TabSummary,
} from "@/lib/types";

import { PaidSection } from "./paid-section";
import { SettleSheet } from "./settle-sheet";
import { SignOutButton } from "./sign-out-button";
import { TabCard } from "./tab-card";

/** 経過時間表示を更新する間隔 */
const ELAPSED_TICK_MS = 30_000;

type Props = {
  businessDayId: string;
  businessDate: string;
  staffName: string;
  initialTabs: TabSummary[];
  initialPayments: PaymentSummary[];
};

export function TabList({
  businessDayId,
  businessDate,
  staffName,
  initialTabs,
  initialPayments,
}: Props) {
  const router = useRouter();
  const [tabs, setTabs] = useState(initialTabs);
  const [payments, setPayments] = useState(initialPayments);
  const [now, setNow] = useState(() => Date.now());
  const [creating, setCreating] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [settling, setSettling] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
        tabsResult.data
          .map(toTabSummary)
          .filter((tab): tab is TabSummary => tab !== null),
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

  // 端末 2〜3 台での同時操作を前提に、伝票と明細の変更を購読して一覧を作り直す。
  // 合計金額は集計値なので、差分パッチではなく都度取り直すほうが確実。
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`floor:${businessDayId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tabs" }, () => {
        void refetch();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => {
        void refetch();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {
        void refetch();
      })
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

    if (insertError || !data) {
      setCreating(false);
      setError("伝票を作成できませんでした。もう一度お試しください。");
      return;
    }

    // 名前は後入力でよいので、そのまま注文画面へ送る（＋お客さん → 商品タップで 2 タップ）
    router.push(`/floor/${data.id}`);
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

  async function settleSelected() {
    setSettling(true);
    setSettleError(null);

    const supabase = getSupabaseBrowserClient();
    // 合計はサーバ側で明細から再計算されるので、選択中に他端末が注文を足していても金額はずれない
    const { data: paymentId, error: rpcError } = await supabase.rpc("settle_tabs", {
      tab_ids: selectedTabs.map((tab) => tab.id),
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
    setSettleOpen(false);
    exitSelecting();
    setNotice(
      payment ? `${formatYen(payment.total)} を会計しました` : "会計しました",
    );
    await refetch();
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
            <button
              type="button"
              onClick={exitSelecting}
              className="min-h-tap px-2 text-sm text-ink-muted"
            >
              選択をやめる
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSelecting(true)}
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
          tabs.map((tab) => (
            <TabCard
              key={tab.id}
              tab={tab}
              now={now}
              selecting={selecting}
              selected={selected.has(tab.id)}
              onToggle={toggleSelected}
            />
          ))
        )}

        {!selecting && <PaidSection payments={payments} onVoided={() => void refetch()} />}
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
            <span className="text-2xl font-bold tabular-nums">
              {formatYen(selectedTotal)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setSettleError(null);
              setSettleOpen(true);
            }}
            disabled={selectedTabs.length === 0}
            className="mt-2 min-h-14 w-full rounded-xl bg-accent text-lg font-bold text-accent-ink disabled:opacity-40"
          >
            まとめて会計
          </button>
          {selectedTabs.length === 0 && (
            <p className="mt-1 text-center text-xs text-ink-muted">
              会計する伝票を選んでください
            </p>
          )}
        </div>
      ) : (
        <div className="pointer-events-none sticky bottom-0 flex justify-end px-5 pb-safe">
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

      {settleOpen && (
        <SettleSheet
          title={`まとめて会計（${selectedTabs.length}枚）`}
          lines={selectedTabs.map((tab) => ({
            key: tab.id,
            label: guestLabel(tab.guestName, tab.seq),
            amount: tab.total,
          }))}
          total={selectedTotal}
          pending={settling}
          error={settleError}
          onConfirm={() => void settleSelected()}
          onClose={() => setSettleOpen(false)}
        />
      )}
    </main>
  );
}
