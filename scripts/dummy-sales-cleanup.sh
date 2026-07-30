#!/usr/bin/env bash
# scripts/dummy-sales-seed.sh が投入したダミーデータを全削除する。
#
# 実運用を始める前に必ず実行し、最後の「残り 0 件」を確認すること。
# 削除対象はダミー期間の営業日に紐づくものだけで、それ以外のデータには触れない。
#
# 実行: bash scripts/dummy-sales-cleanup.sh
set -uo pipefail
cd "$(dirname "$0")/.."

# seed と必ず同じ値にすること
DUMMY_FROM="2026-06-04"
DUMMY_TO="2026-06-27"

set -a; . ./.env.local; set +a
URL="$NEXT_PUBLIC_SUPABASE_URL"
SECRET="${SUPABASE_SECRET_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-}}"
[ -z "$SECRET" ] && { echo "secret key が見つかりません"; exit 1; }

api() { # api METHOD PATH [DATA]
  local m=$1 p=$2 data=${3:-}
  local args=(-s -X "$m" "$URL/rest/v1$p" -H "apikey: $SECRET" -H "Authorization: Bearer $SECRET"
              -H "Content-Type: application/json" -H "Prefer: return=representation")
  [ -n "$data" ] && args+=(-d "$data")
  curl "${args[@]}"
}

DAY_IDS=$(api GET "/business_days?date=gte.$DUMMY_FROM&date=lte.$DUMMY_TO&select=id" | jq -r '.[].id')
if [ -z "$DAY_IDS" ]; then
  echo "ダミー期間（$DUMMY_FROM 〜 ${DUMMY_TO}）に営業日はありません。削除するものはありません。"
  exit 0
fi

DAY_LIST=$(printf '%s' "$DAY_IDS" | paste -sd, -)
echo "ダミー営業日 $(printf '%s\n' $DAY_IDS | wc -l | tr -d ' ') 件を削除します"

TAB_IDS=$(api GET "/tabs?business_day_id=in.($DAY_LIST)&select=id" | jq -r '.[].id')
TAB_LIST=$(printf '%s' "$TAB_IDS" | paste -sd, -)

# 外部キーの都合で 明細 → 会計 → 伝票 → 営業日 の順に消す。
# 会計は tabs.payment_id を先に外さないと on delete set null 頼みになるため、明示的に外す。
if [ -n "$TAB_LIST" ]; then
  ITEMS=$(api DELETE "/order_items?tab_id=in.($TAB_LIST)" | jq 'length')
  echo "  order_items:   $ITEMS 件"
  api PATCH "/tabs?business_day_id=in.($DAY_LIST)" '{"payment_id":null}' >/dev/null
fi

PAYMENTS=$(api DELETE "/payments?business_day_id=in.($DAY_LIST)" | jq 'length')
echo "  payments:      $PAYMENTS 件"

TABS=$(api DELETE "/tabs?business_day_id=in.($DAY_LIST)" | jq 'length')
echo "  tabs:          $TABS 件"

DAYS=$(api DELETE "/business_days?id=in.($DAY_LIST)" | jq 'length')
echo "  business_days: $DAYS 件"

echo
echo "=== 残存確認 ==="
LEFT_DAYS=$(api GET "/business_days?date=gte.$DUMMY_FROM&date=lte.$DUMMY_TO&select=id" | jq 'length')
echo "  ダミー期間の営業日: $LEFT_DAYS 件"
for t in business_days tabs order_items payments; do
  printf '  %-14s 全体で %s 件\n' "$t" "$(api GET "/$t?select=id" | jq 'length')"
done

[ "$LEFT_DAYS" = "0" ] && echo "  → ダミーデータは残っていません" || { echo "  → 残っています"; exit 1; }
