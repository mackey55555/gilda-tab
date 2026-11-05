-- 電子領収書（spec 8 章）。
--
-- お客様はログインせずに QR から領収書ページを開くため、anon が触れる入口が初めてできる。
-- テーブルは anon に一切見せず、トークンを引数に取る security definer の RPC 2 本だけを開ける。
-- secret key をサーバで使う形にしないのは、RLS を貫通する鍵の用途をスタッフ追加だけに留めるため。
--
-- 追加のみ。既存のテーブル・関数には触れない。

-- ---------------------------------------------------------------------------
-- 店舗設定（領収書の発行者情報）
-- ---------------------------------------------------------------------------
-- 1 行だけのテーブル。主キーを true 固定にして 2 行目を作れないようにする。
create table public.shop_settings (
  id                  boolean primary key default true check (id),
  name                text not null check (length(btrim(name)) > 0),
  address             text not null check (length(btrim(address)) > 0),
  phone               text not null check (length(btrim(phone)) > 0),
  registration_number text check (registration_number ~ '^T[0-9]{13}$'),
  updated_at          timestamptz not null default now()
);

comment on table public.shop_settings is '店舗情報。領収書の発行者欄に使う。常に 1 行。';
comment on column public.shop_settings.registration_number is
  'インボイスの登録番号（T + 13 桁）。null なら領収書に登録番号を出さない。';

create trigger shop_settings_set_updated_at
  before update on public.shop_settings
  for each row execute function public.set_updated_at();

insert into public.shop_settings (name, address, phone, registration_number)
values ('N合同会社 gilda', '岡山市北区下中野1226-12', '090-6439-1467', 'T9260005010596');

alter table public.shop_settings enable row level security;

create policy "shop_settings_select_authenticated" on public.shop_settings
  for select to authenticated
  using (true);

-- INSERT / DELETE はポリシーを作らないことで塞ぐ（行は上の 1 行だけ）
create policy "shop_settings_update_admin" on public.shop_settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 領収書
-- ---------------------------------------------------------------------------
-- 確定前は「リンクだけある」状態で、表示内容は毎回会計と店舗設定から組み立てる。
-- 確定時に番号・宛名・金額・発行者をまとめて書き込み、以降はこのスナップショットだけを返す。
-- 後から店舗設定や明細が変わっても、渡した領収書と再ダウンロードした領収書の内容がずれないようにするため。
create table public.receipts (
  id                  uuid primary key default gen_random_uuid(),
  payment_id          uuid not null unique references public.payments (id) on delete cascade,
  token               text not null unique,
  expires_at          timestamptz not null,
  issued_by           uuid references public.staff (id) on delete set null,
  created_at          timestamptz not null default now(),

  finalized_at        timestamptz,
  number              text unique,
  addressee           text,
  receipt_date        date,
  amount              integer,
  tax                 integer,
  issuer_name         text,
  issuer_address      text,
  issuer_phone        text,
  registration_number text,

  -- スナップショットは全部そろっているか、全部空か（登録番号だけは店舗設定で null があり得る）
  constraint receipts_snapshot_complete check (
    (finalized_at is null
      and number is null and addressee is null and receipt_date is null
      and amount is null and tax is null
      and issuer_name is null and issuer_address is null and issuer_phone is null
      and registration_number is null)
    or
    (finalized_at is not null
      and number is not null and addressee is not null and receipt_date is not null
      and amount is not null and tax is not null
      and issuer_name is not null and issuer_address is not null and issuer_phone is not null)
  )
);

comment on table public.receipts is
  '電子領収書。1 会計に 1 件。会計取り消し（payments 削除）で一緒に消える。';
comment on column public.receipts.token is 'お客様に渡す URL の鍵。推測できない値にする。';
comment on column public.receipts.receipt_date is '取引日。営業日ではなく会計した実際の日付（JST）。';

alter table public.receipts enable row level security;

-- スタッフは発行状況を見られる。書き込みは下の RPC（security definer）経由だけなのでポリシーを作らない。
create policy "receipts_select_authenticated" on public.receipts
  for select to authenticated
  using (true);

-- 番号の日ごとの払い出し済み最大値。
-- receipts から max を取る方式だと、会計取り消しで行が消えたときに同じ番号を別のお客様へ
-- 再び払い出してしまう（既に渡した PDF と番号が重複する）。カウンタは減らさない。
create table public.receipt_counters (
  receipt_date date primary key,
  last_seq     integer not null
);

comment on table public.receipt_counters is
  '領収書番号の日ごとの払い出し済み最大値。取り消しがあっても戻さない。';

alter table public.receipt_counters enable row level security;

create policy "receipt_counters_select_admin" on public.receipt_counters
  for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 内部ヘルパ（anon / authenticated には公開しない）
-- ---------------------------------------------------------------------------
-- 金額は payments.total を使わず明細から出す。settle_tabs と同じく、明細を正とする方針に揃える。
create function public.receipt_amount(target_payment_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(i.price_snapshot * i.qty), 0)::integer
    from public.order_items i
    join public.tabs t on t.id = i.tab_id
   where t.payment_id = target_payment_id;
$$;

-- 税込金額から消費税額を出す。src/lib/format.ts の taxBreakdown() と同じ規則
-- （本体 = floor(税込 × 10 / 11)、税 = 差額）。片方だけ変えないこと。
create function public.receipt_tax(amount integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  -- 金額は正の整数に限るので、整数除算の切り捨て = floor になる
  select amount - (amount * 10) / 11;
$$;

-- ---------------------------------------------------------------------------
-- スタッフ用: 領収書リンクの発行
-- ---------------------------------------------------------------------------
-- 同じ会計で何度押しても同じトークンを返し、有効期限だけを延ばす。
-- QR を出し直すたびに URL が変わると、先に読んだお客様のリンクが無駄になるため。
create function public.issue_receipt(target_payment_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_token text;
begin
  if not exists (
    select 1 from public.staff where id = auth.uid() and is_active
  ) then
    raise exception '領収書を発行する権限がありません';
  end if;

  if not exists (select 1 from public.payments where id = target_payment_id) then
    raise exception '会計が見つかりません';
  end if;

  if public.receipt_amount(target_payment_id) <= 0 then
    raise exception '金額が 0 円以下の会計には領収書を発行できません';
  end if;

  -- gen_random_uuid() は暗号論的乱数で 122 bit あり、URL の鍵として十分。拡張を足さずに済む。
  insert into public.receipts (payment_id, token, expires_at, issued_by)
  values (
    target_payment_id,
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
    now() + interval '45 days',
    auth.uid()
  )
  on conflict (payment_id) do update
    set expires_at = excluded.expires_at
  returning token into result_token;

  return result_token;
end;
$$;

comment on function public.issue_receipt(uuid) is
  '会計の領収書リンク用トークンを返す。既にあれば同じトークンで期限を 45 日後に延ばす。';

-- ---------------------------------------------------------------------------
-- お客様用（anon）: 表示と確定
-- ---------------------------------------------------------------------------
-- 見つからない・期限切れ・取り消し済みはいずれも 0 行で返し、区別しない。
-- トークンの存在有無を外から探れないようにするため。
create function public.get_receipt(receipt_token text)
returns table (
  finalized           boolean,
  number              text,
  addressee           text,
  receipt_date        date,
  amount              integer,
  tax                 integer,
  issuer_name         text,
  issuer_address      text,
  issuer_phone        text,
  registration_number text,
  expires_at          timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.finalized_at is not null,
    r.number,
    r.addressee,
    coalesce(r.receipt_date, (p.paid_at at time zone 'Asia/Tokyo')::date),
    coalesce(r.amount, public.receipt_amount(p.id)),
    coalesce(r.tax, public.receipt_tax(public.receipt_amount(p.id))),
    coalesce(r.issuer_name, s.name),
    coalesce(r.issuer_address, s.address),
    coalesce(r.issuer_phone, s.phone),
    case when r.finalized_at is not null then r.registration_number else s.registration_number end,
    r.expires_at
  from public.receipts r
  join public.payments p on p.id = r.payment_id
  cross join public.shop_settings s
  where r.token = receipt_token
    and r.expires_at > now();
$$;

comment on function public.get_receipt(text) is
  'トークンから領収書の表示内容を返す。未確定なら現在の会計・店舗設定から組み立てる。';

-- 宛名は 1 回だけ。確定と同時に番号を払い出し、内容をスナップショットする。
create function public.finalize_receipt(receipt_token text, addressee text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target       public.receipts%rowtype;
  paid_value   timestamptz;
  name_value   text := btrim(coalesce(addressee, ''));
  date_value   date;
  amount_value integer;
  seq_value    integer;
  number_value text;
begin
  if name_value ~ '[[:cntrl:]]' then
    raise exception '宛名に使えない文字が含まれています';
  end if;

  if length(name_value) > 40 then
    raise exception '宛名は 40 文字以内で入力してください';
  end if;

  if name_value = '' then
    name_value := '上様';
  end if;

  -- 同じリンクを 2 回同時に確定しても番号が 2 つ払い出されないよう、行をロックしてから判定する
  select * into target
    from public.receipts
   where token = receipt_token
     and expires_at > now()
   for update;

  if not found then
    raise exception '領収書が見つからないか、有効期限が切れています';
  end if;

  if target.finalized_at is not null then
    raise exception 'この領収書は既に発行済みです';
  end if;

  select p.paid_at into paid_value from public.payments p where p.id = target.payment_id;

  date_value   := (paid_value at time zone 'Asia/Tokyo')::date;
  amount_value := public.receipt_amount(target.payment_id);

  insert into public.receipt_counters (receipt_date, last_seq)
  values (date_value, 1)
  on conflict (receipt_date) do update
    set last_seq = public.receipt_counters.last_seq + 1
  returning last_seq into seq_value;

  number_value := to_char(date_value, 'YYYYMMDD') || '-' || lpad(seq_value::text, 3, '0');

  update public.receipts r
     set finalized_at        = now(),
         number              = number_value,
         addressee           = name_value,
         receipt_date        = date_value,
         amount              = amount_value,
         tax                 = public.receipt_tax(amount_value),
         issuer_name         = s.name,
         issuer_address      = s.address,
         issuer_phone        = s.phone,
         registration_number = s.registration_number
    from public.shop_settings s
   where r.id = target.id;

  return number_value;
end;
$$;

comment on function public.finalize_receipt(text, text) is
  '宛名を確定して領収書番号を払い出す。1 回だけ。空欄は「上様」。';

-- ---------------------------------------------------------------------------
-- 実行権限
-- ---------------------------------------------------------------------------
-- Supabase は public スキーマの新規関数に anon / authenticated への EXECUTE を既定で付ける。
-- public から剥がすだけでは anon に残るため、明示的に剥がしてから必要な分だけ付け直す。
revoke execute on function public.receipt_amount(uuid)           from public, anon, authenticated;
revoke execute on function public.receipt_tax(integer)           from public, anon, authenticated;
revoke execute on function public.issue_receipt(uuid)            from public, anon, authenticated;
revoke execute on function public.get_receipt(text)              from public, anon, authenticated;
revoke execute on function public.finalize_receipt(text, text)   from public, anon, authenticated;

grant execute on function public.issue_receipt(uuid)             to authenticated;
grant execute on function public.get_receipt(text)               to anon, authenticated;
grant execute on function public.finalize_receipt(text, text)    to anon, authenticated;
