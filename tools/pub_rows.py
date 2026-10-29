"""Precios públicos del Cotizador ST (sin costos ni márgenes).
Uso: python3 pub_rows.py <cotizador_interno.html> <inventario.json> <salida data.json>
inventario.json = documento inventario/actual ({items:{ref:[libre,buffer,bp,comp,costo_prom]}, fecha, actualizado}).
"""
import json, re, sys, html as H
src, invp, out = sys.argv[1:4]
s = open(src, encoding='utf-8').read()
raw = json.loads(re.search(r'<script id="data" type="application/json">(.*?)</script>', s, re.S).group(1))
inv = json.load(open(invp, encoding='utf-8'))
inv = inv.get('data', inv)
it = inv.get('items', {})
ROT = [(27, .12), (11, .14), (1, .16), (0, .18)]
rows = []
for r in raw:
    ref, desc, fab, peso, cost, ml, lin, st, buf, u12, f12, tipo, med, esp = r[:14]
    f12 = f12 or 0
    m = max(next(x[1] for x in ROT if f12 >= x[0]), ml or 0, .10)
    x = it.get(ref)
    bp = comp = None
    if x is not None:
        st, buf = x[0], x[1]
        bp = x[2] if len(x) > 2 else None
        comp = x[3] if len(x) > 3 else None
        cp = x[4] if len(x) > 4 else 0
        # Regla de costo: con inventario propio en BP se usa el costo promedio; si no, la última lista de precios
        if (bp or 0) > 0 and (cp or 0) > 0:
            cost = cp
    elif it:
        st = buf = 0
    if not cost or m >= 1:
        continue
    pv = round(cost / (1 - m))
    rows.append([ref, desc, fab, peso, pv, lin, st or 0, buf or 0, bp, comp, tipo, med, esp, f12])
# orden: con inventario primero, luego por rotación; la rotación no se publica (solo el orden)
rows.sort(key=lambda r: (-(1 if (r[6] > 0 or r[7] > 0) else 0), -r[13]))
rows = [r[:13] for r in rows]
meta = {'fecha': inv.get('fecha', ''), 'actualizado': inv.get('actualizado', '')}
items = json.loads(re.search(r'<script id="items" type="application/json">(.*?)</script>', s, re.S).group(1))
items = {r[0]: items[r[0]] for r in rows if r[0] in items}
json.dump({'meta': meta, 'items': items, 'rows': rows}, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(json.dumps({'ok': True, 'productos': len(rows), 'inventario': meta}))
