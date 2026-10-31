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
//  i18n:{fr,en}                  the game's strings, merged over the shared ones (title and rules required)
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
//  waitStatus?(c)                the opponent's turn, live: calls status() and returns true, or false for « X to move »
//  pendText?(mv,st)              [message, confirm label] for a move awaiting confirmation
//  hintable?(o), hintOk?(mv)     Hint offered now · a found move may be shown
//  playerCard?(el,p,d)          Add game content to seat p's card (d: the position shown)
//  logDesc?(e)                   Extra description line under a move-list entry
//  logText?(e,r)                 text of a move-list entry (default e.txt)
//  applyStatic?()                the game's static texts and selects, on load and on a language switch
//  home()                        draws the board shown on the home page (and again when the coordinates are switched)
//  simMode?(g), simHold?(g,r), holdLegal?(r,s,code,g)  simultaneous hidden first moves over the network: the rules use it ·
//                                it is that phase now · seat s's held code is legal
//  clockOff?(v,st)               no clock runs in st (face to face)
//  levels, levelDefault, hintLevel  computer levels {key:opt} (labels lv_key), the default key, the options of hints
//  aiSrc(), aiPos(st), aiSearch(st,opt), aiOpt?(v), aiView?(st), evalInfo(res,st)  worker source defining
//                                aiSearch(pos,opt) on the aiPos() form · page fallback search · extra search options ·
//                                position the computer is shown · {k,d} opinion line or null
const $=id=>document.getElementById(id);
const LS={get(k,d){try{const v=localStorage.getItem(k);return v===null?d:JSON.parse(v);}catch(e){return d;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}},del(k){try{localStorage.removeItem(k);}catch(e){}}};
const TCS=[{id:'20+10',base:20*60e3,inc:10e3},{id:'10+5',base:10*60e3,inc:5e3},{id:'5+3',base:5*60e3,inc:3e3},{id:'3+2',base:3*60e3,inc:2e3},{id:'none'}];
const I18C={fr:{
 computer:"L'ordinateur",level:"Niveau",lv_debutant:"Débutant",lv_moyen:"Moyen",lv_fort:"Fort",undo:"Annuler le dernier coup",hint:"Suggestion",hintPlay:"Jouer ce coup",dismiss:"Ignorer",reset:"Réinitialiser",pend_mv:"Coup : {m}",st_yourTurn:"À vous de jouer.",st_turn:"Au tour de {n}.",hint_move:"Suggestion : {m}",st_aiThinking:"L'ordinateur réfléchit…",hintBusy:"Recherche d'une suggestion…",ai_eq:"Ordinateur : position équilibrée (profondeur {d}).",ai_better:"Ordinateur : se juge mieux (profondeur {d}).",ai_much:"Ordinateur : se juge nettement mieux (profondeur {d}).",ai_worse:"Ordinateur : se juge moins bien (profondeur {d}).",ai_muchWorse:"Ordinateur : se juge nettement moins bien (profondeur {d}).",ai_win:"Ordinateur : gain forcé en vue.",ai_lost:"Ordinateur : se sait perdu.",ai_forced:"Ordinateur : coup forcé.",leaveQ:"Une partie est en cours. La quitter ?",st_waitHost:"Coup envoyé, en attente de l'hôte…",nav_first:"Début",nav_prev:"Précédent",nav_next:"Suivant",nav_last:"Aller à la fin",opts:"Options",nav_pos:"Coup {k} / {n}",home:"Accueil",rematch:"Rejouer",accept:"Accepter",decline:"Refuser",rm_ask:"{n} propose une nouvelle partie, côtés inversés.",rm_sent:"Proposition envoyée.",rm_no:"{n} a refusé.",
 sub:"pair à pair",create:"Créer une partie",nick:"Votre pseudo",firstIs:"Qui commence",rnd:"Aléatoire",me:"Moi",opp:"Mon adversaire",tc:"Pendule",tc_none:"Sans pendule",tc_fmt:"{m} min + {s} s par coup",createBtn:"Créer la partie",
 join:"Rejoindre une partie avec un code",code:"Code de la partie",play:"Jouer",watch:"Observer",linkHint:"Avec un lien d'invitation, la page se connecte toute seule.",
 pickOpp:"Contre qui ?",back:"Retour",m_link:"Inviter par un lien",m_linkTxt:"Un adversaire sur un autre appareil, avec un lien ou un code.",m_ai:"Ordinateur",m_aiTxt:"Trois niveaux, pour s'entraîner.",m_face:"Face à face",m_faceTxt:"Deux joueurs sur le même écran, avec pendule si vous voulez.",m_free:"Libre",m_freeTxt:"Les deux camps sur cet écran, sans pendule, avec annulation et suggestions : pour essayer et analyser.",localBtn:"Commencer la partie",
 haveCode:"Vous avez reçu un code ?",joinOpen:"Rejoindre une partie",invitedT:"Vous êtes invité à une partie",invitedTxt:"Choisissez le nom que verra votre adversaire, puis cliquez Jouer.",invOther:"Autres choix",
 inProgress:"Partie en cours",inProgressTxt:"Vous hébergiez une partie inachevée.",inProgressGuest:"Vous jouiez une partie inachevée sur l'invitation d'un autre joueur.",resumeBtn:"Reprendre la partie",more:"Autres options",resume:"Reprendre une partie",resumeCode:"Code de reprise",load:"Charger",
 resumeHint:"Si une partie n'a pas pu être rétablie, collez le code de reprise copié pendant la partie. Vous l'hébergez à nouveau et envoyez le nouveau code à votre adversaire.",
 cancel:"Annuler",confirmMv:"Confirmer",
 start:"Départ",startBtn:"Démarrer la partie",pass:"Passer",resign:"Abandonner",resignNo:"Continuer",resignYes:"Confirmer l'abandon",
 invite:"Inviter",copy:"Copier",copied:"Copié",linkOpp:"Lien pour votre adversaire",linkWatch:"Lien pour les spectateurs",
 fileNote:"Ce fichier est ouvert depuis votre disque : les liens ne marcheront pour personne d'autre. Envoyez ce fichier HTML et le code : la personne l'ouvre, saisit le code et choisit Jouer ou Observer.",
 hostNote:"La partie tourne dans votre navigateur. Si vous décrochez, votre adversaire prend le relais après quelques secondes ; les pendules s'arrêtent pendant l'absence d'un joueur.",
 rcTxt:"Dernier recours si la connexion ne revient pas : l'un ou l'autre colle ce code dans « Reprendre une partie » sur la page d'accueil.",rcCopy:"Copier le code de reprise",sounds:"Sons",moves:"Coups",
 noSpect:"Aucun spectateur",spect:"{n} spectateur",spects:"{n} spectateurs",you:"Vous",p1:"Joueur 1",p2:"Joueur 2",
 iam:"Je suis {n}",badResume:"Ce code de reprise n'est pas valide.",codeLen:"Saisissez le code reçu (6 caractères).",
 noPeer:"La bibliothèque de connexion n'a pas pu se charger : vérifiez votre accès Internet, puis rechargez la page.",
 st_open:"Ouverture de la table…",st_lostMm:"Contact perdu avec le service de mise en relation, reconnexion…",st_noMm:"Pas de connexion au service de mise en relation. Vérifiez votre accès Internet.",
 st_conn:"Connexion à la table…",st_noTable:"Table introuvable : l'hôte n'a pas la page ouverte. Nouvel essai…",st_nack:"Coup refusé par l'hôte : la position a changé. Rejouez.",st_noHost:"Pas de connexion à l'hôte : le coup n'a pas été envoyé.",st_noHost2:"Pas de connexion à l'hôte.",
 t_refused:"Deux joueurs sont déjà dans cette partie. Vous pouvez l'observer : cliquez Observer.",invited:"Vous êtes invité à jouer : saisissez votre pseudo, puis cliquez Jouer.",
 draw:"Nulle : {why}.",youWin:"Vous gagnez : {why}.",wins:"{n} gagne : {why}.",st_waitOpp:"En attente de votre adversaire : envoyez-lui le code de la partie.",
 st_pausedHost:"{n} est injoignable. Les pendules sont arrêtées jusqu'à son retour.",st_pausedGuest:"Hôte injoignable, reconnexion… Les pendules sont arrêtées.",st_pausedWatch:"Un joueur est déconnecté. Les pendules sont arrêtées.",
 st_waitBoth:"En attente du démarrage par les deux joueurs.",st_waitClick:"En attente que {n} clique Démarrer la partie.",st_bothHere:"Les deux joueurs sont là. Cliquez Démarrer la partie, chacun de votre côté.",
 ready:"{n} est prêt. ",clocksStart:"Les pendules démarrent quand les deux ont cliqué.",waitingOpp:"En attente de l'adversaire…",
 w_time:"temps écoulé",w_resign:"abandon",w_bad:"coup illisible",coords:"Coordonnées"
},en:{
 computer:"The computer",level:"Level",lv_debutant:"Beginner",lv_moyen:"Medium",lv_fort:"Strong",undo:"Undo last move",hint:"Hint",hintPlay:"Play this move",dismiss:"Dismiss",reset:"Reset",pend_mv:"Move: {m}",st_yourTurn:"Your move.",st_turn:"{n} to move.",hint_move:"Hint: {m}",st_aiThinking:"The computer is thinking…",hintBusy:"Looking for a hint…",ai_eq:"Computer: balanced position (depth {d}).",ai_better:"Computer: thinks it is better (depth {d}).",ai_much:"Computer: thinks it is clearly better (depth {d}).",ai_worse:"Computer: thinks it is worse (depth {d}).",ai_muchWorse:"Computer: thinks it is clearly worse (depth {d}).",ai_win:"Computer: sees a forced win.",ai_lost:"Computer: knows it is lost.",ai_forced:"Computer: forced move.",leaveQ:"A game is in progress. Leave it?",st_waitHost:"Move sent, waiting for the host…",nav_first:"First",nav_prev:"Previous",nav_next:"Next",nav_last:"Go to end",opts:"Options",nav_pos:"Move {k} / {n}",home:"Home",rematch:"Rematch",accept:"Accept",decline:"Decline",rm_ask:"{n} offers a new game, sides swapped.",rm_sent:"Offer sent.",rm_no:"{n} declined.",
 sub:"peer to peer",create:"Create a game",nick:"Your nickname",firstIs:"Who starts",rnd:"Random",me:"Me",opp:"My opponent",tc:"Time control",tc_none:"No clock",tc_fmt:"{m} min + {s} s per move",createBtn:"Create game",
 join:"Join a game with a code",code:"Game code",play:"Play",watch:"Watch",linkHint:"With an invitation link, the page connects on its own.",
 pickOpp:"Against whom?",back:"Back",m_link:"Invite with a link",m_linkTxt:"An opponent on another device, with a link or a code.",m_ai:"Computer",m_aiTxt:"Three levels, to practise.",m_face:"Face to face",m_faceTxt:"Two players on the same screen, with a clock if you like.",m_free:"Free play",m_freeTxt:"Both sides on this screen, no clock, with undo and hints: to try things and analyse.",localBtn:"Start the game",
 haveCode:"Received a code?",joinOpen:"Join a game",invitedT:"You are invited to a game",invitedTxt:"Choose the name your opponent will see, then click Play.",invOther:"Other choices",
 inProgress:"Game in progress",inProgressTxt:"You were hosting an unfinished game.",inProgressGuest:"You were playing an unfinished game at another player's invitation.",resumeBtn:"Resume game",more:"Other options",resume:"Resume a game",resumeCode:"Resume code",load:"Load",
 resumeHint:"If a game could not be restored, paste the resume code copied during the game. You host it again and send the new code to your opponent.",
 cancel:"Cancel",confirmMv:"Confirm",
 start:"Start",startBtn:"Start the game",pass:"Pass",resign:"Resign",resignNo:"Keep playing",resignYes:"Confirm resignation",
 invite:"Invite",copy:"Copy",copied:"Copied",linkOpp:"Link for your opponent",linkWatch:"Link for spectators",
 fileNote:"This file is open from your disk, so links will not work for anyone else. Send them this HTML file and the code: they open it, enter the code and choose Play or Watch.",
 hostNote:"The game runs in your browser. If you drop out, your opponent takes over after a few seconds; the clocks stop while a player is away.",
 rcTxt:"Last resort if the connection cannot be restored: either player can paste this code into “Resume a game” on the home page.",rcCopy:"Copy the resume code",sounds:"Sounds",moves:"Moves",
 noSpect:"No spectators",spect:"{n} spectator",spects:"{n} spectators",you:"You",p1:"Player 1",p2:"Player 2",
 iam:"I am {n}",badResume:"This resume code is not valid.",codeLen:"Enter the code you received (6 characters).",
 noPeer:"The connection library could not load: check your Internet access, then reload the page.",
 st_open:"Opening the table…",st_lostMm:"Lost contact with the matchmaking service, reconnecting…",st_noMm:"No connection to the matchmaking service. Check your Internet access.",
 st_conn:"Connecting to the table…",st_noTable:"Table not found: the host does not have the page open. Retrying…",st_nack:"Move rejected by the host: the position has changed. Play again.",st_noHost:"No connection to the host: the move was not sent.",st_noHost2:"No connection to the host.",
 t_refused:"Two players are already in this game. You can still watch it: click Watch.",invited:"You are invited to play: enter your nickname, then click Play.",
 draw:"Draw: {why}.",youWin:"You win: {why}.",wins:"{n} wins: {why}.",st_waitOpp:"Waiting for your opponent: send them the game code.",
 st_pausedHost:"{n} is unreachable. The clocks are stopped until they are back.",st_pausedGuest:"Host unreachable, reconnecting… The clocks are stopped.",st_pausedWatch:"A player is disconnected. The clocks are stopped.",
 st_waitBoth:"Waiting for both players to start.",st_waitClick:"Waiting for {n} to click Start the game.",st_bothHere:"Both players are here. Click Start the game, each on your side.",
 ready:"{n} is ready. ",clocksStart:"The clocks start once both players have clicked.",waitingOpp:"Waiting for your opponent…",
 w_time:"time ran out",w_resign:"resignation",w_bad:"unreadable move",coords:"Coordinates"
}};
let I18N=I18C;
let lang=(()=>{try{return JSON.parse(localStorage.getItem('games-lang'))||JSON.parse(localStorage.getItem('volo-lang'));}catch(e){return null;}})()||((navigator.language||'fr').toLowerCase().startsWith('fr')?'fr':'en');
function t(k,v){let s=I18N[lang][k];if(s===undefined)s=I18N.en[k];if(s===undefined)return k;if(v)s=s.replace(/\{(\w+)\}/g,(m,n)=>v[n]!==undefined?v[n]:m);return s;}
const tcLabel=x=>x.id==='none'?t('tc_none'):t('tc_fmt',{m:x.base/60e3,s:x.inc/1e3});
const K=s=>GAME.id+'-'+s;   // this game's localStorage keys
function applyStatic(){document.documentElement.lang=lang;document.title=t('title');$('ttl').textContent=t('title');
  document.querySelectorAll('[data-i18n]').forEach(e=>{e.textContent=t(e.dataset.i18n);});
  document.querySelectorAll('[data-i18n-t]').forEach(e=>{e.title=t(e.dataset.i18nT);e.setAttribute('aria-label',e.title);});
  document.querySelectorAll('[data-lang]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.lang===lang?'true':'false'));
  $('rules').innerHTML=t('rules');
  const sel=$('cTc');if(sel){const cur=sel.value||LS.get(K('tc'),null)||GAME.tcDefault||'20+10';
    sel.innerHTML=TCS.map(x=>`<option value="${x.id}" ${x.id===cur?'selected':''}>${tcLabel(x)}</option>`).join('');}
  // face to face: its own time control, no clock by default
  const fs=$('fTc');if(fs){const fcur=fs.value||LS.get(K('local-tc'),'none');fs.innerHTML=TCS.map(x=>`<option value="${x.id}" ${x.id===fcur?'selected':''}>${tcLabel(x)}</option>`).join('');}
  if(GAME.levels)for(const id of ['aLevel','gLevel']){const s=$(id);if(!s)continue;s.innerHTML=Object.keys(GAME.levels).map(k=>`<option value="${k}">${t('lv_'+k)}</option>`).join('');s.value=level;}
  if(GAME.applyStatic)GAME.applyStatic();
  const sg=$('resumeBtn').dataset.guest;$('resumeTxt').textContent=t(sg?'inProgressGuest':'inProgressTxt');}
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
  const v=GAME.replay(rules,moves);if(!v.over&&result)v.over={w:result.winner,why:result.reason==='time'?'w_time':'w_resign'};
  memoKey=key;memoVal=v;return v;}
const sameRules=(a,b)=>JSON.stringify(GAME.rules(a))===JSON.stringify(GAME.rules(b));

// ---------- network (PeerJS) ----------
// Roles: the host (creator) is authoritative for rules and clock; the guest and spectators connect to it.
let role=null;          // 'host' | 'guest' | 'watch' | 'ai' (against the computer) | 'local' (face to face) | 'test' (free play): no network for the last three
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
function status(txt,cls,btns){const s=$('status');s.className='status'+(cls?' '+cls:'');s.textContent=txt;if($('game').hidden)s.hidden=!txt;   // home: only for a message
  const n=$('notice');if(!n)return;btns=(btns||[]).filter(Boolean);n.className='notice on'+(cls?' '+cls:'')+(btns.length?' has-btns':'');n.textContent='';
  if(txt){const sp=document.createElement('span');sp.className='msg';sp.textContent=txt;sp.title=txt;n.appendChild(sp);}
  if(btns.length){const bx=document.createElement('div');bx.className='btns';n.appendChild(bx);
    for(const b of btns){const e=document.createElement('button');e.type='button';e.textContent=b.label;e.title=b.label;if(b.primary)e.className='primary';if(b.id)e.id=b.id;e.onclick=b.on;
      if(b.hover){e.onpointerenter=ev=>{if(ev.pointerType!=='touch')b.hover(true);};e.onpointerleave=()=>b.hover(false);}bx.appendChild(e);}}}
function quiet(){const n=$('notice');if(n){n.className='notice';n.textContent='';}}
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
  running:run,elapsed:run?Date.now()-H.turnStart:0,result:g.result,guestOn:!!H.guestConn,watchers:H.watchers.size,
  started:!!g.started,ready:(g.ready||[false,false]).slice(),th:g.th.slice(),paused:!!g.paused,ver:g.ver||0,rematch:g.rematch||null};}
// Rematch: either player offers it once the game is over; on acceptance a new game starts at once under the same code,
// sides swapped (the players exchange seats), same time control and same rule set.
function rematchOp(s,op){const g=H.game,rm=g.rematch;if(!replay(g,g.moves,g.result).over||!g.names[0]||!g.names[1])return;
  if(op==='ask'&&(!rm||rm.st==='no'))g.rematch={from:s,st:'ask'};
  else if(op==='cancel'&&rm&&rm.from===s&&rm.st==='ask')g.rematch=null;
  else if(op==='no'&&rm&&rm.from!==s&&rm.st==='ask')g.rematch={from:rm.from,st:'no'};
  else if(op==='yes'&&rm&&rm.from!==s&&rm.st==='ask'){
    g.first=g.first==='host'?'guest':'host';g.names.reverse();g.th.reverse();g.moves=[];g.hold=null;g.result=null;g.rematch=null;
    g.clock=[g.tc?g.tc.base:0,g.tc?g.tc.base:0];g.started=true;g.running=true;g.ready=[true,true];g.paused=false;g.ver=(g.ver||0)+1;H.turnStart=Date.now();
    mySeat=1-mySeat;if(H.guestConn){H.guestConn.seat=1-H.guestConn.seat;try{H.guestConn.send({t:'welcome',role:'guest',seat:H.guestConn.seat});}catch(e){}}}
  else return;
  hostBroadcast();}
function rmSend(op){if(role==='host')rematchOp(mySeat,op);else if(C.conn&&C.conn.open)C.conn.send({t:'rematch',op});}
// The clocks stop only when it is the absent player's turn: while it is my turn, my clock keeps running.
function hostSyncPause(){const g=H.game;if(!g.started||g.result){g.paused=false;return;}const live=!!(H.guestConn&&H.guestConn.open);
  const r=replay(g,g.moves,g.result),absentTurn=!r.over&&r.st.turn!==mySeat,want=!live&&absentTurn&&!simHold(g,r);   // no clock, so no pause, in a simultaneous phase
  if(want&&!g.paused){if(g.running&&!r.over){const tt=r.st.turn;g.clock[tt]=Math.max(0,g.clock[tt]-(Date.now()-H.turnStart));}H.turnStart=Date.now();g.paused=true;}
  else if(!want&&g.paused){g.paused=false;H.turnStart=Date.now();}}
const PID=c=>GAME.id+'-p2p-'+c;
const cleanCode=v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
function setHash(h){try{history.replaceState(null,'',h?'#'+h:location.pathname+location.search);}catch(e){}}
function hostSave(){const g=H.game;LS.set(K('p2p-host'),{code:H.code,guestCid:H.guestCid,game:g,elapsed:g.running&&!g.paused&&!g.result?Date.now()-H.turnStart:0});}
function hostReady(s){const g=H.game;if(g.started||g.result||!g.names[0]||!g.names[1])return;g.ready[s]=true;
  if(g.ready[0]&&g.ready[1]){g.started=true;g.running=true;H.turnStart=Date.now();}hostBroadcast();}
function hostBroadcast(bump){if(bump)H.game.ver=(H.game.ver||0)+1;hostSyncPause();hostSave();const pub=hostPublic();
  for(const c of H.conns)if(c.open)c.send({t:'state',game:c===H.guestConn?{...pub,myHold:myHoldOf(c.seat)}:pub});
  showState({...pub,myHold:myHoldOf(mySeat)});}
function hostStart(saved){role='host';H.conns=new Set();H.watchers=new Set();H.guestConn=null;C.stop=true;clearTimeout(C.t);clearTimeout(C.ct);
  if(saved){Object.assign(H,{code:saved.code,guestCid:saved.guestCid,game:saved.game});H.turnStart=Date.now()-(saved.elapsed||0);}
  H.peerId=PID(H.code);const g0=H.game;if(!g0.ready)g0.ready=[false,false];if(g0.started===undefined)g0.started=!!(g0.running||g0.moves.length);Object.assign(g0,GAME.rules(g0));
  if(!g0.th){const hs=g0.first==='host'?0:1;g0.th=[null,null];g0.th[hs]=hh(MYID);g0.th[1-hs]=H.guestCid?hh(H.guestCid):null;}
  mySeat=g0.th.indexOf(hh(MYID));if(mySeat<0)mySeat=g0.first==='host'?0:1;
  setHash('host-'+H.code);status(t('st_open'));showGame();
  const me=newPeer(H.peerId);peer=me;
  me.on('open',()=>{if(peer!==me)return;fillCodes();hostBroadcast();});
  me.on('connection',conn=>{if(peer!==me){try{conn.close();}catch(e){}return;}conn.on('data',d=>{if(peer===me)hostOnData(conn,d);});conn.on('close',()=>{if(peer===me)hostDrop(conn);});conn.on('error',()=>{if(peer===me)hostDrop(conn);});});
  me.on('disconnected',()=>{if(peer!==me)return;status(t('st_lostMm'));setTimeout(()=>{try{if(!me.destroyed)me.reconnect();}catch(e){}},1500);});
  me.on('error',e=>{if(peer!==me)return;
    if(e.type==='unavailable-id'){try{me.destroy();}catch(_){}becomeClient();}
    else if(e.type==='network'||e.type==='server-error'||e.type==='socket-error')status(t('st_noMm'));});}
function becomeClient(){const pub={...hostPublic(),myHold:myHoldOf(mySeat)},code=H.code,seat=mySeat,nm=H.game.names[seat]||nickGet()||t('p1');role=null;
  if(pub.running&&!pub.result){const r=replay(pub,pub.moves,pub.result);if(!r.over)pub.clock[r.st.turn]=Math.max(0,pub.clock[r.st.turn]-pub.elapsed);}
  clientStart(code,nm,false);role='guest';mySeat=seat;view={...pub,running:false,elapsed:0,paused:pub.started&&!pub.result,recvAt:Date.now()};C.lostSince=Date.now();renderGame();}
function becomeHost(){if(!view)return;if(C.pending){pendClear();delete view.runSeat;}LS.del(K('p2p-guest'));C.stop=true;clearTimeout(C.t);clearTimeout(C.ct);const old=peer;peer=null;try{old&&old.destroy();}catch(e){}
  const rem=remaining(),v=view;
  H.code=C.code;H.guestCid=null;H.game={size:v.size,...GAME.rules(v),hold:v.myHold&&!v.moves.length?(mySeat===0?[v.myHold,null]:[null,v.myHold]):null,tc:v.tc||null,first:v.first,names:v.names.slice(),moves:v.moves.slice(),clock:rem,running:!!v.started,result:v.result,started:!!v.started,
    ready:(v.ready||[false,false]).slice(),th:(v.th||[null,null]).slice(),paused:!!v.started&&!v.result,ver:v.ver||0};
  if(H.game.th.indexOf(hh(MYID))<0)H.game.th[mySeat]=hh(MYID);
  H.turnStart=Date.now();hostStart(null);}
function hostDrop(conn){H.conns.delete(conn);H.watchers.delete(conn);if(H.guestConn===conn){H.guestConn=null;}hostBroadcast();}
function hostOnData(conn,d){if(!d||typeof d!=='object')return;conn.lastSeen=Date.now();if(d.t==='ping')return;const g=H.game;
  if(d.t==='hello'){
    const th=hh(d.cid);let s=d.role==='play'?g.th.indexOf(th):-1;
    if(d.role==='play'&&s<0){s=g.th[1-mySeat]?-1:1-mySeat;}
    if(d.role==='play'&&s>=0&&s!==mySeat){
      if(H.guestConn&&H.guestConn!==conn){try{H.guestConn.close();}catch(e){}}
      g.th[s]=th;H.guestCid=d.cid;H.guestConn=conn;conn.seat=s;H.conns.add(conn);if(d.name)g.names[s]=String(d.name).slice(0,24);
      const o=d.s;if(o&&typeof o==='object'&&o.size===g.size&&sameRules(o,g)&&Array.isArray(o.moves)&&o.moves.length>g.moves.length&&g.moves.every((x,k)=>o.moves[k]===x)){
        g.moves=o.moves.slice();g.clock=o.clock.slice();g.result=o.result||null;g.started=!!o.started;g.running=!!o.started;g.paused=true;H.turnStart=Date.now();}
      // a move the guest validated in a simultaneous phase that this host does not have (the host took over, or reloaded without it)
      else if(o&&typeof o==='object'&&typeof o.myHold==='string'&&!g.moves.length&&simMode(o)===simMode(g))hostHold(s,o.myHold);
      conn.send({t:'welcome',role:'guest',seat:s});hostBroadcast();return;}
    if(d.role==='play'){conn.send({t:'reject',why:'t_refused'});setTimeout(()=>{try{conn.close();}catch(e){}},800);return;}
    H.conns.add(conn);H.watchers.add(conn);conn.send({t:'welcome',role:'watch',seat:-1});hostBroadcast();return;}
  if(conn!==H.guestConn)return;
  const s=conn.seat;
  if(d.t==='move')hostMove(s,d.n,d.code,conn);
  if(d.t==='start')hostReady(s);
  if(d.t==='resign'&&!g.result&&g.started){g.result={winner:1-s,reason:'resign'};hostBroadcast();}
  if(d.t==='rematch')rematchOp(s,d.op);}
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
  g.moves.push(cc);g.running=true;H.turnStart=now;hostBroadcast(true);return true;}
let saveTick=0;

// --- guest / spectator ---
let C={};   // {code,cid,name,conn,retry}
function clientStart(raw,nm,asWatch){const code=cleanCode(raw);if(code.length<4){$('joinErr').textContent=t('codeLen');return;}
  clearTimeout(C.t);clearTimeout(C.ct);C={hold:null,code,host:PID(code),play:!asWatch,name:nm,cid:MYID,retry:0,lostSince:0};
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
  conn.on('open',()=>{clearTimeout(C.ct);C.retry=0;conn.send({t:'hello',role:C.play?'play':'watch',cid:C.cid,name:C.name,s:mySeat>=0&&view?(C.pending&&C.pending.base||view):null});C.lastSeen=Date.now();});
  conn.on('data',d=>{if(C.conn===conn)clientOnData(d);});
  conn.on('close',()=>{if(C.conn===conn&&!C.stop)clientLost();});}
function clientLost(){if(C.stop)return;C.lostSince=C.lostSince||Date.now();sending=false;if(C.pending)sending=true;
  if(view&&!view.paused&&view.started&&!view.result){const r=replay(view,view.moves,view.result);
    if(!r.over&&r.st.turn!==mySeat){view.clock=remaining();view.running=false;view.elapsed=0;view.paused=true;view.recvAt=Date.now();}renderGame();}
  clientRetry();}
function clientRetry(){if(C.stop||C.t)return;C.t=setTimeout(()=>{C.t=null;if(C.stop)return;
  if(role==='guest'&&mySeat>=0&&view&&C.lostSince&&Date.now()-C.lostSince>8000){becomeHost();return;}
  if(peer&&peer.open)clientConnect();else{if(peer&&!peer.destroyed){try{peer.reconnect();}catch(e){}}clientLost();}},3500);}
function clientOnData(d){if(!d||typeof d!=='object')return;C.lastSeen=Date.now();if(d.t==='ping')return;
  if(d.t==='welcome'){role=d.role;mySeat=d.seat;if(d.note)status(d.note);}
  else if(d.t==='reject'){C.stop=true;C.conn=null;clearTimeout(C.t);try{peer.destroy();}catch(e){}showSetup(t(d.why));$('jCode').value=C.code;}
  else if(d.t==='state'){sending=false;C.lostSince=0;if(C.pending&&d.game.moves.length>C.pending.n)pendClear();
    if(C.hold&&(d.game.myHold===C.hold.code||d.game.moves.length))C.hold=null;
    showState(C.hold&&!d.game.myHold?{...d.game,myHold:C.hold.code}:d.game);if(C.pending){pendView();sending=true;renderGame();}}
  else if(d.t==='nack'){sending=false;if(C.hold){C.hold=null;if(view)view.myHold=null;resetUi();}if(C.pending){if(C.pending.base)view=C.pending.base;pendClear();}C.nackAt=Date.now();setTimeout(()=>{if(view)renderGame();},5000);status(t('st_nack'));renderGame();}}

// ---------- game view ----------
function showGame(){$('setup').hidden=true;$('game').hidden=false;$('status').hidden=true;document.documentElement.classList.add('ingame');}
function showSetup(msg){role=null;view=null;mySeat=-1;setHash('');$('game').hidden=true;sheet(false);document.documentElement.classList.remove('ingame');$('setup').hidden=false;$('joinErr').textContent=msg||'';status(msg||'');}
function showState(g){const prevLen=view?view.moves.length:-1,prevRes=view?JSON.stringify(view.result):'',prevSeat=view?view.mySeatSeen:-2;
  view={...g,recvAt:Date.now(),mySeatSeen:mySeat};
  if(role==='guest'&&mySeat>=0){if(g.result)LS.del(K('p2p-guest'));else LS.set(K('p2p-guest'),{code:C.code,seat:mySeat,name:C.name,view:{...view,running:false,elapsed:0,clock:remaining(),paused:!!view.started,guestOn:false,watchers:0}});}
  if(prevLen!==g.moves.length||prevRes!==JSON.stringify(g.result)||prevSeat!==mySeat)resetUi();
  renderGame();}
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
const canNav=r=>!!view&&(!!r.over||(mySeat<0&&role==='watch'));
function navPos(k){const key=view.moves.slice(0,k).join(',');if(key!==navKey){const keep=[memoKey,memoVal];navVal=replay(view,view.moves.slice(0,k),null);navKey=key;[memoKey,memoVal]=keep;}return navVal;}
function navGo(k){const n=view.moves.length;navAt=k===null||k>=n?null:Math.max(0,k);resetUi();renderGame();}
// Players' names: on one device « Player 1/2 »; against the computer « You » / « The computer »
const seatName=s=>solo()?t(s===0?'p1':'p2'):role==='ai'?(s===mySeat?t('you'):t('computer')):(view.names[s]||t(s===0?'p1':'p2'))+(s===mySeat?' ('+t('you').toLowerCase()+')':'');

function renderGame(){if(!view)return;if(role==='ai')LS.set(AK(),{view,mySeat});else if(role==='test')LS.set(TK(),view);else if(role==='local')localSave();const r=replay(view,view.moves,view.result);
  if(!canNav(r)||navAt!==null&&navAt>=view.moves.length)navAt=null;
  const d=navAt===null?r:navPos(navAt),turn=d.st.turn;
  flip=mySeat===1&&!solo();   // on one device the board stays put: the players adapt
  const mine=navAt===null&&isMyTurn(r),ns=netSim(r),ms=meSt(r);
  const myTurnNow=mySeat>=0&&!!view.started&&!view.paused&&!r.over&&r.st.turn===mySeat;if(myTurnNow&&!lastMine&&view.moves.length)tone(660,.18,.05);lastMine=myTurnNow;
  const o=GAME.board({r,d,mine,ms});
  {const n=view.moves.length,k=navAt===null?n:navAt,on=canNav(r);$('nav').hidden=!on;
    if(on){$('navPos').textContent=t('nav_pos',{k,n});$('navFirst').disabled=$('navPrev').disabled=k===0;$('navNext').disabled=$('navLast').disabled=navAt===null;}}
  const nm=seatName;
  // The bar under the board: the only place for the move commands.
  // Nothing engaged: Undo last move / Hint (where the game allows them) · something engaged: Reset (drops the whole move
  // being prepared), with the game's own commands · move complete: Reset + Confirm · suggestion shown: Play this move +
  // Dismiss · waiting states: the message only.
  const prep=GAME.preparing(),RST={label:t('reset'),on:GAME.cancel};
  const undoB=canUndo()&&!busy&&undoOk(r)?{label:t('undo'),on:doUndo}:null;
  const hintB=canHint()&&!busy&&mine&&(!GAME.hintable||GAME.hintable(o))?{label:t('hint'),on:doHint}:null;
  const idle=[undoB,hintB];
  if(r.over)status(r.over.w<0?t('draw',{why:t(r.over.why)}):r.over.w===mySeat&&!solo()?t('youWin',{why:t(r.over.why)}):t('wins',{n:nm(r.over.w),why:t(r.over.why)}),'win',navAt===null?[undoB]:null);
  else if(busy==='hint')status(t('hintBusy'),'turn',[{label:t('dismiss'),on:hintOff}]);
  else if(role==='ai'&&busy)status(t('st_aiThinking'));
  else if(role==='host'&&!view.names[1-mySeat])status(t('st_waitOpp'));
  else if(view.paused&&view.started)status(role==='host'?t('st_pausedHost',{n:nm(1-mySeat)}):mySeat>=0?t('st_pausedGuest'):t('st_pausedWatch'));
  else if(!view.started)status(mySeat<0?t('st_waitBoth'):(view.ready&&view.ready[mySeat]?t('st_waitClick',{n:nm(1-mySeat)}):t('st_bothHere')));
  else if(mine&&hintOn())status(t('hint_move',{m:GAME.describe(hintMv,ms)}),'turn',[{label:t('hintPlay'),primary:true,on:hintPlay},{label:t('dismiss'),on:hintOff}]);
  else if(mine&&ui.pending){const [msg,ok]=GAME.pendText?GAME.pendText(ui.pending,ms):[t('pend_mv',{m:GAME.describe(ui.pending,ms)}),t('confirmMv')];
    status(msg,'turn',[RST,{label:ok,primary:true,on:()=>{if(ui.pending)send(ui.pending);}}]);}
  else if(sending)quiet();
  else if(ns&&mySeat>=0&&view.myHold)status(t('st_simWait'));
  else if(ns&&mySeat<0)status(t('st_simWatch'));
  else if(mine)GAME.turnStatus({r,o,ms,prep,idle,undoB,RST});
  else if(navAt===null){if(!(GAME.waitStatus&&GAME.waitStatus({r,ns})))status(t('st_turn',{n:nm(r.st.turn)}));}
  else quiet();
  if(role==='guest'&&C.pending&&C.pending.shown&&!r.over)status(t('st_waitHost'));
  else if(role==='guest'&&C.nackAt&&Date.now()-C.nackAt<5000&&!r.over)status(t('st_nack'),'',mine&&prep?[RST]:null);
  const wide=window.matchMedia(WIDE).matches;$('playersTop').hidden=wide;$('playersSide').hidden=!wide;
  $('playersTop').textContent='';$('playersSide').textContent='';const host=wide?$('playersSide'):$('playersTop');
  for(const p of [0,1]){const el=document.createElement('div');el.className='player c'+p+(!r.over&&!d.over&&(ns&&navAt===null?!(view.held&&view.held[p]):turn===p)?' active':'');el.id='pl'+p;
    const h=document.createElement('div');h.className='who';h.innerHTML=`<span class="dot c${p}"></span>`;const nmx=document.createElement('span');nmx.textContent=nm(p);h.appendChild(nmx);
    const ck=document.createElement('div');ck.className='clock';ck.id='clock'+p;if(!view.tc)ck.hidden=true;
    el.append(h,ck);if(GAME.playerCard)GAME.playerCard(el,p,d);host.appendChild(el);}
  tick();
  // side panel: settings only (level of the computer and its opinion, against the computer only: hints use GAME.hintLevel)
  $('myCard').hidden=!(role==='ai'||solo()||(mySeat>=0&&!r.over&&view.names[1-mySeat]&&view.started));
  if($('aiBox'))$('aiBox').hidden=role!=='ai';
  $('resignBox').hidden=!!r.over||!$('resignAsk').hidden;
  if(role==='ai')$('aiInfo').textContent=aiInfo?t(aiInfo.k,{d:aiInfo.d}):'';
  const showStart=mySeat>=0&&!r.over&&!view.started&&!!view.names[1-mySeat];$('startCard').hidden=!showStart;
  if(showStart){const rd=!!(view.ready&&view.ready[mySeat]);$('startBtn').disabled=rd;$('startBtn').textContent=rd?t('waitingOpp'):t('startBtn');
    $('startTxt').textContent=(view.ready&&view.ready[1-mySeat]?t('ready',{n:nm(1-mySeat)}):'')+(view.tc?t('clocksStart'):'');}
  {const ib=$('inviteBox'),waiting=!view.names[1-mySeat]||!view.started;ib.hidden=role==='ai'||solo()||!(role==='host'||(mySeat>=0&&C.code));if(role!=='host'&&C.code)fillCodes(C.code,true);
    if(waiting!==ib.classList.contains('prominent')){ib.classList.toggle('prominent',waiting);ib.open=waiting;}
    // waiting: open at the top of the column; once folded, below the commands
    if(waiting){const sc=$('sideScroll');if(sc){if(sc.firstElementChild!==ib)sc.prepend(ib);}else if(ib.previousElementSibling!==$('playersSide'))$('playersSide').after(ib);}else if(ib.nextElementSibling!==$('rcBoxD'))$('rcBoxD').before(ib);}$('rcCard').hidden=false;$('rcBoxD').hidden=role==='ai'||solo()||!(mySeat>=0&&view.started);
  $('watchInfo').textContent=view.watchers?t(view.watchers>1?'spects':'spect',{n:view.watchers}):t('noSpect');
  $('endCard').hidden=!r.over;
  {const pl=mySeat>=0&&(role==='host'||role==='guest'||role==='ai'||solo()),rm=role==='ai'||solo()?null:view.rematch,opp=view.names[1-mySeat]||t(mySeat?'p1':'p2');
    const asked=!!rm&&rm.st==='ask',mineRm=!!rm&&rm.from===mySeat,txt=asked?(mineRm?t('rm_sent'):t('rm_ask',{n:opp})):rm&&rm.st==='no'&&mineRm?t('rm_no',{n:opp}):'';
    $('rmTxt').textContent=txt;$('rmTxt').hidden=!pl||!txt;$('rmBox').hidden=!pl||asked;$('rmAsk').hidden=!pl||!asked||mineRm;$('rmWait').hidden=!pl||!asked||!mineRm;
    $('newGame').disabled=role==='host'?!view.guestOn:role==='guest'?!(C.conn&&C.conn.open):false;}
  const ol=$('log');ol.textContent='';
  const nv=canNav(r),cur=navAt===null?r.log.length:navAt;
  r.log.forEach((e,j)=>{const li=document.createElement('li');if(nv){li.className='go'+(j+1===cur?' cur':'');li.onclick=()=>navGo(j+1);}const a=document.createElement('span');a.className='n';a.textContent=(j+1)+'.';
    const b=document.createElement('span');b.textContent=nm(e.p);b.style.overflow='hidden';b.style.textOverflow='ellipsis';b.style.whiteSpace='nowrap';
    const c=document.createElement('span');c.textContent=GAME.logText?GAME.logText(e,r):e.txt;li.append(a,b,c);const ds=GAME.logDesc&&GAME.logDesc(e);if(ds){const x=document.createElement('span');x.className='desc';x.textContent=ds;li.appendChild(x);}ol.appendChild(li);});
  const ce=ol.querySelector('.cur');if(ce&&navAt!==null){const a=ce.getBoundingClientRect(),b=ol.getBoundingClientRect();if(a.top<b.top)ol.scrollTop+=a.top-b.top;else if(a.bottom>b.bottom)ol.scrollTop+=a.bottom-b.bottom;}else ol.scrollTop=ol.scrollHeight;sheetAttn();}
// Players' cards in the side panel: wide screens, and landscape phones (board and panel side by side)
const WIDE='(min-width:821px), (orientation:landscape) and (max-height:500px)';
// Game view layout: html.ingame = a fixed-height app (no page scroll); html.wide = two columns (the WIDE query). Otherwise
// (phones, portrait) the side panel is a bottom sheet, opened with « ⋯ » (html.sheet), closed by the backdrop, Escape,
// « ⋯ » again or a swipe down.
const mqWide=window.matchMedia(WIDE),isWide=()=>mqWide.matches;
function sheet(on){const R=document.documentElement,was=R.classList.contains('sheet');on=!!on&&!isWide()&&!$('game').hidden;
  R.classList.toggle('sheet',on);$('sheetBg').hidden=!on;$('optBtn').setAttribute('aria-expanded',on?'true':'false');
  if(on&&!was){$('side').scrollTop=0;$('side').focus({preventScroll:true});}
  if(!on&&was&&$('side').contains(document.activeElement))$('optBtn').focus({preventScroll:true});}
// Wide: the action bar (#notice) goes into the side panel under the players' cards (the panel's fixed top part); otherwise
// back under the board (after the move navigation). The same element moves, nothing is duplicated.
function layoutMode(){const w=isWide();document.documentElement.classList.toggle('wide',w);if(w)sheet(false);
  const n=$('notice'),at=w?$('playersSide'):$('nav');if(n&&at&&n.previousElementSibling!==at)at.after(n);}
// Board coordinates, shared by all the games (games-coords, default on): html.nocoords when off. The game reads coordsOn
// when it draws (labels left out, a tighter viewBox) and sets --board-ar for html.nocoords.
let coordsOn=LS.get('games-coords',true)!==false;
function coordsSet(on){coordsOn=!!on;document.documentElement.classList.toggle('nocoords',!coordsOn);}
// Cards that must not be missed (invitation while waiting, Start, end of game): on phones, the sheet opens by itself when
// one appears (once; at the end of a game after a moment, so the last move is seen) and « ⋯ » carries a dot while one is shown.
function sheetAttn(){const ids=['inviteBox','startCard','endCard'].filter(id=>!$(id).hidden&&(id!=='inviteBox'||$(id).classList.contains('prominent')));
  $('optBtn').classList.toggle('attn',ids.length>0);
  const prev=sheetAttn.prev||[],fresh=ids.filter(id=>!prev.includes(id));sheetAttn.prev=ids;
  if(!fresh.length||isWide())return;
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
let worker=null,reqId=0,cbs={},busy='',aiInfo=null,hintMv=null;
function makeWorker(){const src=GAME.aiSrc()+`
self.onmessage=e=>{const m=e.data,r=aiSearch(m.st,m.opt);self.postMessage({id:m.id,r:r&&{move:r.move,score:r.score,depth:r.depth,forced:r.forced}});};`;
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
  view.moves=view.moves.concat([code]);const r2=replay(view,view.moves,null);
  view.running=!r2.over&&localRuns(r2.st);view.elapsed=0;view.recvAt=Date.now();testTurn();}
function localFlag(){const r=replay(view,view.moves,view.result);if(r.over)return;const tt=r.st.turn;localFreeze();view.clock[tt]=0;
  view.result={winner:1-tt,reason:'time'};resetUi();renderGame();}
let localTick=0;
// Home: "Create a game", then the opponent (link, computer, face to face, free play), then that choice's options
let homeK='';
function homeStep(k){homeK=k;$('newBtn').hidden=k!=='';$('newHead').hidden=k==='';$('newPick').hidden=k!=='pick';
  const F={link:'createForm',ai:'aiForm',face:'faceForm',free:'testForm'};for(const x in F)if($(F[x]))$(F[x]).hidden=k!==x;
  const h=$('newTitle');h.dataset.i18n=k==='pick'?'pickOpp':'m_'+k;h.textContent=t(h.dataset.i18n);}
// An invitation link opens straight on the name to play under (the saved nickname by default)
function invited(on){$('setup').classList.toggle('invited',on);$('joinCard').hidden=!on;if(on){const n=$('jName');n.value=nickGet();n.focus();n.select();}}
function aiPlay(code){if(view.result)return;view.moves=view.moves.concat([code]);resetUi();hintMv=null;aiInfo=null;renderGame();aiStep();}
function aiStep(){if(role!=='ai'||busy)return;const r=replay(view,view.moves,view.result);if(r.over||r.st.turn===mySeat)return;
  const n=view.moves.length,t0=Date.now();busy='ai';renderGame();
  ask(aiView(r.st),GAME.levels[level],res=>{const wait=Math.max(0,400-(Date.now()-t0));setTimeout(()=>{if(role!=='ai'||view.moves.length!==n||busy!=='ai')return;busy='';
    if(!res||!res.move){renderGame();return;}aiInfo=GAME.evalInfo(res,r.st);view.moves=view.moves.concat([GAME.enc(res.move)]);renderGame();aiStep();},wait);});}
// Undo last move: free play takes back one move; against the computer, back to my last turn before my last move
const undoOk=r=>role==='test'?view.moves.length>0:role==='ai'?r.log.some(e=>e.p===mySeat):false;
function doUndo(){if(!view||!canUndo()||GAME.preparing())return;if(role==='test'){testUndo();return;}stopAI();const m=view.moves.slice();
  const turnAt=k=>replay(view,m.slice(0,k),null).st.turn;let k=m.length;
  while(k>0){k--;if(turnAt(k)===mySeat)break;}
  if(turnAt(k)!==mySeat)k=0;
  view.moves=m.slice(0,k);view.result=null;resetUi();aiInfo=null;hintMv=null;renderGame();aiStep();}
// Hint: looked for by the computer (GAME.hintLevel), then shown on the board like a move awaiting confirmation; Play
// this move plays it at once, Dismiss (or a click on the board) drops it.
const hintOn=()=>!!hintMv&&!busy;
function doHint(){if(!view||!canHint()||busy)return;const r=replay(view,view.moves,view.result);if(!isMyTurn(r)||GAME.preparing())return;const n=view.moves.length;busy='hint';hintMv=null;renderGame();
  ask(aiView(r.st),GAME.hintLevel,res=>{if(busy!=='hint')return;busy='';if(view.moves.length===n&&res&&res.move&&(!GAME.hintOk||GAME.hintOk(res.move))){hintMv=res.move;resetUi();}renderGame();});}
function hintOff(){if(busy==='hint')stopAI();hintMv=null;if(ui)ui.hover=null;renderGame();}
function hintPlay(){const mv=hintMv;if(!mv||busy)return;hintMv=null;resetUi();send(mv);}
const aiFirst=()=>{const v=$('aFirst').value;return v==='me'?0:v==='ai'?1:Math.random()<.5?0:1;};   // seat of the player

// ---------- invitation codes ----------
function fillCodes(code,guest){code=code||H.code;const web=/^https?:$/.test(location.protocol),base=location.href.split('#')[0];
  $('codeC').value=code;$('linksBox').hidden=!web;$('fileNote').hidden=web;$('oppLink').hidden=!!guest;$('hostNote').hidden=!!guest;
  if(web){$('codeP').value=base+'#join-'+code;$('codeW').value=base+'#watch-'+code;}}

// ---------- start screen ----------
function joinClick(asWatch){if(typeof Peer==='undefined'){status(t('noPeer'));return;}
  const nm=$('jName').value.trim().slice(0,24);if(nm)nickSet(nm);clientStart($('jCode').value,nm||t('p2'),asWatch);}
function exportCode(){const v=view,c=remaining();const p={size:v.size,...GAME.rules(v),tc:v.tc||null,first:v.first,names:v.names,moves:v.moves,clock:c,result:v.result,started:!!v.started};
  return GAME.codeTag+'.'+btoa(unescape(encodeURIComponent(JSON.stringify(p))));}
function importCode(t){const tag=GAME.codeTag+'.';t=String(t||'').replace(/\s+/g,'');if(t.indexOf(tag)!==0)throw 0;
  const p=JSON.parse(decodeURIComponent(escape(atob(t.slice(tag.length)))));if(!p||!Array.isArray(p.moves)||!Array.isArray(p.clock)||!Array.isArray(p.names))throw 0;const rr=GAME.rules(p);p.size=GAME.size;Object.assign(p,rr);return p;}
function resumeAs(seat,p){if(typeof Peer==='undefined'){status(t('noPeer'));return;}
  const th=[null,null];th[seat]=hh(MYID);
  Object.assign(H,{code:rnd(6),guestCid:null,game:{size:GAME.size,...GAME.rules(p),hold:null,tc:p.tc||null,first:p.first,names:p.names.slice(),moves:p.moves.slice(),clock:p.clock.slice(),running:!!p.started,result:p.result||null,
    started:!!p.started,ready:[!!p.started,!!p.started],th,paused:!!p.started&&!p.result,ver:0}});H.turnStart=Date.now();hostStart(null);}
function init(){GAME.home();
  const saved=LS.get(K('p2p-host'),null),sg=LS.get(K('p2p-guest'),null);
  if(saved&&saved.code&&saved.game&&!saved.game.result){$('resumeCard').hidden=false;}
  else if(sg&&sg.code&&sg.view&&!sg.view.result){$('resumeCard').hidden=false;$('resumeBtn').dataset.guest=sg.code;$('resumeTxt').textContent=t('inProgressGuest');}
  status('');
  if(location.hash==='#ai'){const sv=LS.get(AK(),null);if(sv&&sv.view){stopAI();navAt=null;role='ai';mySeat=sv.mySeat;C.stop=true;
    view={...sv.view,recvAt:Date.now()};resetUi();aiInfo=null;hintMv=null;showGame();renderGame();aiStep();return;}setHash('');}
  if(location.hash==='#local'){const sv=LS.get(LK(),null);if(sv&&Array.isArray(sv.moves)){stopAI();navAt=null;role='local';C.stop=true;
    view={...sv,elapsed:0,recvAt:Date.now()};const r=replay(view,view.moves,view.result);mySeat=r.st.turn;resetUi();hintMv=null;showGame();renderGame();return;}setHash('');}
  if(location.hash==='#test'){const sv=LS.get(TK(),null);startTest(GAME.rules(sv||{}));if(sv&&sv.moves){view={...sv,names:view.names};testTurn();}return;}
  const m=/^#(join|watch|host)-([a-z0-9]+)$/.exec(location.hash);if(!m)return;
  if(m[1]==='host'){if(saved&&saved.code===m[2]&&saved.game){hostStart(saved);return;}m[1]='join';}
  $('jCode').value=m[2];
  if(m[1]==='join'){invited(true);return;}
  joinClick(m[1]==='watch');}

// ---------- start-up: called by the page once GAME is defined ----------
function coreStart(){I18N={fr:{...I18C.fr,...GAME.i18n.fr},en:{...I18C.en,...GAME.i18n.en}};
  if(GAME.levels){level=LS.get(K('level'),null);if(!GAME.levels[level])level=GAME.levelDefault;}
  applyStatic();
  document.querySelectorAll('[data-lang]').forEach(b=>b.onclick=()=>{lang=b.dataset.lang;try{localStorage.setItem('games-lang',JSON.stringify(lang));localStorage.setItem('volo-lang',JSON.stringify(lang));}catch(e){}applyStatic();if(view)renderGame();else status('');});
  MYID=pickTabId(GAME.id,LS.get(K('p2p-cid'),null));
  resetUi();
  // host: periodic save, flag fall
  setInterval(()=>{if(role!=='host'||!H.game)return;if(++saveTick%25===0)hostSave();if(H.game.result||!H.game.running||H.game.paused||!H.game.tc)return;const g=H.game,r=replay(g,g.moves,g.result);if(r.over||simHold(g,r))return;
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
  $('newGame').onclick=()=>{if(role==='ai'){startAI(1-mySeat,GAME.rules(view));return;}if(role==='test'){startTest(GAME.rules(view));return;}
    if(role==='local'){startLocal(GAME.rules(view),view.tc);return;}rmSend('ask');};
  $('rmYes').onclick=()=>rmSend('yes');$('rmNo').onclick=()=>rmSend('no');$('rmCancel').onclick=()=>rmSend('cancel');
  $('navFirst').onclick=()=>navGo(0);
  $('navPrev').onclick=()=>navGo((navAt===null?view.moves.length:navAt)-1);
  $('navNext').onclick=()=>navGo(navAt===null?null:navAt+1);
  $('navLast').onclick=()=>navGo(null);
  document.addEventListener('keydown',e=>{if(!view||/^(INPUT|TEXTAREA|SELECT)$/.test((e.target&&e.target.tagName)||''))return;
    if(e.key==='Escape'&&(hintMv||busy==='hint')){hintOff();return;}
    if(e.key==='Escape'&&GAME.preparing()){GAME.cancel();return;}
    if($('nav').hidden)return;
    const n=view.moves.length,k=navAt===null?n:navAt,go={ArrowLeft:k-1,ArrowRight:k+1,Home:0,End:null}[e.key];if(go===undefined)return;e.preventDefault();navGo(go);});
  // Home: leave the game and come back to the game's own start page
  $('homeBtn').onclick=()=>{try{stopAI();}catch(e){}C.stop=true;clearTimeout(C.t);try{peer&&peer.destroy();}catch(e){}peer=null;setHash('');location.reload();};
  // Header breadcrumb: games -> the index; game name -> this game's start page; confirm before leaving a game in progress
  const liveGame=()=>!!view&&mySeat>=0&&!!view.started&&$('endCard').hidden&&!$('game').hidden;
  $('crumbHome').onclick=e=>{if(liveGame()&&!confirm(t('leaveQ')))e.preventDefault();};
  $('crumbGame').onclick=e=>{e.preventDefault();if(liveGame()&&!confirm(t('leaveQ')))return;$('homeBtn').click();};
  if($('testForm'))$('testForm').addEventListener('submit',e=>{e.preventDefault();startTest(GAME.form('t'));});
  if($('faceForm'))$('faceForm').addEventListener('submit',e=>{e.preventDefault();const tcx=TCS.find(x=>x.id===$('fTc').value)||TCS[TCS.length-1];LS.set(K('local-tc'),tcx.id);
    startLocal(GAME.form('f'),tcx.id==='none'?null:{base:tcx.base,inc:tcx.inc});});
  $('newBtn').onclick=()=>homeStep('pick');
  $('newBack').onclick=()=>homeStep(homeK==='pick'?'':'pick');
  document.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>homeStep(b.dataset.pick));
  $('joinOpen').onclick=()=>{$('joinCard').hidden=false;$('jCode').focus();};
  $('invOther').onclick=()=>{invited(false);setHash('');$('jCode').value='';};
  if(GAME.levels){for(const id of ['aLevel','gLevel'])if($(id))$(id).addEventListener('change',e=>{level=e.target.value;LS.set(K('level'),level);$('aLevel').value=level;$('gLevel').value=level;});
    if($('aiForm'))$('aiForm').addEventListener('submit',e=>{e.preventDefault();startAI(aiFirst(),GAME.form('a'));});}
  document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>{const inp=$(b.dataset.copy);inp.select();
    const ok=()=>{b.textContent=t('copied');setTimeout(()=>b.textContent=t('copy'),1500);};
    try{navigator.clipboard.writeText(inp.value).then(ok,()=>{try{document.execCommand('copy');ok();}catch(e){}});}catch(e){try{document.execCommand('copy');ok();}catch(e2){}}});
  $('hName').value=nickGet();$('jName').value=nickGet();
  $('createForm').addEventListener('submit',e=>{e.preventDefault();if(typeof Peer==='undefined'){status(t('noPeer'));return;}
    const nm=$('hName').value.trim()||t('p1');nickSet(nm);
    const fv=$('cFirst').value,first=fv==='me'?'host':fv==='opp'?'guest':(Math.random()<.5?'host':'guest');const tcx=TCS.find(x=>x.id===$('cTc').value)||TCS[0];LS.set(K('tc'),tcx.id);const tc=tcx.id==='none'?null:{base:tcx.base,inc:tcx.inc};
    const names=first==='host'?[nm,'']:['',nm];
    const th=[null,null];th[first==='host'?0:1]=hh(MYID);
    Object.assign(H,{code:rnd(6),guestCid:null,game:{size:GAME.size,...GAME.form('c'),hold:null,tc,first,names,moves:[],clock:[tc?tc.base:0,tc?tc.base:0],running:false,result:null,started:false,ready:[false,false],th,paused:false,ver:0}});
    H.turnStart=Date.now();hostStart(null);});
  $('joinForm').addEventListener('submit',e=>{e.preventDefault();joinClick(false);});
  $('jWatch').onclick=()=>joinClick(true);
  $('resumeBtn').onclick=()=>{const s=LS.get(K('p2p-host'),null);if(s&&s.game&&!s.game.result){hostStart(s);return;}const sg=LS.get(K('p2p-guest'),null);if(sg)clientStart(sg.code,sg.name||nickGet()||t('p2'),false);};
  $('rcCopy').onclick=()=>{if(!view)return;const inp=$('rcTxt');inp.value=exportCode();$('rcBox').hidden=false;inp.select();
    try{navigator.clipboard.writeText(inp.value).then(()=>{$('rcCopy').textContent=t('copied');setTimeout(()=>$('rcCopy').textContent=t('rcCopy'),1500);},()=>{});}catch(e){}};
  $('rForm').addEventListener('submit',e=>{e.preventDefault();let p;try{p=importCode($('rIn').value);}catch(x){$('joinErr').textContent=t('badResume');$('rSeats').innerHTML='';return;}
    const box=$('rSeats');box.innerHTML=[0,1].map(k=>`<button type="button" class="primary" data-rseat="${k}">${t('iam',{n:String(p.names[k]||t(k?'p2':'p1')).replace(/[&<>"']/g,'')})}</button>`).join('');
    box.querySelectorAll('[data-rseat]').forEach(b=>b.onclick=()=>resumeAs(+b.dataset.rseat,p));});
  init();sndBind();}
