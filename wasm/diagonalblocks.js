// Diagonal Blocks : le moteur WebAssembly derrière la même interface que DiagAI().search(pos, opt) de la page.
// moteur(X) -> {search(pos, opt)} ; X = exports de diagonalblocks.wasm (commun/charge.js). Le hasard : X.rng_set / X.rng_get.
// pos : {b[196], used[2], cnt[2], turn, sw, n, over, stuck[2]} (aiPos de la page). Les options absentes prennent ici
// les valeurs par défaut de la page et d'AISearch ; une option non portée rend null (voir NOTES.md).
'use strict';
(function(root){
  const NON=['openTab','firstTab','openPieces','pb','vInit','rave','solve','keep','roots','rootOut','order','pvs','tt','ev'];
  const ALGO={greedy:0,beam:1,mcts:2};
  function moteur(X){
    function search(pos,o){
      for(const k of NON)if(o[k])return null;
      if(o.rootPick!=null)return null;
      if(!o.random&&!(o.algo in ALGO))return null;
      if(o.algo==='beam'&&!(o.widths&&o.widths.length&&o.widths.length<=24&&o.depth<=38))return null;
      const B=new Int8Array(X.memory.buffer,X.board(),196),P=new Float64Array(X.memory.buffer,X.par(),80);
      for(let i=0;i<196;i++)B[i]=pos.b[i];
      const mc=o.algo==='mcts',scale=o.scale||3;
      const V=[pos.used[0],pos.used[1],pos.cnt[0],pos.cnt[1],pos.turn,pos.sw?1:0,pos.n,pos.over?1:0,pos.stuck[0]?1:0,pos.stuck[1]?1:0,
        o.random?1:0,o.random?0:ALGO[o.algo],o.cells||40,mc?(o.cellsIn||8):(o.cellsIn||o.cells||0),o.temp||0,o.pick||0,o.depth||0,o.noise||0,
        o.nodes>0?o.nodes:0,o.sims||2000,o.c===undefined?.7:o.c,o.pwC||2,o.pwA||.5,scale,o.cut||0,o.tries||8,o.rand||2,o.openPick||6,
        o.endgame||0,o.solveNodes||0,o.endLoss?1:0,o.puct||0,o.pT||scale,o.noSwap?1:0,o.widths?o.widths.length:0];
      for(let i=0;i<V.length;i++)P[i]=V[i];
      if(o.widths)for(let i=0;i<o.widths.length;i++)P[V.length+i]=o.widths[i];
      if(!X.search())return null;
      const R=new Float64Array(X.memory.buffer,X.par(),80),m=R[60];let move;
      if(m<0)move={t:'s'};else{const cells=[],n=X.mv_n(m);for(let j=0;j<n;j++)cells.push(X.mv_cell(m,j));move={t:'p',k:X.mv_k(m),cells};}
      if(R[66])return {move,score:0,depth:0,random:true};
      return {move,score:R[61],depth:R[62],forced:!!R[63],nodes:R[64],solved:!!R[65]};}
    return {search};}
  if(typeof module!=='undefined')module.exports={moteur};else (root.Glue=root.Glue||{}).diagonalblocks={moteur};
})(typeof globalThis!=='undefined'?globalThis:this);
