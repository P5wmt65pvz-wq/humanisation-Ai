# Humaniseur de texte

Rend un texte écrit par une IA plus naturel : formules creuses, restes de conversation, tirets en série, rythme, vocabulaire. Français uniquement.

- Par défaut, tout se passe dans le navigateur : aucune donnée envoyée, aucun traceur, aucune dépendance.
- **Mode IA facultatif** : réécriture par Claude avec la clé API de l'utilisateur, appel direct depuis le navigateur (`api.anthropic.com`), uniquement au clic sur « Humaniser ». La correction locale passe ensuite sur le résultat. Une politique CSP limite les connexions à ce seul domaine.
- Corrige aussi les fautes courantes (accents oubliés, mots collés, espaces, majuscules, mots répétés) ; pas les accords ni les conjugaisons.
- Chaque changement est listé et refusable ; ce que seul l'auteur peut ajouter (faits, noms, anecdotes) est signalé, pas inventé.
- **Aucune promesse sur les détecteurs d'IA** : l'outil applique des règles écrites, il n'embarque pas de modèle de langage.

## Développement

```
node --test test/*.mjs      # tests du moteur
python3 -m http.server # puis ouvrir http://localhost:8000
```

`moteur.js` est le moteur local (fonctions pures), `ia.js` le mode IA (requête et réponses testées sans réseau), `app.js` l'interface, `index.html` + `style.css` la page.
Licence GPL-3.0.
