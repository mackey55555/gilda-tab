/**
 * /admin の画面描画と role による出し分けをエンドツーエンドで確認する回帰テスト。
 *
 * admin とスタッフの 2 つのセッションで同じ URL を開き、admin だけが管理画面に
 * 入れることと、商品・スタッフ一覧が描画されることを確認する。
 * 終了時にテストデータとテストユーザーは削除する。
 *
 * 事前に別ターミナルで `npm run dev` を起動しておくこと。
 * 実行: node scripts/verify-admin-pages.cjs
 *       BASE_URL=http://localhost:3001 node scripts/verify-admin-pages.cjs
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = "gilda-test-pw-9182";

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim();
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

const { createServerClient } = require(path.join(ROOT, "node_modules/@supabase/ssr"));

let pass = 0;
let fail = 0;
function check(label, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`  OK   ${label}`);
  } else {
    fail += 1;
    console.log(`  NG   ${label}\n       -> ${detail}`);
  }
}

/** React SSR がテキストノード境界に挟む <!-- --> を除去してから判定する */
const strip = (html) => html.replaceAll("<!-- -->", "");

const admin = (method, pathname, body) =>
  fetch(`${URL_}/rest/v1${pathname}`, {
    method,
    headers: {
      apikey: SECRET,
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (res) => ({ status: res.status, body: await res.json().catch(() => null) }));

async function makeSession(email, name) {
  const created = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { name },
    }),
  }).then((res) => res.json());

  const jar = new Map();
  const supabase = createServerClient(URL_, PUB, {
    cookies: {
      getAll: () => [...jar].map(([cookieName, value]) => ({ name: cookieName, value })),
      setAll: (list) => {
        for (const { name: cookieName, value } of list) jar.set(cookieName, value);
      },
    },
  });
  await supabase.auth.signInWithPassword({ email, password: PASSWORD });

  const cookie = [...jar]
    .map(([cookieName, value]) => `${cookieName}=${encodeURIComponent(value)}`)
    .join("; ");

  return { id: created.id, cookie };
}

const get = (pathname, cookie) =>
  fetch(`${BASE}${pathname}`, { headers: { Cookie: cookie }, redirect: "manual" });

(async () => {
  console.log("=== セットアップ ===");
  const adminUser = await makeSession("admin-page-test@example.com", "管理画面テスト");
  const staffUser = await makeSession("staff-page-test@example.com", "一般画面テスト");
  await admin("PATCH", `/staff?id=eq.${adminUser.id}`, { role: "admin" });
  console.log(`  admin=${adminUser.id}`);
  console.log(`  staff=${staffUser.id}`);

  // role の変更をセッションに反映させるためログインし直す
  const adminSession = await makeSessionExisting("admin-page-test@example.com");
  const cookieAdmin = adminSession.cookie;

  console.log("\n=== 権限による出し分け ===");
  let res = await get("/admin/products", staffUser.cookie);
  check(
    "スタッフが /admin を開くと /floor にリダイレクトされる",
    res.status === 307 && (res.headers.get("location") ?? "").includes("/floor"),
    `${res.status} ${res.headers.get("location")}`,
  );

  // /admin は next.config の redirects が先に動くため、実ページで認証ガードを確認する
  res = await get("/admin/products", "");
  check(
    "未ログインは /login にリダイレクトされる",
    res.status === 307 && (res.headers.get("location") ?? "").includes("/login"),
    `${res.status} ${res.headers.get("location")}`,
  );

  res = await get("/admin", cookieAdmin);
  check(
    "/admin は /admin/products にリダイレクトされる",
    (res.status === 307 || res.status === 308) &&
      (res.headers.get("location") ?? "").includes("/admin/products"),
    `${res.status} ${res.headers.get("location")}`,
  );

  console.log("\n=== /floor の管理者向け導線 ===");
  const floorHtml = strip(await (await get("/floor", cookieAdmin)).text());
  check("管理者の /floor には管理画面ボタンが出る", floorHtml.includes("管理画面"), "ボタンなし");

  console.log("\n=== 商品マスタ ===");
  res = await get("/admin/products", cookieAdmin);
  let html = strip(await res.text());
  check("admin は商品マスタを開ける", res.status === 200, `${res.status}`);
  check("サイドバーの項目が出る", html.includes("商品マスタ") && html.includes("スタッフ"), "サイドバーなし");
  const firstProduct = (
    await admin("GET", "/products?select=name,price&is_active=eq.true&order=sort_order&limit=1")
  ).body?.[0];
  check(
    `登録済み商品が一覧に出る（${firstProduct?.name}）`,
    firstProduct ? html.includes(firstProduct.name) : false,
    "商品なし",
  );
  check(
    "価格が表示される",
    firstProduct ? html.includes(`¥${firstProduct.price.toLocaleString("en-US")}`) : false,
    "価格なし",
  );
  check("追加ボタンがある", html.includes("商品を追加"), "追加ボタンなし");
  check("削除の可否が出し分けられる", html.includes("注文実績あり") || html.includes("削除"), "操作列なし");

  console.log("\n=== スタッフ管理 ===");
  res = await get("/admin/staff", cookieAdmin);
  html = strip(await res.text());
  check("admin はスタッフ一覧を開ける", res.status === 200, `${res.status}`);
  check("メールアドレスが表示される", html.includes("admin-page-test@example.com"), "メールなし");
  check("自分の行に「自分」が付く", html.includes("自分"), "自分マークなし");
  check("追加フォームのボタンがある", html.includes("スタッフを追加"), "追加ボタンなし");

  console.log("\n=== 売上集計 ===");
  // 集計の確認用に、他と重ならない日付の営業日を自前で作る
  const FROM = "2026-04-16";
  const TO = "2026-04-16";
  const query = `from=${FROM}&to=${TO}`;

  const day = await admin("POST", "/business_days", {
    date: FROM,
    opened_at: `${FROM}T11:00:00Z`,
    status: "closed",
    closed_at: `${FROM}T16:00:00Z`,
  });
  const salesDayId = day.body?.[0]?.id;
  const salesTab = await admin("POST", "/tabs", { business_day_id: salesDayId, guest_name: "集計確認" });
  const salesTabId = salesTab.body?.[0]?.id;
  await admin("POST", "/order_items", [
    { tab_id: salesTabId, name_snapshot: "確認用ビール", price_snapshot: 800, qty: 2, created_at: `${FROM}T12:00:00Z` },
    { tab_id: salesTabId, name_snapshot: "確認用その他", price_snapshot: 1500, qty: 1, created_at: `${FROM}T15:30:00Z` },
  ]);

  res = await get(`/admin/sales?${query}`, cookieAdmin);
  html = strip(await res.text());
  check("売上集計が 200 で開く", res.status === 200, `${res.status}`);
  check("サマリの見出しが出る", html.includes("客単価") && html.includes("営業日数"), "サマリなし");
  check("日別売上のセクションが出る", html.includes("日別売上"), "日別なし");
  check("時間帯別のセクションが出る", html.includes("時間帯別売上"), "時間帯なし");
  check("24時以降の注記が出る", html.includes("24 時台"), "注記なし");
  check("商品別ランキングが出る", html.includes("商品別ランキング"), "商品別なし");
  check("CSV リンクが3種ある", ["日別 CSV", "商品別 CSV", "明細 CSV"].every((l) => html.includes(l)), "CSV リンク不足");
  check("集計金額が出る（800x2 + 1500 = ¥3,100）", html.includes("¥3,100"), "金額なし");

  const dayLinks = [...html.matchAll(/\/admin\/sales\/([0-9a-f-]{36})/g)].map((m) => m[1]);
  check("日別テーブルからドリルダウンできるリンクがある", dayLinks.length > 0, "リンクなし");

  if (dayLinks.length > 0) {
    res = await get(`/admin/sales/${dayLinks[0]}`, cookieAdmin);
    html = strip(await res.text());
    check("営業日の明細ドリルダウンが 200 で開く", res.status === 200, `${res.status}`);
    check("伝票の会計状態が出る", html.includes("会計済み") || html.includes("未会計"), "状態なし");
  }

  res = await get(`/admin/sales?from=2020-01-01&to=2020-01-02`, cookieAdmin);
  html = strip(await res.text());
  check("データが無い期間でも落ちない", res.status === 200 && html.includes("営業日がありません"), `${res.status}`);

  console.log("\n=== CSV エクスポート ===");
  for (const [type, header] of [
    ["daily", "営業日,状態,伝票枚数"],
    ["product", "商品名,カテゴリ,数量,売上"],
    ["items", "営業日,伝票番号,客名"],
  ]) {
    res = await get(`/admin/sales/export?type=${type}&${query}`, cookieAdmin);
    // Response.text() は仕様上 BOM を取り除いてしまうので、バイト列で確認する
    const bytes = new Uint8Array(await res.clone().arrayBuffer());
    const csv = await res.text();
    check(
      `${type} CSV が UTF-8 BOM 付きで返る`,
      res.status === 200 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf,
      `${res.status} / 先頭バイト=${[...bytes.slice(0, 3)].map((b) => b.toString(16)).join(" ")}`,
    );
    check(`${type} CSV のヘッダが正しい`, csv.includes(header), csv.slice(0, 120));
    check(
      `${type} CSV に Content-Disposition が付く`,
      (res.headers.get("content-disposition") ?? "").includes("attachment"),
      res.headers.get("content-disposition"),
    );
  }

  res = await get(`/admin/sales/export?type=daily&${query}`, staffUser.cookie);
  check(
    "スタッフは CSV を取得できない",
    res.status === 307 && (res.headers.get("location") ?? "").includes("/floor"),
    `${res.status} ${res.headers.get("location")}`,
  );

  console.log("\n=== 未実装ページのプレースホルダ ===");
  for (const [pathname, label] of [["/admin/business-days", "営業日"]]) {
    res = await get(pathname, cookieAdmin);
    html = strip(await res.text());
    check(`${pathname} が 200 で開く`, res.status === 200 && html.includes(label), `${res.status}`);
  }

  console.log("\n=== 後片付け ===");
  if (salesTabId) await admin("DELETE", `/order_items?tab_id=eq.${salesTabId}`);
  if (salesTabId) await admin("DELETE", `/tabs?id=eq.${salesTabId}`);
  if (salesDayId) await admin("DELETE", `/business_days?id=eq.${salesDayId}`);

  for (const email of ["admin-page-test@example.com", "staff-page-test@example.com"]) {
    const list = await fetch(`${URL_}/auth/v1/admin/users?page=1&per_page=200`, {
      headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
    }).then((r) => r.json());
    const found = list.users.find((user) => user.email === email);
    if (found) {
      await fetch(`${URL_}/auth/v1/admin/users/${found.id}`, {
        method: "DELETE",
        headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
      });
    }
  }
  const staffLeft = await admin("GET", "/staff?select=id");
  console.log(`  残 staff: ${staffLeft.body?.length ?? "?"} 件`);

  console.log(`\n=== 結果: PASS=${pass} FAIL=${fail} ===`);
  process.exit(fail === 0 ? 0 : 1);
})();

/** 既存ユーザーでログインし直してセッション Cookie を作る */
async function makeSessionExisting(email) {
  const jar = new Map();
  const supabase = createServerClient(URL_, PUB, {
    cookies: {
      getAll: () => [...jar].map(([cookieName, value]) => ({ name: cookieName, value })),
      setAll: (list) => {
        for (const { name: cookieName, value } of list) jar.set(cookieName, value);
      },
    },
  });
  await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  return {
    cookie: [...jar]
      .map(([cookieName, value]) => `${cookieName}=${encodeURIComponent(value)}`)
      .join("; "),
  };
}
