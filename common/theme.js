// Light or dark: the device's setting (the default) or the one chosen with the header button (◐ device, ☀ light,
// ☾ dark), kept in games-theme for every page of the site. Loaded in <head>, so a page is painted in its theme at once.
// The pages' dark colours apply under @media (prefers-color-scheme:dark) to :root:not([data-theme="light"]), and to
// :root[data-theme="dark"] whatever the device says.
// Also the header's language frame: the current code, a menu of the languages dropping from it (the page's own script
// handles the [data-lang] items and sets <html lang>, read here for the label).
(function(){const K='games-theme',ST=['auto','light','dark'],root=document.documentElement;
  const read=()=>{let v='auto';try{v=JSON.parse(localStorage.getItem(K))||'auto';}catch(e){}return ST.includes(v)?v:'auto';};
  let th=read();const set=()=>{if(th==='auto')root.removeAttribute('data-theme');else root.setAttribute('data-theme',th);};set();
  // a switch is instant: no colour transition caught halfway (a card's title kept the other theme's ink)
  const swap=()=>{const st=document.createElement('style');st.textContent='*,*::before,*::after{transition:none!important}';document.head.appendChild(st);
    set();getComputedStyle(root).color;setTimeout(()=>st.remove(),50);};
  const TXT={fr:{auto:'Thème : celui de l’appareil',light:'Thème : clair',dark:'Thème : sombre'},
    en:{auto:'Theme: device setting',light:'Theme: light',dark:'Theme: dark'},
    es:{auto:'Tema: el del dispositivo',light:'Tema: claro',dark:'Tema: oscuro'}},ICON={auto:'◐',light:'☀︎',dark:'☾'};
  let b=null,lb=null;const label=()=>{const l=/^en/.test(root.lang||'')?'en':/^es/.test(root.lang||'')?'es':'fr';if(lb)lb.textContent=l.toUpperCase();if(!b)return;b.textContent=ICON[th];b.title=TXT[l][th];b.setAttribute('aria-label',TXT[l][th]);};
  function add(){const seg=document.querySelector('header .seg');if(!seg||b)return;
    b=document.createElement('button');b.type='button';b.className='themeBtn';
    b.onclick=()=>{th=ST[(ST.indexOf(th)+1)%ST.length];try{localStorage.setItem(K,JSON.stringify(th));}catch(e){}swap();label();};
    seg.prepend(b);
    lb=seg.querySelector('.langBtn');const mn=seg.querySelector('.langdd .menu');
    if(lb&&mn){const open=o=>{mn.hidden=!o;lb.setAttribute('aria-expanded',o?'true':'false');};
      lb.addEventListener('click',e=>{e.stopPropagation();open(mn.hidden);if(!mn.hidden){const cur=mn.querySelector('[aria-pressed="true"]')||mn.firstElementChild;cur&&cur.focus();}});
      mn.addEventListener('click',()=>{open(false);lb.focus();});
      document.addEventListener('click',e=>{if(!mn.hidden&&!mn.contains(e.target))open(false);});
      document.addEventListener('keydown',e=>{if(mn.hidden)return;if(e.key==='Escape'){open(false);lb.focus();}
        else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const it=[...mn.querySelectorAll('button')],i=it.indexOf(document.activeElement);it[(i+(e.key==='ArrowDown'?1:-1)+it.length)%it.length].focus();}});}
    label();new MutationObserver(label).observe(root,{attributes:true,attributeFilter:['lang']});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',add);else add();
  // another tab of the site changed it
  window.addEventListener('storage',e=>{if(e.key===K){th=read();swap();label();}});})();
