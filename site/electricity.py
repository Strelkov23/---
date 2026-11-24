"""SO UPS annual system summaries. No inference of trade from energy residual."""
import csv,json,re,math
from html.parser import HTMLParser
from datetime import datetime,timedelta,timezone
from urllib.request import Request,urlopen
from urllib.parse import urlsplit
from decimal import Decimal as D
BASE="https://www.so-ups.ru/functioning/ups/ups"
SCOPE={"all":"Энергосистема России (охват СО ЕЭС)","ues":"ЕЭС России","isolated":"ТИТЭС"}
LABELS={"generation":"Выработка","consumption":"Потребление","capacity":"Установленная мощность на 1 января следующего года"}
UNITS={"generation":"ТВт·ч","consumption":"ТВт·ч","capacity":"ГВт"}
def source(y):return BASE+str(y+1)+"/"
def record(y,g,c,p,mode="document"):
    rows=[]
    for i,(k,title) in enumerate(SCOPE.items()):
        v={"generation":g[i],"consumption":c[i],"capacity":p[i]}
        if any(not math.isfinite(x) or x<=0 for x in v.values()):raise ValueError("Invalid magnitude")
        rows.append(dict(year=y,scope=k,title=title,values=v,source=source(y),mode=mode))
    # Published totals rounded to 0.1. Accept up to 0.2 in sum of two rounded parts.
    for key in LABELS:
        if abs(D(str(rows[0]["values"][key]))-D(str(rows[1]["values"][key]))-D(str(rows[2]["values"][key])))>D(".2"):raise ValueError("Scope sum mismatch "+key)
    return rows
def seed():
    return record(2024,[1196.9,1180.7,16.2],[1190.2,1174.1,16.2],[269.1,263.7,5.4])+record(2025,[1182.4,1166.5,16.0],[1177.3,1161.3,16.0],[270.3,264.9,5.5])
class Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.parts=[];self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in ("script","style"):self.skip+=1
    def handle_endtag(self,tag):
        if tag in ("script","style") and self.skip:self.skip-=1
    def handle_data(self,s):
        if not self.skip:self.parts.append(s)
def parse(html,y):
    p=Text();p.feed(html);s=" ".join(" ".join(p.parts).split()).replace("∙","·").replace("⋅","·")
    n=r"([0-9][0-9 ]*,[0-9])"
    energy=r"\s*млрд\s*кВт\s*[·]\s*ч"
    power=r"\s*тыс\.\s*МВт"
    def group(prefix,unit):
        pattern=prefix+n+unit+r",\s*в том числе\s*в?\s*ЕЭС России\s*[-–—]\s*"+n+unit+r",\s*в?\s*ТИТЭС\s*[-–—]\s*"+n+unit
        found=re.findall(pattern,s,re.I)
        if len(found)!=1:raise ValueError("Не распознан однозначный годовой блок: "+prefix[:50])
        return [float(x.replace(" ","").replace(",",".")) for x in found[0]]
    g=group(r"В "+str(y)+r" году электростанции энергосистемы России выработали\s+",energy)
    c=group(r"Потребление электроэнергии в энергосистеме России в "+str(y)+r" году составило\s+",energy)
    p=group(r"На 1 января "+str(y+1)+r" года общая установленная мощность электростанций энергосистемы России составила\s+",power)
    return record(y,g,c,p,"direct")
def fetch(y):
    with urlopen(Request(source(y),headers={"User-Agent":"EconomicsMonitor/2.0"}),timeout=20) as f:
        u=urlsplit(f.geturl())
        if u.scheme!="https" or u.hostname not in ("so-ups.ru","www.so-ups.ru"):raise ValueError("Unexpected redirect")
        raw=f.read(3_000_001);encoding=f.headers.get_content_charset() or "utf-8"
    if len(raw)>3_000_000:raise ValueError("Response too large")
    return parse(raw.decode(encoding),y)
def sync(db,stamp,refresh):
    db.execute("create table if not exists electricity_year(year integer primary key,checked text,success text,status text,payload text)")
    current=int(stamp[:4])-1
    # Only the completed year and previous year; retain any archived years forever.
    if refresh:
        for y in range(max(2024,current-1),current+1):
            prev=db.execute("select checked from electricity_year where year=?",(y,)).fetchone()
            if prev and datetime.fromisoformat(stamp)-datetime.fromisoformat(prev[0])<timedelta(days=14):continue
            try:
                rows=fetch(y)
                with db:db.execute("insert or replace into electricity_year values(?,?,?,?,?)",(y,stamp,stamp,"Прямой импорт",json.dumps(rows,ensure_ascii=False)))
            except Exception as e:
                with db:db.execute("insert into electricity_year values(?,?,null,?,null) on conflict(year) do update set checked=excluded.checked,status=excluded.status",(y,stamp,"Ошибка: "+str(e)[:180]))
    rows={(r["year"],r["scope"]):r for r in seed()}
    checks=[]
    for y,checked,success,status,payload in db.execute("select * from electricity_year order by year"):
        checks.append(dict(year=y,checked=checked,success=success,status=status,source=source(y)))
        if payload:
            for r in json.loads(payload):rows[r["year"],r["scope"]]=r
    return dict(rows=sorted(rows.values(),key=lambda r:(r["year"],list(SCOPE).index(r["scope"]))),checks=checks,labels=LABELS,units=UNITS,scopes=SCOPE,notes="Официальные годовые HTML-сводки СО ЕЭС; документальные значения 2024–2025, прямой импорт заменяет их только при строгом совпадении структуры. Охват и территориальная конфигурация могут изменяться.")
def publish(page,out,data):
    (out/"electricity.json").write_text(json.dumps(data,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"electricity.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.writer(f);w.writerow(["year","scope","indicator","value","unit","source","mode"])
        for r in data["rows"]:
            for k,v in r["values"].items():w.writerow([r["year"],r["scope"],k,v,UNITS[k],r["source"],r["mode"]])
    page("electricity.html",'<section class="mast"><h1>Электроэнергетика: годовые ресурсы и потребление</h1><p>Официальные годовые сводки Системного оператора. Энергосистема России в его охвате включает ЕЭС и технологически изолированные территориальные энергосистемы (ТИТЭС). <a href="'+source(2025)+'">Сводка 2025 года</a> · <a href="'+source(2024)+'">Сводка 2024 года</a> · <a href="electricity.csv">CSV</a> · <a href="methodology.html#electricity-method">Методика</a>.</p><p>ТВт·ч = млрд кВт·ч; ГВт = тыс. МВт. Выработка и потребление — годовые объёмы; мощность — запас на конец года, не произведённая энергия. Разность выработки и потребления не идентифицируется автоматически как экспорт. Не складывать итог и вложенные системы.</p><p id="electric-status" role="status">Загрузка…</p><div id="electric-checks"></div></section><section><h2>Годовая динамика</h2><label class="builder-control">Охват<select id="electric-scope"></select></label><div id="electric-table" class="table-scroll" tabindex="0" role="region" aria-label="Энергетические показатели"></div><div id="electric-chart"></div></section><section><h2>Условная годовая потребность в генерации</h2><p>Сценарий изменения годовой выработки и потребления при сохранении исходной разности как условного внешнего сальдо. Это не расчёт почасового режима, резерва мощности, потерь, перетоков или надёжности. Дополнительно — средняя требуемая мощность за календарный год (ГВт), не пиковая нагрузка.</p><label class="builder-control">Базовый год<select id="electric-year"></select></label><label class="builder-control">Изменение выработки, %<input id="electric-g" type="number" min="-100" max="300" step="any" value="0"></label><label class="builder-control">Изменение потребления, %<input id="electric-c" type="number" min="-100" max="300" step="any" value="0"></label><button id="electric-run" disabled>Рассчитать</button><p id="electric-result" role="status"></p><button id="electric-export" disabled>Скачать расчёт CSV</button></section><script defer src="provenance.js"></script><script defer src="electricity.js"></script>')
