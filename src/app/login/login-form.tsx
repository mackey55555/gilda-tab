"use client";

import { useActionState } from "react";

import { signIn, type SignInState } from "./actions";

const initialState: SignInState = { error: null };

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-ink-muted">メールアドレス</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          className="min-h-tap rounded-lg border border-line bg-raised px-3 outline-none focus:border-accent"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-ink-muted">パスワード</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="min-h-tap rounded-lg border border-line bg-raised px-3 outline-none focus:border-accent"
        />
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-tap rounded-lg bg-accent font-bold text-accent-ink disabled:opacity-50"
      >
        {pending ? "ログイン中…" : "ログイン"}
      </button>
    </form>
  );
}
