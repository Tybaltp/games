// Gygès : le moteur WebAssembly derrière la même interface que GygesAI(E).search(pos, opt) de la page.
// moteur(X) -> {search(pos, opt)} ; X = exports de gyges.wasm (commun/charge.js). Le hasard : X.rng_set / X.rng_get.
// pos = {b[36], turn, n, passes, sm} (la position de la page) ; opt = le niveau, plus adv et hist ({clé: nombre}).
'use strict';
(function(root){
  function moteur(X){
    const int=x=>typeof x==='number'&&Number.isInteger(x)&&Math.abs(x)<1e9;
    function search(pos,opt){const o={adv:false,depth:3,nodes:Infinity,noise:0,maxSeg:99,cap:60000,...opt};
      const ext=o.ext==null?3:o.ext,lmr=o.lmr||0,pt=o.placeTries||0;
      // ce que le C ne sait pas lire : rendre null
      if(!pos||!pos.b||pos.b.length!==36||!int(o.depth)||!int(o.maxSeg)||!int(ext)||!int(lmr)||lmr<0||!int(pt)||pt<0)return null;
      if(typeof o.nodes!=='number'||typeof o.noise!=='number'||typeof o.cap!=='number'||o.nodes!==o.nodes||o.noise!==o.noise||o.cap!==o.cap)return null;
      if(o.placeTol!=null&&typeof o.placeTol!=='number')return null;
      // opt.hist : les positions (36 cases + trait) ; R existe dès qu'il y a une clé, même illisible
      let H=[],nk=0;if(o.hist)for(const k in o.hist){nk++;const i=k.lastIndexOf('|');if(i<0)continue;const t=k.slice(i+1);if(t!=='0'&&t!=='1')continue;
        const a=k.slice(0,i).split(',').map(Number);if(a.length!==36||a.some(v=>v!==0&&v!==1&&v!==2&&v!==3))continue;a.push(+t);H.push(a);}
      if(H.length){const p=X.hist_ptr(H.length);if(!p)return null;const B=new Uint8Array(X.memory.buffer,p,H.length*37);for(let i=0;i<H.length;i++)B.set(H[i],i*37);}
      let I=new Int32Array(X.memory.buffer,X.gio(),256),D=new Float64Array(X.memory.buffer,X.gdn(),8);
      for(let i=0;i<36;i++){const v=pos.b[i];if(v!==0&&v!==1&&v!==2&&v!==3)return null;I[i]=v;}
      I[36]=pos.turn?1:0;I[37]=pos.n|0;I[38]=pos.passes|0;I[39]=pos.sm&&pos.sm!=='piece'?1:0;I[40]=o.adv?1:0;I[41]=o.depth;I[42]=o.maxSeg;
      I[43]=o.random?1:0;I[44]=o.ts?1:0;I[45]=o.shuffle?1:0;I[46]=pt;I[47]=o.placeTol!=null?1:0;I[48]=ext;I[49]=lmr;I[50]=o.cx?1:0;I[51]=o.ev===1?1:0;
      I[52]=H.length;I[53]=nk?1:0;D[0]=o.nodes;D[1]=o.noise;D[2]=o.cap;D[3]=o.placeTol!=null?o.placeTol:0;
      const kind=X.search();if(!kind)return null;
      I=new Int32Array(X.memory.buffer,X.gio(),256);D=new Float64Array(X.memory.buffer,X.gdn(),8);
      const mv=()=>{const path=[];for(let i=0;i<I[103];i++)path.push(I[104+i]);return {t:'m',s:I[101],path,rep:I[102]};};
      switch(kind){
        case 1:return {move:{t:'x'},score:0,depth:0};
        case 2:return {move:mv(),score:0,depth:0,random:true};
        case 3:return {move:mv(),score:D[4],depth:0,forced:!!I[170]};
        case 4:return {move:mv(),score:D[4],depth:D[5],nodes:D[6]};
        case 5:return {move:{t:'p',at:I[171],k:I[172]},score:0,depth:0};
        case 6:return {move:{t:'b',row:[I[173],I[174],I[175],I[176],I[177],I[178]]},score:0,depth:0};}
      return null;}
    return {search};}
  if(typeof module!=='undefined')module.exports={moteur};else (root.Glue=root.Glue||{}).gyges={moteur};
})(typeof globalThis!=='undefined'?globalThis:this);
