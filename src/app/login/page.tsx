import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-widest text-accent">gilda</h1>
        <p className="mt-1 text-sm text-ink-muted">注文管理</p>
      </div>

      <LoginForm next={next ?? "/floor"} />

      <p className="text-center text-xs text-ink-muted">
        アカウントは管理者が発行します
      </p>
    </main>
  );
}
