import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabasePublicEnv } from "@/lib/supabase/env";

/**
 * Next.js 16 の Proxy（15 以前の Middleware）。
 *
 * 役割は 2 つ:
 *   1. アクセストークンの更新と Cookie の書き戻し
 *   2. 未ログインを /login に飛ばす楽観的なガード
 *
 * ここでのガードは「素早く弾く」ためのもので、権限判定の本体ではない。
 * 実際の認可は各ページの requireStaff() と DB 側の RLS が担う。
 */
export async function proxy(request: NextRequest) {
  const { url, publishableKey } = supabasePublicEnv();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() の副作用でトークンが更新され、上の setAll 経由で Cookie に書き戻される
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === "/login";

  if (!user && !isLoginPage) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", pathname);
    }
    return copyCookies(NextResponse.redirect(loginUrl), response);
  }

  if (user && isLoginPage) {
    return copyCookies(NextResponse.redirect(new URL("/floor", request.url)), response);
  }

  return response;
}

/** リダイレクトを返すときに、更新済みの認証 Cookie を落とさないよう移し替える */
function copyCookies(target: NextResponse, source: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
  return target;
}

// 以下は未ログインでも取得できる必要があるため認証ガードから外す。
//   manifest / icons … ホーム画面追加時にブラウザが Cookie 無しで取りに来る
//   sw.js            … Service Worker の登録
//   offline          … 通信できないときに Service Worker が返す案内
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|sw.js|offline|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
