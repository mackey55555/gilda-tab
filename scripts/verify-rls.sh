#!/usr/bin/env bash
# スキーマ制約 + RLS の実挙動をリモート Supabase の API 経由で確認する回帰テスト。
# テストユーザー2名とテストデータを作り、最後に全て削除する（seed の商品は残る）。
# 実行: bash scripts/verify-rls.sh   （要: curl, jq, .env.local）
set -uo pipefail
cd "$(dirname "$0")/.."

set -a; . ./.env.local; set +a
URL="$NEXT_PUBLIC_SUPABASE_URL"
PUB="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
SECRET="${SUPABASE_SECRET_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-}}"
[ -z "$SECRET" ] && { echo "secret key が見つかりません"; exit 1; }

PASS=0; FAIL=0
BODY=""; CODE=""

# rest METHOD PATH TOKEN [DATA]
rest() {
  local m=$1 p=$2 tok=$3 data=${4:-}
  local args=(-s -X "$m" "$URL/rest/v1$p" -H "apikey: $PUB" -H "Content-Type: application/json"
              -H "Prefer: return=representation" -w $'\n%{http_code}')
  [ -n "$tok" ] && args+=(-H "Authorization: Bearer $tok")
  [ -n "$data" ] && args+=(-d "$data")
  local out; out=$(curl "${args[@]}")
  CODE=$(printf '%s' "$out" | tail -n1)
  BODY=$(printf '%s' "$out" | sed '$d')
}

# admin_rest METHOD PATH [DATA]  … secret key（RLS 貫通）でのセットアップ/後片付け用
admin_rest() {
  local m=$1 p=$2 data=${3:-}
  local args=(-s -X "$m" "$URL/rest/v1$p" -H "apikey: $SECRET" -H "Authorization: Bearer $SECRET"
              -H "Content-Type: application/json" -H "Prefer: return=representation" -w $'\n%{http_code}')
  [ -n "$data" ] && args+=(-d "$data")
  local out; out=$(curl "${args[@]}")
  CODE=$(printf '%s' "$out" | tail -n1)
  BODY=$(printf '%s' "$out" | sed '$d')
}

check() { # check <label> <condition-result 0/1> <detail>
  if [ "$2" = "0" ]; then PASS=$((PASS+1)); printf '  OK   %s\n' "$1"
  else FAIL=$((FAIL+1)); printf '  NG   %s\n       -> %s\n' "$1" "$3"; fi
}

# open な営業日があると date のユニーク制約に当たって以降が総崩れになるため、先に止める
admin_rest GET "/business_days?status=eq.open&select=id,date"
if [ "$(printf '%s' "$BODY" | jq 'length')" != "0" ]; then
  echo "open な営業日があります: $(printf '%s' "$BODY" | jq -c '[.[].date]')"
  echo "運用中のデータを壊さないため中断します。営業日をクローズしてから再実行してください。"
  exit 1
fi

echo "=== セットアップ: テストユーザー作成 ==="
mkuser() {
  curl -s -X POST "$URL/auth/v1/admin/users" -H "apikey: $SECRET" -H "Authorization: Bearer $SECRET" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"gilda-test-pw-9182\",\"email_confirm\":true,\"user_metadata\":{\"name\":\"$2\"}}" \
  | jq -r '.id // .msg // .error_description // "ERR"'
}
ADMIN_ID=$(mkuser "rls-test-admin@example.com" "テスト管理者")
STAFF_ID=$(mkuser "rls-test-staff@example.com" "テストスタッフ")
echo "  admin_id=$ADMIN_ID"
echo "  staff_id=$STAFF_ID"

echo "=== T1: auth.users トリガで staff プロフィールが自動生成される ==="
admin_rest GET "/staff?id=in.($ADMIN_ID,$STAFF_ID)&select=id,name,role&order=name"
N=$(printf '%s' "$BODY" | jq 'length')
check "staff 2件が自動作成・role は既定で staff" "$([ "$N" = "2" ] && [ "$(printf '%s' "$BODY" | jq -r '[.[].role]|unique|join(",")')" = "staff" ] && echo 0 || echo 1)" "$BODY"

# 最初の1人を admin に昇格（本番では SQL Editor で実施する手順と同じ）
admin_rest PATCH "/staff?id=eq.$ADMIN_ID" '{"role":"admin"}'
check "secret key で admin へ昇格できる" "$([ "$(printf '%s' "$BODY" | jq -r '.[0].role')" = "admin" ] && echo 0 || echo 1)" "$BODY"

login() {
  curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $PUB" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"gilda-test-pw-9182\"}" | jq -r '.access_token // "ERR"'
}
ATOK=$(login "rls-test-admin@example.com")
STOK=$(login "rls-test-staff@example.com")
[ "$ATOK" = "ERR" ] || [ "$STOK" = "ERR" ] && { echo "ログイン失敗"; }

echo
echo "=== 参照系 ==="
rest GET "/products?select=id" ""
check "未ログイン（anon）は products を読めない" "$([ "$(printf '%s' "$BODY" | jq -r 'if type=="array" then length else "x" end')" = "0" ] && echo 0 || echo 1)" "$CODE $BODY"

rest GET "/products?select=id,name,price,sort_order&order=sort_order" "$STOK"
NP=$(printf '%s' "$BODY" | jq 'length')
SORTED=$(printf '%s' "$BODY" | jq '[.[].sort_order] == ([.[].sort_order] | sort)')
check "スタッフは商品を表示順で読める (取得=${NP}件)" \
  "$([ "$NP" -gt 0 ] && [ "$SORTED" = "true" ] && echo 0 || echo 1)" "$CODE $BODY"
PROD_ID=$(printf '%s' "$BODY" | jq -r '.[0].id')

echo
echo "=== products は admin のみ書き込み可 ==="
rest POST "/products" "$STOK" '{"name":"不正追加","price":100}'
check "スタッフの商品 INSERT は 403" "$([ "$CODE" = "403" ] && echo 0 || echo 1)" "$CODE $BODY"

rest PATCH "/products?id=eq.$PROD_ID" "$STOK" '{"price":1}'
check "スタッフの商品 UPDATE は 0件（RLS で不可視）" "$([ "$(printf '%s' "$BODY" | jq 'length')" = "0" ] && echo 0 || echo 1)" "$CODE $BODY"

rest PATCH "/products?id=eq.$PROD_ID" "$ATOK" '{"sort_order":10}'
check "admin の商品 UPDATE は成功" "$([ "$(printf '%s' "$BODY" | jq 'length')" = "1" ] && echo 0 || echo 1)" "$CODE $BODY"

echo
echo "=== role 昇格の防止 ==="
rest PATCH "/staff?id=eq.$STAFF_ID" "$STOK" '{"role":"admin"}'
check "スタッフが自分の role を直接 UPDATE できない" "$([ "$CODE" != "200" ] && echo 0 || echo 1)" "$CODE $BODY"

rest PATCH "/staff?id=eq.$STAFF_ID" "$STOK" '{"name":"改名テスト"}'
check "スタッフは自分の name を更新できる" "$([ "$(printf '%s' "$BODY" | jq -r '.[0].name')" = "改名テスト" ] && echo 0 || echo 1)" "$CODE $BODY"

rest POST "/rpc/set_staff_role" "$STOK" "{\"target_staff_id\":\"$STAFF_ID\",\"new_role\":\"admin\"}"
check "スタッフの set_staff_role() は拒否される" "$([ "$CODE" != "200" ] && [ "$CODE" != "204" ] && echo 0 || echo 1)" "$CODE $BODY"

rest POST "/rpc/set_staff_role" "$ATOK" "{\"target_staff_id\":\"$STAFF_ID\",\"new_role\":\"admin\"}"
R1=$CODE
rest POST "/rpc/set_staff_role" "$ATOK" "{\"target_staff_id\":\"$STAFF_ID\",\"new_role\":\"staff\"}"
check "admin の set_staff_role() は成功（昇格→降格）" "$([ "$R1" = "200" -o "$R1" = "204" ] && [ "$CODE" = "200" -o "$CODE" = "204" ] && echo 0 || echo 1)" "$R1 / $CODE $BODY"

echo
echo "=== 営業日 ==="
rest POST "/business_days" "$STOK" '{}'
BD_ID=$(printf '%s' "$BODY" | jq -r '.[0].id')
BD_DATE=$(printf '%s' "$BODY" | jq -r '.[0].date')
check "スタッフが営業日を open できる (date=${BD_DATE} 朝6時カットオフ・status=$(printf '%s' "$BODY" | jq -r '.[0].status'))" \
  "$([ "$CODE" = "201" ] && [ "$BD_DATE" = "$(TZ=Asia/Tokyo date -v-6H +%F)" ] && echo 0 || echo 1)" "$CODE $BODY"

rest POST "/business_days" "$STOK" '{}'
check "open 中に 2件目の営業日は作れない（同時open 1件・date ユニーク）" "$([ "$CODE" = "409" ] && echo 0 || echo 1)" "$CODE $BODY"

echo
echo "=== 伝票・明細 ==="
rest POST "/tabs" "$STOK" "{\"business_day_id\":\"$BD_ID\"}"
TAB1=$(printf '%s' "$BODY" | jq -r '.[0].id'); SEQ1=$(printf '%s' "$BODY" | jq -r '.[0].seq')
rest POST "/tabs" "$STOK" "{\"business_day_id\":\"$BD_ID\"}"
TAB2=$(printf '%s' "$BODY" | jq -r '.[0].id'); SEQ2=$(printf '%s' "$BODY" | jq -r '.[0].seq')
check "伝票の seq が営業日ごとに 1,2 と採番される (=$SEQ1,$SEQ2)" "$([ "$SEQ1" = "1" ] && [ "$SEQ2" = "2" ] && echo 0 || echo 1)" "$SEQ1 $SEQ2"
check "新規伝票の status は open（導出列）" "$([ "$(printf '%s' "$BODY" | jq -r '.[0].status')" = "open" ] && echo 0 || echo 1)" "$BODY"

rest POST "/tabs" "$STOK" "{\"business_day_id\":\"$BD_ID\",\"status\":\"paid\"}"
check "status への直接書き込みは拒否される（生成列）" "$([ "$CODE" != "201" ] && echo 0 || echo 1)" "$CODE $BODY"

rest POST "/order_items" "$STOK" "{\"tab_id\":\"$TAB1\",\"product_id\":\"$PROD_ID\",\"name_snapshot\":\"生ビール\",\"price_snapshot\":800,\"staff_id\":\"$STAFF_ID\"}"
C1=$CODE
rest POST "/order_items" "$STOK" "{\"tab_id\":\"$TAB1\",\"product_id\":\"$PROD_ID\",\"name_snapshot\":\"生ビール\",\"price_snapshot\":800,\"staff_id\":\"$STAFF_ID\"}"
check "同一商品を 2回タップ → 明細 2行が追記される（時間帯別集計用）" "$([ "$C1" = "201" ] && [ "$CODE" = "201" ] && echo 0 || echo 1)" "$C1 $CODE $BODY"

rest POST "/order_items" "$STOK" "{\"tab_id\":\"$TAB1\",\"name_snapshot\":\"その他\",\"price_snapshot\":1500}"
C1=$CODE
rest POST "/order_items" "$STOK" "{\"tab_id\":\"$TAB1\",\"name_snapshot\":\"サービス値引き\",\"price_snapshot\":-500}"
check "フリー金額明細（product_id null）と マイナス金額 が入る" "$([ "$C1" = "201" ] && [ "$CODE" = "201" ] && echo 0 || echo 1)" "$C1 $CODE $BODY"

rest POST "/order_items" "$STOK" "{\"tab_id\":\"$TAB1\",\"name_snapshot\":\"不正\",\"price_snapshot\":100,\"qty\":0}"
check "qty=0 は CHECK 制約で拒否" "$([ "$CODE" != "201" ] && echo 0 || echo 1)" "$CODE $BODY"

rest DELETE "/tabs?id=eq.$TAB1" "$STOK"
check "明細のある伝票は削除できない" "$([ "$(printf '%s' "$BODY" | jq 'length')" = "0" ] && echo 0 || echo 1)" "$CODE $BODY"

rest DELETE "/tabs?id=eq.$TAB2" "$STOK"
check "明細0件の伝票は削除できる" "$([ "$(printf '%s' "$BODY" | jq 'length')" = "1" ] && echo 0 || echo 1)" "$CODE $BODY"

echo
echo "=== 会計と取り消し ==="
rest GET "/order_items?tab_id=eq.$TAB1&select=price_snapshot,qty" "$STOK"
TOTAL=$(printf '%s' "$BODY" | jq '[.[] | .price_snapshot * .qty] | add')
rest POST "/payments" "$STOK" "{\"business_day_id\":\"$BD_ID\",\"total\":$TOTAL,\"staff_id\":\"$STAFF_ID\"}"
PAY_ID=$(printf '%s' "$BODY" | jq -r '.[0].id')
check "会計を作成できる (明細合計=$TOTAL 円)" "$([ "$CODE" = "201" ] && [ "$TOTAL" = "2600" ] && echo 0 || echo 1)" "$CODE $TOTAL $BODY"

rest PATCH "/tabs?id=eq.$TAB1" "$STOK" "{\"payment_id\":\"$PAY_ID\"}"
check "伝票に会計を紐づけると status が paid に変わる" "$([ "$(printf '%s' "$BODY" | jq -r '.[0].status')" = "paid" ] && echo 0 || echo 1)" "$CODE $BODY"

# 別営業日の会計を紐づけようとする（トリガ検証）。営業日は secret key で過去日として作る。
admin_rest POST "/business_days" "{\"date\":\"2026-01-01\",\"status\":\"closed\",\"closed_at\":\"2026-01-02T15:00:00Z\"}"
OTHER_BD=$(printf '%s' "$BODY" | jq -r '.[0].id')
admin_rest POST "/payments" "{\"business_day_id\":\"$OTHER_BD\",\"total\":100}"
OTHER_PAY=$(printf '%s' "$BODY" | jq -r '.[0].id')
rest PATCH "/tabs?id=eq.$TAB1" "$ATOK" "{\"payment_id\":\"$OTHER_PAY\"}"
check "別営業日の会計を伝票に紐づけるとトリガで拒否" "$([ "$CODE" != "200" ] && echo 0 || echo 1)" "$CODE $BODY"

rest DELETE "/payments?id=eq.$PAY_ID" "$STOK"
D1=$CODE
rest GET "/tabs?id=eq.$TAB1&select=status,payment_id" "$STOK"
check "会計を削除すると伝票が open に戻る（明細は不変）" "$([ "$(printf '%s' "$BODY" | jq -r '.[0].status')" = "open" ] && [ "$(printf '%s' "$BODY" | jq -r '.[0].payment_id')" = "null" ] && echo 0 || echo 1)" "$D1 $BODY"

rest GET "/order_items?tab_id=eq.$TAB1&select=id" "$STOK"
check "会計取消後も明細 4行が残る" "$([ "$(printf '%s' "$BODY" | jq 'length')" = "4" ] && echo 0 || echo 1)" "$BODY"

echo
echo "=== 営業日クローズ後の凍結 ==="
rest PATCH "/business_days?id=eq.$BD_ID" "$STOK" "{\"status\":\"closed\",\"closed_at\":\"$(date -u +%FT%TZ)\"}"
check "スタッフが営業日をクローズできる" "$([ "$(printf '%s' "$BODY" | jq -r '.[0].status')" = "closed" ] && echo 0 || echo 1)" "$CODE $BODY"

rest POST "/order_items" "$STOK" "{\"tab_id\":\"$TAB1\",\"name_snapshot\":\"締め後追加\",\"price_snapshot\":100}"
check "クローズ済み営業日にスタッフは明細を追加できない" "$([ "$CODE" = "403" ] && echo 0 || echo 1)" "$CODE $BODY"

rest POST "/tabs" "$STOK" "{\"business_day_id\":\"$BD_ID\"}"
check "クローズ済み営業日にスタッフは伝票を作れない" "$([ "$CODE" = "403" ] && echo 0 || echo 1)" "$CODE $BODY"

rest POST "/order_items" "$ATOK" "{\"tab_id\":\"$TAB1\",\"name_snapshot\":\"admin修正\",\"price_snapshot\":100}"
ADMIN_ITEM=$(printf '%s' "$BODY" | jq -r '.[0].id')
check "admin はクローズ済み営業日のデータを修正できる" "$([ "$CODE" = "201" ] && echo 0 || echo 1)" "$CODE $BODY"

rest PATCH "/business_days?id=eq.$BD_ID" "$STOK" '{"opened_at":"2020-01-01T00:00:00Z"}'
check "スタッフはクローズ済み営業日を編集できない" "$([ "$(printf '%s' "$BODY" | jq 'length')" = "0" ] && echo 0 || echo 1)" "$CODE $BODY"

NEXT_DATE=$(TZ=Asia/Tokyo date -v+1d +%F)
rest POST "/business_days" "$STOK" "{\"date\":\"$NEXT_DATE\"}"
NEXT_BD=$(printf '%s' "$BODY" | jq -r '.[0].id')
check "前営業日がクローズ済みなら次の営業日を open できる ($NEXT_DATE)" "$([ "$CODE" = "201" ] && echo 0 || echo 1)" "$CODE $BODY"

echo
echo "=== 後片付け ==="
admin_rest DELETE "/order_items?tab_id=eq.$TAB1" >/dev/null
admin_rest DELETE "/tabs?business_day_id=in.($BD_ID,$OTHER_BD,$NEXT_BD)" >/dev/null
admin_rest DELETE "/payments?business_day_id=in.($BD_ID,$OTHER_BD,$NEXT_BD)" >/dev/null
admin_rest DELETE "/business_days?id=in.($BD_ID,$OTHER_BD,$NEXT_BD)" >/dev/null
for uid in "$ADMIN_ID" "$STAFF_ID"; do
  curl -s -X DELETE "$URL/auth/v1/admin/users/$uid" -H "apikey: $SECRET" -H "Authorization: Bearer $SECRET" >/dev/null
done
admin_rest GET "/staff?select=id"
echo "  残 staff: $(printf '%s' "$BODY" | jq 'length') 件"
admin_rest GET "/business_days?select=id"
echo "  残 business_days: $(printf '%s' "$BODY" | jq 'length') 件"
admin_rest GET "/tabs?select=id"
echo "  残 tabs: $(printf '%s' "$BODY" | jq 'length') 件"
admin_rest GET "/order_items?select=id"
echo "  残 order_items: $(printf '%s' "$BODY" | jq 'length') 件"
admin_rest GET "/payments?select=id"
echo "  残 payments: $(printf '%s' "$BODY" | jq 'length') 件"
admin_rest GET "/products?select=id"
echo "  残 products: $(printf '%s' "$BODY" | jq 'length') 件（検証前と同数なら正しい）"

echo
echo "=== 結果: PASS=$PASS FAIL=$FAIL ==="
