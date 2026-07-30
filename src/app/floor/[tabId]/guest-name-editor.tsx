"use client";

import { useState } from "react";

import { guestLabel } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = {
  tabId: string;
  seq: number;
  guestName: string | null;
  editable: boolean;
  onChange: (name: string | null) => void;
};

/** 客名。仮名（客1・客2）のままでも運用できるので、常に任意入力。 */
export function GuestNameEditor({ tabId, seq, guestName, editable, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(guestName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : trimmed;

    setSaving(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const { error: updateError } = await supabase
      .from("tabs")
      .update({ guest_name: next })
      .eq("id", tabId);

    setSaving(false);

    if (updateError) {
      setError("客名を保存できませんでした");
      return;
    }

    onChange(next);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          if (!editable) return;
          setDraft(guestName ?? "");
          setEditing(true);
        }}
        disabled={!editable}
        className="min-h-tap text-left text-2xl font-bold disabled:opacity-100"
      >
        {guestLabel(guestName, seq)}
        {editable && <span className="ml-2 align-middle text-xs text-ink-muted">編集</span>}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`客${seq}`}
          autoFocus
          enterKeyHint="done"
          onKeyDown={(event) => {
            if (event.key === "Enter") void save();
            if (event.key === "Escape") setEditing(false);
          }}
          className="min-h-tap min-w-0 flex-1 rounded-lg border border-line bg-raised px-3 text-lg outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="min-h-tap shrink-0 rounded-lg bg-accent px-4 font-bold text-accent-ink disabled:opacity-50"
        >
          {saving ? "保存中" : "保存"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="min-h-tap shrink-0 px-2 text-sm text-ink-muted"
        >
          取消
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
