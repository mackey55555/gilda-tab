-- RLS ヘルパ関数とポリシー
--
-- 方針:
--   * 参照は認証済みスタッフ全員に許可（/floor は全スタッフが全操作する）
--   * 商品マスタの更新と role 変更は admin のみ
--   * 営業日の open/close は全スタッフ可。closed になった営業日のデータ書き込みは admin のみ（過去データの凍結）
--   * anon にはポリシーを一切与えない（publishable key だけでは何も読めない）

-- ---------------------------------------------------------------------------
-- ヘルパ関数
-- ---------------------------------------------------------------------------
-- staff を参照するポリシーは、staff 自身の RLS と再帰するため security definer 経由にする。

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff
     where id = auth.uid()
       and role = 'admin'
  );
$$;

create function public.business_day_is_open(target_business_day_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.business_days
     where id = target_business_day_id
       and status = 'open'
  );
$$;

-- order_items のポリシー用: 明細の属する伝票の営業日が open かどうか
create function public.tab_business_day_is_open(target_tab_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.tabs t
      join public.business_days d on d.id = t.business_day_id
     where t.id = target_tab_id
       and d.status = 'open'
  );
$$;

-- 伝票削除の可否判定用: 明細が 1 件も無いか
create function public.tab_is_empty(target_tab_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.order_items
     where tab_id = target_tab_id
  );
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.business_day_is_open(uuid) to authenticated;
grant execute on function public.tab_business_day_is_open(uuid) to authenticated;
grant execute on function public.tab_is_empty(uuid) to authenticated;

-- role 変更専用の入口。RLS では列単位の制限ができないため、
-- staff.role への直接 UPDATE 権限を剥がしてこの関数だけを許可する。
create function public.set_staff_role(target_staff_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'role を変更する権限がありません';
  end if;

  if new_role not in ('admin', 'staff') then
    raise exception '不正な role: %', new_role;
  end if;

  update public.staff set role = new_role where id = target_staff_id;

  if not found then
    raise exception 'スタッフが見つかりません: %', target_staff_id;
  end if;
end;
$$;

revoke execute on function public.set_staff_role(uuid, text) from public;
grant execute on function public.set_staff_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS 有効化
-- ---------------------------------------------------------------------------
alter table public.staff         enable row level security;
alter table public.products      enable row level security;
alter table public.business_days enable row level security;
alter table public.tabs          enable row level security;
alter table public.order_items   enable row level security;
alter table public.payments      enable row level security;

-- ---------------------------------------------------------------------------
-- staff
-- ---------------------------------------------------------------------------
-- INSERT は handle_new_user トリガ（security definer）経由のみ。DELETE は auth.users 側の削除に任せる。
-- どちらもポリシーを作らないことで塞ぐ。

create policy "staff_select_authenticated" on public.staff
  for select to authenticated
  using (true);

create policy "staff_update_self_or_admin" on public.staff
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- 自分で role を書き換えられないように、更新可能な列を name に限定する
revoke update on public.staff from authenticated, anon;
grant update (name) on public.staff to authenticated;

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
-- 無効商品も /admin で編集するため select は絞らない（/floor 側はクエリで is_active を絞る）

create policy "products_select_authenticated" on public.products
  for select to authenticated
  using (true);

create policy "products_insert_admin" on public.products
  for insert to authenticated
  with check (public.is_admin());

create policy "products_update_admin" on public.products
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "products_delete_admin" on public.products
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- business_days
-- ---------------------------------------------------------------------------
create policy "business_days_select_authenticated" on public.business_days
  for select to authenticated
  using (true);

-- 営業開始は /floor から全スタッフが行える
create policy "business_days_insert_authenticated" on public.business_days
  for insert to authenticated
  with check (true);

-- open 中の営業日（= クローズ操作）は全スタッフ可。closed になった過去の営業日の変更は admin のみ。
create policy "business_days_update_open_or_admin" on public.business_days
  for update to authenticated
  using (status = 'open' or public.is_admin())
  with check (true);

create policy "business_days_delete_admin" on public.business_days
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- tabs
-- ---------------------------------------------------------------------------
create policy "tabs_select_authenticated" on public.tabs
  for select to authenticated
  using (true);

create policy "tabs_insert_open_day" on public.tabs
  for insert to authenticated
  with check (public.business_day_is_open(business_day_id) or public.is_admin());

create policy "tabs_update_open_day" on public.tabs
  for update to authenticated
  using (public.business_day_is_open(business_day_id) or public.is_admin())
  with check (public.business_day_is_open(business_day_id) or public.is_admin());

-- 誤作成した伝票の後始末。明細が残っている伝票は消せない（明細を削除してから伝票を削除する運用）。
create policy "tabs_delete_empty_on_open_day" on public.tabs
  for delete to authenticated
  using (
    public.is_admin()
    or (public.business_day_is_open(business_day_id) and public.tab_is_empty(id))
  );

-- ---------------------------------------------------------------------------
-- order_items
-- ---------------------------------------------------------------------------
create policy "order_items_select_authenticated" on public.order_items
  for select to authenticated
  using (true);

create policy "order_items_insert_open_day" on public.order_items
  for insert to authenticated
  with check (public.tab_business_day_is_open(tab_id) or public.is_admin());

create policy "order_items_update_open_day" on public.order_items
  for update to authenticated
  using (public.tab_business_day_is_open(tab_id) or public.is_admin())
  with check (public.tab_business_day_is_open(tab_id) or public.is_admin());

create policy "order_items_delete_open_day" on public.order_items
  for delete to authenticated
  using (public.tab_business_day_is_open(tab_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
create policy "payments_select_authenticated" on public.payments
  for select to authenticated
  using (true);

create policy "payments_insert_open_day" on public.payments
  for insert to authenticated
  with check (public.business_day_is_open(business_day_id) or public.is_admin());

create policy "payments_update_open_day" on public.payments
  for update to authenticated
  using (public.business_day_is_open(business_day_id) or public.is_admin())
  with check (public.business_day_is_open(business_day_id) or public.is_admin());

-- 会計取消 = payments の削除。伝票は payment_id が null に戻り open へ復帰する。
create policy "payments_delete_open_day" on public.payments
  for delete to authenticated
  using (public.business_day_is_open(business_day_id) or public.is_admin());
