-- カテゴリの独立テーブル化、スタッフの無効化、並べ替えの一括更新。
--
-- カテゴリは自由入力の text だったため、/floor のタブ順を明示的に制御できなかった
-- （商品の表示順から間接的に決まっていた）。テーブルに切り出して並び順を持たせる。
-- 商品マスタが 0 件のタイミングなので、データ移行は不要。

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.categories is '商品カテゴリ。/floor のカテゴリタブの並びは sort_order で決まる。';

create index categories_sort_idx on public.categories (sort_order, name);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

alter table public.categories enable row level security;

create policy "categories_select_authenticated" on public.categories
  for select to authenticated using (true);

create policy "categories_insert_admin" on public.categories
  for insert to authenticated with check (public.is_admin());

create policy "categories_update_admin" on public.categories
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "categories_delete_admin" on public.categories
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- products.category（text）を category_id に置き換える
-- ---------------------------------------------------------------------------
alter table public.products drop column category;
alter table public.products
  add column category_id uuid references public.categories (id) on delete set null;

comment on column public.products.category_id is 'カテゴリ。未設定（null）の商品は /floor で「その他」タブにまとめる。';

create index products_category_idx on public.products (category_id);

-- ---------------------------------------------------------------------------
-- 並べ替え（ドラッグ＆ドロップ後の一括更新）
-- ---------------------------------------------------------------------------
-- 画面で並べ替えた結果の id 配列をそのまま受け取り、10 刻みで振り直す。
-- 隣同士の入れ替えを繰り返すより往復が減り、途中経過の不整合も残らない。
create function public.reorder_products(product_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '商品の表示順を変更する権限がありません';
  end if;

  update public.products p
     set sort_order = ordered.position * 10
    from (
      select id, row_number() over () as position
        from unnest(product_ids) as id
    ) as ordered
   where p.id = ordered.id
     and p.sort_order is distinct from ordered.position * 10;
end;
$$;

comment on function public.reorder_products(uuid[]) is
  '渡された順に商品の sort_order を 10 刻みで振り直す。';

create function public.reorder_categories(category_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'カテゴリの表示順を変更する権限がありません';
  end if;

  update public.categories c
     set sort_order = ordered.position * 10
    from (
      select id, row_number() over () as position
        from unnest(category_ids) as id
    ) as ordered
   where c.id = ordered.id
     and c.sort_order is distinct from ordered.position * 10;
end;
$$;

comment on function public.reorder_categories(uuid[]) is
  '渡された順にカテゴリの sort_order を 10 刻みで振り直す。';

revoke execute on function public.reorder_products(uuid[])   from public;
revoke execute on function public.reorder_categories(uuid[]) from public;
grant execute on function public.reorder_products(uuid[])   to authenticated;
grant execute on function public.reorder_categories(uuid[]) to authenticated;

-- 隣同士の入れ替えはドラッグ＆ドロップに置き換えたので不要
drop function public.move_product(uuid, text);

-- ---------------------------------------------------------------------------
-- スタッフの無効化
-- ---------------------------------------------------------------------------
-- 退職などで使わなくなったアカウントを削除すると、注文明細の担当者が失われる。
-- 記録を残したいので削除ではなく無効化に倒す。
alter table public.staff add column is_active boolean not null default true;

comment on column public.staff.is_active is
  '無効化したスタッフは一覧の既定表示から外れ、ログインもできない（auth 側の ban と対で運用する）。';

create function public.set_staff_active(target_staff_id uuid, active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'スタッフを無効化する権限がありません';
  end if;

  if not active then
    if target_staff_id = auth.uid() then
      raise exception '自分自身は無効化できません';
    end if;

    -- 管理者が 0 人になると誰も /admin に入れなくなる
    if exists (select 1 from public.staff where id = target_staff_id and role = 'admin')
       and not exists (
         select 1 from public.staff
          where role = 'admin' and is_active and id <> target_staff_id
       )
    then
      raise exception '有効な管理者が 0 人になるため無効化できません';
    end if;
  end if;

  update public.staff set is_active = active where id = target_staff_id;

  if not found then
    raise exception 'スタッフが見つかりません: %', target_staff_id;
  end if;
end;
$$;

comment on function public.set_staff_active(uuid, boolean) is
  'スタッフの有効/無効を切り替える。自分自身と最後の有効な管理者は無効化できない。';

revoke execute on function public.set_staff_active(uuid, boolean) from public;
grant execute on function public.set_staff_active(uuid, boolean) to authenticated;

-- 名前の変更も管理者から行えるようにする（列権限で name は更新可能）
create or replace function public.set_staff_role(target_staff_id uuid, new_role text)
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

  -- 有効な管理者が 0 人になると誰も権限を戻せなくなる
  if new_role <> 'admin'
     and not exists (
       select 1 from public.staff
        where role = 'admin' and is_active and id <> target_staff_id
     )
  then
    raise exception '有効な管理者が 0 人になるため降格できません';
  end if;

  update public.staff set role = new_role where id = target_staff_id;

  if not found then
    raise exception 'スタッフが見つかりません: %', target_staff_id;
  end if;
end;
$$;

-- 一覧に is_active を含める
drop function public.staff_directory();

create function public.staff_directory()
returns table (
  id         uuid,
  name       text,
  role       text,
  email      text,
  is_active  boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'スタッフ一覧を参照する権限がありません';
  end if;

  return query
    select s.id, s.name, s.role, u.email::text, s.is_active, s.created_at
      from public.staff s
      join auth.users u on u.id = s.id
     order by s.is_active desc, s.created_at;
end;
$$;

revoke execute on function public.staff_directory() from public;
grant execute on function public.staff_directory() to authenticated;

-- ---------------------------------------------------------------------------
-- 集計関数をカテゴリテーブル参照に合わせる
-- ---------------------------------------------------------------------------
create or replace function public.sales_by_product(from_date date, to_date date)
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
      coalesce(p.name, oi.name_snapshot),
      c.name,
      sum(oi.qty)::integer,
      sum(oi.price_snapshot * oi.qty)::integer
    from public.order_items oi
    join public.tabs t            on t.id = oi.tab_id
    join public.business_days d   on d.id = t.business_day_id
    left join public.products p   on p.id = oi.product_id
    left join public.categories c on c.id = p.category_id
    where d.date between from_date and to_date
    group by oi.product_id, coalesce(p.name, oi.name_snapshot), c.name
    order by sum(oi.price_snapshot * oi.qty) desc, sum(oi.qty) desc;
end;
$$;

create or replace function public.sales_items(from_date date, to_date date)
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
      d.date, t.id, t.seq, t.guest_name, t.status,
      oi.id, oi.name_snapshot, c.name,
      oi.price_snapshot, oi.qty, (oi.price_snapshot * oi.qty)::integer,
      oi.created_at, s.name
    from public.business_days d
    join public.tabs t              on t.business_day_id = d.id
    left join public.order_items oi on oi.tab_id = t.id
    left join public.products p     on p.id = oi.product_id
    left join public.categories c   on c.id = p.category_id
    left join public.staff s        on s.id = oi.staff_id
    where d.date between from_date and to_date
    order by d.date, t.seq, oi.created_at;
end;
$$;
