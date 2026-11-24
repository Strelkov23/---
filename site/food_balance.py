"""FAOSTAT FBS 2010+; exact country/item/element keys and source flags.
Seed is a separately identified documentary replica; successful bulk import replaces it."""
import csv,io,json,zipfile,math,hashlib
from datetime import datetime,timedelta,timezone
from urllib.request import urlopen,Request
from urllib.parse import urlsplit
from collections import defaultdict
SOURCE="https://bulks-faostat.fao.org/production/FoodBalanceSheets_E_All_Data_(Normalized).zip"
META="https://www.fao.org/faostat/en/#data/FBS/metadata"
REPLICA="https://croparc.com/countries/russia/food-self-sufficiency"
ITEMS={"2905":"Зерновые (без пива)","2907":"Крахмалистые корнеплоды","2918":"Овощи","2919":"Фрукты (без вина)","2943":"Мясо","2948":"Молоко (без масла)","2960":"Рыба и морепродукты"}
ELEMENTS={"5511":"production","5611":"imports","5911":"exports","5072":"stock_change","5301":"supply","5521":"feed","5527":"seed","5123":"losses","5131":"processing","5154":"other","5170":"residual","5142":"food","5171":"tourism"}
CORE=("production","imports","exports","stock_change","supply")
LABELS={"production":"Производство","imports":"Импорт","exports":"Экспорт","stock_change":"Изменение запасов (+ накопление)","supply":"Внутреннее предложение","feed":"Корма","seed":"Семена","losses":"Потери","processing":"Переработка","other":"Непродовольственное использование","residual":"Статистический остаток","food":"Продовольственное использование","tourism":"Потребление туристов"}
# Only the five supply components; published replica accessed 2026-11-24, flags E.
SEED=[
("2905",2021,117759,1437,36621,526,82050),
("2905",2022,153352,881,27606,31551,95076),
("2905",2023,136665,700,40566,10400,86400),
("2907",2021,18296,927,193,-1502,20532),
("2907",2022,18888,818,129,-1507,21084),
("2907",2023,19374,445,182,-1185,20822),
("2918",2023,15630,3050,462,2,18217),
("2919",2023,4789,7169,194,-4,11769),
("2943",2023,12507,362,446,-7,12430),
("2948",2023,33805,4141,1903,-564,36607),
("2960",2023,5456,978,2634,0,3799)]
def seed():
    return [dict(code=c,title=ITEMS[c],year=y,values=dict(zip(CORE,v)),flags={k:"E" for k in CORE},notes={},source=REPLICA) for c,y,*v in SEED]
def parse(raw):
    groups={}
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        candidates=[i for i in z.infolist() if i.filename.rsplit("/",1)[-1].lower().startswith("foodbalancesheets_e_all_data") and i.filename.lower().endswith(".csv")]
        if len(candidates)!=1 or candidates[0].file_size>900_000_000:raise ValueError("Unexpected FAOSTAT archive layout")
        with z.open(candidates[0]) as f:
            reader=csv.DictReader(io.TextIOWrapper(f,encoding="utf-8-sig",errors="strict",newline=""))
            required={"Area","Element Code","Year","Unit","Value","Flag"}
            if not required<=set(reader.fieldnames or []):raise ValueError("FAOSTAT schema changed")
            item_field="Item Code (FBS)" if "Item Code (FBS)" in reader.fieldnames else "Item Code"
            if item_field not in reader.fieldnames:raise ValueError("Missing FBS item code")
            for r in reader:
                code=r[item_field].removeprefix("S")
                if r["Area"]!="Russian Federation" or code not in ITEMS or r["Element Code"] not in ELEMENTS:continue
                if r["Unit"]!="1000 t":raise ValueError("Unexpected unit "+r["Unit"])
                y=int(r["Year"]);c=code;k=ELEMENTS[r["Element Code"]]
                if y<2010 or y>datetime.now(timezone.utc).year:raise ValueError("Unexpected year")
                if not r["Value"].strip():continue
                v=float(r["Value"])
                if not math.isfinite(v) or (k not in ("stock_change","residual","tourism") and v<0):raise ValueError("Invalid physical quantity")
                row=groups.setdefault((c,y),dict(code=c,title=ITEMS[c],year=y,values={},flags={},notes={},source=SOURCE))
                if k in row["values"]:raise ValueError("Duplicate FAOSTAT key")
                row["values"][k]=v;row["flags"][k]=r["Flag"];row["notes"][k]=r.get("Note") or ""
    if set(c for c,y in groups)!=set(ITEMS) or len(groups)<35:raise ValueError("Insufficient country coverage")
    rows=sorted(groups.values(),key=lambda r:(r["code"],r["year"]))
    validate_coverage(rows)
    return rows
def observations(rows):
    return {(r["code"],r["year"],k) for r in rows for k in r["values"]}

def validate_coverage(rows,previous=None):
    """Conservative completeness gate; do not silently discard published observations."""
    complete={c:set() for c in ITEMS}
    for r in rows:
        if r["code"] in complete and all(k in r["values"] for k in CORE):
            complete[r["code"]].add(r["year"])
    for c,years in complete.items():
        if len(years)<5:
            raise ValueError("FBS: fewer than five complete resource balances for "+c)
    if previous is not None:
        removed=observations(previous)-observations(rows)
        if removed:
            raise ValueError("FBS: revision removes "+str(len(removed))+" previously published observations; review required")

def due(old,stamp):
    if not old or not old[0]:
        return True
    days=14 if old[1]==old[0] else 1
    return datetime.fromisoformat(stamp)>=datetime.fromisoformat(old[0])+timedelta(days=days)

def fetch():
    with urlopen(Request(SOURCE,headers={"User-Agent":"EconomicsMonitor/2.0"}),timeout=60) as f:
        if urlsplit(f.geturl()).hostname!="bulks-faostat.fao.org":raise ValueError("Unexpected redirect")
        raw=f.read(100_000_001)
    if len(raw)>100_000_000:raise ValueError("FAOSTAT download exceeds bound")
    return parse(raw),hashlib.sha256(raw).hexdigest()
def sync(db,stamp,refresh):
    db.execute("create table if not exists fbs_snapshot(id integer primary key check(id=1),checked text,success text,status text,payload text,hash text)")
    old=db.execute("select checked,success,status,payload,hash from fbs_snapshot where id=1").fetchone()
    if refresh and due(old,stamp):
        try:
            rows,h=fetch()
            validate_coverage(rows,json.loads(old[3]) if old and old[3] else None)
            with db:db.execute("insert or replace into fbs_snapshot values(1,?,?,?,?,?)",(stamp,stamp,"Получен архив FAOSTAT",json.dumps(rows,ensure_ascii=False),h))
        except Exception as e:
            with db:db.execute("insert into fbs_snapshot values(1,?,null,?,null,null) on conflict(id) do update set checked=excluded.checked,status=excluded.status",(stamp,"Ошибка: "+str(e)[:180]))
    old=db.execute("select checked,success,status,payload,hash from fbs_snapshot where id=1").fetchone()
    return dict(rows=json.loads(old[3]) if old and old[3] else seed(),mode="official_archive" if old and old[3] else "replica_seed",checked=old[0] if old else None,success=old[1] if old else None,status=old[2] if old else "Ожидается первая загрузка FAOSTAT",archive_sha256=old[4] if old else None,source=SOURCE,metadata=META,replica=REPLICA,labels=LABELS,unit="1000 t")
def quality(data,csv_path,max_year):
    """Audit the published JSON/CSV pair. Missing optional observations remain missing."""
    if data.get("mode") not in ("official_archive","replica_seed") or data.get("unit")!="1000 t":
        raise ValueError("FBS: invalid mode or unit")
    if data["mode"]=="official_archive" and (not data.get("success") or not isinstance(data.get("archive_sha256"),str) or len(data["archive_sha256"])!=64 or any(ch not in "0123456789abcdef" for ch in data["archive_sha256"])):
        raise ValueError("FBS: missing source archive provenance")
    expected={};seen=set();complete=0;discrepant=0;missing_use=0
    for r in data["rows"]:
        c,y=r["code"],r["year"]
        if c not in ITEMS or type(y) is not int or not 2010<=y<=max_year or (c,y) in seen or r["title"]!=ITEMS[c]:
            raise ValueError("FBS: invalid or duplicate product-year")
        seen.add((c,y));v=r["values"];flags=r["flags"];notes=r["notes"]
        if not v or set(v)!=set(flags) or not set(notes)<=set(v):
            raise ValueError("FBS: inconsistent flags or notes")
        source=SOURCE if data["mode"]=="official_archive" else REPLICA
        if r["source"]!=source:
            raise ValueError("FBS: inconsistent source provenance")
        for k,x in v.items():
            if k not in LABELS or type(x) not in (int,float) or not math.isfinite(x) or (k not in ("stock_change","residual","tourism") and x<0) or not isinstance(flags[k],str) or not isinstance(notes.get(k,""),str):
                raise ValueError("FBS: invalid value, flag or note")
            expected[(c,str(y),k)]=(r["title"],str(x),data["unit"],flags[k],notes.get(k,""),source,data["mode"])
        if all(k in v for k in CORE):
            complete+=1
            discrepant+=abs(v["production"]+v["imports"]-v["exports"]-v["stock_change"]-v["supply"])>3
        missing_use+=any(k not in v for k in ("feed","seed","losses","processing","other","food"))
    if set(c for c,y in seen)!=set(ITEMS):
        raise ValueError("FBS: missing product group")
    if data["mode"]=="official_archive":
        validate_coverage(data["rows"])
    with csv_path.open(encoding="utf-8-sig",newline="") as fh:
        reader=csv.DictReader(fh)
        if reader.fieldnames!=["code","product","year","element","value","unit","flag","note","source","mode"]:
            raise ValueError("FBS: invalid CSV header")
        actual={}
        for r in reader:
            key=(r["code"],r["year"],r["element"])
            if key in actual:
                raise ValueError("FBS: duplicate CSV observation")
            actual[key]=tuple(r[k] for k in ("product","value","unit","flag","note","source","mode"))
    if actual!=expected:
        raise ValueError("FBS: JSON/CSV mismatch")
    counts={"fbs_product_years":len(seen),"fbs_observations":len(expected),"fbs_complete_resource_balances":complete,"fbs_resource_discrepancies":discrepant,"fbs_incomplete_use":missing_use}
    warnings=[]
    if data["mode"]=="replica_seed":warnings.append("FAOSTAT: используется ограниченная документальная реплика, прямой импорт не подтверждён")
    if discrepant:warnings.append("FAOSTAT: ресурсное расхождение выше 3 тыс. т: "+str(discrepant))
    if complete<len(seen):warnings.append("FAOSTAT: неполные ресурсные балансы: "+str(len(seen)-complete))
    if missing_use:warnings.append("FAOSTAT: неполная детализация использования: "+str(missing_use))
    if data.get("checked")!=data.get("success"):warnings.append("FAOSTAT: последняя попытка не является успешной загрузкой")
    return counts,warnings

def publish(page,out,data):
    (out/"food-balance.json").write_text(json.dumps(data,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"food-balance.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.writer(f);w.writerow(["code","product","year","element","value","unit","flag","note","source","mode"])
        for r in data["rows"]:
            for k,v in r["values"].items():w.writerow([r["code"],r["title"],r["year"],k,v,data["unit"],r["flags"].get(k),r["notes"].get(k),r["source"],data["mode"]])
    page("food-balance.html",'<section class="mast"><h1>Натуральные продовольственные балансы</h1><p>Россия, FAOSTAT Food Balances (2010–), семь групп продукции. Величины в тысячах тонн в определениях FAO, не денежные коэффициенты и не баланс Росстата. <a href="'+META+'">Метаданные FAO</a> · <a href="'+SOURCE+'">Архив FAOSTAT</a> · <a href="https://rosstat.gov.ru/enterprise_economy/">Балансы Росстата</a> · <a href="food-balance.csv">CSV</a> · <a href="methodology.html#food-balance-method">Методика</a></p><p id="fbs-status" role="status">Загрузка…</p></section><section><h2>Ресурсы и использование</h2><label class="builder-control">Группа<select id="fbs-item"></select></label><label class="builder-control">Год<select id="fbs-year"></select></label><div id="fbs-table" class="table-scroll" tabindex="0" role="region" aria-label="Натуральный баланс"></div><p id="fbs-check"></p><p>Положительное изменение запасов означает накопление. Проверка: P + M − X − ΔS − D. Погрешность до 3 тыс. т допускается как экран округления; это не доказательство точности. Отсутствующие направления использования не считаются нулём. Флаги FAO сохранены: E — оценка, I — импутация, A — официальный показатель; прочие коды см. метаданные.</p></section><section><h2>Динамика и внешняя торговля</h2><p>Для выбранной выше группы: производство, импорт, экспорт и внутреннее предложение; отдельно три отношения объёмов. Производство / предложение, импорт / предложение и экспорт / производство умножаются на 100. Это не доли происхождения потреблённых товаров: показатели могут превышать 100% и не обязаны суммироваться до 100%. При нулевом знаменателе или отсутствии значения — прочерк.</p><p id="fbs-trend-status" role="status"></p><div id="fbs-trend-chart"></div><div id="fbs-trend" class="table-scroll" tabindex="0" role="region" aria-label="Годовые показатели продовольственного баланса"></div><button id="fbs-trend-export" disabled>Скачать динамику и флаги CSV</button></section><section><h2>Сценарий обеспеченности</h2><p>Выберите изменения производства, импорта, экспорта и внутренней потребности. Изменение запасов фиксировано на исходном уровне; абсолютные запасы неизвестны. Разность предложения и потребности — условный баланс, не прогноз дефицита в магазинах.</p><div id="fbs-inputs"></div><button id="fbs-run" disabled>Рассчитать</button><p id="fbs-result" role="status"></p><button id="fbs-export" disabled>Скачать сценарий CSV</button></section><script defer src="provenance.js"></script><script defer src="chart-export.js"></script><script defer src="food-balance.js"></script>')
