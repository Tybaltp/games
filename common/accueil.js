// L'accueil des pages de jeu (modèle commun ; aujourd'hui Gygès, Zèrtz, Diagonal Blocks), chargé en fin de page après le script du jeu.
// les modes de jeu en cartes sur l'accueil, au lieu de « Jouer /
// Analyser » puis la liste « Mode de jeu ». La quatrième carte, Analyser, ouvre le choix du socle : créer ou charger une partie. S'appuie sur homeStep() et la liste #modeSel du socle, qui restent la référence.
(function(){
  const $i=id=>document.getElementById(id),ms=$i('modeSel');
  Object.assign(I18N.fr,{acc_linkTxt:'Un adversaire sur un autre appareil.',acc_aiTxt:'Contre l’ordinateur, au niveau choisi.',acc_faceTxt:'Deux joueurs, un seul écran.',acc_anaTxt:'Créer ou charger une partie.'});
  Object.assign(I18N.en,{acc_linkTxt:'An opponent on another device.',acc_aiTxt:'Against the computer, at the level you choose.',acc_faceTxt:'Two players, one screen.',acc_anaTxt:'Create or load a game.'});
  Object.assign(I18N.es,{acc_linkTxt:'Un adversario en otro dispositivo.',acc_aiTxt:'Contra el ordenador, al nivel elegido.',acc_faceTxt:'Dos jugadores, una sola pantalla.',acc_anaTxt:'Crear o cargar una partida.'});
  const bg=document.createElement('div');bg.className='accBg';bg.setAttribute('aria-hidden','true');bg.innerHTML='<div class="accZone"></div>';document.body.prepend(bg);
  // l'angle et le facteur du fondu, tirés de la proportion de l'image (--accR) déclarée par la page
  {const R=document.documentElement,r=parseFloat(getComputedStyle(R).getPropertyValue('--accR'));
    if(r>0){R.style.setProperty('--accAng',(180-Math.atan(1/r)*180/Math.PI).toFixed(3)+'deg');R.style.setProperty('--accK',(1/Math.sqrt(1+r*r)).toFixed(5));}}
  const IC={link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    ai:'<rect x="3.5" y="4.5" width="17" height="11.5" rx="2"/><path d="M9 20h6M12 16v4"/>',
    face:'<circle cx="4" cy="12" r="2.5"/><circle cx="20" cy="12" r="2.5"/><rect x="8.5" y="7" width="7" height="10" rx="1.2"/>',
    ana:'<path d="M4 20l1-4 11-11 3 3-11 11-4 1zM13.5 6.5l3 3"/>'};
  const grid=document.createElement('div');grid.className='accTiles';
  const modes=[...ms.querySelectorAll("option")].map(o=>o.value).concat('ana');
  for(const k of modes){const b=document.createElement('button');b.type='button';b.className='accTile';b.dataset.mode=k;
    b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+(IC[k]||'')+'</svg><b data-i18n="'+(k==='ana'?'analyse':'m_'+k)+'"></b><span data-i18n="acc_'+k+'Txt"></span>';
    b.onclick=()=>{if(k==='ana'){homeStep('ana');return;}ms.value=k;ms.onchange();};grid.appendChild(b);}
  $i('playBtn').before(grid);
  grid.querySelectorAll('[data-i18n]').forEach(e=>e.textContent=t(e.dataset.i18n));
  // the card's title names the chosen mode; « Retour » comes back to the four cards (from Créer / Charger : to Analyser).
  // The sentence under the mode carries its key, so that changing the language translates it (fix to carry into the socle).
  const base=homeStep;homeStep=function(k){base(k);const h=$i('newTitle');
    if(k==='play'){h.dataset.i18n='m_'+ms.value;h.textContent=t(h.dataset.i18n);}
    $i('modeTxt').dataset.i18n='m_'+ms.value+'Txt';};
  $i('newBack').onclick=()=>homeStep(homeK==='free'||homeK==='load'?'ana':'');
  // le bouton plein écran existe partout où le navigateur le permet (le socle ne le met que sur écran tactile)
  {const D=document,R=D.documentElement;if(!$i('fsBtn')&&D.fullscreenEnabled&&R.requestFullscreen){const f=D.createElement('button');f.type='button';f.className='fsbtn';f.id='fsBtn';
    f.setAttribute('data-i18n-t','fullscreen');f.title=t('fullscreen');f.setAttribute('aria-label',f.title);
    f.innerHTML='<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M1.5 5.5v-4h4M10.5 1.5h4v4M14.5 10.5v4h-4M5.5 14.5h-4v-4"/></svg>';
    f.onclick=()=>{if(D.fullscreenElement)D.exitFullscreen().catch(()=>{});else R.requestFullscreen({navigationUI:'hide'}).catch(()=>{});};
    D.addEventListener('fullscreenchange',()=>f.classList.toggle('on',!!D.fullscreenElement));$i('optBtn').before(f);}}
})();
