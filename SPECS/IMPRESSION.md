# Spec — Module Impression des Tickets

> **Implémentation matérielle (ordre des appels, Docker, douchette)** : voir `SPECS/PERIPHERIQUES.md`.

## Objectif
Générer des tickets de comptoir normalisés en PDF, les envoyer à une imprimante thermique POS et piloter le tiroir-caisse lorsque le matériel le permet.

---

## Format du Ticket Normalisé

### Dimensions
- **PDF A4** : pour archivage et envoi email
- **Thermique 80mm** : format POS standard (colonnes ≤ 48 chars)
- **Thermique 58mm** : format compact (colonnes ≤ 32 chars)

### Structure du Ticket

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         [NOM DU COMMERCE]
      [Adresse ligne 1]
      [Adresse ligne 2]
   Tél: [phone] | [email]
   RCCM: [rccm] | NIF: [nif]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ticket N°: VTE-2026-00042
Date:      23/04/2026 à 14:35
Caissier:  [Nom du caissier]
Session:   #42
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DÉSIGNATION        QTÉ    PU   TOTAL
─────────────────────────────────────
Farine 50kg          2  12500  25000
Sucre cristal 25kg   1   8500   8500
Huile 5L             3   4200  12600
─────────────────────────────────────
                 Sous-total:  46 100
                 Remise 5%:   -2 305
                 TVA 18%:      7 884
                ═══════════════════
                 TOTAL TTC:  51 679
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mode:    Espèces
Reçu:                     55 000 F
Monnaie:                   3 321 F
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    [  QR CODE DE VÉRIFICATION  ]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     Merci de votre confiance !
      Conservez ce ticket svp.
   Émis par AerisPay · v1.0.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Informations Obligatoires (Conformité légale)
1. Nom et adresse complète du commerce
2. Numéro RCCM (Registre du Commerce)
3. Numéro NIF/IFU (Identifiant Fiscal)
4. Numéro de ticket unique et séquentiel (mappé sur `Sale.number`)
5. Date et heure précises de la transaction
6. Identité du caissier (mappé sur `User.name`)
7. Détail complet des articles (désignation, quantité, prix unitaire, sous-total par ligne)
8. Sous-total avant remise
9. Montant de la remise (si applicable)
10. Base TVA et taux par ligne (si TVA applicable)
11. TOTAL TTC
12. Mode(s) de paiement
13. Montant reçu et monnaie rendue (si CASH)

---

## Implémentation

### Générateur PDF (`lib/receipt/pdf-generator.ts`)

```ts
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'

interface ReceiptData {
  sale: Sale & { lines: SaleLine[]; payments: Payment[]; cashier: User }
  business: {
    name: string
    address: string
    phone: string
    rccm: string
    nif: string
  }
}

export async function generateReceiptPDF(data: ReceiptData): Promise<Buffer> {
  const doc = <ReceiptDocument data={data} />
  return await renderToBuffer(doc)
}
```

**Règles de rendu PDF :**
- Police : `Courier` pour l'alignement des colonnes (monospace)
- Taille : 10pt pour le contenu, 12pt pour les totaux, 14pt pour le titre
- Marges : 10mm tout autour
- Couleur : noir sur blanc uniquement (optimisé impression)
- Séparateurs : lignes `─────` (tirets)
- Données vente lues sur `Sale` / `SaleLine` / `Payment` (noms de champs en anglais, cf. spec Comptoir)

### Commandes ESC/POS (`lib/receipt/thermal-printer.ts`)

```ts
import ThermalPrinter, { PrinterTypes } from 'node-thermal-printer'

interface PrinterConfig {
  type: 'EPSON' | 'STAR'
  interface: string  // 'tcp://192.168.1.100:9100' ou '/dev/usb/lp0'
  width: 48 | 32    // colonnes selon largeur papier
  cashDrawer?: {
    enabled: boolean
    pin: 2 | 5
    onTime: number
    offTime: number
  }
}

export async function printReceipt(data: ReceiptData, config: PrinterConfig): Promise<void> {
  const printer = new ThermalPrinter({ type: PrinterTypes[config.type], interface: config.interface })
  // ... construction du ticket
  await printer.execute()
}
```

**Séquence ESC/POS :**
1. `initialize()` — reset imprimante
2. En-tête : `alignCenter()` + `setTextSize(1,1)` + `bold(true)`
3. Séparateurs : `drawLine()`
4. Lignes article : `tableCustom()` avec colonnes alignées
5. Totaux : `alignRight()` + `bold(true)`
6. QR code : `printQR(data)` — encodé base64
7. Pied de page : `alignCenter()` + message
8. `cut()` — coupe automatique du papier
9. `beep()` — signal sonore (optionnel)

### Tiroir-caisse
- Mode recommandé : tiroir branché à l’imprimante ticket via port RJ11/RJ12, ouvert par impulsion ESC/POS (`kick drawer`) après paiement espèces validé.
- L’ouverture ne doit être déclenchée qu’après confirmation serveur de la vente ou via une action manuelle réservée `ADMIN` / `MANAGER`.
- En cas d’échec d’ouverture, la vente reste validée ; afficher une erreur claire et tracer l’événement si le journal d’activité est disponible.
- Les tiroirs USB/série directs sont supportés uniquement si l’interface est explicitement configurée côté serveur / conteneur.

### QR Code (`lib/receipt/qr-generator.ts`)
- Contenu : `aerispay://ticket?id={saleId}&n={number}&t={total}&d={date}`
- Format : PNG base64, taille 150×150px
- Niveau correction erreur : M (15%)
- Généré avec `qrcode` npm package

---

## Configuration (Variables d'Environnement)

```env
# Informations du commerce (affichées sur les tickets)
NEXT_PUBLIC_COMMERCE_NOM="Ma Boutique"
NEXT_PUBLIC_COMMERCE_ADRESSE="123 Rue du Commerce, Ville"
NEXT_PUBLIC_COMMERCE_TEL="+221 77 000 00 00"
NEXT_PUBLIC_COMMERCE_RCCM="SN-DKR-2024-B-12345"
NEXT_PUBLIC_COMMERCE_NIF="1234567890"

# Imprimante thermique
PRINTER_ENABLED=false                    # true pour activer
PRINTER_TYPE=EPSON                       # EPSON | STAR
PRINTER_INTERFACE=tcp://192.168.1.100:9100
PRINTER_WIDTH=48                         # 48 (80mm) | 32 (58mm)
PRINTER_AUTO_PRINT=false                 # impression auto après vente

# Tiroir-caisse
CASH_DRAWER_ENABLED=false                # true pour activer l'ouverture tiroir
CASH_DRAWER_MODE=printer                 # printer | direct
CASH_DRAWER_PIN=2                        # 2 ou 5 selon imprimante/tiroir
CASH_DRAWER_OPEN_ON_CASH=true            # ouvrir après vente espèces validée
```

---

## API Endpoints

### `GET /api/tickets/[id]/pdf`
- Génère et retourne le PDF du ticket (load `Sale` + relations)
- Header : `Content-Type: application/pdf`
- Header : `Content-Disposition: attachment; filename="ticket-VTE-2026-XXXXX.pdf"` (XXXXX issu de `number`)
- Cache : `Cache-Control: private, no-cache` (données financières)

### `POST /api/tickets/[id]/print`
- Envoie les commandes ESC/POS à l'imprimante configurée
- Body : `{ printerConfig?: PrinterConfig }` (override config env)
- Réponse succès : `{ success: true, message: "Ticket envoyé à l'imprimante" }`
- Réponse erreur : `{ success: false, error: "Imprimante non joignable" }`

### `POST /api/cash-drawer/open`
- Ouvre le tiroir-caisse configuré, sans impression de ticket
- Réservé `ADMIN` / `MANAGER`, ou action système après vente `CASH` validée
- Réponse succès : `{ success: true, message: "Tiroir-caisse ouvert" }`
- Réponse erreur : `{ success: false, error: "Tiroir-caisse non joignable" }`

---

## Interface Utilisateur

### Après validation d'une vente
```
┌─────────────────────────────────────┐
│  ✅ Vente enregistrée !             │
│                                     │
│  VTE-2026-00042 · 51 679 FCFA      │
│                                     │
│  [📄 Télécharger PDF]               │
│  [🖨️ Imprimer thermique]            │
│  [✕ Fermer]                         │
└─────────────────────────────────────┘
```

### Page ticket `/comptoir/tickets/[id]`
- Aperçu HTML fidèle au rendu imprimé
- Bouton "Télécharger PDF"
- Bouton "Imprimer" (appelle l'API print ou window.print())
- Bouton "Retour"

---

## Tests Requis
Ces tests doivent être écrits avant le générateur PDF, les endpoints ticket et l’intégration thermique selon la démarche **TDD**. Les tests automatisés passent en priorité ; les tests manuels d’imprimante restent explicitement tracés dans la validation.

- [ ] Génération PDF avec toutes les données → fichier valide non vide
- [ ] PDF contient : number, total, cashier (User.name), lignes
- [ ] Calculs corrects sur le ticket (subtotal, vat, total)
- [ ] QR code généré et lisible
- [ ] API /pdf retourne Content-Type: application/pdf
- [ ] Impression thermique : test connexion imprimante
- [ ] Impression thermique : ticket complet imprimé (test manuel)
- [ ] Gestion erreur imprimante non joignable → message d'erreur clair
- [ ] Ouverture tiroir-caisse après vente ESPECES → impulsion envoyée
- [ ] Ouverture tiroir manuelle sans rôle autorisé → 403
- [ ] Erreur tiroir-caisse non joignable → vente conservée + message clair
