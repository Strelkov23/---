"""Official Bank of Russia systemically important institutions: directory only."""
import re,hashlib
from html.parser import HTMLParser
from urllib.request import Request,urlopen
from datetime import datetime
SOURCE="https://www.cbr.ru/banking_sector/credit/SystemBanks.html/"
MAX=4_000_000
def clean(s):return re.sub(r"\s+"," ",s).strip()
class Tables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.tables=[];self.depth=0;self.row=None;self.cell=None;self.text=[]
    def handle_starttag(self,tag,attrs):
        if tag=="table":
            self.depth+=1
            if self.depth==1:self.tables.append([])
        if self.depth==1:
            if tag=="tr":self.row=[]
            if tag in ("td","th") and self.row is not None:self.cell=[]
    def handle_endtag(self,tag):
        if self.depth==1:
            if tag in ("td","th") and self.cell is not None and self.row is not None:self.row.append(clean(" ".join(self.cell)));self.cell=None
            if tag=="tr" and self.row is not None:self.tables[-1].append(self.row);self.row=None
        if tag=="table":self.depth=max(0,self.depth-1)
    def handle_data(self,s):
        self.text.append(s)
        if self.cell is not None:self.cell.append(s)
def parse(raw,encoding="utf-8"):
    if not 0<len(raw)<=MAX:raise ValueError("Размер HTML")
    p=Tables();p.feed(raw.decode(encoding));p.close()
    text=clean(" ".join(p.text))
    dates=set(re.findall(r"Перечень системно значимых кредитных организаций на\s+(\d{2}\.\d{2}\.\d{4})",text,re.I))
    if len(dates)!=1:raise ValueError("Неоднозначная дата перечня")
    edition=datetime.strptime(dates.pop(),"%d.%m.%Y").date().isoformat()
    matches=[]
    for table in p.tables:
        if table and len(table[0])==3 and "наименование кредитной организации" in table[0][1].lower() and re.fullmatch(r"рег\.\s*№",table[0][2],re.I):matches.append(table[1:])
    if len(matches)!=1:raise ValueError("Таблица перечня не уникальна")
    rows=[];ids=set()
    for i,row in enumerate(matches[0],1):
        if len(row)!=3 or row[0]!=str(i) or not row[1] or not re.fullmatch(r"\d{1,6}",row[2]) or row[2] in ids:raise ValueError("Некорректная строка перечня")
        ids.add(row[2]);rows.append(dict(registration_number=row[2],name=row[1],source_row=i))
    if not 5<=len(rows)<=50:raise ValueError("Неожиданное число организаций")
    return dict(schema=1,source=SOURCE,edition=edition,sha256=hashlib.sha256(raw).hexdigest(),rows=rows,note="Статус системной значимости на дату перечня; не финансовая отчётность и не рейтинг.")
def fetch():
    with urlopen(Request(SOURCE,headers={"User-Agent":"Mozilla/5.0"}),timeout=25) as r:
        from urllib.parse import urlsplit
        u=urlsplit(r.geturl())
        if u.scheme!="https" or u.hostname not in ("www.cbr.ru","cbr.ru") or u.path.rstrip("/").lower()!=urlsplit(SOURCE).path.rstrip("/").lower():raise ValueError("Неожиданный источник")
        return r.read(MAX+1),r.headers.get_content_charset() or "utf-8"

FULL_SOURCE="https://cbr.ru/banking_sector/credit/fullcolist/"
FILE="bank-directory.json"
KINDS={"system":SOURCE,"full":FULL_SOURCE}
HEADERS=("№ п/п","Вид","Регистрационный номер","ОГРН","Наименование","Организационно-правовая форма","Дата регистрации Банком России","Статус лицензии","Местонахождение")
def parse_full(raw,encoding="utf-8"):
    if not 0<len(raw)<=MAX:raise ValueError("Размер HTML")
    p=Tables();p.feed(raw.decode(encoding));p.close()
    text=clean(" ".join(p.text))
    dates=set(re.findall(r"по\s+состоянию\s+на\s+(\d{2}\.\d{2}\.\d{4})\s*\(00:00\s*МСК\)",text,re.I))
    if len(dates)!=1:raise ValueError("Неоднозначная дата полного списка")
    edition=datetime.strptime(dates.pop(),"%d.%m.%Y").date().isoformat()
    tables=[t for t in p.tables if t and tuple(t[0])==HEADERS]
    if len(tables)!=1:raise ValueError("Не найдена точная таблица кредитных организаций")
    rows=[];ids=set()
    for i,r in enumerate(tables[0][1:],1):
        if len(r)!=9 or r[0]!=str(i):raise ValueError("Структура строки "+str(i))
        _,kind,reg,ogrn,name,form,registered,status,_address=r
        if not re.fullmatch(r"\d{1,6}(?:[-–][А-ЯA-Z0-9]+)?",reg,re.I) or reg in ids or not name or ogrn and not re.fullmatch(r"\d{13}",ogrn):raise ValueError("Идентификатор/статус строки "+str(i))
        ids.add(reg)
        if registered:
            registered=datetime.strptime(registered,"%d.%m.%Y").date().isoformat()
        # The exact street address is unnecessary for the analytical directory.
        rows.append(dict(registration_number=reg,ogrn=ogrn or None,name=name,kind=kind or None,legal_form=form or None,registered=registered or None,license_status=status or None,source_row=i))
    if not 100<=len(rows)<=5000:raise ValueError("Неожиданное число записей")
    return dict(schema=1,source=FULL_SOURCE,edition=edition,sha256=hashlib.sha256(raw).hexdigest(),rows=rows,note="Все записи официального списка, в том числе исторические. Статус лицензии не является финансовой оценкой.")
def fetch_full():
    with urlopen(Request(FULL_SOURCE,headers={"User-Agent":"Mozilla/5.0"}),timeout=25) as r:
        from urllib.parse import urlsplit
        u=urlsplit(r.geturl())
        if u.scheme!="https" or u.hostname not in ("www.cbr.ru","cbr.ru") or u.path.rstrip("/").lower()!=urlsplit(FULL_SOURCE).path.rstrip("/").lower():raise ValueError("Неожиданный источник")
        return r.read(MAX+1),r.headers.get_content_charset() or "utf-8"
def empty(kind):
    return dict(source=KINDS[kind],edition=None,sha256=None,rows=[],checked=None,success=None,status="not_loaded")
def quality(d):
    if d.get("schema")!=1 or set(d.get("datasets",{}))!=set(KINDS):raise ValueError("Паспорт банковского каталога")
    for kind,source in KINDS.items():
        x=d["datasets"][kind];rows=x["rows"]
        if x["source"]!=source or x["status"] not in ("not_loaded","unavailable","ok","cached") or not isinstance(rows,list):raise ValueError("Источник/статус")
        if rows:
            if x["status"] not in ("ok","cached") or not x["success"] or not x["checked"] or not re.fullmatch(r"[0-9a-f]{64}",x["sha256"] or "") or not x["edition"]:raise ValueError("Неподтверждённая редакция")
            datetime.strptime(x["edition"],"%Y-%m-%d")
            if not (5<=len(rows)<=50 if kind=="system" else 100<=len(rows)<=5000):raise ValueError("Охват")
        elif x["status"] in ("ok","cached") or any(x.get(k) for k in ("edition","sha256","success")):raise ValueError("Пустой успех")
        ids=set()
        for i,r in enumerate(rows,1):
            reg=r["registration_number"]
            if reg in ids or not re.fullmatch(r"\d{1,6}(?:[-–][А-ЯA-Z0-9]+)?",reg,re.I) or not r["name"] or r["source_row"]!=i:raise ValueError("Строка перечня")
            ids.add(reg)
            if kind=="full" and (r["license_status"] is not None and (not isinstance(r["license_status"],str) or not r["license_status"].strip()) or r["ogrn"] and not re.fullmatch(r"\d{13}",r["ogrn"])):raise ValueError("Поля полного списка")
    a,b=d["datasets"]["system"],d["datasets"]["full"]
    return {"system_bank_records":len(a["rows"]),"credit_organization_records":len(b["rows"]),"credit_organization_active_license":sum(r["license_status"]=="Действующая" for r in b["rows"])}
def publish(out,previous,stamp,refresh,fetchers=None):
    import json
    from datetime import date,timedelta
    d=dict(schema=1,datasets={k:empty(k) for k in KINDS})
    try:
        old=json.loads((previous/FILE).read_text(encoding="utf-8"));quality(old);d=old
        for x in d["datasets"].values():
            if x["rows"]:x["status"]="cached"
    except (OSError,ValueError,TypeError,KeyError):pass
    fetchers=fetchers or {"system":fetch,"full":fetch_full}
    for k,x in d["datasets"].items():
        days=(7 if k=="system" else 1) if x["checked"]==x["success"] else 2
        if not refresh or x["checked"] and date.fromisoformat(stamp[:10])<date.fromisoformat(x["checked"][:10])+timedelta(days=days):continue
        try:
            raw,enc=fetchers[k]();new=(parse if k=="system" else parse_full)(raw,enc)
            if x["edition"] and new["edition"]<x["edition"]:raise ValueError("Более старая редакция")
            if k=="full" and x["rows"] and len(new["rows"])<len(x["rows"])*.9:raise ValueError("Существенное сокращение охвата")
            new.update(status="ok",checked=stamp,success=stamp);d["datasets"][k]=new
        except Exception as e:x.update(status="cached" if x["rows"] else "unavailable",checked=stamp,error=str(e)[:200])
    quality(d);(out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8");return d
