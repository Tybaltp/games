// Zèrtz : le moteur WebAssembly derrière la même interface que ZertzEngine(n).search(s, opt) de la page.
// moteur(X) -> {search(pos, opt)} ; X = exports de zertz.wasm (commun/charge.js). Le hasard : X.rng_set / X.rng_get.
// pos : la position de la page (Int8Array ou tableau de 2N+11 nombres ; 107 = 48 anneaux, 85 = 37), ou l'état du banc
// {n, s}. Un seul module sert les deux tailles de plateau.
'use strict';
(function(root){
  function moteur(X){
    function search(pos,opt){const o=opt||{},s=pos&&pos.s?pos.s:pos,n=pos&&pos.s&&pos.n?pos.n:(s.length-11)/2;
      if((n!==37&&n!==48)||s.length!==2*n+11)return null;
      // la pile de travail du C grandit selon le besoin : si elle déborde (trap), on la double et on relance la même
      // recherche avec la même graine (search repart de zéro : même coup, même hasard consommé)
      const r0=X.rng_get(),sp=X.zsp_get?X.zsp_get():0;let k;
      for(;;){new Int8Array(X.memory.buffer,X.zio(),256).set(s);
        try{k=X.search(n,o.depth||3,o.fb??3,o.nodes||Infinity,o.noise||0,(o.random||o.algo==='random')?1:0,
          o.beam||10,o.rootBeam||30,o.qk||12,o.qm||450);break;}
        catch(e){if(!(e instanceof WebAssembly.RuntimeError)||!X.zgrow)throw e;X.zsp_set(sp);if(!X.zgrow())return null;X.rng_set(r0);}}
      if(!k)return null;
      const J=new Int8Array(X.memory.buffer,X.zio(),256),O=new Float64Array(X.memory.buffer,X.zout(),4);
      const move=J[128]===1?{t:1,path:Array.from(J.subarray(130,130+J[129]))}:{t:0,c:J[129],at:J[130],rm:J[131]};
      if(k===1)return {move,score:0,depth:0,fb:0,random:true};
      if(k===2)return {move,score:0,depth:0,fb:0};
      return {move,score:O[0],depth:O[1],fb:O[2],nodes:O[3]};}
    return {search};}
  if(typeof module!=='undefined')module.exports={moteur};else (root.Glue=root.Glue||{}).zertz={moteur};
})(typeof globalThis!=='undefined'?globalThis:this);
