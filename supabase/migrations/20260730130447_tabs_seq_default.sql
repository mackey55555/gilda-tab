-- tabs.seq はトリガで採番するため、クライアントからは常に省略して insert したい。
-- ところが「not null かつ default なし」だと supabase gen types が必須項目として型を生成し、
-- アプリ側が採番済みの値を渡さないとコンパイルできなくなる。
-- プレースホルダの default を付けて「省略可能」にし、実際の値はこれまで通りトリガが決める。

alter table public.tabs alter column seq set default 0;

comment on column public.tabs.seq is
  '営業日ごとの連番（1 始まり）。default 0 は型生成のためのプレースホルダで、実際の値は assign_tab_seq トリガが採番する。';

-- 0（= 未指定）のときに採番する。明示的に 1 以上を渡した場合はその値を尊重する。
create or replace function public.assign_tab_seq()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.seq is not null and new.seq <> 0 then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.business_day_id::text, 0));

  select coalesce(max(seq), 0) + 1
    into new.seq
    from public.tabs
   where business_day_id = new.business_day_id;

  return new;
end;
$$;
