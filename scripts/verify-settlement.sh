#!/usr/bin/env bash
# 会計 RPC（settle_tabs / void_payment）の挙動をリモート Supabase の API 経由で確認する。
# テストユーザー2名とテストデータを作り、最後に全て削除する（seed の商品は残る）。
# 実行: bash scripts/verify-settlement.sh   （要: curl, jq, .env.local）
#
# 既に open な営業日がある場合は運用中の可能性があるため中断する。
set -uo pipefail
cd "$(dirname "$0")/.."

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

admin_rest() { # admin_rest METHOD PATH [DATA]
  local m=$1 p=$2 data=${3:-}
  local args=(-s -X "$m" "$URL/rest/v1$p" -H "apikey: $SECRET" -H "Authorization: Bearer $SECRET"
              -H "Content-Type: application/json" -H "Prefer: return=representation" -w $'\n%{http_code}')
  [ -n "$data" ] && args+=(-d "$data")
  local out; out=$(curl "${args[@]}")
  CODE=$(printf '%s' "$out" | tail -n1)
  BODY=$(printf '%s' "$out" | sed '$d')
}

check() {
  if [ "$2" = "0" ]; then PASS=$((PASS+1)); printf '  OK   %s\n' "$1"
  else FAIL=$((FAIL+1)); printf '  NG   %s\n       -> %s\n' "$1" "$3"; fi
}

admin_rest GET "/business_days?status=eq.open&select=id"
if [ "$(printf '%s' "$BODY" | jq 'length')" != "0" ]; then
  echo "open な営業日が既にあります。運用中のデータを壊さないため中断します。"
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
ADMIN_ID=$(mkuser "settle-admin@example.com" "会計テスト管理者")
STAFF_ID=$(mkuser "settle-staff@example.com" "会計テストスタッフ")
admin_rest PATCH "/staff?id=eq.$ADMIN_ID" '{"role":"admin"}' >/dev/null
ATOK=$(login "settle-admin@example.com")
STOK=$(login "settle-staff@example.com")

rest POST "/business_days" "$STOK" '{}'
BD_ID=$(printf '%s' "$BODY" | jq -r '.[0].id')
BD_DATE=$(printf '%s' "$BODY" | jq -r '.[0].date')
EXPECTED_DATE=$(TZ=Asia/Tokyo date -v-6H +%F)
check "営業日の date が朝6時カットオフで決まる (=$BD_DATE)" \
  "$([ "$BD_DATE" = "$EXPECTED_DATE" ] && echo 0 || echo 1)" "期待 $EXPECTED_DATE / 実際 $BD_DATE"

rest GET "/products?select=id,name,price&order=sort_order&limit=2" "$STOK"
P1_ID=$(printf '%s' "$BODY" | jq -r '.[0].id'); P1_PRICE=$(printf '%s' "$BODY" | jq -r '.[0].price')
P2_PRICE=$(printf '%s' "$BODY" | jq -r '.[1].price')
P2_ID=$(printf '%s' "$BODY" | jq -r '.[1].id')

newtab() { # newtab NAME -> id
  local data="{\"business_day_id\":\"$BD_ID\""
  [ -n "${1:-}" ] && data="$data,\"guest_name\":\"$1\""
  rest POST "/tabs" "$STOK" "$data}"
  printf '%s' "$BODY" | jq -r '.[0].id'
}
additem() { # additem TAB_ID PRODUCT_ID PRICE
  rest POST "/order_items" "$STOK" \
    "{\"tab_id\":\"$1\",\"product_id\":\"$2\",\"name_snapshot\":\"商品\",\"price_snapshot\":$3,\"staff_id\":\"$STAFF_ID\"}"
}
rpc() { # rpc NAME TOKEN DATA
  rest POST "/rpc/$1" "$2" "$3"
}

TAB_A=$(newtab "")
TAB_B=$(newtab "田中さん")
TAB_C=$(newtab "")
additem "$TAB_A" "$P1_ID" "$P1_PRICE"
additem "$TAB_A" "$P1_ID" "$P1_PRICE"
additem "$TAB_B" "$P2_ID" "$P2_PRICE"
additem "$TAB_C" "$P1_ID" "$P1_PRICE"
A_TOTAL=$((P1_PRICE * 2))
B_TOTAL=$P2_PRICE

echo
echo "=== 単独会計 ==="
rpc settle_tabs "$STOK" "{\"tab_ids\":[\"$TAB_A\"]}"
PAY_A=$(printf '%s' "$BODY" | tr -d '"')
check "settle_tabs で単独会計できる" "$([ "$CODE" = "200" ] && echo 0 || echo 1)" "$CODE $BODY"

rest GET "/payments?id=eq.$PAY_A&select=total,staff_id,method" "$STOK"
check "合計が明細から再計算される (=¥$A_TOTAL)" \
  "$([ "$(printf '%s' "$BODY" | jq -r '.[0].total')" = "$A_TOTAL" ] && echo 0 || echo 1)" "$BODY"
check "会計したスタッフが記録される" \
  "$([ "$(printf '%s' "$BODY" | jq -r '.[0].staff_id')" = "$STAFF_ID" ] && echo 0 || echo 1)" "$BODY"
check "method は null のまま（v0.1 では記録しない）" \
  "$([ "$(printf '%s' "$BODY" | jq -r '.[0].method')" = "null" ] && echo 0 || echo 1)" "$BODY"

rest GET "/tabs?id=eq.$TAB_A&select=status,payment_id" "$STOK"
check "伝票が paid になり payment に紐づく" \
  "$([ "$(printf '%s' "$BODY" | jq -r '.[0].status')" = "paid" ] && [ "$(printf '%s' "$BODY" | jq -r '.[0].payment_id')" = "$PAY_A" ] && echo 0 || echo 1)" "$BODY"

echo
echo "=== 不正な会計は失敗する ==="
rpc settle_tabs "$STOK" "{\"tab_ids\":[\"$TAB_A\"]}"
check "会計済みの伝票を再会計できない" \
  "$([ "$CODE" != "200" ] && printf '%s' "$BODY" | grep -q "会計済み" && echo 0 || echo 1)" "$CODE $BODY"

rpc settle_tabs "$STOK" '{"tab_ids":[]}'
check "空配列は拒否される" \
  "$([ "$CODE" != "200" ] && echo 0 || echo 1)" "$CODE $BODY"

rpc settle_tabs "$STOK" '{"tab_ids":["00000000-0000-0000-0000-000000000000"]}'
check "存在しない伝票は拒否される" \
  "$([ "$CODE" != "200" ] && printf '%s' "$BODY" | grep -q "存在しない" && echo 0 || echo 1)" "$CODE $BODY"

# 別営業日の伝票を secret key で用意して混ぜる
admin_rest POST "/business_days" '{"date":"2026-01-05","status":"closed","closed_at":"2026-01-06T15:00:00Z"}'
OTHER_BD=$(printf '%s' "$BODY" | jq -r '.[0].id')
admin_rest POST "/tabs" "{\"business_day_id\":\"$OTHER_BD\"}"
OTHER_TAB=$(printf '%s' "$BODY" | jq -r '.[0].id')
rpc settle_tabs "$ATOK" "{\"tab_ids\":[\"$TAB_B\",\"$OTHER_TAB\"]}"
check "営業日をまたぐ伝票は一度に会計できない" \
  "$([ "$CODE" != "200" ] && printf '%s' "$BODY" | grep -q "営業日をまたぐ" && echo 0 || echo 1)" "$CODE $BODY"

echo
echo "=== まとめて会計（1会計 : N伝票） ==="
rpc settle_tabs "$STOK" "{\"tab_ids\":[\"$TAB_B\",\"$TAB_C\"]}"
PAY_BC=$(printf '%s' "$BODY" | tr -d '"')
check "複数伝票を1会計でまとめられる" "$([ "$CODE" = "200" ] && echo 0 || echo 1)" "$CODE $BODY"

rest GET "/tabs?payment_id=eq.$PAY_BC&select=id,status" "$STOK"
check "2枚の伝票が同じ payment に紐づく" \
  "$([ "$(printf '%s' "$BODY" | jq 'length')" = "2" ] && echo 0 || echo 1)" "$BODY"

rest GET "/payments?id=eq.$PAY_BC&select=total" "$STOK"
BC_TOTAL=$((B_TOTAL + P1_PRICE))
check "合算金額が正しい (=¥$BC_TOTAL)" \
  "$([ "$(printf '%s' "$BODY" | jq -r '.[0].total')" = "$BC_TOTAL" ] && echo 0 || echo 1)" "$BODY"

rest GET "/payment_summaries?id=eq.$PAY_BC&select=tab_count,guest_labels,staff_name" "$STOK"
check "payment_summaries に枚数と客名が出る" \
  "$([ "$(printf '%s' "$BODY" | jq -r '.[0].tab_count')" = "2" ] && printf '%s' "$BODY" | grep -q "田中さん" && echo 0 || echo 1)" "$BODY"

echo
echo "=== 伝票一覧から会計済みが消える ==="
rest GET "/tab_summaries?business_day_id=eq.$BD_ID&status=eq.open&select=id" "$STOK"
check "open な伝票が 0 件になる" \
  "$([ "$(printf '%s' "$BODY" | jq 'length')" = "0" ] && echo 0 || echo 1)" "$BODY"

echo
echo "=== 会計取り消し ==="
rpc void_payment "$STOK" "{\"payment_id\":\"$PAY_BC\"}"
V_CODE=$CODE
rest GET "/tabs?id=in.($TAB_B,$TAB_C)&select=status,payment_id" "$STOK"
# void_payment は returns void なので PostgREST の成功応答は 204
check "void_payment で伝票が open に戻る" \
  "$([ "$V_CODE" = "204" ] && [ "$(printf '%s' "$BODY" | jq -r '[.[].status]|unique|join(",")')" = "open" ] && echo 0 || echo 1)" "$V_CODE $BODY"

rest GET "/order_items?tab_id=in.($TAB_B,$TAB_C)&select=id" "$STOK"
check "取り消しても明細は不変（2件）" \
  "$([ "$(printf '%s' "$BODY" | jq 'length')" = "2" ] && echo 0 || echo 1)" "$BODY"

rest GET "/payments?id=eq.$PAY_BC&select=id" "$STOK"
check "payments の行は削除されている" \
  "$([ "$(printf '%s' "$BODY" | jq 'length')" = "0" ] && echo 0 || echo 1)" "$BODY"

rpc void_payment "$STOK" "{\"payment_id\":\"$PAY_BC\"}"
check "存在しない会計の取り消しは拒否される" "$([ "$CODE" != "200" ] && echo 0 || echo 1)" "$CODE $BODY"

echo
echo "=== 同時実行で二重会計にならない ==="
TAB_D=$(newtab "")
additem "$TAB_D" "$P1_ID" "$P1_PRICE"
for i in 1 2 3 4 5; do
  curl -s -X POST "$URL/rest/v1/rpc/settle_tabs" -H "apikey: $PUB" -H "Authorization: Bearer $STOK" \
    -H "Content-Type: application/json" -d "{\"tab_ids\":[\"$TAB_D\"]}" -o /dev/null &
done
wait
rest GET "/payments?select=id&business_day_id=eq.$BD_ID" "$STOK"
BEFORE=$(printf '%s' "$BODY" | jq 'length')
rest GET "/tabs?id=eq.$TAB_D&select=payment_id" "$STOK"
check "同じ伝票への同時会計 5 本でも payment は 1 件だけ (payments=$BEFORE)" \
  "$([ "$BEFORE" = "2" ] && echo 0 || echo 1)" "PAY_A と TAB_D の 2 件が期待値 / 実際 $BEFORE"

echo
echo "=== クローズ済み営業日 ==="
TAB_E=$(newtab "")
additem "$TAB_E" "$P1_ID" "$P1_PRICE"
rest PATCH "/business_days?id=eq.$BD_ID" "$STOK" "{\"status\":\"closed\",\"closed_at\":\"$(date -u +%FT%TZ)\"}"
rpc settle_tabs "$STOK" "{\"tab_ids\":[\"$TAB_E\"]}"
check "クローズ後はスタッフは会計できない" "$([ "$CODE" != "200" ] && echo 0 || echo 1)" "$CODE $BODY"

rpc settle_tabs "$ATOK" "{\"tab_ids\":[\"$TAB_E\"]}"
PAY_E=$(printf '%s' "$BODY" | tr -d '"')
check "クローズ後も admin は会計できる" "$([ "$CODE" = "200" ] && echo 0 || echo 1)" "$CODE $BODY"

rpc void_payment "$STOK" "{\"payment_id\":\"$PAY_E\"}"
check "クローズ後はスタッフは取り消しできない" "$([ "$CODE" != "200" ] && echo 0 || echo 1)" "$CODE $BODY"

rpc void_payment "$ATOK" "{\"payment_id\":\"$PAY_E\"}"
check "クローズ後も admin は取り消しできる" "$([ "$CODE" = "204" ] && echo 0 || echo 1)" "$CODE $BODY"

echo
echo "=== 後片付け ==="
admin_rest DELETE "/order_items?tab_id=in.($TAB_A,$TAB_B,$TAB_C,$TAB_D,$TAB_E,$OTHER_TAB)" >/dev/null
admin_rest DELETE "/tabs?business_day_id=in.($BD_ID,$OTHER_BD)" >/dev/null
admin_rest DELETE "/payments?business_day_id=in.($BD_ID,$OTHER_BD)" >/dev/null
admin_rest DELETE "/business_days?id=in.($BD_ID,$OTHER_BD)" >/dev/null
for uid in "$ADMIN_ID" "$STAFF_ID"; do
  curl -s -X DELETE "$URL/auth/v1/admin/users/$uid" -H "apikey: $SECRET" -H "Authorization: Bearer $SECRET" >/dev/null
done
for t in business_days tabs order_items payments; do
  admin_rest GET "/$t?select=id"
  printf '  残 %-14s %s 件\n' "$t" "$(printf '%s' "$BODY" | jq 'length')"
done

echo
echo "=== 結果: PASS=$PASS FAIL=$FAIL ==="
[ "$FAIL" = "0" ]
