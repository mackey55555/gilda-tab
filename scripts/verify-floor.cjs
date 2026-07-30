/**
 * /floor の画面描画をエンドツーエンドで確認する回帰テスト。
 *
 * テストユーザーでログインしたセッション Cookie を @supabase/ssr に作らせ、
 * 起動中の dev server に投げて実際の HTML を検証する。
 * 終了時にテストデータとテストユーザーは削除する（seed の商品は残る）。
 *
 * 事前に別ターミナルで `npm run dev` を起動しておくこと。
 * 実行: node scripts/verify-floor.cjs
 *       BASE_URL=http://localhost:3001 node scripts/verify-floor.cjs
 *
 * open な営業日が既にある場合はそれを再利用し、後片付けでも消さない
 * （運用中のデータを壊さないため）。
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = "floor-test@example.com";
const PASSWORD = "gilda-test-pw-9182";

// .env.local を読む
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

const asUser = (token, method, pathname, body) =>
  fetch(`${URL_}/rest/v1${pathname}`, {
    method,
    headers: {
      apikey: PUB,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (res) => ({ status: res.status, body: await res.json().catch(() => null) }));

(async () => {
  console.log("=== セットアップ ===");
  const created = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SECRET,
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { name: "検証スタッフ" },
    }),
  }).then((res) => res.json());
  const userId = created.id;
  console.log(`  test user: ${userId}`);

  // @supabase/ssr 自身にセッション Cookie を作らせる（形式を推測しない）
  const jar = new Map();
  const supabase = createServerClient(URL_, PUB, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => {
        for (const { name, value } of list) jar.set(name, value);
      },
    },
  });

  const signIn = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  check("テストユーザーでログインできる", !signIn.error, signIn.error?.message);

  const token = signIn.data.session.access_token;
  const cookieHeader = [...jar].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
  check(`セッション Cookie を生成 (${jar.size}個)`, jar.size > 0, [...jar.keys()].join(","));

  /** React SSR がテキストノード境界に挟む <!-- --> を除去してから判定する */
  const strip = (html) => html.replaceAll("<!-- -->", "");

  const get = (pathname) =>
    fetch(`${BASE}${pathname}`, { headers: { Cookie: cookieHeader }, redirect: "manual" });

  // 既に open な営業日があれば再利用する。実運用中のデータを壊さないため、
  // このスクリプトが作ったものだけを後片付けの対象にする。
  const existing = await admin("GET", "/business_days?status=eq.open&select=id");
  const existingDayId = existing.body?.[0]?.id ?? null;
  let createdDayId = null;

  let res;
  let html;

  if (existingDayId) {
    console.log("\n=== 営業日が open 済みのため「本日の営業を開始」の確認はスキップ ===");
  } else {
    console.log("\n=== 営業日が無い状態の /floor ===");
    res = await get("/floor");
    html = strip(await res.text());
    check("ログイン済みなら /floor が 200 で描画される", res.status === 200, `${res.status}`);
    check("「本日の営業を開始」が表示される", html.includes("本日の営業を開始"), html.slice(0, 200));
    check("スタッフ名が表示される", html.includes("検証スタッフ"), "スタッフ名なし");
  }

  console.log("\n=== 営業日と伝票を用意して /floor ===");
  let dayId = existingDayId;
  if (!dayId) {
    const day = await asUser(token, "POST", "/business_days", {});
    dayId = day.body?.[0]?.id;
    createdDayId = dayId;
    check("スタッフ権限で営業日を open できる", day.status === 201, JSON.stringify(day.body));
  }
  if (!dayId) {
    console.log("  営業日を用意できないため中断します");
    process.exit(1);
  }

  const tab1 = await asUser(token, "POST", "/tabs", { business_day_id: dayId });
  const tab2 = await asUser(token, "POST", "/tabs", { business_day_id: dayId, guest_name: "田中さん" });
  const tab1Id = tab1.body?.[0]?.id;
  const seq1 = tab1.body?.[0]?.seq;
  const seq2 = tab2.body?.[0]?.seq;
  check(
    `seq を省略した insert が通り連番になる (${seq1}, ${seq2})`,
    typeof seq1 === "number" && seq2 === seq1 + 1,
    `${seq1} / ${seq2}`,
  );

  const products = await asUser(token, "GET", "/products?select=id,name,price&order=sort_order&limit=1");
  const beer = products.body?.[0];
  await asUser(token, "POST", "/order_items", {
    tab_id: tab1Id,
    product_id: beer.id,
    name_snapshot: beer.name,
    price_snapshot: beer.price,
    staff_id: userId,
  });
  await asUser(token, "POST", "/order_items", {
    tab_id: tab1Id,
    product_id: beer.id,
    name_snapshot: beer.name,
    price_snapshot: beer.price,
    staff_id: userId,
  });
  await asUser(token, "POST", "/order_items", {
    tab_id: tab1Id,
    name_snapshot: "その他",
    price_snapshot: 1500,
    staff_id: userId,
  });

  res = await get("/floor");
  html = strip(await res.text());
  check("伝票一覧が 200 で描画される", res.status === 200, `${res.status}`);
  check(`仮名「客${seq1}」がカードに出る`, html.includes(`客${seq1}`), `客${seq1} なし`);
  check("入力済みの客名「田中さん」がカードに出る", html.includes("田中さん"), "田中さん なし");
  check(
    "tab_summaries の合計が反映される (800*2+1500 = ¥3,100)",
    html.includes("¥3,100"),
    "合計表示なし",
  );
  check("FAB「＋お客さん」がある", html.includes("＋お客さん"), "FAB なし");

  console.log("\n=== 伝票詳細 ===");
  res = await get(`/floor/${tab1Id}`);
  html = strip(await res.text());
  check("伝票詳細が 200 で描画される", res.status === 200, `${res.status}`);
  check("商品グリッドに seed 商品が出る", html.includes(beer.name), `${beer.name} なし`);
  check("カテゴリタブが出る", html.includes("すべて"), "カテゴリタブなし");
  check(
    "明細がグルーピングされて ×2 表示になる",
    html.includes("× 2"),
    "グルーピング表示なし",
  );
  check("フリー金額明細「その他」が明細に出る", html.includes("その他"), "その他 なし");
  check("合計が ¥3,100 で出る", html.includes("¥3,100"), "合計なし");
  check("会計ボタンが（無効で）ある", html.includes("会計する"), "会計ボタンなし");

  console.log("\n=== 会計（settle_tabs）後の描画 ===");
  const settle = await fetch(`${URL_}/rest/v1/rpc/settle_tabs`, {
    method: "POST",
    headers: { apikey: PUB, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ tab_ids: [tab1Id] }),
  });
  check("settle_tabs が成功する", settle.status === 200, `${settle.status}`);
  const createdPaymentId = settle.status === 200 ? (await settle.json()) : null;

  res = await get("/floor");
  html = strip(await res.text());
  // 客名の文字列は会計済みセクションの props として RSC ペイロードにも載るため、
  // 「伝票カードのリンクが消えたか」で判定する
  check(
    "会計した伝票が open 一覧から消える",
    !html.includes(`/floor/${tab1Id}"`),
    "伝票カードのリンクが残っている",
  );
  check("会計済みセクションが出る", html.includes("会計済み"), "会計済みセクションなし");
  check("会計済みの金額が出る (¥3,100)", html.includes("¥3,100"), "金額なし");

  res = await get(`/floor/${tab1Id}`);
  html = strip(await res.text());
  check("会計済み伝票を開くと編集不可の表示になる", html.includes("会計済みの伝票です"), "表示なし");

  console.log("\n=== 存在しない伝票 ===");
  res = await get("/floor/00000000-0000-0000-0000-000000000000");
  check("存在しない伝票は 404", res.status === 404, `${res.status}`);

  console.log("\n=== 後片付け ===");
  // 後片付けは「このスクリプトが作った行」だけを対象にする。
  // business_day_id で括ると、同じ営業日で運用中のデータ（他の伝票・会計）まで巻き込む。
  const tab2Id = tab2.body?.[0]?.id;
  const ownTabIds = [tab1Id, tab2Id].filter(Boolean);

  await admin("DELETE", `/order_items?tab_id=in.(${ownTabIds.join(",")})`);
  if (createdPaymentId) {
    await admin("PATCH", `/tabs?id=in.(${ownTabIds.join(",")})`, { payment_id: null });
    await admin("DELETE", `/payments?id=eq.${createdPaymentId}`);
  }
  for (const id of ownTabIds) {
    await admin("DELETE", `/tabs?id=eq.${id}`);
  }
  // 既存の営業日は運用中の可能性があるので、自分が open したときだけ削除する
  if (createdDayId) {
    await admin("DELETE", `/business_days?id=eq.${createdDayId}`);
  }
  await fetch(`${URL_}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
  });
  const left = await admin("GET", "/business_days?select=id");
  console.log(`  残 business_days: ${left.body?.length ?? "?"} 件`);
  const staffLeft = await admin("GET", "/staff?select=id");
  console.log(`  残 staff: ${staffLeft.body?.length ?? "?"} 件`);

  console.log(`\n=== 結果: PASS=${pass} FAIL=${fail} ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
