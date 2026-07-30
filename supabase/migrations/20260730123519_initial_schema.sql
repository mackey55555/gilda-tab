-- gilda 注文管理アプリ 初期スキーマ
-- 設計は docs/spec.md「3. データモデル」に対応。
-- 金額は全て円単位の integer（税込）。時刻は timestamptz（UTC 保存、集計時に Asia/Tokyo へ変換）。

-- ---------------------------------------------------------------------------
-- staff : auth.users に対応するプロフィール
-- ---------------------------------------------------------------------------
create table public.staff (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  role       text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.staff is 'スタッフのプロフィール。auth.users への insert トリガで自動作成される。';
comment on column public.staff.role is 'admin のみ /admin を利用可。変更は public.set_staff_role() 経由のみ。';

-- ---------------------------------------------------------------------------
-- products : 商品マスタ
-- ---------------------------------------------------------------------------
create table public.products (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  price      integer not null check (price >= 0),
  category   text,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.products is '商品マスタ。削除ではなく is_active = false による無効化を基本とする。';
comment on column public.products.sort_order is 'カテゴリを跨いだグローバルな表示順（昇順）。よく出る商品を小さい値にする。';

-- 商品グリッド用: 有効な商品を表示順で引く
create index products_active_sort_idx on public.products (is_active, sort_order, name);

-- ---------------------------------------------------------------------------
-- business_days : 営業日
-- ---------------------------------------------------------------------------
create table public.business_days (
  id        uuid primary key default gen_random_uuid(),
  date      date not null unique default (now() at time zone 'Asia/Tokyo')::date,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  status    text not null default 'open' check (status in ('open', 'closed')),
  constraint business_days_closed_at_matches_status check (
    (status = 'open' and closed_at is null) or (status = 'closed' and closed_at is not null)
  )
);

comment on table public.business_days is '営業日。日跨ぎは date を正とし、時刻計算では判定しない。';

-- 同時に open な営業日は 1 件のみ（部分ユニークインデックス）
create unique index business_days_single_open_idx on public.business_days (status) where status = 'open';

create index business_days_date_idx on public.business_days (date desc);

-- ---------------------------------------------------------------------------
-- payments : 会計（1 会計 : N 伝票）
-- ---------------------------------------------------------------------------
create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  business_day_id uuid not null references public.business_days (id) on delete restrict,
  total           integer not null,
  method          text,
  staff_id        uuid references public.staff (id) on delete set null,
  paid_at         timestamptz not null default now()
);

comment on table public.payments is '会計。取り消しは行の削除で行い、紐づく伝票は payment_id が null に戻って open へ復帰する。';
comment on column public.payments.total is '明細から算出した合計。書き込みはサーバ側（RPC）で行う。';
comment on column public.payments.method is '支払方法。v0.1 では記録しないためカラムのみ用意（null 許可）。';

create index payments_business_day_idx on public.payments (business_day_id, paid_at desc);

-- ---------------------------------------------------------------------------
-- tabs : 伝票（常に 1 人 1 枚。グループ概念は持たない）
-- ---------------------------------------------------------------------------
create table public.tabs (
  id              uuid primary key default gen_random_uuid(),
  business_day_id uuid not null references public.business_days (id) on delete restrict,
  seq             integer not null,
  guest_name      text,
  payment_id      uuid references public.payments (id) on delete set null,
  created_at      timestamptz not null default now(),
  -- status は payment_id から導出する。二重管理による不整合（会計取消で片方だけ戻る等）を構造的に防ぐ。
  status          text generated always as (
    case when payment_id is null then 'open' else 'paid' end
  ) stored not null,
  constraint tabs_seq_unique_per_day unique (business_day_id, seq)
);

comment on table public.tabs is '伝票。1 人 1 枚。まとめ会計は payments 1 件に複数伝票を紐づけて表現する。';
comment on column public.tabs.seq is '営業日ごとの連番（1 始まり）。トリガで採番。仮名「客1」「客2」の表示に使う。';
comment on column public.tabs.guest_name is '客名。未入力可。null のときは「客」+ seq を表示する。';
comment on column public.tabs.status is 'payment_id からの導出列。直接書き込めない。';

create index tabs_business_day_status_idx on public.tabs (business_day_id, status);
create index tabs_payment_idx on public.tabs (payment_id);

-- ---------------------------------------------------------------------------
-- order_items : 注文明細（1 行 = 1 回の注文操作。追記型）
-- ---------------------------------------------------------------------------
create table public.order_items (
  id             uuid primary key default gen_random_uuid(),
  tab_id         uuid not null references public.tabs (id) on delete cascade,
  -- マスタが削除されても明細は残す（snapshot があるため表示・集計に影響しない）
  product_id     uuid references public.products (id) on delete set null,
  name_snapshot  text not null,
  price_snapshot integer not null,
  qty            integer not null default 1 check (qty > 0),
  staff_id       uuid references public.staff (id) on delete set null,
  created_at     timestamptz not null default now()
);

comment on table public.order_items is
  '注文明細。1 行 = 1 回のタップ（追記型）。時間帯別集計の精度を保つため既存行の qty を増やさず新規行を追加する。数量減は最後の行の削除。';
comment on column public.order_items.product_id is 'マスタ未登録のフリー金額明細は null。';
comment on column public.order_items.price_snapshot is '注文時点の単価。割引・サービスはマイナス値で表現するため負値を許可する。';

create index order_items_tab_idx on public.order_items (tab_id, created_at);
create index order_items_created_at_idx on public.order_items (created_at);
create index order_items_product_idx on public.order_items (product_id);

-- ---------------------------------------------------------------------------
-- トリガ
-- ---------------------------------------------------------------------------

-- updated_at の自動更新
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger staff_set_updated_at
  before update on public.staff
  for each row execute function public.set_updated_at();

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- 伝票の営業日内連番を採番する。
-- 複数端末から同時に伝票が作られても衝突しないよう、営業日単位のアドバイザリロックで直列化する。
create function public.assign_tab_seq()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.seq is not null then
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

create trigger tabs_assign_seq
  before insert on public.tabs
  for each row execute function public.assign_tab_seq();

-- 伝票と会計の営業日が食い違わないようにする（まとめ会計で別営業日の伝票を巻き込む事故を防ぐ）
create function public.check_tab_payment_business_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_day uuid;
begin
  if new.payment_id is null then
    return new;
  end if;

  select business_day_id into payment_day
    from public.payments
   where id = new.payment_id;

  if payment_day is distinct from new.business_day_id then
    raise exception '伝票と会計の営業日が一致しません (tab: %, payment: %)', new.business_day_id, payment_day;
  end if;

  return new;
end;
$$;

create trigger tabs_check_payment_business_day
  before insert or update of payment_id, business_day_id on public.tabs
  for each row execute function public.check_tab_payment_business_day();

-- auth.users 作成時に staff プロフィールを自動生成する
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.staff (id, name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, 'staff@local'), '@', 1)
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Realtime（伝票一覧の複数端末同期用）
-- ---------------------------------------------------------------------------
-- 削除イベントで旧レコードを受け取れるように replica identity を full にする
alter table public.tabs replica identity full;
alter table public.order_items replica identity full;

alter publication supabase_realtime add table public.tabs;
alter publication supabase_realtime add table public.order_items;
alter publication supabase_realtime add table public.payments;
