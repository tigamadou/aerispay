# AerisPay

Application web de caisse enregistreuse et de gestion commerciale pour petits et moyens commerces.

## Matériel Cible

AerisPay doit être compatible avec les périphériques de caisse courants :

- Imprimante ticket de caisse thermique ESC/POS, 58mm ou 80mm.
- Douchette lecteur de code-barres USB/HID en mode clavier.
- Tiroir-caisse ouvert par impulsion ESC/POS via l’imprimante ticket, ou par interface directe configurée.

Pour l’ordre d’appel (vente → impression → tiroir), le réseau Docker et les tests : **`SPECS/PERIPHERIQUES.md`** (à lire avec `SPECS/CAISSE.md` et `SPECS/IMPRESSION.md`).

## Méthodologie

Le projet suit une démarche **TDD obligatoire** : pour chaque fonctionnalité, correction ou régression, écrire d’abord les tests qui décrivent le comportement attendu, puis implémenter le code jusqu’à ce que ces tests passent.

Les tests se font avec Vitest pour l’API et la logique métier, React Testing Library pour les composants, et Playwright pour les parcours critiques.
