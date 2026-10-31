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
return {start,greedy,beam,mcts,nodes:()=>nodes};
}
