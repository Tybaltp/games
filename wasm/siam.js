// Siam : le moteur WebAssembly derrière la même interface que SiamAI(SM).search(pos, opt) de la page.
// moteur(X) -> {search(pos, opt)} ; X = exports de siam.wasm (commun/charge.js). Le hasard : X.rng_set / X.rng_get.
// pos : {p:[null | {t:2} rocher | {t:0|1,d:'N'|'E'|'S'|'W'}], res, turn, col, n} ; opt : le niveau, avec opt.hist
// ({signature de la page: nombre}) pour la répétition.
'use strict';
(function(root){
  const DN='NESW',ROCK=2,ELE=0,RHI=1;
  const name=i=>String.fromCharCode(97+i%5)+(((i/5)|0)+1);
  const code=m=>{const d=m&3,t=(m>>2)&31,f=(m>>7)&31,k=m>>12;
    return k===0?'+'+name(t)+DN[d]:k===1?name(f)+'='+DN[d]:k===2?name(f)+'-x':name(f)+'-'+name(t)+DN[d];};
  // une signature de la page -> 28 octets (25 cases, res0, res1, turn) ; null si elle ne peut être la clé d'aucune position
  function ofSig(g){const b=[],p=g.split('|'),s=p[0];if(p.length<3)return null;
    for(let i=0;i<s.length;i++){const ch=s[i];if(ch==='.')b.push(0);else if(ch==='r')b.push(1);else{const d=DN.indexOf(s[++i]);if(d<0)return null;b.push(2+4*(ch==='e'?ELE:RHI)+d);}}
    const r=p[1].split(',');if(b.length!==25||!/^[0-9]$/.test(r[0])||!/^[0-9]$/.test(r[1])||!/^[01]$/.test(p[2]))return null;
    b.push(+r[0],+r[1],+p[2]);return b;}
  function moteur(X){
    function search(pos,opt){
      let I=new Int32Array(X.memory.buffer,X.sio(),80);
      for(let i=0;i<25;i++){const q=pos.p[i];I[i]=!q?0:q.t===ROCK?1:2+4*q.t+DN.indexOf(q.d);}
      I[25]=pos.res[0];I[26]=pos.res[1];I[27]=pos.turn;I[28]=pos.col[0];I[29]=pos.col[1];I[30]=pos.n||0;
      I[31]=opt.random?1:0;I[32]=opt.algo==='greedy'?0:opt.algo==='beam'?1:2;I[33]=opt.depth||0;
      const w=opt.widths;if(opt.algo==='beam'&&!(Array.isArray(w)&&w.length>=1&&w.length<=32))I[32]=2;
      I[34]=I[32]===1?w.length:0;if(I[32]===1)for(let i=0;i<w.length;i++)I[35+i]=w[i];
      I[67]=opt.tt?1:0;I[68]=opt.pick||0;I[71]=opt.ev||opt.order||opt.pvs?1:0;
      let H=null;if(opt.hist){H=[];for(const g in opt.hist){const b=ofSig(g);if(b)H.push(b);}}
      I[69]=H?1:0;I[70]=H?H.length:0;
      if(H&&H.length){const ptr=X.shist(H.length),B=new Int8Array(X.memory.buffer,ptr,H.length*28);
        for(let e=0;e<H.length;e++)B.set(H[e],e*28);}
      const D=new Float64Array(X.memory.buffer,X.sdb(),8);
      D[0]=opt.mix||0;D[1]=opt.nodes>0?opt.nodes:0;D[2]=opt.temp||0;D[3]=opt.noise||0;
      if(!X.search())return null;
      I=new Int32Array(X.memory.buffer,X.sio(),80);const O=new Float64Array(X.memory.buffer,X.sdb(),8),k=I[74],mv=code(I[72]);
      if(k===1)return {move:mv,score:0,depth:0,random:true};
      if(k===2)return {move:mv,score:O[4],depth:1};
      if(k===3)return {move:mv,score:O[4],depth:0,forced:true};
      return {move:mv,score:O[4],depth:I[73],nodes:O[5]};}
    return {search};}
  if(typeof module!=='undefined')module.exports={moteur};else (root.Glue=root.Glue||{}).siam={moteur};
})(typeof globalThis!=='undefined'?globalThis:this);
