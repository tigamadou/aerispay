# 05 — Impression ticket & périphériques

> Documentation produit dérivée du **code réel** (source de vérité).
> Périmètre : génération du ticket PDF, impression thermique ESC/POS, tiroir-caisse, douchette code-barres.

---

## 1. Objectif

AerisPay produit un **ticket de caisse** à partir d'une vente, sous deux formes complémentaires :

- un **ticket PDF** (téléchargeable, généré côté serveur avec `@react-pdf/renderer`) — toujours disponible ;
- une **impression thermique ESC/POS** sur imprimante ticket physique, plus l'**ouverture du tiroir-caisse** par impulsion — pilotées via `node-thermal-printer`, configurables par variables d'environnement, avec **dégradation gracieuse** quand le matériel est désactivé ou injoignable.

La **douchette code-barres** est gérée en mode **clavier (HID)** : elle saisit le code dans le champ de recherche du comptoir, sans pilote ni intégration dédiée.

Point d'attention majeur : l'impression thermique réelle n'est **pas encore construite** — `printReceipt()` est un **stub** (voir §3.3). Le PDF, lui, est pleinement fonctionnel.

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

Implémentée dans `web/app/src/lib/receipt/thermal-printer.ts`. Import **dynamique** de `node-thermal-printer` pour éviter toute erreur si le paquet/matériel est absent (thermal-printer.ts:56).

### 3.1 Configuration (`getPrinterConfig`, thermal-printer.ts:21-28)

| Champ | Variable d'env | Défaut | Notes |
|-------|----------------|--------|-------|
| `enabled` | `PRINTER_ENABLED` | `false` | `"true"` strict pour activer |
| `type` | `PRINTER_TYPE` | `EPSON` | `EPSON` \| `STAR` |
| `interface` | `PRINTER_INTERFACE` | `tcp://127.0.0.1:9100` | TCP, USB ou série |
| `width` | `PRINTER_WIDTH` | `48` | `48` ou `32` colonnes |

### 3.2 Fallback gracieux

Le flux ne lève jamais d'exception non maîtrisée ; il retourne un `PrintResult { success, message }` :

- imprimante désactivée → `{ success: false, "Imprimante désactivée (PRINTER_ENABLED=false)" }` (thermal-printer.ts:50-52) ;
- imprimante injoignable (`isPrinterConnected()` faux) → `{ success: false, "Imprimante non joignable" }` (thermal-printer.ts:64-67) ;
- toute exception (import, connexion…) est capturée → `{ success: false, "Erreur imprimante : <msg>" }` (thermal-printer.ts:74-77).

### 3.3 État : `printReceipt()` est un STUB

`printReceipt(venteId, config?)` (thermal-printer.ts:44-78) **ne construit pas encore le contenu du reçu**. Après vérification de connexion il exécute `printer.execute()` sur un buffer **vide**, puis renvoie `{ success: true, "Ticket envoyé à l'imprimante" }`.

```ts
// TODO: Build receipt content from vente data
// For now, this is a stub that will be completed when PDF generation is implemented
await printer.execute();   // thermal-printer.ts:69-71
```

Conséquences :
- le paramètre `venteId` est ignoré (`_venteId`, thermal-printer.ts:45) : aucune donnée de vente n'est lue ni mise en forme ESC/POS ;
- une « impression » réussie n'imprime, en pratique, **aucune ligne**.

La construction réelle du reçu fait l'objet de la tâche **C2.1** de la roadmap desktop (voir §8).

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
| `POST` | `/api/tickets/[id]/print` | Auth | Impression thermique (stub) | `TICKET_THERMAL_PRINT_REQUESTED` | 200 / 401 / 404 / 503 / 500 |
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

## 9. Transition vers l'architecture desktop (tâche C2.1)

Aujourd'hui, impression et tiroir vivent **côté serveur** : les routes `tickets/[id]/print` et `cash-drawer/open` chargent `node-thermal-printer` dans le process Next.js et adressent une imprimante via `PRINTER_INTERFACE`. Ce modèle suppose que le matériel est joignable depuis le serveur — ce qui ne tient plus dès qu'on multiplie les caisses.

Dans l'architecture **desktop** (Electron), les périphériques sont **locaux au poste** de caisse. La logique d'impression et d'ouverture tiroir se **déplace dans le main process Electron** de chaque caisse ; le **nœud magasin** ne fournit plus que la **charge utile** du ticket. Voir `docs/architecture-desktop/02-client-desktop.md` (l.10, 19-21, 54-66, 81) et `docs/architecture-desktop/00-ROADMAP-IMPLEMENTATION.md` (l.57, 126).

Principes de la cible (02-client-desktop.md) :

- **Pont périphériques** dans le main Electron : pilote l'imprimante ESC/POS, le tiroir et expose le statut matériel ; c'est lui qui charge `node-thermal-printer` (l.42-46, 55).
- **Preload bridge** : expose une liste blanche restreinte de fonctions vers le renderer via `contextBridge`, p. ex. `window.aerisDevices.printTicket(payload)` et `window.aerisDevices.openDrawer()` (l.54, 71). Le renderer n'a aucun accès `fs` / `child_process` / réseau brut.
- **Flux d'impression cible** (l.60-64) :
  1. l'API du nœud magasin renvoie les **données du ticket** (ou directement la séquence ESC/POS) ;
  2. le renderer appelle `window.aerisDevices.printTicket(payload)` ;
  3. le **main Electron de la caisse** envoie la séquence à **son** imprimante locale, puis déclenche l'impulsion **tiroir** si demandé.
- **Douchette** : inchangée — captée directement par l'UI en HID clavier (l.64).
- Les données restent **centralisées au magasin**, mais l'impression/tiroir sont pilotés **sur la bonne machine**.

Travail attendu — **C2.1** (`00-ROADMAP-IMPLEMENTATION.md:126`), dépend de D0.2 :

1. **Construire le reçu réel** dans `printReceipt` (lever le stub actuel, thermal-printer.ts:69) ;
2. **Déplacer** `tickets/[id]/print` et `cash-drawer/open` vers le **main Electron** ;
3. Mettre en place l'IPC `window.aerisDevices.*`.

Critère de sortie V2 (Jalon J2) : « vente depuis Electron → nœud → impression locale + tiroir » avec impression ESC/POS fonctionnelle dans un Electron packagé sur au moins un OS cible (00-ROADMAP-IMPLEMENTATION.md:100, 130). Le ticket **PDF** reste pertinent côté navigateur/manager, qui ne pilote pas l'ESC/POS local (02-client-desktop.md:21).
