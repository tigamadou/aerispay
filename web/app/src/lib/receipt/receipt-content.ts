/**
 * C2.1 — Construction du contenu d'un ticket de caisse (texte ESC/POS).
 *
 * Fonction pure : transforme une vente en lignes de texte prêtes à imprimer, bornées
 * à la largeur du papier (32 ou 48 colonnes). Découplée du transport imprimante
 * (node-thermal-printer) pour rester testable côté nœud ; le pont périphérique
 * Electron (main) appelle `printReceipt`, qui consomme ces lignes.
 */

export interface ReceiptLine {
  nom: string;
  quantite: number;
  prixUnitaire: number;
  sousTotal: number;
}

export interface ReceiptTaxe {
  nom: string;
  taux: number;
  montant: number;
}

export interface ReceiptPaiement {
  mode: string;
  montant: number;
}

export interface ReceiptContentData {
  business: {
    name: string;
    address?: string;
    phone?: string;
    rccm?: string;
    nif?: string;
  };
  sale: {
    numero: string;
    dateVente: Date;
    caissierNom: string;
    lignes: ReceiptLine[];
    sousTotal: number;
    remise: number;
    taxesDetail?: ReceiptTaxe[] | null;
    total: number;
    paiements: ReceiptPaiement[];
  };
}

const MODE_LABELS: Record<string, string> = {
  ESPECES: "Cash",
  MOBILE_MONEY: "Mobile Money",
  MOBILE_MONEY_MTN: "MomoPay",
  MOBILE_MONEY_MOOV: "MoovMoney",
  CELTIS_CASH: "Celtis Cash",
};

function fmtMontant(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(Math.round(n)).replace(/ /g, " ");
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** Coupe une chaîne à la largeur du papier. */
function clip(s: string, width: number): string {
  return s.length <= width ? s : s.slice(0, width);
}

/** Ligne "gauche ........ droite" justifiée sur `width`, tronquée si nécessaire. */
function pair(left: string, right: string, width: number): string {
  const space = width - right.length;
  if (space <= 1) return clip(`${left} ${right}`, width);
  const l = left.length > space - 1 ? left.slice(0, space - 1) : left;
  return clip(l + " ".repeat(width - l.length - right.length) + right, width);
}

function centre(s: string, width: number): string {
  const t = clip(s, width);
  const pad = Math.max(0, Math.floor((width - t.length) / 2));
  return " ".repeat(pad) + t;
}

const SEP = (width: number) => "-".repeat(width);

/**
 * Construit les lignes de texte du ticket, bornées à `width` colonnes.
 */
export function buildReceiptContent(data: ReceiptContentData, width: 32 | 48): string[] {
  const { business, sale } = data;
  const lines: string[] = [];

  // En-tête commerce
  lines.push(centre(business.name, width));
  if (business.address) lines.push(centre(business.address, width));
  if (business.phone) lines.push(centre(business.phone, width));
  const ids = [business.rccm && `RCCM ${business.rccm}`, business.nif && `NIF ${business.nif}`]
    .filter(Boolean)
    .join("  ");
  if (ids) lines.push(centre(ids, width));
  lines.push(SEP(width));

  // Méta vente
  lines.push(clip(`Ticket : ${sale.numero}`, width));
  lines.push(clip(`Date   : ${formatDate(sale.dateVente)}`, width));
  lines.push(clip(`Caissier : ${sale.caissierNom}`, width));
  lines.push(SEP(width));

  // Lignes produits
  for (const l of sale.lignes) {
    lines.push(clip(l.nom, width));
    lines.push(pair(`  ${l.quantite} x ${fmtMontant(l.prixUnitaire)}`, fmtMontant(l.sousTotal), width));
  }
  lines.push(SEP(width));

  // Totaux
  lines.push(pair("Sous-total", `${fmtMontant(sale.sousTotal)} FCFA`, width));
  if (sale.remise > 0) {
    lines.push(pair("Remise", `-${fmtMontant(sale.remise)} FCFA`, width));
  }
  for (const t of sale.taxesDetail ?? []) {
    lines.push(pair(`${t.nom} (${t.taux}%)`, `${fmtMontant(t.montant)} FCFA`, width));
  }
  lines.push(pair("TOTAL", `${fmtMontant(sale.total)} FCFA`, width));
  lines.push(SEP(width));

  // Paiements
  for (const p of sale.paiements) {
    const label = MODE_LABELS[p.mode] ?? p.mode;
    lines.push(pair(label, `${fmtMontant(p.montant)} FCFA`, width));
  }
  lines.push(SEP(width));
  lines.push(centre("Merci de votre visite", width));

  return lines;
}
