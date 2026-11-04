# Jeux

Jeux de plateau à deux, joués de navigateur à navigateur : https://tybaltp.github.io/games/

Neuf jeux : Arimaa, Diagonal Blocks Duo, Gygès, Pente, Ponte del Diavolo, Quarto, Tintas, Volo, Zèrtz. Chaque jeu tient dans une seule page HTML, posée sur un socle commun. Le site est statique, sans compilation ni dépendance à installer : on modifie les fichiers, on les pousse, GitHub Pages publie.

## Branches

- `main` : ce qui est en ligne.
- `ergonomie` : la branche de travail (worktree `~/games-ergonomie`). Une fois les changements essayés, on la fusionne dans `main` en avance rapide et on pousse les deux.

## Organisation

```
index.html            accueil du site : une carte par jeu, « Comment ça marche ? »
img/cartes/           images des cartes de l'accueil (un morceau de plateau par jeu, clair et sombre)
<jeu>.html            une page par jeu : règles, plateau, ordinateur s'il y en a un, textes FR/EN du jeu
common/core.js        tout ce qui n'est pas propre à un jeu (ci-dessous)
common/games.css      styles communs : accueil, écran de jeu fixe, barre d'actions, tiroir « ⋯ », cartes des joueurs
common/ai.js          recherche de l'ordinateur indépendante du jeu (AISearch : glouton, alpha-bêta en faisceau, MCTS),
                      interface documentée en tête ; chargé par Ponte del Diavolo, Tintas, Diagonal Blocks Duo et Volo
CHARTE-ERGONOMIE.md   principes d'ergonomie validés, que tout jeu applique
```

### Ce que fait le socle commun (`common/core.js`)

- Accueil d'un jeu, un seul cadre : « Jouer » (mode de jeu au choix : par lien, contre l'ordinateur, Face à face ; puis le nom et les options du mode), « Analyser » (« Créer une partie » en Libre, ou « Charger une partie » depuis un fichier SGF), la partie inachevée à reprendre, « J'ai un code d'invitation » et « J'ai un code de reprise » (repliables). Un lien `#join-CODE` n'affiche que l'invitation. Deux codes par partie : celui des joueurs (6 caractères, lien `#join-…`) et celui des observateurs (8 caractères, lien `#watch-…`) ; l'hôte écoute sur les deux, une connexion par le code des observateurs n'est jamais joueuse, et les observateurs ne reçoivent aucun des deux codes. Dans « J'ai un code d'invitation », un code ou un lien collé est reconnu (lien, ou longueur du code). Dans la page de jeu, l'encart « Inviter » reste là toute la partie (replié une fois la partie commencée) : codes et liens pour l'hôte, le code et le lien d'observation pour l'invité, le lien d'observation seulement pour un observateur.
- Mochalunt (`mochalunt.html`) : match entre deux joueurs, une partie par jeu dans l'ordre du tournoi (Arimaa 20 min + 30 s, Diagonal Blocks Duo 20 + 10, Volo 20 + 20, Gygès règle avancée 20 + 10, Tintas 20 + 10) ; individuel (5 jeux) ou par équipe (4 jeux, un jeu retiré). Le créateur envoie un lien d'invitation (`#join-<code>-<plan>-<code observateurs>`) et un lien pour les observateurs (`#watch-<code observateurs>-<plan>`), qui ne contient pas le code des joueurs. Chaque table est la page du jeu avec `#mt-<code>-<k>` : le premier arrivé l'héberge (code `<code>t<k>`), l'autre la rejoint ; le joueur 1 du match choisit sa place aux tables 1, 3, 5, l'autre aux tables 2, 4 (question propre au jeu : `mq_q`, `mq_1`, `mq_2`). Fin de table : « Rejoindre la table suivante » ; fin de match : `mochalunt.html#res-<code>` (1 point la victoire, ½ la nulle, égalité sans départage). Observateurs : `#mw-…` (suivi de table en table), tables terminées en lecture seule `#mv-…`. Le match est gardé sur chaque appareil (`mochalunt-<code>` : plan, résultats et coups de chaque table), la table à chaque action et les pendules chaque seconde ; « Mes matchs » sur `mochalunt.html` pour reprendre ou supprimer un match (de cet appareil seulement : son enregistrement et les sauvegardes de ses tables). Pendant une table, l'encart « Inviter » (repliable) donne les liens du match : invitation et observation pour les joueurs, observation seulement pour les observateurs.
- SGF (socle commun) : « Exporter la partie (SGF) » dans le bloc Options (toujours contre l'ordinateur, en Libre et pour une partie chargée ; en fin de partie sinon) ; « Analyser › Charger une partie » ouvre un fichier `.sgf` : terminé, depuis la première position (rôle `file`) ; inachevé, en Libre depuis la dernière position de la ligne principale. Les variantes du fichier sont gardées ; l'export écrit l'arbre entier (la ligne principale d'abord, chaque branchement en `(;…)(;…)`). En Libre et pour une partie chargée, les noms des joueurs se modifient dans leurs cartes (export SGF). Structure SGF FF[4] standard (`AP[tybaltp.github.io/games]`, `PB`, `PW`, `DT`, `RE`, `B`/`W`), propriétés privées `XG` (identifiant du jeu) et `XR` (règles, JSON). Coups : notation de la page, sauf Pente (Gomoku, `GM[4]`, `SZ[15]`, choix de couleur du Swap2 en `XS`) ; Zèrtz porte `GM[22]` (aucune notation SGF définie pour lui). Crochet `GAME.sgf` pour une notation propre.
- Partie par lien (PeerJS) : hôte, invité, observateurs, reconnexion, reprise de l'hébergement par l'invité, « Rejouer », codes de reprise, pendules.
- Analyse (socle commun, `ana()`) : en Libre, pour une partie chargée, et pour une partie Face à face ou contre l'ordinateur une fois terminée. Un coup joué depuis n'importe quelle position ajoute une variante (ou suit celle qui l'a déjà). `view.tree` (le premier enfant = la ligne principale), `view.moves` = le chemin jusqu'à la position montrée, `view.gameResult` = le résultat de la partie (abandon, temps, accord), valable seulement au bout de la ligne principale. Barre : début, branchement précédent, coup précédent, coup suivant, branchement suivant, fin de la ligne ; au-dessus et en dessous du numéro, la variante précédente / suivante du coup montré. Clavier : ← → coup par coup (Maj : début, fin), Début / Fin, ↑ ↓ branchements, Maj + ↑ ↓ variantes. Avancer suit toujours le premier enfant. La liste des coups montre la ligne entière, ◆n sur un coup qui a n variantes. Pas d'annulation ni d'abandon en analyse. Plateau : `anaAlts()` / `anaAltGo(code)` pour marquer les autres variantes du coup montré (Pente : pierre transparente cerclée, un clic y passe).
- Modes sur un seul appareil : Face à face (pendule au choix, sans annulation), Libre (suggestions si le jeu a un ordinateur, arbre de variantes). Contre l'ordinateur : calcul dans une tâche de fond, annulation et suggestions.
- Sauvegarde dans le navigateur et reprise au rafraîchissement, dans tous les modes (`#test`, `#ai`, `#local`, parties par lien).
- Écran de jeu : une seule barre d'actions sous le plateau (libellés abrégés seulement si la place manque), écran fixe (deux colonnes sur grand écran, bandes et tiroir « ⋯ » sur téléphone), option Coordonnées, langue FR/EN, sons.

### Ce que fournit une page de jeu : l'objet `GAME`

La page charge `common/core.js`, définit `const GAME={…}`, puis appelle `coreStart()`. Les crochets (`id`, `rules`, `replay`, `legal`, `board`, `turnStatus`, `pendBtns`, `newUi`, `preparing`, `cancel`, ordinateur `levels`/`aiSrc`/`aiSearch`…) sont décrits en tête de `common/core.js`. `GAME.ownLayout` (Diagonal Blocks Duo) dispense un jeu de la disposition commune du plateau (voir `lockBoard()`). `gyges.html` sert d'exemple de référence.

## Règles à respecter

- **Version des fichiers communs.** Les pages chargent `common/core.js?v=N`, `common/games.css?v=N` et, pour quatre d'entre elles, `common/ai.js?v=M`. Après toute modification d'un fichier commun, augmenter son numéro dans **toutes les pages qui le chargent** ; sinon un navigateur peut garder l'ancien fichier en cache à côté d'une page récente.
- **`GAME.id` ne change jamais.** Il préfixe les clés de stockage, les identifiants réseau et les codes de reprise (`gyges-test`, `gyges-p2p-…`) : le changer ferait perdre les parties enregistrées. Deux identifiants diffèrent du nom de fichier : `diagonalblocks.html` → `dblk`, `pontedeldiavolo.html` → `pdd`.
- **Ergonomie.** Appliquer `CHARTE-ERGONOMIE.md` : survol en transparence, provisoire en pointillés, joué en plein, une seule mise en évidence, une seule barre d'actions, écran sans défilement.

## Tester

- Dans un navigateur : servir le dossier, par exemple `python3 -m http.server 8765`, puis ouvrir `http://localhost:8765/`. Libre (`<jeu>.html#test`) et Face à face permettent de jouer seul. Une partie par lien se teste avec deux onglets, jamais deux cadres d'une même page (ils partagent l'identité d'onglet).
- Hors navigateur : pas de Node sur la machine de développement. Les bancs de test tournent sous JavaScriptCore (`/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc`), avec une imitation minimale du DOM et de PeerJS. La suite de non-régression vit hors du dépôt, dans le dossier Dropbox du projet (`outils/regress/run_all.sh`).
