# Bibliothèque de prompts — Aerispay

Cette bibliothèque centralise les prompts utilisés avec Claude Code 
pour automatiser la génération de spécifications, revues, et documentation.

## Conventions

- Tous les prompts sont en français
- Chaque prompt commence par une en-tête YAML décrivant son intention
- Les livrables attendus sont précisés dans l'en-tête (`output:`)
- Un prompt = un objectif clair

## Index

### Specs (génération de spécifications)
- `specs/generate_spec_caisse.md` — Module Caisse
<!-- - `specs/generate_spec_comptabilite.md` — Module Comptabilité (à venir) -->

### Reviews (revues automatisées)
<!-- - `reviews/code_review_security.md` — Audit sécurité -->

### Docs (documentation utilisateur)
<!-- - `docs/generate_user_doc.md` — Documentation utilisateur finale -->

## Utilisation

Dans Claude Code, depuis la racine du projet :

  Lis prompts/<chemin>/<fichier>.md et exécute la mission.