// Ponte del Diavolo : le moteur WebAssembly derrière la même interface que PonteAI().search(pos, opt) de la page.
// moteur(X) -> {search(pos, opt)} ; X = exports de pontedeldiavolo.wasm (commun/charge.js). Hasard : X.rng_set / X.rng_get.
// pos : la position de la page (aiPos : ponts [a,b,propriétaire]) ou son état brut (ponts {a,b,o}) ; les deux sont lus.
// Non porté (rend null) : les options de mctsX (pb, vInit, puct, rave, solve, keep, roots, rootOut, rootPick) et de beamX
// (order, pvs, tt), qu'aucun niveau de la page n'utilise.
'use strict';
(function(root){
  const PH={opening:0,pie:1,play:2,over:3},ALGO={greedy:0,beam:1,mcts:2};
  const NON=['pb','vInit','puct','rave','solve','keep','roots','rootOut','order','pvs','tt'];
  function moteur(X){
    function search(pos,opt){opt=opt||{};
      if(pos.phase==='over')return null;
      if(!opt.random&&pos.phase==='play'){if(!(opt.algo in ALGO))return null;for(const k of NON)if(opt[k])return null;if(opt.rootPick!=null)return null;
        if(opt.algo==='beam'&&!(Array.isArray(opt.widths)&&opt.widths.length&&opt.widths.length<=16&&opt.depth>=1))return null;}
      const I=new Int32Array(X.memory.buffer,X.pio(),512),D=new Float64Array(X.memory.buffer,X.pod(),64);
      for(let i=0;i<100;i++)I[i]=pos.cells[i];
      const B=pos.bridges||[];if(B.length>64)return null;I[100]=B.length;
      B.forEach((b,k)=>{const a=Array.isArray(b)?b:[Math.min(b.a,b.b),Math.max(b.a,b.b),b.o];I[101+3*k]=a[0];I[102+3*k]=a[1];I[103+3*k]=a[2];});
      I[293]=PH[pos.phase];I[294]=pos.toMove||0;I[295]=pos.finalTurn?1:0;I[296]=pos.colorA||0;
      const u=x=>x===undefined?NaN:x;   // absent : toute comparaison est fausse, comme avec undefined
      D[0]=opt.random?1:0;D[1]=ALGO[opt.algo]===undefined?-1:ALGO[opt.algo];D[2]=opt.cells||20;D[3]=opt.pick||0;D[4]=opt.temp||0;
      D[5]=opt.depth||0;const W=opt.widths||[];D[6]=W.length;for(let i=0;i<W.length&&i<16;i++)D[24+i]=W[i];
      D[7]=opt.cellsIn||opt.cells||100;D[8]=opt.noise||0;D[9]=opt.nodes>0?opt.nodes:0;
      D[10]=opt.cellsIn||8;D[11]=opt.sims||2000;D[12]=opt.c===undefined?.7:opt.c;D[13]=opt.pwC||2;D[14]=opt.pwA||.5;
      D[15]=opt.cut||0;D[16]=u(opt.rand);D[17]=u(opt.brP);D[18]=opt.scale||3;D[19]=opt.temp||0;D[20]=opt.openTries||60;
      if(!X.search())return null;
      const J=new Int32Array(X.memory.buffer,X.pio(),512),O=new Float64Array(X.memory.buffer,X.pod(),64);   // la mémoire a pu grandir
      const k=J[300],move=k===0?{t:'t',cells:J[302]===-1?[J[301]]:[J[301],J[302]===-2?undefined:J[302]]}:k===1?{t:'b',a:J[301],b:J[302]}:k===2?{t:'x'}:{t:J[301]?'L':'D'};
      if(J[305])return {move,score:0,depth:0,random:true};
      if(J[304]===2)return {move,score:0,depth:0,forced:true};
      return {move,score:O[40],depth:J[303],forced:!!J[304],nodes:O[41]};}
    return {search};}
  if(typeof module!=='undefined')module.exports={moteur};else (root.Glue=root.Glue||{}).pontedeldiavolo={moteur};
})(typeof globalThis!=='undefined'?globalThis:this);
