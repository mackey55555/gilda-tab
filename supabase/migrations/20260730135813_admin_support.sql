-- /admin（商品マスタ・スタッフ管理）のための関数と権限。

-- ---------------------------------------------------------------------------
-- 商品が注文で使われているか
-- ---------------------------------------------------------------------------
create function public.product_is_used(target_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.order_items
     where product_id = target_product_id
  );
$$;

comment on function public.product_is_used(uuid) is
  '商品が一度でも注文されたか。使用済み商品は削除させず無効化させるための判定に使う。';

grant execute on function public.product_is_used(uuid) to authenticated;

-- 使用済み商品の削除を DB 側でも塞ぐ。
-- order_items.product_id は on delete set null なので明細自体は壊れないが、
-- 商品別の集計で紐付けが切れてしまうため、無効化（is_active = false）に倒す。
drop policy "products_delete_admin" on public.products;

create policy "products_delete_admin_unused" on public.products
  for delete to authenticated
  using (public.is_admin() and not public.product_is_used(id));

-- ---------------------------------------------------------------------------
-- 表示順の並べ替え
-- ---------------------------------------------------------------------------
-- 上下移動ボタン用。sort_order は手入力させず、隣同士の入れ替えだけを許す。
create function public.move_product(target_product_id uuid, direction text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_order integer;
  swap_id       uuid;
  swap_order    integer;
begin
  if direction not in ('up', 'down') then
    raise exception '不正な方向です: %', direction;
  end if;

  -- 先に一覧と同じ並び（sort_order, name）で連番を振り直し、重複と隙間を解消する。
  -- そうしないと sort_order が同値のときに「隣」が一意に決まらない。
  -- 実際に値が変わる行だけ更新して、updated_at の無用な更新を避ける。
  with ranked as (
    select id, (row_number() over (order by sort_order, name) * 10)::integer as new_order
      from public.products
  )
  update public.products p
     set sort_order = r.new_order
    from ranked r
   where p.id = r.id
     and p.sort_order is distinct from r.new_order;

  select sort_order into current_order from public.products where id = target_product_id;

  if current_order is null then
    raise exception '商品が見つかりません';
  end if;

  if direction = 'up' then
    select id, sort_order into swap_id, swap_order
      from public.products
     where sort_order < current_order
     order by sort_order desc
     limit 1;
  else
    select id, sort_order into swap_id, swap_order
      from public.products
     where sort_order > current_order
     order by sort_order asc
     limit 1;
  end if;

  -- 端なら何もしない
  if swap_id is null then
    return;
  end if;

  update public.products set sort_order = current_order where id = swap_id;
  update public.products set sort_order = swap_order   where id = target_product_id;
end;
$$;

comment on function public.move_product(uuid, text) is
  '商品の表示順を隣と入れ替える。呼び出しごとに全体の sort_order を 10 刻みへ正規化する。';

revoke execute on function public.move_product(uuid, text) from public;
grant execute on function public.move_product(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- スタッフ一覧（メールアドレス付き）
-- ---------------------------------------------------------------------------
-- auth.users は通常のクライアントから読めないため、admin 限定で必要な列だけ返す。
create function public.staff_directory()
returns table (
  id         uuid,
  name       text,
  role       text,
  email      text,
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
    select s.id, s.name, s.role, u.email::text, s.created_at
      from public.staff s
      join auth.users u on u.id = s.id
     order by s.created_at;
end;
$$;

comment on function public.staff_directory() is
  'admin 限定のスタッフ一覧。auth.users のメールアドレスを含む。';

revoke execute on function public.staff_directory() from public;
grant execute on function public.staff_directory() to authenticated;

-- ---------------------------------------------------------------------------
-- role 変更に「最後の admin を降格させない」ガードを追加
-- ---------------------------------------------------------------------------
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

  -- admin が 0 人になると誰も /admin に入れず、role を戻すこともできなくなる
  if new_role <> 'admin'
     and not exists (
       select 1 from public.staff
        where role = 'admin' and id <> target_staff_id
     )
  then
    raise exception '管理者が 0 人になるため降格できません';
  end if;

  update public.staff set role = new_role where id = target_staff_id;

  if not found then
    raise exception 'スタッフが見つかりません: %', target_staff_id;
  end if;
end;
$$;
