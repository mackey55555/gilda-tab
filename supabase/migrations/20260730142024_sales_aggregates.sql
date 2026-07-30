-- 売上集計。
--
-- 集計は必ず order_items を起点にする。payments.total は使わない。
-- まとめ会計だと 1 会計に複数伝票がぶら下がるため、会計単位では商品も時間も分解できず、
-- spec の「集計は会計のまとめ方に依存しない」を満たせない。
--
-- 日付は business_days.date（朝 6 時カットオフ済み）を正とし、時刻からは導出しない。
-- 値引きは price_snapshot が負の明細なので、単純に合計すれば差し引かれる。
--
-- いずれも security definer + 先頭の is_admin() チェック。
-- search_path は既存関数に合わせて '' で固定し、名前は全て schema 修飾する。

-- ---------------------------------------------------------------------------
-- 日別売上
-- ---------------------------------------------------------------------------
create function public.sales_by_day(from_date date, to_date date)
returns table (
  business_day_id uuid,
  business_date   date,
  status          text,
  total           integer,
  tab_count       integer,
  item_count      integer,
  avg_per_tab     integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '集計を参照する権限がありません';
  end if;

  return query
    select
      d.id,
      d.date,
      d.status,
      coalesce(sum(oi.price_snapshot * oi.qty), 0)::integer,
      -- 空の伝票（誤作成など）は客数に数えない
      count(distinct oi.tab_id)::integer,
      count(oi.id)::integer,
      case
        when count(distinct oi.tab_id) = 0 then 0
        else round(
          coalesce(sum(oi.price_snapshot * oi.qty), 0)::numeric
          / count(distinct oi.tab_id)
        )::integer
      end
    from public.business_days d
    left join public.tabs t on t.business_day_id = d.id
    left join public.order_items oi on oi.tab_id = t.id
    where d.date between from_date and to_date
    group by d.id, d.date, d.status
    order by d.date;
end;
$$;

comment on function public.sales_by_day(date, date) is
  '営業日ごとの売上・伝票数・明細数・客単価。客単価は売上 / 明細のある伝票数。';

-- ---------------------------------------------------------------------------
-- 商品別ランキング
-- ---------------------------------------------------------------------------
create function public.sales_by_product(from_date date, to_date date)
returns table (
  product_id uuid,
  name       text,
  category   text,
  qty        integer,
  total      integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '集計を参照する権限がありません';
  end if;

  return query
    select
      oi.product_id,
      -- マスタ未登録（都度入力）とマスタ削除済みは明細のスナップショット名でまとめる
      coalesce(p.name, oi.name_snapshot),
      p.category,
      sum(oi.qty)::integer,
      sum(oi.price_snapshot * oi.qty)::integer
    from public.order_items oi
    join public.tabs t          on t.id = oi.tab_id
    join public.business_days d on d.id = t.business_day_id
    left join public.products p on p.id = oi.product_id
    where d.date between from_date and to_date
    group by oi.product_id, coalesce(p.name, oi.name_snapshot), p.category
    order by sum(oi.price_snapshot * oi.qty) desc, sum(oi.qty) desc;
end;
$$;

comment on function public.sales_by_product(date, date) is
  '商品別の数量と売上。product_id が null の明細は名前ごとにまとめる。';

-- ---------------------------------------------------------------------------
-- 時間帯別売上
-- ---------------------------------------------------------------------------
create function public.sales_by_hour(from_date date, to_date date)
returns table (
  hour  integer,
  qty   integer,
  total integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '集計を参照する権限がありません';
  end if;

  return query
    select
      hourly.display_hour,
      sum(hourly.qty)::integer,
      sum(hourly.amount)::integer
    from (
      select
        -- 営業が 24 時を越えるため、0〜5 時台は 24〜29 時台として扱う。
        -- そのまま 0 時台にすると、グラフが営業の途中で先頭に戻ってしまう。
        case
          when extract(hour from (oi.created_at at time zone 'Asia/Tokyo'))::integer < 6
          then extract(hour from (oi.created_at at time zone 'Asia/Tokyo'))::integer + 24
          else extract(hour from (oi.created_at at time zone 'Asia/Tokyo'))::integer
        end as display_hour,
        oi.qty as qty,
        oi.price_snapshot * oi.qty as amount
      from public.order_items oi
      join public.tabs t          on t.id = oi.tab_id
      join public.business_days d on d.id = t.business_day_id
      where d.date between from_date and to_date
    ) as hourly
    group by hourly.display_hour
    order by hourly.display_hour;
end;
$$;

comment on function public.sales_by_hour(date, date) is
  '時間帯別の数量と売上。0〜5 時台は 24〜29 時台として返す。';

-- ---------------------------------------------------------------------------
-- 明細の生データ（CSV エクスポートと営業日ドリルダウン）
-- ---------------------------------------------------------------------------
create function public.sales_items(from_date date, to_date date)
returns table (
  business_date date,
  tab_id        uuid,
  tab_seq       integer,
  guest_name    text,
  tab_status    text,
  item_id       uuid,
  item_name     text,
  category      text,
  price         integer,
  qty           integer,
  amount        integer,
  ordered_at    timestamptz,
  staff_name    text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '集計を参照する権限がありません';
  end if;

  return query
    select
      d.date,
      t.id,
      t.seq,
      t.guest_name,
      t.status,
      oi.id,
      oi.name_snapshot,
      p.category,
      oi.price_snapshot,
      oi.qty,
      (oi.price_snapshot * oi.qty)::integer,
      oi.created_at,
      s.name
    from public.business_days d
    join public.tabs t           on t.business_day_id = d.id
    -- 明細 0 件の伝票も残すことで、誤作成の伝票に気付けるようにする
    left join public.order_items oi on oi.tab_id = t.id
    left join public.products p     on p.id = oi.product_id
    left join public.staff s        on s.id = oi.staff_id
    where d.date between from_date and to_date
    order by d.date, t.seq, oi.created_at;
end;
$$;

comment on function public.sales_items(date, date) is
  '明細の生データ。CSV エクスポートと営業日ドリルダウンで使う。明細 0 件の伝票も 1 行返る。';

revoke execute on function public.sales_by_day(date, date)     from public;
revoke execute on function public.sales_by_product(date, date) from public;
revoke execute on function public.sales_by_hour(date, date)    from public;
revoke execute on function public.sales_items(date, date)      from public;

grant execute on function public.sales_by_day(date, date)     to authenticated;
grant execute on function public.sales_by_product(date, date) to authenticated;
grant execute on function public.sales_by_hour(date, date)    to authenticated;
grant execute on function public.sales_items(date, date)      to authenticated;
