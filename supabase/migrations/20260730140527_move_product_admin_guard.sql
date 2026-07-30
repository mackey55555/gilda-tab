-- move_product() に明示的な admin チェックを入れる。
--
-- security invoker なので RLS により実際には 1 行も更新されないが、
-- スタッフが呼んでも「成功（204）」が返り、並べ替えたつもりで何も起きない状態になっていた。
-- 権限が無いことをその場でエラーにする。

create or replace function public.move_product(target_product_id uuid, direction text)
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
  if not public.is_admin() then
    raise exception '商品の表示順を変更する権限がありません';
  end if;

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
