-- 会計（単独・まとめて）と会計取り消し。
--
-- 会計は「payments を 1 件作る」＋「対象の複数 tabs.payment_id を更新する」の複合操作。
-- クライアントから 2 回に分けて投げると、途中で失敗したときに
-- 「会計だけ作られて伝票が open のまま」という中途半端な状態が残る。
-- また合計金額をクライアントが計算して送る形だと、画面が古い（他端末が注文を追加した直後など）
-- 場合に実際の明細と合わない金額が記録される。
--
-- そのため 1 トランザクションの関数にまとめ、合計は必ずサーバ側で明細から計算する。
-- security invoker なので、権限判定は既存の RLS ポリシー（open な営業日のみ / admin は例外）が行う。

create function public.settle_tabs(tab_ids uuid[], payment_method text default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ids            uuid[];
  found_count    integer;
  paid_count     integer;
  day_ids        uuid[];
  day_id         uuid;
  day_status     text;
  computed_total integer;
  new_payment_id uuid;
begin
  if tab_ids is null or coalesce(array_length(tab_ids, 1), 0) = 0 then
    raise exception '会計する伝票が指定されていません';
  end if;

  select array_agg(distinct value) into ids from unnest(tab_ids) as value;

  -- 同じ伝票を 2 台の端末から同時に会計しても二重に payments が作られないよう、
  -- 対象行をロックしてから状態を確認する。
  perform 1 from public.tabs where id = any(ids) for update;

  select
      count(*),
      count(*) filter (where payment_id is not null),
      array_agg(distinct business_day_id)
    into found_count, paid_count, day_ids
    from public.tabs
   where id = any(ids);

  if found_count <> array_length(ids, 1) then
    raise exception '存在しない伝票が含まれています';
  end if;

  if paid_count > 0 then
    raise exception '会計済みの伝票が含まれています';
  end if;

  if array_length(day_ids, 1) <> 1 then
    raise exception '営業日をまたぐ伝票は一度に会計できません';
  end if;

  day_id := day_ids[1];

  select status into day_status from public.business_days where id = day_id;

  if day_status <> 'open' and not public.is_admin() then
    raise exception 'クローズ済みの営業日の伝票です';
  end if;

  -- 合計はクライアントの値を使わず、必ず明細から計算する
  select coalesce(sum(price_snapshot * qty), 0)::integer
    into computed_total
    from public.order_items
   where tab_id = any(ids);

  insert into public.payments (business_day_id, total, method, staff_id)
  values (day_id, computed_total, payment_method, auth.uid())
  returning id into new_payment_id;

  -- tabs.status は payment_id からの生成列なので、ここで自動的に paid になる
  update public.tabs set payment_id = new_payment_id where id = any(ids);

  return new_payment_id;
end;
$$;

comment on function public.settle_tabs(uuid[], text) is
  '伝票をまとめて会計する。合計は明細から再計算し、payments 1 件に対象伝票を紐づけて返す。';

-- 会計取り消し。payments を 1 件消すだけで、紐づく伝票は payment_id が null に戻り
-- 生成列 status が open に復帰する（明細は一切変わらない）。
create function public.void_payment(payment_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.payments where id = payment_id;

  -- RLS で弾かれた場合もエラーではなく 0 件になるので、ここで区別せず同じ扱いにする
  if not found then
    raise exception '会計が見つからない、または取り消す権限がありません';
  end if;
end;
$$;

comment on function public.void_payment(uuid) is
  '会計を取り消す。伝票は open に戻り、明細は不変。';

revoke execute on function public.settle_tabs(uuid[], text) from public;
revoke execute on function public.void_payment(uuid) from public;
grant execute on function public.settle_tabs(uuid[], text) to authenticated;
grant execute on function public.void_payment(uuid) to authenticated;

-- 会計済み一覧（当日分の確認と取り消しに使う）。
-- 「客1」の組み立ては画面側の guestLabel() と同じ規則。表示専用なので重複を許容する。
create view public.payment_summaries with (security_invoker = true) as
  select
    p.id,
    p.business_day_id,
    p.total,
    p.method,
    p.paid_at,
    s.name as staff_name,
    count(t.id)::integer as tab_count,
    coalesce(
      array_agg(
        coalesce(nullif(t.guest_name, ''), '客' || t.seq) order by t.seq
      ) filter (where t.id is not null),
      '{}'
    ) as guest_labels
  from public.payments p
  left join public.tabs t on t.payment_id = p.id
  left join public.staff s on s.id = p.staff_id
  group by p.id, s.name;

comment on view public.payment_summaries is
  '会計 + 紐づく伝票の枚数と客名一覧。RLS は参照元テーブルのものが適用される（security_invoker）。';

grant select on public.payment_summaries to authenticated;
