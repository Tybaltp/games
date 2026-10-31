# Jeux

Jeux de plateau à deux, de navigateur à navigateur : https://tybaltp.github.io/games/

Huit jeux (Arimaa, Diagonal Blocks Duo, Gygès, Pente, Ponte del Diavolo, Tintas, Volo, Zèrtz), chacun dans une seule page HTML, sur un socle commun. Site statique (GitHub Pages, branche `main`), sans outil de compilation : on modifie les fichiers et on pousse.

## Organisation

```
index.html            accueil (liste des jeux, « Comment ça marche ? »)
<jeu>.html            une page par jeu : moteur de règles, plateau, ordinateur s'il y en a un, textes du jeu
common/core.js        tout ce qui n'est pas propre à un jeu (voir plus bas)
common/games.css      styles communs : accueil, écran de jeu fixe, barre d'actions, tiroir « ⋯ », cartes des joueurs
```

### Ce que fait le socle commun (`common/core.js`)

- Accueil : « Créer une partie » puis lien / ordinateur / face à face / libre, invitation par lien `#join-CODE`, reprise par code.
- Partie par lien sur PeerJS : hôte, invité, spectateurs, reconnexion, reprise de l'hébergement par l'invité, revanche, codes de reprise, pendules.
- Modes locaux : face à face (pendule optionnelle, sans annulation), libre (annulation, suggestions si le jeu a un ordinateur), ordinateur (dans une tâche de fond).
- Sauvegarde dans le navigateur et reprise au rafraîchissement (`#test`, `#ai`, `#local`, parties par lien).
- Écran de jeu : barre d'actions unique (libellés courts seulement si la place manque), disposition fixe (deux colonnes sur grand écran, bandes et tiroir sur téléphone), option Coordonnées, langue FR/EN, sons.

### Ce qu'une page de jeu fournit : l'objet `GAME`

La page charge `common/core.js`, définit `const GAME={…}` puis appelle `coreStart()`. La liste complète des crochets (`id`, `rules`, `replay`, `legal`, `board`, `turnStatus`, `newUi`, `preparing`, `cancel`, ordinateur `levels`/`aiSrc`/`aiSearch`…) est documentée en tête de `common/core.js`. `gyges.html` est l'exemple de référence.

## Règles à respecter

- **Version des fichiers communs.** Les pages chargent `common/core.js?v=N` et `common/games.css?v=N`. Après toute modification d'un de ces deux fichiers, incrémenter `N` dans **les huit pages**, sinon un navigateur peut garder l'ancien fichier en cache avec une page récente.
- **Clés de stockage et identifiants réseau.** Ils sont préfixés par `GAME.id` (`gyges-test`, `gyges-p2p-…`). Ne pas changer `GAME.id` d'un jeu existant : les parties enregistrées et les codes de reprise seraient perdus.
- **Ergonomie.** Les principes validés sont dans `CHARTE-ERGONOMIE.md` (branche `ergonomie` tant qu'elle n'est pas fusionnée) : survol translucide, provisoire en pointillés, joué en plein, une seule mise en évidence, une barre d'actions, écran sans défilement.

## Tester

- Localement : servir le dossier, par exemple `python3 -m http.server 8765`, puis ouvrir `http://localhost:8765/`. Les modes Libre (`<jeu>.html#test`) et Face à face permettent de jouer seul ; une vraie partie par lien se teste avec deux onglets (pas deux cadres d'une même page : ils partagent l'identité d'onglet).
- Hors navigateur : il n'y a pas de Node sur la machine de développement ; les bancs de test utilisent JavaScriptCore (`/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc`) avec une imitation minimale du DOM et de PeerJS.
