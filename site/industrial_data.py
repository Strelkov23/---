"""Rosstat industrial series. Preserve publisher codes, editions, units and cell coordinates."""
import io,json,re,hashlib
from collections import defaultdict
from datetime import date
import historical as h

BASE="https://www.rosstat.gov.ru/storage/mediabank/"
FILES={
 "ind_baza_2023.xlsx":("Индексы производства, месячные, база 2023","monthly"),
 "ind_prom_okved.xlsx":("Исторические индексы, ОКВЭД ред. 1.1","legacy"),
 "otgruz_god_2025.xlsx":("Отгрузка, годовые данные","shipment"),
 "Proizvodstvo_god_2025.xlsx":("Натуральное производство, 2025","physical"),
}
MONTHS="январь февраль март апрель май июнь июль август сентябрь октябрь ноябрь декабрь".split()
def text(v):return " ".join(str(v if v is not None else "").split())
def yr(v):
    m=re.fullmatch(r"(19[89]\d|20[0-2]\d)(?:\s*год(?:а)?\s*\d*|\s*г\.?\s*\d*|\s*\d+\))?",text(v))
    return int(m[1]) if m else None
def activity_code(v):
    s=text(v)
    return s if re.fullmatch(r"[B-E]|BCDE|\d{2}(?:\.\d{1,2}){0,3}|1323500\.029\.31",s) else ""
def product_code(v):
    s=text(v)
    return s if re.fullmatch(r"\d{2}(?:\.\d{1,3}){2,5}(?:\.АГ)?",s) else ""

def parse(raw,filename):
    import openpyxl
    label,kind=FILES[filename];url=BASE+filename
    book=openpyxl.load_workbook(io.BytesIO(raw),read_only=True,data_only=True)
    series=[]
    def add(title,code,classification,kind,unit,frequency,definition,sheet,rows):
        if not rows:return
        periods=[r["period"] for r in rows]
        if len(set(periods))!=len(periods):return
        key=hashlib.sha256("|".join((filename,sheet,title,code,kind,unit,frequency)).encode()).hexdigest()[:20]
        series.append(dict(id=key,title=title,code=code,classification=classification,kind=kind,unit=unit,frequency=frequency,definition=definition,sheet=sheet,source=url,values=sorted(rows,key=lambda r:r["period"])))
    def obs(p,v,r,c,note=""):
        value=h.numeric(v)
        return dict(period=p,value=value,row=r,column=c,note=note) if value is not None and value>=0 else None
    try:
        for sheet in book:
            if h.norm(sheet.title)=="содержание":continue
            if (sheet.max_row or 0)>12000 or (sheet.max_column or 0)>600:raise ValueError("Неожиданный размер листа")
            rows=list(sheet.iter_rows(values_only=True,max_row=sheet.max_row,max_col=sheet.max_column))
            if not rows:continue
            title=h.norm(rows[1][0]) if len(rows)>1 else ""
            if kind=="monthly":
                if not title.startswith("индексы производства по отдельным видам экономической деятельности по российской федерации"):continue
                basis=h.norm(rows[2][0])
                modes={"(в % к предыдущему месяцу)":("Индекс производства м/м","% к предыдущему месяцу"),"(в % к соответствующему месяцу предыдущего года)":("Индекс производства г/г","% к тому же месяцу прошлого года"),"(в % к соответствующему периоду предыдущего года)":("Индекс производства с начала года","% к тому же периоду прошлого года")}
                if basis not in modes or len(rows)<6 or h.norm(rows[3][1])!="код оквэд2":continue
                metric,unit=modes[basis];cols=[];year=None
                for j,(yv,mv) in enumerate(zip(rows[3],rows[4])):
                    if j<2:continue
                    if yr(yv):year=yr(yv)
                    m=h.norm(mv)
                    if m in MONTHS and year:cols.append((j,f"{year}-{MONTHS.index(m)+1:02d}"))
                # Only the first uninterrupted monthly block. Other cells can describe alternative vintages.
                block=[]
                for j,p in cols:
                    if block:
                        py,pm=map(int,block[-1][1].split("-"));expected=f"{py+(pm==12)}-{pm%12+1:02d}"
                        if p!=expected or j!=block[-1][0]+1:break
                    block.append((j,p))
                if len(block)<12:continue
                for i,row in enumerate(rows[5:],6):
                    code=activity_code(row[1]);name=text(row[0])
                    if not code or not name:continue
                    vals=[obs(p,row[j],i,j+1,"База 2023; сноски в оригинале") for j,p in block if j<len(row)]
                    add(name,code,"ОКВЭД2",metric,unit,"месячная",basis+"; база 2023. Индекс, не объём в рублях.",sheet.title,[v for v in vals if v])
            elif kind in ("shipment","legacy"):
                if kind=="shipment":
                    if not title.startswith("объем отгруженных товаров собственного производства") or not re.search(r"млн\.?\s*рублей",title):continue
                    header=3;first=2;metric="Отгрузка";unit="млн руб.";classification="ОКВЭД2";definition="Отгруженные товары собственного производства, работы и услуги собственными силами в текущих ценах. Не ВВП и не натуральный выпуск."
                    if h.norm(rows[header][1])!="код оквэд2":continue
                else:
                    if "оквэд ред.1.1" not in title or "в % к предыдущему году" not in title or not title.startswith("индексы производства"):continue
                    header=2;first=1;metric="Исторический индекс производства";unit="% к предыдущему году";classification="ОКВЭД ред. 1.1";definition="Историческая классификация. Не объединять автоматически с ОКВЭД2."
                cols=[]
                for j in range(first,len(rows[header])):
                    y=yr(rows[header][j])
                    if not y:break
                    if cols and y!=int(cols[-1][1])+1:break
                    cols.append((j,str(y)))
                if len(cols)<3:continue
                for i,row in enumerate(rows[header+1:],header+2):
                    name=text(row[0]);code=activity_code(row[1]) if kind=="shipment" else ""
                    if not name or (kind=="shipment" and not code):continue
                    vals=[obs(p,row[j],i,j+1,"Заголовок периода: "+text(rows[header][j])) for j,p in cols if j<len(row)]
                    vals=[v for v in vals if v]
                    if len(vals)<2:continue
                    add(name,code,classification,metric,unit,"годовая",definition,sheet.title,vals)
            elif kind=="physical":
                if not h.norm(rows[0][0]).startswith("производство продукции в натуральном выражении по полному кругу производителей в российской федерации за 2025 год"):continue
                if len(rows)<9 or "произведено важнейших видов продукции (всего)" not in h.norm(rows[5][2]):continue
                if [h.norm(v) for v in rows[6][3:15]]!=[f"{i:02d}_{m}" for i,m in enumerate(MONTHS,1)]:continue
                name=code=""
                for i,row in enumerate(rows[8:],9):
                    c=product_code(row[1])
                    if c:
                        name=text(row[0]);code=c;continue
                    # Unit codes are separate rows; no forward fill across unrelated labels.
                    unit=text(row[0]);uc=text(row[1])
                    if not code or not unit or not re.fullmatch(r"\d{2,4}",uc):name=code="";continue
                    definition="Натуральный выпуск по полному кругу производителей. Единица ОКЕИ: "+uc+". Годовой итог взят из источника, не рассчитан суммированием."
                    annual=obs("2025",row[2],i,3)
                    monthly=[obs(f"2025-{j:02d}",row[j+2],i,j+3) for j in range(1,13)]
                    add(name,code,"ОКПД2 (код источника)", "Натуральный выпуск",unit,"годовая",definition,sheet.title,[annual] if annual else [])
                    add(name,code,"ОКПД2 (код источника)", "Натуральный выпуск",unit,"месячная",definition,sheet.title,[v for v in monthly if v])
                    # Some products legitimately have more than one unit; retain distinct rows.
    finally:book.close()
    ids=[s["id"] for s in series]
    if len(set(ids))!=len(ids):raise ValueError("Неоднозначные повторяющиеся ряды")
    if not series:raise ValueError("Не распознаны таблицы с однозначными заголовками")
    return series

def publish(db,stamp,out,refresh):
    db.execute("create table if not exists industrial_series(id text primary key,payload text)")
    db.execute("create table if not exists industrial_obs(id text,period text,seen text,payload text,primary key(id,period,seen))")
    db.execute("create table if not exists industrial_checks(filename text primary key,checked text,success text,status text)")
    if refresh:
        for filename,(title,kind) in FILES.items():
            try:
                raw,_=h.get(BASE+filename,35000000)
                series=parse(raw,filename);count=sum(len(s["values"]) for s in series)
                with db:
                    for s in series:
                        values=s.pop("values");sid=s["id"]
                        db.execute("insert or replace into industrial_series values(?,?)",(sid,json.dumps(s,ensure_ascii=False)))
                        old={r[0]:json.loads(r[1]) for r in db.execute("select period,payload from (select period,payload,row_number() over(partition by period order by seen desc) rn from industrial_obs where id=?) where rn=1",(sid,))}
                        for v in values:
                            before=old.get(v["period"],{}).copy();before.pop("seen",None)
                            if before!=v:
                                db.execute("insert or replace into industrial_obs values(?,?,?,?)",(sid,v["period"],stamp,json.dumps(dict(v,seen=stamp),ensure_ascii=False)))
                    db.execute("insert or replace into industrial_checks values(?,?,?,?)",(filename,stamp,stamp,f"Рядов: {len(series)}; наблюдений: {count}"))
            except Exception as e:
                with db:db.execute("insert into industrial_checks values(?,?,null,?) on conflict(filename) do update set checked=excluded.checked,status=excluded.status",(filename,stamp,"Ошибка: "+str(e)[:180]))
    result=[]
    for sid,payload in db.execute("select id,payload from industrial_series order by id"):
        s=json.loads(payload);s["values"]=[json.loads(r[0]) for r in db.execute("select payload from (select period,payload,row_number() over(partition by period order by seen desc) rn from industrial_obs where id=?) where rn=1 order by period",(sid,))]
        result.append(s)
    sources=[]
    for filename,(title,kind) in FILES.items():
        r=db.execute("select checked,success,status from industrial_checks where filename=?",(filename,)).fetchone()
        sources.append(dict(title=title,url=BASE+filename,checked=r[0] if r else None,success=r[1] if r else None,status=r[2] if r else "Ожидается загрузка"))
    (out/"industrial.json").write_text(json.dumps(dict(built=stamp,series=sorted(result,key=lambda s:(s["kind"],s["code"],s["title"],s["frequency"])),sources=sources),ensure_ascii=False,separators=(",",":"),allow_nan=False),encoding="utf-8")
    return [s["title"]+" · "+s["status"] for s in sources if s["status"].startswith("Ошибка")]
