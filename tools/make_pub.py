import re, sys
s = open('cotizador.html', encoding='utf-8').read()
js = open('pub_main.js', encoding='utf-8').read()
def rep(a, b, cnt=1):
    global s
    assert s.count(a) >= 1, a[:80]
    s = s.replace(a, b, cnt)
# título
s = re.sub(r'<title>.*?</title>', '<title>Cotizador ST</title>', s, count=1, flags=re.S)
# pestañas: solo Cotizar
s = re.sub(r'<nav class="tabs".*?</nav>', '', s, count=1, flags=re.S)
s = re.sub(r'<div class="banner" id="dbBanner".*?</div>', '', s, count=1, flags=re.S)
rep('<span class="st-chip strong" id="stMonth" hidden></span>', '')
# margen -> descuento
s = re.sub(r'<label style="display:flex;gap:8px;align-items:center;font-size:12px;color:var\(--muted\);font-weight:700">Margen a todo %.*?<button class="btn sm" id="btnSug">Usar sugerido</button>',
           '<label style="display:flex;gap:8px;align-items:center;font-size:12px;color:var(--muted);font-weight:700">Descuento a todo %<input type="number" id="mAll" min="0" max="2" step="0.5" style="width:76px"></label>', s, count=1, flags=re.S)
rep('<th>Sugerido</th><th class="n">Margen %</th>', '<th class="n">Desc. %</th>')
s = re.sub(r'<label class="f">Nota interna.*?</label>', '', s, count=1, flags=re.S)
rep('· salen en el PDF y en el correo', '· salen en el PDF')
rep('<button class="btn" id="btnSave">Guardar borrador</button>', '<a class="btn" id="btnWa" href="#" target="_blank" rel="noopener">Enviar por WhatsApp</a>')
rep('<button class="btn primary" id="btnGen">Generar cotización</button>', '<button class="btn primary" id="btnGen">Descargar PDF</button>')
s = re.sub(r'<div class="pb sendbox" id="sendBox" hidden>.*?<div id="sendStatus"[^>]*></div>\s*</div>',
           '<div id="sendStatus" style="margin:0 20px 16px;font-size:13px;display:grid;gap:4px"></div>', s, count=1, flags=re.S)
# vistas de historial y resultados
s = re.sub(r'<!-- =+ COTIZACIONES =+ -->.*?</section>\s*(?:<!--.*?-->\s*)?<section class="view" id="v-res" hidden>.*?</section>', '', s, count=1, flags=re.S)
# logos e imágenes en brand.js; precios en data.json
m = re.search(r'<script>const BRAND=(.*?)</script>', s, re.S)
import os; os.makedirs('site', exist_ok=True)
open('site/brand.js', 'w', encoding='utf-8').write('const BRAND=' + m.group(1).rstrip().rstrip(';') + ';\n')
s = s[:m.start()] + '<script src="brand.js"></script>' + s[m.end():]
s = re.sub(r'<script>const LOGO=.*?</script>', '', s, count=1, flags=re.S)
s = re.sub(r'<script id="items" type="application/json">.*?</script>', '', s, count=1, flags=re.S)
s = re.sub(r'<script id="clientes" type="application/json">.*?</script>\n?', '', s, count=1, flags=re.S)  # directorio de clientes: solo interno
s = re.sub(r'<script id="data" type="application/json">.*?</script>', '', s, count=1, flags=re.S)
s = s.replace('</style>', '.btn.off{opacity:.45;pointer-events:none}\n</style>', 1)
i = s.index('<script>\n/* ---------- datos'); j = s.index('</script>', i)
s = s[:i] + '<script>\n' + js + s[j:]
for bad in ['ipanemafarms', 'Costo', 'costo prom', 'costo de', 'margen', 'Margen', 'Nota interna', 'v-lista', 'v-res', 'sendBox', 'btnSave']:
    assert bad not in s, ('queda', bad, s[max(0, s.find(bad)-100):s.find(bad)+60])
open('site/index.html', 'w', encoding='utf-8').write(s)
print(len(s))
