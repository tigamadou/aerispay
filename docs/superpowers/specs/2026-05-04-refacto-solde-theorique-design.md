# Refactorisation du solde theorique de caisse

**Date :** 2026-05-04
**Statut :** Valide
**Scope :** Logique de calcul du solde theorique, format des declarations d'ouverture, structure des ecarts

---

## 1. Probleme

Le solde theorique de fermeture est calcule a partir du **montant declare a l'ouverture** par le caissier :

```
montantAttendu = montantOuvertureCash + somme(mouvements_session)
```

Si le caissier declare un montant different du solde reel a l'ouverture, cette erreur se propage a la fermeture et genere un faux ecart. Exemple :

```
Solde reel caisse (grand livre) : 80 000
Declare a l'ouverture           : 100 000  (+20 000 excedent)
Ventes pendant session          : 50 000
Theorique fermeture (actuel)    : 100 000 + 50 000 = 150 000  <- FAUX
Declare a la fermeture          : 130 000  (le vrai montant)
Resultat                        : -20 000 manquant <- FAUX
```

## 2. Solution

### Principe

Le **grand livre de mouvements** (`computeSoldeCaisseParMode(caisseId)`) est la seule source de verite pour le solde theorique. Les declarations d'ouverture et de fermeture sont des **comptages physiques** (observations) compares au grand livre, sans l'influencer.

### Resultat attendu avec la meme situation

```
Solde caisse (grand livre)    : 80 000
Declare a l'ouverture         : 100 000  -> ecart ouverture: +20 000 (logue)
Ventes pendant session        : 50 000
Solde caisse apres ventes     : 80 000 + 50 000 = 130 000  <- source de verite
Declare a la fermeture        : 130 000
Ecart fermeture               : 0  <- CORRECT
```

## 3. Uniformisation des declarations d'ouverture

### Avant

Deux champs scalaires sur `ComptoirSession` :

- `montantOuvertureCash: Decimal`
- `montantOuvertureMobileMoney: Decimal`

### Apres

Un champ JSON dynamique, identique a `declarationsCaissier` (fermeture) :

- `declarationsOuverture: Json` -> `{ "ESPECES": 50000, "MOBILE_MONEY_MTN": 10000 }`

Les codes modes de paiement sont dynamiques (table `ModePaiement` en base). Le format `Record<string, number>` accepte n'importe quel code sans migration.

### Validation Zod

```typescript
const openSessionSchema = z.object({
  declarations: z.record(z.string(), z.number().min(0)),
  confirmeEcart: z.boolean().optional(),
});
```

Verification supplementaire cote serveur : les codes fournis doivent correspondre a des modes existants en base.

## 4. Structure unifiee des ecarts

Format identique pour ouverture et fermeture :

```typescript
interface EcartParMode {
  mode: string;        // code dynamique depuis la base
  theorique: number;   // grand livre au moment du comptage
  declare: number;     // comptage physique
  ecart: number;       // declare - theorique
  categorie: "MINEUR" | "MOYEN" | "MAJEUR" | null;
}
```

### Champs sur ComptoirSession

| Champ | Type | Quand rempli |
|-------|------|-------------|
| `declarationsOuverture` | `Json` | Ouverture — `{ mode: montant }` |
| `ecartsOuverture` | `Json` | Ouverture — `EcartParMode[]` calcule par le serveur |
| `declarationsCaissier` | `Json` | Fermeture — existe deja |
| `declarationsValideur` | `Json` | Validation — existe deja |
| `ecartsParMode` | `Json` | Fermeture/Validation — existe deja, structure alignee |

### Champs deprecies

Conserves temporairement en base pour retrocompatibilite, mais plus utilises dans les calculs :

- `montantOuvertureCash`
- `montantOuvertureMobileMoney`
- `montantFermetureCash`
- `montantFermetureMobileMoney`

Alimentes a l'ecriture (somme ESPECES -> cash, somme autres -> mobileMoney) pour ne pas casser les lectures legacy.

### Categorisation des ecarts

Reutilisation des seuils existants dans `SeuilCaisse` :

- `MINEUR` : |ecart| <= seuil mineur (defaut 500 FCFA)
- `MOYEN` : seuil mineur < |ecart| <= seuil majeur (defaut 5000 FCFA)
- `MAJEUR` : |ecart| > seuil majeur

## 5. Flux revise

### Ouverture

```
1. Caissier saisit ses comptages par mode
   -> POST /api/comptoir/sessions { declarations: { ESPECES: 50000, ... } }

2. Serveur :
   a. Recupere le solde du grand livre : computeSoldeCaisseParMode(caisseId)
   b. Compare chaque mode : ecart = declare - theorique
   c. Si aucun ecart -> cree la session directement
   d. Si ecart detecte ET pas de confirmeEcart -> retourne 409 + details des ecarts
   e. Si ecart detecte ET confirmeEcart: true -> cree la session + stocke ecartsOuverture

3. Aucun mouvement cree dans le grand livre
```

### Pendant la session

Inchange — les ventes, apports, retraits, depenses creent des mouvements dans le grand livre.

### Fermeture (cloture)

```
1. Caissier declare ses comptages par mode
   -> POST /api/comptoir/sessions/[id]/closure { declarations: { ESPECES: 78000, ... } }

2. Serveur :
   a. Solde theorique = computeSoldeCaisseParMode(caisseId)
   b. Ecarts calcules par mode : declare - theorique
   c. Stocke ecartsParMode + transition EN_ATTENTE_VALIDATION
```

### Validation aveugle

Inchangee. Le manager fait son propre comptage physique sans voir les chiffres du caissier. La reconciliation compare trois valeurs (theorique, caissier, valideur) avec les regles existantes.

## 6. Fichiers impactes

### Schema Prisma

Ajout de deux champs sur `ComptoirSession` :

- `declarationsOuverture Json?`
- `ecartsOuverture Json?`

### API — Fichiers modifies

| Fichier | Modification |
|---------|-------------|
| `lib/validations/session.ts` | `openSessionSchema` -> `declarations: z.record(...)` + verification codes modes en base |
| `api/comptoir/sessions/route.ts` (POST) | Comparer au grand livre par mode, stocker `declarationsOuverture` + `ecartsOuverture`, alimenter anciens champs |
| `api/comptoir/sessions/[id]/route.ts` (GET) | `montantAttendu*` depuis `computeSoldeCaisseParMode(caisseId)` |
| `api/comptoir/sessions/[id]/closure/route.ts` | Theorique depuis `computeSoldeCaisseParMode(caisseId)` |

### Frontend — Fichiers modifies

| Fichier | Modification |
|---------|-------------|
| `components/comptoir/SessionManager.tsx` | Ouverture : envoyer `declarations: Record<string, number>`. Modal d'ecart : afficher ecarts par mode dynamiquement |

### Fichiers NON modifies

- `api/comptoir/sessions/[id]/validate/route.ts` — recoit le theorique en amont
- `api/comptoir/sessions/[id]/force-close/route.ts`
- `api/comptoir/sessions/[id]/correct/route.ts`
- `api/comptoir/sessions/[id]/verify/route.ts`
- `lib/services/integrity.ts` — hash base sur mouvements et declarations
- `lib/services/reconciliation.ts` — agnostique de la source du theorique

### Tests a adapter

| Fichier | Raison |
|---------|--------|
| `__tests__/comptoir/api.test.ts` | Nouvelle structure d'ouverture |
| `__tests__/components/SessionManager.test.tsx` | Nouveau format et modal |
| `__tests__/comptoir/sessions-id-api.test.ts` | Nouveau calcul du theorique |
| `__tests__/caisse/closure-fond-ouverture.test.ts` | Fond d'ouverture ne determine plus le theorique |

## 7. Ce qui ne change pas

- Flux de validation aveugle + reconciliation
- Hash d'integrite chaine
- Mouvements manuels (apport, retrait, depense)
- Force close / correction
- Permissions et protection IDOR
- Z-report
- Seuils de caisse
