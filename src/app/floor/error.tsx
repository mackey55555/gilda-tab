"use client";

/**
 * 営業中に真っ白な画面を出さないための受け皿。
 * 通信が切れたときなど、その場で再試行できることを最優先にする。
 */
export default function FloorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <div>
        <p className="text-lg font-bold">画面を表示できませんでした</p>
        <p className="mt-1 text-sm text-ink-muted">
          通信状況を確認して、もう一度お試しください
        </p>
      </div>

      <button
        type="button"
        onClick={reset}
        className="min-h-14 w-full max-w-xs rounded-xl bg-accent text-lg font-bold text-accent-ink"
      >
        再試行
      </button>

      <p className="text-xs break-all text-ink-muted">{error.digest ?? error.message}</p>
    </main>
  );
}
