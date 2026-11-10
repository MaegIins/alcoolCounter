# 🍺 L’Ardoise

Ton journal de verres, noté et daté, l'activité de ta bande, et qui a le plus bu ce soir. Adapté de
[Scroll Competition](https://github.com/MaegIins/scrollCompetition).

- **Front** : Vue 3 + Vite + Tailwind v4 + icônes Font Awesome Free et cartes Leaflet (npm, embarqués dans le build) (`client/`)
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
- `client/test/utils.test.js` : dates locales, journée qui finit à 6h, graduations des graphes.

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
- `APP_TZ` : fuseau des journées, pour les badges liés à l'heure (défaut `Europe/Paris`)

Ces variables peuvent aussi aller dans `server/.env` (non versionné), lu par `npm run dev` et `npm start`.
- `TRUST_PROXY` : derrière un reverse proxy (Caddy, Nginx…), mets `TRUST_PROXY=1` pour que les limites par IP voient
  la vraie IP des visiteurs (sans ça, tout le monde a l'IP du proxy et partage les mêmes limites).
- `SESSION_DAYS` : une session inutilisée pendant ce nombre de jours expire (90 par défaut).
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` : notifs push sur les téléphones (voir plus bas). Sans ces
  clés, pas de push : les notifs restent dans l'appli.

Le droit admin est attaché au **compte** qui a le premier porté un pseudo listé dans `ADMINS`, pas au pseudo : si
l'admin change de pseudo ou supprime son compte, personne ne devient admin en reprenant ce pseudo, qui reste réservé.
⚠️ Sur une installation neuve, inscris le compte admin **avant** d'ouvrir l'appli aux autres : le premier à
s'inscrire avec ce pseudo devient admin.

### Sur Android (appli installable)

Le site est une PWA : servi en **HTTPS**, Chrome Android propose « Installer l'appli » (menu ⋮). On obtient une icône
sur l'écran d'accueil, plein écran sans barre d'adresse, et un appui long sur l'icône donne les raccourcis « Ajouter »
(`/?ajouter`) et « Activité ».
- `client/public/manifest.webmanifest` : nom, couleurs, icônes (`client/public/icons/`, dont une « maskable »).
- `client/public/sw.js` : service worker minimal, qui affiche une page « Pas de réseau » hors ligne. Il ne met ni l'API
  ni l'appli en cache, donc un déploiement est pris tout de suite. Il n'est enregistré que sur le build, pas en dev.
- Réglages › « Installer l'appli » : bouton d'installation en un appui (Chrome, Edge) ou tuto Android / iPhone / ordi.
- **Notifs push** (Réglages › « Notifs sur le téléphone », ou le bandeau de la page Notifs) : likes, commentaires,
  abonnés et succès arrivent sur le téléphone, appli fermée. Rien n'est affiché si l'appli est au premier plan (la
  cloche suffit). Sur iPhone, seulement dans l'appli installée (iOS 16.4+). Mise en place, une fois :
  ```bash
  npm --prefix server run vapid   # affiche une paire de clés
  ```
  puis dans `server/.env` : `VAPID_PUBLIC_KEY=…`, `VAPID_PRIVATE_KEY=…` et `VAPID_SUBJECT=https://ton-domaine` (ou
  `mailto:toi@exemple.fr`), et redémarre. Ne change plus les clés ensuite : les téléphones abonnés seraient perdus
  (ils se réabonnent seulement en réactivant). La clé privée reste secrète.
- Le bouton retour d'Android ferme la fenêtre « + » au lieu de changer d'écran.
- Au retour au premier plan après plus de 5 min, les écrans se rechargent (une seule vague de requêtes).

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

Barre du bas : **Ma journée · Activité · ＋ · La carte · Profil**.
Chaque écran a son adresse (on peut recharger, partager un lien, utiliser le bouton retour) :
`/` Ma journée, `/activite`, `/carte`, `/reglages`, `/profil/12` (`?onglet=boissons|journal|badges`), `/boisson/34`, `/lieu/5`.
En prod, le serveur renvoie `index.html` pour toute adresse hors `/api`.

- **Ma journée** (accueil) : le verre qui se remplit, 💧 eau et 🚬 clopes, **L'addition** de la journée
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
  activité récente, boissons les plus bues avec « Moi aussi », chiffres, derniers jours ;
  onglet **Boissons** (toutes les boissons différentes bues, avec recherche, filtres par catégorie ou « avec avis »,
  et tris : les plus bues, mieux / moins bien notées, récentes, oubliées, le plus d'alcool, A→Z ; en touchant une
  boisson : combien de fois, première et dernière fois, note moyenne, et toutes les consos avec avis et photos),
  onglet **Stats** (`GET /api/users/:id/insights`, bascule verres standard / consos) : records (meilleure journée,
  plus longue série et série en cours, plus longue pause sans alcool, moyennes, journées gagnées), ce mois-ci contre
  les mêmes jours du mois dernier, calendrier de l'année, 12 derniers mois, face à la bande (moyenne et rang par
  catégorie, si la personne est dans ma bande), par catégorie, jour de la semaine, heure, heure moyenne du premier
  et du dernier verre, compagnons de verre (même jour, même lieu visible), le critique (notes, écart avec les autres
  sur les mêmes fiches), découvertes (boissons différentes, premières fois par mois), lieux (chez soi / dehors),
  équivalences (litres, alcool pur, kcal) et eau / clopes,
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
  Une pinte de blonde (50 cl, 5°) = 2 ; une pinte de triple (8,5°) = 3,4. La journée court jusqu'à 6h du matin (la nuit compte pour la veille).
- **Classement** par jour, semaine, mois ou depuis le début, avec podium ; stats sur 7 ou 30 jours.
  Le détail par catégorie se lit en **consos** (toutes les catégories, sans alcool compris) ou en **verres standard**.
  **Victoires** (♛) = journées gagnées ; **suspect** au-delà de 30 verres standard. Limites : 200 cl par verre,
  100 verres par jour.
- **Succès** : 82 badges en 15 rubriques, calculés depuis l'historique (`server/badges.js`, `computeBadgeState` :
  obtenus + progression des badges chiffrés), dont 5 secrets (« ??? » tant qu'on ne les a pas, rien n'est dévoilé
  par l'API). Débloqués : toast, notif (`user_badges` retient ceux déjà vus ; au premier lancement, les existants
  sont enregistrés sans notif) et carte dans le fil d'activité. Onglet Badges : rareté (% des joueurs qui l'ont),
  progression, tri par rubrique ou par rareté. Victoires comptées dans la meilleure bande de la personne.
- **Paliers** selon le % de succès (`RANKS` dans `client/src/utils.js`) : juste une couleur, l'anneau autour des avatars
  partout (`GET /api/ranks`, `client/src/ranks.js`).
- **Titres cachés** (`server/titles.js`) : N fois une boisson précise (10 Chouffe = « Mature pour son âge »…), reconnue à
  son nom (sans accents ni casse) ou à sa catégorie / son degré. La liste n'est jamais envoyée : on ne voit que ceux
  débloqués (`user_titles`, toast + notif comme les succès). Le titre affiché (`users.title`, choisi dans l'onglet
  Badges, `PUT /api/me/title`) apparaît sous le pseudo, dans le classement et au survol des avatars. Pour en ajouter
  un : une ligne dans `TITLES`.
- **Profil privé** (Réglages, `users.private`) : ses consos, stats, badges, abonnés ne sont visibles que de soi, des
  membres de ses bandes et de ses abonnés acceptés (`SEES()` / `canSee()` dans `server/app.js`, appliqué au profil, à la
  page d'une conso, au fil « Abonnements », aux avis d'une boisson et à la page d'un lieu). Suivre un profil privé hors
  de ses bandes envoie une demande (`follows.pending = 1`), acceptée ou refusée depuis les notifs ou les Réglages ;
  repasser en public accepte les demandes en attente.
- **Caféine** : mg par conso et par fiche (`caffeine`), estimée d'après le nom tant qu'on ne la donne pas
  (`guessCaffeine`, même règle côté serveur et client). « Ma journée » glisse de la pinte à la tasse ; les stats de
  l'accueil suivent. Journée où personne n'a bu d'alcool : le plus caféiné gagne.
- **Catégories** (dont Shot) : `CATS` dans `server/app.js` (`ALCO` / `SOFT`) **et** `client/src/utils.js` (+ couleur dans `style.css`).
  Formats dans `FORMATS`.
- **Le plan des lieux** (La carte › Lieux, sous la liste ; bouton plein écran) : Leaflet + tuiles OpenStreetMap assombries. Seuls les lieux
  que tu as le droit de voir et qui ont une position (le serveur ne renvoie jamais la position d'un « Chez X » d'un
  autre). Repère doré (public) ou rouge à cadenas (privé), maison pour un chez-soi, taille selon la fréquentation ;
  bulle avec photo, adresse, chiffres et « Voir le lieu ». Suit la recherche et le filtre de la liste ; « Voir sur la
  carte » d'un lieu de la liste centre la carte dessus ; « Tout voir », « Autour de moi ».
- **Page d'un lieu** (`/lieu/5`) : depuis La carte › Lieux, le lieu d'un verre dans le fil, les avis ou le profil,
  et la recherche. Carte (la même que celle des lieux) centrée sur le lieu, mis en avant, avec les autres lieux visibles autour, visibilité, chiffres (consos, buveurs,
  les tiennes, note moyenne), ce qu'on y boit, les habitués, les dernières consos, « J'y bois un verre » (le ＋
  avec le lieu prérempli), modification (même formulaire que la liste) : nom, **photo, description, adresse**
  (lien OpenStreetMap), position, visibilité. Les autres peuvent compléter ce qui manque (jamais sur un « Chez X »,
  dont l'adresse et la position restent visibles par son seul propriétaire). Les profils montrent **« Ses lieux »** :
  les plus fréquentés (en jours), parmi ceux que tu as le droit de voir. Un lieu privé reste introuvable (404)
  pour qui n'est pas autorisé.
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

Sécurité :
- PIN de 6 à 8 chiffres pour tout nouveau PIN (les anciens à 4 chiffres restent valides jusqu'au prochain changement), haché (scrypt) ; blocage progressif après 5 PIN faux sur un compte (30 s → 15 min max) ; et par IP :
  30 PIN faux en 15 min tous comptes confondus, 10 inscriptions par heure, 20 codes de bande faux par heure.
- Jetons de session : 256 bits, seule leur empreinte SHA-256 est en base ; expiration après `SESSION_DAYS` jours
  sans utilisation ; changer de PIN déconnecte les autres appareils.
- En-têtes : Content-Security-Policy (scripts du site seulement), `nosniff`, `X-Frame-Options: DENY`,
  Referrer-Policy, Permissions-Policy ; pas de `X-Powered-By`.
- Photos : seulement JPEG/PNG/WebP en base64, taille plafonnée, servies avec leur type et `nosniff`.
- Lieux privés et chez-soi filtrés côté serveur (jamais envoyés à qui n'y a pas droit).
- À faire au déploiement : HTTPS (le proxy ajoute HSTS), `TRUST_PROXY=1`, sauvegardes de `server/data/`.

L'abus d'alcool est dangereux pour la santé. Alcool Info Service : 0 980 980 930.
