import path from "node:path";

import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { formatYen } from "@/lib/format";
import {
  formatReceiptDate,
  RECEIPT_PURPOSE,
  splitAddressee,
  type FinalizedReceipt,
} from "@/lib/receipt";

// 埋め込むのは実際に使った文字だけなので、9MB のフォントでも PDF は数十 KB に収まる。
// Vercel の関数に含めるため next.config.ts の outputFileTracingIncludes にも同じ場所を書いている。
const FONT_DIR = path.join(process.cwd(), "src/assets/fonts");

Font.register({
  family: "BIZUDPGothic",
  fonts: [
    { src: path.join(FONT_DIR, "BIZUDPGothic-Regular.ttf") },
    { src: path.join(FONT_DIR, "BIZUDPGothic-Bold.ttf"), fontWeight: "bold" },
  ],
});
// 日本語は単語の区切りがないため、長い宛名や住所を 1 文字単位で折り返せるようにする
Font.registerHyphenationCallback((word) => Array.from(word).flatMap((char) => [char, ""]));

const INK = "#1a1a1a";
const MUTED = "#6b6b6b";
const RULE = "#cfcfcf";

const styles = StyleSheet.create({
  page: { fontFamily: "BIZUDPGothic", color: INK, padding: "14mm 16mm", fontSize: 9 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontSize: 22, fontWeight: "bold", letterSpacing: 10 },
  meta: { alignItems: "flex-end", gap: 3 },
  metaRow: { flexDirection: "row", gap: 8 },
  metaLabel: { color: MUTED, width: 34, textAlign: "right" },
  addresseeRow: {
    marginTop: "9mm",
    flexDirection: "row",
    alignItems: "flex-end",
    width: "62%",
    borderBottom: `0.8pt solid ${INK}`,
    paddingBottom: 3,
  },
  addressee: { fontSize: 15, flexGrow: 1, flexShrink: 1 },
  honorific: { fontSize: 12, marginLeft: 6 },
  amountBox: {
    marginTop: "7mm",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f1ec",
    paddingVertical: "4.5mm",
  },
  amountLabel: { fontSize: 10, color: MUTED, marginRight: 14 },
  amount: { fontSize: 26, fontWeight: "bold", letterSpacing: 1 },
  amountSuffix: { fontSize: 10, marginLeft: 8, color: MUTED },
  purpose: { marginTop: "5mm", flexDirection: "row", gap: 10, fontSize: 10.5 },
  received: { marginTop: 4, color: MUTED },
  foot: { marginTop: "auto", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  breakdown: {
    width: "40%",
    borderTop: `0.6pt solid ${RULE}`,
    borderBottom: `0.6pt solid ${RULE}`,
    paddingVertical: 4,
  },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  issuer: { alignItems: "flex-end", gap: 2.5 },
  issuerName: { fontSize: 12, fontWeight: "bold", marginBottom: 2 },
  issuerSub: { color: MUTED },
});

/**
 * 適格簡易請求書の記載事項（発行者名と登録番号・取引日・取引内容・税率ごとの対価・税額）を満たす。
 * 税率は酒類・外食とも 10% だけなので、内訳は 1 行で足りる。
 */
function ReceiptDocument({ receipt }: { receipt: FinalizedReceipt }) {
  const { name, honorific } = splitAddressee(receipt.addressee);

  return (
    <Document title={`領収書 ${receipt.number}`} author={receipt.issuer_name}>
      <Page size="A5" orientation="landscape" style={styles.page}>
        <View style={styles.head}>
          <Text style={styles.title}>領収書</Text>
          <View style={styles.meta}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>No.</Text>
              <Text>{receipt.number}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>日付</Text>
              <Text>{formatReceiptDate(receipt.receipt_date)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.addresseeRow}>
          <Text style={styles.addressee}>{name}</Text>
          {honorific && <Text style={styles.honorific}>{honorific}</Text>}
        </View>

        <View style={styles.amountBox}>
          <Text style={styles.amountLabel}>金額</Text>
          <Text style={styles.amount}>{`${formatYen(receipt.amount)}-`}</Text>
          <Text style={styles.amountSuffix}>（税込）</Text>
        </View>

        <View style={styles.purpose}>
          <Text style={{ color: MUTED }}>但し</Text>
          <Text>{RECEIPT_PURPOSE}</Text>
        </View>
        <Text style={styles.received}>上記正に領収いたしました。</Text>

        <View style={styles.foot}>
          <View style={styles.breakdown}>
            <View style={styles.breakdownRow}>
              <Text>10%対象</Text>
              <Text>{formatYen(receipt.amount)}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={{ color: MUTED }}>（内消費税）</Text>
              <Text>{formatYen(receipt.tax)}</Text>
            </View>
          </View>
          <View style={styles.issuer}>
            <Text style={styles.issuerName}>{receipt.issuer_name}</Text>
            <Text style={styles.issuerSub}>{receipt.issuer_address}</Text>
            <Text style={styles.issuerSub}>{`TEL ${receipt.issuer_phone}`}</Text>
            {receipt.registration_number && (
              <Text style={styles.issuerSub}>{`登録番号 ${receipt.registration_number}`}</Text>
            )}
          </View>
        </View>
      </Page>
    </Document>
  );
}

export function renderReceiptPdf(receipt: FinalizedReceipt): Promise<Buffer> {
  return renderToBuffer(<ReceiptDocument receipt={receipt} />);
}
