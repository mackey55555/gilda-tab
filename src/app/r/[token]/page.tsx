import type { Metadata } from "next";

import { fetchReceipt } from "@/lib/receipt";

import { ReceiptView } from "./receipt-view";

export const metadata: Metadata = {
  title: "領収書 | gilda",
  // URL の鍵を知っている人だけのページ。検索エンジンに載せない
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const receipt = await fetchReceipt(token);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
      <header className="mb-5">
        <p className="text-sm tracking-widest text-accent">gilda</p>
        <h1 className="mt-0.5 text-lg text-ink-muted">領収書</h1>
      </header>

      {receipt ? (
        <ReceiptView token={token} receipt={receipt} />
      ) : (
        <div className="rounded-xl border border-line bg-surface p-5 text-sm leading-relaxed">
          <p className="font-bold">領収書を表示できません</p>
          <p className="mt-2 text-ink-muted">
            リンクの有効期限が切れているか、お会計が取り消された可能性があります。
            お手数ですが、お店のスタッフにお声がけください。
          </p>
        </div>
      )}
    </main>
  );
}
