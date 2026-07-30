#!/usr/bin/env bash
# /admin まわりの権限と RPC（move_product / staff_directory / set_staff_role）を確認する。
# テストユーザー2名とテスト商品を作り、最後に全て削除する。
# 実行: bash scripts/verify-admin.sh   （要: curl, jq, .env.local）
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
ADMIN_ID=$(mkuser "admin-test@example.com" "管理テスト")
STAFF_ID=$(mkuser "staff-test@example.com" "一般テスト")
admin_rest PATCH "/staff?id=eq.$ADMIN_ID" '{"role":"admin"}' >/dev/null
ATOK=$(login "admin-test@example.com")
STOK=$(login "staff-test@example.com")

echo
echo "=== スタッフ一覧（メールアドレスの露出） ==="
rest POST "/rpc/staff_directory" "$STOK" '{}'
check "スタッフは staff_directory() を呼べない" \
  "$([ "$CODE" != "200" ] && echo 0 || echo 1)" "$CODE $BODY"

rest POST "/rpc/staff_directory" "$ATOK" '{}'
check "admin は staff_directory() でメール付き一覧を取れる" \
  "$([ "$CODE" = "200" ] && printf '%s' "$BODY" | grep -q "admin-test@example.com" && echo 0 || echo 1)" "$CODE $BODY"

rest GET "/staff?select=id,name,role" "$STOK"
check "staff テーブル自体はスタッフも読める（メールは含まない）" \
  "$([ "$CODE" = "200" ] && ! printf '%s' "$BODY" | grep -q "@example.com" && echo 0 || echo 1)" "$CODE $BODY"

echo
echo "=== role 変更 ==="
rest POST "/rpc/set_staff_role" "$STOK" "{\"target_staff_id\":\"$STAFF_ID\",\"new_role\":\"admin\"}"
check "スタッフは自分を管理者にできない" "$([ "$CODE" != "204" ] && echo 0 || echo 1)" "$CODE $BODY"

rest POST "/rpc/set_staff_role" "$ATOK" "{\"target_staff_id\":\"$STAFF_ID\",\"new_role\":\"admin\"}"
check "admin は他人を管理者にできる" "$([ "$CODE" = "204" ] && echo 0 || echo 1)" "$CODE $BODY"

rest POST "/rpc/set_staff_role" "$ATOK" "{\"target_staff_id\":\"$STAFF_ID\",\"new_role\":\"staff\"}"
check "admin は降格もできる（他に管理者がいる場合）" "$([ "$CODE" = "204" ] && echo 0 || echo 1)" "$CODE $BODY"

# 既存の管理者（本番アカウント）を一時的に外して「最後の1人」を作る
admin_rest GET "/staff?role=eq.admin&id=neq.$ADMIN_ID&select=id"
OTHER_ADMINS=$(printf '%s' "$BODY" | jq -r '.[].id')
for id in $OTHER_ADMINS; do admin_rest PATCH "/staff?id=eq.$id" '{"role":"staff"}' >/dev/null; done

rest POST "/rpc/set_staff_role" "$ATOK" "{\"target_staff_id\":\"$ADMIN_ID\",\"new_role\":\"staff\"}"
check "最後の管理者は降格できない" \
  "$([ "$CODE" != "204" ] && printf '%s' "$BODY" | grep -q "管理者が 0 人" && echo 0 || echo 1)" "$CODE $BODY"

for id in $OTHER_ADMINS; do admin_rest PATCH "/staff?id=eq.$id" '{"role":"admin"}' >/dev/null; done

echo
echo "=== 商品マスタの権限 ==="
rest POST "/products" "$ATOK" '{"name":"検証用A","price":100,"category":"検証","sort_order":9001}'
PA=$(printf '%s' "$BODY" | jq -r '.[0].id')
rest POST "/products" "$ATOK" '{"name":"検証用B","price":200,"category":"検証","sort_order":9002}'
PB=$(printf '%s' "$BODY" | jq -r '.[0].id')
check "admin は商品を追加できる" "$([ "$CODE" = "201" ] && echo 0 || echo 1)" "$CODE $BODY"

rest POST "/products" "$STOK" '{"name":"不正","price":1}'
check "スタッフは商品を追加できない" "$([ "$CODE" = "403" ] && echo 0 || echo 1)" "$CODE $BODY"

rest PATCH "/products?id=eq.$PA" "$STOK" '{"price":1}'
check "スタッフは商品を編集できない（0件）" \
  "$([ "$(printf '%s' "$BODY" | jq 'length')" = "0" ] && echo 0 || echo 1)" "$CODE $BODY"

rest PATCH "/products?id=eq.$PA" "$ATOK" '{"is_active":false}'
check "admin は無効化できる" \
  "$([ "$(printf '%s' "$BODY" | jq -r '.[0].is_active')" = "false" ] && echo 0 || echo 1)" "$CODE $BODY"
rest PATCH "/products?id=eq.$PA" "$ATOK" '{"is_active":true}' >/dev/null

echo
echo "=== 表示順の入れ替え ==="
rest POST "/rpc/move_product" "$STOK" "{\"target_product_id\":\"$PA\",\"direction\":\"down\"}"
check "スタッフは並べ替えできない" "$([ "$CODE" != "204" ] && echo 0 || echo 1)" "$CODE $BODY"

rest GET "/products?select=id,name,sort_order&order=sort_order.asc,name.asc" "$ATOK"
BEFORE_A=$(printf '%s' "$BODY" | jq -r --arg id "$PA" 'map(.id) | index($id)')
BEFORE_B=$(printf '%s' "$BODY" | jq -r --arg id "$PB" 'map(.id) | index($id)')

rest POST "/rpc/move_product" "$ATOK" "{\"target_product_id\":\"$PA\",\"direction\":\"down\"}"
M_CODE=$CODE
rest GET "/products?select=id,name,sort_order&order=sort_order.asc,name.asc" "$ATOK"
AFTER_A=$(printf '%s' "$BODY" | jq -r --arg id "$PA" 'map(.id) | index($id)')
AFTER_B=$(printf '%s' "$BODY" | jq -r --arg id "$PB" 'map(.id) | index($id)')
check "admin は下へ移動できる（A:${BEFORE_A}→${AFTER_A} / B:${BEFORE_B}→${AFTER_B}）" \
  "$([ "$M_CODE" = "204" ] && [ "$AFTER_A" = "$BEFORE_B" ] && [ "$AFTER_B" = "$BEFORE_A" ] && echo 0 || echo 1)" \
  "$M_CODE / A ${BEFORE_A}→${AFTER_A} B ${BEFORE_B}→${AFTER_B}"

rest POST "/rpc/move_product" "$ATOK" "{\"target_product_id\":\"$PA\",\"direction\":\"up\"}"
rest GET "/products?select=id&order=sort_order.asc,name.asc" "$ATOK"
BACK_A=$(printf '%s' "$BODY" | jq -r --arg id "$PA" 'map(.id) | index($id)')
check "上へ移動で元の位置に戻る" "$([ "$BACK_A" = "$BEFORE_A" ] && echo 0 || echo 1)" "$BACK_A vs $BEFORE_A"

rest GET "/products?select=sort_order&order=sort_order.asc" "$ATOK"
DUP=$(printf '%s' "$BODY" | jq '[.[].sort_order] | (length - (unique | length))')
check "並べ替え後も sort_order が重複しない" "$([ "$DUP" = "0" ] && echo 0 || echo 1)" "重複 $DUP 件"

rest POST "/rpc/move_product" "$ATOK" "{\"target_product_id\":\"$PA\",\"direction\":\"sideways\"}"
check "不正な方向は拒否される" "$([ "$CODE" != "204" ] && echo 0 || echo 1)" "$CODE $BODY"

echo
echo "=== 削除の可否（注文実績あり / なし） ==="
rest GET "/rpc/product_is_used?target_product_id=$PA" "$ATOK"
check "未使用の商品は product_is_used が false" "$([ "$BODY" = "false" ] && echo 0 || echo 1)" "$BODY"

# 注文実績を作るために営業日と伝票を用意する
admin_rest POST "/business_days" '{"date":"2026-01-09","status":"closed","closed_at":"2026-01-10T15:00:00Z"}'
BD=$(printf '%s' "$BODY" | jq -r '.[0].id')
admin_rest POST "/tabs" "{\"business_day_id\":\"$BD\"}"
TAB=$(printf '%s' "$BODY" | jq -r '.[0].id')
admin_rest POST "/order_items" \
  "{\"tab_id\":\"$TAB\",\"product_id\":\"$PB\",\"name_snapshot\":\"検証用B\",\"price_snapshot\":200}" >/dev/null

rest GET "/rpc/product_is_used?target_product_id=$PB" "$ATOK"
check "注文実績のある商品は product_is_used が true" "$([ "$BODY" = "true" ] && echo 0 || echo 1)" "$BODY"

rest DELETE "/products?id=eq.$PB" "$ATOK"
check "注文実績のある商品は admin でも削除できない（0件）" \
  "$([ "$(printf '%s' "$BODY" | jq 'length')" = "0" ] && echo 0 || echo 1)" "$CODE $BODY"

rest DELETE "/products?id=eq.$PA" "$ATOK"
check "未使用の商品は削除できる" \
  "$([ "$(printf '%s' "$BODY" | jq 'length')" = "1" ] && echo 0 || echo 1)" "$CODE $BODY"

echo
echo "=== 後片付け ==="
admin_rest DELETE "/order_items?tab_id=eq.$TAB" >/dev/null
admin_rest DELETE "/tabs?id=eq.$TAB" >/dev/null
admin_rest DELETE "/business_days?id=eq.$BD" >/dev/null
admin_rest DELETE "/products?id=in.($PA,$PB)" >/dev/null
for uid in "$ADMIN_ID" "$STAFF_ID"; do
  curl -s -X DELETE "$URL/auth/v1/admin/users/$uid" -H "apikey: $SECRET" -H "Authorization: Bearer $SECRET" >/dev/null
done
admin_rest GET "/products?select=id"
echo "  残 products: $(printf '%s' "$BODY" | jq 'length') 件"
admin_rest GET "/staff?select=id,role"
echo "  残 staff:    $(printf '%s' "$BODY" | jq -c 'map(.role)')"

echo
echo "=== 結果: PASS=$PASS FAIL=$FAIL ==="
[ "$FAIL" = "0" ]
