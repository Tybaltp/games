# Jeux

Jeux de plateau à deux, joués de navigateur à navigateur : https://tybaltp.github.io/games/

Huit jeux : Arimaa, Diagonal Blocks Duo, Gygès, Pente, Ponte del Diavolo, Tintas, Volo, Zèrtz. Chaque jeu tient dans une seule page HTML, posée sur un socle commun. Le site est statique, sans compilation ni dépendance à installer : on modifie les fichiers, on les pousse, GitHub Pages publie.

## Branches

- `main` : ce qui est en ligne.
- `ergonomie` : la branche de travail (worktree `~/games-ergonomie`). Une fois les changements essayés, on la fusionne dans `main` en avance rapide et on pousse les deux.

## Organisation

```
index.html            accueil du site : liste des jeux, « Comment ça marche ? »
<jeu>.html            une page par jeu : règles, plateau, ordinateur s'il y en a un, textes FR/EN du jeu
common/core.js        tout ce qui n'est pas propre à un jeu (ci-dessous)
common/games.css      styles communs : accueil, écran de jeu fixe, barre d'actions, tiroir « ⋯ », cartes des joueurs
common/ai.js          recherche de l'ordinateur indépendante du jeu (AISearch : glouton, alpha-bêta en faisceau, MCTS),
                      interface documentée en tête ; chargé par Ponte del Diavolo, Tintas, Diagonal Blocks Duo et Volo
CHARTE-ERGONOMIE.md   principes d'ergonomie validés, que tout jeu applique
```

### Ce que fait le socle commun (`common/core.js`)

- Accueil d'un jeu : « Créer une partie », puis par lien, contre l'ordinateur, Face à face ou Libre ; invitation par lien `#join-CODE` ; reprise par code.
- Partie par lien (PeerJS) : hôte, invité, spectateurs, reconnexion, reprise de l'hébergement par l'invité, « Rejouer », codes de reprise, pendules.
- Modes sur un seul appareil : Face à face (pendule au choix, sans annulation), Libre (annulation, suggestions si le jeu a un ordinateur). Contre l'ordinateur : calcul dans une tâche de fond, annulation et suggestions.
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
