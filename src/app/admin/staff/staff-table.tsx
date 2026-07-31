"use client";

import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState, useTransition } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

import {
  createStaff,
  renameStaff,
  setStaffActive,
  type CreateStaffState,
} from "./actions";

export type StaffRow = {
  id: string;
  name: string;
  role: string;
  email: string;
  is_active: boolean;
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
  const [keyword, setKeyword] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  const activeAdminCount = initialStaff.filter((s) => s.role === "admin" && s.is_active).length;
  const inactiveCount = initialStaff.filter((s) => !s.is_active).length;

  const visible = useMemo(() => {
    const trimmed = keyword.trim();
    return initialStaff.filter((staff) => {
      const byActive = showInactive || staff.is_active;
      const byKeyword =
        trimmed === "" || staff.name.includes(trimmed) || staff.email.includes(trimmed);
      return byActive && byKeyword;
    });
  }, [initialStaff, keyword, showInactive]);

  function refresh() {
    startRefresh(() => router.refresh());
  }

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
    refresh();
  }

  async function toggleActive(staff: StaffRow) {
    setBusyId(staff.id);
    setError(null);

    const { error: actionError } = await setStaffActive(staff.id, !staff.is_active);

    setBusyId(null);
    if (actionError) {
      setError(actionError);
      return;
    }
    refresh();
  }

  async function rename(staff: StaffRow) {
    setBusyId(staff.id);
    setError(null);

    const { error: actionError } = await renameStaff(staff.id, editingName);

    setBusyId(null);
    if (actionError) {
      setError(actionError);
      return;
    }
    setEditingId(null);
    refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">スタッフ</h1>

      <p className="text-sm text-ink-muted">
        追加したスタッフには、メールアドレスと初期パスワードを直接伝えてください（招待メールは送りません）。
        無効化するとログインできなくなりますが、過去の注文明細に残る担当者名はそのままです。
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="名前・メールアドレスで検索"
          className="h-9 w-64 rounded-lg border border-line bg-raised px-3 outline-none focus:border-accent"
        />
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.target.checked)}
            className="size-4 accent-[var(--color-accent)]"
          />
          無効化したスタッフを表示{inactiveCount > 0 && `（${inactiveCount}名）`}
        </label>
        <span className="text-xs text-ink-muted">
          {visible.length} / {initialStaff.length} 名
        </span>
      </div>

      {adding ? (
        <form
          action={formAction}
          className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4"
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">名前</span>
            <input name="name" required className="h-9 w-40 rounded-lg border border-line bg-raised px-2 outline-none focus:border-accent" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">メールアドレス</span>
            <input name="email" type="email" required className="h-9 w-64 rounded-lg border border-line bg-raised px-2 outline-none focus:border-accent" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">初期パスワード（8文字以上）</span>
            <input name="password" type="text" required minLength={8} className="h-9 w-56 rounded-lg border border-line bg-raised px-2 outline-none focus:border-accent" />
          </label>
          <button
            type="submit"
            disabled={formPending}
            className="h-9 rounded-lg bg-accent px-4 text-sm font-bold text-accent-ink disabled:opacity-50"
          >
            {formPending ? "追加中…" : "追加する"}
          </button>
          <button type="button" onClick={() => setAdding(false)} className="h-9 rounded-lg px-3 text-sm text-ink-muted">
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
            <th className="w-24 px-3 py-1 font-normal">権限</th>
            <th className="w-20 px-3 py-1 font-normal">状態</th>
            <th className="w-28 px-3 py-1 font-normal">登録日</th>
            <th className="w-72 px-3 py-1 font-normal">操作</th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-ink-muted">
                該当するスタッフがいません
              </td>
            </tr>
          )}

          {visible.map((staff) => {
            const isMe = staff.id === currentStaffId;
            const isAdmin = staff.role === "admin";
            // 有効な管理者が 0 人になると誰も /admin に入れなくなる（RPC 側でも同じ判定をしている）
            const lastAdmin = isAdmin && staff.is_active && activeAdminCount <= 1;
            const busy = busyId === staff.id || refreshing;

            return (
              <tr key={staff.id} className={staff.is_active ? "" : "opacity-50"}>
                <td className="rounded-l-lg bg-surface px-3 py-2 font-bold">
                  {editingId === staff.id ? (
                    <input
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void rename(staff);
                        if (event.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                      className="h-8 w-36 rounded-lg border border-line bg-raised px-2 outline-none focus:border-accent"
                    />
                  ) : (
                    <>
                      {staff.name}
                      {isMe && <span className="ml-2 text-xs font-normal text-ink-muted">自分</span>}
                    </>
                  )}
                </td>
                <td className="bg-surface px-3 py-2 text-ink-muted">{staff.email}</td>
                <td className="bg-surface px-3 py-2">{isAdmin ? "管理者" : "スタッフ"}</td>
                <td className="bg-surface px-3 py-2">{staff.is_active ? "有効" : "無効"}</td>
                <td className="bg-surface px-3 py-2 text-ink-muted tabular-nums">
                  {new Date(staff.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}
                </td>
                <td className="rounded-r-lg bg-surface px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {editingId === staff.id ? (
                      <>
                        <SmallButton label="保存" disabled={busy} onClick={() => void rename(staff)} />
                        <SmallButton label="取消" disabled={false} onClick={() => setEditingId(null)} />
                      </>
                    ) : (
                      <SmallButton
                        label="名前を変更"
                        disabled={busy}
                        onClick={() => {
                          setEditingId(staff.id);
                          setEditingName(staff.name);
                        }}
                      />
                    )}

                    {lastAdmin ? (
                      <span className="text-xs text-ink-muted">最後の管理者</span>
                    ) : (
                      <SmallButton
                        label={isAdmin ? "スタッフにする" : "管理者にする"}
                        disabled={busy}
                        onClick={() => void changeRole(staff, isAdmin ? "staff" : "admin")}
                      />
                    )}

                    {!isMe && !lastAdmin && (
                      <SmallButton
                        label={staff.is_active ? "無効化" : "有効化"}
                        danger={staff.is_active}
                        disabled={busy}
                        onClick={() => void toggleActive(staff)}
                      />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SmallButton({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded border px-2 py-1 text-xs disabled:opacity-40 ${
        danger ? "border-danger text-danger" : "border-line text-ink-muted"
      }`}
    >
      {label}
    </button>
  );
}
