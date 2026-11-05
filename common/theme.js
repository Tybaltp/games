// Light or dark: the device's setting (the default) or the one chosen with the header button (◐ device, ☀ light,
// ☾ dark), kept in games-theme for every page of the site. Loaded in <head>, so a page is painted in its theme at once.
// The pages' dark colours apply under @media (prefers-color-scheme:dark) to :root:not([data-theme="light"]), and to
// :root[data-theme="dark"] whatever the device says.
(function(){const K='games-theme',ST=['auto','light','dark'],root=document.documentElement;
  const read=()=>{let v='auto';try{v=JSON.parse(localStorage.getItem(K))||'auto';}catch(e){}return ST.includes(v)?v:'auto';};
  let th=read();const set=()=>{if(th==='auto')root.removeAttribute('data-theme');else root.setAttribute('data-theme',th);};set();
  // a switch is instant: no colour transition caught halfway (a card's title kept the other theme's ink)
  const swap=()=>{const st=document.createElement('style');st.textContent='*,*::before,*::after{transition:none!important}';document.head.appendChild(st);
    set();getComputedStyle(root).color;setTimeout(()=>st.remove(),50);};
  const TXT={fr:{auto:'Thème : celui de l’appareil',light:'Thème : clair',dark:'Thème : sombre'},
    en:{auto:'Theme: device setting',light:'Theme: light',dark:'Theme: dark'}},ICON={auto:'◐',light:'☀︎',dark:'☾'};
  let b=null;const label=()=>{if(!b)return;const l=/^en/.test(root.lang||'')?'en':'fr';b.textContent=ICON[th];b.title=TXT[l][th];b.setAttribute('aria-label',TXT[l][th]);};
  function add(){const seg=document.querySelector('header .seg');if(!seg||b)return;
    b=document.createElement('button');b.type='button';b.className='themeBtn';
    b.onclick=()=>{th=ST[(ST.indexOf(th)+1)%ST.length];try{localStorage.setItem(K,JSON.stringify(th));}catch(e){}swap();label();};
    seg.prepend(b);label();new MutationObserver(label).observe(root,{attributes:true,attributeFilter:['lang']});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',add);else add();
  // another tab of the site changed it
  window.addEventListener('storage',e=>{if(e.key===K){th=read();swap();label();}});})();
