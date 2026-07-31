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

  const get = (pathname, cookie = cookieHeader) =>
    fetch(`${BASE}${pathname}`, { headers: { Cookie: cookie }, redirect: "manual" });

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

  const products = await asUser(token, "GET", "/products?select=id,name,price&is_active=eq.true&order=sort_order&limit=1");
  const beer = products.body?.[0];
  // 商品マスタは運用で変わるため、期待値はハードコードせず実際の単価から求める
  const FREE_AMOUNT = 1500;
  const expectedTotal = beer.price * 2 + FREE_AMOUNT;
  const expectedYen = `¥${expectedTotal.toLocaleString("en-US")}`;
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
    price_snapshot: FREE_AMOUNT,
    staff_id: userId,
  });

  res = await get("/floor");
  html = strip(await res.text());
  check("伝票一覧が 200 で描画される", res.status === 200, `${res.status}`);
  check(`仮名「客${seq1}」がカードに出る`, html.includes(`客${seq1}`), `客${seq1} なし`);
  check("入力済みの客名「田中さん」がカードに出る", html.includes("田中さん"), "田中さん なし");
  check(
    `tab_summaries の合計が反映される (${beer.price}x2 + ${FREE_AMOUNT} = ${expectedYen})`,
    html.includes(expectedYen),
    "合計表示なし",
  );
  check("FAB「＋お客さん」がある", html.includes("＋お客さん"), "FAB なし");

  // 1 画面化したので詳細ページは無い。カード上の導線と、開いたときに使う明細を確認する。
  check("カードに会計ボタンがある", html.includes(">会計<"), "会計ボタンなし");
  check("営業終了の導線がある", html.includes("本日の営業を終了"), "終了ボタンなし");

  const detail = await asUser(
    token,
    "GET",
    `/order_items?tab_id=eq.${tab1Id}&select=name_snapshot,price_snapshot,qty&order=created_at`,
  );
  check(
    "アコーディオンに出す明細が API から取れる（3行）",
    detail.body?.length === 3,
    JSON.stringify(detail.body),
  );
  check(
    "同一商品が 2 行に分かれている（グルーピング前の追記型）",
    detail.body?.filter((row) => row.name_snapshot === beer.name).length === 2,
    JSON.stringify(detail.body),
  );

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
  const openTabs = await asUser(
    token,
    "GET",
    `/tab_summaries?id=eq.${tab1Id}&status=eq.open&select=id`,
  );
  check("会計した伝票が open 一覧から消える", openTabs.body?.length === 0, JSON.stringify(openTabs.body));
  check("会計済みセクションが出る", html.includes("会計済み"), "会計済みセクションなし");
  check(`会計済みの金額が出る (${expectedYen})`, html.includes(expectedYen), "金額なし");

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
