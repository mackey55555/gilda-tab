# gilda 注文管理

バー「gilda」（営業: 木・金・土 20:00–24:00）の注文・会計を記録する社内アプリ。

- 仕様: [docs/spec.md](docs/spec.md)
- 開発ルール・設計判断: [CLAUDE.md](CLAUDE.md)

営業用の `/floor` はスマホ前提のダークテーマ、管理用の `/admin` は PC 前提のサイドバー構成で、
UI は共有していません。

## 技術スタック

Next.js 16（App Router / Turbopack）・React 19・TypeScript・Tailwind CSS v4・
Supabase（Postgres / Auth / RLS / Realtime）・Vercel

## セットアップ

```bash
npm install
cp .env.local.example .env.local   # 値は Supabase のダッシュボードから
npm run dev
```

### 環境変数

| 変数 | 用途 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクトの URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ブラウザ/サーバ共通のクライアント（`sb_publishable_...`） |
| `SUPABASE_SECRET_KEY` | **サーバ専用**（`sb_secret_...`）。スタッフ追加でのみ使う |

キーは新形式のみを使います。legacy の anon key / service_role JWT は使いません。
`SUPABASE_SECRET_KEY` は RLS を貫通するため、`NEXT_PUBLIC_` を付けないこと。

### データベース

```bash
supabase db push                 # マイグレーション適用
supabase db push --include-seed  # ダミー商品も投入する場合
supabase gen types typescript --linked > src/lib/database.types.ts
```

最初の管理者だけは SQL で昇格させます（管理者が 0 人だと誰も `/admin` に入れないため）。

```sql
update public.staff set role = 'admin'
 where id = (select id from auth.users where email = '<自分のメール>');
```

2 人目以降は `/admin/staff` から追加できます（メール + 初期パスワードを直接発行。
SMTP 設定が不要な代わりに、パスワードは口頭で渡す運用です）。

## 実機（スマホ）での確認

```bash
npm run dev     # 同一 Wi-Fi のスマホから http://<PCのIP>:3000
```

`next.config.ts` の `allowedDevOrigins` でプライベート IP を許可しています。

ただし **Service Worker は secure context 専用**なので、`http://` の LAN 経由では動きません。
PWA（ホーム画面追加・起動速度）の確認は Vercel にデプロイした HTTPS 環境で行ってください。

## 検証スクリプト

いずれもリモートの Supabase に対して実行し、テストユーザーとテストデータは自動で削除します。
**後片付けは「そのスクリプトが作った行」だけを対象**にしており、運用中のデータには触れません。

| コマンド | 内容 |
|---|---|
| `bash scripts/verify-rls.sh` | RLS とスキーマ制約（32項目） |
| `bash scripts/verify-settlement.sh` | 会計 RPC（24項目） |
| `bash scripts/verify-admin.sh` | `/admin` の権限と RPC（20項目） |
| `bash scripts/verify-sales.sh` | 集計値が手計算と一致するか（20項目） |
| `node scripts/verify-floor.cjs` | `/floor` の画面描画（25項目・要 dev server） |
| `node scripts/verify-admin-pages.cjs` | `/admin` の画面描画と CSV（36項目・要 dev server） |

`verify-rls.sh` と `verify-settlement.sh` は、open な営業日があると日付が衝突するため
実行前に中断します。営業中は流さないでください。

画面系は起動中のサーバに対して実行します。本番ビルドに向ける場合:

```bash
BASE_URL=http://localhost:3100 node scripts/verify-floor.cjs
```

### 集計画面の確認用ダミーデータ

```bash
bash scripts/dummy-sales-seed.sh      # 木金土 12営業日分を投入
bash scripts/dummy-sales-cleanup.sh   # 全削除（残 0 件まで確認する）
```

**実運用を始める前に必ず cleanup を実行してください。** 1 件でも残ると売上集計が汚染されます。

## 運用メモ

- **営業日を開かないと伝票を作れません。** `/floor` の「本日の営業を開始」から開きます。
  同時に open にできる営業日は 1 つだけです。
- **営業日の切り替わりは朝 6 時**です。24 時を越えて営業しても、0:30 に開いても同じ晩として記録されます。
- **会計の取り消し**は `/floor` の「会計済み」セクションから行えます。伝票が未会計に戻り、明細は変わりません。
- **クローズした営業日のデータは管理者しか変更できません。** 打ち間違いに後から気付いた場合は管理者が直します。
- **商品は削除より無効化**を使ってください。注文実績のある商品は削除できません（集計の紐付けが切れるため）。
- 値引き・サービスは「その他」のテンキーで**マイナス金額**として入力します。

## ライセンス

社内利用のみ。
