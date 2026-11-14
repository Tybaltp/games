// The game a code belongs to: its first two letters (the game's), so that a code entered on the home page opens the
// right page; then 5 random characters for the players' code (the page opens on #join-…), 7 for the spectators'
// (#watch-…). Shown and put in links with a dash after the two letters (pe-k7m2q); the code itself has none (PeerJS ids,
// saved games), and when it is typed the dash may be left out, capitals and spaces are fine. The former codes (one
// letter, 6 or 8 characters, until 11.2026) are still read: 6/8 and 7/9 characters never overlap. Mochalunt matches go
// by their links only (mochalunt.html#join-<code>-…): their codes are not game codes.
// n: the game's name (messages)
const CODE_GAMES={pe:{id:'pente',n:'Pente',page:'pente',old:'p'},pd:{id:'pdd',n:'Ponte del Diavolo',page:'pontedeldiavolo',old:'d'},ze:{id:'zertz',n:'Zèrtz',page:'zertz',old:'z'},gy:{id:'gyges',n:'Gygès',page:'gyges',old:'g'},
  ar:{id:'arimaa',n:'Arimaa',page:'arimaa',old:'a'},vo:{id:'volo',n:'Volo',page:'volo',old:'v'},ti:{id:'tintas',n:'Tintas',page:'tintas',old:'t'},db:{id:'dblk',n:'Diagonal Blocks',page:'diagonalblocks',old:'b'},qu:{id:'quarto',n:'Quarto',page:'quarto',old:'q'},py:{id:'pylos',n:'Pylos',page:'pylos',old:'l'}};
// games still on their branch (letters kept for them): tw Tumbleweed (old w), sl Slither (s), ay Ayu (y), si Siam (m)
// the game of a code without its dash (new: 7 or 9 characters, former: 6 or 8), null if none; a spectators' code
const codeGame=c=>{c=String(c||'');if(c.length===7||c.length===9)return CODE_GAMES[c.slice(0,2)]||null;
  if(c.length===6||c.length===8)for(const k in CODE_GAMES)if(CODE_GAMES[k].old===c[0])return CODE_GAMES[k];return null;};
const codeWatch=c=>c.length===8||c.length===9;
// a code as shown and put in links: the dash after the game's two letters (a former code, or any other, as it is)
const codeShow=c=>(c=String(c||''))&&(c.length===7||c.length===9)&&CODE_GAMES[c.slice(0,2)]?c.slice(0,2)+'-'+c.slice(2):c;
// what was typed or pasted (a code, a whole invitation link): {c: the code without its dash, w: a spectators' one (or a
// #watch- link), g: its game} · {m: '#…', a Mochalunt link} · {e: the key of the message to show}
function codeRead(raw){const s=String(raw||'').trim();if(!s)return {e:'codeEmpty'};
  const mo=/#((?:join|watch)-[a-z0-9]{6,8}-\S*)$/i.exec(s);if(mo)return {m:'#'+mo[1]};   // a match's code (6 or 8), then a dash
  const lk=/#(join|watch|host)-([a-z0-9-]+)$/i.exec(s);if(!lk&&/[/:#.]/.test(s))return {e:'codeBad'};
  const c=(lk?lk[2]:s).toLowerCase().replace(/[^a-z0-9]/g,''),g=codeGame(c);
  if(!g)return {e:c.length<6?'codeShort':c.length>9?'codeLong':'codeBad'};
  return {c,w:codeWatch(c)||!!lk&&lk[1].toLowerCase()==='watch',g};}
// the address a code read leads to (from the site's home page or another game's page)
const codeHref=r=>r.m?'mochalunt.html'+r.m:r.g.page+'.html#'+(r.w?'watch-':'join-')+codeShow(r.c);
