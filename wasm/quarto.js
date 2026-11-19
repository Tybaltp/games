// Quarto : le moteur WebAssembly derrière la même interface que QuartoAI().search(pos, opt) de la page.
// moteur(X) -> {search(pos, opt)} ; X = exports de quarto.wasm (commun/charge.js). Le hasard : X.rng_set / X.rng_get.
'use strict';
(function(root){
  function moteur(X){
    const io=new Int32Array(X.memory.buffer,X.qio(),32),out=()=>new Float64Array(X.memory.buffer,X.qout(),4);
    function search(pos,opt){const I=io.buffer===X.memory.buffer?io:new Int32Array(X.memory.buffer,X.qio(),32);
      for(let i=0;i<16;i++)I[i]=pos.b[i];
      const ok=X.search(pos.hand,opt.depth||1,opt.nodes||0,opt.noise||0,opt.sq?1:0,opt.random?1:0);if(!ok)return null;
      const J=new Int32Array(X.memory.buffer,X.qio(),32),O=out(),r={move:{a:J[16],g:J[17]},score:O[0],depth:J[18]};
      if(J[19])r.forced=true;if(J[20])r.nodes=O[1];return r;}
    return {search};}
  if(typeof module!=='undefined')module.exports={moteur};else (root.Glue=root.Glue||{}).quarto={moteur};
})(typeof globalThis!=='undefined'?globalThis:this);
