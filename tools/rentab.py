"""Arma la base de rentabilidad para los asesores y la sube al Blob privado (nunca al repositorio).
Uso: python3 tools/rentab.py <HTML del cotizador interno> <inv_doc.json> <PANEL_KEY>
Cada referencia: [costo de la última lista, costo promedio del inventario BP]."""
import json, re, sys, urllib.request
html, invf, key = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(html, encoding='utf-8').read()
raw = json.loads(re.search(r'<script id="data" type="application/json">(.*?)</script>', s, re.S).group(1))
inv = json.load(open(invf, encoding='utf-8'))
items = inv.get('items', {})
lista = (re.search(r'Lista de precios · ([^<]+)', s) or [None, ''])[1]
c = {}
for r in raw:
    x = items.get(r[0]) or []
    prom = x[4] if len(x) > 4 else 0
    if (r[4] or 0) > 0 or prom > 0: c[r[0]] = [round(r[4] or 0), round(prom or 0)]
body = json.dumps({'lista': lista, 'inventario': inv.get('fecha'), 'c': c}, separators=(',', ':')).encode()
req = urllib.request.Request('https://cotizador-st-ten.vercel.app/api/rentab?k=' + key, data=body, method='POST', headers={'Content-Type': 'application/json'})
print(urllib.request.urlopen(req, timeout=60).read().decode())
