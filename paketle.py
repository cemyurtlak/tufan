# TUFAN.html: sunucusuz, çift tıklamayla açılan tek dosyalık sürümü üretir.
# Kullanım: python paketle.py
import base64, os, re, posixpath, json
ROOT = os.path.dirname(os.path.abspath(__file__))
mods = {}
def add(key, path):
    mods[key] = path
add('three', 'lib/three.module.js')
for d in ['postprocessing', 'shaders', 'loaders', 'utils']:
    for f in sorted(os.listdir(os.path.join(ROOT, 'lib/addons', d))):
        add(f'three/addons/{d}/{f}', f'lib/addons/{d}/{f}')
for f in sorted(os.listdir(os.path.join(ROOT, 'js'))):
    if f.endswith('.js'): add(f'game/{f}', f'js/{f}')
def canon(key, spec):
    if not spec.startswith('.'): return spec
    base = posixpath.dirname(key)
    return posixpath.normpath(posixpath.join(base, spec))
imap = {}
pat = re.compile(r"""(\bfrom\s*|\bimport\s*)(['"])([^'"]+)\2""")
for key, path in mods.items():
    src = open(os.path.join(ROOT, path), encoding='utf-8').read()
    src = pat.sub(lambda m: m.group(1) + m.group(2) + canon(key, m.group(3)) + m.group(2), src)
    imap[key] = 'data:text/javascript;base64,' + base64.b64encode(src.encode('utf-8')).decode()
tex = {}
for f in os.listdir(os.path.join(ROOT, 'assets/textures')):
    mime = 'image/png' if f.endswith('.png') else 'image/jpeg'
    tex[f] = f'data:{mime};base64,' + base64.b64encode(open(os.path.join(ROOT, 'assets/textures', f), 'rb').read()).decode()
for f in os.listdir(os.path.join(ROOT, 'assets/models')):
    tex[f] = 'data:model/gltf-binary;base64,' + base64.b64encode(open(os.path.join(ROOT, 'assets/models', f), 'rb').read()).decode()
for d in ['loaders', 'utils']:
    pass
html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
css = open(os.path.join(ROOT, 'css/style.css'), encoding='utf-8').read()
html = html.replace('<link rel="stylesheet" href="css/style.css">', '<style>\n' + css + '\n</style>')
html = re.sub(r'<script type="importmap">.*?</script>', lambda m: '<script>window.__TEX=' + json.dumps(tex) + ';</script>\n<script type="importmap">' + json.dumps({'imports': imap}) + '</script>', html, flags=re.S)
html = html.replace('<script type="module" src="js/main.js"></script>', '<script type="module">import "game/main.js";</script>')
open(os.path.join(ROOT, 'TUFAN.html'), 'w', encoding='utf-8').write(html)
print('TUFAN.html', round(len(html) / 1e6, 1), 'MB')
