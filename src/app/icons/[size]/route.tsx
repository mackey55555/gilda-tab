import { ImageResponse } from "next/og";

/**
 * ホーム画面追加用のアイコンを PNG で生成する。
 *
 * 画像ファイルを持たずに済むよう next/og（Next.js 同梱）で描く。
 * 外部の画像やフォントに依存しないので、CSP や配信の心配がいらない。
 */
const SIZES: Record<string, { size: number; maskable: boolean }> = {
  // Android の maskable は端が丸く切られるため、余白を多めに取る
  "192": { size: 192, maskable: false },
  "512": { size: 512, maskable: false },
  "maskable-512": { size: 512, maskable: true },
  // iOS のホーム画面用。透明を扱えないので背景を必ず塗る
  "apple-180": { size: 180, maskable: false },
};

export function generateStaticParams() {
  return Object.keys(SIZES).map((size) => ({ size }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size } = await params;
  const config = SIZES[size];

  if (!config) {
    return new Response("Not Found", { status: 404 });
  }

  // maskable はセーフゾーン（中央 80%）に収める
  const fontSize = config.size * (config.maskable ? 0.44 : 0.6);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#100e0c",
          color: "#d8a33f",
          fontSize,
          fontWeight: 700,
          letterSpacing: "-0.05em",
          // ベースラインを視覚的な中心に寄せる
          paddingBottom: fontSize * 0.12,
        }}
      >
        g
      </div>
    ),
    {
      width: config.size,
      height: config.size,
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    },
  );
}
