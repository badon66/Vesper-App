import "server-only";
import { Document, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { SignedAgreement } from "@/lib/quote-link/agreement";

// The signed agreement as a PDF (quote link take 3, Keenan, 2026-11-11).
// White, with navy and gold, like every document Vesper prints (CLAUDE.md).
// It is made from the record the database saved at the moment of signing
// (lib/quote-link/agreement.ts), so it reads the same every time it is
// opened: by Keenan from the lead page, by the customer from their link.

const NAVY = "#132E3F";
const GOLD = "#B99257";
const GREY = "#5B6670";
const RULE = "#D9DEE2";

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 54, fontSize: 10.5, color: NAVY, fontFamily: "Helvetica", lineHeight: 1.4 },
  brand: { fontSize: 16, fontFamily: "Helvetica-Bold", letterSpacing: 2 },
  brandSub: { fontSize: 8, letterSpacing: 3, color: GOLD, marginTop: 2 },
  rule: { height: 1, backgroundColor: GOLD, marginTop: 14, marginBottom: 18, width: 64 },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  muted: { color: GREY },
  section: { marginTop: 18 },
  heading: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: RULE },
  rowLabel: { flexGrow: 1, flexShrink: 1, paddingRight: 12 },
  rowAmount: { fontFamily: "Helvetica-Bold" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 6 },
  totalLabel: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  totalAmount: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  paragraph: { marginBottom: 6 },
  signatureBox: { marginTop: 8, borderWidth: 0.75, borderColor: RULE, borderRadius: 4, padding: 8, height: 110, justifyContent: "center", alignItems: "flex-start" },
  signature: { height: 90, objectFit: "contain" },
  footer: { position: "absolute", bottom: 28, left: 54, right: 54, fontSize: 8, color: GREY, textAlign: "center" },
});

function AgreementDocument({ agreement }: { agreement: SignedAgreement }) {
  const paragraphs = agreement.agreementText.split(/\n{2,}|\r\n\r\n/).map((part) => part.trim()).filter(Boolean);
  return (
    <Document title={`Vesper agreement, ${agreement.customerName || "customer"}`} author={agreement.company.name} creator={agreement.company.name}>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.brand}>VESPER</Text>
        <Text style={styles.brandSub}>LIGHTING</Text>
        <View style={styles.rule} />
        <Text style={styles.title}>Your agreement</Text>
        <Text style={[styles.muted, { marginTop: 4 }]}>
          Signed on {agreement.signedDay} at {agreement.signedTime}, Calgary time
        </Text>

        <View style={styles.section}>
          <Text style={styles.heading}>Prepared for</Text>
          {agreement.customerName ? <Text>{agreement.customerName}</Text> : null}
          {agreement.address ? <Text>{agreement.address}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Your choice: {agreement.option}</Text>
          {agreement.lines.map((line, at) => (
            <View key={at} style={styles.row} wrap={false}>
              <View style={styles.rowLabel}>
                <Text>{line.label}</Text>
                {line.detail ? <Text style={[styles.muted, { fontSize: 9 }]}>{line.detail}</Text> : null}
              </View>
              <Text style={styles.rowAmount}>{line.amount}</Text>
            </View>
          ))}
          {agreement.gst ? (
            <>
              <View style={styles.totalRow}>
                <Text>Subtotal</Text>
                <Text>{agreement.subtotal}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text>GST</Text>
                <Text>{agreement.gst}</Text>
              </View>
            </>
          ) : null}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalAmount}>{agreement.total}</Text>
          </View>
          {agreement.trackColour ? <Text style={{ marginTop: 8 }}>Track colour: {agreement.trackColour}</Text> : null}
          <Text style={{ marginTop: 8, fontFamily: "Helvetica-Bold" }}>No payment until your install is complete.</Text>
          {agreement.priceHeldUntil ? <Text style={styles.muted}>Price held until {agreement.priceHeldUntil}.</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>The agreement</Text>
          {paragraphs.map((paragraph, at) => (
            <Text key={at} style={styles.paragraph}>
              {paragraph}
            </Text>
          ))}
        </View>

        <View style={styles.section} wrap={false}>
          <Text style={styles.heading}>Signed</Text>
          <Text>Name: {agreement.signerName}</Text>
          <View style={styles.signatureBox}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- a PDF image, not an HTML one */}
            {agreement.signaturePng ? <Image src={agreement.signaturePng} style={styles.signature} /> : null}
          </View>
          <Text style={[styles.muted, { marginTop: 6, fontSize: 9 }]}>
            Signed with a finger on the customer&apos;s private quote link, {agreement.signedDay} at {agreement.signedTime}, Calgary time.
          </Text>
        </View>

        <Text style={styles.footer} fixed>
          {agreement.company.name} · {agreement.company.phone} · {agreement.company.email}
          {agreement.gstNumber ? ` · GST ${agreement.gstNumber}` : ""}
        </Text>
      </Page>
    </Document>
  );
}

export async function agreementPdf(agreement: SignedAgreement): Promise<Buffer> {
  return renderToBuffer(<AgreementDocument agreement={agreement} />);
}
