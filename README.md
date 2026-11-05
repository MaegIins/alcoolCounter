# 🍺 Picole Compet

Qui a le plus bu ce soir ? Celui-là gagne (bravo… ou pas). Adapté de
[Scroll Competition](https://github.com/MaegIins/scrollCompetition).

- **Front** : Vue 3 + Vite + Tailwind v4 (`client/`)
- **Back** : Express + SQLite natif de Node (`node:sqlite`, Node ≥ 22) (`server/`)

## Lancer en dev

```bash
npm run install:all
npm run dev          # API sur :3001, front sur :5173 (accessible sur le réseau local)
```

## Tests

```bash
npm test             # serveur + client, sans dépendance (node:test)
```

- `server/test/api.test.js` : toutes les routes sur une base en mémoire.
- `server/test/unit.test.js` : dates, pseudos, calcul des verres standard.
- `client/test/utils.test.js` : dates locales, soirée qui finit à 6h, graduations des graphes.

## Prod (un seul process)

```bash
npm run build        # build le front dans client/dist
INVITE_CODE=monsecret PORT=3001 npm start   # Express sert l'API + le front
```

Variables d'env :
- `PORT` (défaut 3001)
- `INVITE_CODE` : si défini, requis pour s'inscrire
- `DATA_DIR` : dossier de la base SQLite (défaut `server/data/`)
- `ADMINS` : pseudos admin séparés par des virgules (ex. `ADMINS=tristan,léa`). Un admin peut modifier ou retirer
  n'importe quel produit de n'importe quelle carte. Relu à chaque démarrage.
- `APP_TZ` : fuseau des soirées, pour les badges liés à l'heure (défaut `Europe/Paris`)

Ces variables peuvent aussi aller dans `server/.env` (non versionné), lu par `npm run dev` et `npm start`.
⚠️ Inscris le compte admin **avant** de mettre son pseudo dans `ADMINS` : sinon le premier qui prend ce pseudo devient admin.

## Fonctionnement

### Bandes
Chaque **bande** a sa compet (classement, stats, fiches) et sa carte. On en crée une, ou on en rejoint une avec
son code à 6 caractères (Profil › Mes bandes, ou à l'inscription). « Inviter » partage un lien `/?bande=CODE`.
On peut être dans plusieurs bandes et passer de l'une à l'autre (sélecteur sous le titre). Les verres sont à la
personne : ils comptent dans toutes ses bandes. Le **patron** (créateur) peut modifier/retirer les produits de sa carte ;
s'il part, le plus ancien membre prend la suite ; une bande vide disparaît.
Une base d'avant les bandes est migrée automatiquement dans une bande « La bande » avec tout le monde.

### Soirée

Chacun s'inscrit avec un pseudo + PIN, puis tape sur ce qu'il boit au fil de la soirée : **un tap = un verre**,
enregistré tout de suite. On se base sur la confiance.

- **Chaque verre a son volume et son degré.** Le score est en **verres standard** (10 g d'alcool pur) :
  `grammes = cl × 10 × degré/100 × 0,8`. Une pinte de blonde (50 cl, 5°) = 2 ; une pinte de triple (8,5°) = 3,4.
- **Au comptoir** : on choisit un format (demi, bouteille, pinte, verre de vin, shot, cocktail…), puis l'appli
  demande le degré (raccourcis selon la catégorie, pré-rempli avec ton degré habituel pour ce format) et un nom
  optionnel (Chouffe, Leffe…). « Autre chose » pour tout régler à la main (catégorie, volume, degré).
  « L'ajouter aussi à la carte » la partage avec tout le monde.
- **Raccourcis** (un tap = un verre) : tes favoris de la carte (★), complétés par ce que tu bois le plus.
- **Annuler** : chaque ajout affiche un toast avec « Annuler » pendant 5 s (fausse manip).
- **💧 Eau et 🚬 clopes** : comptées à part, hors score, visibles au classement et dans les fiches.
  Rappel tous les 3 verres d'affilée sans eau (avec un bouton « + 💧 »).
- **Badges** : 18 succès (Enchaînement, Bières fortes, After, 3 soirs de suite…), calculés depuis
  l'historique (`server/badges.js`) ; toast + confettis quand on en débloque un, vitrine dans la fiche joueur.
- **La carte** (une par bande) : produits partagés (nom, catégorie, volume, degré) que tout le monde peut compléter,
  et corriger (✎) par leur auteur, le patron ou un admin. Recherche,
  filtres, ★ pour mettre en favori (= raccourci sur l'accueil), « +1 » pour l'ajouter direct à ta soirée.
  12 produits par page. Doublons refusés (même nom, volume et degré) ; seul celui qui a ajouté un produit
  (ou un admin) peut le retirer.
  Formats dans `FORMATS`, raccourcis de degrés dans `CATS[].degrees` (`client/src/utils.js`).
- **L'addition** : la liste des verres de la soirée, avec l'heure, supprimable en cas d'erreur.
- **Catégories** (bière, vin, fort, cocktail, autre) : servent aux couleurs des barres et graphes.
  Pour en ajouter une : `CATS` dans `server/app.js` **et** `client/src/utils.js` (+ couleur dans `style.css`).
- **Soirée** : elle court jusqu'à 6h du matin (un verre à 2h compte pour la veille).
- **Classement** par soirée, semaine, mois ou depuis le début, avec podium ; top 10 + ta place si tu es plus bas.
  Les ex æquo partagent le rang. Les inactifs depuis plus de 7 jours sont masqués.
- **Victoires** (♛) : nombre de soirées gagnées depuis le début (soirée en cours exclue).
- **Suspect** : badge pour toute soirée à plus de 30 verres standard (on ne bloque pas, on affiche).
  Limites : 200 cl par verre, 100 verres par soirée.
- **Fiche joueur** : touche quelqu'un dans le classement (ou ton avatar) : soirées, verres, moyenne, record,
  victoires, détail de sa soirée, dernières soirées, ses boissons préférées avec « Moi aussi » pour prendre la même.
- **Juice** : score qui s'envole avec des bulles, vibration, toasts (verre ajouté, paliers de la soirée),
  confettis quand tu prends la tête, classement animé. Désactivé si le système demande moins d'animations.
- **Stats** : courbes de tout le monde sur 7 ou 30 jours, détail par catégorie, vue tableau.
- **Profil** : photo, pseudo, changement de PIN (déconnecte les autres appareils).

Une ancienne base (compteurs par type de boisson) est convertie automatiquement au démarrage.

Sécurité : PIN haché (scrypt), blocage progressif après 5 PIN faux (30 s → 15 min max).

L'abus d'alcool est dangereux pour la santé. Alcool Info Service : 0 980 980 930.
