async function boot(){let D;try{const r=await fetch('data.json',{cache:'no-cache'});D=await r.json()}catch(e){document.getElementById('results').innerHTML='<div class="empty">No se pudo cargar la lista de precios. Recarga la página.</div>';return}
  /* rentabilidad: solo con el enlace de asesor (?a=clave); la clave queda guardada en este equipo */
  let ak=null;try{const u=new URLSearchParams(location.search).get('a');if(u){localStorage.setItem('st_ak',u);history.replaceState(null,'',location.pathname)}ak=localStorage.getItem('st_ak')}catch(e){}
  if(ak){try{const r=await fetch('/api/rentab?a='+encodeURIComponent(ak),{cache:'no-store'});if(r.ok)D.rent=await r.json();else if(r.status===401){try{localStorage.removeItem('st_ak')}catch(e){}}}catch(e){}}
  main(D)}
function main(D){
/* ---------- datos ---------- */
// D.rows: [ref,nombre claro,fabricante,peso,precio contado antes de IVA,linea,propio libre,buffer,BP,comprometido,tipo,medida,espesor,descripción lista]
const RAW=D.rows;
/* Descuento máximo que puede dar el asesor sobre el precio de lista (ajustable aquí) */
const DESC_MAX=0.02;
const P=RAW.map((r,i)=>({ref:r[0],desc:r[1],d0:r[13]||r[1],fab:r[2],peso:r[3],pv:r[4],lin:r[5],st:r[6]||0,buf:r[7]||0,bp:r[8],comp:r[9],tipo:r[10],med:r[11],esp:r[12],o:i}));
const price=(p,d,plazo)=>Math.round(p.pv*(1-(d||0))/Math.pow(0.98,plazo));
const BY=new Map(P.map(p=>[p.ref,p]));
/* rentabilidad (asesores autorizados): base = inventario BP si hay existencia propia, si no la última lista */
const RT=D.rent&&D.rent.c?D.rent.c:null;const RMIN=0.10;
const rbase=p=>{if(!RT)return null;const x=RT[p.ref];if(!x)return null;const inv=(D.inv||{})[p.ref];const bp=p.bp||0;const v=(bp>0&&x[1]>0)?x[1]:x[0];return v>0?{v,src:(bp>0&&x[1]>0)?'inventario BP':'última lista'}:null};
// longitud del tramo (6 m, 12 m…) para comparar precios por metro
P.forEach(p=>{const d=p.d0.toUpperCase().replace(/(?:CAL|ESP)\.?\s*\(?\s*[\d.,]+\s*MM?/g,' ');let L=null;const num=s=>parseFloat(s.replace(',','.'));
  const mm=d.match(/[*X]\s*(6000|12000|9000|3000)\b/);if(mm)L=+mm[1]/1000;
  if(!L){const c=[...d.matchAll(/(?:X|\s)\s*(\d+(?:[.,]\d+)?)\s*(?:MTRS|MTS|MT|M(?!M))\.?(?![A-Z]{2})/g)].map(x=>num(x[1])).filter(v=>v>=1&&v<=15);if(c.length)L=c[c.length-1]}
  if(!L){const e=d.match(/X\s*(\d+(?:[.,]\d+)?)\s*[A-Z]{0,4}\s*$/);if(e){const v=num(e[1]);if(v>=1&&v<=15)L=v}}
  if(L&&L>=1&&L<=15&&/TUBO|ESTRUCT|PERFIL|ANGULO|PLATINA|CANAL|VIGA|VARILLA|CORREA|CERRAMIENTO|MUEBLE|CONDUIT|IMC|EMT/.test(d)){p.len=L;p.lenL=(Math.round(L*100)/100).toLocaleString('es-CO')+' m'}else{p.len=0;p.lenL=''}});
// peso faltante: se toma el de otro producto de la misma medida y espesor (p. ej. versión negra del mismo tubo)
P.forEach(p=>{if(!p.med){const m=p.d0.toUpperCase().match(/\b(\d+(?:[.,]\d+)?)\s*[X*]\s*(\d+(?:[.,]\d+)?)\s*(?:CAL|MM|X6|$)/);if(m&&/TUBO|ESTRUCT|PERFIL/.test(p.d0.toUpperCase()))p.med=m[1]+'X'+m[2]}});
{const W=new Map();P.forEach(p=>{if(p.peso>0&&p.med&&p.esp){const k=p.med+'|'+p.esp+'|'+(p.lin||'');if(!W.has(k))W.set(k,p.peso)}});P.forEach(p=>{if(!(p.peso>0)&&p.med&&p.esp){const w=W.get(p.med+'|'+p.esp+'|'+(p.lin||''));if(w){p.peso=w;p.pesoEst=true}}})}
const pct=m=>(Math.round(m*1000)/10).toLocaleString('es-CO')+'%';
const norm=s=>String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase();
const _IT=D.items||{};
const itm=p=>{const v=_IT[p.ref];return v==null||String(v).trim()===''?p.ref:String(v)};
P.forEach(p=>p.k=norm(itm(p)+' '+p.ref+' '+p.desc+' '+p.d0+' '+p.fab+' '+p.lin));
const LINE_ORDER=['Tubería estructural','Tubo cerramiento','Tubo mueble','Perfiles C y vigas','Ángulos','Platinas','Láminas y cubiertas','Varilla y mallas','Accesorios de acero','Conduit acero','Tubería de conducción','Conduit PVC','PVC presión y acueducto','PVC sanitaria y alcantarillado','CPVC y agua caliente','Aquatherm PP-R','PVC y CPVC (otros)','Soldaduras PVC y pinturas','Soldadura y protección','Otros'];
const PLAZOS=['Contado','15 días','30 días','45 días','60 días'];
/* Listas de precios por producto: contado a 60 días (2% por cada 15 días) y 'Ajustado', con descuento limitado sobre el precio de contado */
const LISTAS=[...PLAZOS,'Ajustado'];
/* Plazo de pago de la factura (recaudo de cartera); incluye crédito a 90 y 120 días */
const PAGOS=[...PLAZOS,'90 días','120 días'];const AJ=5;const lpPlazo=lp=>lp===AJ?0:lp;
const IVA=0.19;
const $=id=>document.getElementById(id);
const cop=n=>'$ '+Math.round(n||0).toLocaleString('es-CO');
const copM=n=>{n=n||0;if(Math.abs(n)>=1e9)return '$ '+(n/1e9).toLocaleString('es-CO',{maximumFractionDigits:2})+' mil M';if(Math.abs(n)>=1e6)return '$ '+(n/1e6).toLocaleString('es-CO',{maximumFractionDigits:1})+' M';return cop(n)};
const kg=n=>n.toLocaleString('es-CO',{maximumFractionDigits:1})+' kg';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const LS={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
let tt;function toast(m){$('toast').textContent=m;$('toast').hidden=false;clearTimeout(tt);tt=setTimeout(()=>$('toast').hidden=true,2000)}
// orden natural de medidas: 1/2" < 3/4" < 1" < 1 1/4" ; 40X40 < 50X30 < 100X50
function num(s){s=String(s).replace(',','.');let m=s.match(/(\d+)\s+(\d+)\/(\d+)/);if(m)return +m[1]+m[2]/m[3];m=s.match(/(\d+)\/(\d+)/);if(m)return m[1]/m[2];m=s.match(/\d*\.?\d+/);return m?parseFloat(m[0]):9e9}
function natKey(s){const parts=String(s).split(/X/i);return [num(parts[0]),parts[1]?num(parts[1]):0,String(s)]}
/* espesor en mm para ordenar del calibre más delgado al más grueso */
/* valor por kilo solo para acero que se vende por peso */
const KG_LINES=new Set(['Tubería estructural','Tubo mueble','Tubo cerramiento','Perfiles C y vigas','Ángulos','Platinas','Láminas y cubiertas','Varilla y mallas','Conduit acero','Tubería de conducción']);
const perKg=p=>p.peso>=1&&KG_LINES.has(p.lin)&&!/PVC|KRALOY|DUCTO/.test(p.d0.toUpperCase());
function thick(p){if(p._t!=null)return p._t;let t=9e9;const e=String(p.esp||''),d=p.d0.toUpperCase();let m;
  if((m=e.match(/(\d+(?:\.\d+)?)\s*mm/i)))t=+m[1];
  else if((m=e.match(/\.(\d+)"/)))t=+('0.'+m[1])*25.4;
  else if((m=e.match(/(\d+)\/(\d+)"?/)))t=m[1]/m[2]*25.4;
  else if((m=e.match(/(?:RDE|SDR|DR)\s*(\d+(?:\.\d+)?)/)))t=100/m[1];
  else if((m=e.match(/SCH\s*(\d+)/)))t=m[1]/10;
  else if((m=d.match(/CAL\.?\s*\(?\s*(\d*\.?\d+)/))){const v=parseFloat(m[1]);t=v<1?v*25.4:v}
  else if((m=d.match(/(\d+(?:[.,]\d+)?)\s*MM\b/)))t=parseFloat(m[1].replace(',','.'));
  return p._t=t}
function natCmp(a,b){const x=natKey(a),y=natKey(b);return x[0]-y[0]||x[1]-y[1]||x[2].localeCompare(y[2])}

/* ---------- filtros en cascada ---------- */
const F=LS.get('stp_f',{lin:'',tipo:'',med:'',esp:''});
$('fStock').checked=LS.get('st_fstock',false);
function base(){const so=$('fStock').checked;return P.filter(p=>!so||p.st>0||p.buf>0)}
function facet(arr,key){const m=new Map();arr.forEach(p=>{const v=p[key];if(v)m.set(v,(m.get(v)||0)+1)});return m}
let shown=[];
function renderCatalog(){
  LS.set('stp_f',F);LS.set('st_fstock',$('fStock').checked);
  const toks=norm($('q').value).split(/\s+/).filter(Boolean);
  let A=base();
  const steps=[];
  const crumbs=[];
  if(!F.lin){
    const m=facet(A,'lin');
    steps.push(`<div class="step"><div class="lab"><span class="n">1</span>Línea de producto</div><div class="lgrid">${LINE_ORDER.filter(l=>m.get(l)).map(l=>`<button data-set="lin" data-v="${esc(l)}">${esc(l)}<small>${m.get(l)} productos</small></button>`).join('')}</div></div>`);
  }else{
    crumbs.push(['lin',F.lin]);A=A.filter(p=>p.lin===F.lin);
    const sub=[['tipo','Tipo'],['med','Medida / diámetro'],['esp','Espesor / calibre'],['lenL','Longitud']];
    let n=2;
    for(const [k,lab] of sub){
      const m=facet(A,k);const miss=A.filter(p=>!p[k]).length;
      if(F[k]==='*'){crumbs.push([k,'Todos']);continue}
      if(F[k]==='~'&&miss){crumbs.push([k,'Otros']);A=A.filter(p=>!p[k]);continue}
      if(F[k]&&m.has(F[k])){crumbs.push([k,F[k]]);A=A.filter(p=>p[k]===F[k]);continue}
      F[k]='';
      if(m.size>1||(m.size===1&&k!=='tipo'&&k!=='lenL')){
        const vals=[...m.keys()].sort(k==='tipo'?(a,b)=>m.get(b)-m.get(a):natCmp);
        steps.push(`<div class="step"><div class="lab"><span class="n">${crumbs.length+1}</span>${lab}</div><div class="chips ${k==='tipo'?'txt':''}">${vals.map(v=>`<button data-set="${k}" data-v="${esc(v)}" aria-pressed="false">${esc(v)}<small>${m.get(v)}</small></button>`).join('')}${miss?`<button data-set="${k}" data-v="~" aria-pressed="false" title="Productos sin este dato">Otros<small>${miss}</small></button>`:''}<button data-set="${k}" data-v="*" aria-pressed="false" title="Ver todos sin filtrar por este paso">Ver todos<small>${A.length}</small></button></div></div>`);
        break; // un paso a la vez
      }
      n++;
    }
  }
  $('steps').innerHTML=steps.join('');
  $('crumbStep').hidden=!crumbs.length;
  $('crumbs').innerHTML=crumbs.map(([k,v])=>`<button class="crumb" data-clear="${k}" title="Quitar">${esc(v)} <span>✕</span></button>`).join('')+(crumbs.length?'<button class="btn ghost sm" data-clear="all">Empezar de nuevo</button>':'');
  if(toks.length)A=base().filter(p=>toks.every(t=>p.k.includes(t)));
  const showRes=toks.length||(F.lin&&(F.med||A.length<=30||!steps.length));
  A=A.slice().sort((a,b)=>{const ma=a.med||'~',mb=b.med||'~';const c=(ma==='~'||mb==='~')?(ma===mb?0:ma==='~'?1:-1):natCmp(ma,mb);return c||thick(a)-thick(b)||((b.len||0)-(a.len||0))||(a.o-b.o)});
  shown=showRes?A.slice(0,120):[];
  const pl=lpPlazo(S.lista);
  $('results').innerHTML=shown.map((p,i)=>`<div class="res">
    <div><div class="d">${esc(p.desc)}</div><div class="s"><span>${esc(p.fab)}</span><span class="ref">Ítem ${esc(itm(p))}</span>${p.len?`<span class="chip info">${p.lenL}</span>`:''}${p.peso?`<span>${kg(p.peso)}</span>`:''}${stockChip(p)}</div></div>
    <div><div class="p">${cop(price(p,0,pl))}</div>${(p.len||perKg(p))?`<div style="text-align:right;font-size:11.5px;color:var(--fg)">${[p.len?cop(price(p,0,pl)/p.len)+' / m':'',perKg(p)?cop(price(p,0,pl)/p.peso)+' / kg':''].filter(Boolean).join(' · ')}</div>`:''}
    <div class="addbox"><input type="number" min="1" value="1" id="aq${i}" aria-label="Cantidad"><button class="btn primary sm" data-add="${i}">Agregar</button></div></div></div>`).join('');
  $('resInfo').textContent=showRes?(A.length?`${A.length} producto${A.length==1?'':'s'}${A.length>shown.length?' · mostrando '+shown.length:''} · lista ${LISTAS[S.lista].toLowerCase()}`:'Sin resultados. Quita un filtro o usa menos palabras.'):(F.lin?'Elige una medida para ver los productos.':'Toca una línea para empezar, o busca por texto.');
}
function stockChip(p){const n=v=>Math.round(v||0).toLocaleString('es-CO');const disp=(p.st||0)+(p.buf||0);const a=[];
  a.push(disp>0?`<span class="chip ok" title="Propio libre + buffer">Disponible ${n(disp)}</span>`:'<span class="chip mute">0 disponibles</span>');
  if(p.bp!=null){if(p.bp>0||p.comp>0)a.push(`<span class="chip neu" title="Bodega propia (BP)">Propio BP ${n(p.bp)}</span>`);
    if(p.comp>0)a.push(`<span class="chip warn" title="Cantidad comprometida en pedidos">Comprometido ${n(p.comp)}</span>`);}
  if(p.buf>0)a.push(`<span class="chip info" title="Buffer de fábrica (BB)">Buffer BB ${n(p.buf)}</span>`);
  return a.join(' ')}
$('steps').addEventListener('click',e=>{const b=e.target.closest('[data-set]');if(!b)return;F[b.dataset.set]=b.dataset.v;if(b.dataset.set==='lin'){F.tipo=F.med=F.esp=F.lenL=''}$('q').value='';renderCatalog()});
$('crumbs').addEventListener('click',e=>{const b=e.target.closest('[data-clear]');if(!b)return;const k=b.dataset.clear;const order=['lin','tipo','med','esp','lenL'];if(k==='all')order.forEach(x=>F[x]='');else order.slice(order.indexOf(k)).forEach(x=>F[x]='');renderCatalog()});
$('q').addEventListener('input',renderCatalog);$('fStock').addEventListener('change',renderCatalog);
$('results').addEventListener('click',e=>{const b=e.target.closest('[data-add]');if(!b)return;const i=+b.dataset.add;addLine(shown[i].ref,Math.max(1,+$('aq'+i).value||1))});
$('results').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id&&e.target.id.startsWith('aq')){const i=+e.target.id.slice(2);addLine(shown[i].ref,Math.max(1,+e.target.value||1))}});

/* ---------- cotización ---------- */
const CF=['cName','cNit','cContact','cPhone','cEmail','cCity'],AF=['aName','aPhone','aEmail','vig'];
function newNum(){const d=new Date(),z=n=>String(n).padStart(2,'0');return 'COT-'+String(d.getFullYear()).slice(2)+z(d.getMonth()+1)+z(d.getDate())+'-'+z(d.getHours())+z(d.getMinutes())+'-'+Math.random().toString(36).slice(2,5).toUpperCase()}
function blank(){return {num:newNum(),pago:0,lista:0,lines:[],client:{},origen:'asesor',savedId:null}}
function fixS(x){if(x.pago==null)x.pago=x.plazo||0;if(x.lista==null)x.lista=x.plazo||0;delete x.plazo;(x.lines||[]).forEach(l=>{if(l.lp==null)l.lp=x.lista});return x}
let S=fixS(LS.get('stp_cot',null)||blank());S.lines=(S.lines||[]).filter(l=>BY.has(l.ref));
CF.forEach(f=>{$(f).value=(S.client||{})[f]||''});
$('obs').value=S.obs||'';
['obs'].forEach(f=>$(f).addEventListener('input',()=>{S[f]=$(f).value;S.dirty=true;saveDraft()}));
$('stCount').textContent=P.length.toLocaleString('es-CO')+' productos';
const adv=LS.get('stp_adv',{});AF.forEach(f=>{if(adv[f]!=null)$(f).value=adv[f]});
function saveDraft(){S.client={};CF.forEach(f=>S.client[f]=$(f).value);LS.set('stp_cot',S);const a={};AF.forEach(f=>a[f]=$(f).value);LS.set('stp_adv',a);sums()}
function sums(){$('clientSum').textContent=[$('cName').value,$('cNit').value].filter(Boolean).join(' · ');$('advSum').textContent=[$('aName').value,'Vigencia '+$('vig').value].filter(Boolean).join(' · ')}
[...CF,...AF].forEach(f=>$(f).addEventListener('input',()=>{S.dirty=true;saveDraft()}));
function addLine(ref,qty=1){const ex=S.lines.find(l=>l.ref===ref);if(ex)ex.qty+=qty;else{const mv=marginAllVal();S.lines.push({ref,qty,lp:mv!=null?AJ:S.lista,d:mv??0})}S.dirty=true;render();toast('Agregado: '+BY.get(ref).desc)}
$('plazo').innerHTML=LISTAS.map((p,i)=>`<button data-i="${i}" title="${i===AJ?'Precio de contado con el descuento que digites (máximo '+DESC_MAX*100+'%)':'Aplica esta lista a todos los productos'}">${p}</button>`).join('');
$('pago').innerHTML=PAGOS.map((p,i)=>`<button data-i="${i}">${p}</button>`).join('');
$('pago').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;S.pago=+b.dataset.i;S.dirty=true;render()});
$('plazo').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;S.lista=+b.dataset.i;S.lines.forEach(l=>l.lp=S.lista);S.dirty=true;render();renderCatalog()});
function marginAllVal(){const v=$('mAll').value;return v===''?null:Math.min(DESC_MAX,Math.max(0,+v/100))}
$('mAll').addEventListener('change',()=>{const v=marginAllVal();if(v==null)return;$('mAll').value=Math.round(v*1000)/10;S.lista=AJ;S.lines.forEach(l=>{l.d=v;l.lp=AJ});S.dirty=true;render();renderCatalog()});
function calc(st=S){
  let base=0,peso=0;const under=[];
  const rows=st.lines.map(l=>{const p=BY.get(l.ref);if(!p)return null;
    const lp=l.lp==null?st.lista:l.lp;const pf=RT&&l.pf>0?Math.round(l.pf):0;const d=pf?0:(lp===AJ?Math.min(DESC_MAX,Math.max(0,l.d||0)):0);const net=pf?pf:price(p,d,lpPlazo(lp));const rb=rbase(p);const rm=rb&&net>0?1-rb.v/net:null;
    base+=net*l.qty;peso+=(p.peso||0)*l.qty;
    const avail=(p.st||0)+(p.buf||0);const short=l.qty>avail;
    return {l,p,d,lp,pf,rb,rm,low:rm!=null&&rm<RMIN-1e-9,net,tot:net*l.qty,ok:true,short,avail}}).filter(Boolean);
  const iva=Math.round(base*IVA);return {rows,sub:base,dsc:0,base,iva,total:base+iva,peso,under};
}
function render(){
  [...$('plazo').children].forEach((b,i)=>b.setAttribute('aria-pressed',i===S.lista));[...$('pago').children].forEach((b,i)=>b.setAttribute('aria-pressed',i===S.pago));
  $('qNum').textContent=S.num;
  $('qState').hidden=true;
  const C=calc();
  $('emptyLines').hidden=S.lines.length>0;
  $('lines').innerHTML=C.rows.map((r,i)=>`<tr class="${r.ok?'':'under'}">
    <td style="min-width:260px"><div class="desc">${esc(r.p.desc)}</div><div class="ref">Ítem ${esc(itm(r.p))} · ${esc(r.p.fab)}</div><div style="margin-top:3px">${stockChip(r.p)}${r.short?` <span class="chip bad">Pide ${r.l.qty.toLocaleString('es-CO')}, hay ${r.avail.toLocaleString('es-CO')}</span>`:''}</div></td>
    <td class="n"><input class="qty" type="number" min="0" step="1" id="lq${i}" value="${r.l.qty}" data-i="${i}" data-k="qty" aria-label="Cantidad"></td>
    <td class="n" style="color:var(--muted)">${kg((r.p.peso||0)*r.l.qty)}</td>
    <td><select class="lp" data-i="${i}" data-k="lp" aria-label="Lista de precios">${LISTAS.map((x,k)=>`<option value="${k}" ${k===r.lp?'selected':''}>${x}</option>`).join('')}</select></td>
    <td class="n"><input class="disc" type="number" min="0" max="${DESC_MAX*100}" step="0.5" id="lm${i}" value="${Math.round(r.d*1000)/10}" data-i="${i}" data-k="d" aria-label="Descuento %" ${r.lp===AJ?'':'disabled title="Elige la lista Ajustado para dar descuento"'}></td>
    <td class="n">${RT?`<input class="pf${r.pf?' on':''}" type="number" min="0" step="1" id="lp${i}" value="${r.net}" data-i="${i}" data-k="pf" aria-label="Precio unitario: digita un precio" title="Digita el precio que ya le diste al cliente">`:cop(r.net)}${r.rm!=null?`<div class="pfinfo ${r.low?'bad':''}">${r.pf?'Precio digitado · ':''}Rentab. <b>${pct(r.rm)}</b>${r.low?' · bajo el 10%':''}<br><span>sobre ${r.rb.src}</span>${r.pf?` · <button class="pfx" data-pfx="${i}" title="Volver al precio de lista">Quitar</button>`:''}</div>`:''}</td><td class="n" style="font-weight:800">${cop(r.tot)}</td>
    <td><button class="btn ghost sm" data-del="${i}" aria-label="Quitar">✕</button></td></tr>`).join('');
  $('tot').innerHTML=`<span>Subtotal</span><span>${cop(C.base)}</span><span>IVA 19%</span><span>${cop(C.iva)}</span><span class="grand">Total</span><span class="grand">${cop(C.total)}</span>`;
  $('weightBox').innerHTML=S.lines.length?`Peso aproximado: <b class="mono">${kg(C.peso)}</b><br>${S.lines.length} línea${S.lines.length==1?'':'s'} · pago ${PAGOS[S.pago].toLowerCase()}`:'';
  $('alert').hidden=true;
  const blocked=!S.lines.length||C.under.length>0;
  $('btnGen').disabled=blocked;$('btnCopy').disabled=!S.lines.length;$('btnWa').classList.toggle('off',blocked);
  $('mbarTxt').innerHTML=`${S.lines.length} producto${S.lines.length==1?'':'s'} · <b>${cop(C.total)}</b>`;
  saveDraft();
}
$('lines').addEventListener('change',e=>{const t=e.target;if(!t.dataset.k)return;const l=S.lines[+t.dataset.i];if(t.dataset.k==='lp'){l.lp=+t.value;l.pf=null}else if(t.dataset.k==='pf'){const v=Math.round(+t.value||0);const nv=v>0?v:null;if(nv===(l.pf||null))return;l.pf=nv}else l[t.dataset.k]=t.dataset.k==='d'?Math.min(DESC_MAX,Math.max(0,+t.value||0)/100):Math.max(0,+t.value||0);S.dirty=true;render();const n=$(t.id);n&&n.focus()});
$('lines').addEventListener('mousedown',e=>{const px=e.target.closest('[data-pfx]');if(!px)return;e.preventDefault();S.lines[+px.dataset.pfx].pf=null;S.dirty=true;render()});
$('lines').addEventListener('click',e=>{const b=e.target.closest('[data-del]');if(b){S.lines.splice(+b.dataset.del,1);S.dirty=true;render()}});
$('btnNew').addEventListener('click',()=>{S=blank();CF.forEach(f=>$(f).value='');$('obs').value='';$('mAll').value='';$('sendStatus').innerHTML='';$('dClient').open=true;render();$('cName').focus()});
$('mbarGo').addEventListener('click',()=>$('quotePanel').scrollIntoView({behavior:'smooth'}));

/* importar solicitud web */
$('btnImp').addEventListener('click',()=>{
  const t=$('impTxt').value;let n=0;const miss=[],free=[],lines=[];
  t.split(/\n/).forEach(ln=>{const fm=ln.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(.*?)\s*\[ref \?\]/i);if(fm){free.push(fm[1]+' × '+fm[2]);return}
    const m=ln.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*.*?\[(?:ref\.?\s*)?([^\]]+)\]/i);if(m){const ref=m[2].trim(),q=parseFloat(m[1].replace(',','.'));if(BY.has(ref)){lines.push({ref,qty:q,lp:S.lista,d:0});n++}else miss.push(ref)}});
  const g=re=>{const m=t.match(re);return m?m[1].trim():''};
  const map={cName:/Empresa:\s*(.+)/i,cNit:/NIT[^:]*:\s*(.+)/i,cContact:/Nombre:\s*(.+)/i,cPhone:/Tel[ée]fono:\s*(.+)/i,cEmail:/Correo:\s*(.+)/i,cCity:/(?:Ciudad|Entrega)[^:]*:\s*(.+)/i};
  if(!n&&!free.length){$('impMsg').textContent='No encontré productos. Revisa que pegaste el mensaje completo.';return}
  S={...blank(),pago:S.pago,lista:S.lista,lines,origen:'web'};CF.forEach(f=>$(f).value=g(map[f]));if(!$('cName').value)$('cName').value=$('cContact').value;
  $('impTxt').value='';$('impMsg').textContent=`${n} producto${n==1?'':'s'} importado${n==1?'':'s'}`+(miss.length?` · ${miss.length} referencia(s) ya no están en la lista: ${miss.join(', ')}`:'')+(free.length?` · Sin referencia, búscalos a mano: ${free.join('; ')}`:'');
  $('dClient').open=true;S.dirty=true;render();
});
function summaryText(){const C=calc();return [`*Cotización ${S.num} · Soluciones Tubulares*`,`Cliente: ${$('cName').value||'-'}`,`Condición de pago: ${PAGOS[S.pago]}`,'',...C.rows.map(r=>`• ${r.l.qty} × ${r.p.desc} — ${cop(r.net)} c/u = ${cop(r.tot)}`),'',`Subtotal: ${cop(C.base)}`,`IVA 19%: ${cop(C.iva)}`,`*Total: ${cop(C.total)}*`,`Vigencia: ${$('vig').value}`,$('aName').value?`Asesor: ${$('aName').value} ${$('aPhone').value}`:''].join('\n')}
$('btnCopy').addEventListener('click',()=>{const txt=summaryText();navigator.clipboard.writeText(txt).then(()=>toast('Resumen copiado')).catch(()=>{$('impTxt').value=txt;$('dImp').open=true;$('impTxt').select();toast('Selecciona y copia el texto del recuadro')})});

/* ---------- inventario del día ---------- */
function initInv(){const v=D.meta||{};if(v.fecha)$('invDate').textContent=v.fecha;const hoy=new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'});const fresh=v.actualizado===hoy;$('invDot').className='dot '+(fresh?'ok':'warn');$('stInv').title=fresh?'Actualizado hoy':'Última actualización: '+(v.actualizado||'—')}

/* ---------- PDF ---------- */
/* Clientes frecuentes: al escribir la razón social se completan NIT, contacto, correo, plazo de pago y lista */
(function(){let CL=[];try{CL=JSON.parse(document.getElementById('clientes').textContent)}catch(e){}if(!CL.length)return;
  const find=t=>{t=norm(t||'');return t.length>=4?CL.find(c=>c.claves.some(k=>t.includes(norm(k)))):null};
  const show=c=>{$('cDir').hidden=!c;if(c)$('cDir').textContent='Cliente registrado: '+c.razon+' · NIT '+c.nit+' · Pago '+c.pago+(c.nota?' · '+c.nota:'')};
  const apply=c=>{if(!c)return;const set=(id,v)=>{if(v&&!$(id).value.trim())$(id).value=v};$('cName').value=c.razon;set('cNit',c.nit);set('cContact',c.contacto);set('cEmail',c.email);set('cCity',c.ciudad);
    const pi=PAGOS.indexOf(c.pago);if(pi>=0)S.pago=pi;const li=LISTAS.indexOf(c.lista);if(li>=0&&li!==AJ){S.lista=li;S.lines.forEach(l=>{if(l.lp!==AJ)l.lp=li})}S.dirty=true;saveDraft();render();renderCatalog();show(c)};
  $('cName').addEventListener('change',()=>apply(find($('cName').value)));$('cName').addEventListener('input',()=>show(find($('cName').value)));
  window.ST_CLIENTE=n=>apply(find(n));show(find($('cName').value));})();

/* Autorización de tratamiento de datos (Ley 1581 de 2012): obligatoria para generar la cotización */
(function(){const cb=$('cHab');cb.checked=!!S.hab;cb.addEventListener('change',()=>{S.hab=cb.checked;cb.closest('.hab').classList.remove('req');saveDraft()});
  document.querySelectorAll('.polLink').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const d=$('polDlg');d.showModal?d.showModal():d.setAttribute('open','')}));
  $('polClose').addEventListener('click',()=>{const d=$('polDlg');d.close?d.close():d.removeAttribute('open')});
  const guard=e=>{if(!cb.checked){e.preventDefault();e.stopImmediatePropagation();$('dClient').open=true;cb.closest('.hab').classList.add('req');cb.scrollIntoView({behavior:'smooth',block:'center'});toast('Confirma que el cliente autorizó el tratamiento de datos (Ley 1581)')}};
  ['btnGen','btnWa','btnSend'].forEach(id=>{const b=$(id);if(b)b.addEventListener('click',guard,true)});
  $('btnNew').addEventListener('click',()=>{cb.checked=false;S.hab=false});})();

const ITEMS=_IT;const itemOf=ref=>{const v=ITEMS[ref];return v==null||v===''?'—':String(v)};
function buildPdf(){for(const L of [0,1,2,3]){const d=buildPdfL(L);if(d.getNumberOfPages()===1)return d}return buildPdfL(0)}
function buildPdfL(L){
  const {jsPDF}=window.jspdf;const doc=new jsPDF({unit:'pt',format:'letter',compress:true});
  const W=612,H=792,M=40,C=calc();
  const NAVY=[24,45,78],YEL=[255,213,0],INK=[17,20,24],TXT=[46,53,61],MUT=[74,82,92],G100=[238,240,242],G300=[201,206,212];
  const f=(st,sz,col)=>{doc.setFont('helvetica',st);doc.setFontSize(sz);doc.setTextColor(...col)};
  const img=(o,x,y,w,h)=>{try{doc.addImage(o.d,o.d.startsWith('data:image/jpeg')?'JPEG':'PNG',x,y,w,h)}catch(e){}};
  const fit=(o,bw,bh)=>{const r=Math.min(bw/o.w,bh/o.h);return [o.w*r,o.h*r]};
  const cli=$('cName').value||'Cliente',fecha=new Date().toLocaleDateString('es-CO',{day:'numeric',month:'long',year:'numeric'});
  // encabezado
  const [lw,lh]=fit(BRAND.blue,118,74);img(BRAND.blue,W-M-lw,22,lw,lh);
  doc.setFillColor(...YEL);doc.rect(M,34,26,4,'F');f('bold',9,NAVY);doc.setCharSpace(1.2);doc.text('COTIZACIÓN  ·  '+S.num,M+34,38.5);doc.setCharSpace(0);
  f('bold',23,NAVY);const tl=doc.splitTextToSize('Cotización para '+cli,W-2*M-lw-24);doc.text(tl.slice(0,2),M,66);
  let y=66+Math.min(tl.length,2)*26;f('normal',10,TXT);doc.text(`${fecha}  ·  Vigencia: ${$('vig').value}  ·  Precios en pesos colombianos`,M,y);
  y=Math.max(y+14,104);
  // franja de imagen
  const fh=W*BRAND.hero.h/BRAND.hero.w,hh=L===0?fh:L===1?Math.min(fh,56):0;if(hh===fh)img(BRAND.hero,0,y,W,hh);else if(hh>0){doc.saveGraphicsState();doc.rect(0,y,W,hh,null);doc.clip();doc.discardPath();img(BRAND.hero,0,y-(fh-hh)/2,W,fh);doc.restoreGraphicsState()}y+=hh;if(hh===0){doc.setFillColor(...YEL);doc.rect(0,y-2,W,2,'F')}
  // datos del cliente sobre banda gris
  doc.setFillColor(...G100);doc.rect(0,y,W,84,'F');
  const cells=[['Cliente',cli],['NIT / C.C.',$('cNit').value],['Contacto',[$('cContact').value,$('cPhone').value].filter(Boolean).join(' · ')],['Obra / entrega',$('cCity').value],['Condición de pago',PAGOS[S.pago]],['Correo',$('cEmail').value]];
  const cw=(W-2*M-2*20)/3;cells.forEach((c,i)=>{const cx=M+(i%3)*(cw+20),cy=y+14+Math.floor(i/3)*36;doc.setFillColor(...YEL);doc.rect(cx,cy,cw,2,'F');
    f('bold',7,MUT);doc.setCharSpace(.8);doc.text(c[0].toUpperCase(),cx,cy+12);doc.setCharSpace(0);{const tv=String(c[1]||'-');let fs=10;f('bold',fs,NAVY);while(fs>7&&doc.getTextWidth(tv)>cw){fs-=.5;doc.setFontSize(fs)}doc.text(doc.splitTextToSize(tv,cw)[0],cx,cy+25)}});
  y+=84+(L>=2?12:18);
  // tabla
  const pk=r=>((r.p.peso||0)*r.l.qty).toLocaleString('es-CO',{maximumFractionDigits:1})+' kg';doc.autoTable({startY:y,margin:{left:M,right:M,bottom:60},head:[['Ítem','Descripción','Cant.','Peso total','Precio unit.','Subtotal']],
    body:C.rows.map(r=>[itemOf(r.p.ref),r.p.desc,r.l.qty.toLocaleString('es-CO'),pk(r),cop(r.net),cop(r.tot)]),
    styles:{font:'helvetica',fontSize:8.6,cellPadding:L>=2?{top:4,bottom:4,left:5,right:5}:{top:6,bottom:6,left:6,right:6},textColor:TXT,lineColor:G300,lineWidth:{bottom:.5}},
    headStyles:{fillColor:NAVY,textColor:255,fontStyle:'bold',fontSize:8.6,lineWidth:0},alternateRowStyles:{fillColor:[248,249,250]},
    columnStyles:{0:{cellWidth:44,fontSize:L>=2?7.6:8.2,textColor:MUT},1:{textColor:INK,fontStyle:'bold'},2:{halign:'right',cellWidth:38},3:{halign:'right',cellWidth:58},4:{halign:'right',cellWidth:72},5:{halign:'right',cellWidth:82,fontStyle:'bold',textColor:NAVY}},
    didParseCell:d=>{if(d.section==='head'&&d.column.index>=2)d.cell.styles.halign='right'},
    didDrawPage:d=>{if(d.pageNumber>1){doc.setFillColor(...YEL);doc.rect(M,22,26,4,'F');f('bold',8,NAVY);doc.text('COTIZACIÓN '+S.num+' · '+cli,M+34,26.5)}}});
  y=doc.lastAutoTable.finalY+(L>=3?12:18);
  const TB=L>=3?100:118,SH=L>=3?50:58,AH=L>=3?60:96;const need=TB+SH+AH+92;if(y+need>H){doc.addPage();y=50}
  // totales y notas
  const tx=W-M-230,r1=L>=3?12:14,r2=L>=3?32:38,bt=L>=3?44:54,bh=L>=3?40:46;f('normal',10.5,MUT);doc.text('Subtotal antes de IVA',tx,y+r1);doc.text('IVA 19%',tx,y+r2);f('bold',11,INK);doc.text(cop(C.base),W-M,y+r1,{align:'right'});doc.text(cop(C.iva),W-M,y+r2,{align:'right'});
  doc.setDrawColor(...G300);doc.setLineWidth(.5);doc.line(tx,y+r1+8,W-M,y+r1+8);
  doc.setFillColor(...NAVY);doc.rect(tx-10,y+bt,240,bh,'F');doc.setFillColor(...YEL);doc.rect(tx-10,y+bt,4,bh,'F');f('bold',12,[255,255,255]);doc.setCharSpace(1);doc.text('TOTAL',tx+6,y+bt+bh/2+4);doc.setCharSpace(0);f('bold',L>=3?17:19,YEL);doc.text(cop(C.total),W-M-10,y+bt+bh/2+6,{align:'right'});
  f('normal',8.8,TXT);let ny=y+10;[`Peso aproximado: ${kg(C.peso)}`,'Precios sujetos a disponibilidad de inventario al momento del pedido.',$('obs').value,'Datos personales tratados conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013. Para conocer, actualizar, rectificar o eliminar sus datos, o no autorizar su tratamiento: cartera@solucionestubulares.com'].filter(Boolean).forEach(n=>{const ls=doc.splitTextToSize(n,tx-M-24);doc.text(ls,M,ny);ny+=ls.length*12});
  y+=TB;
  // compra con tranquilidad
  const st=[['+31 años','En el mercado desde 1994'],['Desde 24 h','Despacho de pedidos'],['+19.000','Clientes atendidos'],['Disponibilidad','Inventario en todo el país']];
  const sw=(W-2*M-3*16)/4;st.forEach((s,i)=>{const sx=M+i*(sw+16);doc.setFillColor(...YEL);doc.rect(sx,y,sw,2.5,'F');f('bold',15,NAVY);doc.text(s[0],sx,y+21);f('normal',8.5,TXT);doc.text(s[1],sx,y+34)});
  y+=SH;
  // aliados
  doc.setFillColor(...YEL);doc.rect(M,y,W-2*M,2,'F');f('bold',7,MUT);doc.setCharSpace(.8);doc.text('ALIADOS DE LOS GRANDES PRODUCTORES DE COLOMBIA',M,y+13);doc.setCharSpace(0);
  if(L>=3){const bw=(W-2*M)/BRAND.sup.length;BRAND.sup.forEach((s,i)=>{const [w2,h2]=fit(s,bw-4,32);img(s,M+i*bw+(bw-w2)/2,y+20+(32-h2)/2,w2,h2)})}else{const per=Math.ceil(BRAND.sup.length/2),bw=(W-2*M)/per,lh=32;BRAND.sup.forEach((s,i)=>{const row=Math.floor(i/per),col=i%per,n=row?BRAND.sup.length-per:per,off=(per-n)*bw/2;const [w2,h2]=fit(s,bw-16,lh);img(s,M+off+col*bw+(bw-w2)/2,y+20+row*(lh+8)+(lh-h2)/2,w2,h2)})}
  // pie azul con asesor y WhatsApp
  const fy=H-90;doc.setFillColor(...NAVY);doc.rect(0,fy,W,90,'F');doc.setFillColor(...YEL);doc.rect(0,fy,W,3,'F');
  const [ww,wh]=fit(BRAND.white,84,60);img(BRAND.white,M,fy+16,ww,wh);
  doc.setDrawColor(255,255,255);doc.setLineWidth(.4);doc.line(M+ww+12,fy+24,M+ww+12,fy+70);
  const ax=M+ww+24,aw=W-M-176-58-14-ax,fitT=(t,st,sz,col,yy)=>{f(st,sz,col);let s=sz;while(s>6.5&&doc.getTextWidth(t)>aw){s-=.25;doc.setFontSize(s)}doc.text(t,ax,yy)};
  const an=($('aName').value||'Equipo comercial').split(' · ');let ly=fy+27;fitT(an[0],'bold',11,[255,255,255],ly);if(an.length>1){ly+=11;fitT(an.slice(1).join(' · '),'normal',8,[255,255,255],ly)}
  fitT($('aEmail').value||'mercadeo@solucionestubulares.com','normal',8.6,[255,255,255],ly+12);fitT('PBX: 3 700 666','bold',8.6,YEL,ly+24);fitT('www.solucionestubulares.com','bold',8.6,[255,255,255],ly+36);
  const cel=($('aPhone').value||'3153136932').replace(/\D/g,''),wa='https://wa.me/'+(cel.length===10?'57'+cel:cel)+'?text='+encodeURIComponent('Hola, quiero confirmar la cotización '+S.num);
  if(window.qrcode){try{const q=qrcode(0,'M');q.addData(wa);q.make();const n=q.getModuleCount(),qs=58,qx=W-M-176-qs,qy=fy+16;doc.setFillColor(255,255,255);doc.rect(qx-3,qy-3,qs+6,qs+6,'F');doc.setFillColor(...INK);const c=qs/n;for(let r=0;r<n;r++)for(let k=0;k<n;k++)if(q.isDark(r,k))doc.rect(qx+k*c,qy+r*c,c+.05,c+.05,'F')}catch(e){}}
  const bx=W-M-162;doc.setFillColor(...YEL);doc.rect(bx,fy+24,162,42,'F');doc.setFillColor(37,211,102);doc.roundedRect(bx+10,fy+35,20,20,4,4,'F');f('bold',11,[255,255,255]);doc.text('W',bx+15.5,fy+49);
  f('bold',10.5,NAVY);doc.text('Confirma por WhatsApp',bx+38,fy+42);f('bold',10,NAVY);doc.text(cel.replace(/(\d{3})(\d{3})(\d{4})/,'$1 $2 $3'),bx+38,fy+56);
  doc.link(bx,fy+24,162,42,{url:wa});
  return doc;
}
function pdfName(){const d=new Date(),z=n=>String(n).padStart(2,'0');const cli=($('cName').value||'Cliente').replace(/[\\/:*?"<>|#%]/g,' ').replace(/\s+/g,' ').trim().slice(0,60);return `${cli} - ${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())} - ${S.num}.pdf`}
const isMail=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
function stat(html){$('sendStatus').innerHTML='<div>'+html+'</div>'}
function waClient(){const cel=$('cPhone').value.replace(/\D/g,'');const to=cel.length===10?'57'+cel:cel;return 'https://wa.me/'+to+'?text='+encodeURIComponent(summaryText())}
$('btnWa').addEventListener('click',e=>{if($('btnWa').classList.contains('off')){e.preventDefault();return}$('btnWa').href=waClient();if(!$('cPhone').value.trim())toast('Sin celular del cliente: elige el contacto en WhatsApp')});
$('btnGen').addEventListener('click',()=>{
  if(!$('cName').value.trim()){toast('Escribe el nombre del cliente');$('dClient').open=true;$('cName').focus();return}
  if(!window.jspdf){stat('<span class="chip bad">No cargó el generador de PDF. Recarga la página.</span>');return}
  try{buildPdf().save(pdfName());stat('<span class="chip ok">PDF descargado · '+esc(pdfName())+'</span> Compártelo al cliente por WhatsApp o correo.')}
  catch(e){stat('<span class="chip bad">No se pudo generar el PDF</span>')}
});

/* ---------- arranque ---------- */
$('brandLogo').src=BRAND.white.d;
initInv();renderCatalog();render();sums();

/* ---------- registro de uso (panel de Santiago) ---------- */
const ASESORES=[
  {n:'Alexandra Ferreira N. · Asesor Comercial',t:'3156704214',e:'ventasmostrador2@solucionestubulares.com'},
  {n:'Biviana Barreto · Sub-Gerente',t:'3153136940',e:'biviana@solucionestubulares.com'},
  {n:'Santiago Gaviria',t:'3153136932',e:'sgaviria@solucionestubulares.com'}];
const DEV=(()=>{let d=LS.get('stp_dev',null);if(!d){d=Math.random().toString(36).slice(2,10);LS.set('stp_dev',d)}return d})();
function quien(){return ($('aName').value||'').split(' · ')[0].trim()}
function enviar(tipo,extra){const body=JSON.stringify({tipo,asesor:quien(),asesorTel:$('aPhone').value,asesorEmail:$('aEmail').value,dev:DEV,movil:matchMedia('(max-width: 760px)').matches,...extra});
  try{if(navigator.sendBeacon&&navigator.sendBeacon('/api/evento',new Blob([body],{type:'application/json'})))return}catch(e){}
  try{fetch('/api/evento',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{})}catch(e){}}
function resumenCot(){const C=calc();return {num:S.num,cliente:$('cName').value,nit:$('cNit').value,contacto:$('cContact').value,telefono:$('cPhone').value,ciudad:$('cCity').value,
  pago:PLAZOS[S.pago],lista:LISTAS[S.lista],lineas:C.rows.map(r=>({item:itemOf(r.p.ref),desc:r.p.desc,qty:r.l.qty,lista:LISTAS[r.lp],net:r.net,tot:r.tot})),
  base:C.base,iva:C.iva,total:C.total,peso:Math.round(C.peso)}}
// identificación del asesor (una vez por equipo; se puede cambiar en "Asesor y condiciones")
(function(){const st=document.createElement('style');st.textContent=`.whoBack{position:fixed;inset:0;background:rgba(10,20,40,.55);display:flex;align-items:center;justify-content:center;z-index:99;padding:16px}
.whoBox{background:var(--surface,#fff);color:inherit;border-radius:18px;max-width:420px;width:100%;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.3)}
.whoBox h3{margin:0 0 4px;font-size:20px}.whoBox p{margin:0 0 14px;color:var(--muted,#666);font-size:13.5px}
.whoBox button.op{display:block;width:100%;text-align:left;border:1px solid var(--line,#ddd);background:transparent;color:inherit;border-radius:12px;padding:11px 14px;margin:0 0 8px;font:inherit;cursor:pointer}
.whoBox button.op:hover{border-color:#182D4E}.whoBox input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--line,#ddd);border-radius:10px;font:inherit;margin:4px 0 10px;background:transparent;color:inherit}`;document.head.appendChild(st)})();
function pedirAsesor(){const bk=document.createElement('div');bk.className='whoBack';
  bk.innerHTML=`<div class="whoBox" role="dialog" aria-modal="true" aria-label="¿Quién está cotizando?"><h3>¿Quién está cotizando?</h3><p>Tu nombre sale en el PDF y en el reporte de cotizaciones.</p>
  ${ASESORES.map((a,i)=>`<button class="op" data-a="${i}"><b>${esc(a.n.split(' · ')[0])}</b><br><small style="color:var(--muted,#666)">${esc(a.e)}</small></button>`).join('')}
  <details><summary style="cursor:pointer;font-size:13px;margin:6px 0 8px">Otro asesor</summary><input id="whoN" placeholder="Nombre y apellido"><input id="whoT" placeholder="Celular"><input id="whoE" placeholder="Correo"><button class="btn primary" id="whoOk" style="width:100%">Continuar</button></details></div>`;
  document.body.appendChild(bk);
  const set=(n,t,e)=>{$('aName').value=n;$('aPhone').value=t;$('aEmail').value=e;saveDraft();bk.remove();enviar('apertura',{});toast('Hola, '+n.split(' ')[0])};
  bk.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(b){const a=ASESORES[+b.dataset.a];set(a.n,a.t,a.e)}});
  bk.querySelector('#whoOk').addEventListener('click',()=>{const n=bk.querySelector('#whoN').value.trim();if(n.length<3){toast('Escribe tu nombre');return}set(n,bk.querySelector('#whoT').value.trim(),bk.querySelector('#whoE').value.trim())})}
if(!quien())pedirAsesor();else enviar('apertura',{});
$('btnGen').addEventListener('click',()=>{$('sendStatus').innerHTML=''},true);
$('btnGen').addEventListener('click',()=>{if(/PDF descargado/.test($('sendStatus').textContent))enviar('pdf',{cot:resumenCot()})});
$('btnWa').addEventListener('click',()=>{if(!$('btnWa').classList.contains('off'))enviar('whatsapp',{cot:resumenCot()})});
$('btnCopy').addEventListener('click',()=>{if(S.lines.length)enviar('resumen',{cot:resumenCot()})});

}
boot();
