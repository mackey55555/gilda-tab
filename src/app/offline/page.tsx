/**
 * Service Worker が通信失敗時に返す案内。
 * 認証を要求すると通信できないときに表示できないので、proxy.ts のガードから外してある。
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="text-lg font-bold tracking-widest text-accent">gilda</span>
      <div>
        <p className="text-lg font-bold">通信できません</p>
        <p className="mt-1 text-sm text-ink-muted">
          電波の状況を確認してから、画面を引き下げて再読み込みしてください
        </p>
      </div>
      <p className="text-xs text-ink-muted">
        注文の記録はサーバに保存されるため、電波が戻れば続きから操作できます
      </p>
    </main>
  );
}
