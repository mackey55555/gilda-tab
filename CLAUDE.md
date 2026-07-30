# CLAUDE.md

バー「gilda」注文管理アプリ。作業前に必ず [docs/spec.md](docs/spec.md) を参照する（仕様の一次情報はこのファイルではなく spec.md 側）。

## 進め方（最重要ルール）

- spec.md「7. 実装順序」の**ステップ単位**で進める。
- **1ステップ完了したら必ず停止し、ユーザーの確認を待つ**。確認前に次のステップへ着手しない。
- ステップ着手前に実装計画を提示し、OK をもらってからコードを書く。
- 各ステップは実機（スマホ）確認が完了条件。確認結果を待たずに先へ進めない。
- 仕様に書かれていない判断が必要になったら、勝手に決めずに質問する（軽微なものは前提を明記して進めてよい）。

## コミット運用

- **各ステップ完了時のコミットは Claude Code が行う**（ユーザーに任せない）。
- コミット前に `git status` と `git diff --stat` を提示し、**ユーザーの OK を得てからコミットする**。
- コミットメッセージは Conventional Commits。**type（feat / fix / chore / docs / refactor 等）にステップ番号を含める**。例: `feat(step1): Supabase スキーマ・RLS・seed を追加`
- 以下をコミットに含めない:
  - `.env` / `.env.local` / `.env*.local`
  - 一時ファイル・スクラッチパッドの残骸、デバッグ用の使い捨てスクリプト、ログ
  - `supabase/.temp` / `supabase/.branches`、ビルド成果物
  - （リポジトリに残す価値のある検証スクリプトは `scripts/` に置いた上で含めてよい）
- **push はユーザーの明示的な指示があったときのみ**行う。自動 push は禁止。

実装順序:

1. Supabase スキーマ ＋ RLS ＋ seed（商品ダミー数件）
2. 認証 ＋ `/floor` 伝票一覧・作成・詳細・注文追加
3. 会計（単独 → まとめて会計）
4. `/admin` マスタ（商品・スタッフ）
5. `/admin` 集計
6. PWA 化・ダークテーマ調整・実機検証

## 技術スタック

| 項目 | 選定 |
|---|---|
| フレームワーク | Next.js (App Router) + TypeScript |
| UI | Tailwind CSS |
| BaaS | Supabase (Postgres 17 / Auth / RLS / Realtime) |
| ホスティング | Vercel |
| PWA | Serwist |

- Node v24 / Supabase CLI 2.x
- 認証は Supabase Auth（メール+パスワード）。スタッフ = ログインユーザー。
- オフライン対応はしない。楽観的 UI 更新 ＋ 失敗時リトライ表示のみ。

## Next.js 16 の注意点

学習データにある Next.js とは規約が変わっている。**実装前に `node_modules/next/dist/docs/` の該当ページを読む**（`create-next-app` が生成する AGENTS.md の指示）。特に:

- **`middleware.ts` は無い。`src/proxy.ts` に `export async function proxy()` を書く**（15 以前の Middleware が Proxy に改名）。
- `cookies()` は非同期。`await cookies()` してから使う。**Server Component のレンダリング中は Cookie を書けない**ため、`@supabase/ssr` の `setAll` は try/catch で握り、トークン更新は `proxy.ts` に任せる。
- `page.tsx` の `params` / `searchParams` は Promise。`await` して取り出す。
- ビルドは Turbopack が既定。
- 実機確認のため `next.config.ts` に `allowedDevOrigins`（プライベート IP）を入れている。

## Supabase の扱い

- **キーは新形式（`sb_publishable_...` / `sb_secret_...`）のみを使う。** legacy の anon key / service_role JWT を前提にしたコードは書かない。
- 環境変数（`.env.local`、コミット禁止）:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — ブラウザ/サーバ両方の通常クライアント
  - `SUPABASE_SECRET_KEY` — 新形式 secret key（`sb_secret_...`）。**サーバ専用**。`NEXT_PUBLIC_` を付けない／クライアントバンドルに入れない。`SUPABASE_SERVICE_ROLE_KEY` という名前は使わない
- secret key は RLS を貫通するため、使用は管理系の API Route / Server Action に限定し、使う理由をコメントで残す。
- マイグレーションは `supabase/migrations/` に置き、`supabase db push` で適用する（リモートに直接 SQL を当てない）。
- ローカルの `supabase db reset` を通ることを、push 前の確認手段とする。
- seed（`supabase/seed.sql`）はダミーデータ。リモートへ入れる場合は `supabase db push --include-seed`。実データは後で差し替える。
- スキーマ変更は必ず新規マイグレーションファイルを追加する。push 済みのマイグレーションは編集しない。

## DB 規約

- テーブル/カラムは `snake_case`、テーブル名は複数形（spec のデータモデル名に従う）。
- 主キーは `uuid` + `gen_random_uuid()`。
- 金額は**円単位の `integer`**（税込・小数なし）。`numeric`/`float` は使わない。
- 時刻は `timestamptz`（UTC 保存）。日次・時間帯別集計は `at time zone 'Asia/Tokyo'` で変換する。営業日の区切りは `business_days.date` を正とし、日跨ぎを時刻計算で解決しない。
- 列挙値は `text` + `CHECK` 制約（enum 型は使わない）。
- 全テーブルで RLS を有効化し、ポリシーを明示的に定義する。ポリシー未定義のテーブルを作らない。
- `staff` テーブルを参照する RLS は再帰を避けるため `SECURITY DEFINER` のヘルパ関数経由にする。

## 確定した設計判断（spec の未決事項を埋めたもの）

- **注文明細は追記型**: 1行 = 1回のタップ。既存行の `qty` を増やさない（時間帯別集計の精度優先）。UI は商品でグルーピングして「×3」表示、− は最後の行を削除。
- **`tabs.status` は `payment_id` からの生成列**（`open`/`paid`）。直接書き込まない。会計取消は `payments` の行削除だけで伝票が open に戻る。
- **伝票の void 状態は持たない**。誤作成の後始末は「明細を削除 → 伝票を削除」。明細が残っている伝票は RLS で削除不可。
- **営業日**: `date` はユニーク、open は同時1件のみ。open/close は全スタッフ可（`/floor` に営業開始ボタン）。**closed になった営業日に紐づく tabs/order_items/payments の書き込みは admin のみ**。
- **「当日」を日付比較で判定しない。** 営業は 24 時を越えるため、対象の特定は必ず `business_days.status = 'open'` と `business_day_id` で行う。営業日の日付そのものは `current_business_date()`（**JST から 6 時間戻した日付＝朝6時切り替わり**）で決まり、画面側の表示は `src/lib/business-date.ts` が同じ規則で計算する。**片方だけ変えないこと**。
- **会計は `settle_tabs(tab_ids, payment_method)` RPC のみ**を使う。payments 作成と複数伝票のクローズを1トランザクションで行い、**合計は必ずサーバ側で明細から再計算**する（クライアントの金額は信用しない）。取り消しは `void_payment(payment_id)`。
- **仮名**: `tabs.seq` を営業日ごとにトリガ採番（アドバイザリロックで衝突回避）。表示は `guest_name ?? '客' + seq` で「客1」「客2」。
- **`products.category` は自由入力の text**。`sort_order` はカテゴリを跨いだグローバル順1本。
- **`staff.role` の変更は `public.set_staff_role(uuid, text)` RPC 経由のみ**。`authenticated` には `staff.name` 列だけ UPDATE 権限を付与しているため、自己昇格は不可能。
- **最初の admin** は SQL で手動昇格する（staff 0人時の自動 admin は競合するため採用しない）:
  ```sql
  update public.staff set role = 'admin' where id = (select id from auth.users where email = '<自分のメール>');
  ```
- **`/floor` の書き込みはブラウザから supabase-js を直叩きする**（Server Action を挟まない）。「注文追加を2タップ以内・即反映」のため楽観的更新 → Realtime で他端末へ伝播させる。権限は RLS で担保。初期データ取得は Server Component 側。
- `tabs.seq` はトリガ採番だが、型生成が必須項目にしてしまうため DB 側に `default 0` のプレースホルダを置いている。クライアントからは `seq` を渡さない。
- `tabs.status` は生成列なので書き込むと Postgres がエラーを返す。型生成上は Insert/Update に現れるが**絶対に渡さない**。
- **商品は注文実績があると削除できない**（RLS の delete ポリシーで `product_is_used()` を見ている）。無効化（`is_active = false`）に倒すこと。表示順の変更は `move_product(id, 'up'|'down')` RPC のみ（呼ぶたびに全体を 10 刻みへ正規化する）。
- **`secret key` を使うのは `src/lib/supabase/admin.ts` 経由のスタッフ追加だけ**。auth.users の作成は通常クライアントでは不可能なため。それ以外は publishable key + RLS で行う。
- 回帰テストは以下（いずれもリモートに対して実行し、テストユーザー・データは自動削除される）:
  - `bash scripts/verify-rls.sh` … RLS 32項目
  - `bash scripts/verify-settlement.sh` … 会計 RPC 24項目（open な営業日があると中断する）
  - `bash scripts/verify-admin.sh` … /admin の権限と RPC 20項目
  - `node scripts/verify-floor.cjs` / `node scripts/verify-admin-pages.cjs` … 画面描画（要 dev server）
  - **検証スクリプトの後片付けは必ず「自分が作った行」だけを対象にする。** `business_day_id` などで括ると運用中のデータを巻き込む（実際に会計データを消す事故を起こした）。

## コーディング規約

- TypeScript strict。`any` 禁止（やむを得ない場合は理由をコメント）。
- DB 型は Supabase の型生成（`supabase gen types typescript`）を使い、手書きの重複定義を作らない。
- Server Component を既定にし、`"use client"` は必要な葉コンポーネントだけに付ける。
- 書き込み処理は原子性が必要なものは Postgres 関数（RPC）にまとめる（例: 会計＝payments 作成 + 複数 tabs のクローズ）。
- `/floor`（スマホ・ダーク・タップ 44px 以上）と `/admin`（PC・サイドバー）は UI を共有しない。共通化するのはデータアクセス層のみ。
- **Tailwind v4 の `@theme` で色トークンを増やすときは、既定ユーティリティ名と衝突させない。** 例えば `--color-base` を定義すると `text-base` がフォントサイズではなく**色**のユーティリティになり、黒文字が黒背景に乗る事故が起きた（`base` → `canvas` に改名して解消）。トークンを追加したら `.next/static` の CSS を grep して意図した定義になっているか確認する。
- **secure context 限定の Web API を使わない。** 実機確認は `http://192.168.x.x` で行うため、`crypto.randomUUID()` や `crypto.subtle`、Service Worker などは `undefined` / 利用不可になる。一時 ID は `src/lib/local-id.ts` を使う。
- ファイル名: コンポーネントは `kebab-case.tsx`、React コンポーネント名は `PascalCase`。
- コメントは「なぜ」を書く。自明な処理の説明コメントは書かない。
- 既存コードのスタイル（命名・構成・コメント密度）に合わせる。
