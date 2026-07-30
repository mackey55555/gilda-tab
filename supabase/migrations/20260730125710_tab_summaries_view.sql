-- 伝票一覧用のサマリビュー。
-- 一覧カードに必要な「現在合計」「明細件数」「最終注文時刻」を 1 クエリで取得するために用意する
-- （明細は追記型なので、クライアント側で伝票ごとに集計すると N+1 になる）。
--
-- security_invoker = true が要点。ビューの所有者ではなく呼び出したユーザーの権限で
-- 参照元テーブルを読むため、tabs / order_items に定義した RLS がそのまま効く。

create view public.tab_summaries with (security_invoker = true) as
  select
    t.id,
    t.business_day_id,
    t.seq,
    t.guest_name,
    t.status,
    t.payment_id,
    t.created_at,
    coalesce(sum(oi.price_snapshot * oi.qty), 0)::integer as total,
    count(oi.id)::integer                                as item_count,
    max(oi.created_at)                                   as last_ordered_at
  from public.tabs t
  left join public.order_items oi on oi.tab_id = t.id
  group by t.id;

comment on view public.tab_summaries is '伝票 + 合計金額 + 明細件数 + 最終注文時刻。RLS は参照元テーブルのものが適用される（security_invoker）。';

grant select on public.tab_summaries to authenticated;
