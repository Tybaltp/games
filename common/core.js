// ===== Shared code of the two-player games (common/core.js) =====
// The pages load this file and games.css with a version (?v=N): bump N in every page after changing either, so
// browsers never mix a cached shared file with a newer page.
// Everything that is not a game's rules or board: storage, language, home page, link games over PeerJS (host / guest /
// spectator, reconnection, takeover, rematch, resume codes, clocks), computer opponent plumbing, face to face (clock),
// free play (undo, hints), action bar, side panel and bottom sheet, sounds. A plain script: its top-level names are
// globals shared with the page's script, which runs after it, defines `const GAME={…}` and then calls coreStart().
//
// Globals the game may read: view (the game shown: {size,…rules,tc,names,first,moves,clock,running,elapsed,result,
// started,ready,paused,held,myHold,…}), role ('host'|'guest'|'watch'|'ai'|'local'|'test'), mySeat (-1 = spectator), ui,
// flip (mySeat 1 over the network), navAt (null = live), busy (''|'ai'|'hint'), hintMv (suggested move shown), sending,
// coordsOn (board coordinates shown), solo(), hintOn(), isMyTurn(r), meSt(r), netSim(r), seatName(s), replay(rules,moves,result) (memoised, adds the
// result), renderGame(), status(txt,cls,btns), quiet(), send(mv), stopAI(), t(k,vars), $(id), LS, nickGet().
// ui is the game's object (GAME.newUi()); the shared code only clears ui.pending (on send) and ui.hover (hint off).
//
// GAME hooks (? = optional):
//  id, size, codeTag             LS/PeerJS prefix ('gyges'), board size checked between peers, resume code tag ('GYGES1')
//  i18n:{fr,en,es}               the game's strings, merged over the shared ones (title and rules required)
//  rules(src)                    the rule fields of a game or view, normalised: {adv,setup} for Gyges ({} if none)
//  form(p)                       the rules read from the home form with id prefix p: 'c' link, 'a' computer, 'f' face, 't' free
//  replay(rules,moves)           {st (with st.turn = seat to move), log:[{p,txt}], last, over:null|{w (-1 draw),why}}
//                                (an illegal code ends it with {w:-1,why:'w_bad'})
//  legal(st,code,g)              the canonical code of a legal move in st, or null (host-side check)
//  enc(mv)                       code of a move object (moves sent, AI and hint results)
//  describe(mv,st)               text of a move played from st (hints, move awaiting confirmation)
//  newUi(), preparing(), cancel()  fresh move-preparation state · a move is being prepared · drop it (Reset, Escape)
//  board(c)                      draws the board, c={r,d (position shown: r or the navigated one),mine,ms (position to act on)};
//                                returns the game's click state o, handed back to turnStatus/hintable
//  turnStatus(c)                 my turn, nothing pending: calls status(); c={r,o,ms,prep,idle,undoB,RST}
//  pendBtns(mv,ms)               optional: extra buttons between Reset and Confirm while a move awaits confirmation
//  noReset?(mv)                  true: no Reset button while mv awaits confirmation (the game drops it otherwise)
//  waitStatus?(c)                the opponent's turn, live: calls status() and returns true, or false for « X to move »
//  pendText?(mv,st)              [message, confirm label] for a move awaiting confirmation
//  hintable?(o), hintOk?(mv)     Hint offered now · a found move may be shown
//  playerCard?(el,p,d)          Add game content to seat p's card (d: the position shown)
//  logDesc?(e)                   Extra description line under a move-list entry
//  logText?(e,r)                 text of a move-list entry (default e.txt)
//  logNode?(e,r)                 a DOM node for a move-list entry instead of the text (pictures)
//  drawOffer?                    true: the players may offer a draw (accepted: drawn by agreement)
//  quietWhy?(why)                true: the end of the game says only who wins (« Player 2 wins. »), not why
//  rich?(txt)                    status texts with pictures: txt holds U+2063…U+2063 marks; returns {node(), plain}
//  applyStatic?()                the game's static texts and selects, on load and on a language switch
//  home()                        draws the board shown on the home page (and again when the coordinates are switched)
//  simMode?(g), simHold?(g,r), holdLegal?(r,s,code,g)  simultaneous hidden first moves over the network: the rules use it ·
//                                it is that phase now · seat s's held code is legal
//  clockOff?(v,st)               no clock runs in st (face to face)
//  sgf?                          {gm, sz: the game's SGF number and size · nodes?(r,view) → [{B|W|other prop: value}],
//                                codes?(nodes) → move codes: a notation of its own · black?(st) → the seat of B};
//                                by default, one node per move: B (seat 0) or W (seat 1), the move's code as value
//  sgfHead?(v)                   extra private properties of the file's header {XA: …}: not shown in the game
//  levels, levelDefault, hintLevel  computer levels {key:opt} (labels lv_key), the default key, the options of hints
//  aiSrc(), aiPos(st), aiSearch(st,opt), aiOpt?(v), aiView?(st), evalInfo(res,st)  worker source defining
//                                aiSearch(pos,opt) on the aiPos() form · page fallback search · extra search options ·
//                                position the computer is shown · {k,d} opinion line or null
const $=id=>document.getElementById(id);
const LS={get(k,d){try{const v=localStorage.getItem(k);return v===null?d:JSON.parse(v);}catch(e){return d;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}},del(k){try{localStorage.removeItem(k);}catch(e){}}};
const TCS=[{id:'20+10',base:20*60e3,inc:10e3},{id:'10+5',base:10*60e3,inc:5e3},{id:'5+3',base:5*60e3,inc:3e3},{id:'3+2',base:3*60e3,inc:2e3},{id:'none'}];
const I18C={fr:{
 fullscreen:"Plein écran (toucher à nouveau pour en sortir)", computer:"L'ordinateur",level:"Niveau",lv_debutant:"Débutant",lv_moyen:"Moyen",lv_fort:"Fort",undo:"Annuler le dernier coup",undoS:"Annuler",hintPlayS:"Jouer",hint:"Suggestion",hintPlay:"Jouer ce coup",dismiss:"Ignorer",reset:"Réinitialiser",pend_mv:"Coup : {m}",st_yourTurn:"À vous de jouer.",st_turn:"Au tour de {n}.",hint_move:"Suggestion : {m}",st_aiThinking:"L'ordinateur réfléchit…",hintBusy:"Recherche d'une suggestion…",ai_eq:"Ordinateur : position équilibrée (profondeur {d}).",ai_better:"Ordinateur : se juge mieux (profondeur {d}).",ai_much:"Ordinateur : se juge nettement mieux (profondeur {d}).",ai_worse:"Ordinateur : se juge moins bien (profondeur {d}).",ai_muchWorse:"Ordinateur : se juge nettement moins bien (profondeur {d}).",ai_win:"Ordinateur : gain forcé en vue.",ai_lost:"Ordinateur : se sait perdu.",ai_forced:"Ordinateur : coup forcé.",leaveQ:"Une partie est en cours. La quitter ?",st_waitHost:"Coup envoyé, en attente de l'hôte…",nav_first:"Début de la partie (Début, ou Maj + ←)",nav_prev:"Coup précédent (←)",nav_next:"Coup suivant (→)",nav_last:"Fin de la ligne (Fin, ou Maj + →)",nav_brP:"Branchement précédent (↑)",nav_brN:"Branchement suivant (↓)",nav_altU:"Variante précédente de ce coup (Maj + ↑)",nav_altD:"Variante suivante de ce coup (Maj + ↓)",altN:"{n} variantes de ce coup",opts:"Options",nav_pos:"Coup {k} / {n}",home:"Accueil",rematch:"Rejouer",accept:"Accepter",decline:"Refuser",rm_ask:"{n} propose une nouvelle partie, côtés inversés.",rm_sent:"Proposition envoyée.",rm_no:"{n} a refusé.",
 sub:"pair à pair",create:"Créer une partie",nick:"Votre nom",firstIs:"Qui commence",rnd:"Aléatoire",me:"Moi",opp:"Mon adversaire",tc:"Pendule",tc_none:"Sans pendule",tc_fmt:"{m} min + {s} s par coup",createBtn:"Créer la partie",
 join:"Rejoindre une partie avec un code",code:"Code de la partie",play:"Jouer",watch:"Observer",linkHint:"Avec un lien d'invitation, la page se connecte toute seule.",
 pickOpp:"Contre qui ?",back:"Retour",m_link:"Inviter par un lien",m_linkTxt:"Un adversaire sur un autre appareil, avec un lien ou un code.",m_ai:"Ordinateur",m_aiTxt:"Trois niveaux, pour s'entraîner.",m_face:"Face à face",m_faceTxt:"Deux joueurs sur le même écran, avec pendule si vous voulez.",m_free:"Libre",m_freeTxt:"Les deux camps sur cet écran, sans pendule, avec annulation et suggestions : pour essayer et analyser.",localBtn:"Commencer la partie",
 invitedT:"Vous êtes invité à une partie",invitedTxt:"Choisissez le nom que verra votre adversaire, puis cliquez Jouer.",watchT:"Vous êtes invité à observer une partie",watchTxt:"Choisissez le nom que verront les joueurs, puis cliquez Observer, ou restez anonyme.",anon:"Anonyme",watchersT:"Observateurs ({n})",chat:"Discussion",chatN:"Discussion ({n})",chatPh:"Votre message",chatSend:"Envoyer",chatName:"Choisir un nom pour écrire",chatEmpty:"Aucun message.",chatW:"obs.",chatHintP:"Les messages des observateurs s'affichent à la fin de la partie.",chatHintW:"Les joueurs ne verront vos messages qu'à la fin de la partie.",voice:"Vocal",lg_join:"{n} a rejoint la partie.",lg_watch:"{n} a rejoint la partie en observateur.",lg_start:"La partie commence.",lg_rematch:"Revanche : la partie recommence, camps échangés.",lg_table:"Table {k} : {g}.",vAsk:"🎙 Proposer le vocal",vOut:"Vocal proposé à {n}…",vInvite:"{n} propose de parler à voix haute.",vConn:"Connexion du vocal…",vOn:"Vocal avec {n}",vMute:"Couper le micro",vUnmute:"Rétablir le micro",vVol:"Volume de la voix",vHang:"Raccrocher",vNo:"{n} a refusé le vocal.",vEnd:"Vocal terminé.",vMic:"Micro inaccessible : le vocal n'a pas démarré.",vFail:"Le vocal n'a pas pu se connecter (réseau).",
 inProgressTxt:"Vous hébergiez une partie inachevée.",inProgressGuest:"Vous jouiez une partie inachevée sur l'invitation d'un autre joueur.",resumeBtn:"Reprendre la partie",resume:"Reprendre une partie",resumeCode:"Code de reprise",load:"Charger",
 resumeHint:"Si une partie n'a pas pu être rétablie, collez le code de reprise copié pendant la partie. Vous l'hébergez à nouveau et envoyez le nouveau code à votre adversaire.",
 cancel:"Annuler",confirmMv:"Confirmer",
 start:"Départ",startBtn:"Démarrer la partie",pass:"Passer",resign:"Abandonner",resignNo:"Continuer",resignYes:"Confirmer l'abandon",
 invite:"Inviter",codes:"Codes d’invitation",copy:"Copier",copied:"Copié",linkOpp:"Lien pour votre adversaire",linkWatch:"Lien pour les observateurs",
 fileNote:"Ce fichier est ouvert depuis votre disque : les liens ne marcheront pour personne d'autre. Envoyez ce fichier HTML et le code : la personne l'ouvre, saisit le code et choisit Jouer ou Observer.",
 hostNote:"La partie tourne dans votre navigateur ; si vous décrochez, votre adversaire prend le relais.",cGame:"Adversaire",cWatch:"Observateurs",cResume:"Reprise",copyCode:"Copier le code",copyLink:"Copier le lien",cCode:"Code",cLink:"Lien",
 rcTxt:"Dernier recours si la connexion ne revient pas : l'un ou l'autre colle ce code dans « Reprendre une partie » sur la page d'accueil.",rcCopy:"Copier le code de reprise",sounds:"Sons",moves:"Coups",
 noSpect:"Aucun observateur",spect:"{n} observateur",spects:"{n} observateurs",you:"Vous",p1:"Joueur 1",p2:"Joueur 2",
 iam:"Je suis {n}",badResume:"Ce code de reprise n'est pas valide.",codeLen:"Saisissez le code reçu.",codeWatch:"Code pour les observateurs",
 noPeer:"La bibliothèque de connexion n'a pas pu se charger : vérifiez votre accès Internet, puis rechargez la page.",
 st_open:"Ouverture de la table…",st_lostMm:"Contact perdu avec le service de mise en relation, reconnexion…",st_noMm:"Pas de connexion au service de mise en relation. Vérifiez votre accès Internet.",
 st_conn:"Connexion à la table…",st_noTable:"Table introuvable : l'hôte n'a pas la page ouverte. Nouvel essai…",st_nack:"Coup refusé par l'hôte : la position a changé. Rejouez.",st_noHost:"Pas de connexion à l'hôte : le coup n'a pas été envoyé.",st_noHost2:"Pas de connexion à l'hôte.",
 t_refused:"Deux joueurs sont déjà dans cette partie. Vous pouvez l'observer : cliquez Observer.",
 draw:"Nulle : {why}.",youWin:"Vous gagnez : {why}.",wins:"{n} gagne : {why}.",drawQ:"Nulle.",youWinQ:"Vous gagnez.",winsQ:"{n} gagne.",st_waitOpp:"En attente de votre adversaire : envoyez-lui le code de la partie.",
 st_pausedHost:"{n} est injoignable. Les pendules sont arrêtées jusqu'à son retour.",st_pausedGuest:"Hôte injoignable, reconnexion… Les pendules sont arrêtées.",st_pausedWatch:"Un joueur est déconnecté. Les pendules sont arrêtées.",
 st_waitBoth:"En attente du démarrage par les deux joueurs.",st_waitClick:"En attente que {n} clique Démarrer la partie.",st_bothHere:"Les deux joueurs sont là. Cliquez Démarrer la partie, chacun de votre côté.",
 ready:"{n} est prêt. ",clocksStart:"Les pendules démarrent quand les deux ont cliqué.",waitingOpp:"En attente de l'adversaire…",
 w_time:"temps écoulé",w_resign:"abandon",w_agree:"accord mutuel",playGo:"Jouer",analyse:"Analyser",haveInvite:"J'ai un code d'invitation",haveResume:"J'ai un code de reprise",modeOpt:"Mode de jeu",a_free:"Créer une partie",a_freeTxt:"Les deux camps sur cet écran, avec annulation et suggestions : pour essayer et analyser.",a_load:"Charger une partie",a_loadTxt:"Un fichier SGF : une partie terminée à revoir, ou inachevée à poursuivre.",sgfFile:"Fichier SGF",sgfLoadBtn:"Charger la partie",sgfNoFile:"Choisissez d'abord un fichier.",sgfBranch:"Ce fichier contient des variantes : elles ne sont pas encore prises en charge.",editName:"Cliquez pour renommer",st_navTest:"Revenez au dernier coup pour jouer.",m_table:"Mochalunt · table {k} / {n} · {g}",m_score:"{a} {x} – {y} {b}",mq_q:"Voulez-vous jouer en premier ou en second ?",mq_1:"En premier",mq_2:"En second",m_choosing:"{n} choisit sa place.",m_waitOpp:"En attente de votre adversaire à cette table.",m_chooseYou:"À vous de choisir votre place à cette table.",m_next:"Rejoindre la table suivante",m_follow:"Suivre à la table suivante",m_result:"Voir le résultat du match",m_back:"Revenir à la table en cours",m_live:"en cours",m_drawn:"nulle",m_won:"{n} gagne",m_unknown:"Ce match n'est pas connu sur cet appareil : ouvrez son lien d'invitation.",spectator:"Observateur",options:"Options",drawOffer:"Proposer la nulle",drawCancel:"Retirer la proposition",drawWait:"Nulle proposée : en attente de la réponse de {n}.",drawNo:"{n} refuse la nulle.",drawAsk:"{n} propose la nulle.",w_bad:"coup illisible",coords:"Coordonnées",
 sgfLoad:"Charger une partie",sgfExport:"Exporter la partie (SGF)",st_file:"Partie chargée, en lecture seule : parcourez-la avec les flèches ou la liste des coups.",
 sgfBad:"Fichier SGF illisible.",sgfOther:"Ce fichier est une partie d'un autre jeu ({g}).",sgfMove:"Fichier SGF : le coup {n} n'est pas légal."
},en:{
 fullscreen:"Full screen (tap again to leave it)", computer:"The computer",level:"Level",lv_debutant:"Beginner",lv_moyen:"Medium",lv_fort:"Strong",undo:"Undo last move",undoS:"Undo",hintPlayS:"Play",hint:"Hint",hintPlay:"Play this move",dismiss:"Dismiss",reset:"Reset",pend_mv:"Move: {m}",st_yourTurn:"Your move.",st_turn:"{n} to move.",hint_move:"Hint: {m}",st_aiThinking:"The computer is thinking…",hintBusy:"Looking for a hint…",ai_eq:"Computer: balanced position (depth {d}).",ai_better:"Computer: thinks it is better (depth {d}).",ai_much:"Computer: thinks it is clearly better (depth {d}).",ai_worse:"Computer: thinks it is worse (depth {d}).",ai_muchWorse:"Computer: thinks it is clearly worse (depth {d}).",ai_win:"Computer: sees a forced win.",ai_lost:"Computer: knows it is lost.",ai_forced:"Computer: forced move.",leaveQ:"A game is in progress. Leave it?",st_waitHost:"Move sent, waiting for the host…",nav_first:"Start of the game (Home, or Shift + ←)",nav_prev:"Previous move (←)",nav_next:"Next move (→)",nav_last:"End of the line (End, or Shift + →)",nav_brP:"Previous branching (↑)",nav_brN:"Next branching (↓)",nav_altU:"Previous variation of this move (Shift + ↑)",nav_altD:"Next variation of this move (Shift + ↓)",altN:"{n} variations of this move",opts:"Options",nav_pos:"Move {k} / {n}",home:"Home",rematch:"Rematch",accept:"Accept",decline:"Decline",rm_ask:"{n} offers a new game, sides swapped.",rm_sent:"Offer sent.",rm_no:"{n} declined.",
 sub:"peer to peer",create:"Create a game",nick:"Your name",firstIs:"Who starts",rnd:"Random",me:"Me",opp:"My opponent",tc:"Time control",tc_none:"No clock",tc_fmt:"{m} min + {s} s per move",createBtn:"Create game",
 join:"Join a game with a code",code:"Game code",play:"Play",watch:"Watch",linkHint:"With an invitation link, the page connects on its own.",
 pickOpp:"Against whom?",back:"Back",m_link:"Invite with a link",m_linkTxt:"An opponent on another device, with a link or a code.",m_ai:"Computer",m_aiTxt:"Three levels, to practise.",m_face:"Face to face",m_faceTxt:"Two players on the same screen, with a clock if you like.",m_free:"Free play",m_freeTxt:"Both sides on this screen, no clock, with undo and hints: to try things and analyse.",localBtn:"Start the game",
 invitedT:"You are invited to a game",invitedTxt:"Choose the name your opponent will see, then click Play.",watchT:"You are invited to watch a game",watchTxt:"Choose the name the players will see, then click Watch, or stay anonymous.",anon:"Anonymous",watchersT:"Spectators ({n})",chat:"Chat",chatN:"Chat ({n})",chatPh:"Your message",chatSend:"Send",chatName:"Choose a name to write",chatEmpty:"No messages yet.",chatW:"spect.",chatHintP:"Spectators' messages are shown once the game is over.",chatHintW:"The players will only see your messages once the game is over.",voice:"Voice",lg_join:"{n} joined the game.",lg_watch:"{n} joined as a spectator.",lg_start:"The game begins.",lg_rematch:"Rematch: a new game begins, sides swapped.",lg_table:"Table {k}: {g}.",vAsk:"🎙 Offer voice chat",vOut:"Voice chat offered to {n}…",vInvite:"{n} offers to talk out loud.",vConn:"Connecting voice…",vOn:"Voice with {n}",vMute:"Mute the mic",vUnmute:"Unmute the mic",vVol:"Voice volume",vHang:"Hang up",vNo:"{n} declined voice chat.",vEnd:"Voice chat ended.",vMic:"Microphone unavailable: voice chat did not start.",vFail:"Voice chat could not connect (network).",
 inProgressTxt:"You were hosting an unfinished game.",inProgressGuest:"You were playing an unfinished game at another player's invitation.",resumeBtn:"Resume game",resume:"Resume a game",resumeCode:"Resume code",load:"Load",
 resumeHint:"If a game could not be restored, paste the resume code copied during the game. You host it again and send the new code to your opponent.",
 cancel:"Cancel",confirmMv:"Confirm",
 start:"Start",startBtn:"Start the game",pass:"Pass",resign:"Resign",resignNo:"Keep playing",resignYes:"Confirm resignation",
 invite:"Invite",codes:"Invitation codes",copy:"Copy",copied:"Copied",linkOpp:"Link for your opponent",linkWatch:"Link for spectators",
 fileNote:"This file is open from your disk, so links will not work for anyone else. Send them this HTML file and the code: they open it, enter the code and choose Play or Watch.",
 hostNote:"The game runs in your browser; if you drop out, your opponent takes over.",cGame:"Opponent",cWatch:"Spectators",cResume:"Resume",copyCode:"Copy the code",copyLink:"Copy the link",cCode:"Code",cLink:"Link",
 rcTxt:"Last resort if the connection cannot be restored: either player can paste this code into “Resume a game” on the home page.",rcCopy:"Copy the resume code",sounds:"Sounds",moves:"Moves",
 noSpect:"No spectators",spect:"{n} spectator",spects:"{n} spectators",you:"You",p1:"Player 1",p2:"Player 2",
 iam:"I am {n}",badResume:"This resume code is not valid.",codeLen:"Enter the code you received.",codeWatch:"Code for spectators",
 noPeer:"The connection library could not load: check your Internet access, then reload the page.",
 st_open:"Opening the table…",st_lostMm:"Lost contact with the matchmaking service, reconnecting…",st_noMm:"No connection to the matchmaking service. Check your Internet access.",
 st_conn:"Connecting to the table…",st_noTable:"Table not found: the host does not have the page open. Retrying…",st_nack:"Move rejected by the host: the position has changed. Play again.",st_noHost:"No connection to the host: the move was not sent.",st_noHost2:"No connection to the host.",
 t_refused:"Two players are already in this game. You can still watch it: click Watch.",
 draw:"Draw: {why}.",youWin:"You win: {why}.",wins:"{n} wins: {why}.",drawQ:"Draw.",youWinQ:"You win.",winsQ:"{n} wins.",st_waitOpp:"Waiting for your opponent: send them the game code.",
 st_pausedHost:"{n} is unreachable. The clocks are stopped until they are back.",st_pausedGuest:"Host unreachable, reconnecting… The clocks are stopped.",st_pausedWatch:"A player is disconnected. The clocks are stopped.",
 st_waitBoth:"Waiting for both players to start.",st_waitClick:"Waiting for {n} to click Start the game.",st_bothHere:"Both players are here. Click Start the game, each on your side.",
 ready:"{n} is ready. ",clocksStart:"The clocks start once both players have clicked.",waitingOpp:"Waiting for your opponent…",
 w_time:"time ran out",w_resign:"resignation",w_agree:"mutual agreement",playGo:"Play",analyse:"Analyse",haveInvite:"I have an invitation code",haveResume:"I have a resume code",modeOpt:"Game mode",a_free:"Create a game",a_freeTxt:"Both sides on this screen, with undo and hints: to try things and analyse.",a_load:"Load a game",a_loadTxt:"An SGF file: a finished game to replay, or an unfinished one to go on with.",sgfFile:"SGF file",sgfLoadBtn:"Load the game",sgfNoFile:"Choose a file first.",sgfBranch:"This file has variations: they are not supported yet.",editName:"Click to rename",st_navTest:"Go back to the last move to play.",m_table:"Mochalunt · table {k} / {n} · {g}",m_score:"{a} {x} – {y} {b}",mq_q:"Do you want to play first or second?",mq_1:"First",mq_2:"Second",m_choosing:"{n} is choosing their seat.",m_waitOpp:"Waiting for your opponent at this table.",m_chooseYou:"Your turn to choose your seat at this table.",m_next:"Join the next table",m_follow:"Follow to the next table",m_result:"See the match result",m_back:"Back to the current table",m_live:"in progress",m_drawn:"draw",m_won:"{n} wins",m_unknown:"This match is not known on this device: open its invitation link.",spectator:"Spectator",options:"Options",drawOffer:"Offer a draw",drawCancel:"Withdraw the offer",drawWait:"Draw offered: waiting for {n}'s answer.",drawNo:"{n} declines the draw.",drawAsk:"{n} offers a draw.",w_bad:"unreadable move",coords:"Coordinates",
 sgfLoad:"Load a game",sgfExport:"Export the game (SGF)",st_file:"Game loaded, read only: go through it with the arrows or the list of moves.",
 sgfBad:"Unreadable SGF file.",sgfOther:"This file is a game of another game ({g}).",sgfMove:"SGF file: move {n} is not legal."
},es:{
 fullscreen:"Pantalla completa (toca de nuevo para salir)", computer:"El ordenador",level:"Nivel",lv_debutant:"Principiante",lv_moyen:"Medio",lv_fort:"Fuerte",undo:"Deshacer la última jugada",undoS:"Deshacer",hintPlayS:"Jugar",hint:"Sugerencia",hintPlay:"Jugar esta jugada",dismiss:"Ignorar",reset:"Reiniciar",pend_mv:"Jugada: {m}",st_yourTurn:"Te toca jugar.",st_turn:"Le toca a {n}.",hint_move:"Sugerencia: {m}",st_aiThinking:"El ordenador está pensando…",hintBusy:"Buscando una sugerencia…",ai_eq:"Ordenador: posición equilibrada (profundidad {d}).",ai_better:"Ordenador: se cree mejor (profundidad {d}).",ai_much:"Ordenador: se cree claramente mejor (profundidad {d}).",ai_worse:"Ordenador: se cree peor (profundidad {d}).",ai_muchWorse:"Ordenador: se cree claramente peor (profundidad {d}).",ai_win:"Ordenador: ve una victoria forzada.",ai_lost:"Ordenador: se sabe perdido.",ai_forced:"Ordenador: jugada forzada.",leaveQ:"Hay una partida en curso. ¿Salir de ella?",st_waitHost:"Jugada enviada, esperando al anfitrión…",nav_first:"Inicio de la partida (Inicio, o Mayús + ←)",nav_prev:"Jugada anterior (←)",nav_next:"Jugada siguiente (→)",nav_last:"Fin de la línea (Fin, o Mayús + →)",nav_brP:"Bifurcación anterior (↑)",nav_brN:"Bifurcación siguiente (↓)",nav_altU:"Variante anterior de esta jugada (Mayús + ↑)",nav_altD:"Variante siguiente de esta jugada (Mayús + ↓)",altN:"{n} variantes de esta jugada",opts:"Opciones",nav_pos:"Jugada {k} / {n}",home:"Inicio",rematch:"Revancha",accept:"Aceptar",decline:"Rechazar",rm_ask:"{n} propone una nueva partida, con los bandos cambiados.",rm_sent:"Propuesta enviada.",rm_no:"{n} ha rechazado.",
 sub:"entre navegadores",create:"Crear una partida",nick:"Tu nombre",firstIs:"Quién empieza",rnd:"Al azar",me:"Yo",opp:"Mi adversario",tc:"Reloj",tc_none:"Sin reloj",tc_fmt:"{m} min + {s} s por jugada",createBtn:"Crear la partida",
 join:"Unirse a una partida con un código",code:"Código de la partida",play:"Jugar",watch:"Observar",linkHint:"Con un enlace de invitación, la página se conecta sola.",
 pickOpp:"¿Contra quién?",back:"Volver",m_link:"Invitar con un enlace",m_linkTxt:"Un adversario en otro dispositivo, con un enlace o un código.",m_ai:"Ordenador",m_aiTxt:"Tres niveles, para entrenarse.",m_face:"Cara a cara",m_faceTxt:"Dos jugadores en la misma pantalla, con reloj si quieres.",m_free:"Libre",m_freeTxt:"Los dos bandos en esta pantalla, sin reloj, con deshacer y sugerencias: para probar y analizar.",localBtn:"Empezar la partida",
 invitedT:"Te han invitado a una partida",invitedTxt:"Elige el nombre que verá tu adversario y pulsa Jugar.",watchT:"Te han invitado a observar una partida",watchTxt:"Elige el nombre que verán los jugadores y pulsa Observar, o quédate anónimo.",anon:"Anónimo",watchersT:"Espectadores ({n})",chat:"Chat",chatN:"Chat ({n})",chatPh:"Tu mensaje",chatSend:"Enviar",chatName:"Elige un nombre para escribir",chatEmpty:"Ningún mensaje.",chatW:"esp.",chatHintP:"Los mensajes de los espectadores se muestran al final de la partida.",chatHintW:"Los jugadores solo verán tus mensajes al final de la partida.",voice:"Voz",lg_join:"{n} se ha unido a la partida.",lg_watch:"{n} se ha unido como espectador.",lg_start:"Empieza la partida.",lg_rematch:"Revancha: la partida vuelve a empezar, con los bandos cambiados.",lg_table:"Mesa {k}: {g}.",vAsk:"🎙 Proponer hablar por voz",vOut:"Voz propuesta a {n}…",vInvite:"{n} propone hablar por voz.",vConn:"Conectando la voz…",vOn:"Voz con {n}",vMute:"Silenciar el micro",vUnmute:"Activar el micro",vVol:"Volumen de la voz",vHang:"Colgar",vNo:"{n} ha rechazado la voz.",vEnd:"Voz terminada.",vMic:"Micrófono inaccesible: la voz no ha arrancado.",vFail:"La voz no ha podido conectarse (red).",
 inProgressTxt:"Alojabas una partida sin terminar.",inProgressGuest:"Jugabas una partida sin terminar por invitación de otro jugador.",resumeBtn:"Reanudar la partida",resume:"Reanudar una partida",resumeCode:"Código de reanudación",load:"Cargar",
 resumeHint:"Si una partida no se ha podido restablecer, pega el código de reanudación copiado durante la partida. Vuelves a alojarla y envías el nuevo código a tu adversario.",
 cancel:"Cancelar",confirmMv:"Confirmar",
 start:"Salida",startBtn:"Empezar la partida",pass:"Pasar",resign:"Abandonar",resignNo:"Continuar",resignYes:"Confirmar el abandono",
 invite:"Invitar",codes:"Códigos de invitación",copy:"Copiar",copied:"Copiado",linkOpp:"Enlace para tu adversario",linkWatch:"Enlace para los espectadores",
 fileNote:"Este archivo está abierto desde tu disco: los enlaces no funcionarán para nadie más. Envía este archivo HTML y el código: la persona lo abre, introduce el código y elige Jugar u Observar.",
 hostNote:"La partida corre en tu navegador; si te desconectas, tu adversario toma el relevo.",cGame:"Adversario",cWatch:"Espectadores",cResume:"Reanudación",copyCode:"Copiar el código",copyLink:"Copiar el enlace",cCode:"Código",cLink:"Enlace",
 rcTxt:"Último recurso si la conexión no vuelve: uno u otro pega este código en «Reanudar una partida» en la página de inicio.",rcCopy:"Copiar el código de reanudación",sounds:"Sonidos",moves:"Jugadas",
 noSpect:"Ningún espectador",spect:"{n} espectador",spects:"{n} espectadores",you:"Tú",p1:"Jugador 1",p2:"Jugador 2",
 iam:"Soy {n}",badResume:"Este código de reanudación no es válido.",codeLen:"Introduce el código recibido.",codeWatch:"Código para los espectadores",
 noPeer:"La biblioteca de conexión no se ha podido cargar: comprueba tu acceso a Internet y recarga la página.",
 st_open:"Abriendo la mesa…",st_lostMm:"Contacto perdido con el servicio de conexión, reconectando…",st_noMm:"Sin conexión con el servicio de conexión. Comprueba tu acceso a Internet.",
 st_conn:"Conectando con la mesa…",st_noTable:"Mesa no encontrada: el anfitrión no tiene la página abierta. Nuevo intento…",st_nack:"Jugada rechazada por el anfitrión: la posición ha cambiado. Vuelve a jugar.",st_noHost:"Sin conexión con el anfitrión: la jugada no se ha enviado.",st_noHost2:"Sin conexión con el anfitrión.",
 t_refused:"Ya hay dos jugadores en esta partida. Puedes observarla: pulsa Observar.",
 draw:"Tablas: {why}.",youWin:"Ganas: {why}.",wins:"{n} gana: {why}.",drawQ:"Tablas.",youWinQ:"Ganas.",winsQ:"{n} gana.",st_waitOpp:"Esperando a tu adversario: envíale el código de la partida.",
 st_pausedHost:"{n} no responde. Los relojes están parados hasta que vuelva.",st_pausedGuest:"Anfitrión inalcanzable, reconectando… Los relojes están parados.",st_pausedWatch:"Un jugador está desconectado. Los relojes están parados.",
 st_waitBoth:"Esperando a que los dos jugadores empiecen.",st_waitClick:"Esperando a que {n} pulse Empezar la partida.",st_bothHere:"Los dos jugadores están aquí. Pulsad Empezar la partida, cada uno por su lado.",
 ready:"{n} está listo. ",clocksStart:"Los relojes arrancan cuando los dos han pulsado.",waitingOpp:"Esperando al adversario…",
 w_time:"tiempo agotado",w_resign:"abandono",w_agree:"acuerdo mutuo",playGo:"Jugar",analyse:"Analizar",haveInvite:"Tengo un código de invitación",haveResume:"Tengo un código de reanudación",modeOpt:"Modo de juego",a_free:"Crear una partida",a_freeTxt:"Los dos bandos en esta pantalla, con deshacer y sugerencias: para probar y analizar.",a_load:"Cargar una partida",a_loadTxt:"Un archivo SGF: una partida terminada para repasarla, o sin terminar para continuarla.",sgfFile:"Archivo SGF",sgfLoadBtn:"Cargar la partida",sgfNoFile:"Elige primero un archivo.",sgfBranch:"Este archivo contiene variantes: todavía no se admiten.",editName:"Pulsa para cambiar el nombre",st_navTest:"Vuelve a la última jugada para jugar.",m_table:"Mochalunt · mesa {k} / {n} · {g}",m_score:"{a} {x} – {y} {b}",mq_q:"¿Quieres jugar primero o segundo?",mq_1:"Primero",mq_2:"Segundo",m_choosing:"{n} elige su sitio.",m_waitOpp:"Esperando a tu adversario en esta mesa.",m_chooseYou:"Te toca elegir tu sitio en esta mesa.",m_next:"Ir a la mesa siguiente",m_follow:"Seguir en la mesa siguiente",m_result:"Ver el resultado del encuentro",m_back:"Volver a la mesa en curso",m_live:"en curso",m_drawn:"tablas",m_won:"{n} gana",m_unknown:"Este encuentro no se conoce en este dispositivo: abre su enlace de invitación.",spectator:"Espectador",options:"Opciones",drawOffer:"Proponer tablas",drawCancel:"Retirar la propuesta",drawWait:"Tablas propuestas: esperando la respuesta de {n}.",drawNo:"{n} rechaza las tablas.",drawAsk:"{n} propone tablas.",w_bad:"jugada ilegible",coords:"Coordenadas",
 sgfLoad:"Cargar una partida",sgfExport:"Exportar la partida (SGF)",st_file:"Partida cargada, solo lectura: recórrela con las flechas o la lista de jugadas.",
 sgfBad:"Archivo SGF ilegible.",sgfOther:"Este archivo es una partida de otro juego ({g}).",sgfMove:"Archivo SGF: la jugada {n} no es legal."
}};
let I18N=I18C;
let lang=(()=>{try{return JSON.parse(localStorage.getItem('games-lang'))||JSON.parse(localStorage.getItem('volo-lang'));}catch(e){return null;}})()||(l=>l.startsWith('fr')?'fr':l.startsWith('es')?'es':'en')((navigator.language||'fr').toLowerCase());
function t(k,v){let s=I18N[lang][k];if(s===undefined)s=I18N.en[k];if(s===undefined)return k;if(v)s=s.replace(/\{(\w+)\}/g,(m,n)=>v[n]!==undefined?v[n]:m);return s;}
const tcLabel=x=>x.id==='none'?t('tc_none'):t('tc_fmt',{m:x.base/60e3,s:x.inc/1e3});
const K=s=>GAME.id+'-'+s;   // this game's localStorage keys
function applyStatic(){document.documentElement.lang=lang;document.title=t('title');$('ttl').textContent=t('title');
  document.querySelectorAll('[data-i18n]').forEach(e=>{e.textContent=t(e.dataset.i18n);});
  document.querySelectorAll('[data-i18n-t]').forEach(e=>{e.title=t(e.dataset.i18nT);e.setAttribute('aria-label',e.title);});
  document.querySelectorAll('[data-lang]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.lang===lang?'true':'false'));
  $('rules').innerHTML=t('rules');if($('rulesHome'))$('rulesHome').innerHTML=t('rules').replace(/ \(<span class="\w+State"><\/span>\)/g,'');   // home: the same rules, without « (on in this game) »
  const sel=$('cTc');if(sel){const cur=sel.value||LS.get(K('tc'),null)||GAME.tcDefault||'20+10';
    sel.innerHTML=TCS.map(x=>`<option value="${x.id}" ${x.id===cur?'selected':''}>${tcLabel(x)}</option>`).join('');}
  // face to face: its own time control, no clock by default
  const fs=$('fTc');if(fs){const fcur=fs.value||LS.get(K('local-tc'),'none');fs.innerHTML=TCS.map(x=>`<option value="${x.id}" ${x.id===fcur?'selected':''}>${tcLabel(x)}</option>`).join('');}
  if(GAME.levels)for(const id of ['aLevel','gLevel']){const s=$(id);if(!s)continue;s.innerHTML=Object.keys(GAME.levels).map(k=>`<option value="${k}">${t('lv_'+k)}</option>`).join('');s.value=level;}
  if(GAME.applyStatic)GAME.applyStatic();
  const sg=$('resumeBtn').dataset.guest;$('resumeTxt').textContent=t(sg?'inProgressGuest':'inProgressTxt');mTexts();}
let level=null;
// Nickname shared by all the games (games-name), with this game's former key as fallback
const nickGet=()=>LS.get('games-name','')||LS.get(K('name'),''),nickSet=v=>{LS.set('games-name',v);LS.set(K('name'),v);};
let view=null,MYID='';
const rnd=n=>{const a='abcdefghijkmnpqrstuvwxyz23456789';let s='';for(const b of crypto.getRandomValues(new Uint8Array(n)))s+=a[b%a.length];return s;};
function pickTabId(key,seed){const R=()=>{const a='abcdefghijkmnpqrstuvwxyz23456789';let s='';for(const b of crypto.getRandomValues(new Uint8Array(16)))s+=a[b%a.length];return s;};
  try{const L=localStorage,S1=sessionStorage;let id=S1.getItem(key+'-tab');
    if(!id){let ids=[];try{ids=JSON.parse(L.getItem(key+'-tabs')||'[]')||[];}catch(e){}if(!ids.length&&seed)ids=[seed];const now=Date.now();
      id=ids.slice().reverse().find(x=>now-(+L.getItem(key+'-alive-'+x)||0)>5000);
      if(!id){id=R();ids.push(id);}L.setItem(key+'-tabs',JSON.stringify(ids.filter((x,k)=>ids.indexOf(x)===k).slice(-10)));S1.setItem(key+'-tab',id);}
    const beat=()=>{try{L.setItem(key+'-alive-'+id,String(Date.now()));}catch(e){}};beat();setInterval(beat,1500);return id;}catch(e){return R();}}
function hh(t){let h=2166136261;t=String(t||'');for(let k=0;k<t.length;k++){h^=t.charCodeAt(k);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}
let flip=false;   // the board is turned so that a player's own side is at the bottom (seat 1 over the network)
let memoKey='',memoVal=null;
// rules: the game or view object (its rule fields); the result (time, resignation) ends the game when the moves do not
function replay(rules,moves,result){const key=lang+'|'+JSON.stringify(GAME.rules(rules))+'|'+moves.join(',')+'|'+JSON.stringify(result);if(key===memoKey)return memoVal;
  const v=GAME.replay(rules,moves);if(!v.over&&result)v.over={w:result.winner,why:result.reason==='time'?'w_time':result.reason==='agree'?'w_agree':'w_resign'};
  memoKey=key;memoVal=v;return v;}
const sameRules=(a,b)=>JSON.stringify(GAME.rules(a))===JSON.stringify(GAME.rules(b));

// ---------- network (PeerJS) ----------
// Roles: the host (creator) is authoritative for rules and clock; the guest and spectators connect to it.
let role=null;          // 'host' | 'guest' | 'watch' | 'ai' (against the computer) | 'local' (face to face) | 'test' (free play) | 'file' (a game read from an SGF file): no network for the last four
// Both sides on this device (the seat follows the side to move, the board stays put)
const solo=()=>role==='test'||role==='local';
// Take-back and hints: against the computer and in free play only
const canUndo=()=>role==='ai'||role==='test',canHint=()=>canUndo()&&!!GAME.aiSrc;   // hints need the game's AI
let peer=null;
let mySeat=-1;
let ui={},sending=false;
const H={};             // host-only state

// The bar under the board (#notice): a message (2 lines at most) and the move commands available now. A command that
// does not apply is left out, never shown disabled.
// Rich status texts: a game may mark pictures in a text with U+2063 (GAME.rich(txt) gives {node(), plain})
const richOf=txt=>GAME.rich&&typeof txt==='string'&&txt.includes('\u2063')?GAME.rich(txt):null;
function status(txt,cls,btns){const s=$('status'),rt=richOf(txt);s.className='status'+(cls?' '+cls:'');if(rt){s.textContent='';s.append(rt.node());}else s.textContent=txt;if($('game').hidden)s.hidden=!txt;   // home: only for a message
  const n=$('notice');if(!n)return;btns=(btns||[]).filter(Boolean);n.className='notice on'+(cls?' '+cls:'')+(btns.length?' has-btns':'');n.textContent='';
  if(txt){const sp=document.createElement('span');sp.className='msg';if(rt){sp.append(rt.node());sp.title=rt.plain;}else{sp.textContent=txt;sp.title=txt;}n.appendChild(sp);}
  if(btns.length){const bx=document.createElement('div');bx.className='btns';n.appendChild(bx);
    for(const b of btns){const e=document.createElement('button');e.type='button';e.title=b.label;if(b.primary)e.className='primary';if(b.id)e.id=b.id;e.onclick=b.on;
      // b.short: a shorter label, used only when the buttons don't fit in the bar
      if(b.short){const l=document.createElement('span'),k=document.createElement('span');l.className='bl';l.textContent=b.label;k.className='bs';k.textContent=b.short;e.append(l,k);}else e.textContent=b.label;
      if(b.hover){e.onpointerenter=ev=>{if(ev.pointerType!=='touch')b.hover(true);};e.onpointerleave=()=>b.hover(false);}bx.appendChild(e);}}
  fitBtns();bandSync(true);}
// Short labels when the full ones overflow the bar; if the buttons still overflow, they wrap onto a second row and the
// bar grows (checked again whenever the bar changes size)
function fitBtns(){const n=$('notice'),bx=n&&n.querySelector('.btns');if(!bx)return;n.classList.remove('short','rows2');
  // measure the buttons at their natural width (no shrinking): do they fit?
  const over=()=>{bx.classList.add('measure');const o=bx.scrollWidth>bx.clientWidth+1;bx.classList.remove('measure');return o;};
  if(!over())return;
  if(bx.querySelector('.bs')){n.classList.add('short');if(!over())return;}
  n.classList.add('rows2');}

function quiet(){const n=$('notice');if(n){n.className='notice';n.textContent='';}bandSync(true);}
function peerOpts(){return {debug:1};}
function newPeer(id){return id?new Peer(id,peerOpts()):new Peer(peerOpts());}

// --- host ---
// Simultaneous first moves over the network (GAME.simHold): while that phase lasts, each player's validated move is kept
// by the host in g.hold[seat], out of the shared state (which only says who has validated, in held), and sent only to its
// owner (myHold). Once both are in, J1's then J2's are appended to the moves and broadcast. No clock runs meanwhile.
const simHold=(g,r)=>!!GAME.simHold&&GAME.simHold(g,r);
const simMode=g=>!!GAME.simMode&&GAME.simMode(g);
// Keep seat s's move in the simultaneous phase: 'ok' (kept; both revealed if the other one is in), 'dup' (already kept), 'bad'
function hostHold(s,code){const g=H.game;if(!g.hold)g.hold=[null,null];if(g.hold[s])return g.hold[s]===code?'dup':'bad';
  const r=replay(g,g.moves,g.result);if(!simHold(g,r)||!GAME.holdLegal(r,s,code,g))return 'bad';
  g.hold[s]=code;if(g.hold[0]&&g.hold[1]){g.moves=[g.hold[0],g.hold[1]];g.hold=null;g.running=true;H.turnStart=Date.now();g.ver=(g.ver||0)+1;}return 'ok';}
const myHoldOf=s=>H.game.hold&&s>=0?H.game.hold[s]||null:null;
function hostPublic(){const g=H.game,run=g.running&&!g.result&&!g.paused;return {size:g.size,...GAME.rules(g),held:[0,1].map(q=>!!(g.hold&&g.hold[q])),tc:g.tc||null,names:g.names.slice(),first:g.first,moves:g.moves.slice(),clock:g.clock.slice(),
  running:run,elapsed:run?Date.now()-H.turnStart:0,result:g.result,guestOn:!!H.guestConn,watchers:H.watchers.size,wnames:[...H.watchers].map(c=>c.wname||''),
  started:!!g.started,ready:(g.ready||[false,false]).slice(),th:g.th.slice(),paused:!!g.paused,ver:g.ver||0,wcode:H.wcode||null,rematch:g.rematch||null,draw:g.draw||null,chat:(g.chat||[]).filter(x=>!x.w||x.v),match:g.match?{...g.match,res:MATCH?MATCH.res:{}}:null};}
// Rematch: either player offers it once the game is over; on acceptance a new game starts at once under the same code,
// sides swapped (the players exchange seats), same time control and same rule set.
function rematchOp(s,op){const g=H.game,rm=g.rematch;if(!replay(g,g.moves,g.result).over||!g.names[0]||!g.names[1])return;
  if(op==='ask'&&(!rm||rm.st==='no'))g.rematch={from:s,st:'ask'};
  else if(op==='cancel'&&rm&&rm.from===s&&rm.st==='ask')g.rematch=null;
  else if(op==='no'&&rm&&rm.from!==s&&rm.st==='ask')g.rematch={from:rm.from,st:'no'};
  else if(op==='yes'&&rm&&rm.from!==s&&rm.st==='ask'){
    g.first=g.first==='host'?'guest':'host';g.names.reverse();g.th.reverse();g.moves=[];g.hold=null;g.result=null;g.rematch=null;g.draw=null;
    g.clock=[g.tc?g.tc.base:0,g.tc?g.tc.base:0];g.started=true;g.running=true;g.ready=[true,true];g.paused=false;g.ver=(g.ver||0)+1;H.turnStart=Date.now();
    hostLog('lg_rematch',null,true);
    mySeat=1-mySeat;if(H.guestConn){H.guestConn.seat=1-H.guestConn.seat;try{H.guestConn.send({t:'welcome',role:'guest',seat:H.guestConn.seat});}catch(e){}}}
  else return;
  hostBroadcast();}
// Draw offer (games with GAME.drawOffer): g.draw = {from (seat), st:'ask'|'no'}; the offer lapses with the next move, a
// refusal stays shown until then (no new offer meanwhile); acceptance ends the game, drawn by agreement
function drawOp(g,s,op){const dr=g.draw,r=replay(g,g.moves,g.result);if(r.over||!g.started)return false;
  if(op==='ask'&&!dr)g.draw={from:s,st:'ask'};
  else if(op==='cancel'&&dr&&dr.from===s&&dr.st==='ask')g.draw=null;
  else if(op==='no'&&dr&&dr.from!==s&&dr.st==='ask')g.draw={from:dr.from,st:'no'};
  else if(op==='yes'&&dr&&dr.from!==s&&dr.st==='ask'){g.draw=null;g.result={winner:-1,reason:'agree'};}
  else return false;
  return true;}
function drawSend(op){if(!view)return;const r=replay(view,view.moves,view.result);
  if(role==='host'){if(drawOp(H.game,mySeat,op))hostBroadcast();return;}
  if(role==='guest'){if(C.conn&&C.conn.open)C.conn.send({t:'draw',op});return;}
  if(role==='local'){const dr=view.draw,s=op==='ask'?r.st.turn:op==='cancel'?(dr?dr.from:0):(dr?1-dr.from:0);
    if(op==='yes')localFreeze();if(drawOp(view,s,op))renderGame();return;}
  // against the computer: an answer at once, yes when its last evaluation is not in its favour
  if(role==='ai'&&op==='ask'&&!view.draw&&!r.over){const a=aiLast;
    if(a&&!a.policy&&!a.forced&&typeof a.score==='number'&&a.score<.3){stopAI();hintMv=null;resetUi();view.draw=null;view.result={winner:-1,reason:'agree'};}
    else view.draw={from:mySeat,st:'no'};renderGame();}}
function rmSend(op){if(role==='host')rematchOp(mySeat,op);else if(C.conn&&C.conn.open)C.conn.send({t:'rematch',op});}
// The clocks stop only when it is the absent player's turn: while it is my turn, my clock keeps running.
function hostSyncPause(){const g=H.game;if(!g.started||g.result){g.paused=false;return;}const live=!!(H.guestConn&&H.guestConn.open);
  const r=replay(g,g.moves,g.result),absentTurn=!r.over&&r.st.turn!==mySeat,want=!live&&absentTurn&&!simHold(g,r);   // no clock, so no pause, in a simultaneous phase
  if(want&&!g.paused){if(g.running&&!r.over){const tt=r.st.turn;g.clock[tt]=Math.max(0,g.clock[tt]-(Date.now()-H.turnStart));}H.turnStart=Date.now();g.paused=true;}
  else if(!want&&g.paused){g.paused=false;H.turnStart=Date.now();}}
const PID=c=>GAME.id+'-p2p-'+c;
// a new game's codes begin with the game's letter (common/codes.js), so that the home page knows which page opens them
const newCode=n=>Object.keys(CODE_GAMES).find(k=>CODE_GAMES[k].id===GAME.id)+rnd(n-1);
const cleanCode=v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
function setHash(h){if(h&&typeof MATCH!=='undefined'&&MATCH&&MTW)h='m'+MTW+'-'+MATCH.code+'-'+MTK;   // a match table keeps its own address
  try{history.replaceState(null,'',h?'#'+h:location.pathname+location.search);}catch(e){}}
function hostSave(){const g=H.game;LS.set(K('p2p-host'),{code:H.code,wcode:H.wcode,guestCid:H.guestCid,game:g,savedAt:Date.now(),elapsed:g.running&&!g.paused&&!g.result?Date.now()-H.turnStart:0});if(g.match&&MATCH){MATCH.cur=MTK;MATCH.at=Date.now();mSave();}}
function hostReady(s){const g=H.game;if(g.started||g.result||!g.names[0]||!g.names[1]||(g.match&&!g.match.chosen))return;g.ready[s]=true;
  hostJoinLog(H.guestConn);if(g.ready[0]&&g.ready[1]){g.started=true;g.running=true;H.turnStart=Date.now();hostLog('lg_start',null,true);}hostBroadcast();}
function hostBroadcast(bump){if(bump)H.game.ver=(H.game.ver||0)+1;hostSyncPause();chatReveal();hostSave();const pub=hostPublic();
  const pubW={...pub,chat:H.game.chat||[],wcode:null,match:pub.match?{...pub.match,code:null}:null};
  for(const c of H.conns)if(c.open)c.send({t:'state',game:c===H.guestConn?{...pub,myHold:myHoldOf(c.seat)}:pubW});
  showState({...pub,myHold:myHoldOf(mySeat)});}
// Two codes: the game's (players; its id also lets them watch) and the spectators' (8 characters: its id only lets watch).
// The host listens on both; a spectator's code does not give the game's.
function wpeerStop(){const w=H.wpeer;H.wpeer=null;try{w&&w.destroy();}catch(e){}}
function hostWatchPeer(){wpeerStop();if(!H.wcode)return;const wp=newPeer(PID(H.wcode));H.wpeer=wp;
  wp.on('connection',conn=>{if(H.wpeer!==wp||role!=='host'){try{conn.close();}catch(e){}return;}conn.watchOnly=true;
    conn.on('data',d=>{if(H.wpeer===wp)hostOnData(conn,d);});conn.on('close',()=>{if(H.wpeer===wp)hostDrop(conn);});conn.on('error',()=>{if(H.wpeer===wp)hostDrop(conn);});});
  wp.on('disconnected',()=>{if(H.wpeer!==wp)return;setTimeout(()=>{try{if(!wp.destroyed)wp.reconnect();}catch(e){}},1500);});
  wp.on('error',()=>{});}
function hostStart(saved){role='host';CH={seen:-1,key:''};H.conns=new Set();H.watchers=new Set();H.guestConn=null;C.stop=true;clearTimeout(C.t);clearTimeout(C.ct);
  if(saved){Object.assign(H,{code:saved.code,wcode:saved.wcode,guestCid:saved.guestCid,game:saved.game});H.turnStart=Date.now()-(saved.elapsed||0);}
  if(!H.wcode)H.wcode=newCode(8);
  H.peerId=PID(H.code);const g0=H.game;if(!g0.ready)g0.ready=[false,false];if(g0.started===undefined)g0.started=!!(g0.running||g0.moves.length);Object.assign(g0,GAME.rules(g0));if(!Array.isArray(g0.chat))g0.chat=[];
  if(!g0.th){const hs=g0.first==='host'?0:1;g0.th=[null,null];g0.th[hs]=hh(MYID);g0.th[1-hs]=H.guestCid?hh(H.guestCid):null;}
  mySeat=g0.th.indexOf(hh(MYID));if(mySeat<0)mySeat=g0.first==='host'?0:1;
  setHash('host-'+H.code);status(t('st_open'));showGame();
  const me=newPeer(H.peerId);peer=me;
  me.on('open',()=>{if(peer!==me)return;fillCodes();hostBroadcast();hostWatchPeer();});
  me.on('call',c=>{if(peer===me)voiceIncoming(c);else{try{c.close();}catch(e){}}});
  me.on('connection',conn=>{if(peer!==me){try{conn.close();}catch(e){}return;}conn.on('data',d=>{if(peer===me)hostOnData(conn,d);});conn.on('close',()=>{if(peer===me)hostDrop(conn);});conn.on('error',()=>{if(peer===me)hostDrop(conn);});});
  me.on('disconnected',()=>{if(peer!==me)return;status(t('st_lostMm'));setTimeout(()=>{try{if(!me.destroyed)me.reconnect();}catch(e){}},1500);});
  me.on('error',e=>{if(peer!==me)return;
    if(e.type==='unavailable-id'){try{me.destroy();}catch(_){}wpeerStop();becomeClient();}
    else if(e.type==='network'||e.type==='server-error'||e.type==='socket-error')status(t('st_noMm'));});}
function becomeClient(){if(V.st!=='off')voiceStop('',false);const pub={...hostPublic(),myHold:myHoldOf(mySeat)},code=H.code,seat=mySeat,nm=H.game.names[seat]||nickGet()||t('p1');role=null;
  if(pub.running&&!pub.result){const r=replay(pub,pub.moves,pub.result);if(!r.over)pub.clock[r.st.turn]=Math.max(0,pub.clock[r.st.turn]-pub.elapsed);}
  clientStart(code,nm,false);role='guest';mySeat=seat;view={...pub,running:false,elapsed:0,paused:pub.started&&!pub.result,recvAt:Date.now()};C.lostSince=Date.now();renderGame();}
function becomeHost(){if(!view)return;if(V.st!=='off')voiceStop('',false);if(C.pending){pendClear();delete view.runSeat;}LS.del(K('p2p-guest'));C.stop=true;clearTimeout(C.t);clearTimeout(C.ct);const old=peer;peer=null;try{old&&old.destroy();}catch(e){}
  const rem=remaining(),v=view;
  H.code=C.code;H.wcode=v.wcode||newCode(8);H.guestCid=null;H.game={size:v.size,...GAME.rules(v),hold:v.myHold&&!v.moves.length?(mySeat===0?[v.myHold,null]:[null,v.myHold]):null,tc:v.tc||null,first:v.first,names:v.names.slice(),moves:v.moves.slice(),clock:rem,running:!!v.started,result:v.result,started:!!v.started,
    ready:(v.ready||[false,false]).slice(),th:(v.th||[null,null]).slice(),paused:!!v.started&&!v.result,ver:v.ver||0,match:v.match?{...v.match}:null,chat:Array.isArray(v.chat)?v.chat.slice():[]};
  if(H.game.th.indexOf(hh(MYID))<0)H.game.th[mySeat]=hh(MYID);
  H.turnStart=Date.now();hostStart(null);}
function hostDrop(conn){H.conns.delete(conn);H.watchers.delete(conn);if(H.guestConn===conn){H.guestConn=null;if(V.st!=='off')voiceStop(t('vEnd'),false);}hostBroadcast();}
function hostOnData(conn,d){if(!d||typeof d!=='object')return;conn.lastSeen=Date.now();if(d.t==='ping')return;const g=H.game;
  if(d.t==='hello'){if(conn.watchOnly)d={...d,role:'watch'};
    const th=hh(d.cid);let s=d.role==='play'?g.th.indexOf(th):-1;const known=s>=0;   // known: this player already had the seat (they come back)
    if(d.role==='play'&&s<0){s=g.th[1-mySeat]?-1:1-mySeat;}
    if(d.role==='play'&&s>=0&&s!==mySeat){
      if(H.guestConn&&H.guestConn!==conn){try{H.guestConn.close();}catch(e){}}
      g.th[s]=th;H.guestCid=d.cid;H.guestConn=conn;conn.seat=s;H.conns.add(conn);if(d.name)g.names[s]=String(d.name).slice(0,24);
      const o=d.s;if(o&&typeof o==='object'&&o.size===g.size&&sameRules(o,g)&&Array.isArray(o.moves)&&o.moves.length>g.moves.length&&g.moves.every((x,k)=>o.moves[k]===x)){
        g.moves=o.moves.slice();g.clock=o.clock.slice();g.result=o.result||null;g.started=!!o.started;g.running=!!o.started;g.paused=true;H.turnStart=Date.now();}
      // a move the guest validated in a simultaneous phase that this host does not have (the host took over, or reloaded without it)
      else if(o&&typeof o==='object'&&typeof o.myHold==='string'&&!g.moves.length&&simMode(o)===simMode(g))hostHold(s,o.myHold);
      if(!known){conn.jpend=true;if(!d.ask)hostJoinLog(conn);}
      conn.send({t:'welcome',role:'guest',seat:s,known});hostBroadcast();return;}
    if(d.role==='play'){conn.send({t:'reject',why:'t_refused'});setTimeout(()=>{try{conn.close();}catch(e){}},800);return;}
    conn.wname=nmClean(d.name);if(conn.wname){conn.wlog=true;hostLog('lg_watch',{n:conn.wname},true);}H.conns.add(conn);H.watchers.add(conn);conn.send({t:'welcome',role:'watch',seat:-1});hostBroadcast();return;}
  // a name chosen once connected (the frame over the board): a spectator's (empty: anonymous), the guest's
  if(d.t==='wname'){if(H.watchers.has(conn)){conn.wname=nmClean(d.name);if(conn.wname&&!conn.wlog){conn.wlog=true;hostLog('lg_watch',{n:conn.wname},true);}hostBroadcast();}return;}
  if(d.t==='chat'){if(conn===H.guestConn&&conn.seat>=0)hostChat(g.names[conn.seat],false,d.m);else if(H.watchers.has(conn)&&conn.wname)hostChat(conn.wname,true,d.m);return;}
  if(conn!==H.guestConn)return;
  if(d.t==='name'){const v=nmClean(d.name);if(v&&conn.seat>=0){g.names[conn.seat]=v;hostJoinLog(conn);hostBroadcast();}return;}
  const s=conn.seat;
  if(d.t==='move')hostMove(s,d.n,d.code,conn);
  if(d.t==='start')hostReady(s);
  if(d.t==='resign'&&!g.result&&g.started){g.result={winner:1-s,reason:'resign'};hostBroadcast();}
  if(d.t==='rematch')rematchOp(s,d.op);
  if(d.t==='draw'&&GAME.drawOffer&&drawOp(g,s,d.op))hostBroadcast();
  if(d.t==='mchoose')mChoose(s,d.c);
  if(d.t==='voice')voiceOnMsg(d.op);}
function hostMove(s,n,code,conn){const g=H.game,pubFor=()=>({...hostPublic(),myHold:myHoldOf(s)});if(conn&&n===g.moves.length-1&&g.moves[n]===code){conn.send({t:'state',game:pubFor()});return false;}
  // a simultaneous move sent again once both are revealed: its place is the seat's index
  if(conn&&simMode(g)&&n===0&&g.moves.length>=2&&g.moves[s]===code){conn.send({t:'state',game:pubFor()});return false;}
  if(g.result||!g.started||g.paused){conn&&conn.send({t:'nack'});return false;}
  const r=replay(g,g.moves,g.result);
  if(simHold(g,r)){if(n!==0||!H.guestConn&&s!==mySeat){conn&&conn.send({t:'nack'});return false;}
    const h=hostHold(s,code);if(h==='bad'){conn&&conn.send({t:'nack'});return false;}
    if(h==='dup'){conn&&conn.send({t:'state',game:pubFor()});return false;}
    hostBroadcast(true);return true;}if(r.over||r.st.turn!==s||n!==g.moves.length||!H.guestConn&&s!==mySeat){conn&&conn.send({t:'nack'});return false;}
  const cc=GAME.legal(r.st,code,g);if(!cc){conn&&conn.send({t:'nack'});return false;}
  const now=Date.now();
  if(g.running&&g.tc){g.clock[s]-=now-H.turnStart;if(g.clock[s]<=0){g.clock[s]=0;g.result={winner:1-s,reason:'time'};hostBroadcast();return false;}g.clock[s]+=g.tc.inc;}
  g.moves.push(cc);g.draw=null;g.running=true;H.turnStart=now;hostBroadcast(true);return true;}
let saveTick=0;
// Chat: the host keeps every message in H.game.chat ({n: author, w: from a spectator, m: text, v: shown to the players}).
// Players' messages go to everyone at once; a spectator's reaches the players only once the game is over (chatReveal,
// at each broadcast): the host filters (hostPublic), a player's page never receives them before. A spectator without a
// name cannot write (the host ignores it too).
const CHATMAX=100,chatClean=v=>String(v||'').replace(/\s+/g,' ').trim().slice(0,200);
// The chat also carries the game's log, written by the host ({k: i18n key, a: its values}, shown to everyone, in each
// one's language): a player or a named spectator joins, the game starts, a rematch, the result.
function hostLog(k,a,quiet){const g=H.game;if(!g.chat)g.chat=[];g.chat.push({k,a:a||{}});if(g.chat.length>CHATMAX)g.chat.splice(0,g.chat.length-CHATMAX);if(!quiet)hostBroadcast();}
function hostJoinLog(conn){if(conn&&conn.jpend&&conn.seat>=0){conn.jpend=false;hostLog('lg_join',{n:H.game.names[conn.seat]},true);}}
// A Mochalunt table (its chat goes on from the previous one) also shows them before its game starts.
function chatReveal(){const g=H.game;if(!g||!g.chat)return;const o=replay(g,g.moves,g.result).over;
  if(!o){g.endLog=false;if(!(g.match&&!g.started))return;}
  else if(!g.endLog){g.endLog=true;hostLog(o.w<0?'draw':'wins',o.w<0?{why:o.why}:{n:g.names[o.w]||'',why:o.why},true);}
  for(const x of g.chat)if(x.w)x.v=1;}
function hostChat(n,w,m){const g=H.game;m=chatClean(m);n=nmClean(n);if(!m||!n)return;if(!g.chat)g.chat=[];let c;if(!w){c=Math.max(0,g.names.indexOf(n));if(g.match&&g.match.seats)c=g.match.seats[c]==='c'?0:1;}else{const o=g.chat.find(x=>x.w&&x.n===n&&x.c!=null);c=o?o.c:2+new Set(g.chat.filter(x=>x.w&&x.m).map(x=>x.n)).size%6;}g.chat.push({n,w:w?1:0,m,c});
  if(g.chat.length>CHATMAX)g.chat.splice(0,g.chat.length-CHATMAX);hostBroadcast();}
function chatSend(){const i=$('chatIn'),m=chatClean(i.value);if(!m||!view)return;
  if(role==='host')hostChat(view.names[mySeat]||nickGet()||t('p1'),false,m);
  else if(C.conn&&C.conn.open&&(role==='guest'||(role==='watch'&&C.name)))C.conn.send({t:'chat',m});else return;
  i.value='';CH.seen=-2;}   // one's own message: seen
let CH={seen:-1,key:''};
// Voice chat, between the two players only (never the spectators): one proposes ({t:'voice',op:'ask'}), the other accepts
// or declines; the microphone is asked only once accepted. The audio goes straight between the two pages (PeerJS media
// call, the guest calls the host); the data link carries the offer, the answer and the hang-up. Mute: the track is
// disabled; the voice's volume is its own <audio> element, apart from the game's sounds. No relay server (TURN): on some
// networks the call cannot connect, said after 15 s.
let V={st:'off',note:''};   // st: off | out (offered) | in (offered to me) | conn (accepted, connecting) | on
const vNm=()=>(view&&view.names[1-mySeat])||t(mySeat===0?'p2':'p1');
const voiceOk=()=>!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia)&&typeof Peer!=='undefined';
const voiceNet=()=>(role==='host'&&!!H.guestConn&&H.guestConn.open)||(role==='guest'&&!!C.conn&&C.conn.open);
function voiceSend(op){try{if(role==='host'&&H.guestConn)H.guestConn.send({t:'voice',op});else if(role==='guest'&&C.conn)C.conn.send({t:'voice',op});}catch(e){}}
function voiceUi(){if(view&&!$('game').hidden)renderGame();}
function voiceStop(note,tell){const v=V;if(v.st==='on')mVoiceSet(true);if(tell&&v.st!=='off')voiceSend('bye');clearTimeout(v.to);
  try{v.call&&v.call.close();}catch(e){}try{v.stream&&v.stream.getTracks().forEach(k=>k.stop());}catch(e){}
  if(v.audio){try{v.audio.srcObject=null;v.audio.remove();}catch(e){}}
  V={st:'off',note:note||''};voiceUi();}
function voiceMic(){return navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}}).then(st=>{
  if(V.st!=='conn'){st.getTracks().forEach(k=>k.stop());return null;}V.stream=st;V.muted=false;return st;});}
function voiceConnect(){clearTimeout(V.to);V.to=setTimeout(()=>{if(V.st==='conn')voiceStop(t('vFail'),true);},15000);
  if(role==='guest'&&peer&&V.stream){const c=peer.call(C.host,V.stream);voiceCall(c);}}
function voiceCall(c){V.call=c;c.on('stream',rs=>{if(V.call!==c)return;clearTimeout(V.to);
    if(!V.audio){const a=document.createElement('audio');a.autoplay=true;a.setAttribute('playsinline','');a.hidden=true;document.body.appendChild(a);V.audio=a;}
    V.audio.srcObject=rs;V.audio.volume=voiceVol()/100;const pl=V.audio.play&&V.audio.play();
    if(pl&&pl.catch)pl.catch(()=>{const f=()=>{if(V.audio&&V.audio.paused)V.audio.play().catch(()=>{});};document.addEventListener('pointerdown',f,{once:true});document.addEventListener('keydown',f,{once:true});});   // autoplay refused (a call started by itself): at the first touch
    V.st='on';mVoiceSet(true);voiceUi();});
  c.on('close',()=>{if(V.call===c)voiceStop(t('vEnd'),false);});c.on('error',()=>{if(V.call===c)voiceStop(t('vFail'),true);});}
function voiceIncoming(c){if(role!=='host'||V.st!=='conn'||!V.stream||!H.guestConn||c.peer!==H.guestConn.peer){try{c.close();}catch(e){}return;}
  c.answer(V.stream);voiceCall(c);}
function voiceAsk(){if(V.st!=='off'||!voiceNet())return;V={st:'out',note:''};voiceSend('ask');voiceUi();}
function voiceAnswer(yes){if(V.st!=='in')return;if(!yes){mVoiceSet(false);voiceSend('no');V={st:'off',note:''};voiceUi();return;}
  V.st='conn';voiceUi();voiceMic().then(st=>{if(!st)return;voiceSend('yes');voiceConnect();},()=>voiceStop(t('vMic'),true));}
function voiceOnMsg(op){
  if(op==='ask'||op==='reask'){if(V.st==='out'&&role==='guest')V={st:'off',note:''};   // both offered at once: the host's offer stands
    if(V.st!=='off')return;V={st:'in',note:''};if(op==='reask'&&mVoiceFresh()){voiceAnswer(true);return;}tone(520,.12,.05);voiceUi();}
  else if(op==='cancel'&&V.st==='in'){V={st:'off',note:''};voiceUi();}
  else if(op==='no'&&V.st==='out'){mVoiceSet(false);V={st:'off',note:t('vNo',{n:vNm()})};voiceUi();}
  else if(op==='yes'&&V.st==='out'){V.st='conn';voiceUi();voiceMic().then(st=>{if(!st)return;if(role==='host')voiceSend('go');voiceConnect();},()=>voiceStop(t('vMic'),true));}
  else if(op==='go'&&V.st==='conn'&&V.stream)voiceConnect();
  else if(op==='bye'){if(V.st!=='off')voiceStop(t('vEnd'),false);mVoiceSet(false);}}
const voiceVol=()=>{const v=LS.get('games-voicevol',80);return typeof v==='number'?v:80;};
function voiceMute(){if(!V.stream)return;V.muted=!V.muted;V.stream.getAudioTracks().forEach(k=>{k.enabled=!V.muted;});voiceUi();}
function voiceRender(){const b=$('voiceBox'),pl=mySeat>=0&&(role==='host'||role==='guest')&&voiceOk();b.hidden=!pl;if(!pl)return;
  const o=vNm(),st=V.st,there=!!(view&&view.names[1-mySeat])&&(role==='guest'||!!view.guestOn);
  if(st==='off'&&V.note&&!there)V.note='';
  $('voiceAsk').hidden=st!=='off';$('voiceAsk').disabled=!there;
  $('voiceTxt').hidden=!(st==='out'||st==='in'||st==='conn'||st==='on'||V.note);
  $('voiceTxt').textContent=st==='out'?t('vOut',{n:o}):st==='in'?t('vInvite',{n:o}):st==='conn'?t('vConn'):st==='on'?t('vOn',{n:o}):V.note;
  $('voiceCancel').hidden=st!=='out';$('voiceIn').hidden=st!=='in';
  $('voiceCtl').hidden=!(st==='conn'||st==='on');$('voiceMute').disabled=!V.stream;
  $('voiceMute').textContent=V.muted?'🔇':'🎙';$('voiceMute').title=t(V.muted?'vUnmute':'vMute');$('voiceMute').setAttribute('aria-label',$('voiceMute').title);
  $('voiceMute').classList.toggle('on',!!V.muted);$('voiceVol').setAttribute('aria-label',t('vVol'));$('voiceVol').title=t('vVol');}
const chatShown=()=>{const b=$('chatBox'),R=document.documentElement;if(b.hidden)return false;if(isWide())return b.open;
  return R.classList.contains('chatup')||R.classList.contains('pchat')&&!!b.dataset.cm&&b.dataset.cm!=='none';};
const chatMsgs=()=>view&&Array.isArray(view.chat)?view.chat.filter(x=>x.m).length:0;
const chatUnread=()=>CH.seen<0?0:Math.max(0,chatMsgs()-CH.seen);
const CHATHUES=[210,12,140,275,35,330,180,95];
const chatHue=n=>{let h=0;for(const c of String(n))h=(h*31+c.charCodeAt(0))>>>0;return CHATHUES[h%CHATHUES.length];};
function chatRender(){const b=$('chatBox'),net=role==='host'||role==='guest'||role==='watch';b.hidden=!net||!view;if(b.hidden){chatUp(false);chatBtnSync();return;}
  const L=Array.isArray(view.chat)?view.chat:[],ul=$('chatList'),anonW=role==='watch'&&!C.name,r=replay(view,view.moves,view.result);
  if(CH.seen<0||chatShown())CH.seen=chatMsgs();
  const u=chatUnread();$('chatSum').textContent=u?t('chatN',{n:u}):t('chat');
  $('chatForm').hidden=anonW;$('chatName').hidden=!anonW;$('chatIn').placeholder=t('chatPh');
  const op=r.over||(view.match&&!view.started),h=$('chatHint'),hk=op?'':role==='watch'?'chatHintW':'chatHintP';h.hidden=!hk;if(hk)h.textContent=t(hk);
  chatBtnSync();const key=L.length+'|'+(L.length?JSON.stringify(L[L.length-1]):'')+'|'+lang;if(CH.key===key)return;CH.key=key;ul.textContent='';
  if(!L.length){const li=document.createElement('li');li.className='hint';li.textContent=t('chatEmpty');ul.appendChild(li);}
  for(const x of L){const li=document.createElement('li');
    if(x.k){const a={...(x.a||{})};if(a.why)a.why=t(a.why);li.className='log';li.textContent=t(x.k,a);ul.appendChild(li);continue;}
    const a=document.createElement('b');a.className='nm';a.style.setProperty('--nh',x.c!=null?CHATHUES[x.c%CHATHUES.length]:chatHue(x.n));a.textContent=x.n;li.appendChild(a);
    if(x.w){const o=document.createElement('span');o.className='obs';o.textContent=' ('+t('chatW')+')';li.appendChild(o);li.className='w';}
    li.append(lang==='fr'?'\u00a0: ':': ',x.m);ul.appendChild(li);}
  ul.scrollTop=ul.scrollHeight;}
const nmClean=v=>String(v||'').replace(/\s+/g,' ').trim().slice(0,24);

// --- guest / spectator ---
let C={};   // {code,cid,name,conn,retry}
function clientStart(raw,nm,asWatch){const code=cleanCode(raw);if(code.length<4){$('joinErr').textContent=t('codeLen');return;}
  clearTimeout(C.t);clearTimeout(C.ct);CH={seen:-1,key:''};C={hold:null,code,host:PID(code),play:!asWatch,name:nm,cid:MYID,retry:0,lostSince:0};
  $('joinErr').textContent='';setHash((asWatch?'watch-':'join-')+code);
  role='watch';mySeat=-1;view=null;showGame();status(t('st_conn'));
  const sv=LS.get(K('p2p-guest'),null);   // last position seen as a guest: shown at once, and used to take over if the host does not come back
  if(!asWatch&&sv&&sv.code===code&&sv.view&&!sv.view.result){role='guest';mySeat=sv.seat;view={...sv.view,recvAt:Date.now()};C.lostSince=Date.now();renderGame();}
  {const pd=LS.get(K('p2p-pending'),null);if(!asWatch&&pd&&pd.code===code&&view&&view.moves.length===pd.n){C.pending={n:pd.n,code:pd.mv,at:Date.now(),sent:0};pendView();sending=true;renderGame();}}
  const me=newPeer();peer=me;const c0=C;me.on('open',()=>{if(peer===me&&C===c0)clientConnect();});
  me.on('error',e=>{if(peer!==me)return;if(e.type==='peer-unavailable'){clientLost();if(!view)status(t('st_noTable'));}
    else if(e.type==='network'||e.type==='server-error'||e.type==='socket-error'){status(t('st_noMm'));clientRetry();}});
  me.on('disconnected',()=>setTimeout(()=>{try{if(!me.destroyed)me.reconnect();}catch(e){}},1500));}
function clientConnect(){if(C.stop||!peer||!peer.open)return;const conn=peer.connect(C.host,{reliable:true});C.conn=conn;clearTimeout(C.ct);
  C.ct=setTimeout(()=>{if(C.conn===conn&&!conn.open)clientLost();},7000);
  conn.on('open',()=>{clearTimeout(C.ct);C.retry=0;conn.send({t:'hello',role:C.play?'play':'watch',cid:C.cid,name:C.name,ask:!!C.ask,s:mySeat>=0&&view?(C.pending&&C.pending.base||view):null});C.lastSeen=Date.now();});
  conn.on('data',d=>{if(C.conn===conn)clientOnData(d);});
  conn.on('close',()=>{if(C.conn===conn&&!C.stop)clientLost();});}
function clientLost(){if(C.stop)return;if(V.st!=='off')voiceStop(t('vEnd'),false);C.lostSince=C.lostSince||Date.now();sending=false;if(C.pending)sending=true;
  if(view&&!view.paused&&view.started&&!view.result){const r=replay(view,view.moves,view.result);
    if(!r.over&&r.st.turn!==mySeat){view.clock=remaining();view.running=false;view.elapsed=0;view.paused=true;view.recvAt=Date.now();}renderGame();}
  clientRetry();}
function clientRetry(){if(C.stop||C.t)return;C.t=setTimeout(()=>{C.t=null;if(C.stop)return;
  if(role==='guest'&&mySeat>=0&&view&&C.lostSince&&Date.now()-C.lostSince>8000){becomeHost();return;}
  if(peer&&peer.open)clientConnect();else{if(peer&&!peer.destroyed){try{peer.reconnect();}catch(e){}}clientLost();}},3500);}
function clientOnData(d){if(!d||typeof d!=='object')return;C.lastSeen=Date.now();if(d.t==='ping')return;
  if(d.t==='welcome'){role=d.role;mySeat=d.seat;if(d.note)status(d.note);if(C.ask&&role==='guest'){C.ask=false;if(!d.known)nameOv('play');}}
  else if(d.t==='voice'){if(role==='guest')voiceOnMsg(d.op);}
  else if(d.t==='reject'){C.stop=true;C.conn=null;clearTimeout(C.t);try{peer.destroy();}catch(e){}showSetup(t(d.why));$('jCode').value=C.code;}
  else if(d.t==='state'){sending=false;C.lostSince=0;if(C.pending&&d.game.moves.length>C.pending.n)pendClear();
    if(C.hold&&(d.game.myHold===C.hold.code||d.game.moves.length))C.hold=null;
    showState(C.hold&&!d.game.myHold?{...d.game,myHold:C.hold.code}:d.game);if(C.pending){pendView();sending=true;renderGame();}mVoiceAuto();}
  else if(d.t==='nack'){sending=false;if(C.hold){C.hold=null;if(view)view.myHold=null;resetUi();}if(C.pending){if(C.pending.base)view=C.pending.base;pendClear();}C.nackAt=Date.now();setTimeout(()=>{if(view)renderGame();},5000);status(t('st_nack'));renderGame();}}

// ---------- game view ----------
function showGame(){$('setup').hidden=true;$('game').hidden=false;$('status').hidden=true;document.documentElement.classList.add('ingame');}
function showSetup(msg){if(V.st!=='off')voiceStop('',true);V.note='';nameOv('');role=null;view=null;mySeat=-1;setHash('');$('game').hidden=true;sheet(false);document.documentElement.classList.remove('ingame');$('setup').hidden=false;$('joinErr').textContent=msg||'';status(msg||'');}
function showState(g){const prevLen=view?view.moves.length:-1,prevRes=view?JSON.stringify(view.result):'',prevSeat=view?view.mySeatSeen:-2;
  view={...g,recvAt:Date.now(),mySeatSeen:mySeat};
  guestSave();
  if(prevLen!==g.moves.length||prevRes!==JSON.stringify(g.result)||prevSeat!==mySeat)resetUi();
  renderGame();}
// The guest's copy of the game (every state received, and every second while the clocks run): shown at once on return,
// and used to take over if the host does not come back
function guestSave(){if(role!=='guest'||mySeat<0||!view)return;const g=view;
  if(g.result&&!g.match)LS.del(K('p2p-guest'));else LS.set(K('p2p-guest'),{code:C.code,seat:mySeat,name:C.name,savedAt:Date.now(),view:{...view,running:false,elapsed:0,clock:remaining(),paused:!!view.started,guestOn:false,watchers:0,wnames:[]}});}
function resetUi(){ui=GAME.newUi();}
// Simultaneous phase between two devices: both players choose at once (the moves list is still empty)
const netSim=r=>(role==='host'||role==='guest'||role==='watch')&&simHold(view,r);
// The position as the player to act sees it: in a simultaneous network phase, with the turn set to my seat
const meSt=r=>netSim(r)&&mySeat>=0?{...r.st,turn:mySeat}:r.st;
function remaining(){const c=view.clock.slice();if(view.tc&&view.running&&!view.result){const r=replay(view,view.moves,view.result);if(!r.over&&!simHold(view,r))c[view.runSeat??r.st.turn]-=view.elapsed+(Date.now()-view.recvAt);}return c;}
const fmt=ms=>{ms=Math.max(0,ms);const s=Math.ceil(ms/1000),m=Math.floor(s/60);return m+':'+String(s%60).padStart(2,'0');};
function isMyTurn(r){const ready=!!view.started&&!view.paused;return mySeat>=0&&!r.over&&(netSim(r)?!view.myHold:r.st.turn===mySeat)&&!sending&&!!view.names[1-mySeat]&&ready;}

// Navigation through the moves: for everyone once the game is over, for spectators at any time.
// navAt=null follows the game live; otherwise the board shows the position after navAt moves.
let navAt=null,navKey=null,navVal=null;
const canNav=r=>!!view&&!ana()&&(!!r.over||(mySeat<0&&role==='watch')||role==='file'||role==='test');
function navPos(k){const key=view.moves.slice(0,k).join(',');if(key!==navKey){const keep=[memoKey,memoVal];navVal=replay(view,view.moves.slice(0,k),null);navKey=key;[memoKey,memoVal]=keep;}return navVal;}
function navGo(k){const n=view.moves.length;navAt=k===null||k>=n?null:Math.max(0,k);resetUi();renderGame();}
// ---------- analysis: a tree of variations ----------
// In Libre play, for a loaded game, and for a game on one screen once it is over (face to face, against the computer), a
// move played from any position of the tree adds a variation there (or follows the one that has it already).
// view.tree: {c:[{m:code,c:[…]},…]}, the first child being the main line and the others in their order of creation (or
// of the SGF file); view.moves: the path to the position shown, which is always the live one here (navAt stays null);
// view.gameResult: the game's own result (resignation, time, agreement), holding only at the end of the main line.
// The line shown is that path, then the first child at each branching.
const ana=()=>!!view&&(role==='test'||role==='file'||((role==='local'||role==='ai')&&!!view.tree));
const meS=()=>role==='ai'&&view&&view.tree?view.names.indexOf('me'):mySeat;   // against the computer: the player, whoever moves in the analysis
function anaInit(){const root={c:[]};let n=root;for(const m of view.moves){const x={m,c:[]};n.c.push(x);n=x;}view.tree=root;view.gameResult=view.result||null;}
function anaNode(p){let n=view.tree;for(const m of p){n=n&&n.c.find(x=>x.m===m);}return n||null;}
function anaLine(){const p=view.moves.slice();let n=anaNode(p);while(n&&n.c.length){n=n.c[0];p.push(n.m);}return p;}
function anaMain(p){let n=view.tree;for(const m of p){if(!n.c.length||n.c[0].m!==m)return false;n=n.c[0];}return !n.c.length;}
function anaSet(p){if(busy==='hint')stopAI();view.moves=p;view.result=anaMain(p)?view.gameResult||null:null;view.draw=null;hintMv=null;
  const r=GAME.replay(view,p);mySeat=r.st.turn;resetUi();renderGame();}
function anaGo(k){const L=anaLine();anaSet(L.slice(0,Math.max(0,Math.min(k,L.length))));}
const anaHasAlt=(L,j)=>j>=1&&anaNode(L.slice(0,j-1)).c.length>1;   // the j-th move of the line has variations
// the previous / next branching on the line: a move with variations (or the start / the end)
function anaBr(dir){const L=anaLine(),k=view.moves.length;
  if(dir<0){for(let j=k-1;j>=1;j--)if(anaHasAlt(L,j))return anaGo(j);return anaGo(0);}
  for(let j=k+1;j<=L.length;j++)if(anaHasAlt(L,j))return anaGo(j);anaGo(L.length);}
// the other variations of the move shown (up: the previous one, down: the next one)
function anaSib(d){const p=view.moves,k=p.length;if(!k)return;const par=anaNode(p.slice(0,k-1)),i=par.c.findIndex(x=>x.m===p[k-1])+d;
  if(i<0||i>=par.c.length)return;anaSet(p.slice(0,k-1).concat(par.c[i].m));}
// for the boards: the codes of the other variations of the move shown, and the switch to one of them
function anaAlts(){if(!ana()||!view.moves.length)return [];const p=view.moves,par=anaNode(p.slice(0,-1));return par?par.c.map(x=>x.m).filter(m=>m!==p[p.length-1]):[];}
function anaAltGo(code){if(!ana()||!view.moves.length)return;anaSet(view.moves.slice(0,-1).concat(code));}
function anaPlay(code){const n=anaNode(view.moves);if(!n)return;if(!n.c.some(x=>x.m===code))n.c.push({m:code,c:[]});anaSet(view.moves.concat(code));}
// The main line (the first child at each branching)
function anaMainLine(){const p=[];let n=view.tree;while(n.c.length){n=n.c[0];p.push(n.m);}return p;}
// Players' names: on one device « Player 1/2 »; against the computer « You » / « The computer »
const seatName=s=>solo()?(role==='test'&&view.customNames&&view.names[s]||t(s===0?'p1':'p2')):role==='ai'?(s===meS()?t('you'):t('computer')):(view.names[s]||t(s===0?'p1':'p2'));

// A player's name, editable in place (nothing shows it but the text cursor): Enter or leaving the field keeps it
function nameEdit(sp,p){sp.className='nmEdit';sp.contentEditable='plaintext-only';sp.spellcheck=false;sp.title=t('editName');
  sp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();sp.blur();}if(e.key==='Escape'){sp.textContent=seatName(p);sp.blur();}};
  sp.onblur=()=>{const v=sp.textContent.replace(/\s+/g,' ').trim().slice(0,24);if(!view)return;view.names=view.names.slice();view.names[p]=v||t(p?'p2':'p1');
    if(role==='test')view.customNames=true;if(role==='test')LS.set(TK(),view);renderGame();};}
function renderGame(){if(!view)return;if(role==='ai')LS.set(AK(),{view,mySeat});else if(role==='test')LS.set(TK(),view);else if(role==='local')localSave();
  if(!view.tree&&(role==='test'||role==='file'||((role==='local'||role==='ai')&&replay(view,view.moves,view.result).over)))anaInit();   // a game on one screen, once over: analysis
  if(ana()&&!anaNode(view.moves)){let n=view.tree;for(const m of view.moves){let x=n.c.find(y=>y.m===m);if(!x){x={m,c:[]};n.c.push(x);}n=x;}}   // a path set from outside: grafted on the tree
  const r=replay(view,view.moves,view.result),A=ana();if(A){navAt=null;mySeat=r.st.turn;}
  if(!canNav(r)||navAt!==null&&navAt>=view.moves.length)navAt=null;
  const d=navAt===null?r:navPos(navAt),turn=d.st.turn;
  flip=!solo()&&role!=='file'&&meS()===1;   // on one device the board stays put: the players adapt
  const mine=navAt===null&&isMyTurn(r),ns=netSim(r),ms=meSt(r);
  const myTurnNow=mySeat>=0&&!!view.started&&!view.paused&&!r.over&&r.st.turn===mySeat;if(myTurnNow&&!lastMine&&view.moves.length)tone(660,.18,.05);lastMine=myTurnNow;
  const o=GAME.board({r,d,mine,ms});
  {const L=A?anaLine():view.moves,n=L.length,k=A?view.moves.length:navAt===null?n:navAt,on=A||canNav(r);$('nav').hidden=!on;
    for(const id of ['navBrP','navBrN','navAltU','navAltD'])if($(id))$(id).hidden=!A;
    if(on){$('navPos').textContent=t('nav_pos',{k,n});$('navFirst').disabled=$('navPrev').disabled=k===0;$('navNext').disabled=$('navLast').disabled=k>=n;
      if(A&&$('navBrP')){$('navBrP').disabled=k===0;$('navBrN').disabled=k>=n;
        const par=k?anaNode(view.moves.slice(0,k-1)):null,i=par?par.c.findIndex(x=>x.m===view.moves[k-1]):-1;
        $('navAltU').disabled=!par||i<=0;$('navAltD').disabled=!par||i<0||i>=par.c.length-1;}}}
  const nm=seatName;
  // The bar under the board: the only place for the move commands.
  // Nothing engaged: Undo last move / Hint (where the game allows them) · something engaged: Reset (drops the whole move
  // being prepared), with the game's own commands · move complete: Reset + Confirm · suggestion shown: Play this move +
  // Dismiss · waiting states: the message only.
  const prep=GAME.preparing(),RST={label:t('reset'),on:GAME.cancel};
  const undoB=canUndo()&&!A&&!busy&&undoOk(r)?{label:t('undo'),short:t('undoS'),on:doUndo}:null;
  const hintB=canHint()&&!busy&&mine&&(!GAME.hintable||GAME.hintable(o))?{label:t('hint'),on:doHint}:null;
  const idle=[undoB,hintB];
  if(r.over){const q=GAME.quietWhy&&GAME.quietWhy(r.over.why)?'Q':'';   // the game's own reasons left out (GAME.quietWhy)
    status(r.over.w<0?t('draw'+q,{why:t(r.over.why)}):r.over.w===meS()&&!solo()&&role!=='file'?t('youWin'+q,{why:t(r.over.why)}):t('wins'+q,{n:nm(r.over.w),why:t(r.over.why)}),'win',navAt===null?[undoB]:null);}
  else if(view.draw&&view.draw.st==='ask'&&navAt===null&&(role==='local'||(mySeat>=0&&view.draw.from!==mySeat)))
    status(t('drawAsk',{n:nm(view.draw.from)}),'turn',[{label:t('decline'),on:()=>drawSend('no')},{label:t('accept'),primary:true,on:()=>drawSend('yes')}]);
  else if(busy==='hint')status(t('hintBusy'),'turn',[{label:t('dismiss'),on:hintOff}]);
  else if(role==='ai'&&busy)status(t('st_aiThinking'));
  else if(role==='host'&&!view.names[1-mySeat])status(t(view.match?'m_waitOpp':'st_waitOpp'));
  else if(view.paused&&view.started)status(role==='host'?t('st_pausedHost',{n:nm(1-mySeat)}):mySeat>=0?t('st_pausedGuest'):t('st_pausedWatch'));
  else if(!view.started&&view.match&&!view.match.chosen&&MATCH){const ch=mChooser(view.match,MTK),cs=view.match.seats.indexOf(ch);status(MATCH.me===ch&&mySeat>=0?t('m_chooseYou'):t('m_choosing',{n:view.names[cs]||'…'}));}
  else if(!view.started)status(mySeat<0?t('st_waitBoth'):(view.ready&&view.ready[mySeat]?t('st_waitClick',{n:nm(1-mySeat)}):t('st_bothHere')));
  else if(mine&&hintOn())status(t('hint_move',{m:GAME.describe(hintMv,ms)}),'turn',[{label:t('hintPlay'),short:t('hintPlayS'),primary:true,on:hintPlay},{label:t('dismiss'),on:hintOff}]);
  else if(mine&&ui.pending){const [msg,ok]=GAME.pendText?GAME.pendText(ui.pending,ms):[t('pend_mv',{m:GAME.describe(ui.pending,ms)}),t('confirmMv')];
    status(msg,'turn',[...(GAME.noReset&&GAME.noReset(ui.pending)?[]:[RST]),...(GAME.pendBtns?GAME.pendBtns(ui.pending,ms):[]),{label:ok,primary:true,on:()=>{if(ui.pending)send(ui.pending);}}]);}
  else if(sending)quiet();
  else if(ns&&mySeat>=0&&view.myHold)status(t('st_simWait'));
  else if(ns&&mySeat<0)status(t('st_simWatch'));
  else if(mine)GAME.turnStatus({r,o,ms,prep,idle,undoB,RST});
  else if(navAt===null){if(!(GAME.waitStatus&&GAME.waitStatus({r,ns})))status(t('st_turn',{n:nm(r.st.turn)}));}
  else quiet();
  if(role==='guest'&&C.pending&&C.pending.shown&&!r.over)status(t('st_waitHost'));
  else if(role==='guest'&&C.nackAt&&Date.now()-C.nackAt<5000&&!r.over)status(t('st_nack'),'',mine&&prep?[RST]:null);
  if(V.st==='in'&&mySeat>=0)status(t('vInvite',{n:vNm()}),'turn',[{label:t('decline'),on:()=>voiceAnswer(false)},{label:t('accept'),primary:true,on:()=>voiceAnswer(true)}]);
  const wide=window.matchMedia(WIDE).matches&&!BAND;$('playersTop').hidden=wide;$('playersSide').hidden=!wide;
  const editing=!!document.activeElement&&document.activeElement.classList.contains('nmEdit');   // a name being typed: the cards stay
  if(!editing){$('playersTop').textContent='';$('playersSide').textContent='';}const host=wide?$('playersSide'):$('playersTop');
  if(!editing)for(const p of [0,1]){const el=document.createElement('div');el.className='player c'+p+(!r.over&&!d.over&&(ns&&navAt===null?!(view.held&&view.held[p]):turn===p)?' active':'');el.id='pl'+p;
    const h=document.createElement('div');h.className='who';h.innerHTML=`<span class="dot c${p}"></span>`;const nmx=document.createElement('span');nmx.textContent=nm(p);h.appendChild(nmx);if(V.st==='on'&&p!==mySeat){const vi=document.createElement('span');vi.className='vmic';vi.textContent='🎙';vi.title=t('vOn',{n:nm(p)});h.appendChild(vi);}
    if(role==='test'||role==='file')nameEdit(nmx,p);
    const ck=document.createElement('div');ck.className='clock';ck.id='clock'+p;if(!view.tc)ck.hidden=true;
    el.append(h,ck);if(GAME.playerCard)GAME.playerCard(el,p,d);host.appendChild(el);}
  if(BAND)requestAnimationFrame(fitCards);
  if(BAND==='haut'){if(bandOn()){if(bandMsg.parentNode!==host||bandMsg.nextElementSibling)host.appendChild(bandMsg);}else bandMsg.remove();bandSync();}
  tick();lockBoard();
  // side panel: settings only (level of the computer and its opinion, against the computer only: hints use GAME.hintLevel)
  // SGF export: always against the computer, in Libre play and for a loaded game; in a competitive game (face to face,
  // by link) only once it is over
  const sgfOk=role==='ai'||role==='test'||role==='file'||A||!!r.over;if($('sgfExpBox'))$('sgfExpBox').hidden=!sgfOk;
  $('myCard').hidden=!($('myCard').querySelector('#cbOn')||role==='ai'||solo()||sgfOk||(mySeat>=0&&!r.over&&view.names[1-mySeat]&&view.started));
  if($('aiBox'))$('aiBox').hidden=role!=='ai';
  $('resignBox').hidden=A||!!r.over||mySeat<0||!$('resignAsk').hidden;
  if($('drawBtn')){const dv=view.draw,pl=!A&&!r.over&&!!view.started&&mySeat>=0&&navAt===null&&(role==='ai'||role==='local'||((role==='host'||role==='guest')&&!!view.names[1-mySeat]));
    const myAsk=!!dv&&dv.st==='ask'&&dv.from===mySeat&&role!=='local';
    $('drawBtn').hidden=!pl||(!!dv&&!myAsk);$('drawBtn').textContent=t(myAsk?'drawCancel':'drawOffer');
    const note=!pl||!dv?'':myAsk?t('drawWait',{n:nm(1-mySeat)}):dv.st==='no'&&(role==='local'||dv.from===mySeat)?t('drawNo',{n:nm(1-dv.from)}):'';
    $('drawNote').textContent=note;$('drawNote').hidden=!note;}
  if(role==='ai'){$('aiInfo').textContent=aiInfo?t(aiInfo.k,{d:aiInfo.d}):'';$('aiInfo').hidden=!aiInfo;}   // no empty line under the level
  const showStart=mySeat>=0&&!r.over&&!view.started&&!!view.names[1-mySeat]&&!(view.match&&!view.match.chosen);$('startCard').hidden=!showStart;
  if(view.match){mSync(r);mRender(r);}else if($('mCard'))$('mCard').hidden=true;
  if(showStart){const rd=!!(view.ready&&view.ready[mySeat]);$('startBtn').disabled=rd;$('startBtn').textContent=rd?t('waitingOpp'):t('startBtn');
    $('startTxt').textContent=(view.ready&&view.ready[1-mySeat]?t('ready',{n:nm(1-mySeat)}):'')+(view.tc?t('clocksStart'):'');}
  {const ib=$('inviteBox'),waiting=mySeat>=0&&(!view.names[1-mySeat]||!view.started),wC=role==='watch'&&!!C.code&&C.code.length===8;
    // always there in a network game, folded once it has started: a match gives its own pages' links, a spectator only the spectators' link
    const invOn=!(role==='ai'||solo()||role==='file'||(view.match?MTW==='v':!(role==='host'||(mySeat>=0&&C.code)||wC))),rcOn=!(role==='ai'||solo()||!(mySeat>=0&&view.started));ib.hidden=!invOn&&!rcOn;$('invPart').hidden=!invOn;$('rcCard').hidden=!rcOn;{const k=!invOn?'resumeCode':waiting?'invite':'codes',sm=$('inviteSum');if(sm.dataset.i18n!==k||sm.textContent!==t(k)){sm.dataset.i18n=k;sm.textContent=t(k);}}
    if(invOn){if(view.match)fillMatch();else if(role==='watch')fillWatch(C.code);else if(role!=='host'&&C.code)fillCodes(C.code,true);}
    if(waiting!==ib.classList.contains('prominent')){ib.classList.toggle('prominent',waiting);ib.open=waiting;}
    // waiting: open at the top of the column; once folded, below the commands
    if(waiting){const sc=$('sideScroll');if(sc){if(sc.firstElementChild!==ib)sc.prepend(ib);}else if(ib.previousElementSibling!==$('playersSide'))$('playersSide').after(ib);}else if(ib.nextElementSibling!==$('movesBox'))$('movesBox').before(ib);}
  {const wl=$('watchLine'),net=role==='host'||role==='guest'||role==='watch';
    if(net){const ws=Array.isArray(view.wnames)?view.wnames:[],n=view.watchers||0;
      const items=n?ws.map(x=>x||t('anon')).sort((a,b)=>a.localeCompare(b)):[];
      const txt=!n?t('noSpect'):t('watchersT',{n})+(lang==='fr'?'\u00a0: ':': ')+items.join(', ');if(wl.textContent!==txt)wl.textContent=txt;}}
  chatRender();voiceRender();chatFit();chatMode();
  $('endCard').hidden=!r.over&&role!=='file'&&!(A&&(role==='local'||role==='ai'));   // the analysis of a game over keeps the way to a new one   // a game read from a file: always the way back home
  {const pl=mySeat>=0&&(role==='host'||role==='guest'||role==='ai'||solo()),rm=role==='ai'||solo()?null:view.rematch,opp=view.names[1-mySeat]||t(mySeat?'p1':'p2');
    const asked=!!rm&&rm.st==='ask',mineRm=!!rm&&rm.from===mySeat,txt=asked?(mineRm?t('rm_sent'):t('rm_ask',{n:opp})):rm&&rm.st==='no'&&mineRm?t('rm_no',{n:opp}):'';
    $('rmTxt').textContent=txt;$('rmTxt').hidden=!pl||!txt;$('rmBox').hidden=!pl||asked;$('rmAsk').hidden=!pl||!asked||mineRm;$('rmWait').hidden=!pl||!asked||!mineRm;
    $('newGame').disabled=role==='host'?!view.guestOn:role==='guest'?!(C.conn&&C.conn.open):false;
    if(view.match)for(const id of ['rmTxt','rmBox','rmAsk','rmWait'])$(id).hidden=true;}   // a match: the next table instead of a rematch
  const ol=$('log');ol.textContent='';
  // analysis: the whole line (the path, then the first child at each branching); a move with variations: ◆ and their number
  const AL=A?anaLine():null,rl=A&&AL.length>view.moves.length?GAME.replay(view,AL):r;
  const nv=A||canNav(r),cur=A?view.moves.length:navAt===null?r.log.length:navAt,go=A?anaGo:navGo;
  rl.log.forEach((e,j)=>{const li=document.createElement('li');if(nv){li.className='go'+(j+1===cur?' cur':'');li.onclick=()=>go(j+1);}const a=document.createElement('span');a.className='n';a.textContent=(j+1)+'.';
    if(A){const par=anaNode(AL.slice(0,j));if(par&&par.c.length>1){const x=document.createElement('span');x.className='alt';x.textContent='◆'+par.c.length;x.title=t('altN',{n:par.c.length});a.appendChild(x);}}
    const b=document.createElement('span');b.textContent=nm(e.p);b.style.overflow='hidden';b.style.textOverflow='ellipsis';b.style.whiteSpace='nowrap';
    const c=document.createElement('span'),cn=GAME.logNode&&GAME.logNode(e,rl);if(cn)c.append(cn);else c.textContent=GAME.logText?GAME.logText(e,r):e.txt;li.append(a,b,c);const ds=GAME.logDesc&&GAME.logDesc(e);if(ds){const x=document.createElement('span');x.className='desc';x.textContent=ds;li.appendChild(x);}ol.appendChild(li);});
  const ce=ol.querySelector('.cur');if(ce&&(navAt!==null||A)){const a=ce.getBoundingClientRect(),b=ol.getBoundingClientRect();if(a.top<b.top)ol.scrollTop+=a.top-b.top;else if(a.bottom>b.bottom)ol.scrollTop+=a.bottom-b.bottom;}else ol.scrollTop=ol.scrollHeight;sheetAttn();}
// Players' cards in the side panel: wide screens, and landscape phones (board and panel side by side)
const WIDE='(min-width:821px), (orientation:landscape) and (max-height:500px)';
const BAND=document.documentElement.dataset.band||'',bandOn=()=>!!BAND&&window.matchMedia(WIDE).matches;
const bandMsg=document.createElement('div');bandMsg.className='bandmsg';bandMsg.setAttribute('aria-live','polite');
function bandSync(fresh){const n=$('notice');if(!n||BAND!=='haut')return;const on=bandOn(),m=n.querySelector('.msg');
  if(!on){if(bandMsg.firstChild&&!m){const x=bandMsg.firstChild;n.prepend(x);}bandMsg.textContent='';return;}
  bandMsg.className='bandmsg '+[...n.classList].filter(c=>c!=='notice'&&c!=='has-btns'&&c!=='rows2'&&c!=='short').join(' ');
  if(m||fresh){bandMsg.textContent='';if(m)bandMsg.appendChild(m);}n.classList.toggle('empty',!n.querySelector('.btns'));}
// Game view layout: html.ingame = a fixed-height app (no page scroll); html.wide = two columns (the WIDE query). Otherwise
// (phones, portrait) the side panel is a bottom sheet, opened with « ⋯ » (html.sheet), closed by the backdrop, Escape,
// « ⋯ » again or a swipe down.
const mqWide=window.matchMedia(WIDE),isWide=()=>mqWide.matches;
function sheet(on){const R=document.documentElement,was=R.classList.contains('sheet');on=!!on&&!isWide()&&!$('game').hidden;
  if(on)chatUp(false);
  R.classList.toggle('sheet',on);$('sheetBg').hidden=!on;$('optBtn').setAttribute('aria-expanded',on?'true':'false');if(!on)sheetAttn.auto=false;
  if(on!==was&&view&&!$('chatBox').hidden){chatRender();sheetAttn();}
  if(on&&!was){$('side').scrollTop=0;$('side').focus({preventScroll:true});}
  if(!on&&was&&$('side').contains(document.activeElement))$('optBtn').focus({preventScroll:true});}
// Wide: the action bar (#notice) goes into the side panel under the players' cards (the panel's fixed top part); otherwise
// back under the board (after the move navigation). The same element moves, nothing is duplicated.
function chatDock(w){const b=$('chatBox'),sd=$('side'),sc=$('sideScroll');if(!b||!sd||!sc)return;
  if(!b.querySelector('.chatgrip')){const g=document.createElement('div');g.className='chatgrip';g.setAttribute('aria-hidden','true');b.prepend(g);
    g.onpointerdown=e=>{if(!isWide())return;e.preventDefault();g.setPointerCapture(e.pointerId);const y0=e.clientY,h0=b.offsetHeight;
      g.onpointermove=ev=>{CH.h=h0+(y0-ev.clientY);chatFit();};
      g.onpointerup=g.onpointercancel=()=>{g.onpointermove=null;LS.set('games-chath',Math.round(CH.h));};};}
  if(w){if(b.parentNode!==sd)sd.appendChild(b);}else{const bw=document.querySelector('.boardwrap');if(bw&&b.parentNode!==bw)bw.appendChild(b);b.open=true;}chatFit();}
// the list takes what the docked frame's height leaves
function chatFit(){const b=$('chatBox'),l=$('chatList');if(!b||!l)return;
  if(!isWide())return;   // phones: chatSize
  if(!b.open||b.hidden){if(l.style.height)l.style.height='';return;}
  const sd=$('side'),mx=Math.max(180,(sd?sd.clientHeight:600)-110);if(CH.h==null)CH.h=+LS.get('games-chath',0)||Math.round((sd?sd.clientHeight:600)*.5);
  const H=CH.h=Math.min(mx,Math.max(260,CH.h)),st=l.scrollTop,end=l.scrollHeight-l.clientHeight-st<4;
  const rest=b.offsetHeight-l.offsetHeight,px=Math.max(110,H-rest)+'px';if(l.style.height!==px)l.style.height=px;l.scrollTop=end?l.scrollHeight:st;}
// cards in the band: when a name does not fit, the game's information gets more compact, step by step (classes fit1,
// fit2, drawn by the game's CSS), until the name fits or the steps run out
function fitCards(){for(const el of document.querySelectorAll('#playersTop > .player')){const w=el.querySelector('.who');if(!w)continue;
  el.classList.remove('fit1','fit2');for(const k of ['fit1','fit2']){if(w.scrollWidth<=w.clientWidth+1)break;el.classList.add(k);}}}
window.addEventListener('resize',()=>{if(BAND)fitCards();});
function layoutMode(){const w=isWide();chatDock(w);document.documentElement.classList.toggle('wide',w);if(w){sheet(false);chatUp(false);}
  const n=$('notice'),at=w&&!BAND?$('playersSide'):$('nav');document.documentElement.classList.toggle('band',w&&!!BAND);if(n&&at&&n.previousElementSibling!==at)at.after(n);}
// Not wide: the board's area gets a fixed height, so that the action bar can grow up to --barMax under it without the
// board ever changing size (the room the bar does not use stays empty). Games that lay out the board themselves
// (GAME.ownLayout) are left alone.
function lockBoard(){const ba=document.querySelector('.boardwrap .boardarea'),bw=ba&&ba.parentNode,n=$('notice'),cb=$('chatBox'),R=document.documentElement;
  if(!ba||!n||typeof getComputedStyle!=='function')return;
  if(GAME.ownLayout){chatMode();return;}   // (the page sets the board's area and html.pchat itself)
  if(isWide()||$('game').hidden||n.parentNode!==bw||!bw.clientHeight){if(ba.style.height){ba.style.height='';ba.style.flex='';}R.classList.remove('pchat');chatMode();return;}
  const gap=parseFloat(getComputedStyle(bw).rowGap)||0,max=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--barMax'))||112;
  let h=bw.clientHeight-max,k=0;
  for(const c of bw.children){if(c===ba||c===cb||c.hidden||getComputedStyle(c).display==='none'||getComputedStyle(c).position==='absolute')continue;k++;if(c!==n)h-=c.offsetHeight;}
  const hpx=Math.max(120,Math.floor(h-gap*k));let px=hpx+'px';if(ba.style.height!==px){ba.style.flex='none';ba.style.height=px;}
  // the chat (phones in portrait, a network game): the board's area shrinks to the board itself, the chat takes the rest
  // under the action bar; the board keeps exactly its size. No room for one line: « 💬 » in the header instead.
  let on=false;
  if(chatNet()&&cb&&cb.parentNode===bw){const bd=ba.querySelector('.board'),bh=bd?Math.ceil(bd.getBoundingClientRect().height):hpx;
    // GAME.chatBoard (below 1): the board may give up that share of its height to the chat (a board with few, large cells)
    const k=Math.min(1,GAME.chatBoard||1),bk=Math.floor(bh*k);
    if(bh<=hpx&&hpx-bk+max-n.offsetHeight-gap>=CHAT_LINE){on=true;px=bk+'px';if(ba.style.height!==px)ba.style.height=px;}}
  R.classList.toggle('pchat',on);chatMode();}
// Phones in portrait: the chat's look follows the room it has (data-cm: full, line or none), « 💬 » in the header when it
// is not seen; opened over the board with a touch (chatUp)
const CHAT_LINE=30,CHAT_FULL=90;
const chatNet=()=>(role==='host'||role==='guest'||role==='watch')&&!!view;
function chatMode(){const b=$('chatBox');if(!b)return;const R=document.documentElement,was=b.dataset.cm||'';
  const h=R.classList.contains('pchat')&&!b.hidden&&!isWide()?b.clientHeight:0,m=h>=CHAT_FULL?'full':h>=CHAT_LINE?'line':'none';
  chatSize();if(m===was)return;b.dataset.cm=m;chatSize();if(view&&!b.hidden&&!isWide()){chatRender();sheetAttn();}chatBtnSync();
  if(m!=='none'){const l=$('chatList');l.scrollTop=l.scrollHeight;}}
// the list takes the frame's height less the rest (the children of a <details> are not flex items, so it is measured)
function chatSize(){const b=$('chatBox'),l=$('chatList');if(!b||!l||isWide())return;const R=document.documentElement;let px='';
  if(!b.hidden&&(R.classList.contains('chatup')||R.classList.contains('pchat')&&b.dataset.cm==='full')){const cs=getComputedStyle(b);let h=b.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
    for(const c of b.children){if(c===l||c.hidden||getComputedStyle(c).display==='none')continue;const m=getComputedStyle(c);h-=c.offsetHeight+parseFloat(m.marginTop)+parseFloat(m.marginBottom);}
    px=Math.max(0,Math.floor(h))+'px';}
  if(l.style.height!==px){const end=l.scrollHeight-l.clientHeight-l.scrollTop<4;l.style.height=px;if(end)l.scrollTop=l.scrollHeight;}}
function chatBtnSync(){const c=$('chatBtn'),b=$('chatBox');if(!c||!b)return;const R=document.documentElement;
  const on=!isWide()&&!$('game').hidden&&!b.hidden&&!R.classList.contains('chatup')&&(!R.classList.contains('pchat')||b.dataset.cm==='none');
  c.hidden=!on;const u=on?chatUnread():0;c.dataset.n=u?String(u):'';c.title=u?t('chatN',{n:u}):t('chat');c.setAttribute('aria-label',c.title);}
function chatUp(on){const R=document.documentElement,b=$('chatBox');on=!!on&&!!b&&!b.hidden&&!isWide()&&!!$('game')&&!$('game').hidden;
  if(on===R.classList.contains('chatup'))return;R.classList.toggle('chatup',on);if($('chatBg'))$('chatBg').hidden=!on;
  if(on)sheet(false);chatRender();sheetAttn();chatBtnSync();chatSize();const l=$('chatList');if(l)l.scrollTop=l.scrollHeight;
  if(!on&&b.contains(document.activeElement))document.activeElement.blur();}
// Board coordinates, shared by all the games (games-coords, default on): html.nocoords when off. The game reads coordsOn
// when it draws (labels left out, a tighter viewBox) and sets --board-ar for html.nocoords.
let coordsOn=LS.get('games-coords',true)!==false;
function coordsSet(on){coordsOn=!!on;document.documentElement.classList.toggle('nocoords',!coordsOn);}
// Cards that must not be missed (invitation while waiting, Start, end of game): on phones, the sheet opens by itself when
// one appears (once; at the end of a game after a moment, so the last move is seen) and « ⋯ » carries a dot while one is shown.
// A sheet opened this way closes by itself once those cards are all gone (the game starts, a rematch begins): the board
// is what matters then. A sheet the player opened or closed is left alone (sheet() clears the flag on close).
function sheetAttn(){const ids=['inviteBox','startCard','endCard'].filter(id=>!$(id).hidden&&(id!=='inviteBox'||$(id).classList.contains('prominent')));
  $('optBtn').classList.toggle('attn',ids.length>0||V.st==='in');
  if(!$('nameOv').hidden)return;   // the name first: the sheet would cover the frame over the board
  const prev=sheetAttn.prev||[],fresh=ids.filter(id=>!prev.includes(id));sheetAttn.prev=ids;
  if(isWide())return;
  if(!ids.length&&prev.length&&sheetAttn.auto){sheet(false);return;}
  if(!fresh.length)return;sheetAttn.auto=true;
  if(fresh.length===1&&fresh[0]==='endCard')setTimeout(()=>{if(!$('endCard').hidden&&!$('game').hidden)sheet(true);},1200);else sheet(true);}
let audioCtx=null,lastMine=false;
let sndOn=true,sndVol=50;
function sndSave(){try{localStorage.setItem(K('sound'),JSON.stringify({on:sndOn,vol:sndVol}));}catch(e){}}
function sndBind(){try{const o=JSON.parse(localStorage.getItem(K('sound'))||'{}');if(typeof o.on==='boolean')sndOn=o.on;if(typeof o.vol==='number')sndVol=o.vol;}catch(e){}
  const c=$('sndOn'),r=$('sndVol');c.checked=sndOn;r.value=sndVol;r.disabled=!sndOn;
  c.addEventListener('change',()=>{sndOn=c.checked;r.disabled=!sndOn;sndSave();if(sndOn)tone(660,.18,.05);});
  r.addEventListener('input',()=>{sndVol=+r.value;sndSave();});r.addEventListener('change',()=>tone(660,.18,.05));}
function tone(f,d,v){if(!sndOn||sndVol<=0)return;v=Math.max(.0002,(v||.05)*sndVol/50);try{if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();const t=audioCtx.currentTime,o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=f;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(v,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g).connect(audioCtx.destination);o.start(t);o.stop(t+d+.02);}catch(e){}}
let cdSec=null;
function countdown(myRunning,ms){if(!myRunning){cdSec=null;return;}const s=Math.max(0,Math.ceil(ms/1000));
  if(cdSec!==null&&s<cdSec){if(cdSec>10&&s<=10){tone(520,.22,.05);setTimeout(()=>tone(520,.22,.05),260);}else if(s<=5)tone(s===0?440:880,s===0?.4:.09,.05);}
  cdSec=s;}
function tick(){if(!view||!view.tc)return;const r=replay(view,view.moves,view.result),rem=remaining();
  const sim=simHold(view,r);countdown(mySeat>=0&&view.running&&!r.over&&!sim&&(view.runSeat??r.st.turn)===mySeat,rem[Math.max(0,mySeat)]);
  for(const p of [0,1]){const el=$('clock'+p);if(!el)continue;el.textContent=fmt(rem[p]);
    const run=view.running&&!r.over&&!sim&&(view.runSeat??r.st.turn)===p;el.className='clock '+(run?'run':'idle')+(rem[p]<60000?' low':'');}}

// ---------- sending a move ----------
function send(mv){if(sending)return;ui.pending=null;const code=GAME.enc(mv),n=view.moves.length;
  if(ana()){anaPlay(code);return;}
  if(role==='host'){hostMove(mySeat,n,code,null);return;}
  if(role==='ai'){aiPlay(code);return;}
  if(role==='test'){testPlay(code);return;}
  if(role==='local'){localPlay(code);return;}
  if(!C.conn||!C.conn.open){status(t('st_noHost'));renderGame();return;}
  // simultaneous phase: the move goes to the host, which keeps it hidden; shown here as mine, validated
  if(simHold(view,replay(view,view.moves,view.result))){C.hold={code,sent:Date.now()};view={...view,myHold:code};C.conn.send({t:'move',n:0,code});showState(view);return;}
  sending=true;C.pending={n,code,at:Date.now(),sent:Date.now()};pendView();LS.set(K('p2p-pending'),{code:C.code,n,mv:code});
  C.conn.send({t:'move',n,code});renderGame();}
// A move sent by the guest is shown at once on top of the host's position, until the host confirms it (or refuses it).
function pendView(){if(!C.pending||!view||view.moves.length!==C.pending.n)return;const rem=remaining();C.pending.base=view;
  view={...view,moves:view.moves.concat([C.pending.code]),clock:rem,elapsed:0,recvAt:Date.now(),runSeat:mySeat};}
function pendClear(){C.pending=null;LS.del(K('p2p-pending'));}

// ---------- computer opponent ----------
// The search runs in a worker built from the game's source (GAME.aiSrc), so the page stays responsive.
let worker=null,reqId=0,cbs={},busy='',aiInfo=null,hintMv=null,aiLast=null;   // aiLast: the computer's last search (draw offers)
function makeWorker(){const src=GAME.aiSrc()+`
self.onmessage=e=>{const m=e.data,r=aiSearch(m.st,m.opt);self.postMessage({id:m.id,r:r&&{move:r.move,score:r.score,depth:r.depth,forced:r.forced,policy:r.policy}});};`;
  worker=new Worker(URL.createObjectURL(new Blob([src],{type:'text/javascript'})));worker.onmessage=e=>{const cb=cbs[e.data.id];delete cbs[e.data.id];if(cb)cb(e.data.r);};}
function stopAI(){if(worker)worker.terminate();worker=null;cbs={};busy='';}
function ask(st,opt,cb){opt={...opt,...(GAME.aiOpt?GAME.aiOpt(view):{})};const msg={st:GAME.aiPos(st),opt};
  try{if(!worker)makeWorker();msg.id=++reqId;cbs[msg.id]=cb;worker.postMessage(msg);}
  catch(e){worker=null;setTimeout(()=>cb(GAME.aiSearch(st,opt)),30);}}   // no worker (some file:// setups): search on the page
const AK=()=>K('ai');   // the game against the computer, kept across a reload
const aiView=st=>GAME.aiView?GAME.aiView(st):st;
function startAI(seat,rules){stopAI();navAt=null;role='ai';mySeat=seat;C.stop=true;setHash('ai');
  view={size:GAME.size,...rules,tc:null,names:seat===0?['me','ai']:['ai','me'],first:seat===0?'me':'ai',moves:[],clock:[0,0],running:false,elapsed:0,result:null,guestOn:true,watchers:0,started:true,ready:[true,true],paused:false,recvAt:Date.now()};
  resetUi();aiInfo=null;hintMv=null;showGame();renderGame();aiStep();}
// Free play ('test'): one person plays both sides on this device, with take-back and hints, no clock; the seat follows
// the side to move and the board stays put.
const TK=()=>K('test');   // the game on this device, kept across a reload
const soloView=(rules,tc)=>({size:GAME.size,...rules,tc:tc||null,names:[t('p1'),t('p2')],first:'me',moves:[],clock:[tc?tc.base:0,tc?tc.base:0],running:false,elapsed:0,result:null,guestOn:true,watchers:0,started:true,ready:[true,true],paused:false,recvAt:Date.now()});
function startTest(rules){stopAI();navAt=null;role='test';mySeat=0;C.stop=true;setHash('test');
  view=soloView(rules,null);LS.set(TK(),view);
  resetUi();hintMv=null;showGame();renderGame();}
function testTurn(){if(role==='test')LS.set(TK(),view);const r=replay(view,view.moves,view.result);if(!r.over)mySeat=r.st.turn;resetUi();renderGame();}
function testPlay(code){if(view.result)return;view.moves=view.moves.concat([code]);hintMv=null;testTurn();}
function testUndo(){if(!view.moves.length)return;stopAI();view.moves=view.moves.slice(0,-1);view.result=null;hintMv=null;testTurn();}
// Face to face ('local'): two players on this device, no take-back, no hint, the board stays put; an optional chess clock.
// view.clock holds each side's time at view.recvAt; while view.running, the side to move's clock runs from then
// (remaining() does the subtraction, as for the link games). On each confirmed move the mover's time is taken off and the
// increment added; at zero the side to move loses on time. No clock runs where GAME.clockOff says so.
// Saved at every render, every second and when the page goes away with the times left (elapsed 0); a reload restores
// those times and the clock goes on from the moment the page is back (the time of the reload itself is not counted).
const LK=()=>K('local');
const localRuns=st=>!!view.tc&&!view.result&&!(GAME.clockOff&&GAME.clockOff(view,st));
function startLocal(rules,tc){stopAI();navAt=null;role='local';mySeat=0;C.stop=true;setHash('local');
  view=soloView(rules,tc);view.running=localRuns(GAME.replay(view,[]).st);
  resetUi();hintMv=null;showGame();renderGame();}
function localSave(){if(role!=='local'||!view)return;LS.set(LK(),{...view,clock:remaining(),elapsed:0,recvAt:0});}
// stop the clocks where they are (the game ends)
function localFreeze(){if(!view.tc)return;view.clock=remaining();view.running=false;view.elapsed=0;view.recvAt=Date.now();}
function localPlay(code){if(view.result)return;const r=replay(view,view.moves,view.result);if(r.over)return;const s=r.st.turn;
  if(view.tc){const rem=remaining();if(view.running){if(rem[s]<=0){localFlag();return;}rem[s]+=view.tc.inc;}view.clock=rem;}
  view.draw=null;view.moves=view.moves.concat([code]);const r2=replay(view,view.moves,null);
  view.running=!r2.over&&localRuns(r2.st);view.elapsed=0;view.recvAt=Date.now();testTurn();}
function localFlag(){const r=replay(view,view.moves,view.result);if(r.over)return;const tt=r.st.turn;localFreeze();view.clock[tt]=0;
  view.result={winner:1-tt,reason:'time'};resetUi();renderGame();}
let localTick=0;
// Home: "Create a game", then the opponent (link, computer, face to face, free play), then that choice's options
let homeK='';
// Home, one card: '' (Play, Analyse, the game to resume, the codes) · 'play' (the game mode, then its options; the name for
// a link or the computer) · 'ana' (create a game in free play, or load an SGF file) · 'free' · 'load'
function homeStep(k){homeK=k;const mode=$('modeSel').value,play=k==='play';
  $('homeMain').hidden=k!=='';$('newHead').hidden=k==='';$('anaPick').hidden=k!=='ana';
  $('modeWrap').hidden=$('modeTxt').hidden=!play;$('modeTxt').textContent=t('m_'+mode+'Txt');$('nameWrap').hidden=!(play&&(mode==='link'||mode==='ai'));
  const F={link:'createForm',ai:'aiForm',face:'faceForm'};for(const x in F)if($(F[x]))$(F[x]).hidden=!(play&&mode===x);
  $('testForm').hidden=k!=='free';$('loadForm').hidden=k!=='load';if(k==='load')$('sgfErr').textContent='';
  const h=$('newTitle');h.dataset.i18n={play:'playGo',ana:'analyse',free:'a_free',load:'a_load'}[k]||'playGo';h.textContent=t(h.dataset.i18n);}
// Arriving by a link for the first time: the page connects at once and a frame over the board asks for a name, the
// saved one by default ('play': the name the opponent sees, sent to the host once chosen; 'watch': a name or none,
// remembered so that a reload comes back straight to the game). '' hides it.
function nameOv(kind){const ov=$('nameOv');ov.dataset.k=kind;ov.hidden=!kind;if(!kind)return;const w=kind==='watch';
  const set=(id,k)=>{$(id).dataset.i18n=k;$(id).textContent=t(k);};
  set('nameOvT',w?'watchT':'invitedT');set('nameOvTxt',w?'watchTxt':'invitedTxt');set('nameOvGo',w?'watch':'play');$('nameOvAnon').hidden=!w;
  const n=$('nameOvIn');n.value=nickGet();n.focus();n.select();}
function nameOvDone(anon){const ov=$('nameOv'),w=ov.dataset.k==='watch',v=anon?'':nmClean($('nameOvIn').value);ov.hidden=true;
  if(v)nickSet(v);
  if(w){C.name=v;LS.set(K('p2p-watch'),{code:C.code,name:v});if(C.conn&&C.conn.open)C.conn.send({t:'wname',name:v});}
  else if(v){C.name=v;if(C.conn&&C.conn.open)C.conn.send({t:'name',name:v});guestSave();}
  if(view)renderGame();}
function aiPlay(code){if(view.result)return;view.draw=null;view.moves=view.moves.concat([code]);resetUi();hintMv=null;aiInfo=null;renderGame();aiStep();}
function aiStep(){if(role!=='ai'||busy||ana())return;const r=replay(view,view.moves,view.result);if(r.over||r.st.turn===mySeat)return;
  const n=view.moves.length,t0=Date.now();busy='ai';renderGame();
  ask(aiView(r.st),GAME.levels[level],res=>{const wait=Math.max(0,400-(Date.now()-t0));setTimeout(()=>{if(role!=='ai'||view.moves.length!==n||busy!=='ai')return;busy='';
    if(!res||!res.move){renderGame();return;}aiInfo=GAME.evalInfo(res,r.st);aiLast=res;view.draw=null;view.moves=view.moves.concat([GAME.enc(res.move)]);renderGame();aiStep();},wait);});}
// Undo last move: free play takes back one move; against the computer, back to my last turn before my last move
const undoOk=r=>role==='test'?view.moves.length>0:role==='ai'?r.log.some(e=>e.p===mySeat):false;
function doUndo(){if(!view||!canUndo()||GAME.preparing())return;if(role==='test'){testUndo();return;}stopAI();const m=view.moves.slice();
  const turnAt=k=>replay(view,m.slice(0,k),null).st.turn;let k=m.length;
  while(k>0){k--;if(turnAt(k)===mySeat)break;}
  if(turnAt(k)!==mySeat)k=0;
  view.moves=m.slice(0,k);view.result=null;view.draw=null;aiLast=null;resetUi();aiInfo=null;hintMv=null;renderGame();aiStep();}
// Hint: looked for by the computer (GAME.hintLevel), then shown on the board like a move awaiting confirmation; Play
// this move plays it at once, Dismiss (or a click on the board) drops it.
const hintOn=()=>!!hintMv&&!busy;
function doHint(){if(!view||!canHint()||busy)return;const r=replay(view,view.moves,view.result);if(!isMyTurn(r)||GAME.preparing())return;const n=view.moves.length;busy='hint';hintMv=null;renderGame();
  ask(aiView(r.st),GAME.hintLevel,res=>{if(busy!=='hint')return;busy='';if(view.moves.length===n&&res&&res.move&&(!GAME.hintOk||GAME.hintOk(res.move))){hintMv=res.move;resetUi();}renderGame();});}
function hintOff(){if(busy==='hint')stopAI();hintMv=null;if(ui)ui.hover=null;renderGame();}
function hintPlay(){const mv=hintMv;if(!mv||busy)return;hintMv=null;resetUi();send(mv);}
const aiFirst=()=>{const v=$('aFirst').value;return v==='me'?0:v==='ai'?1:Math.random()<.5?0:1;};   // seat of the player

// ---------- invitation codes ----------
function fillCodes(code,guest){code=code||H.code;linkOnly(false);const web=/^https?:$/.test(location.protocol),base=location.href.split('#')[0];
  if($('codePBox'))$('codePBox').hidden=false;$('codeC').value=code;$('linksBox').hidden=!web;$('fileNote').hidden=web;$('oppLink').hidden=!!guest;$('hostNote').hidden=!!guest;
  const wc=guest?view&&view.wcode:H.wcode;
  if($('codeWC')){$('codeWC').value=wc||'';$('codeWBox').hidden=!wc;}
  if(web){$('codeP').value=base+'#join-'+code;$('codeW').value=wc?base+'#watch-'+wc:'';if($('watchLinkBox'))$('watchLinkBox').hidden=!wc;}}
// a spectator: the code they came with, if it is the spectators' one (an older link gave the players' code: nothing shown)
function fillWatch(wc){const web=/^https?:$/.test(location.protocol);linkOnly(false);if($('codePBox'))$('codePBox').hidden=true;$('oppLink').hidden=true;$('hostNote').hidden=true;
  if($('codeWC')){$('codeWC').value=wc;$('codeWBox').hidden=false;}$('linksBox').hidden=!web;$('fileNote').hidden=web;
  if(web){$('codeW').value=location.href.split('#')[0]+'#watch-'+wc;if($('watchLinkBox'))$('watchLinkBox').hidden=false;}}
// a Mochalunt table: the match's links (mochalunt.html), not the table's codes; a spectator only gets the spectators' one
function linkOnly(on){for(const id of ['codePBox','codeWBox'])if($(id))$(id).classList.toggle('linkonly',on);}
function fillMatch(){const web=/^https?:$/.test(location.protocol),base=location.href.split('#')[0].replace(/[^/]*$/,'')+'mochalunt.html';
  const tl=(MATCH.excl<0?'a':String(MATCH.excl))+MATCH.j1,pl=!!MATCH.me,wc=pl?MATCH.wcode:MATCH.code;
  // a match: its pages' links only (no code to type): the rows show their « Link » button alone
  for(const [id,on] of [['codePBox',pl],['codeWBox',!!wc]])if($(id)){$(id).hidden=!(on&&web);$(id).classList.add('linkonly');}
  $('hostNote').hidden=true;$('linksBox').hidden=!web;$('fileNote').hidden=web;
  $('oppLink').hidden=!pl;$('codeP').value=pl?base+'#join-'+MATCH.code+'-'+tl+(MATCH.wcode?'-'+MATCH.wcode:''):'';
  $('codeW').value=wc?base+'#watch-'+wc+'-'+tl:'';if($('watchLinkBox'))$('watchLinkBox').hidden=!wc;}

// ---------- start screen ----------
function joinClick(asWatch){if(typeof Peer==='undefined'){status(t('noPeer'));return;}
  // a whole link pasted: its kind and code; a code alone: the spectators' have 8 characters
  const raw=$('jCode').value,lk=/#(join|watch)-([a-z0-9]+)/i.exec(raw),code=lk?lk[2].toLowerCase():cleanCode(raw);
  const w=asWatch||(lk?lk[1].toLowerCase()==='watch':code.length===8);
  const nm=nmClean($('jName').value);if(nm)nickSet(nm);clientStart(code,w?nm:nm||t('p2'),w);if(w&&C.code)LS.set(K('p2p-watch'),{code:C.code,name:nm});}
function exportCode(){const v=view,c=remaining();const p={size:v.size,...GAME.rules(v),tc:v.tc||null,first:v.first,names:v.names,moves:v.moves,clock:c,result:v.result,started:!!v.started};
  return GAME.codeTag+'.'+btoa(unescape(encodeURIComponent(JSON.stringify(p))));}
function importCode(t){const tag=GAME.codeTag+'.';t=String(t||'').replace(/\s+/g,'');if(t.indexOf(tag)!==0)throw 0;
  const p=JSON.parse(decodeURIComponent(escape(atob(t.slice(tag.length)))));if(!p||!Array.isArray(p.moves)||!Array.isArray(p.clock)||!Array.isArray(p.names))throw 0;const rr=GAME.rules(p);p.size=GAME.size;Object.assign(p,rr);return p;}
function resumeAs(seat,p){if(typeof Peer==='undefined'){status(t('noPeer'));return;}
  const th=[null,null];th[seat]=hh(MYID);
  Object.assign(H,{code:newCode(6),wcode:newCode(8),guestCid:null,game:{size:GAME.size,...GAME.rules(p),hold:null,tc:p.tc||null,first:p.first,names:p.names.slice(),moves:p.moves.slice(),clock:p.clock.slice(),running:!!p.started,result:p.result||null,
    started:!!p.started,ready:[!!p.started,!!p.started],th,paused:!!p.started&&!p.result,ver:0}});H.turnStart=Date.now();hostStart(null);}
// ---------- SGF: export of the game shown, reading of a file (read only) ----------
// The file: (;FF[4]CA[UTF-8]AP[…]GM[…]SZ[…]GN[…]DT[…]PB[…]PW[…]RE[…]XG[game id]XR[rules, JSON] ;B[…];W[…]…). B and W are
// seat 0 and seat 1 (Pente: the stone colours), their values the page's move codes unless the game has a notation of
// its own (GAME.sgf). XG and XR are private properties (the SGF lets readers skip them), and so are the page's own (GAME.sgfHead).
const AP='tybaltp.github.io/games';
const sgfEsc=v=>String(v).replace(/\\/g,'\\\\').replace(/\]/g,'\\]');
function sgfName(s){if(role==='ai')return s===meS()?nickGet()||t('you'):t('computer')+' ('+t('lv_'+level)+')';return view.names[s]||t(s===0?'p1':'p2');}
// The whole tree of an analysis: the main line first, each branching as (;…)(;…) in the tree's order; the header (players,
// result) is the main line's. A move gives one node or more (GAME.sgf.nodes: those of a line, the move's are the ones its
// line adds to the line before it).
function sgfText(){const A=ana(),main=A?anaMainLine():view.moves,r=replay(view,main,A?view.gameResult||null:view.result),G=GAME.sgf,bs=G&&G.black?G.black(r.st):0;
  const pad=n=>String(n).padStart(2,'0'),d=new Date(),dt=view.sgfDT||d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  const col=s=>s===bs?'B':'W',o=r.over;
  const re=!o?'':o.w<0?'0':col(o.w)+'+'+(o.why==='w_resign'?'R':o.why==='w_time'?'T':'');
  const head={FF:4,CA:'UTF-8',AP,GM:G&&G.gm,SZ:G&&G.sz,GN:t('title'),DT:dt,PB:sgfName(bs),PW:sgfName(1-bs),RE:re,XG:GAME.id,XR:JSON.stringify(GAME.rules(view)),...(GAME.sgfHead?GAME.sgfHead(view):{})};
  const node=o=>';'+Object.keys(o).filter(k=>o[k]!==undefined&&o[k]!=='').map(k=>k+'['+sgfEsc(o[k])+']').join('');
  const nodesOf=p=>{const rr=GAME.replay(view,p);return G&&G.nodes?G.nodes(rr,{...view,moves:p}):rr.log.map((e,j)=>({[(e.p===undefined?j%2:e.p)===0?'B':'W']:p[j]}));};
  const cnt=new Map(),count=p=>{const k=p.join(',');if(!cnt.has(k))cnt.set(k,nodesOf(p).length);return cnt.get(k);};
  const mv=(p,m)=>{const q=p.concat(m),all=nodesOf(q);cnt.set(q.join(','),all.length);return '\n'+all.slice(count(p)).map(node).join('\n');};
  const tree=A?view.tree:(()=>{const root={c:[]};let n=root;for(const m of view.moves){const x={m,c:[]};n.c.push(x);n=x;}return root;})();
  const emit=(n,p)=>{let out='';while(n.c.length===1){const x=n.c[0];out+=mv(p,x.m);p=p.concat(x.m);n=x;}
    for(const x of n.c.length>1?n.c:[])out+='\n('+mv(p,x.m).slice(1)+emit(x,p.concat(x.m))+')';return out;};
  return '('+node(head)+emit(tree,[])+')\n';}
function sgfExport(){if(!view)return;const a=document.createElement('a'),d=new Date(),pad=n=>String(n).padStart(2,'0');
  a.href=URL.createObjectURL(new Blob([sgfText()],{type:'application/x-go-sgf'}));
  a.download=GAME.id+'-'+d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'-'+pad(d.getHours())+pad(d.getMinutes())+'.sgf';
  document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);}
// An SGF text: its first game tree, {nodes:[{PROP:[values]}],vars:[trees]}
function sgfParse(txt){let i=0;const n=txt.length,ws=()=>{while(i<n&&/\s/.test(txt[i]))i++;};
  function tree(){ws();if(txt[i]!=='(')throw 'tree';i++;const out={nodes:[],vars:[]};
    for(;;){ws();const c=txt[i];if(c===undefined)throw 'end';
      if(c===';'){i++;const nd={};for(;;){ws();const m=/^[A-Za-z]+/.exec(txt.slice(i,i+40));if(!m)break;const id=m[0].replace(/[a-z]/g,'');i+=m[0].length;const vals=[];
          for(;;){ws();if(txt[i]!=='[')break;i++;let v='';while(i<n&&txt[i]!==']'){if(txt[i]==='\\'){i++;if(txt[i]==='\n'){i++;continue;}}v+=txt[i++];}if(i>=n)throw 'value';i++;vals.push(v);}
          if(id)nd[id]=vals;}
        if(out.vars.length)throw 'char';out.nodes.push(nd);}
      else if(c==='('){out.vars.push(tree());}
      else if(c===')'){i++;return out;}
      else throw 'char';}}
  return tree();}
// A file read: checked against the rules, then shown read only, from its first position
function sgfLoad(txt){let T;try{T=sgfParse(String(txt).replace(/^\uFEFF/,''));}catch(e){return t('sgfBad');}
  // every line of the tree, from the root node to a leaf, in the file's order (the first one: the main line)
  const lines=[],walk=(x,pre)=>{const q=pre.concat(x.nodes);if(!x.vars.length){lines.push(q);return;}for(const y of x.vars)walk(y,q);};walk(T,[]);
  if(lines.length>5000)return t('sgfBad');
  const root=lines[0][0]||{},v=k=>root[k]&&root[k][0],G=GAME.sgf;
  if(v('XG')?v('XG')!==GAME.id:!(G&&G.gm&&+v('GM')===G.gm))return v('XG')?t('sgfOther',{g:v('XG')}):t('sgfBad');
  let rules={};try{rules=JSON.parse(v('XR')||'{}');}catch(e){}rules=GAME.rules(rules);
  const tree={c:[]};let codes=null;
  for(const ln of lines){const body=ln.slice(1);let cs;try{cs=G&&G.codes?G.codes(body):body.map(nd=>(nd.B||nd.W||[])[0]).filter(x=>x!==undefined);}catch(e){return t('sgfBad');}
    const rr=GAME.replay(rules,cs);if(rr.over&&rr.over.why==='w_bad')return t('sgfMove',{n:rr.log.length+1});
    let n=tree;for(const m of cs){let x=n.c.find(y=>y.m===m);if(!x){x={m,c:[]};n.c.push(x);}n=x;}if(!codes)codes=cs;}
  const r=GAME.replay(rules,codes);
  const bs=G&&G.black?G.black(r.st):0,names=[];names[bs]=v('PB')||t('p1');names[1-bs]=v('PW')||t('p2');
  const re=/^([BW])\+([RT])/i.exec(v('RE')||''),result=r.over?null:re?{winner:re[1].toUpperCase()==='B'?bs:1-bs,reason:re[2].toUpperCase()==='T'?'time':'resign'}:/^(0|draw)$/i.test(v('RE')||'')?{winner:-1,reason:'agree'}:null;
  // unfinished: Libre play from the main line's last position (both sides, hints); finished: from the first position.
  // Both are analyses: a move played anywhere adds a variation.
  if(!r.over&&!result){stopAI();navAt=null;role='test';C.stop=true;setHash('test');
    view={...soloView(rules,null),names,customNames:true,moves:codes,tree,gameResult:null};LS.set(TK(),view);hintMv=null;showGame();testTurn();return '';}
  stopAI();role='file';mySeat=-1;C.stop=true;setHash('');
  view={...soloView(rules,null),names,moves:[],tree,gameResult:result,result:null,sgfDT:v('DT')||''};navAt=null;
  resetUi();hintMv=null;showGame();renderGame();return '';}
// The two commands, added to every page: « Load a game » under « Create a game », « Export the game (SGF) » under the moves
function sgfUi(){
  // at the end of the options
  if(!$('sgfExp')&&$('myCard')){const d=document.createElement('div');d.className='confirm';d.id='sgfExpBox';d.hidden=true;
    const b=document.createElement('button');b.type='button';b.id='sgfExp';b.dataset.i18n='sgfExport';b.textContent=t('sgfExport');b.onclick=sgfExport;d.appendChild(b);$('myCard').appendChild(d);}
  // the draw offer, beside Resign at the top of the options
  if(GAME.drawOffer&&!$('drawBtn')&&$('resign')){const b=document.createElement('button');b.type='button';b.id='drawBtn';b.hidden=true;b.textContent=t('drawOffer');
    b.onclick=()=>{const dv=view&&view.draw;drawSend(dv&&dv.st==='ask'&&dv.from===mySeat?'cancel':'ask');};$('resign').before(b);
    const p=document.createElement('p');p.className='hint';p.id='drawNote';p.hidden=true;$('resignAsk').after(p);}}
// A saved game still to play: no result (resignation, time, agreement) and not over on the board either
function unfinished(g){if(!g||g.result)return false;try{return !GAME.replay(g,g.moves||[]).over;}catch(e){return false;}}
function init(){GAME.home();
  const saved=LS.get(K('p2p-host'),null),sg=LS.get(K('p2p-guest'),null);
  if(saved&&saved.code&&unfinished(saved.game)){$('resumeCard').hidden=false;}
  else if(sg&&sg.code&&unfinished(sg.view)){$('resumeCard').hidden=false;$('resumeBtn').dataset.guest=sg.code;$('resumeTxt').textContent=t('inProgressGuest');}
  status('');
  if(location.hash==='#ai'){const sv=LS.get(AK(),null);if(sv&&sv.view){stopAI();navAt=null;role='ai';mySeat=sv.mySeat;C.stop=true;
    view={...sv.view,recvAt:Date.now()};resetUi();aiInfo=null;hintMv=null;showGame();renderGame();aiStep();return;}setHash('');}
  if(location.hash==='#local'){const sv=LS.get(LK(),null);if(sv&&Array.isArray(sv.moves)){stopAI();navAt=null;role='local';C.stop=true;
    view={...sv,elapsed:0,recvAt:Date.now()};const r=replay(view,view.moves,view.result);mySeat=r.st.turn;resetUi();hintMv=null;showGame();renderGame();return;}setHash('');}
  if(location.hash==='#test'){const sv=LS.get(TK(),null);startTest(GAME.rules(sv||{}));if(sv&&sv.moves){view={...sv,names:view.names};testTurn();}return;}
  {const mm=/^#m([twv])-([a-z0-9]+)-(\d+)$/.exec(location.hash);if(mm&&mStart(mm[1],mm[2],+mm[3]))return;}
  const m=/^#(join|watch|host)-([a-z0-9]+)$/.exec(location.hash);if(!m)return;
  if(m[1]==='host'){if(saved&&saved.code===m[2]&&saved.game){hostStart(saved);return;}m[1]='join';}
  $('jCode').value=m[2];if(typeof Peer==='undefined'){status(t('noPeer'));return;}
  // a player comes back to their game at once; on a first visit the name is asked over the board (known to the host: not asked)
  if(m[1]==='join'){const back=!!(sg&&sg.code===m[2]);clientStart(m[2],back&&sg.name||nickGet()||t('p2'),false);if(!back)C.ask=true;return;}
  const wr=LS.get(K('p2p-watch'),null);if(wr&&wr.code===m[2]){clientStart(m[2],wr.name||'',true);return;}
  clientStart(m[2],'',true);nameOv('watch');}

// ---------- Mochalunt matches (see mochalunt.html) ----------
// A match: the same two players over the tables of the plan, one game each, played in order. Its record is kept on each
// device under mochalunt-<code>: {code, excl (the game left out, -1: none), j1 ('c' the creator, 'i' the invitee: the
// match's Player 1), me ('c'|'i', null for a spectator), pid (this player's id for the whole match), name, names {c,i},
// res {k: {w ('c'|'i'|'d'), why, moves, names {c,i}, seats ([role of seat 0, of seat 1]), rules}}}.
// Table k is the page of its game with #mt-<code>-<k> (to play), #mw-<code>-<k> (to watch) or #mv-<code>-<k> (a finished
// table, read only). Whoever arrives first hosts the table (its code: <code>t<k>), the other joins it. At each table
// the match's Player 1 of that table (j1 at tables 0, 2, 4; the other at 1, 3) chooses their seat, then both start.
const MOCHA=[{id:'arimaa',page:'arimaa',name:'Arimaa',tc:{base:20*60e3,inc:30e3}},{id:'dblk',page:'diagonalblocks',name:'Diagonal Blocks Duo',tc:{base:20*60e3,inc:10e3}},
  {id:'volo',page:'volo',name:'Volo',tc:{base:20*60e3,inc:20e3}},{id:'gyges',page:'gyges',name:'Gygès',tc:{base:20*60e3,inc:10e3},rules:{adv:true}},
  {id:'tintas',page:'tintas',name:'Tintas',tc:{base:20*60e3,inc:10e3}}];
const mPlan=rec=>MOCHA.filter((g,i)=>i!==rec.excl);
const mOther=r=>r==='c'?'i':'c';
const mChooser=(m,k)=>k%2===0?m.j1:mOther(m.j1);   // who chooses their seat at table k
let MATCH=null,MTK=-1,MTW='';   // the match record, this table's index, the hash kind (t, w, v)
const mSave=()=>{if(MATCH)LS.set('mochalunt-'+MATCH.code,MATCH);};
// the score, by role: 1 a win, ½ a draw
function mScore(rec){const p={c:0,i:0};for(const k in rec.res||{}){const w=rec.res[k].w;if(w==='d'){p.c+=.5;p.i+=.5;}else if(w)p[w]+=1;}return p;}
const mNum=x=>String(x).replace('.',lang==='en'?'.':',');
function mGo(k,kind){const P=mPlan(MATCH);if(V.st==='on'||MATCH.vc&&MATCH.vc.k===MTK)mVoiceSet(true);C.stop=true;try{peer&&peer.destroy();}catch(e){}wpeerStop();
  location.href=k>=P.length?'mochalunt.html#res-'+MATCH.code:P[k].page+'.html#m'+kind+'-'+MATCH.code+'-'+k;}
// The voice between the two players goes on from table to table: on, it is noted in the record ({k: the table, at});
// at the next table (or the same one, reloaded) within 15 min, the guest offers it again by itself ('reask') and the
// host, which has the same note, accepts it by itself. Hanging up, declining or a 'bye' removes the note.
const mVoiceFresh=()=>!!(MATCH&&MATCH.me&&MTW==='t'&&MATCH.vc&&(MATCH.vc.k===MTK||MATCH.vc.k===MTK-1)&&Date.now()-MATCH.vc.at<15*60e3);
function mVoiceSet(on){if(!MATCH||!MATCH.me||MTW!=='t')return;if(on)MATCH.vc={k:MTK,at:Date.now()};else if(MATCH.vc)delete MATCH.vc;else return;mSave();}
let mVoiceTried=false;
function mVoiceAuto(){if(mVoiceTried||role!=='guest'||mySeat<0||V.st!=='off'||!voiceOk()||!voiceNet()||!mVoiceFresh())return;
  mVoiceTried=true;V={st:'out',note:''};voiceSend('reask');voiceUi();}
// The table's game, made by whoever hosts it first
function mTableGame(){const G=mPlan(MATCH)[MTK],tc=G.tc;
  return {size:GAME.size,...GAME.rules(G.rules||{}),hold:null,tc,first:'host',names:[MATCH.name,''],moves:[],clock:[tc.base,tc.base],running:false,result:null,started:false,
    ready:[false,false],th:[hh(MYID),null],paused:false,ver:0,chat:[...(MATCH.chat||[]).filter(x=>!x.w||x.v),{k:'lg_table',a:{k:MTK+1,g:G.name}}].slice(-CHATMAX),match:{code:MATCH.code,k:MTK,excl:MATCH.excl,j1:MATCH.j1,seats:[MATCH.me,mOther(MATCH.me)],chosen:false}};}
// The chooser takes the first seat or the second (c: 1 first, 2 second); the seats are swapped when needed
function mChoose(s,c){const g=H.game,m=g.match;if(!m||m.chosen||g.started||!g.names[0]||!g.names[1])return;if(m.seats[s]!==mChooser(m,m.k))return;
  if((s===0)!==(c===1)){g.first=g.first==='host'?'guest':'host';g.names.reverse();g.th.reverse();m.seats.reverse();g.ready.reverse();mySeat=1-mySeat;
    if(H.guestConn){H.guestConn.seat=1-H.guestConn.seat;try{H.guestConn.send({t:'welcome',role:'guest',seat:H.guestConn.seat});}catch(e){}}}
  m.chosen=true;hostBroadcast(true);}
function mChooseSend(c){if(role==='host')mChoose(mySeat,c);else if(C.conn&&C.conn.open)C.conn.send({t:'mchoose',c});}
// Each state seen: the record takes the names, the finished tables known elsewhere, and this table's result once over
function mSync(r){const m=view&&view.match;if(!m||!MATCH)return;let ch=false;
  if(MATCH.excl===undefined||MATCH.j1===undefined){MATCH.excl=m.excl;MATCH.j1=m.j1;ch=true;}
  if(MATCH.me&&MATCH.cur!==MTK&&MTW==='t'){MATCH.cur=MTK;ch=true;}
  for(const k in m.res||{})if(!MATCH.res[k]){MATCH.res[k]=m.res[k];ch=true;}
  const nm={};m.seats.forEach((ro,s)=>{if(view.names[s])nm[ro]=view.names[s];});if(JSON.stringify({...MATCH.names,...nm})!==JSON.stringify(MATCH.names||{})){MATCH.names={...MATCH.names,...nm};ch=true;}
  if(MATCH.me&&MTW==='t'&&Array.isArray(view.chat)&&view.chat.length&&JSON.stringify(view.chat)!==JSON.stringify(MATCH.chat||[])){MATCH.chat=view.chat.slice(-CHATMAX);ch=true;}
  if(r.over&&!MATCH.res[MTK]){MATCH.res[MTK]={w:r.over.w<0?'d':m.seats[r.over.w],why:r.over.why,moves:view.moves.slice(),names:{...MATCH.names},seats:m.seats.slice(),rules:GAME.rules(view)};ch=true;}
  if(ch)mSave();}
// The match card (side panel): the table, the score, the seat choice, the tables (finished ones open read only)
function mRender(r){const card=$('mCard');if(!card)return;const m=view&&view.match;card.hidden=!m||!MATCH;if(card.hidden)return;
  const P=mPlan(MATCH),sc=mScore(MATCH),nmOf=ro=>MATCH.names&&MATCH.names[ro]||(ro===MATCH.me&&MATCH.name)||'…';
  $('mHead').textContent=t('m_table',{k:MTK+1,n:P.length,g:P[MTK].name});
  $('mScore').textContent=t('m_score',{a:nmOf(MATCH.j1),x:mNum(sc[MATCH.j1]),y:mNum(sc[mOther(MATCH.j1)]),b:nmOf(mOther(MATCH.j1))});
  const ch=mChooser(m,MTK),both=!!(view.names[0]&&view.names[1]),mine=MATCH.me===ch&&mySeat>=0,ask=MTW!=='v'&&!m.chosen&&!view.started&&both;
  $('mAsk').hidden=!(ask&&mine);   // the others read who is choosing in the status bar
  const ul=$('mList');ul.textContent='';
  P.forEach((G,k)=>{const li=document.createElement('li'),res=MATCH.res[k];li.className=k===MTK?'cur':'';
    const a=document.createElement(res&&k!==MTK?'a':'span');a.textContent=(k+1)+'. '+G.name;if(res&&k!==MTK){a.href=G.page+'.html#mv-'+MATCH.code+'-'+k;a.target='_blank';}
    const s2=document.createElement('span');s2.className='mres';s2.textContent=res?(res.w==='d'?t('m_drawn'):t('m_won',{n:res.names&&res.names[res.w]||nmOf(res.w)})):k===MTK?t('m_live'):'';li.append(a,s2);ul.appendChild(li);});
  const last=MTK>=P.length-1;$('mNext').hidden=!(r.over&&MTW!=='v');$('mNext').textContent=t(last?'m_result':MATCH.me?'m_next':'m_follow');
  $('mLive').hidden=MTW!=='v';}
function mUi(){if(!$('startCard')||$('mCard'))return;
  const mk=(tg,a,par)=>{const e=document.createElement(tg);for(const k in a)if(k==='hidden')e.hidden=a[k];else e.setAttribute(k,a[k]);if(par)par.appendChild(e);return e;};
  const c=mk('div',{class:'card mcard',id:'mCard',hidden:true});mk('h2',{id:'mHead'},c);mk('p',{class:'mscore',id:'mScore'},c);
  const ask=mk('div',{id:'mAsk',hidden:true},c);mk('p',{class:'hint',id:'mQ'},ask);const cf=mk('div',{class:'confirm'},ask);
  const c1=mk('button',{type:'button',class:'primary',id:'mC1'},cf),c2=mk('button',{type:'button',class:'primary',id:'mC2'},cf);
  const nx=mk('button',{type:'button',class:'primary',id:'mNext',hidden:true},mk('div',{class:'confirm'},c));
  const lv=mk('button',{type:'button',id:'mLive',hidden:true},mk('div',{class:'confirm'},c));mk('ol',{class:'mlist',id:'mList'},c);
  $('startCard').before(c);
  c1.onclick=()=>mChooseSend(1);c2.onclick=()=>mChooseSend(2);
  nx.onclick=()=>mGo(MTK+1,MATCH.me?'t':'w');
  lv.onclick=()=>{const P=mPlan(MATCH);let k=0;while(k<P.length&&MATCH.res[k])k++;mGo(Math.min(k,P.length),MATCH.me?'t':'w');};mTexts();}
function mTexts(){if(!$('mQ'))return;$('mQ').textContent=t('mq_q');$('mC1').textContent=t('mq_1');$('mC2').textContent=t('mq_2');$('mLive').textContent=t('m_back');}
// The hash of a match table: the record (made for a spectator if needed), then host or join, watch, or read a finished table
function mStart(kind,code,k){MATCH=LS.get('mochalunt-'+code,null);MTK=k;MTW=kind;
  if(!MATCH&&kind!=='t')MATCH={code,me:null,res:{},names:{}};
  if(!MATCH){status(t('m_unknown'));return true;}
  MATCH.res=MATCH.res||{};if(MATCH.excl===undefined&&kind==='v'){status(t('m_unknown'));return true;}
  const P=MATCH.excl===undefined?null:mPlan(MATCH);
  if(P&&(k>=P.length||P[k].id!==GAME.id)){if(k<P.length)location.replace(P[k].page+'.html'+location.hash);else location.replace('mochalunt.html#res-'+code);return true;}
  const tc=code+'t'+k;
  if(kind==='v'){const res=MATCH.res[k];if(!res){status(t('m_unknown'));return true;}stopAI();role='file';mySeat=-1;C.stop=true;
    const names=res.seats.map(ro=>res.names&&res.names[ro]||ro);
    view={...soloView(res.rules||{},null),names,moves:res.moves,result:null,match:{code,k,excl:MATCH.excl,j1:MATCH.j1,seats:res.seats,chosen:true}};
    {const rr=GAME.replay(view,view.moves);if(!rr.over&&res.w)view.result={winner:res.w==='d'?-1:res.seats.indexOf(res.w),reason:res.why==='w_time'?'time':res.why==='w_agree'?'agree':'resign'};}
    navAt=null;resetUi();hintMv=null;showGame();renderGame();return true;}
  if(kind==='w'){clientStart(tc,nickGet()||t('spectator'),true);return true;}
  const saved=LS.get(K('p2p-host'),null);
  if(saved&&saved.code===tc&&saved.game&&saved.game.match){hostStart(saved);return true;}
  const sg=LS.get(K('p2p-guest'),null);if(sg&&sg.code===tc){clientStart(tc,MATCH.name,false);return true;}
  H.code=tc;H.wcode=MATCH.wcode?MATCH.wcode+'t'+k:rnd(8);H.guestCid=null;H.game=mTableGame();H.turnStart=Date.now();hostStart(null);return true;}

// ---------- start-up: called by the page once GAME is defined ----------
function coreStart(){if(window.ResizeObserver&&$('notice'))new ResizeObserver(()=>fitBtns()).observe($('notice'));I18N={fr:{...I18C.fr,...GAME.i18n.fr},en:{...I18C.en,...GAME.i18n.en},es:{...I18C.es,...(GAME.i18n.es||{})}};sgfUi();
  if(GAME.levels){level=LS.get(K('level'),null);if(!GAME.levels[level])level=GAME.levelDefault;}
  applyStatic();
  document.querySelectorAll('[data-lang]').forEach(b=>b.onclick=()=>{lang=b.dataset.lang;try{localStorage.setItem('games-lang',JSON.stringify(lang));localStorage.setItem('volo-lang',JSON.stringify(lang));}catch(e){}applyStatic();if(view)renderGame();else status('');});
  MYID=pickTabId(GAME.id,LS.get(K('p2p-cid'),null));
  {const mh=/^#m[tv]-([a-z0-9]+)-/.exec(location.hash),rec=mh&&LS.get('mochalunt-'+mh[1],null);if(rec&&rec.pid)MYID=rec.pid;}   // a match: one id for all its tables
  mUi();
  resetUi();
  // host: periodic save, flag fall
  setInterval(()=>{if(role==='guest'&&view&&view.running&&++saveTick%5===0)guestSave();   // the clocks, every second
    if(role!=='host'||!H.game)return;if(++saveTick%5===0)hostSave();if(H.game.result||!H.game.running||H.game.paused||!H.game.tc)return;const g=H.game,r=replay(g,g.moves,g.result);if(r.over||simHold(g,r))return;
    const tt=r.st.turn;if(g.clock[tt]-(Date.now()-H.turnStart)<=0){g.clock[tt]=0;g.result={winner:1-tt,reason:'time'};hostBroadcast();}},200);
  // Heartbeat: host and guest exchange a small message every 2 s; after ~9 s without any message,
  // the guest (or spectator) treats the connection as lost, and the host treats the guest as away.
  setInterval(()=>{const now=Date.now();
    if(role==='host'&&H.conns){for(const c of H.conns)if(c.open){try{c.send({t:'ping'});}catch(e){}}
      const gc=H.guestConn;if(gc&&gc.lastSeen&&now-gc.lastSeen>9000){try{gc.close();}catch(e){}hostDrop(gc);}}
    else if((role==='guest'||role==='watch')&&C.conn&&C.conn.open&&!C.stop){try{C.conn.send({t:'ping'});}catch(e){}
      if(C.lastSeen&&now-C.lastSeen>9000){const c=C.conn;C.conn=null;try{c.close();}catch(e){}clientLost();}}},2000);
  // guest: resend until confirmed; after 1.5 s, say that the move waits for the host
  setInterval(()=>{if(role==='guest'&&C.hold&&C.conn&&C.conn.open&&Date.now()-C.hold.sent>3000){C.hold.sent=Date.now();try{C.conn.send({t:'move',n:0,code:C.hold.code});}catch(e){}}
    if(role!=='guest'||!C.pending||!view)return;const now=Date.now();
    if(C.conn&&C.conn.open&&now-C.pending.sent>3000){C.pending.sent=now;try{C.conn.send({t:'move',n:C.pending.n,code:C.pending.code});}catch(e){}}
    if(!C.pending.shown&&now-C.pending.at>1500){C.pending.shown=true;renderGame();}},1000);
  // face to face: flag fall, periodic save
  setInterval(()=>{if(role!=='local'||!view||!view.tc||!view.running||view.result)return;const r=replay(view,view.moves,view.result);if(r.over)return;
    if(remaining()[r.st.turn]<=0)localFlag();else if(++localTick%5===0)localSave();},200);
  window.addEventListener('pagehide',localSave);
  coordsSet(coordsOn);
  if($('coordOn')){const c=$('coordOn');c.checked=coordsOn;c.addEventListener('change',()=>{coordsSet(c.checked);LS.set('games-coords',coordsOn);if(view)renderGame();else GAME.home();});}
  if(mqWide.addEventListener)mqWide.addEventListener('change',layoutMode);else mqWide.addListener(layoutMode);layoutMode();
  $('optBtn').onclick=()=>sheet(!document.documentElement.classList.contains('sheet'));
  // Touch screens whose browser allows it (Android; not the iPhone): a button in the header puts the page in full screen,
  // without the address bar and the browser's bottom bar; a second tap (or the back gesture) leaves it
  {const D=document,R=D.documentElement,can=D.fullscreenEnabled&&R.requestFullscreen&&window.matchMedia&&window.matchMedia('(pointer:coarse)').matches;
    if(can){const b=D.createElement('button');b.type='button';b.className='fsbtn';b.id='fsBtn';b.setAttribute('data-i18n-t','fullscreen');b.title=t('fullscreen');
      b.innerHTML='<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M1.5 5.5v-4h4M10.5 1.5h4v4M14.5 10.5v4h-4M5.5 14.5h-4v-4"/></svg>';
      b.onclick=()=>{if(D.fullscreenElement)D.exitFullscreen().catch(()=>{});else R.requestFullscreen({navigationUI:'hide'}).catch(()=>{});};
      D.addEventListener('fullscreenchange',()=>b.classList.toggle('on',!!D.fullscreenElement));
      $('optBtn').before(b);}}
  $('sheetBg').onclick=()=>sheet(false);
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.documentElement.classList.contains('sheet')){e.preventDefault();e.stopImmediatePropagation();sheet(false);}},true);
  {const s=$('side');let y0=null;
    s.addEventListener('touchstart',e=>{y0=document.documentElement.classList.contains('sheet')&&s.scrollTop<=0&&e.touches.length===1?e.touches[0].clientY:null;},{passive:true});
    s.addEventListener('touchend',e=>{if(y0!==null&&s.scrollTop<=0&&e.changedTouches[0].clientY-y0>70)sheet(false);y0=null;},{passive:true});}
  document.addEventListener('pointerdown',()=>{try{if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();}catch(e){}},{once:true});
  setInterval(tick,250);
  window.addEventListener('resize',()=>{if(view)renderGame();});
  $('resign').onclick=()=>{$('resignBox').hidden=true;$('resignAsk').hidden=false;};
  $('resignNo').onclick=()=>{$('resignBox').hidden=false;$('resignAsk').hidden=true;};
  $('resignYes').onclick=()=>{$('resignBox').hidden=false;$('resignAsk').hidden=true;
    if(role==='ai'||solo()){if(!view.result){if(role==='local')localFreeze();view.result={winner:1-mySeat,reason:'resign'};stopAI();hintMv=null;resetUi();renderGame();}return;}
    if(role==='host'){if(!H.game.result&&H.game.started){H.game.result={winner:1-mySeat,reason:'resign'};hostBroadcast();}}else if(C.conn&&C.conn.open)C.conn.send({t:'resign'});};
  $('startBtn').onclick=()=>{if(role==='host')hostReady(mySeat);else if(C.conn&&C.conn.open)C.conn.send({t:'start'});else status(t('st_noHost2'));};
  $('newGame').onclick=()=>{if(role==='ai'){startAI(1-meS(),GAME.rules(view));return;}if(role==='test'){startTest(GAME.rules(view));return;}
    if(role==='local'){startLocal(GAME.rules(view),view.tc);return;}rmSend('ask');};
  $('rmYes').onclick=()=>rmSend('yes');$('rmNo').onclick=()=>rmSend('no');$('rmCancel').onclick=()=>rmSend('cancel');
  $('navFirst').onclick=()=>ana()?anaGo(0):navGo(0);
  $('navPrev').onclick=()=>ana()?anaGo(view.moves.length-1):navGo((navAt===null?view.moves.length:navAt)-1);
  $('navNext').onclick=()=>ana()?anaGo(view.moves.length+1):navGo(navAt===null?null:navAt+1);
  $('navLast').onclick=()=>ana()?anaGo(Infinity):navGo(null);
  if($('navBrP')){$('navBrP').onclick=()=>anaBr(-1);$('navBrN').onclick=()=>anaBr(1);$('navAltU').onclick=()=>anaSib(-1);$('navAltD').onclick=()=>anaSib(1);}
  document.addEventListener('keydown',e=>{if(!view||/^(INPUT|TEXTAREA|SELECT)$/.test((e.target&&e.target.tagName)||''))return;
    if(e.key==='Escape'&&(hintMv||busy==='hint')){hintOff();return;}
    if(e.key==='Escape'&&GAME.preparing()){GAME.cancel();return;}
    if($('nav').hidden)return;
    // ← → move by move (with Shift: start, end), Home End; analysis: ↑ ↓ the branchings, with Shift the variations of the move shown
    if(e.altKey||e.ctrlKey||e.metaKey)return;const sh=e.shiftKey,ky=e.key;
    if(ana()){const k=view.moves.length,f={ArrowLeft:()=>anaGo(sh?0:k-1),ArrowRight:()=>anaGo(sh?Infinity:k+1),Home:()=>anaGo(0),End:()=>anaGo(Infinity),
        ArrowUp:()=>sh?anaSib(-1):anaBr(-1),ArrowDown:()=>sh?anaSib(1):anaBr(1)}[ky];if(!f)return;e.preventDefault();f();return;}
    const n=view.moves.length,k=navAt===null?n:navAt,go={ArrowLeft:sh?0:k-1,ArrowRight:sh?null:k+1,Home:0,End:null}[ky];if(go===undefined)return;e.preventDefault();navGo(go);});
  // Home: leave the game and come back to the game's own start page
  $('homeBtn').onclick=()=>{try{stopAI();}catch(e){}C.stop=true;clearTimeout(C.t);try{peer&&peer.destroy();}catch(e){}peer=null;wpeerStop();setHash('');location.reload();};
  // Header breadcrumb: games -> the index; game name -> this game's start page; confirm before leaving a game in progress
  const liveGame=()=>!!view&&mySeat>=0&&!!view.started&&$('endCard').hidden&&!$('game').hidden;
  $('crumbHome').onclick=e=>{if(liveGame()&&!confirm(t('leaveQ')))e.preventDefault();};
  $('crumbGame').onclick=e=>{e.preventDefault();if(liveGame()&&!confirm(t('leaveQ')))return;$('homeBtn').click();};
  if($('testForm'))$('testForm').addEventListener('submit',e=>{e.preventDefault();startTest(GAME.form('t'));});
  if($('faceForm'))$('faceForm').addEventListener('submit',e=>{e.preventDefault();const tcx=TCS.find(x=>x.id===$('fTc').value)||TCS[TCS.length-1];LS.set(K('local-tc'),tcx.id);
    startLocal(GAME.form('f'),tcx.id==='none'?null:{base:tcx.base,inc:tcx.inc});});
  $('playBtn').onclick=()=>homeStep('play');$('anaBtn').onclick=()=>homeStep('ana');
  $('newBack').onclick=()=>homeStep(homeK==='free'||homeK==='load'?'ana':'');
  document.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>homeStep(b.dataset.pick));
  // the game mode: the modes this game has (no computer without its AI), the last one chosen
  {const ms=$('modeSel'),opts=()=>[...ms.children].map(o=>o.getAttribute('value'));if(!$('aiForm'))for(const o of [...ms.children])if(o.getAttribute('value')==='ai')ms.removeChild(o);
    const lm=LS.get(K('mode'),'link');if(opts().includes(lm))ms.value=lm;
    ms.onchange=()=>{LS.set(K('mode'),ms.value);homeStep('play');};}
  $('loadForm').addEventListener('submit',e=>{e.preventDefault();const x=$('sgfFile').files&&$('sgfFile').files[0];if(!x){$('sgfErr').textContent=t('sgfNoFile');return;}
    x.text().then(txt=>{const er=sgfLoad(txt);$('sgfErr').textContent=er||'';});});
  $('chatForm').onsubmit=e=>{e.preventDefault();chatSend();};$('chatName').onclick=()=>{sheet(false);chatUp(false);nameOv('watch');};
  $('voiceAsk').onclick=voiceAsk;$('voiceCancel').onclick=()=>{if(V.st==='out'){voiceSend('cancel');V={st:'off',note:''};voiceUi();}};
  $('voiceYes').onclick=()=>voiceAnswer(true);$('voiceNo').onclick=()=>voiceAnswer(false);$('voiceMute').onclick=voiceMute;$('voiceHang').onclick=()=>{voiceStop(t('vEnd'),true);mVoiceSet(false);};
  {const r=$('voiceVol');r.value=voiceVol();r.addEventListener('input',()=>{LS.set('games-voicevol',+r.value);if(V.audio)V.audio.volume=(+r.value)/100;});}
  $('chatBox').addEventListener('toggle',()=>{if(view){chatRender();sheetAttn();}chatFit();});
  {const cb=document.createElement('button');cb.type='button';cb.id='chatBtn';cb.className='chatbtn';cb.textContent='💬';cb.hidden=true;$('optBtn').before(cb);cb.onclick=()=>chatUp(true);
    const bg=document.createElement('div');bg.className='sheetbg chatbg';bg.id='chatBg';bg.hidden=true;bg.onclick=()=>chatUp(false);document.body.appendChild(bg);
    const b=$('chatBox');$('chatSum').addEventListener('click',e=>{if(isWide())return;e.preventDefault();chatUp(!document.documentElement.classList.contains('chatup'));});
    b.addEventListener('click',e=>{if(isWide()||document.documentElement.classList.contains('chatup')||e.target.closest('summary,form,button,input'))return;chatUp(true);});
    window.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.documentElement.classList.contains('chatup')){e.preventDefault();e.stopImmediatePropagation();chatUp(false);}},true);
    if(typeof ResizeObserver==='function')new ResizeObserver(()=>chatMode()).observe(b);
    // phones: writing opens the chat over the board (the field under the board would be under the keyboard), and the
    // open chat sits on the keyboard: --kb (the keyboard's height) and --vvh (the visible height), from the visual viewport
    const up=()=>{if(!isWide()&&!document.documentElement.classList.contains('chatup'))chatUp(true);};
    $('chatIn').addEventListener('pointerdown',up);$('chatIn').addEventListener('focus',up);
    $('chatIn').addEventListener('blur',()=>setTimeout(()=>{if(!isWide()&&document.activeElement!==$('chatIn')&&(scrollX||scrollY))scrollTo(0,0);},150));
    const vv=window.visualViewport;if(vv){const kb=()=>{const R=document.documentElement,k=Math.max(0,Math.round(R.clientHeight-vv.height-vv.offsetTop));   // (the layout viewport: Chrome on Android shrinks innerHeight with the keyboard)
      R.style.setProperty('--kb',k+'px');R.style.setProperty('--vvh',Math.round(vv.height)+'px');
      R.style.setProperty('--vvb',Math.round(vv.offsetTop+vv.height)+'px');R.classList.add('vv');   // the bottom of what is seen: the open chat stands on it
      if(R.classList.contains('chatup')){chatSize();const l=$('chatList');if(l&&k)l.scrollTop=l.scrollHeight;}};
      vv.addEventListener('resize',kb);vv.addEventListener('scroll',kb);kb();}}window.addEventListener('resize',()=>chatFit());
  $('nameOv').onsubmit=e=>{e.preventDefault();nameOvDone(false);};$('nameOvAnon').onclick=()=>nameOvDone(true);
  if(GAME.levels){for(const id of ['aLevel','gLevel'])if($(id))$(id).addEventListener('change',e=>{level=e.target.value;LS.set(K('level'),level);$('aLevel').value=level;$('gLevel').value=level;});
    if($('aiForm'))$('aiForm').addEventListener('submit',e=>{e.preventDefault();const nm=$('hName').value.trim();if(nm)nickSet(nm);startAI(aiFirst(),GAME.form('a'));});}
  document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>{const inp=$(b.dataset.copy);inp.select();
    const ok=()=>{b.textContent=t('copied');setTimeout(()=>b.textContent=t(b.dataset.i18n||'copy'),1500);};
    try{navigator.clipboard.writeText(inp.value).then(ok,()=>{try{document.execCommand('copy');ok();}catch(e){}});}catch(e){try{document.execCommand('copy');ok();}catch(e2){}}});
  $('hName').value=nickGet();$('jName').value=nickGet();
  $('createForm').addEventListener('submit',e=>{e.preventDefault();if(typeof Peer==='undefined'){status(t('noPeer'));return;}
    const typed=$('hName').value.trim(),nm=typed||t('p1');if(typed)nickSet(typed);   // no name typed: « Player 1 » for this game only, the saved nickname stays
    const fv=$('cFirst').value,first=fv==='me'?'host':fv==='opp'?'guest':(Math.random()<.5?'host':'guest');const tcx=TCS.find(x=>x.id===$('cTc').value)||TCS[0];LS.set(K('tc'),tcx.id);const tc=tcx.id==='none'?null:{base:tcx.base,inc:tcx.inc};
    const names=first==='host'?[nm,'']:['',nm];
    const th=[null,null];th[first==='host'?0:1]=hh(MYID);
    Object.assign(H,{code:newCode(6),wcode:newCode(8),guestCid:null,game:{size:GAME.size,...GAME.form('c'),hold:null,tc,first,names,moves:[],clock:[tc?tc.base:0,tc?tc.base:0],running:false,result:null,started:false,ready:[false,false],th,paused:false,ver:0}});
    H.turnStart=Date.now();hostStart(null);});
  $('joinForm').addEventListener('submit',e=>{e.preventDefault();joinClick(false);});
  $('jWatch').onclick=()=>joinClick(true);
  $('resumeBtn').onclick=()=>{const s=LS.get(K('p2p-host'),null);if(s&&unfinished(s.game)){hostStart(s);return;}const sg=LS.get(K('p2p-guest'),null);if(sg)clientStart(sg.code,sg.name||nickGet()||t('p2'),false);};
  $('rcCopy').onclick=()=>{if(!view)return;const inp=$('rcTxt');inp.value=exportCode();$('rcBox').hidden=true;
    try{navigator.clipboard.writeText(inp.value).then(()=>{$('rcCopy').textContent=t('copied');setTimeout(()=>$('rcCopy').textContent=t('cCode'),1500);},()=>{$('rcBox').hidden=false;inp.select();});}catch(e){$('rcBox').hidden=false;inp.select();}};
  $('rForm').addEventListener('submit',e=>{e.preventDefault();let p;try{p=importCode($('rIn').value);}catch(x){$('joinErr').textContent=t('badResume');$('rSeats').innerHTML='';return;}
    const box=$('rSeats');box.innerHTML=[0,1].map(k=>`<button type="button" class="primary" data-rseat="${k}">${t('iam',{n:String(p.names[k]||t(k?'p2':'p1')).replace(/[&<>"']/g,'')})}</button>`).join('');
    box.querySelectorAll('[data-rseat]').forEach(b=>b.onclick=()=>resumeAs(+b.dataset.rseat,p));});
  init();sndBind();}
