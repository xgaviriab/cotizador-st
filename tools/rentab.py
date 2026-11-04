"""Arma la base de rentabilidad de los asesores y la guarda CIFRADA en rentab.enc (AES-GCM, clave = la del enlace de asesor).
Sin la clave el archivo no sirve; los costos nunca quedan legibles en el repositorio.
Uso: python3 tools/rentab.py <HTML del cotizador interno> <inv_doc.json> <CLAVE_ASESOR> [salida=rentab.enc]
Cada referencia: [costo de la última lista, costo promedio del inventario BP]."""
import json, re, sys, os, base64, subprocess
try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
except ImportError:
    subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', '--break-system-packages', 'cryptography'], check=True)
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
html, invf, clave = sys.argv[1], sys.argv[2], sys.argv[3]
out = sys.argv[4] if len(sys.argv) > 4 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'rentab.enc')
s = open(html, encoding='utf-8').read()
raw = json.loads(re.search(r'<script id="data" type="application/json">(.*?)</script>', s, re.S).group(1))
inv = json.load(open(invf, encoding='utf-8'))
items = inv.get('items', {})
m = re.search(r'Lista de precios · ([^<]+)', s)
c = {}
for r in raw:
    x = items.get(r[0]) or []
    prom = x[4] if len(x) > 4 else 0
    if (r[4] or 0) > 0 or prom > 0: c[r[0]] = [round(r[4] or 0), round(prom or 0)]
assert len(c) > 500, 'muy pocas referencias'
plano = json.dumps({'lista': m.group(1) if m else '', 'inventario': inv.get('fecha'), 'c': c}, separators=(',', ':')).encode()
salt, iv = os.urandom(16), os.urandom(12)
k = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=150000).derive(clave.encode())
ct = AESGCM(k).encrypt(iv, plano, None)
b = lambda v: base64.b64encode(v).decode()
json.dump({'v': 1, 's': b(salt), 'iv': b(iv), 'ct': b(ct)}, open(out, 'w'))
print(json.dumps({'ok': True, 'referencias': len(c), 'archivo': os.path.abspath(out)}))
