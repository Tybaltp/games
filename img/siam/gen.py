# Pièces de Siam, rendu des pièces d'Arimaa (arimaa.html, pieceArt) : ombre douce, bord biseauté, face éclairée
# d'en haut à gauche, dessin gravé (copie claire décalée sous l'encre). La pièce a la forme d'un arc et de deux
# tangentes en pointe ; le dessin d'origine (animal dans son cercle entier) y est gravé.
# usage : python3 gen.py <dossier de sortie>
import re, math, os, sys
SRC='/Users/thibaultpillon/Library/CloudStorage/Dropbox/Projets/Jeux/SVG Siam'
OUT=sys.argv[1]; os.makedirs(OUT,exist_ok=True)
C=2179.0      # centre du dessin d'origine (anneau de 1550 à 1650)
RF=1790.0     # rayon de la face
RB=RF*23/20.8 # rayon du bord (même proportion qu'Arimaa)
K=1.2         # distance de la pointe / rayon : 1.41 = angle droit, plus petit = moins pointu
COL={'or':dict(hi='#f8e4a4',c1='#d9ab3a',sh='#a67a1e',c3='#6b4b10',k='#3a2908'),
     'argent':dict(hi='#fbfdfe',c1='#b7c1c9',sh='#7f8b94',c3='#3d474f',k='#1b2228')}
def load(f):
    s=open(os.path.join(SRC,f)).read()
    s=re.sub(r'<metadata>.*?</metadata>','',s,flags=re.S)
    return re.findall(r'<path[^>]*fill="rgb\((\d+),\d+,\d+\)"[^>]*d="([^"]+)"',s)[1:]  # sans le fond
animals={'elephant':(load('elephant2.svg'),'or'),'rhino':(load('image.svg'),'argent')}
def forme(r,a,dx=0,dy=0):
    t=math.acos(1/K); p=lambda u,q:f'{C+dx+q*math.cos(a+u):.1f} {C+dy+q*math.sin(a+u):.1f}'
    return f'M {p(-t,r)} L {p(0,r*K)} L {p(t,r)} A {r} {r} 0 1 1 {p(-t,r)} z'
H=RB*K+140
def piece(name,ps,m,d,uid):
    a=math.radians({'droite':0,'bas':90,'gauche':180,'haut':270}[d]); c=COL[m]
    # masque : blanc là où l'encre se pose (les noirs du dessin d'origine)
    body=''.join(f'<path fill="{"#000" if f=="255" else "#fff"}" d="{p}"/>' for f,p in ps)
    if d in('gauche','bas'): body=f'<g transform="translate({2*C},0) scale(-1,1)">{body}</g>'
    st=lambda o,v:f'<stop offset="{o}" stop-color="{c[v]}"/>'
    defs=(f'<defs><mask id="m{uid}" maskUnits="userSpaceOnUse" x="0" y="0" width="4358" height="4358"><rect width="4358" height="4358" fill="#000"/>{body}</mask>'
      f'<radialGradient id="f{uid}" gradientUnits="userSpaceOnUse" cx="{C-.24*RF:.0f}" cy="{C-.36*RF:.0f}" r="{1.56*RF:.0f}">{st(0,"hi")}{st(.5,"c1")}{st(1,"sh")}</radialGradient>'
      f'<linearGradient id="r{uid}" gradientUnits="userSpaceOnUse" x1="{C-RB:.0f}" y1="{C-RB:.0f}" x2="{C+RB:.0f}" y2="{C+RB:.0f}">{st(0,"hi")}{st(.45,"sh")}{st(1,"c3")}</linearGradient></defs>')
    ink=lambda fill,dx,dy,op:f'<rect transform="translate({dx} {dy})" width="4358" height="4358" fill="{fill}" opacity="{op}" mask="url(#m{uid})"/>'
    return (defs+f'<path fill="rgba(0,0,0,.28)" d="{forme(RB,a,RB*.6/23,RB*1.4/23)}"/>'
      f'<path fill="url(#r{uid})" d="{forme(RB,a)}"/><path fill="url(#f{uid})" d="{forme(RF,a)}"/>'
      +ink(c['hi'],52,70,.85)+ink(c['k'],0,0,1))
cells=[]
for j,(name,(ps,m)) in enumerate(animals.items()):
    for i,d in enumerate(['haut','droite','bas','gauche']):
        open(os.path.join(OUT,f'{name}-{d}.svg'),'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{C-H:.0f} {C-H:.0f} {2*H:.0f} {2*H:.0f}">{piece(name,ps,m,d,"")}</svg>')
        cells.append(f'<g transform="translate({i*2*H-(C-H):.0f},{j*2*H-(C-H):.0f})">{piece(name,ps,m,d,f"{j}{i}")}</g>')
# ---- Rochers : pièce ronde (pas de direction), tons marron, un bloc dessiné à la main dans le même anneau
COL['roche']=dict(hi='#f1dcbb',c1='#b98b5e',sh='#86592f',c3='#4a2e14',k='#2c1a0b')
ROCS={'bloc':('600,2750 900,2300 1150,2150 1400,1500 1750,1150 2150,1000 2550,1150 2850,1600 3150,1850 3450,2350 3750,2800 3750,3900 600,3900',
              ['1750,1150 1900,1900 1600,2600','2550,1150 2400,1800 2700,2500 2500,3200','2850,1600 2400,1800','1150,2150 1500,2500 1300,3100','3150,1850 3000,2500']),
      'montagne':('650,2900 1100,2250 1300,2350 1900,950 2250,1500 2450,1350 3000,2200 3250,2100 3750,2900 3750,3900 650,3900',
              ['1900,950 2000,1700 1750,2200 1950,2900','2450,1350 2600,2000 2450,2500','1100,2250 1350,2800','3000,2200 2900,2800']),
      'mixte':('600,2850 850,2400 1150,2250 1350,1650 1800,1000 2200,1250 2450,1150 2900,1500 3100,1950 3400,2200 3750,2850 3750,3900 600,3900',
              ['1800,1000 1950,1700 1700,2300 1900,3000','2450,1150 2550,1850 2900,2400 2750,3100','2550,1850 2900,1500','1150,2250 1450,2700 1300,3200','3100,1950 3050,2600'])}
def rocher(nom,uid):
    poly,traits=ROCS[nom]; c=COL['roche']
    body=(f'<clipPath id="c{uid}"><circle cx="{C}" cy="{C}" r="1560"/></clipPath><circle cx="{C}" cy="{C}" r="1600" fill="none" stroke="#fff" stroke-width="100"/>'
      f'<g clip-path="url(#c{uid})"><polygon points="{poly}" fill="#fff" stroke="#fff" stroke-width="90" stroke-linejoin="round"/>'
      +''.join(f'<polyline points="{t}" fill="none" stroke="#000" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>' for t in traits)+'</g>')
    st=lambda o,v:f'<stop offset="{o}" stop-color="{c[v]}"/>'
    defs=(f'<defs><mask id="m{uid}" maskUnits="userSpaceOnUse" x="0" y="0" width="4358" height="4358"><rect width="4358" height="4358" fill="#000"/>{body}</mask>'
      f'<radialGradient id="f{uid}" gradientUnits="userSpaceOnUse" cx="{C-.24*RF:.0f}" cy="{C-.36*RF:.0f}" r="{1.56*RF:.0f}">{st(0,"hi")}{st(.5,"c1")}{st(1,"sh")}</radialGradient>'
      f'<linearGradient id="r{uid}" gradientUnits="userSpaceOnUse" x1="{C-RB:.0f}" y1="{C-RB:.0f}" x2="{C+RB:.0f}" y2="{C+RB:.0f}">{st(0,"hi")}{st(.45,"sh")}{st(1,"c3")}</linearGradient></defs>')
    ink=lambda fill,dx,dy,op:f'<rect transform="translate({dx} {dy})" width="4358" height="4358" fill="{fill}" opacity="{op}" mask="url(#m{uid})"/>'
    return (defs+f'<circle cx="{C+RB*.6/23:.0f}" cy="{C+RB*1.4/23:.0f}" r="{RB:.0f}" fill="rgba(0,0,0,.28)"/>'
      f'<circle cx="{C}" cy="{C}" r="{RB:.0f}" fill="url(#r{uid})"/><circle cx="{C}" cy="{C}" r="{RF}" fill="url(#f{uid})"/>'
      +ink(c['hi'],52,70,.85)+ink(c['k'],0,0,1))
for i,nom in enumerate(ROCS):
    open(os.path.join(OUT,f'rocher-{nom}.svg'),'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{C-H:.0f} {C-H:.0f} {2*H:.0f} {2*H:.0f}">{rocher(nom,"")}</svg>')
    cells.append(f'<g transform="translate({(i+.5)*2*H-(C-H):.0f},{4*H-(C-H):.0f})">{rocher(nom,"k%d"%i)}</g>')
open(os.path.join(OUT,'apercu.svg'),'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {8*H:.0f} {6*H:.0f}"><rect width="100%" height="100%" fill="#2d4a43"/>{"".join(cells)}</svg>')
