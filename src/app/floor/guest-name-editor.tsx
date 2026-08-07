"use client";

import { useState } from "react";

import { guestLabel } from "@/lib/format";
import { filterGuestSuggestions, type GuestSuggestion } from "@/lib/guest-suggestions";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = {
  tabId: string;
  seq: number;
  guestName: string | null;
  editable: boolean;
  /** 過去に使った客名。よく使う順。 */
  suggestions: GuestSuggestion[];
  /** 保存できたら親に再取得させる */
  onChange: () => void;
};

/** 客名。仮名（客1・客2）のままでも運用できるので、常に任意入力。 */
export function GuestNameEditor({ tabId, seq, guestName, editable, suggestions, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(guestName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 入力途中の文字で絞る。空のときはよく使う名前をそのまま出す。
  const matched = filterGuestSuggestions(suggestions, draft);

  async function save(value?: string) {
    const trimmed = (value ?? draft).trim();
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

    onChange();
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          if (!editable) return;
          // 開くたびに現在の値を入れ直す（前回の入力途中が残らないように）
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
          autoComplete="off"
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
      {matched.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {matched.map((suggestion) => (
            <button
              key={suggestion.name}
              type="button"
              onClick={() => {
                setDraft(suggestion.name);
                // 選んだ時点で確定させる。1 タップで済ませたいので保存まで行う。
                void save(suggestion.name);
              }}
              disabled={saving}
              className="min-h-tap rounded-full border border-line bg-raised px-4 text-sm disabled:opacity-50"
            >
              {suggestion.name}
              {suggestion.count > 1 && (
                <span className="ml-1.5 text-xs text-ink-muted">{suggestion.count}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
