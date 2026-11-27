'use strict';
// La coquille : a page that stays open while the pages of the site come and go in a frame inside it (index.html for
// the whole site, mochalunt.html for a match). Here what both keep across the pages: a link between two players
// (PeerJS, its own ids, apart from the game's table), the voice between them (the microphone and the call live here,
// so a new page in the frame cuts neither), the bridge to the page in the frame (postMessage, common/core.js « La
// coquille ») and a bar for the call when no game is on screen. The page that uses it sets:
//   COQ.frame            a function: the <iframe> showing a page (or null)
//   COQ.others           a function: the other player's name
//   COQ.onPill           (optional) called with true / false once the bar is drawn shown / hidden
//   COQ.covered          (optional) a function: the page in the frame shows the call itself (by default: a frame is there)
// Link: COQ.linkStart({me, other, dial, rec}) (me, other: PeerJS ids; dial: this side calls the other and places the
// media call; rec: the localStorage key where the call is noted, below), COQ.linkStop(), COQ.linkUp().
// Voice: one offers (ask), the other accepts (yes) or declines (no); each then takes its microphone, kept for the whole
// call; the dialling side places the media call once both have theirs (go). On, the call is noted under rec (svc: {at});
// the page reloaded within 15 min, it is offered again (reask) and taken by itself. Hanging up, declining or a bye
// removes the note and lets the microphone go.
const COQ=(()=>{
  const TX={fr:{vOut:"Vocal proposé à {n}…",vIn:"{n} propose le vocal.",vConn:"Connexion du vocal…",vOn:"Vocal avec {n}",vHang:"Raccrocher",vCancel:"Annuler",vYes:"Accepter",vNo2:"Refuser",
      vMute:"Couper le micro",vUnmute:"Rétablir le micro",vNo:"{n} a refusé le vocal.",vEnd:"Vocal terminé.",vMic:"Micro inaccessible : le vocal n'a pas démarré.",vFail:"Le vocal n'a pas pu se connecter (réseau).",opp:"votre adversaire"},
    en:{vOut:"Voice chat offered to {n}…",vIn:"{n} offers voice chat.",vConn:"Connecting voice…",vOn:"Voice with {n}",vHang:"Hang up",vCancel:"Cancel",vYes:"Accept",vNo2:"Decline",
      vMute:"Mute the mic",vUnmute:"Unmute the mic",vNo:"{n} declined voice chat.",vEnd:"Voice chat ended.",vMic:"Microphone unavailable: voice chat did not start.",vFail:"Voice chat could not connect (network).",opp:"your opponent"},
    es:{vOut:"Voz propuesta a {n}…",vIn:"{n} propone hablar por voz.",vConn:"Conectando la voz…",vOn:"Voz con {n}",vHang:"Colgar",vCancel:"Cancelar",vYes:"Aceptar",vNo2:"Rechazar",
      vMute:"Silenciar el micro",vUnmute:"Activar el micro",vNo:"{n} ha rechazado la voz.",vEnd:"Voz terminada.",vMic:"Micrófono inaccesible: la voz no ha arrancado.",vFail:"La voz no ha podido conectarse (red).",opp:"tu adversario"}};
  const get=(k,d)=>{try{const v=localStorage.getItem(k);return v===null?d:JSON.parse(v);}catch(e){return d;}};
  const put=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}};
  const lg=()=>{const l=get('games-lang','fr');return TX[l]?l:'fr';};
  const t=(k,p)=>{let s=TX[lg()][k]||TX.fr[k]||k;for(const x in p||{})s=s.split('{'+x+'}').join(p[x]);return s;};
  const ORG=location.origin&&location.origin!=='null'?location.origin:'*';
  const L={peer:null,conn:null,pend:null,last:0,tries:0,o:null,out:[],got:[]};
  let V={st:'off',note:''};
  const api={frame:()=>null,others:()=>t('opp'),onPill:null,t};
  const up=()=>!!(L.conn&&L.conn.open);
  const send=m=>{try{if(up())L.conn.send(m);}catch(e){}};
  // ---- the bridge to the page in the frame
  function toFrame(m){const f=api.frame(),w=f&&f.contentWindow;if(w)try{w.postMessage({coq:2,...m},ORG);}catch(e){}}
  function push(){toFrame({t:'voice',st:V.st,note:V.note,muted:!!V.muted,mic:!!V.stream,link:up(),
    ok:!!(L.o&&navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&typeof Peer!=='undefined')});pill();}
  // ---- the link
  function linkStart(o){if(L.o&&L.o.me===o.me&&L.o.other===o.other)return;linkStop();if(typeof Peer==='undefined')return;L.o=o;open();push();}
  function open(){const o=L.o;if(!o)return;const p=new Peer(o.me,{debug:0});L.peer=p;
    p.on('open',()=>{L.tries=0;dial();});
    p.on('connection',c=>{if(c.peer!==o.other){try{c.close();}catch(e){}return;}adopt(c);});
    p.on('call',incoming);
    p.on('disconnected',()=>{if(L.peer===p)setTimeout(()=>{try{if(L.peer===p&&!p.destroyed)p.reconnect();}catch(e){}},1000);});
    // the id still held (the page just reloaded and the server has not let it go yet, or another tab): again later
    p.on('error',e=>{if(L.peer!==p||e.type!=='unavailable-id')return;try{p.destroy();}catch(x){}L.peer=null;if(++L.tries<60)setTimeout(()=>{if(L.o===o&&!L.peer)open();},3000);});}
  function dial(){const o=L.o;if(!o||!o.dial||!L.peer||!L.peer.open||up()||L.pend)return;const c=L.peer.connect(o.other,{reliable:true});L.pend=c;adopt(c);
    setTimeout(()=>{if(L.pend===c){L.pend=null;if(!c.open)try{c.close();}catch(e){}}},5000);}
  function adopt(c){c.on('open',()=>{if(L.pend===c)L.pend=null;if(L.conn&&L.conn!==c)try{L.conn.close();}catch(e){}L.conn=c;L.last=Date.now();push();auto();L.out.forEach(x=>send({t:'chat',x}));});
    c.on('data',d=>{if(c!==L.conn||!d)return;L.last=Date.now();if(d.t==='voice')onMsg(d.op);else if(d.t==='chat')chatIn(d.x);else if(d.t==='chatok')L.out=L.out.filter(x=>x.i!==d.i);});
    c.on('close',()=>{if(L.conn===c){L.conn=null;lost();}});c.on('error',()=>{});}
  function linkStop(){if(!L.o&&!L.peer)return;try{L.peer&&L.peer.destroy();}catch(e){}L.peer=L.conn=L.pend=null;L.o=null;push();}
  setInterval(()=>{if(up()){send({t:'ping'});if(Date.now()-L.last>6000){const c=L.conn;L.conn=null;try{c.close();}catch(e){}lost();}}else dial();
    if(V.st==='on'&&Date.now()-(noted()||0)>30e3)note(true);},1000);
  // ---- the chat of a match, the two players at different tables: a message from the page goes to the other's coquille
  // (kept until it says it has it, sent again once the link is back), which gives it to its page; no page there, or one
  // still loading: it is kept in the record (rec: chat, marked p, waiting) and given again to each page that says ready
  function chat(x){if(!x||!x.i||!L.o)return;if(!L.out.some(y=>y.i===x.i))L.out.push(x);if(L.out.length>50)L.out.shift();send({t:'chat',x});}
  function chatIn(x){if(!x||typeof x.i!=='string')return;send({t:'chatok',i:x.i});if(L.got.some(y=>y.i===x.i))return;L.got.push(x);if(L.got.length>50)L.got.shift();
    toFrame({t:'chat',x});if(api.frame())return;const o=L.o;if(!o||!o.rec)return;const r=get(o.rec,null);if(!r)return;const C=Array.isArray(r.chat)?r.chat:[];
    if(C.some(y=>y.i===x.i))return;r.chat=[...C,{n:String(x.n||'').slice(0,24),w:0,m:String(x.m||'').slice(0,200),c:x.r==='c'?0:1,i:x.i,p:1}].slice(-100);put(o.rec,r);}
  function ready(){L.got.forEach(x=>toFrame({t:'chat',x}));}   // the page, just loaded: what came lately (it keeps each once)
  // ---- the voice
  const noted=()=>{const o=L.o,r=o&&o.rec&&get(o.rec,null);return r&&r.svc&&r.svc.at||null;};
  function note(on){const o=L.o;if(!o||!o.rec)return;const r=get(o.rec,null)||{};if(on)r.svc={at:Date.now()};else if(r.svc)delete r.svc;else return;put(o.rec,r);}
  const fresh=()=>{const a=noted();return !!a&&Date.now()-a<15*60e3;};
  const caller=()=>!!(L.o&&L.o.dial);
  function op(o,v){if(o==='ask'){if(V.st!=='off'||!up())return;V={st:'out',note:''};send({t:'voice',op:'ask'});push();}
    else if(o==='cancel'){if(V.st!=='out')return;send({t:'voice',op:'cancel'});V={st:'off',note:''};push();}
    else if(o==='yes'||o==='no')answer(o==='yes');
    else if(o==='hang'){stop('vEnd',true);note(false);}
    else if(o==='mute'){if(!V.stream)return;V.muted=!V.muted;V.stream.getAudioTracks().forEach(k=>{k.enabled=!V.muted;});push();}
    else if(o==='vol'&&typeof v==='number'&&V.audio)V.audio.volume=Math.max(0,Math.min(1,v/100));}
  function mic(){return navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}}).then(st=>{
    if(V.st!=='conn'){st.getTracks().forEach(k=>k.stop());return null;}V.stream=st;V.muted=false;return st;});}
  function wait(){clearTimeout(V.to);V.to=setTimeout(()=>{if(V.st==='conn')stop('vFail',true);},15000);}
  function connect(){wait();if(caller()&&L.peer&&V.stream)call(L.peer.call(L.o.other,V.stream));}
  function answer(yes){if(V.st!=='in')return;if(!yes){note(false);send({t:'voice',op:'no'});V={st:'off',note:''};push();return;}
    V.st='conn';push();mic().then(st=>{if(!st)return;send({t:'voice',op:'yes'});wait();push();},()=>stop('vMic',true));}   // then the call (or go)
  function onMsg(o){
    if(o==='ask'||o==='reask'){if(V.st==='out'&&caller())V={st:'off',note:''};   // both offered at once: the listening side's offer stands
      if(V.st!=='off')return;V={st:'in',note:''};if(o==='reask'&&fresh()){answer(true);return;}toFrame({t:'ring'});push();}
    else if(o==='cancel'&&V.st==='in'){V={st:'off',note:''};push();}
    else if(o==='no'&&V.st==='out'){note(false);V={st:'off',note:'vNo'};push();}
    else if(o==='yes'&&V.st==='out'){V.st='conn';push();mic().then(st=>{if(!st)return;if(caller())connect();else{send({t:'voice',op:'go'});wait();}push();},()=>stop('vMic',true));}
    else if(o==='go'&&V.st==='conn'&&V.stream)connect();
    else if(o==='bye'){if(V.st!=='off')stop('vEnd',false);note(false);}}
  function call(c){V.call=c;c.on('stream',rs=>{if(V.call!==c)return;clearTimeout(V.to);
      if(!V.audio){const a=document.createElement('audio');a.autoplay=true;a.setAttribute('playsinline','');a.hidden=true;document.body.appendChild(a);V.audio=a;}
      V.audio.srcObject=rs;const v=get('games-voicevol',80);V.audio.volume=(typeof v==='number'?v:80)/100;const pl=V.audio.play&&V.audio.play();
      if(pl&&pl.catch)pl.catch(()=>{const f=()=>{if(V.audio&&V.audio.paused)V.audio.play().catch(()=>{});};document.addEventListener('pointerdown',f,{once:true});document.addEventListener('keydown',f,{once:true});});
      V.st='on';note(true);push();});
    c.on('close',()=>{if(V.call===c)stop('vEnd',false);});c.on('error',()=>{if(V.call===c)stop('vFail',true);});}
  function incoming(c){if(!L.o||c.peer!==L.o.other||V.st!=='conn'||!V.stream){try{c.close();}catch(e){}return;}c.answer(V.stream);call(c);}
  function stop(nt,tell){const v=V;if(v.st==='on')note(true);if(tell&&v.st!=='off')send({t:'voice',op:'bye'});clearTimeout(v.to);
    try{v.call&&v.call.close();}catch(e){}try{v.stream&&v.stream.getTracks().forEach(k=>k.stop());}catch(e){}
    if(v.audio){try{v.audio.srcObject=null;v.audio.remove();}catch(e){}}V={st:'off',note:nt||''};push();}
  // the link lost: an offer goes; a call goes on by itself (its own connection)
  function lost(){if(V.st==='out'||V.st==='in')V={st:'off',note:''};push();}
  function auto(){if(caller()&&V.st==='off'&&fresh()){V={st:'out',note:''};send({t:'voice',op:'reask'});push();}}
  // ---- no game on screen: the call in a bar at the bottom of the window (its look: the page's .vpill)
  let bar=null,noteTo=null;
  function pill(){if(!document.body)return;if(!bar){bar=document.createElement('div');bar.className='vpill';bar.setAttribute('role','status');bar.hidden=true;
      bar.innerHTML='<span></span><button type="button"></button><button type="button" class="primary"></button>';document.body.appendChild(bar);}
    const st=V.st,show=!(api.covered?api.covered():!!api.frame())&&(st!=='off'||!!V.note);bar.hidden=!show;document.body.classList.toggle('vpillon',show);
    if(show){const n=api.others(),[tx,B,A]=bar.children;tx.textContent=st==='out'?t('vOut',{n}):st==='in'?t('vIn',{n}):st==='conn'?t('vConn'):st==='on'?t('vOn',{n}):t(V.note,{n});
      A.hidden=B.hidden=false;B.disabled=false;B.title='';
      if(st==='in'){A.textContent=t('vYes');A.onclick=()=>answer(true);B.textContent=t('vNo2');B.onclick=()=>answer(false);}
      else if(st==='out'){A.hidden=true;B.textContent=t('vCancel');B.onclick=()=>op('cancel');}
      else if(st==='conn'||st==='on'){A.textContent=t('vHang');A.onclick=()=>op('hang');B.textContent=V.muted?'🔇':'🎙';B.title=t(V.muted?'vUnmute':'vMute');B.setAttribute('aria-label',B.title);B.onclick=()=>op('mute');B.disabled=!V.stream;}
      else{A.hidden=B.hidden=true;clearTimeout(noteTo);noteTo=setTimeout(()=>{if(V.st==='off'){V.note='';pill();}},5000);}}
    if(api.onPill)api.onPill(show);}
  addEventListener('storage',e=>{if(e.key==='games-lang')pill();});
  Object.assign(api,{linkStart,linkStop,linkUp:up,op,push,chat,ready,state:()=>V});
  return api;})();
