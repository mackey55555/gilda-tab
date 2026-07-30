"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

import { createStaff, type CreateStaffState } from "./actions";

export type StaffRow = {
  id: string;
  name: string;
  role: string;
  email: string;
  created_at: string;
};

const initialFormState: CreateStaffState = { error: null, createdEmail: null };

export function StaffTable({
  currentStaffId,
  initialStaff,
  loadError,
}: {
  currentStaffId: string;
  initialStaff: StaffRow[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [formState, formAction, formPending] = useActionState(createStaff, initialFormState);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  const adminCount = initialStaff.filter((staff) => staff.role === "admin").length;

  async function changeRole(staff: StaffRow, nextRole: string) {
    setBusyId(staff.id);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    // role は列権限で直接 UPDATE できないので、必ず RPC を通す
    const { error: rpcError } = await supabase.rpc("set_staff_role", {
      target_staff_id: staff.id,
      new_role: nextRole,
    });

    setBusyId(null);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    startRefresh(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">スタッフ</h1>

      <p className="text-sm text-ink-muted">
        追加したスタッフには、メールアドレスと初期パスワードを直接伝えてください（招待メールは送りません）。
        管理者だけがこの画面と売上集計を開けます。
      </p>

      {adding ? (
        <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">名前</span>
            <input
              name="name"
              required
              className="h-9 w-40 rounded-lg border border-line bg-raised px-2 outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">メールアドレス</span>
            <input
              name="email"
              type="email"
              required
              className="h-9 w-64 rounded-lg border border-line bg-raised px-2 outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">初期パスワード（8文字以上）</span>
            <input
              name="password"
              type="text"
              required
              minLength={8}
              className="h-9 w-56 rounded-lg border border-line bg-raised px-2 outline-none focus:border-accent"
            />
          </label>

          <button
            type="submit"
            disabled={formPending}
            className="h-9 rounded-lg bg-accent px-4 text-sm font-bold text-accent-ink disabled:opacity-50"
          >
            {formPending ? "追加中…" : "追加する"}
          </button>

          <button
            type="button"
            onClick={() => setAdding(false)}
            className="h-9 rounded-lg px-3 text-sm text-ink-muted"
          >
            キャンセル
          </button>

          {formState.error && (
            <p role="alert" className="w-full text-sm text-danger">
              {formState.error}
            </p>
          )}
          {formState.createdEmail && (
            <p role="status" className="w-full text-sm text-accent">
              {formState.createdEmail} を追加しました。初期パスワードを本人に伝えてください。
            </p>
          )}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-bold text-accent-ink"
        >
          ＋ スタッフを追加
        </button>
      )}

      {(error ?? loadError) && (
        <p role="alert" className="text-sm text-danger">
          {error ?? loadError}
        </p>
      )}

      <table className="w-full border-separate border-spacing-y-1 text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-muted">
            <th className="px-3 py-1 font-normal">名前</th>
            <th className="px-3 py-1 font-normal">メールアドレス</th>
            <th className="w-32 px-3 py-1 font-normal">権限</th>
            <th className="w-32 px-3 py-1 font-normal">登録日</th>
            <th className="w-48 px-3 py-1 font-normal">操作</th>
          </tr>
        </thead>
        <tbody>
          {initialStaff.map((staff) => {
            const isMe = staff.id === currentStaffId;
            const isAdmin = staff.role === "admin";
            // 管理者が 0 人になると誰も /admin に入れなくなる（RPC 側でも同じ判定をしている）
            const lastAdmin = isAdmin && adminCount <= 1;
            const busy = busyId === staff.id || refreshing;

            return (
              <tr key={staff.id}>
                <td className="rounded-l-lg bg-surface px-3 py-2 font-bold">
                  {staff.name}
                  {isMe && <span className="ml-2 text-xs font-normal text-ink-muted">自分</span>}
                </td>
                <td className="bg-surface px-3 py-2 text-ink-muted">{staff.email}</td>
                <td className="bg-surface px-3 py-2">{isAdmin ? "管理者" : "スタッフ"}</td>
                <td className="bg-surface px-3 py-2 text-ink-muted tabular-nums">
                  {new Date(staff.created_at).toLocaleDateString("ja-JP", {
                    timeZone: "Asia/Tokyo",
                  })}
                </td>
                <td className="rounded-r-lg bg-surface px-3 py-2">
                  {lastAdmin ? (
                    <span className="text-xs text-ink-muted">最後の管理者のため変更できません</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void changeRole(staff, isAdmin ? "staff" : "admin")}
                      disabled={busy}
                      className="rounded border border-line px-2 py-1 text-xs text-ink-muted disabled:opacity-40"
                    >
                      {isAdmin ? "スタッフにする" : "管理者にする"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
