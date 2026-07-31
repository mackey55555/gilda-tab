"use client";

import { useEffect } from "react";

/**
 * Service Worker の登録。
 *
 * 開発中は登録しない。dev のアセットは内容ハッシュが付かず、キャッシュが残ると
 * 変更が反映されない原因になるため（実機確認で実際に踏んだ）。
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // 登録できなくてもアプリの動作自体には影響しないので握りつぶす
      });
    };

    // 初回表示の描画を邪魔しないよう、読み込み完了後に登録する
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
