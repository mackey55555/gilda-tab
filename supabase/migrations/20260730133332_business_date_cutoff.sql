-- 営業日の日付は「朝 6 時で切り替わる」ものとして決める。
--
-- 営業は 20:00–24:00 だが 24 時を越えることがあり、オープン操作を押し忘れて
-- 0:30 に最初の注文が入る場合もある。単純な JST の当日日付を default にすると
-- その 1 晩が翌日の営業日として記録され、日別売上がずれる。
--
-- 副作用として、1:00 にクローズした直後に誤って「営業を開始」を押しても
-- unique(date) に当たって弾かれるため、1 晩が 2 営業日に分裂する事故も防げる。

create function public.current_business_date()
returns date
language sql
stable
set search_path = ''
as $$
  select (((now() at time zone 'Asia/Tokyo') - interval '6 hours'))::date;
$$;

comment on function public.current_business_date() is
  '営業日の日付。JST から 6 時間戻した日付を返すので、24 時を越えた時刻に営業日を開いても同じ晩の日付になる。';

grant execute on function public.current_business_date() to authenticated;

alter table public.business_days
  alter column date set default public.current_business_date();

comment on column public.business_days.date is
  '営業日の日付。既定値は current_business_date()（朝 6 時切り替わり）。集計はこの列を正とし、時刻からの導出はしない。';
