#!/usr/bin/env bash
# 売上集計 RPC の値が手計算と一致することを確認する。
# 既知の明細だけを持つ専用の営業日を作り、期待値と突き合わせる。
# テストユーザーとテストデータは最後に全て削除する。
#
# 実行: bash scripts/verify-sales.sh   （要: curl, jq, .env.local）
set -uo pipefail
cd "$(dirname "$0")/.."

# 他のデータと混ざらないよう、検証専用の営業日を使う
TEST_DATE="2026-05-07"

set -a; . ./.env.local; set +a
URL="$NEXT_PUBLIC_SUPABASE_URL"
PUB="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
SECRET="${SUPABASE_SECRET_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-}}"
[ -z "$SECRET" ] && { echo "secret key が見つかりません"; exit 1; }

PASS=0; FAIL=0
BODY=""; CODE=""

rest() { # rest METHOD PATH TOKEN [DATA]
  local m=$1 p=$2 tok=$3 data=${4:-}
  local args=(-s -X "$m" "$URL/rest/v1$p" -H "apikey: $PUB" -H "Content-Type: application/json"
              -H "Prefer: return=representation" -w $'\n%{http_code}')
  [ -n "$tok" ] && args+=(-H "Authorization: Bearer $tok")
  [ -n "$data" ] && args+=(-d "$data")
  local out; out=$(curl "${args[@]}")
  CODE=$(printf '%s' "$out" | tail -n1)
  BODY=$(printf '%s' "$out" | sed '$d')
}

api() { # api METHOD PATH [DATA]  … secret key
  local m=$1 p=$2 data=${3:-}
  local args=(-s -X "$m" "$URL/rest/v1$p" -H "apikey: $SECRET" -H "Authorization: Bearer $SECRET"
              -H "Content-Type: application/json" -H "Prefer: return=representation")
  [ -n "$data" ] && args+=(-d "$data")
  curl "${args[@]}"
}

check() {
  if [ "$2" = "0" ]; then PASS=$((PASS+1)); printf '  OK   %s\n' "$1"
  else FAIL=$((FAIL+1)); printf '  NG   %s\n       -> %s\n' "$1" "$3"; fi
}

if [ "$(api GET "/business_days?date=eq.$TEST_DATE&select=id" | jq 'length')" != "0" ]; then
  echo "検証用の営業日 $TEST_DATE が既に存在します。前回の残骸を削除してから再実行してください。"
  exit 1
fi

echo "=== セットアップ ==="
mkuser() {
  curl -s -X POST "$URL/auth/v1/admin/users" -H "apikey: $SECRET" -H "Authorization: Bearer $SECRET" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"gilda-test-pw-9182\",\"email_confirm\":true,\"user_metadata\":{\"name\":\"$2\"}}" \
  | jq -r '.id // "ERR"'
}
login() {
  curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $PUB" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"gilda-test-pw-9182\"}" | jq -r '.access_token // "ERR"'
}
ADMIN_ID=$(mkuser "sales-admin@example.com" "集計テスト管理者")
STAFF_ID=$(mkuser "sales-staff@example.com" "集計テストスタッフ")
api PATCH "/staff?id=eq.$ADMIN_ID" '{"role":"admin"}' >/dev/null
ATOK=$(login "sales-admin@example.com")
STOK=$(login "sales-staff@example.com")

BD=$(api POST "/business_days" \
  "{\"date\":\"$TEST_DATE\",\"opened_at\":\"${TEST_DATE}T11:00:00Z\",\"status\":\"closed\",\"closed_at\":\"${TEST_DATE}T17:00:00Z\"}" \
  | jq -r '.[0].id')

TAB1=$(api POST "/tabs" "{\"business_day_id\":\"$BD\",\"guest_name\":\"集計テスト\"}" | jq -r '.[0].id')
# 明細 0 件の伝票。客単価の分母から除外されることの確認に使う。
TAB2=$(api POST "/tabs" "{\"business_day_id\":\"$BD\"}" | jq -r '.[0].id')

# JST の時刻で意図を書く（UTC は -9 時間）
#   21:15 → 生ビール 800 x2 = 1600
#   23:40 → ウイスキー 900
#   00:30 → その他 1000        （24 時台として集計されるべき）
#   01:10 → 値引き -500        （25 時台・マイナス計上されるべき）
api POST "/order_items" "[
  {\"tab_id\":\"$TAB1\",\"name_snapshot\":\"生ビール\",\"price_snapshot\":800,\"qty\":2,\"created_at\":\"${TEST_DATE}T12:15:00Z\"},
  {\"tab_id\":\"$TAB1\",\"name_snapshot\":\"ウイスキー\",\"price_snapshot\":900,\"qty\":1,\"created_at\":\"${TEST_DATE}T14:40:00Z\"},
  {\"tab_id\":\"$TAB1\",\"name_snapshot\":\"その他\",\"price_snapshot\":1000,\"qty\":1,\"created_at\":\"${TEST_DATE}T15:30:00Z\"},
  {\"tab_id\":\"$TAB1\",\"name_snapshot\":\"値引き\",\"price_snapshot\":-500,\"qty\":1,\"created_at\":\"${TEST_DATE}T16:10:00Z\"}
]" >/dev/null

EXPECTED_TOTAL=$((800 * 2 + 900 + 1000 - 500))   # = 3000

echo
echo "=== 権限 ==="
rest POST "/rpc/sales_by_day" "$STOK" "{\"from_date\":\"$TEST_DATE\",\"to_date\":\"$TEST_DATE\"}"
check "スタッフは集計 RPC を呼べない" \
  "$([ "$CODE" != "200" ] && printf '%s' "$BODY" | grep -q "権限がありません" && echo 0 || echo 1)" "$CODE $BODY"

echo
echo "=== 日別売上 ==="
rest POST "/rpc/sales_by_day" "$ATOK" "{\"from_date\":\"$TEST_DATE\",\"to_date\":\"$TEST_DATE\"}"
DAY=$(printf '%s' "$BODY" | jq '.[0]')
check "売上が値引き込みで一致する（期待 ¥${EXPECTED_TOTAL}）" \
  "$([ "$(printf '%s' "$DAY" | jq -r '.total')" = "$EXPECTED_TOTAL" ] && echo 0 || echo 1)" "$DAY"
check "明細 0 件の伝票は客数に数えない（期待 1）" \
  "$([ "$(printf '%s' "$DAY" | jq -r '.tab_count')" = "1" ] && echo 0 || echo 1)" "$DAY"
check "明細数が一致する（期待 4）" \
  "$([ "$(printf '%s' "$DAY" | jq -r '.item_count')" = "4" ] && echo 0 || echo 1)" "$DAY"
check "客単価 = 売上 / 伝票枚数（期待 ¥${EXPECTED_TOTAL}）" \
  "$([ "$(printf '%s' "$DAY" | jq -r '.avg_per_tab')" = "$EXPECTED_TOTAL" ] && echo 0 || echo 1)" "$DAY"

rest POST "/rpc/sales_by_day" "$ATOK" '{"from_date":"2026-05-01","to_date":"2026-05-06"}'
check "期間外は含まれない" "$([ "$(printf '%s' "$BODY" | jq 'length')" = "0" ] && echo 0 || echo 1)" "$BODY"

echo
echo "=== 時間帯別（24時越えの正規化） ==="
rest POST "/rpc/sales_by_hour" "$ATOK" "{\"from_date\":\"$TEST_DATE\",\"to_date\":\"$TEST_DATE\"}"
HOURS=$(printf '%s' "$BODY")
h() { printf '%s' "$HOURS" | jq -r --argjson h "$1" '.[] | select(.hour == $h) | .total // empty'; }
check "21時台 = ¥1,600" "$([ "$(h 21)" = "1600" ] && echo 0 || echo 1)" "$HOURS"
check "23時台 = ¥900"   "$([ "$(h 23)" = "900" ] && echo 0 || echo 1)" "$HOURS"
check "0時台ではなく24時台に ¥1,000" \
  "$([ "$(h 24)" = "1000" ] && [ -z "$(h 0)" ] && echo 0 || echo 1)" "$HOURS"
check "1時台ではなく25時台に -¥500" \
  "$([ "$(h 25)" = "-500" ] && [ -z "$(h 1)" ] && echo 0 || echo 1)" "$HOURS"
check "時間帯の合計が日別売上と一致する" \
  "$([ "$(printf '%s' "$HOURS" | jq '[.[].total] | add')" = "$EXPECTED_TOTAL" ] && echo 0 || echo 1)" "$HOURS"

echo
echo "=== 商品別 ==="
rest POST "/rpc/sales_by_product" "$ATOK" "{\"from_date\":\"$TEST_DATE\",\"to_date\":\"$TEST_DATE\"}"
PRODUCTS=$(printf '%s' "$BODY")
p() { printf '%s' "$PRODUCTS" | jq -r --arg n "$1" --arg f "$2" '.[] | select(.name == $n) | .[$f]'; }
check "生ビール 数量2 / 売上¥1,600" \
  "$([ "$(p 生ビール qty)" = "2" ] && [ "$(p 生ビール total)" = "1600" ] && echo 0 || echo 1)" "$PRODUCTS"
check "フリー金額明細「その他」が独立して出る" \
  "$([ "$(p その他 total)" = "1000" ] && echo 0 || echo 1)" "$PRODUCTS"
check "値引きはマイナスのまま出る" \
  "$([ "$(p 値引き total)" = "-500" ] && echo 0 || echo 1)" "$PRODUCTS"
check "売上の降順に並ぶ" \
  "$([ "$(printf '%s' "$PRODUCTS" | jq -r '.[0].name')" = "生ビール" ] && echo 0 || echo 1)" "$PRODUCTS"
check "商品別の合計が日別売上と一致する" \
  "$([ "$(printf '%s' "$PRODUCTS" | jq '[.[].total] | add')" = "$EXPECTED_TOTAL" ] && echo 0 || echo 1)" "$PRODUCTS"

echo
echo "=== 明細の生データ ==="
rest POST "/rpc/sales_items" "$ATOK" "{\"from_date\":\"$TEST_DATE\",\"to_date\":\"$TEST_DATE\"}"
ITEMS=$(printf '%s' "$BODY")
check "明細 4 件 + 空伝票 1 行 = 5 行返る" \
  "$([ "$(printf '%s' "$ITEMS" | jq 'length')" = "5" ] && echo 0 || echo 1)" "$ITEMS"
check "空伝票の行は item_id が null" \
  "$([ "$(printf '%s' "$ITEMS" | jq '[.[] | select(.item_id == null)] | length')" = "1" ] && echo 0 || echo 1)" "$ITEMS"
check "金額列が 単価 x 数量 になっている（生ビール ¥1,600）" \
  "$([ "$(printf '%s' "$ITEMS" | jq -r '.[] | select(.item_name == "生ビール") | .amount')" = "1600" ] && echo 0 || echo 1)" "$ITEMS"
check "客名が入っている" \
  "$([ "$(printf '%s' "$ITEMS" | jq -r '[.[] | select(.guest_name == "集計テスト")] | length')" = "4" ] && echo 0 || echo 1)" "$ITEMS"

echo
echo "=== 後片付け ==="
api DELETE "/order_items?tab_id=in.($TAB1,$TAB2)" >/dev/null
api DELETE "/tabs?id=in.($TAB1,$TAB2)" >/dev/null
api DELETE "/business_days?id=eq.$BD" >/dev/null
for uid in "$ADMIN_ID" "$STAFF_ID"; do
  curl -s -X DELETE "$URL/auth/v1/admin/users/$uid" -H "apikey: $SECRET" -H "Authorization: Bearer $SECRET" >/dev/null
done
echo "  検証用営業日の残り: $(api GET "/business_days?date=eq.$TEST_DATE&select=id" | jq 'length') 件"
echo "  staff の残り:       $(api GET "/staff?select=id" | jq 'length') 件"

echo
echo "=== 結果: PASS=$PASS FAIL=$FAIL ==="
[ "$FAIL" = "0" ]
