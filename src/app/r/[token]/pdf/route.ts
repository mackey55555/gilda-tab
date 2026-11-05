import { fetchReceipt, isFinalized } from "@/lib/receipt";

import { renderReceiptPdf } from "../receipt-pdf";

/**
 * 確定済み領収書の PDF。
 * 確定前は番号も宛名もないので出さない（ページ側で宛名を確定してから押せるようにしている）。
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const receipt = await fetchReceipt(token);

  if (!receipt || !isFinalized(receipt)) {
    return new Response("領収書が見つからないか、まだ発行されていません", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const pdf = await renderReceiptPdf(receipt);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="receipt-${receipt.number}.pdf"`,
      // URL の鍵を知っている人だけが見られる個人向けの書類なので、共有キャッシュに載せない
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
