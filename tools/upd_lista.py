import openpyxl,re,json,sys
src,dst,xl=sys.argv[1],sys.argv[2],sys.argv[3]
s=open(src).read()
m=re.search(r'(<script id="data" type="application/json">)(.*?)(</script>)',s,re.S)
raw=json.loads(m.group(2))
wb=openpyxl.load_workbook(xl,data_only=True,read_only=True);N={};DUP=set()
for row in wb['CONSOLIDADO'].iter_rows(min_row=4,values_only=True):
    if row[2] is not None:
        k=str(row[2]).strip()
        if k in N and N[k][16]!=row[16]: DUP.add(k)
        N[k]=row
ch=[];new=0
for r in raw:
    x=N.get(r[0])
    if not x or r[0] in DUP: continue
    c=x[16];ml=x[27]
    if isinstance(c,(int,float)) and c>0:
        c=round(c)
        if c!=r[4]: ch.append((r[0],r[15] if len(r)>15 else r[1],r[4],c))
        r[4]=c
    if isinstance(ml,(int,float)): r[5]=round(ml,4)
    if isinstance(x[7],(int,float)) and x[7]>0 and not r[3]: r[3]=round(x[7],3)
cur=set(r[0] for r in raw)
print('cambios de costo',len(ch),'refs duplicadas con costos distintos (no se tocan):',sorted(DUP & set(r[0] for r in raw)))
for t in sorted(ch,key=lambda t:-abs(t[3]-t[2])/max(t[2],1))[:15]: print(t, f"{(t[3]-t[2])/max(t[2],1):+.1%}")
print('refs nuevas en la lista que no están en el cotizador',len([k for k in N if k not in cur and isinstance(N[k][16],(int,float)) and N[k][16]>0]))
s=s[:m.start(2)]+json.dumps(raw,ensure_ascii=False,separators=(',',':')).replace('</','<\\/')+s[m.end(2):]
open(dst,'w').write(s)
json.dump(ch,open('cambios_lista.json','w'),ensure_ascii=False)
