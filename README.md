# Humaniseur de texte

Rend un texte écrit par une IA plus naturel : formules creuses, restes de conversation, tirets en série, rythme, vocabulaire. Français uniquement.

- Tout se passe dans le navigateur : aucune donnée envoyée, aucun traceur, aucune dépendance.
- Corrige aussi les fautes courantes (accents oubliés, mots collés, espaces, majuscules, mots répétés) ; pas les accords ni les conjugaisons.
- Chaque changement est listé et refusable ; ce que seul l'auteur peut ajouter (faits, noms, anecdotes) est signalé, pas inventé.
- **Aucune promesse sur les détecteurs d'IA** : l'outil applique des règles écrites, il n'embarque pas de modèle de langage.

## Développement

```
node --test test/*.mjs      # tests du moteur
python3 -m http.server # puis ouvrir http://localhost:8000
```

`moteur.js` est le moteur (fonctions pures), `app.js` l'interface, `index.html` + `style.css` la page.
Licence GPL-3.0.
