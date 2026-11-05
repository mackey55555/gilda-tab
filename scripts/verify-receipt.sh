#!/usr/bin/env bash
# 電子領収書（shop_settings / receipts / issue_receipt / get_receipt / finalize_receipt）を
# リモート Supabase の API 経由で確認する。
# テストユーザー2名とテストデータを作り、最後に「このスクリプトが作った行」だけを削除する。
# 実行: bash scripts/verify-receipt.sh   （要: curl, jq, .env.local）
#
# 既に open な営業日がある場合は運用中の可能性があるため中断する。
# 領収書番号のカウンタ（receipt_counters）は今日の日付の分を消費するので、
# 終了時に「テスト前の値 + このスクリプトが払い出した数」と一致するときだけテスト前の値へ戻す。
# 一致しない（テスト中に本物の領収書が確定された）場合は番号の重複を避けるため戻さずに警告する。
set -uo pipefail
cd "$(dirname "$0")/.."

set -a; . ./.env.local; set +a
URL="$NEXT_PUBLIC_SUPABASE_URL"
PUB="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
SECRET="${SUPABASE_SECRET_KEY:-}"
[ -z "$SECRET" ] && { echo "secret key が見つかりません"; exit 1; }

PASS=0; FAIL=0
BODY=""; CODE=""

rest() { # rest METHOD PATH TOKEN [DATA]   TOKEN が空なら anon（publishable key のみ）
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
ok() { [ "$1" ] && echo 0 || echo 1; }
rpc() { rest POST "/rpc/$1" "$2" "$3"; }

admin_rest GET "/business_days?status=eq.open&select=id"
if [ "$(printf '%s' "$BODY" | jq 'length')" != "0" ]; then
  echo "open な営業日が既にあります。運用中のデータを壊さないため中断します。"
  exit 1
fi

TODAY=$(TZ=Asia/Tokyo date +%F)
TODAY_COMPACT=$(TZ=Asia/Tokyo date +%Y%m%d)
admin_rest GET "/receipt_counters?receipt_date=eq.$TODAY&select=last_seq"
COUNTER_BEFORE=$(printf '%s' "$BODY" | jq -r '.[0].last_seq // "none"')
ISSUED_NUMBERS=0

ADMIN_ID=""; STAFF_ID=""; BD_ID=""; TAB_IDS=(); PAY_IDS=()
cleanup() {
  echo
  echo "=== 後片付け（このスクリプトが作った行のみ） ==="
  if [ ${#PAY_IDS[@]} -gt 0 ]; then
    local pays; pays=$(IFS=,; echo "${PAY_IDS[*]}")
    admin_rest DELETE "/receipts?payment_id=in.($pays)" >/dev/null
  fi
  if [ ${#TAB_IDS[@]} -gt 0 ]; then
    local tabs; tabs=$(IFS=,; echo "${TAB_IDS[*]}")
    admin_rest DELETE "/order_items?tab_id=in.($tabs)" >/dev/null
    admin_rest DELETE "/tabs?id=in.($tabs)" >/dev/null
  fi
  if [ ${#PAY_IDS[@]} -gt 0 ]; then
    admin_rest DELETE "/payments?id=in.($(IFS=,; echo "${PAY_IDS[*]}"))" >/dev/null
  fi
  [ -n "$BD_ID" ] && admin_rest DELETE "/business_days?id=eq.$BD_ID" >/dev/null
  for uid in "$ADMIN_ID" "$STAFF_ID"; do
    [ -n "$uid" ] && curl -s -X DELETE "$URL/auth/v1/admin/users/$uid" \
      -H "apikey: $SECRET" -H "Authorization: Bearer $SECRET" >/dev/null
  done

  admin_rest GET "/receipt_counters?receipt_date=eq.$TODAY&select=last_seq"
  local now; now=$(printf '%s' "$BODY" | jq -r '.[0].last_seq // "none"')
  local expected
  if [ "$COUNTER_BEFORE" = "none" ]; then expected=$ISSUED_NUMBERS; else expected=$((COUNTER_BEFORE + ISSUED_NUMBERS)); fi
  if [ "$ISSUED_NUMBERS" = "0" ]; then
    :
  elif [ "$now" = "$expected" ]; then
    if [ "$COUNTER_BEFORE" = "none" ]; then
      admin_rest DELETE "/receipt_counters?receipt_date=eq.$TODAY" >/dev/null
    else
      admin_rest PATCH "/receipt_counters?receipt_date=eq.$TODAY" "{\"last_seq\":$COUNTER_BEFORE}" >/dev/null
    fi
    echo "  receipt_counters($TODAY) をテスト前の値（${COUNTER_BEFORE}）へ戻しました"
  else
    echo "  ⚠ receipt_counters($TODAY) がテスト中に他から進んでいます（${now}）。番号重複を避けるため戻しません"
  fi

  admin_rest GET "/receipts?select=id"
  printf '  残 receipts %s 件\n' "$(printf '%s' "$BODY" | jq 'length')"
}
trap cleanup EXIT

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
ADMIN_ID=$(mkuser "receipt-admin@example.com" "領収書テスト管理者")
STAFF_ID=$(mkuser "receipt-staff@example.com" "領収書テストスタッフ")
admin_rest PATCH "/staff?id=eq.$ADMIN_ID" '{"role":"admin"}' >/dev/null
ATOK=$(login "receipt-admin@example.com")
STOK=$(login "receipt-staff@example.com")

rest POST "/business_days" "$STOK" '{}'
BD_ID=$(printf '%s' "$BODY" | jq -r '.[0].id')

rest GET "/products?select=id,price&order=sort_order&limit=1" "$STOK"
P_ID=$(printf '%s' "$BODY" | jq -r '.[0].id'); P_PRICE=$(printf '%s' "$BODY" | jq -r '.[0].price')

newtab() {
  rest POST "/tabs" "$STOK" "{\"business_day_id\":\"$BD_ID\"}"
  local id; id=$(printf '%s' "$BODY" | jq -r '.[0].id')
  TAB_IDS+=("$id"); printf '%s' "$id"
}
additem() { # additem TAB_ID PRICE
  rest POST "/order_items" "$STOK" \
    "{\"tab_id\":\"$1\",\"product_id\":null,\"name_snapshot\":\"テスト\",\"price_snapshot\":$2,\"staff_id\":\"$STAFF_ID\"}"
}
settle() { # settle TAB_ID -> payment id（PAY_IDS にも積む）
  rpc settle_tabs "$STOK" "{\"tab_ids\":[\"$1\"]}"
  local id; id=$(printf '%s' "$BODY" | tr -d '"')
  PAY_IDS+=("$id"); printf '%s' "$id"
}

# newtab / settle は $( ) の中で呼ぶと配列への追加がサブシェルに閉じるため、直接呼んでから値を取り出す
newtab >/dev/null; TAB_A=${TAB_IDS[-1]}
additem "$TAB_A" 3300
additem "$TAB_A" "$P_PRICE"
A_TOTAL=$((3300 + P_PRICE))
A_TAX=$((A_TOTAL - A_TOTAL * 10 / 11))
settle "$TAB_A" >/dev/null; PAY_A=${PAY_IDS[-1]}

echo
echo "=== anon からは何も見えない ==="
for t in receipts shop_settings receipt_counters; do
  rest GET "/$t?select=*" ""
  check "anon は $t を読めない" "$(ok "$( [ "$CODE" != "200" ] || [ "$(printf '%s' "$BODY" | jq 'length')" = "0" ] && echo y)")" "$CODE $BODY"
done
rpc issue_receipt "" "{\"target_payment_id\":\"$PAY_A\"}"
check "anon は issue_receipt を実行できない" "$(ok "$([ "$CODE" != "200" ] && echo y)")" "$CODE $BODY"
rpc receipt_amount "" "{\"target_payment_id\":\"$PAY_A\"}"
check "anon は内部ヘルパ receipt_amount を実行できない" "$(ok "$([ "$CODE" != "200" ] && echo y)")" "$CODE $BODY"

echo
echo "=== 店舗設定 ==="
rest GET "/shop_settings?select=*" "$STOK"
check "スタッフは店舗設定を読める（1 行）" "$(ok "$([ "$(printf '%s' "$BODY" | jq 'length')" = "1" ] && echo y)")" "$BODY"
SHOP_PHONE=$(printf '%s' "$BODY" | jq -r '.[0].phone')
rest PATCH "/shop_settings?id=eq.true" "$STOK" '{"phone":"000"}'
check "スタッフは店舗設定を変更できない" "$(ok "$([ "$(printf '%s' "$BODY" | jq 'length')" = "0" ] || [ "$CODE" != "200" ] && echo y)")" "$CODE $BODY"
rest POST "/shop_settings" "$ATOK" '{"id":true,"name":"x","address":"x","phone":"x"}'
check "admin でも 2 行目は作れない" "$(ok "$([ "$CODE" != "201" ] && echo y)")" "$CODE $BODY"

echo
echo "=== リンク発行 ==="
rpc issue_receipt "$STOK" "{\"target_payment_id\":\"$PAY_A\"}"
TOKEN=$(printf '%s' "$BODY" | tr -d '"')
check "スタッフが発行できる（64 桁の 16 進）" "$(ok "$([ "$CODE" = "200" ] && [[ "$TOKEN" =~ ^[0-9a-f]{64}$ ]] && echo y)")" "$CODE $BODY"
rpc issue_receipt "$STOK" "{\"target_payment_id\":\"$PAY_A\"}"
check "再発行しても同じトークン" "$(ok "$([ "$(printf '%s' "$BODY" | tr -d '"')" = "$TOKEN" ] && echo y)")" "$BODY"
rest GET "/receipts?payment_id=eq.$PAY_A&select=expires_at" "$STOK"
EXP=$(printf '%s' "$BODY" | jq -r '.[0].expires_at')
check "有効期限が約 45 日後（${EXP}）" "$(ok "$(TZ=UTC date -j -f %Y-%m-%d "${EXP:0:10}" +%s >/dev/null 2>&1 && \
  d=$(( ( $(TZ=UTC date -j -f %Y-%m-%d "${EXP:0:10}" +%s) - $(TZ=UTC date -j -f %Y-%m-%d "$(TZ=UTC date +%F)" +%s) ) / 86400 )) && \
  [ "$d" -ge 44 ] && [ "$d" -le 46 ] && echo y)")" "$EXP"

echo
echo "=== 確定前の表示（anon） ==="
rpc get_receipt "" "{\"receipt_token\":\"$TOKEN\"}"
R=$(printf '%s' "$BODY" | jq '.[0]')
check "anon がトークンで読める" "$(ok "$([ "$CODE" = "200" ] && [ "$(printf '%s' "$BODY" | jq 'length')" = "1" ] && echo y)")" "$CODE $BODY"
check "未確定・番号なし" "$(ok "$([ "$(jq -r .finalized <<<"$R")" = "false" ] && [ "$(jq -r .number <<<"$R")" = "null" ] && echo y)")" "$R"
check "金額が明細から計算される (=¥$A_TOTAL / 税 ¥$A_TAX)" \
  "$(ok "$([ "$(jq -r .amount <<<"$R")" = "$A_TOTAL" ] && [ "$(jq -r .tax <<<"$R")" = "$A_TAX" ] && echo y)")" "$R"
check "取引日が JST の今日 (=$TODAY)" "$(ok "$([ "$(jq -r .receipt_date <<<"$R")" = "$TODAY" ] && echo y)")" "$R"
check "発行者が店舗設定から出る" "$(ok "$([ "$(jq -r .issuer_phone <<<"$R")" = "$SHOP_PHONE" ] && echo y)")" "$R"
rpc get_receipt "" '{"receipt_token":"0000000000000000000000000000000000000000000000000000000000000000"}'
check "存在しないトークンは 0 行" "$(ok "$([ "$(printf '%s' "$BODY" | jq 'length')" = "0" ] && echo y)")" "$BODY"

echo
echo "=== 宛名の検証 ==="
rpc finalize_receipt "" "{\"receipt_token\":\"$TOKEN\",\"addressee\":\"$(printf 'あ%.0s' {1..41})\"}"
check "41 文字の宛名は拒否" "$(ok "$([ "$CODE" != "200" ] && echo y)")" "$CODE $BODY"
rpc finalize_receipt "" "{\"receipt_token\":\"$TOKEN\",\"addressee\":\"株式会社\\nテスト\"}"
check "制御文字を含む宛名は拒否" "$(ok "$([ "$CODE" != "200" ] && echo y)")" "$CODE $BODY"

echo
echo "=== 確定（anon） ==="
rpc finalize_receipt "" "{\"receipt_token\":\"$TOKEN\",\"addressee\":\"  テスト株式会社  \"}"
NUM_A=$(printf '%s' "$BODY" | tr -d '"')
[ "$CODE" = "200" ] && ISSUED_NUMBERS=$((ISSUED_NUMBERS + 1))
check "確定すると番号が出る（${NUM_A}）" "$(ok "$([ "$CODE" = "200" ] && [[ "$NUM_A" =~ ^${TODAY_COMPACT}-[0-9]{3}$ ]] && echo y)")" "$CODE $BODY"
rpc finalize_receipt "" "{\"receipt_token\":\"$TOKEN\",\"addressee\":\"別の宛名\"}"
check "2 回目の確定は拒否" "$(ok "$([ "$CODE" != "200" ] && printf '%s' "$BODY" | grep -q "発行済み" && echo y)")" "$CODE $BODY"

# 確定後に明細が増えても、渡した領収書の内容は変わらない。
# 会計済み伝票への追加が RLS で弾かれると検証にならないので secret key で確実に入れる。
admin_rest POST "/order_items" \
  "{\"tab_id\":\"$TAB_A\",\"product_id\":null,\"name_snapshot\":\"テスト\",\"price_snapshot\":1000,\"staff_id\":\"$STAFF_ID\"}"
check "（準備）確定後の明細追加" "$(ok "$([ "$CODE" = "201" ] && echo y)")" "$CODE $BODY"
rpc get_receipt "" "{\"receipt_token\":\"$TOKEN\"}"
R=$(printf '%s' "$BODY" | jq '.[0]')
check "宛名が前後の空白を除いて保存される" "$(ok "$([ "$(jq -r .addressee <<<"$R")" = "テスト株式会社" ] && echo y)")" "$R"
check "確定後は金額がスナップショットのまま（明細追加の影響なし）" \
  "$(ok "$([ "$(jq -r .amount <<<"$R")" = "$A_TOTAL" ] && [ "$(jq -r .finalized <<<"$R")" = "true" ] && echo y)")" "$R"

echo
echo "=== 空欄は上様 ==="
newtab >/dev/null; TAB_B=${TAB_IDS[-1]}
additem "$TAB_B" 1100
settle "$TAB_B" >/dev/null; PAY_B=${PAY_IDS[-1]}
rpc issue_receipt "$STOK" "{\"target_payment_id\":\"$PAY_B\"}"; TOKEN_B=$(printf '%s' "$BODY" | tr -d '"')
rpc finalize_receipt "" "{\"receipt_token\":\"$TOKEN_B\",\"addressee\":\"\"}"
NUM_B=$(printf '%s' "$BODY" | tr -d '"')
[ "$CODE" = "200" ] && ISSUED_NUMBERS=$((ISSUED_NUMBERS + 1))
rpc get_receipt "" "{\"receipt_token\":\"$TOKEN_B\"}"
check "宛名空欄で確定すると「上様」" "$(ok "$([ "$(printf '%s' "$BODY" | jq -r '.[0].addressee')" = "上様" ] && echo y)")" "$BODY"
check "番号が連番で進む（$NUM_A → ${NUM_B}）" "$(ok "$([ "$((10#${NUM_B##*-}))" = "$((10#${NUM_A##*-} + 1))" ] && echo y)")" "$NUM_A $NUM_B"

echo
echo "=== 会計取り消し後も番号を再利用しない ==="
rpc void_payment "$STOK" "{\"payment_id\":\"$PAY_B\"}"
rpc get_receipt "" "{\"receipt_token\":\"$TOKEN_B\"}"
check "取り消すとリンクが開けなくなる" "$(ok "$([ "$(printf '%s' "$BODY" | jq 'length')" = "0" ] && echo y)")" "$BODY"
settle "$TAB_B" >/dev/null; PAY_B2=${PAY_IDS[-1]}
rpc issue_receipt "$STOK" "{\"target_payment_id\":\"$PAY_B2\"}"; TOKEN_B2=$(printf '%s' "$BODY" | tr -d '"')
check "再会計の領収書は別のトークン" "$(ok "$([ "$TOKEN_B2" != "$TOKEN_B" ] && echo y)")" "$TOKEN_B2"
rpc finalize_receipt "" "{\"receipt_token\":\"$TOKEN_B2\",\"addressee\":\"\"}"
NUM_B2=$(printf '%s' "$BODY" | tr -d '"')
[ "$CODE" = "200" ] && ISSUED_NUMBERS=$((ISSUED_NUMBERS + 1))
check "取り消した番号（${NUM_B}）は再利用されない（${NUM_B2}）" "$(ok "$([ -n "$NUM_B2" ] && [ "$NUM_B2" != "$NUM_B" ] && echo y)")" "$NUM_B $NUM_B2"

echo
echo "=== 有効期限 ==="
newtab >/dev/null; TAB_C=${TAB_IDS[-1]}
additem "$TAB_C" 500
settle "$TAB_C" >/dev/null; PAY_C=${PAY_IDS[-1]}
rpc issue_receipt "$STOK" "{\"target_payment_id\":\"$PAY_C\"}"; TOKEN_C=$(printf '%s' "$BODY" | tr -d '"')
admin_rest PATCH "/receipts?payment_id=eq.$PAY_C" '{"expires_at":"2000-01-01T00:00:00Z"}' >/dev/null
rpc get_receipt "" "{\"receipt_token\":\"$TOKEN_C\"}"
check "期限切れは 0 行" "$(ok "$([ "$(printf '%s' "$BODY" | jq 'length')" = "0" ] && echo y)")" "$BODY"
rpc finalize_receipt "" "{\"receipt_token\":\"$TOKEN_C\",\"addressee\":\"\"}"
check "期限切れは確定できない" "$(ok "$([ "$CODE" != "200" ] && echo y)")" "$CODE $BODY"
rpc issue_receipt "$STOK" "{\"target_payment_id\":\"$PAY_C\"}"
rpc get_receipt "" "{\"receipt_token\":\"$TOKEN_C\"}"
check "スタッフが再発行すると期限が延びて同じリンクが開ける" "$(ok "$([ "$(printf '%s' "$BODY" | jq 'length')" = "1" ] && echo y)")" "$BODY"

echo
echo "=== 0 円の会計 ==="
newtab >/dev/null; TAB_D=${TAB_IDS[-1]}
additem "$TAB_D" 0
settle "$TAB_D" >/dev/null; PAY_D=${PAY_IDS[-1]}
rpc issue_receipt "$STOK" "{\"target_payment_id\":\"$PAY_D\"}"
check "0 円の会計には発行できない" "$(ok "$([ "$CODE" != "200" ] && echo y)")" "$CODE $BODY"

echo
echo "=== 結果: PASS=$PASS FAIL=$FAIL ==="
[ "$FAIL" = "0" ]
