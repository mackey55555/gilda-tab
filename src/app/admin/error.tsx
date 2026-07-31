"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-lg font-bold">画面を表示できませんでした</p>
      <p className="text-sm text-ink-muted">{error.digest ?? error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-accent-ink"
      >
        再試行
      </button>
    </div>
  );
}
