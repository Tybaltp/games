// Precompiled engines (WebAssembly), loaded in the computer's worker by common/core.js (makeWorker) for the games that
// declare GAME.wasm. wasm/<game>.wasm is the page's JS engine rewritten in C: the same moves, the same use of random
// numbers (checked by outils/moteurs_wasm, verif.js); wasm/<game>.js is its glue (Glue.<game>.moteur).
// WasmMoteur(bytes, glue) -> {search(pos,opt)}; search gives null when the wasm cannot do it (an option it does not
// have) or failed: the page then searches with its JS engine (after an error the wasm is dropped for this worker).
// Random numbers: the wasm's generator (the tools' Math.random) is seeded from Math.random at each search; the C's exp,
// log and pow are the JS ones (Math), for the same numbers to the bit.
'use strict';
(function(root){
  const env={exp:Math.exp,log:Math.log,pow:Math.pow,emscripten_notify_memory_growth:()=>{}};
  const imports={env,wasi_snapshot_preview1:{proc_exit:()=>{},fd_write:()=>0,fd_close:()=>0,fd_seek:()=>0}};
  function WasmMoteur(bytes,glue){
    const X=new WebAssembly.Instance(new WebAssembly.Module(bytes),imports).exports;if(X._initialize)X._initialize();
    const M=glue.moteur(X);let ok=true;
    return {search(pos,opt){if(!ok)return null;
      try{X.rng_set(Math.floor(Math.random()*2147483648));return M.search(pos,opt);}catch(e){ok=false;return null;}}};}
  root.WasmMoteur=WasmMoteur;
})(typeof globalThis!=='undefined'?globalThis:this);
