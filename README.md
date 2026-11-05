# 🍺 L’Ardoise

Ton journal de verres, noté et daté, l'activité de ta bande, et qui a le plus bu ce soir. Adapté de
[Scroll Competition](https://github.com/MaegIins/scrollCompetition).

- **Front** : Vue 3 + Vite + Tailwind v4 + icônes Font Awesome Free (npm, embarquées dans le build) (`client/`)
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
  n'importe quel produit de la carte. Relu à chaque démarrage.
- `APP_TZ` : fuseau des soirées, pour les badges liés à l'heure (défaut `Europe/Paris`)

Ces variables peuvent aussi aller dans `server/.env` (non versionné), lu par `npm run dev` et `npm start`.
⚠️ Inscris le compte admin **avant** de mettre son pseudo dans `ADMINS` : sinon le premier qui prend ce pseudo devient admin.

## Fonctionnement

### Bandes
Chaque **bande** a sa compet (classement, stats, fiches) ; la carte, elle, est commune à tout le monde. On en crée une, ou on en rejoint une avec
son code à 6 caractères (Profil › Mes bandes, ou à l'inscription). « Inviter » partage un lien `/?bande=CODE`.
On peut être dans plusieurs bandes et passer de l'une à l'autre (sélecteur sous le titre). Les verres sont à la
personne : ils comptent dans toutes ses bandes. Le **patron** est le créateur ;
s'il part, le plus ancien membre prend la suite ; une bande vide disparaît.
Une base d'avant les bandes est migrée automatiquement dans une bande « La bande » avec tout le monde.

**Sans bande (solo)** : on peut quand même noter ses verres, son eau et ses clopes, et avoir son profil
(top 4, journal, badges). Le classement (affiché flouté et verrouillé) et les stats attendent une bande ; la carte est accessible à tous.
Un encart en haut de l'accueil permet de rejoindre une bande avec son code ou d'en créer une.

### L'appli

Barre du bas : **Ma soirée · Activité · ＋ · La carte · Profil**.
Chaque écran a son adresse (on peut recharger, partager un lien, utiliser le bouton retour) :
`/` Ma soirée, `/activite`, `/carte`, `/reglages`, `/profil/12` (`?onglet=boissons|journal|badges`), `/boisson/34`.
En prod, le serveur renvoie `index.html` pour toute adresse hors `/api`.

- **Ma soirée** (accueil) : le verre qui se remplit, 💧 eau et 🚬 clopes, **L'addition** de la soirée
  (4 lignes par page par défaut, réglable), puis le classement et les stats. Chaque ligne de l'addition a un
  bouton **★ Noter** (note, avis, photo, date). On ajoute un verre avec le ＋.
- **＋** : ajouter une conso en détail : on cherche la boisson (carte + habitudes), un favori, un format ou du
  sur-mesure, puis la **date** (ce soir, hier soir, ou n'importe quel jour passé), une **note** en demi-étoiles,
  un **avis** et une **photo**, tous facultatifs. « Annuler » dans le toast pendant 5 s.
- **Activité** : le fil des dernières consos de la bande (affiche de la boisson, note, avis, photo). Toucher une
  affiche ouvre la fiche du produit, un pseudo ouvre le profil, ✎ complète ou supprime une de tes consos.
- **Pas que de l'alcool** : catégories Énergisant (Monster, Red Bull…), Soft et Café/thé, plus les 0.0.
  Notées et dans le journal comme le reste, mais **hors score** (degré 0).
- **Profil** : stats, **top 4** (4 boissons de la carte choisies, touche une place pour la changer),
  activité récente, boissons les plus bues avec « Moi aussi », chiffres, dernières soirées ;
  onglet **Boissons** (toutes les boissons différentes bues, avec recherche, filtres par catégorie ou « avec avis »,
  et tris : les plus bues, mieux / moins bien notées, récentes, oubliées, le plus d'alcool, A→Z ; en touchant une
  boisson : combien de fois, première et dernière fois, note moyenne, et toutes les consos avec avis et photos),
  onglet **Journal** (toutes les consos datées, par mois) et onglet **Badges**. Réglages (bandes, photo,
  pseudo, PIN) via ⚙.
- **La carte** (une seule, commune à toutes les bandes) : liste avec recherche, filtres, ★ favori, « +1 » pour
  boire direct, ✎ / ✕ pour l'auteur ou un admin. À l'ajout : photo et infos facultatives (producteur, origine,
  style, description), modifiables après. Doublons refusés (même nom, volume et degré). Une conso est rattachée
  au produit de même nom, volume et degré, même si le produit est ajouté après.
- **« Déjà bue »** (page d'une boisson) : marquer une boisson comme bue un jour, sans date ni note. Hors score et
  hors journal ; elle compte dans les buveurs, apparaît dans « Tes potes l'ont bue », dans l'onglet Boissons du
  profil (« sans date ni note ») et avec un ✓ dans la carte.
- **Recherche** (🔍 dans l'en-tête) : des personnes, **même hors de ta bande**, et des boissons de la carte (par nom
  ou producteur), sans tenir compte des accents ni des majuscules. Les profils (stats, top 4, journal, boissons,
  badges) sont donc visibles par tout le monde, avec la mention « pas dans ta bande » ; le fil d'activité, le
  classement et les stats restent entre membres d'une bande.
- **Page d'une boisson**, façon page de film. On y arrive par la recherche, le nom
  ou la vignette dans la carte et dans le fil, la vignette d'une ligne de L'addition, « Page de la boisson → » dans
  la fenêtre d'un verre, le top 4, l'activité récente et le journal d'un profil, l'onglet Boissons, « Dans le même
  genre ». Un verre qui n'est pas sur la carte a un bouton « ＋ Lui créer une page sur la carte ». La page :
  bandeau avec la photo floutée, affiche, producteur, style, origine, description ; « Je l'ai bue », ★ favori,
  ta note et combien de fois tu l'as bue ; consos, buveurs, favoris ; répartition des notes ; tes potes qui l'ont
  bue (avec leur note) ; les avis (triables : récents, mieux / moins bien notés, avec photo) ; « Dans le même
  genre ». N'importe qui peut compléter une info ou une photo manquante ; changer ce qui est déjà rempli reste
  à l'auteur ou à un admin.
- **Score** en **verres standard** (10 g d'alcool pur) : `grammes = cl × 10 × degré/100 × 0,8`.
  Une pinte de blonde (50 cl, 5°) = 2 ; une pinte de triple (8,5°) = 3,4. La soirée court jusqu'à 6h du matin.
- **Classement** par soirée, semaine, mois ou depuis le début, avec podium ; stats sur 7 ou 30 jours.
  Le détail par catégorie se lit en **consos** (toutes les catégories, sans alcool compris) ou en **verres standard**.
  **Victoires** (♛) = soirées gagnées ; **suspect** au-delà de 30 verres standard. Limites : 200 cl par verre,
  100 verres par soirée.
- **Badges** : 18 succès calculés depuis l'historique alcoolisé (`server/badges.js`).
- **Catégories** : `CATS` dans `server/app.js` (`ALCO` / `SOFT`) **et** `client/src/utils.js` (+ couleur dans `style.css`).
  Formats dans `FORMATS`.
- **Lieux** : « Où ? » à l'ajout d'un verre (facultatif, avec mes lieux récents en suggestion). Les lieux sont une
  table à part (`places`), partagée par tout le monde : même nom sans la casse = même lieu, et chaque conso pointe
  vers son lieu (`drinks.place_id`). Chaque lieu a des coordonnées `lat`/`lng`, vides pour l'instant : une future
  carte géographique n'aura qu'à les remplir (géolocalisation, recherche d'adresse) et à lire `GET /api/places`
  (tous les lieux avec leur fréquentation, `?mine=1` pour les miens).
  **Lieux privés** (« Chez moi »…) : case « Lieu privé » à l'ajout d'un verre ; un lieu privé (nom et future
  position) n'est visible que par son créateur et les bandes qu'il autorise (`place_groups`). Pour les autres, il est
  masqué partout, même sur les consos qui y pointent. Chacun a son propre « Chez moi ». Rubrique **La carte › Lieux** :
  la liste des lieux visibles, et pour les siens le choix Public / Privé et des bandes autorisées.
- **Photos** (consos et produits de la carte) : compressées dans le navigateur avant l'envoi (WebP si possible,
  ≤ 800 px pour une conso, ≤ 600 px pour un produit, ~60-100 ko), refusées au-delà de ~150 ko par le serveur,
  stockées en base, servies par une clé aléatoire (`/api/photos/:clé`) qui change à chaque nouvelle photo.
  Une photo remplacée ou une conso supprimée libère sa place. Produit sans photo : n'importe qui peut en
  ajouter une depuis sa fiche ; la changer ou la retirer reste à son auteur ou à un admin.

Une ancienne base (compteurs par type de boisson) est convertie automatiquement au démarrage.

Sécurité : PIN haché (scrypt), blocage progressif après 5 PIN faux (30 s → 15 min max).

L'abus d'alcool est dangereux pour la santé. Alcool Info Service : 0 980 980 930.
