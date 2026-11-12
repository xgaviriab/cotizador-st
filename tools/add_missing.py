"""Agrega al cotizador las referencias de la lista de precios que no estaban (con costo > 0).
Nombre claro, tipo, medida y espesor: copia de un producto gemelo (misma descripción) o de una
'familia' (misma descripción salvo los números), sustituyendo los números. Si no hay familia,
usa la descripción de la lista."""
import re, json, sys, collections, openpyxl
src, dst, xl = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(src, encoding='utf-8').read()
m = re.search(r'(<script id="data" type="application/json">)(.*?)(</script>)', s, re.S)
raw = json.loads(m.group(2))
mi = re.search(r'(<script id="items" type="application/json">)(.*?)(</script>)', s, re.S)
items = json.loads(mi.group(2))
cur = {r[0] for r in raw}
NUM = re.compile(r'\d+(?:[.,]\d+)?(?:/\d+)?')
def norm(d): return re.sub(r'\s+', ' ', str(d or '').upper().replace('GAL ', 'GALVA ')).strip()
def key(d): return NUM.sub('#', norm(d))
def nums(d): return NUM.findall(norm(d))
twin, fam = {}, {}
for r in raw:
    twin.setdefault(norm(r[1]), r)
    if len(r) > 15 and r[15]: fam.setdefault(key(r[1]), []).append(r)
def subst(text, a, b):
    """Reemplaza en text los números de a por los de b (mismo orden)."""
    if not text or not isinstance(text, str): return text
    out = text
    pairs = [(x, y) for x, y in zip(a, b) if x != y]
    if not pairs: return text
    tmp = {}
    for i, (x, y) in enumerate(pairs):
        for variant in {x, x.replace(',', '.'), x.replace('.', ',')}:
            pat = r'(?<![\d.,/])' + re.escape(variant) + r'(?![\d/]|[.,]\d)'
            if re.search(pat, out, re.I):
                out = re.sub(pat, f'\x00{i}\x00', out, flags=re.I); tmp[i] = y if variant == x else y.replace('.', ',') if ',' in variant else y.replace(',', '.')
    for i, y in tmp.items(): out = out.replace(f'\x00{i}\x00', y)
    return out
# línea por sector de la lista (mayoría de los productos ya clasificados)
wb = openpyxl.load_workbook(xl, read_only=True, data_only=True)
L = {}
for row in wb['CONSOLIDADO'].iter_rows(min_row=4, values_only=True):
    if row[2] is not None: L[str(row[2]).strip()] = row
by = {r[0]: r for r in raw}
sec = collections.defaultdict(collections.Counter)
for k, row in L.items():
    if k in by: sec[str(row[21]).strip().upper()][by[k][6]] += 1
EXTRA = [('CORZAN', 'CPVC y agua caliente'), ('BLAZE', 'CPVC y agua caliente'), ('RIB', 'PVC sanitaria y alcantarillado'),
         ('KRALOY', 'PVC sanitaria y alcantarillado'), ('RIEGO', 'PVC presión y acueducto'), ('VALVULA', 'PVC presión y acueducto'),
         ('TRAMPA', 'PVC sanitaria y alcantarillado'), ('SANITARIA', 'PVC sanitaria y alcantarillado'), ('PRESION', 'PVC presión y acueducto'),
         ('ESTRUCTURAL', 'Tubería estructural'), ('MUEBLE', 'Tubo mueble'), ('CERRAMIENTO', 'Tubo cerramiento'), ('CONDUIT', 'Conduit acero'),
         ('CONDUCCION', 'Tubería de conducción'), ('BLUE PIPE', 'Aquatherm PP-R'), ('LAMINA', 'Láminas y cubiertas'), ('VARILLA', 'Varilla y mallas'),
         ('MALLA', 'Varilla y mallas'), ('PLATINA', 'Platinas'), ('ANGULO', 'Ángulos'), ('SOLDADURA', 'Soldadura y protección'), ('CEMENTO', 'Soldaduras PVC y pinturas')]
def linea_de(row, sib):
    if sib: return sib[6]
    sc = str(row[21]).strip().upper()
    if sec.get(sc): return sec[sc].most_common(1)[0][0]
    for w, l in EXTRA:
        if w in sc: return l
    return 'Otros productos'
stats = collections.Counter(); nuevos = []
for k, row in L.items():
    if k in cur or not isinstance(row[16], (int, float)) or row[16] <= 0 or not row[3]: continue
    d = str(row[3]).strip()
    sib, how = twin.get(norm(d)), 'gemelo'
    if sib: nombre, tipo, med, esp = (sib[15] if len(sib) > 15 else ''), sib[11], sib[12], sib[13]
    else:
        cands = fam.get(key(d))
        if cands:
            sib, how = cands[0], 'familia'; a, b = nums(sib[1]), nums(d)
            nombre, tipo, med, esp = subst(sib[15], a, b), sib[11], subst(sib[12], a, b), subst(sib[13], a, b)
            nn = lambda x: x.replace(',', '.').lstrip('0') or '0'
            okset = {nn(x) for x in b}
            if any(nn(x) not in okset for x in NUM.findall(nombre or '') + NUM.findall(str(med or '')) + NUM.findall(str(esp or ''))):
                how = 'lista'; nombre, tipo, med, esp = '', '', '', ''
        else:
            how = 'lista'; nombre, tipo, med, esp = '', '', '', ''
    peso = row[7] if isinstance(row[7], (int, float)) else 0
    ml = row[27] if isinstance(row[27], (int, float)) else 0.12
    fab = str(row[22] or '').strip()
    r = [k, d, fab, round(peso, 3), round(row[16]), round(ml, 4), linea_de(row, sib), 0, 0, 0, 0, tipo or '', med or '', esp or '', 0]
    if nombre: r.append(nombre)
    raw.append(r); nuevos.append((k, d, nombre, r[6], how)); stats[how] += 1
    if row[1] and k not in items:
        try: items[k] = int(row[1])
        except: items[k] = row[1]
s = s[:m.start(2)] + json.dumps(raw, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/') + s[m.end(2):]
mi = re.search(r'(<script id="items" type="application/json">)(.*?)(</script>)', s, re.S)
s = s[:mi.start(2)] + json.dumps(items, ensure_ascii=False, separators=(',', ':')) + s[mi.end(2):]
open(dst, 'w', encoding='utf-8').write(s)
json.dump(nuevos, open('nuevos.json', 'w'), ensure_ascii=False, indent=0)
print('agregados', len(nuevos), dict(stats), 'total productos', len(raw))
