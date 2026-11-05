"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { Database } from "@/lib/database.types";
import { validateRegistrationNumber } from "@/lib/registration-number";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Shop = Pick<
  Database["public"]["Tables"]["shop_settings"]["Row"],
  "name" | "address" | "phone" | "registration_number" | "updated_at"
>;

type Props = { initial: Shop };

export function ShopForm({ initial }: Props) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [name, setName] = useState(initial.name);
  const [address, setAddress] = useState(initial.address);
  const [phone, setPhone] = useState(initial.phone);
  const [registration, setRegistration] = useState(initial.registration_number ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    name !== initial.name ||
    address !== initial.address ||
    phone !== initial.phone ||
    registration !== (initial.registration_number ?? "");

  async function save() {
    const draft = {
      name: name.trim(),
      address: address.trim(),
      phone: phone.trim(),
      // 登録番号を消した場合は、領収書に登録番号の行を出さない
      registration_number: registration.trim().toUpperCase() || null,
    };

    if (!draft.name || !draft.address || !draft.phone) {
      setError("店名・住所・電話番号は必須です");
      return;
    }
    if (draft.registration_number) {
      const message = validateRegistrationNumber(draft.registration_number);
      if (message) {
        setError(message);
        return;
      }
    }

    setSaving(true);
    setError(null);
    setSaved(false);

    const supabase = getSupabaseBrowserClient();
    const { data, error: updateError } = await supabase
      .from("shop_settings")
      .update(draft)
      .eq("id", true)
      .select("id");

    setSaving(false);

    // RLS で弾かれた場合はエラーにならず 0 件で返る
    if (updateError || (data?.length ?? 0) === 0) {
      setError(updateError?.message ?? "保存できませんでした（権限がない可能性があります）");
      return;
    }

    setSaved(true);
    startRefresh(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <Field label="店名（発行者名）" value={name} onChange={setName} />
      <Field label="住所" value={address} onChange={setAddress} />
      <Field label="電話番号" value={phone} onChange={setPhone} inputMode="tel" />
      <Field
        label="インボイス登録番号（任意）"
        value={registration}
        onChange={(value) => setRegistration(value.replace(/\s/g, ""))}
        placeholder="T1234567890123"
        hint="空欄にすると、領収書に登録番号を載せません"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || saving || refreshing}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-accent-ink disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存する"}
        </button>
        {saved && !dirty && <span className="text-sm text-ink-muted">保存しました</span>}
        <span className="ml-auto text-xs text-ink-muted">
          最終更新{" "}
          {new Date(initial.updated_at).toLocaleString("ja-JP", {
            timeZone: "Asia/Tokyo",
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </span>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  inputMode?: "tel";
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-ink-muted">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="h-9 rounded-lg border border-line bg-raised px-2 outline-none focus:border-accent"
      />
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}
