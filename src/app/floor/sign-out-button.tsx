"use client";

import { useTransition } from "react";

import { signOut } from "../login/actions";

export function SignOutButton({ staffName }: { staffName: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => signOut())}
      disabled={pending}
      className="min-h-tap rounded-lg px-3 text-sm text-ink-muted disabled:opacity-50"
    >
      {staffName} / ログアウト
    </button>
  );
}
