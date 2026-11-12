// ===== Game-tree search shared by the games' computer opponents (common/ai.js) =====
// A plain script (no modules): it defines one global, AISearch(G). It knows nothing of any game: the game hands it an
// interface object G and gets back the searches. The computer runs in core's worker, which cannot load files, so a page
// builds its worker source as AISearch.toString() + its own code (GAME.aiSrc); AISearch must therefore stay one
// self-contained function that uses no other global (performance.now, or Date.now, only).
// Load it after common/core.js and before the page's script: <script src="common/ai.js?v=N"></script> (bump N in the
// pages that load it after a change).
//
// The interface G (S: a game state in the game's own representation; p: a side, as returned by turn; m: a move object):
//  moves(S,w)      the candidate moves in S, best first: [{m,s}], s the evaluation, for the side to move in S, of the
//                  position after m (the same scale as eval). w: how wide to look (the game decides what it means, e.g.
//                  how many single squares it pairs; the searches pass opt.cellsIn||opt.cells, mcts opt.cellsIn||8).
//                  An empty list in a game that is not over is read as a leaf (eval). Order matters: beam keeps the first
//                  widths[ply], mcts opens children in this order.
//  play(S,m)       a NEW state after m (S itself is left unchanged)
//  turn(S)         the side to move in S (any value comparable with ===; a side may move twice in a row)
//  done(S)         true when the game is over
//  result(S,p)     the value of a finished game for p: > 0 won, < 0 lost, 0 drawn, as ±(1000 + margin)
//  eval(S,p)       the heuristic value of S for p (positive = good for p), in points; mcts squashes it by opt.scale
//  playout(S,opt)  plays S forward IN PLACE (to the end, or what the game reads from opt, e.g. opt.cut turns)
//  scratch(S)      a copy of S that playout may destroy (it can be one reused buffer: it is used before the next call)
//
// What AISearch(G) returns: {start(ms), greedy, beam, mcts, nodes()}. Call start(opt.time) first (it sets the deadline),
// then K[opt.algo](S, C, opt) with C = G.moves(S, …) at the root (not empty; the game handles 0 or 1 move itself).
// Each search returns {m, s, depth}: the move, its value for the side to move (points; for mcts a logit times scale),
// the depth reached (beam: plies completed; mcts: longest line in the tree). nodes(): positions searched / simulations.
// Randomness only through Math.random (seed it to replay a game).
//
// The three algorithms and their parameters (the level object opt; every field optional unless said):
//  greedy  one ply: a softmax over the best root candidates
//    pick     moves drawn from: the first pick candidates (default all)
//    temp     softmax temperature, in points of evaluation (default ~0: always the best)
//  beam    iterative-deepening alpha-beta on the best candidates of each ply, stopped by the deadline (keeps the last
//          completed depth)
//    depth    plies read at most (required)
//    widths   candidates kept at each ply, [root, ply 1, …]; the last value repeats deeper (required)
//    cellsIn  the w passed to moves below the root (default cells)
//    cells    the w for the root, used by the game, and below the root when cellsIn is absent
//    noise    plays one of the moves within noise points of the best, at random (default 0)
//    time     the deadline (ms) given to start (default: none)
//  mcts    UCT with progressive widening over the candidate order; each simulation plays out a short guided game (the
//          game's playout) then scores it: a finished game 0.9-1 / 0.5 / 0-0.1 by margin, else sigmoid(eval/scale)
//    sims     simulations (default 2000); time is only a cap, so the strength does not depend on the machine
//    time     the cap (ms) given to start, checked every 16 simulations
//    c        UCT exploration constant (default 0.7)
//    pwC, pwA progressive widening: a node opens at most pwC*(visits+1)^pwA children (default 2, 0.5)
//    cellsIn  the w passed to moves inside the tree (default 8)
//    scale    evaluation points per logit when a playout ends unfinished (default 3)
//    temp     final choice: 0 the most visited child, else drawn by visits^(1/temp)
//    (cut, rand, brP, … are the game's playout parameters: AISearch passes opt to playout untouched)
function AISearch(G){
'use strict';
const now=()=>typeof performance!=='undefined'&&performance.now?performance.now():Date.now();
let deadline=Infinity,nodes=0;class Stop{}
const start=ms=>{deadline=now()+(ms||1e9);nodes=0;};
// the value of S for the side to move, reading d more plies; widths[ply] moves kept at each ply
function nega(S,d,al,be,o,ply){const me=G.turn(S);if(G.done(S))return G.result(S,me);
  if(now()>deadline)throw new Stop();nodes++;
  const C=G.moves(S,o.cellsIn||o.cells);if(!C.length)return G.eval(S,me);
  if(d<=1)return C[0].s;
  const w=o.widths[Math.min(ply,o.widths.length-1)];let best=-1e9;
  for(let i=0;i<Math.min(w,C.length);i++){const v=child(G.play(S,C[i].m),me,d-1,al,be,o,ply+1);
    if(v>best)best=v;if(v>al)al=v;if(al>=be)break;}
  return best;}
// a child's value for `me` (the same side may move twice in a row)
function child(T,me,d,al,be,o,ply){return G.done(T)?G.result(T,me):G.turn(T)===me?nega(T,d,al,be,o,ply):-nega(T,d,-be,-al,o,ply);}
function beam(S,C,o){const me=G.turn(S),res={m:C[0].m,s:C[0].s,depth:1};let R=C.slice(0,o.widths[0]).map(x=>({m:x.m,s:x.s}));
  for(let d=2;d<=o.depth;d++){const vals=[];let al=-1e9;
    try{for(const x of R){const v=child(G.play(S,x.m),me,d-1,al,1e9,o,1);vals.push({m:x.m,s:v});if(v>al)al=v;}}
    catch(e){if(e instanceof Stop)break;throw e;}
    vals.sort((a,b)=>b.s-a.s);R=vals;res.m=R[0].m;res.s=R[0].s;res.depth=d;}
  // noise: one of the moves within `noise` of the best, at random
  if(o.noise){const ok=R.filter(x=>x.s>=res.s-o.noise);const x=ok[(Math.random()*ok.length)|0];if(x)res.m=x.m;}
  return res;}
function greedy(S,C,o){const top=C.slice(0,o.pick||C.length),b=top[0].s,T=o.temp||1e-9;let tot=0;const w=top.map(x=>{const v=Math.exp((x.s-b)/T);tot+=v;return v;});
  let r=Math.random()*tot;for(let i=0;i<top.length;i++){r-=w[i];if(r<=0)return {m:top[i].m,s:top[i].s,depth:1};}return {m:top[0].m,s:top[0].s,depth:1};}
function mcts(S,C0,o){const me=G.turn(S),root={S,C:C0,ch:[],n:0,w:0},cap=deadline;
  const pw=k=>Math.max(1,Math.ceil((o.pwC||2)*Math.pow(k+1,o.pwA||.5)));
  const cx=o.c===undefined?.7:o.c,scale=o.scale||3;let sims=0,maxD=1;
  for(;sims<(o.sims||2000);sims++){if((sims&15)===0&&now()>cap)break;
    let node=root;const path=[root];
    while(!G.done(node.S)){
      if(!node.C)node.C=G.moves(node.S,o.cellsIn||8);
      if(node.ch.length<Math.min(node.C.length,pw(node.n))){const x=node.C[node.ch.length],ch={S:G.play(node.S,x.m),C:null,ch:[],n:0,w:0,m:x.m};
        node.ch.push(ch);path.push(ch);node=ch;break;}
      if(!node.ch.length)break;
      const mine=G.turn(node.S)===me,ln=Math.log(node.n+1);let best=null,bv=-1e9;
      for(const ch of node.ch){const q=ch.n?(mine?ch.w/ch.n:1-ch.w/ch.n):.5,v=q+cx*Math.sqrt(ln/(ch.n+1));if(v>bv){bv=v;best=ch;}}
      node=best;path.push(node);}
    // playout, scored for me in [0,1] (a win counts 0.9 to 1 with the margin)
    const P=G.scratch(node.S);if(!G.done(P))G.playout(P,o);let v;
    if(G.done(P)){const f=G.result(P,me);v=f>0?.9+Math.min(.1,(f-1000)/50):f<0?.1-Math.min(.1,(-1000-f)/50):.5;}
    else v=1/(1+Math.exp(-G.eval(P,me)/scale));
    for(const x of path){x.n++;x.w+=v;}if(path.length-1>maxD)maxD=path.length-1;}
  nodes=sims;
  // the move: the most visited, or drawn by visits^(1/temp)
  const ch=root.ch.slice().sort((a,b)=>b.n-a.n);let pick=ch[0];
  if(o.temp){const ws=ch.map(x=>Math.pow(x.n,1/o.temp));let r=Math.random()*ws.reduce((a,b)=>a+b,0);for(let i=0;i<ch.length;i++){r-=ws[i];if(r<=0){pick=ch[i];break;}}}
  const q=pick.n?pick.w/pick.n:.5;
  return {m:pick.m,s:Math.log(Math.max(1e-3,q)/Math.max(1e-3,1-q))*scale,depth:maxD};}   // depth: the longest line of the tree
// ===== Options (11.2026), all off by default: a level without them runs mcts / beam above, unchanged =====
// Optional interface: key(m) a move's identity across positions (number or string; default m itself when not an object,
//  else JSON.stringify(m)); hash(S) a position's identity (number or string), for beam's tt and mcts' keep (without
//  it, keep compares positions field by field; a hash must cover the side to move and any hidden state: passes,
//  part-turns, repetitions); playout(S,opt,rec): a game may call rec(m,p) for each move m it plays,
//  p the side (turn) that plays it, for rave (without it rave only sees the moves in the tree).
// mcts options:
//  pb       progressive bias: pb·h/(visits+1) added to a child's score, h = sigmoid(s/scale) of its candidate score s
//  vInit    the candidate score counts as vInit virtual visits of value h in the child's mean
//  puct     PUCT instead of UCT: q + puct·P·sqrt(N)/(1+n), P the softmax of the candidate scores at temperature pT
//           (points, default scale) over the node's candidate list
//  rave     RAVE/AMAF: a child's mean is mixed with its all-moves-as-first mean, weight sqrt(rave/(3n+rave))
//  solve    MCTS-solver: finished games are proved wins / losses and the proofs go up the tree (a node is lost for its
//           mover when every candidate is lost: proofs are relative to the candidate lists of G.moves); the root
//           plays a proved win, avoids a proved loss, stops early when proved; s is then ±1000
//  keep     the tree of the previous search is kept (this AISearch, same side to move): if the new position is in it,
//           within 3 plies, the search goes on from that node (sims more simulations)
//  roots    root parallelism in one thread: roots independent trees of sims simulations each, visits added up by move
//  rootOut  (for core's workers) the root visits are left in globalThis.__aiRoot = {k:chosen key, R:[{k,n,w}]}
//  rootPick a move key: plays that root candidate without searching (core, after merging the workers' visits)
// beam options (with noise, the moves other than the best carry bounds that depend on the order, so the move drawn may
//  differ from beam's): order (killer moves + history heuristic, inside the kept candidates only), pvs (null-window search
//  after the first move), tt (transposition table on G.hash: best move first, and cut-offs at the same ply and
//  depth). They read the same moves, so at a fixed depth they change the nodes searched, not the value.
const keyOf=m=>G.key?G.key(m):(m!==null&&typeof m==='object')?JSON.stringify(m):m;
const sig=(x,sc)=>1/(1+Math.exp(-x/sc));
function same(a,b){if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||a instanceof Map||a instanceof Set)return false;
  if(ArrayBuffer.isView(a)){if(!ArrayBuffer.isView(b)||a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;}
  if(Array.isArray(a)!==Array.isArray(b))return false;const ka=Object.keys(a);if(ka.length!==Object.keys(b).length)return false;
  for(const k of ka)if(!same(a[k],b[k]))return false;return true;}
const MX=['pb','vInit','puct','rave','solve','keep','roots','rootOut','rootPick'];
let last=null;   // keep: {root, me, sg} of the previous search (sg: the options the tree was built with)
const sgOf=o=>[o.pb,o.vInit,o.puct,o.pT,o.rave,o.solve,o.scale,o.cellsIn].join();
function soft(C,T){let mx=-1e18;for(const x of C)if(x.s>mx)mx=x.s;let t=0;const P=C.map(x=>{const v=Math.exp((x.s-mx)/T);t+=v;return v;});return P.map(v=>v/t);}
// the node of the old tree whose position is S (side me to move), within d plies
function findNode(R,S,d){const h=G.hash?G.hash(S):null;let F=[R];
  for(let k=0;k<d&&F.length;k++){const N=[];for(const x of F)for(const c of x.ch){
      if(!G.done(c.S)&&G.turn(c.S)===G.turn(S)&&(h!==null?G.hash(c.S)===h:same(c.S,S)))return c;N.push(c);}F=N;}
  return null;}
function mctsX(S,C0,o,sub){
  if(o.rootPick!=null){const x=C0.find(x=>keyOf(x.m)===o.rootPick)||C0[0];return {m:x.m,s:x.s,depth:0};}
  if(o.roots>1&&!sub){const M=new Map(),k=o.roots,o1={...o,rootOut:false,keep:false,temp:0},D=deadline;let sims=0,depth=0;
    for(let r=0;r<k;r++){const t=now();deadline=D===Infinity?D:t+Math.max(0,D-t)/(k-r);   // each tree its share of the time left
      const x=mctsX(S,C0,o1,true);sims+=nodes;if(x.depth>depth)depth=x.depth;
      for(const c of x.R){const e=M.get(c.k);if(e){e.n+=c.n;e.w+=c.w;if(c.pv)e.pv=c.pv;}else M.set(c.k,{k:c.k,m:c.m,n:c.n,w:c.w,pv:c.pv});}}
    deadline=D;nodes=sims;return pickRoot([...M.values()],o,depth,C0);}
  const me=G.turn(S),cap=deadline,scale=o.scale||3,cx=o.c===undefined?.7:o.c;
  const pw=k=>Math.max(1,Math.ceil((o.pwC||2)*Math.pow(k+1,o.pwA||.5)));
  const pb=o.pb||0,vi=o.vInit||0,puct=o.puct||0,pT=o.pT||scale,rave=o.rave||0,solve=!!o.solve;
  const mk=(T,x,P,i)=>{const c={S:T,C:null,ch:[],n:0,w:0,m:x.m,pv:0};if(pb||vi)c.h=sig(x.s,scale);if(puct)c.p=P[i];
    if(rave){c.k=keyOf(x.m);c.an=0;c.aw=0;}if(solve&&G.done(T)){const f=G.result(T,me);c.pv=f>0?1:f<0?-1:0;}return c;};
  let root=null;
  if(o.keep&&last&&last.me===me&&last.sg===sgOf(o))root=findNode(last.root,S,3);
  if(root){   // re-rooted: the root candidates are C0; the children already open come first, in C0's order
    const op=new Map(root.ch.map(c=>[rave?c.k:keyOf(c.m),c])),A=[],B=[];for(const x of C0)(op.has(keyOf(x.m))?A:B).push(x);
    root.C=A.concat(B);const P=puct?soft(root.C,pT):null;root.ch=A.map((x,i)=>{const c=op.get(keyOf(x.m));if(pb||vi)c.h=sig(x.s,scale);if(puct)c.p=P[i];return c;});
    root.n=0;root.w=0;for(const c of root.ch){root.n+=c.n;root.w+=c.w;}root.pv=0;root.P=P;if(solve)prove(root,me);}
  else root={S,C:C0,ch:[],n:0,w:0,pv:0,P:puct?soft(C0,pT):null};
  let sims=0,maxD=1;const seq=rave?[]:null,rec=rave?(m,p)=>{seq.push(keyOf(m),p);}:undefined;
  for(;sims<(o.sims||2000);sims++){if((sims&15)===0&&now()>cap)break;if(solve&&root.pv)break;
    let node=root,v=-1;const path=[root];if(rave)seq.length=0;
    while(!G.done(node.S)){
      if(solve&&node.pv){v=node.pv>0?1:0;break;}
      if(!node.C){node.C=G.moves(node.S,o.cellsIn||8);if(puct)node.P=soft(node.C,pT);}
      const X=G.turn(node.S),mine=X===me;let best=null;
      let lost=0;if(solve)for(const c of node.ch)if(c.pv&&(c.pv>0)!==mine)lost++;   // proved-lost children leave their place to a new one
      if(node.ch.length>=node.C.length||node.ch.length-lost>=pw(node.n)){
        if(!node.ch.length)break;
        const ln=Math.log(node.n+1),sn=Math.sqrt(node.n);let bv=-1e18;
        for(const c of node.ch){if(solve&&c.pv&&(c.pv>0)!==mine)continue;   // proved lost for the mover
          let q=c.n?(mine?c.w/c.n:1-c.w/c.n):.5;
          if(vi)q=((c.n?(mine?c.w:c.n-c.w):0)+vi*c.h)/(c.n+vi);
          if(rave&&c.an){const b=Math.sqrt(rave/(3*c.n+rave));q=(1-b)*q+b*(mine?c.aw/c.an:1-c.aw/c.an);}
          let u=puct?puct*c.p*sn/(1+c.n)+(c.n?0:1e-9*c.p):cx*Math.sqrt(ln/(c.n+1));
          if(pb)u+=pb*c.h/(c.n+1);
          if(q+u>bv){bv=q+u;best=c;}}
        if(!best&&node.ch.length>=node.C.length)break;}   // every candidate proved lost: prove() has marked the node
      if(!best){const i=node.ch.length,x=node.C[i],c=mk(G.play(node.S,x.m),x,node.P,i);
        node.ch.push(c);path.push(c);if(rave)seq.push(c.k,X);node=c;break;}
      node=best;path.push(node);if(rave)seq.push(node.k,X);}
    if(v<0){const P=G.scratch(node.S);if(!G.done(P))G.playout(P,o,rec);
      if(G.done(P)){const f=G.result(P,me);v=f>0?.9+Math.min(.1,(f-1000)/50):f<0?.1-Math.min(.1,(-1000-f)/50):.5;}
      else v=1/(1+Math.exp(-G.eval(P,me)/scale));}
    for(const x of path){x.n++;x.w+=v;}if(path.length-1>maxD)maxD=path.length-1;
    if(rave){const L=path.length,sets=new Map();
      for(let i=seq.length/2-1;i>=0;i--){const p=seq[2*i+1];let st=sets.get(p);if(!st){st=new Set();sets.set(p,st);}st.add(seq[2*i]);
        if(i<L-1){const nd=path[i];for(const c of nd.ch)if(st.has(c.k)){c.an++;c.aw+=v;}}}}
    if(solve)for(let j=path.length-2;j>=0;j--)if(!prove(path[j],me))break;}
  nodes=sims;if(o.keep)last={root,me,sg:sgOf(o)};
  const R=root.ch.map(c=>({k:keyOf(c.m),m:c.m,n:c.n,w:c.w,pv:c.pv}));
  if(sub)return {R,depth:maxD};
  return pickRoot(R,o,maxD,C0);}
// a node proved from its children (true when it changes): won for its mover if a child is, lost if all candidates are
function prove(nd,me){if(nd.pv||!nd.C||!nd.C.length)return false;const mine=G.turn(nd.S)===me,good=mine?1:-1;let all=nd.ch.length===nd.C.length;
  for(const c of nd.ch){if(c.pv===good){nd.pv=good;return true;}if(c.pv!==-good)all=false;}
  if(all){nd.pv=-good;return true;}return false;}
// the root move from the children's visits [{k,m,n,w,pv}]
// (with solve, when every open child is proved lost, a candidate not opened yet is played rather than a sure loss)
function pickRoot(R,o,depth,C0){let ch=R.slice();
  if(o.solve){const w=ch.filter(c=>c.pv===1);if(w.length)ch=w;else{const ok=ch.filter(c=>c.pv!==-1);if(ok.length)ch=ok;
    else{const ks=new Set(R.map(c=>c.k)),x=C0.find(x=>!ks.has(keyOf(x.m)));if(x){
      if(o.rootOut&&typeof globalThis!=='undefined')globalThis.__aiRoot={multi:true};return {m:x.m,s:x.s,depth};}}}}
  ch.sort((a,b)=>b.n-a.n);let pick=ch[0];
  if(o.temp){const ws=ch.map(x=>Math.pow(x.n,1/o.temp));let r=Math.random()*ws.reduce((a,b)=>a+b,0);for(let i=0;i<ch.length;i++){r-=ws[i];if(r<=0){pick=ch[i];break;}}}
  if(o.rootOut&&typeof globalThis!=='undefined')globalThis.__aiRoot=globalThis.__aiRoot?{multi:true}:{k:pick.k,R:R.map(c=>({k:c.k,n:c.n,w:c.w,pv:c.pv}))};
  const q=pick.n?pick.w/pick.n:.5,scale=o.scale||3;
  return {m:pick.m,s:o.solve&&pick.pv?pick.pv*1000:Math.log(Math.max(1e-3,q)/Math.max(1e-3,1-q))*scale,depth};}
// ----- beam with order / pvs / tt -----
const EPS=1e-7;
function negaX(S,d,al,be,o,ply,X){const me=G.turn(S);if(G.done(S))return G.result(S,me);
  if(now()>deadline)throw new Stop();nodes++;
  const C=G.moves(S,o.cellsIn||o.cells);if(!C.length)return G.eval(S,me);
  if(d<=1)return C[0].s;
  const w=o.widths[Math.min(ply,o.widths.length-1)];let L=C.slice(0,Math.min(w,C.length)),hk,e,tb;
  if(X.tt){hk=G.hash(S);e=X.tt.get(hk);if(e){tb=e.b;if(e.d===d&&e.ply===ply){if(e.f===0)return e.v;if(e.f>0&&e.v>=be)return e.v;if(e.f<0&&e.v<=al)return e.v;}}}
  if(X.order||tb!==undefined){const k1=X.k1[ply],k2=X.k2[ply];
    const sc=L.map((x,i)=>{const k=keyOf(x.m);return {x,i,k,v:k===tb?4e9:!X.order?0:k===k1?3e9:k===k2?2e9:(X.hi.get(k)||0)};});
    sc.sort((a,b)=>b.v-a.v||a.i-b.i);L=sc.map(y=>y.x);}
  const al0=al;let best=-1e9,bm=null;
  for(let i=0;i<L.length;i++){const T=G.play(S,L[i].m);let v;
    if(X.pvs&&i>0){v=childX(T,me,d-1,al,al+EPS,o,ply+1,X);if(v>al&&v<be)v=childX(T,me,d-1,al,be,o,ply+1,X);}
    else v=childX(T,me,d-1,al,be,o,ply+1,X);
    if(v>best){best=v;bm=L[i].m;}if(v>al)al=v;
    if(al>=be){if(X.order){const k=keyOf(L[i].m);if(X.k1[ply]!==k){X.k2[ply]=X.k1[ply];X.k1[ply]=k;}X.hi.set(k,(X.hi.get(k)||0)+d*d);}break;}}
  if(X.tt)X.tt.set(hk,{d,ply,v:best,f:best<=al0?-1:best>=be?1:0,b:bm===null?undefined:keyOf(bm)});
  return best;}
function childX(T,me,d,al,be,o,ply,X){return G.done(T)?G.result(T,me):G.turn(T)===me?negaX(T,d,al,be,o,ply,X):-negaX(T,d,-be,-al,o,ply,X);}
function beamX(S,C,o){const me=G.turn(S),res={m:C[0].m,s:C[0].s,depth:1};let R=C.slice(0,o.widths[0]).map(x=>({m:x.m,s:x.s}));
  const X={order:!!o.order,pvs:!!o.pvs,tt:o.tt&&G.hash?new Map():null,k1:[],k2:[],hi:new Map()};
  for(let d=2;d<=o.depth;d++){const vals=[];let al=-1e9;
    try{for(let i=0;i<R.length;i++){const x=R[i],T=G.play(S,x.m);let v;
        if(X.pvs&&i>0){v=childX(T,me,d-1,al,al+EPS,o,1,X);if(v>al)v=childX(T,me,d-1,al,1e9,o,1,X);}
        else v=childX(T,me,d-1,al,1e9,o,1,X);
        vals.push({m:x.m,s:v});if(v>al)al=v;}}
    catch(e){if(e instanceof Stop)break;throw e;}
    vals.sort((a,b)=>b.s-a.s);R=vals;res.m=R[0].m;res.s=R[0].s;res.depth=d;}
  if(o.noise){const ok=R.filter(x=>x.s>=res.s-o.noise);const x=ok[(Math.random()*ok.length)|0];if(x)res.m=x.m;}
  return res;}
const anyOf=(o,L)=>{for(const k of L)if(o[k])return true;return false;};
const BX=['order','pvs','tt'];
return {start,greedy,beam:(S,C,o)=>anyOf(o,BX)?beamX(S,C,o):beam(S,C,o),mcts:(S,C,o)=>anyOf(o,MX)||o.rootPick!=null?mctsX(S,C,o):mcts(S,C,o),nodes:()=>nodes};
}
