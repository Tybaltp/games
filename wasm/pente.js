// Pente : le moteur WebAssembly derrière la même interface que la recherche de la page telle que le banc l'appelle
// (aitools/budget/games.js, raw : aiSearch(pos,opt) puis {...r, nodes}). moteur(X) -> {search(pos, opt)} ;
// X = exports de pente.wasm (commun/charge.js). pos = {phase, B (225 cases), caps [0, noir, blanc], toMove}.
// Le hasard : X.rng_set / X.rng_get. nodes : le compteur de la dernière recherche (il reste d'un appel à l'autre).
'use strict';
(function(root){
  const PH={play:0,open:1,choose:2,choose1:3};
  function moteur(X){
    function search(pos,opt){opt=opt||{};
      const B=new Int8Array(X.memory.buffer,X.pboard(),225),I=new Int32Array(X.memory.buffer,X.pio(),16);
      const pb=pos.B||[],pc=pos.caps||[];for(let i=0;i<225;i++)B[i]=pb[i]|0;I[8]=pc[1]|0;I[9]=pc[2]|0;
      const ph=PH[pos.phase];
      const kind=X.psearch(ph===undefined?4:ph,pos.toMove|0,opt.random?1:0,+opt.mix||0,+opt.nodes||0,opt.maxDepth|0,+opt.noise||0,
        opt.ext!==false?1:0,opt.k|0,opt.hint?1:0);
      const J=new Int32Array(X.memory.buffer,X.pio(),16),O=new Float64Array(X.memory.buffer,X.pout(),4),nodes=O[1];
      if(!kind)return {nodes};
      const move=kind===1?{t:'m',i:J[1]}:kind===2?{t:'o',s:[J[1],J[2],J[3]]}:kind===3?{t:'B'}:kind===4?{t:'W',next:J[1]}:
        kind===5?{t:'a',s:[J[1],J[2]]}:{t:'W'};
      const r={move,score:O[0],depth:J[4]};if(J[5])r.random=true;r.nodes=nodes;return r;}
    return {search};}
  if(typeof module!=='undefined')module.exports={moteur};else (root.Glue=root.Glue||{}).pente={moteur};
})(typeof globalThis!=='undefined'?globalThis:this);
