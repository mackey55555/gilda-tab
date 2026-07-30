#!/usr/bin/env bash
# 集計画面の確認用ダミーデータを投入する。
#
# ★ 実運用を始める前に必ず scripts/dummy-sales-cleanup.sh で全削除すること。
#   1 件でも残ると売上集計が汚染される。
#
# 削除しやすいよう、営業日は下記の固定期間にだけ作る。cleanup はこの期間を消すだけでよい。
# 実運用の営業日（= 今日以降に開くもの）とは日付が重ならない。
#
# 実行: bash scripts/dummy-sales-seed.sh
set -uo pipefail
cd "$(dirname "$0")/.."

# ダミーデータの営業日の範囲。cleanup と必ず同じ値にすること。
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

EXISTING=$(api GET "/business_days?date=gte.$DUMMY_FROM&date=lte.$DUMMY_TO&select=id" | jq 'length')
if [ "$EXISTING" != "0" ]; then
  echo "ダミー期間（$DUMMY_FROM 〜 ${DUMMY_TO}）に既に営業日が $EXISTING 件あります。"
  echo "先に scripts/dummy-sales-cleanup.sh を実行してください。"
  exit 1
fi

PRODUCTS=$(api GET "/products?select=id,name,price&is_active=eq.true&order=sort_order")
PRODUCT_COUNT=$(printf '%s' "$PRODUCTS" | jq 'length')
if [ "$PRODUCT_COUNT" = "0" ]; then
  echo "商品マスタが空です。先に seed を投入してください。"
  exit 1
fi

STAFF_ID=$(api GET "/staff?select=id&limit=1" | jq -r '.[0].id // empty')

echo "ダミーデータを投入します（$DUMMY_FROM 〜 $DUMMY_TO / 商品 $PRODUCT_COUNT 件）"

# 木・金・土の営業を 4 週分。日付ごとに件数と時間帯を変えて、集計の差が見えるようにする。
DATES=$(python3 - "$DUMMY_FROM" "$DUMMY_TO" <<'PY'
import sys, datetime
start = datetime.date.fromisoformat(sys.argv[1])
end = datetime.date.fromisoformat(sys.argv[2])
day = start
while day <= end:
    # 木(3) 金(4) 土(5) のみ
    if day.weekday() in (3, 4, 5):
        print(day.isoformat())
    day += datetime.timedelta(days=1)
PY
)

TOTAL_DAYS=0
TOTAL_TABS=0
TOTAL_ITEMS=0

for DATE in $DATES; do
  BD=$(api POST "/business_days" \
    "{\"date\":\"$DATE\",\"opened_at\":\"${DATE}T11:00:00Z\",\"status\":\"closed\",\"closed_at\":\"${DATE}T15:30:00Z\"}" \
    | jq -r '.[0].id')
  [ -z "$BD" ] || [ "$BD" = "null" ] && { echo "  $DATE: 営業日を作成できませんでした"; continue; }
  TOTAL_DAYS=$((TOTAL_DAYS + 1))

  # 日付から決まる擬似乱数で 3〜8 組
  SEED=$(printf '%s' "$DATE" | cksum | cut -d' ' -f1)
  TABS=$((3 + SEED % 6))

  PAYLOAD=$(PRODUCTS="$PRODUCTS" DATE="$DATE" BD="$BD" TABS="$TABS" SEED="$SEED" STAFF_ID="$STAFF_ID" python3 - <<'PY'
import json, os, random

products = json.loads(os.environ["PRODUCTS"])
date = os.environ["DATE"]
tabs = int(os.environ["TABS"])
staff_id = os.environ["STAFF_ID"] or None
rng = random.Random(int(os.environ["SEED"]))

out = []
for i in range(tabs):
    # 20:00〜25:30 JST（= 11:00〜16:30 UTC）に散らす。24 時越えの検証用に遅い時間も入れる。
    start_minutes = rng.randint(0, 330)
    items = []
    for _ in range(rng.randint(1, 6)):
        product = rng.choice(products)
        offset = start_minutes + rng.randint(0, 120)
        hour = 11 + offset // 60
        minute = offset % 60
        items.append({
            "product_id": product["id"],
            "name_snapshot": product["name"],
            "price_snapshot": product["price"],
            "created_at": f"{date}T{hour:02d}:{minute:02d}:00Z",
            "staff_id": staff_id,
        })
    # 5 組に 1 組はフリー金額、10 組に 1 組は値引きを混ぜる
    if i % 5 == 0:
        items.append({
            "product_id": None, "name_snapshot": "その他",
            "price_snapshot": rng.choice([500, 1000, 1500]),
            "created_at": f"{date}T14:{rng.randint(0,59):02d}:00Z", "staff_id": staff_id,
        })
    if i % 10 == 0:
        items.append({
            "product_id": None, "name_snapshot": "値引き",
            "price_snapshot": -500,
            "created_at": f"{date}T15:{rng.randint(0,59):02d}:00Z", "staff_id": staff_id,
        })
    out.append({"guest_name": None if i % 3 else f"ダミー客{i + 1}", "items": items})

print(json.dumps(out))
PY
)

  TAB_COUNT=$(printf '%s' "$PAYLOAD" | jq 'length')
  TAB_ROWS=$(printf '%s' "$PAYLOAD" | jq -c --arg bd "$BD" 'to_entries | map({business_day_id: $bd, seq: (.key + 1), guest_name: .value.guest_name})')
  TAB_IDS=$(api POST "/tabs" "$TAB_ROWS" | jq -r '.[].id')

  INDEX=0
  ITEM_ROWS="[]"
  for TAB_ID in $TAB_IDS; do
    ROWS=$(printf '%s' "$PAYLOAD" | jq -c --arg tab "$TAB_ID" --argjson i "$INDEX" '.[$i].items | map(. + {tab_id: $tab})')
    ITEM_ROWS=$(jq -c -n --argjson a "$ITEM_ROWS" --argjson b "$ROWS" '$a + $b')
    INDEX=$((INDEX + 1))
  done

  INSERTED=$(api POST "/order_items" "$ITEM_ROWS" | jq 'length')
  TOTAL_TABS=$((TOTAL_TABS + TAB_COUNT))
  TOTAL_ITEMS=$((TOTAL_ITEMS + INSERTED))
  echo "  $DATE: 伝票 $TAB_COUNT 枚 / 明細 $INSERTED 件"
done

echo
echo "投入完了: 営業日 $TOTAL_DAYS 日 / 伝票 $TOTAL_TABS 枚 / 明細 $TOTAL_ITEMS 件"
echo "★ 確認が終わったら必ず scripts/dummy-sales-cleanup.sh を実行してください。"
