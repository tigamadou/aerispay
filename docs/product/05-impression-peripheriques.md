# 05 — Impression ticket & périphériques

> Documentation produit dérivée du **code réel** (source de vérité).
> Périmètre : génération du ticket PDF, impression thermique ESC/POS, tiroir-caisse, douchette code-barres.

---

## 1. Objectif

AerisPay produit un **ticket de caisse** à partir d'une vente, sous deux formes complémentaires :

- un **ticket PDF** (téléchargeable, généré côté serveur avec `@react-pdf/renderer`) — toujours disponible ;
- une **impression thermique ESC/POS** sur imprimante ticket physique, plus l'**ouverture du tiroir-caisse** par impulsion — pilotées via `node-thermal-printer`, configurables par variables d'environnement, avec **dégradation gracieuse** quand le matériel est désactivé ou injoignable.

La **douchette code-barres** est gérée en mode **clavier (HID)** : elle saisit le code dans le champ de recherche du comptoir, sans pilote ni intégration dédiée.

L'impression thermique réelle est **construite** : `printReceipt()` imprime les lignes mises en forme par `buildReceiptContent` (voir §3.3). En desktop, le pont périphériques du main Electron pilote l'imprimante locale du poste (voir §9). Le ticket PDF reste pleinement fonctionnel côté navigateur/manager.

---

## 2. Ticket PDF

### 2.1 Contenu du ticket

Généré par `web/app/src/lib/receipt/pdf-generator.tsx`. Document A4, police `Courier`, mise en page « ticket ».

Structure (`ReceiptDocument`, pdf-generator.tsx:183) :

| Bloc | Contenu | Source / lignes |
|------|---------|-----------------|
| En-tête commerce | Logo (si présent), nom, adresse, téléphone, email | pdf-generator.tsx:190-203 |
| Identité fiscale | `RCCM: …` et/ou `NIF: …` (affichés seulement si renseignés) | pdf-generator.tsx:196-202 |
| Infos vente | N° de ticket (`sale.numero`), date/heure, caissier | pdf-generator.tsx:208-221 |
| Lignes | Désignation + référence produit, quantité, prix unitaire, sous-total | pdf-generator.tsx:234-244 |
| Totaux | Sous-total ; remise (si > 0) ; taxes ; **TOTAL TTC** | pdf-generator.tsx:249-279 |
| Paiements | Mode (libellé), montant reçu, monnaie rendue (espèces), référence | pdf-generator.tsx:284-311 |
| Pied | « Merci de votre confiance ! / Conservez ce ticket svp. / Emis par AerisPay » | pdf-generator.tsx:316-320 |

Détails de comportement :

- **Taxes** : si la vente porte un détail `taxesDetail` (tableau `{ nom, taux, montant }`), chaque taxe à montant > 0 est affichée nominativement (ex. `TVA (18%)`, `AIB (5%)`). À défaut, repli sur une ligne unique `TVA` si `sale.tva > 0` (pdf-generator.tsx:260-274).
- **Monnaie rendue** : calculée et affichée uniquement pour un paiement `ESPECES` lorsque le montant reçu dépasse le total (pdf-generator.tsx:297-302).
- **Libellés des modes de paiement** (`MODE_LABELS`, pdf-generator.tsx:65-71) : `ESPECES → Cash`, `MOBILE_MONEY → Mobile Money`, `MOBILE_MONEY_MTN → MomoPay`, `MOBILE_MONEY_MOOV → MoovMoney`, `CELTIS_CASH → Celtis Cash`. Mode inconnu : affiché tel quel.
- **Formatage monétaire** : `fmt()` arrondit et formate en `fr-FR` avec suffixe ` FCFA` (pdf-generator.tsx:73-75).
- **API publique** : `generateReceiptPDF(data): Promise<Buffer>` via `renderToBuffer` (pdf-generator.tsx:328-330).

### 2.2 Endpoint PDF

`GET /api/tickets/[id]/pdf` — `web/app/src/app/api/tickets/[id]/pdf/route.ts`.

- **Auth** : `requireAuth()` obligatoire (401 sinon).
- **Protection IDOR** : un `CAISSIER` ne peut télécharger que **ses propres** tickets (`vente.userId !== user.id` → 403, route.ts:33-35). `ADMIN`/`MANAGER` non restreints.
- Charge la vente (lignes + produit, paiements, caissier, session) puis les **paramètres commerce** (`prisma.parametres` id `default`) pour l'en-tête (nom, adresse, tél., email, RCCM, NIF, logo). Repli `name = "AerisPay"` si pas de paramètres (route.ts:39-47).
- Convertit les `Decimal` Prisma en `number` avant rendu (route.ts:53-71).
- **Réponse** : `application/pdf`, `Content-Disposition: attachment; filename="ticket-<numero>.pdf"`, `Cache-Control: private, no-cache` (route.ts:90-97).
- **Erreurs** : 404 vente introuvable ; 500 sur échec de génération.

**Activity log** : `TICKET_PDF_DOWNLOADED` (entité `Sale`), avec metadata `{ numero, total, dateVente, caissierNom }` + IP/User-Agent (route.ts:75-88).

---

## 3. Impression thermique ESC/POS

Implémentée dans `web/app/src/lib/receipt/thermal-printer.ts`. Import **dynamique** de `node-thermal-printer` pour éviter toute erreur si le paquet/matériel est absent (thermal-printer.ts:62).

### 3.1 Configuration (`getPrinterConfig`, thermal-printer.ts:21-28)

| Champ | Variable d'env | Défaut | Notes |
|-------|----------------|--------|-------|
| `enabled` | `PRINTER_ENABLED` | `false` | `"true"` strict pour activer |
| `type` | `PRINTER_TYPE` | `EPSON` | `EPSON` \| `STAR` |
| `interface` | `PRINTER_INTERFACE` | `tcp://127.0.0.1:9100` | TCP, USB ou série |
| `width` | `PRINTER_WIDTH` | `48` | `48` ou `32` colonnes |

### 3.2 Fallback gracieux

Le flux ne lève jamais d'exception non maîtrisée ; il retourne un `PrintResult { success, message }` :

- imprimante désactivée → `{ success: false, "Imprimante désactivée (PRINTER_ENABLED=false)" }` (thermal-printer.ts:56-57) ;
- imprimante injoignable (`isPrinterConnected()` faux) → `{ success: false, "Imprimante non joignable" }` (thermal-printer.ts:70-73) ;
- toute exception (import, connexion…) est capturée → `{ success: false, "Erreur imprimante : <msg>" }` (thermal-printer.ts:83-86).

### 3.3 Construction et impression du reçu

`printReceipt(venteId, options?)` (thermal-printer.ts:50-87) imprime les **lignes** fournies dans `options.lines`, puis `printer.cut()` et `printer.execute()`. Le contenu ESC/POS est construit en amont par **`buildReceiptContent`** (`web/app/src/lib/receipt/receipt-content.ts:91`), qui met en forme les lignes (en-tête commerce, articles, totaux, paiements) selon la largeur 32/48 colonnes.

```ts
for (const line of options?.lines ?? []) {
  printer.println(line);
}
printer.cut();
await printer.execute();   // thermal-printer.ts:76-80
```

En architecture desktop (C2.1, livré), c'est le **main Electron** qui appelle le pont périphériques local avec les lignes de `buildReceiptContent` ; le nœud magasin ne fournit que la charge utile du ticket (voir §9).

### 3.4 Endpoint impression

`POST /api/tickets/[id]/print` — `web/app/src/app/api/tickets/[id]/print/route.ts`.

- **Auth** : `requireAuth()` (401 sinon). Pas de restriction de rôle ni de contrôle IDOR ici.
- Vérifie l'existence de la vente (404 sinon), puis appelle `printReceipt(id)`.
- **Activity log** : `TICKET_THERMAL_PRINT_REQUESTED`, metadata `{ numero, success, message }` + IP/UA — journalisé **que l'impression réussisse ou non** (print/route.ts:23-31).
- **Réponse** : `200 { success: true, message }` si OK ; `503 { success: false, error: message }` si l'imprimante est désactivée/injoignable (print/route.ts:33-40) ; `500` sur erreur serveur.

---

## 4. Tiroir-caisse

Ouverture par **impulsion ESC/POS** émise via l'imprimante (`openCashDrawer`, thermal-printer.ts:80-111).

### 4.1 Configuration (`getCashDrawerConfig`, thermal-printer.ts:30-37)

| Champ | Variable d'env | Défaut | Notes |
|-------|----------------|--------|-------|
| `enabled` | `CASH_DRAWER_ENABLED` | `false` | `"true"` strict pour activer |
| `mode` | `CASH_DRAWER_MODE` | `printer` | `printer` (impulsion via imprimante) \| `direct` |
| `pin` | `CASH_DRAWER_PIN` | `2` | broche `2` ou `5` |
| `openOnCash` | `CASH_DRAWER_OPEN_ON_CASH` | `true` | faux seulement si `"false"` explicite |

### 4.2 Comportement

- Réutilise la config imprimante (`getPrinterConfig`) pour ouvrir la connexion (thermal-printer.ts:91-96), puis `printer.openCashDrawer()` + `printer.execute()` (thermal-printer.ts:103-104).
- **Fallback gracieux**, mêmes principes que l'impression : désactivé → `"Tiroir-caisse désactivé (CASH_DRAWER_ENABLED=false)"` ; injoignable → `"Tiroir-caisse non joignable"` ; exception → `"Erreur tiroir-caisse : <msg>"`.
- Remarque : bien que `mode`, `pin` et `openOnCash` soient lus depuis l'environnement, l'implémentation actuelle déclenche systématiquement l'impulsion via `openCashDrawer()` (le mode `direct` et la sélection de broche ne sont pas encore exploités dans le code).

### 4.3 Endpoint tiroir

`POST /api/cash-drawer/open` — `web/app/src/app/api/cash-drawer/open/route.ts`.

- **Auth** : `requireAuth()` (401 sinon).
- Appelle `openCashDrawer()`.
- **Activity log** : `CASH_DRAWER_OPENED` si succès, sinon `CASH_DRAWER_OPEN_FAILED`, metadata `{ success, message }` (open/route.ts:12-16).
- **Réponse** : `200 { success: true }` ou `503 { success: false, error }` ; `500` sur erreur serveur.

---

## 5. Douchette code-barres (USB/HID, mode clavier)

Aucun pilote ni intégration matérielle spécifique : la douchette fonctionne en **HID clavier**, elle « tape » le code-barres puis émet `Entrée`. La saisie est captée par le champ de recherche du comptoir.

Implémentation dans `web/app/src/components/comptoir/POSInterface.tsx` :

- Le champ de recherche est **maintenu en focus** au montage pour recevoir les scans (POSInterface.tsx:66-69, `data-testid="pos-search"`).
- À l'appui sur `Entrée` (`handleSearchKeyDown`, POSInterface.tsx:85-135), résolution en cascade sur produits **actifs et en stock** :
  1. correspondance exacte par **code-barres** (`p.codeBarres`) ;
  2. sinon correspondance exacte par **référence** ;
  3. sinon correspondance **unique** par nom (`includes`).
  En cas de correspondance, le produit est ajouté au panier (`addItem`) et le champ est vidé.
- Plusieurs correspondances par nom → la grille les affiche, le champ n'est pas vidé. Aucune correspondance → message `"Produit introuvable"` (POSInterface.tsx:125-132).
- Le filtre de la grille prend aussi en compte `codeBarres` (POSInterface.tsx:79). Le champ `codeBarres` est exposé par la page comptoir (`comptoir/page.tsx:20,117`).

---

## 6. Variables d'environnement

Déclarées dans `web/development.env.example` (l.53-62) et `web/production.env.example` (l.34-43), section « Périphériques caisse ».

| Variable | Lue par le code | Dev (exemple) | Prod (exemple) |
|----------|-----------------|---------------|----------------|
| `PRINTER_ENABLED` | oui | `false` | `false` |
| `PRINTER_TYPE` | oui | `EPSON` | `EPSON` |
| `PRINTER_INTERFACE` | oui | `tcp://192.168.1.100:9100` | `tcp://192.168.1.100:9100` |
| `PRINTER_WIDTH` | oui | `48` | `48` |
| `PRINTER_AUTO_PRINT` | **non** (déclarée mais non lue dans `thermal-printer.ts`) | `false` | `true` |
| `CASH_DRAWER_ENABLED` | oui | `false` | `false` |
| `CASH_DRAWER_MODE` | oui (config) | `printer` | `printer` |
| `CASH_DRAWER_PIN` | oui (config) | `2` | `2` |
| `CASH_DRAWER_OPEN_ON_CASH` | oui (config) | `true` | `true` |

> `PRINTER_AUTO_PRINT` figure dans les fichiers d'exemple mais n'est **pas** consommée par `getPrinterConfig()` / `getCashDrawerConfig()` à ce jour : l'impression automatique après vente n'est pas câblée côté lib.

---

## 7. Endpoints (récapitulatif)

| Méthode | Route | Auth / rôle | Effet | Activity log | Codes |
|---------|-------|-------------|-------|--------------|-------|
| `GET` | `/api/tickets/[id]/pdf` | Auth ; CAISSIER limité à ses ventes (IDOR) | Génère et renvoie le ticket PDF | `TICKET_PDF_DOWNLOADED` | 200 / 401 / 403 / 404 / 500 |
| `POST` | `/api/tickets/[id]/print` | Auth | Impression thermique ESC/POS | `TICKET_THERMAL_PRINT_REQUESTED` | 200 / 401 / 404 / 503 / 500 |
| `POST` | `/api/cash-drawer/open` | Auth | Impulsion d'ouverture tiroir | `CASH_DRAWER_OPENED` / `CASH_DRAWER_OPEN_FAILED` | 200 / 401 / 503 / 500 |

Constantes d'action : `web/app/src/lib/activity-log.ts:52-55`.

---

## 8. Tests existants

- `web/app/src/__tests__/tickets/pdf-api.test.ts` — couvre `GET /api/tickets/[id]/pdf` (Vitest, mocks Prisma/auth/activity-log/générateur PDF) :
  - 401 si non authentifié ; 404 si vente absente ;
  - en-têtes corrects sur succès (`application/pdf`, `Content-Disposition` avec `ticket-<numero>.pdf`, `Cache-Control: private, no-cache`) ;
  - repli `name = "AerisPay"` sans paramètres ; transmission des infos commerce ;
  - accessible à tous les rôles (ADMIN/MANAGER/CAISSIER) ;
  - transmission de `taxesDetail` (présent, `null`, ou champ non-tableau) ;
  - 500 sur échec du générateur.

Lacunes constatées (état actuel du dépôt) :
- aucun test pour `POST /api/tickets/[id]/print` ni pour `POST /api/cash-drawer/open` ;
- aucun test unitaire de la lib `thermal-printer.ts` (config env, fallback) ;
- pas de test ciblant le flux douchette dans `POSInterface`.

---

## 9. Architecture desktop — impression locale au poste (C2.1, livré)

Côté **nœud magasin**, les routes `tickets/[id]/print` et `cash-drawer/open` chargent encore `node-thermal-printer` dans le process Next.js (utile en mono-poste co-localisé). En **desktop**, les périphériques sont **locaux au poste** : la logique d'impression et d'ouverture tiroir vit dans le **main Electron** de chaque caisse (`desktop/src/devices.ts`) ; le **nœud magasin** ne fournit que la **charge utile** du ticket. Voir `docs/architecture-desktop/02-client-desktop.md`.

Implémentation livrée (`desktop/`) :

- **Pont périphériques** (`src/devices.ts`) : `printTicket(lines)` charge `node-thermal-printer`, imprime les lignes, coupe et exécute ; `openDrawer()` déclenche l'impulsion tiroir.
- **Preload bridge** (`src/preload.ts`) : expose une **liste blanche** via `contextBridge` — `window.aerisDevices.printTicket(lines)`, `.openDrawer()`, `.printerStatus()`. Le renderer n'a aucun accès `fs` / `child_process` / réseau brut.
- **Canaux IPC** (`src/channels.ts`) : `aeris:print-ticket`, `aeris:open-drawer`, `aeris:printer-status`.

Flux d'impression :

1. l'API du nœud magasin renvoie les **données du ticket**, mises en forme par `buildReceiptContent` (`web/app/src/lib/receipt/receipt-content.ts`) en lignes ESC/POS ;
2. le renderer appelle `window.aerisDevices.printTicket(lines)` ;
3. le **main Electron de la caisse** envoie la séquence à **son** imprimante locale, puis déclenche l'impulsion **tiroir** si demandé.

- **Douchette** : captée directement par l'UI en HID clavier.
- Les données restent **centralisées au magasin**, l'impression/tiroir sont pilotés **sur la bonne machine**.

Le ticket **PDF** reste pertinent côté navigateur/manager, qui ne pilote pas l'ESC/POS local (`02-client-desktop.md`).
