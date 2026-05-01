import React from "react";
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

// ─── Types ───────────────────────────────────────────

interface SaleLine {
  id: string;
  quantite: number;
  prixUnitaire: number;
  remise: number;
  tva: number;
  sousTotal: number;
  produit: { nom: string; reference: string };
}

interface Payment {
  id: string;
  mode: string;
  montant: number;
  reference: string | null;
}

interface ReceiptSale {
  id: string;
  numero: string;
  dateVente: Date;
  sousTotal: number;
  remise: number;
  tva: number;
  total: number;
  lignes: SaleLine[];
  paiements: Payment[];
  caissier: { nom: string };
}

interface BusinessInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  rccm: string;
  nif: string;
  logo?: string | null;
}

export interface ReceiptData {
  sale: ReceiptSale;
  business: BusinessInfo;
}

// ─── Helpers ─────────────────────────────────────────

const MODE_LABELS: Record<string, string> = {
  ESPECES: "Especes",
  CARTE_BANCAIRE: "Carte bancaire",
  MOBILE_MONEY: "Mobile Money",
  CHEQUE: "Cheque",
  VIREMENT: "Virement",
  AUTRE: "Autre",
};

function fmt(n: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(Math.round(n)).replace(/\u202F/g, " ")} FCFA`;
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Styles ──────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: "Courier",
    fontSize: 10,
    padding: 28,
    color: "#000",
  },
  header: {
    textAlign: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 6,
    objectFit: "contain",
  },
  title: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  subtext: {
    fontSize: 8,
    color: "#444",
    marginBottom: 1,
  },
  separator: {
    borderBottomWidth: 1,
    borderBottomColor: "#999",
    borderBottomStyle: "dashed",
    marginVertical: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  label: {
    fontSize: 10,
  },
  value: {
    fontSize: 10,
    fontWeight: "bold",
  },
  colHeader: {
    flexDirection: "row",
    marginBottom: 4,
    paddingBottom: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
  },
  colDesignation: { flex: 1, fontSize: 8, fontWeight: "bold" },
  colQte: { width: 30, fontSize: 8, fontWeight: "bold", textAlign: "right" },
  colPU: { width: 65, fontSize: 8, fontWeight: "bold", textAlign: "right" },
  colTotal: { width: 75, fontSize: 8, fontWeight: "bold", textAlign: "right" },
  lineRow: {
    flexDirection: "row",
    marginBottom: 3,
    alignItems: "flex-start",
  },
  lineDesignation: { flex: 1, fontSize: 9 },
  lineRef: { fontSize: 7, color: "#666" },
  lineQte: { width: 30, fontSize: 9, textAlign: "right" },
  linePU: { width: 65, fontSize: 9, textAlign: "right" },
  lineTotal: { width: 75, fontSize: 9, textAlign: "right", fontWeight: "bold" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  totalLabel: { fontSize: 10 },
  totalValue: { fontSize: 10 },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1.5,
    borderTopColor: "#000",
    paddingTop: 4,
    marginTop: 4,
  },
  grandTotalLabel: { fontSize: 12, fontWeight: "bold" },
  grandTotalValue: { fontSize: 12, fontWeight: "bold" },
  footer: {
    textAlign: "center",
    marginTop: 16,
    fontSize: 8,
    color: "#666",
  },
});

// ─── Receipt Document ────────────────────────────────

function ReceiptDocument({ data }: { data: ReceiptData }) {
  const { sale, business } = data;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Business header */}
        <View style={s.header}>
          {business.logo ? <Image src={business.logo} style={s.logo} /> : null}
          <Text style={s.title}>{business.name}</Text>
          {business.address ? <Text style={s.subtext}>{business.address}</Text> : null}
          {business.phone ? <Text style={s.subtext}>Tel: {business.phone}</Text> : null}
          {business.email ? <Text style={s.subtext}>{business.email}</Text> : null}
          {(business.rccm || business.nif) && (
            <Text style={s.subtext}>
              {business.rccm ? `RCCM: ${business.rccm}` : ""}
              {business.rccm && business.nif ? " | " : ""}
              {business.nif ? `NIF: ${business.nif}` : ""}
            </Text>
          )}
        </View>

        <View style={s.separator} />

        {/* Sale info */}
        <View>
          <View style={s.row}>
            <Text style={s.label}>Ticket N°:</Text>
            <Text style={s.value}>{sale.numero}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.label}>Date:</Text>
            <Text style={s.label}>{formatDate(sale.dateVente)}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.label}>Caissier:</Text>
            <Text style={s.label}>{sale.caissier.nom}</Text>
          </View>
        </View>

        <View style={s.separator} />

        {/* Line items header */}
        <View style={s.colHeader}>
          <Text style={s.colDesignation}>DESIGNATION</Text>
          <Text style={s.colQte}>QTE</Text>
          <Text style={s.colPU}>PU</Text>
          <Text style={s.colTotal}>TOTAL</Text>
        </View>

        {/* Line items */}
        {sale.lignes.map((ligne) => (
          <View key={ligne.id} style={s.lineRow}>
            <View style={s.lineDesignation}>
              <Text>{ligne.produit.nom}</Text>
              <Text style={s.lineRef}>{ligne.produit.reference}</Text>
            </View>
            <Text style={s.lineQte}>{ligne.quantite}</Text>
            <Text style={s.linePU}>{fmt(Number(ligne.prixUnitaire))}</Text>
            <Text style={s.lineTotal}>{fmt(Number(ligne.sousTotal))}</Text>
          </View>
        ))}

        <View style={s.separator} />

        {/* Totals */}
        <View>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Sous-total</Text>
            <Text style={s.totalValue}>{fmt(Number(sale.sousTotal))}</Text>
          </View>
          {Number(sale.remise) > 0 && (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Remise</Text>
              <Text style={s.totalValue}>-{fmt(Number(sale.remise))}</Text>
            </View>
          )}
          {Number(sale.tva) > 0 && (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>TVA</Text>
              <Text style={s.totalValue}>{fmt(Number(sale.tva))}</Text>
            </View>
          )}
          <View style={s.grandTotalRow}>
            <Text style={s.grandTotalLabel}>TOTAL TTC</Text>
            <Text style={s.grandTotalValue}>{fmt(Number(sale.total))}</Text>
          </View>
        </View>

        <View style={s.separator} />

        {/* Payments */}
        {sale.paiements.map((p) => {
          const montant = Number(p.montant);
          const total = Number(sale.total);
          return (
            <View key={p.id}>
              <View style={s.row}>
                <Text style={s.label}>Mode:</Text>
                <Text style={s.label}>{MODE_LABELS[p.mode] ?? p.mode}</Text>
              </View>
              <View style={s.row}>
                <Text style={s.label}>Recu:</Text>
                <Text style={s.label}>{fmt(montant)}</Text>
              </View>
              {p.mode === "ESPECES" && montant > total && (
                <View style={s.row}>
                  <Text style={s.label}>Monnaie:</Text>
                  <Text style={s.label}>{fmt(montant - total)}</Text>
                </View>
              )}
              {p.reference && (
                <View style={s.row}>
                  <Text style={s.label}>Ref:</Text>
                  <Text style={s.label}>{p.reference}</Text>
                </View>
              )}
            </View>
          );
        })}

        <View style={s.separator} />

        {/* Footer */}
        <View style={s.footer}>
          <Text>Merci de votre confiance !</Text>
          <Text>Conservez ce ticket svp.</Text>
          <Text style={{ marginTop: 4 }}>Emis par AerisPay</Text>
        </View>
      </Page>
    </Document>
  );
}

// ─── Public API ──────────────────────────────────────

export async function generateReceiptPDF(data: ReceiptData): Promise<Buffer> {
  return await renderToBuffer(<ReceiptDocument data={data} />);
}
