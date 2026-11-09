// The game a code belongs to: its first character (the game's letter, then random characters), so that a code entered
// on the home page opens the right page. 6 characters: the players' code (the page opens on #join-…), 8: the
// spectators' (#watch-…). Mochalunt matches go by their links only.
const CODE_GAMES={p:{id:'pente',page:'pente'},d:{id:'pdd',page:'pontedeldiavolo'},z:{id:'zertz',page:'zertz'},g:{id:'gyges',page:'gyges'},
  a:{id:'arimaa',page:'arimaa'},v:{id:'volo',page:'volo'},t:{id:'tintas',page:'tintas'},b:{id:'dblk',page:'diagonalblocks'},q:{id:'quarto',page:'quarto'}};
// the page a code (or a whole invitation link) leads to, null if none
function codeTarget(raw){const s=String(raw||'').trim(),lk=/#(join|watch)-([a-z0-9]+)/i.exec(s),c=(lk?lk[2]:s).toLowerCase().replace(/[^a-z0-9]/g,'');
  const g=CODE_GAMES[c[0]];if(!g||(c.length!==6&&c.length!==8))return null;
  return g.page+'.html#'+(c.length===8?'watch-':'join-')+c;}
