#!/usr/bin/env python3
"""Pièces de Siam : la méthode de création.

Chaque pièce part d'un dessin noir et blanc (src/) : la silhouette dans un anneau, cadre 4358 × 4358, centre 2179,
anneau de 1550 à 1650, profil tourné vers la droite. La pièce est une pièce de monnaie au rendu des pièces d'Arimaa
(arimaa.html, pieceArt) : ombre douce, bord biseauté, face éclairée d'en haut à gauche, dessin gravé (une copie
claire décalée sous l'encre).
- animal : la pièce a la forme d'un cercle prolongé par deux tangentes qui se rejoignent en pointe dans sa direction ;
  profil vers la droite pour une pièce tournée à droite ou en haut, en miroir sinon ; la lumière ne tourne pas.
- rocher : pièce ronde, sans direction.

Tous les réglages sont dans P ci-dessous. Lancer `python3 gen.py` régénère, à côté de ce fichier :
- siam-art.js : les dessins et une fonction siamPiece(...) qui dessine une pièce dans un SVG de page, couleurs lues
  dans les variables CSS de la page (thème clair et sombre, camps) ; c'est la sortie à utiliser dans siam.html ;
- <pièce>-<direction>.svg et rocher.svg : les pièces en fichiers autonomes, couleurs par défaut ;
- apercu.html : les pièces dessinées par siam-art.js (incrusté), à trois tailles ; s'ouvre dans un navigateur.
Pour un nouveau dessin (autre rocher, autre animal) : le poser dans src/ au même format et l'ajouter à P['pieces'].
"""
import re, math, os, json

ICI = os.path.dirname(os.path.abspath(__file__))

P = {
    'face': 1790,             # rayon de la face, dans le cadre du dessin (l'anneau gravé finit à 1650)
    'bord': 23 / 20.8,        # rayon du bord / rayon de la face (proportion d'Arimaa)
    'pointe': 1.2,            # distance de la pointe / rayon du bord : 1.414 = angle droit, plus petit = moins pointu
    'ombre': (0.6 / 23, 1.4 / 23, 0.28),   # décalage x, y (en rayons du bord) et opacité de l'ombre
    'gravure': (52, 70, 0.85),              # décalage x, y (unités du dessin) et opacité de la copie claire
    'lumiere': (0.38, 0.32, 0.78),          # face : centre x, y et rayon du dégradé, en fraction du carré de la face
    # couleurs par défaut d'un camp : lumière, corps, ombre, bord sombre, encre (variables CSS --siam-<camp>-<clé>)
    'couleurs': {
        'or':     {'hi': '#f8e4a4', 'c1': '#d9ab3a', 'sh': '#a67a1e', 'c3': '#6b4b10', 'k': '#3a2908'},
        'argent': {'hi': '#fbfdfe', 'c1': '#b7c1c9', 'sh': '#7f8b94', 'c3': '#3d474f', 'k': '#1b2228'},
        'roche':  {'hi': '#f1dcbb', 'c1': '#b98b5e', 'sh': '#86592f', 'c3': '#4a2e14', 'k': '#2c1a0b'},
    },
    # pièce : dessin source, camp de couleur par défaut, forme ('pointe' ou 'rond')
    'pieces': {
        'elephant': ('elephant.svg', 'or', 'pointe'),
        'rhino':    ('rhino.svg', 'argent', 'pointe'),
        'rocher':   ('rocher.svg', 'roche', 'rond'),
    },
}

C, TAILLE = 2179, 4358
DIRS = {'droite': 0, 'bas': 90, 'gauche': 180, 'haut': 270}
MIROIR = ('gauche', 'bas')      # directions où le profil est retourné


def masque(fichier):
    """Le dessin en masque : blanc là où l'encre se pose, noir ailleurs ; sans le fond."""
    s = open(os.path.join(ICI, 'src', fichier)).read()
    s = re.sub(r'<\?xml.*?\?>|<metadata>.*?</metadata>', '', s, flags=re.S)
    s = re.sub(r'^.*?<svg[^>]*>|</svg>\s*$', '', s, flags=re.S)
    s = re.sub(r'<(path|rect)[^>]*(d="M 0 0 L 4358 0[^"]*"|width="4358")[^>]*/>', '', s, count=1)   # le fond
    s = s.replace(' transform="translate(0,0)"', '')
    noir = r'(?:rgb\(0,0,0\)|#000(?:000)?\b)'
    blanc = r'(?:rgb\(255,255,255\)|#fff(?:fff)?\b)'
    s = re.sub(noir, '@B', s); s = re.sub(blanc, '#000', s); s = s.replace('@B', '#fff')
    return re.sub(r'>\s+<', '><', s).strip()


def uniques(s, suffixe):
    """Rend uniques les id d'un dessin (plusieurs pièces dans une même page)."""
    for i in set(re.findall(r'id="([^"]+)"', s)):
        s = s.replace(f'id="{i}"', f'id="{i}{suffixe}"').replace(f'url(#{i})', f'url(#{i}{suffixe})')
    return s


def forme(r, angle, kind, dx=0.0, dy=0.0):
    if kind == 'rond':
        return f'M {C+dx-r:.1f} {C+dy:.1f} a {r:.1f} {r:.1f} 0 1 0 {2*r:.1f} 0 a {r:.1f} {r:.1f} 0 1 0 {-2*r:.1f} 0 z'
    t = math.acos(1 / P['pointe']); a = math.radians(angle)
    p = lambda u, q: f'{C+dx+q*math.cos(a+u):.1f} {C+dy+q*math.sin(a+u):.1f}'
    return f'M {p(-t, r)} L {p(0, r*P["pointe"])} L {p(t, r)} A {r:.1f} {r:.1f} 0 1 1 {p(-t, r)} z'


def piece_svg(nom, d):
    """Une pièce en SVG autonome, couleurs par défaut."""
    src, camp, kind = P['pieces'][nom]; c = P['couleurs'][camp]
    RF = P['face']; RB = RF * P['bord']; ox, oy, oo = P['ombre']; gx, gy, go = P['gravure']; lx, ly, lr = P['lumiere']
    m = uniques(masque(src), '')
    if d in MIROIR: m = f'<g transform="translate({2*C},0) scale(-1,1)">{m}</g>'
    st = lambda o, v: f'<stop offset="{o}" stop-color="{c[v]}"/>'
    defs = (f'<defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="{TAILLE}" height="{TAILLE}">'
            f'<rect width="{TAILLE}" height="{TAILLE}" fill="#000"/>{m}</mask>'
            f'<radialGradient id="f" gradientUnits="userSpaceOnUse" cx="{C-RF+2*RF*lx:.0f}" cy="{C-RF+2*RF*ly:.0f}" r="{2*RF*lr:.0f}">'
            f'{st(0,"hi")}{st(.5,"c1")}{st(1,"sh")}</radialGradient>'
            f'<linearGradient id="r" gradientUnits="userSpaceOnUse" x1="{C-RB:.0f}" y1="{C-RB:.0f}" x2="{C+RB:.0f}" y2="{C+RB:.0f}">'
            f'{st(0,"hi")}{st(.45,"sh")}{st(1,"c3")}</linearGradient></defs>')
    a = DIRS.get(d, 0)
    corps = (f'<path fill="rgba(0,0,0,{oo})" d="{forme(RB, a, kind, RB*ox, RB*oy)}"/>'
             f'<path fill="url(#r)" d="{forme(RB, a, kind)}"/><path fill="url(#f)" d="{forme(RF, a, kind)}"/>'
             f'<rect transform="translate({gx} {gy})" width="{TAILLE}" height="{TAILLE}" fill="{c["hi"]}" opacity="{go}" mask="url(#m)"/>'
             f'<rect width="{TAILLE}" height="{TAILLE}" fill="{c["k"]}" mask="url(#m)"/>')
    H = RB * (P['pointe'] if kind == 'pointe' else 1) + 140
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{C-H:.0f} {C-H:.0f} {2*H:.0f} {2*H:.0f}">{defs}{corps}</svg>'


JS = r'''// Pièces de Siam : généré par img/siam/gen.py, ne pas modifier à la main (changer les réglages de gen.py et relancer).
// siamPiece(g, nom, dir, cx, cy, R, camp) dessine une pièce dans l'élément SVG g : nom 'elephant' | 'rhino' | 'rocher',
// dir 'haut' | 'droite' | 'bas' | 'gauche' (ignorée pour le rocher), centre (cx, cy), R le rayon du bord (la pointe
// dépasse de R × pointe), camp facultatif ('or', 'argent', 'roche' : sinon celui de la pièce). Couleurs : variables CSS
// --siam-<camp>-hi | c1 | sh | c3 | k, valeurs par défaut sinon. En dessous de R = 16, ni ombre ni gravure (comme Arimaa).
const SIAM_ART=__DATA__;
function siamPiece(g,nom,dir,cx,cy,R,camp){
  const A=SIAM_ART,NS='http://www.w3.org/2000/svg',[,camp0,kind]=A.pieces[nom];camp=camp||camp0;
  if(!document.getElementById('siamDefs')){const v=c=>(k,o)=>`<stop offset="${o}" style="stop-color:var(--siam-${c}-${k},${A.couleurs[c][k]})"/>`;
    const C=A.C,RF=A.face,RB=RF*A.bord,[lx,ly,lr]=A.lumiere;
    document.body.insertAdjacentHTML('beforeend',`<svg id="siamDefs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>`+
      Object.keys(A.masques).map(n=>`<mask id="siamM-${n}" maskUnits="userSpaceOnUse" x="0" y="0" width="${A.T}" height="${A.T}"><rect width="${A.T}" height="${A.T}" fill="#000"/>${A.masques[n]}</mask>`).join('')+
      Object.keys(A.couleurs).map(c=>{const s=v(c);return `<radialGradient id="siamF-${c}" gradientUnits="userSpaceOnUse" cx="${C-RF+2*RF*lx}" cy="${C-RF+2*RF*ly}" r="${2*RF*lr}">${s('hi',0)}${s('c1',.5)}${s('sh',1)}</radialGradient>`+
        `<linearGradient id="siamR-${c}" gradientUnits="userSpaceOnUse" x1="${C-RB}" y1="${C-RB}" x2="${C+RB}" y2="${C+RB}">${s('hi',0)}${s('sh',.45)}${s('c3',1)}</linearGradient>`;}).join('')+'</defs></svg>');}
  const C=A.C,RF=A.face,RB=RF*A.bord,k=R/RB,big=R>=16,ang=(A.dirs[dir]||0)*Math.PI/180;
  const forme=(r,dx,dy)=>{dx=dx||0;dy=dy||0;if(kind==='rond')return `M ${C+dx-r} ${C+dy} a ${r} ${r} 0 1 0 ${2*r} 0 a ${r} ${r} 0 1 0 ${-2*r} 0 z`;
    const t=Math.acos(1/A.pointe),p=(u,q)=>`${C+dx+q*Math.cos(ang+u)} ${C+dy+q*Math.sin(ang+u)}`;
    return `M ${p(-t,r)} L ${p(0,r*A.pointe)} L ${p(t,r)} A ${r} ${r} 0 1 1 ${p(-t,r)} z`;};
  const mk=(par,t,a)=>{const e=document.createElementNS(NS,t);for(const x in a)e.setAttribute(x,a[x]);par.appendChild(e);return e;};
  const gr=mk(g,'g',{transform:`translate(${cx-C*k} ${cy-C*k}) scale(${k})`}),[ox,oy,oo]=A.ombre,[gx,gy,go]=A.gravure;
  if(big)mk(gr,'path',{d:forme(RB,RB*ox,RB*oy),fill:`rgba(0,0,0,${oo})`});
  mk(gr,'path',{d:forme(RB),fill:`url(#siamR-${camp})`});mk(gr,'path',{d:forme(RF),fill:`url(#siamF-${camp})`});
  const art=kind!=='rond'&&A.miroir.includes(dir)?mk(gr,'g',{transform:`translate(${2*C} 0) scale(-1 1)`}):gr,col=x=>`var(--siam-${camp}-${x},${A.couleurs[camp][x]})`;
  if(big)mk(art,'rect',{width:A.T,height:A.T,transform:`translate(${kind!=='rond'&&A.miroir.includes(dir)?-gx:gx} ${gy})`,mask:`url(#siamM-${nom})`,opacity:go,style:`fill:${col('hi')}`});
  mk(art,'rect',{width:A.T,height:A.T,mask:`url(#siamM-${nom})`,style:`fill:${col('k')}`});
  return gr;}
'''

APERCU = '''<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pièces de Siam</title><style>
body{margin:0;padding:16px;background:#2d4a43;color:#e3e9e6;font:14px system-ui,sans-serif}
h2{font-size:14px;font-weight:600;margin:20px 0 6px;opacity:.8}svg.p{width:100%;max-width:900px;display:block}
</style></head><body>
<h2>Taille plateau (R = 60) puis taille case (R = 23) et petite (R = 11)</h2><svg class="p" id="s" viewBox="0 0 900 520"></svg>
<script>__JS__</script><script>
const g=document.getElementById('s'),D=['haut','droite','bas','gauche'];
['elephant','rhino'].forEach((n,j)=>D.forEach((d,i)=>siamPiece(g,n,d,110+i*190,95+j*190,60)));siamPiece(g,'rocher',null,110,475,30);
['elephant','rhino'].forEach((n,j)=>D.forEach((d,i)=>siamPiece(g,n,d,300+i*65+j*265,475,23)));
[['elephant','haut'],['rhino','bas'],['rocher',null]].forEach(([n,d],i)=>siamPiece(g,n,d,830+i*0,400+i*35,11));
</script></body></html>
'''

if __name__ == '__main__':
    data = {'C': C, 'T': TAILLE, 'face': P['face'], 'bord': P['bord'], 'pointe': P['pointe'], 'ombre': P['ombre'],
            'gravure': P['gravure'], 'lumiere': P['lumiere'], 'couleurs': P['couleurs'], 'dirs': DIRS,
            'miroir': list(MIROIR), 'pieces': P['pieces'],
            'masques': {n: uniques(masque(v[0]), '-siam-' + n) for n, v in P['pieces'].items()}}
    js = JS.replace('__DATA__', json.dumps(data, ensure_ascii=False))
    open(os.path.join(ICI, 'siam-art.js'), 'w').write(js)
    for nom, (_, _, kind) in P['pieces'].items():
        for d in (DIRS if kind == 'pointe' else [None]):
            f = f'{nom}-{d}.svg' if d else f'{nom}.svg'
            open(os.path.join(ICI, f), 'w').write(piece_svg(nom, d))
    open(os.path.join(ICI, 'apercu.html'), 'w').write(APERCU.replace('__JS__', js))   # siam-art.js incrusté : s'ouvre partout
    print('siam-art.js, pièces SVG et apercu.html régénérés dans', ICI)
