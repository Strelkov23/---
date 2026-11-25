"""Pilot versioned observation contract. Normalizes existing published snapshots,
not original upstream bytes. Sources, units, period semantics and target/fact
distinctions survive conversion. No aggregation or interpolation.
"""
import csv,io,json,hashlib,re
from datetime import date,datetime
from decimal import Decimal,InvalidOperation
from html import escape
from urllib.parse import urlsplit

FILE="normalized-observations.json"
NOTE="Пилот единого формата: опубликованные ряды ЦБ и документальные итоги федерального бюджета. Контрольные суммы относятся к входным файлам сайта, не к исходным файлам поставщика. Показатели цели, факты и документальные снимки не смешиваются."
MAX_BYTES=8_000_000
MAX_ROWS=50000
FIELDS=("dataset","series","title","territory","period","frequency","unit","value","kind","source","source_level","observed_at","published_at","checked_at","success_at","status")

def bounded(path):
    with path.open("rb") as f:raw=f.read(MAX_BYTES+1)
    if not 0<len(raw)<=MAX_BYTES:raise ValueError("Размер входного файла "+path.name)
    return raw

def json_load(raw):
    def unique(pairs):
        d={}
        for k,v in pairs:
            if k in d:raise ValueError("Дублирующееся поле JSON")
            d[k]=v
        return d
    def invalid(value):raise ValueError("Недопустимое число JSON: "+value)
    return json.loads(raw,object_pairs_hook=unique,parse_constant=invalid)

def decimal_value(v):
    if v is None:return None
    if type(v) not in (str,int,float):raise ValueError("Нечисловое наблюдение")
    try:
        if len(str(v))>80:raise ValueError("Слишком длинное число")
        n=Decimal(str(v))
        if not n.is_finite() or abs(n.adjusted())>100:raise ValueError("Некорректное число")
        return format(n,"f")
    except InvalidOperation:raise ValueError("Некорректное число") from None

def period_valid(period,frequency):
    if not isinstance(period,str):return False
    pattern={"annual":r"\d{4}","monthly":r"\d{4}-\d{2}","daily":r"\d{4}-\d{2}-\d{2}"}[frequency]
    if not re.fullmatch(pattern,period):return False
    try:date.fromisoformat(period+{"annual":"-01-01","monthly":"-01","daily":""}[frequency]);return True
    except ValueError:return False

def url_valid(url):
    try:
        p=urlsplit(url)
        return p.scheme in ("http","https") and bool(p.hostname) and p.username is None and p.password is None and p.port in (None,80,443)
    except (ValueError,TypeError):return False

def time_valid(value):
    if value is None:return True
    try:
        return isinstance(value,str) and datetime.fromisoformat(value.replace("Z","+00:00")).tzinfo is not None
    except (ValueError,TypeError):return False

def validate_rows(rows):
    if len(rows)>MAX_ROWS:raise ValueError("Превышен лимит пилота")
    seen=set()
    for r in rows:
        if set(r)!=set(FIELDS):raise ValueError("Несовпадение контракта полей")
        key=tuple(r[k] for k in ("dataset","series","territory","period"))
        if key in seen:raise ValueError("Повтор ключа наблюдения: "+str(key))
        seen.add(key)
        if any(not isinstance(r[k],str) or not r[k].strip() for k in ("dataset","series","title","territory","unit","status")):raise ValueError("Пустые метаданные")
        if r["frequency"] not in ("daily","monthly","annual") or not period_valid(r["period"],r["frequency"]):raise ValueError("Некорректный период")
        if r["kind"] not in ("fact","target","documentary") or r["source_level"] not in ("observation","series","documentary_copy") or not url_valid(r["source"]):raise ValueError("Тип или источник")
        if r["value"] is not None and (not isinstance(r["value"],str) or decimal_value(r["value"])!=r["value"]):raise ValueError("Нечисловое значение")
        for k in ("observed_at","checked_at","success_at"):
            if not time_valid(r[k]):raise ValueError("Дата без часового пояса")
        if r["checked_at"] and r["success_at"] and datetime.fromisoformat(r["success_at"].replace("Z","+00:00"))>datetime.fromisoformat(r["checked_at"].replace("Z","+00:00")):raise ValueError("Успех позже проверки")
        if r["published_at"] is not None and not period_valid(r["published_at"],"daily"):raise ValueError("Дата публикации")

def series_json(raw,dataset,frequency,period_field):
    d=json_load(raw)
    if not isinstance(d,dict):raise ValueError("Ожидался словарь рядов")
    rows=[]
    for code,s in d.items():
        for o in s["values"]:
            explicit=o.get("source")
            rows.append(dict(dataset=dataset,series=code,title=s["title"],territory="Россия",period=o[period_field],frequency=frequency,unit=s["unit"],value=decimal_value(o["value"]),kind="target" if dataset=="national" and code=="CPI_TARGET" else "fact",source=explicit or s["source"],source_level="observation" if explicit else "series",observed_at=o.get("seen"),published_at=None,checked_at=s.get("checked"),success_at=s.get("success"),status=s["status"]))
    return rows

def csv_table(raw,fields):
    reader=csv.DictReader(io.StringIO(raw.decode("utf-8-sig"),newline=""))
    if reader.fieldnames!=list(fields):raise ValueError("Схема CSV изменилась")
    for r in reader:
        if None in r or any(v is None for v in r.values()):raise ValueError("Длина строки CSV")
        yield r

def budget_csv(raw):
    import federal_budget as budget
    rows=[]
    for r in csv_table(raw,budget.CSV_FIELDS):
        if r["metric"] not in budget.METRICS or r["title"]!=budget.METRICS[r["metric"]] or r["article"]!="1":raise ValueError("Неизвестная статья или показатель бюджета")
        if Decimal(r["original_thousand_rub"])/Decimal(1000000)!=Decimal(r["value_billion_rub"]):raise ValueError("Несовпадение единиц")
        rows.append(dict(dataset="budget_law",series=r["metric"],title=r["title"],territory="Федеральный бюджет РФ",period=r["year"],frequency="annual",unit="млрд руб.",value=decimal_value(r["value_billion_rub"]),kind="documentary",source=r["source"],source_level="documentary_copy",observed_at=None,published_at=None,checked_at=None,success_at=None,status=r["method"]+"; дата закона "+r["law_date"]+"; не дата публикации"))
    return rows

def collect(out,stamp):
    specs=(("cbr.json","cbr",lambda raw:series_json(raw,"cbr","daily","date")),("national.json","national",lambda raw:series_json(raw,"national","monthly","period")),("federal-budget.csv","budget_law",budget_csv))
    rows=[];inputs=[]
    for filename,code,adapter in specs:
        raw=bounded(out/filename);items=adapter(raw);validate_rows(items)
        inputs.append(dict(file=filename,dataset=code,sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),observations=len(items),numeric=sum(r["value"] is not None for r in items),series=len({r["series"] for r in items}),scope="published_snapshot"))
        rows.extend(items)
    validate_rows(rows)
    rows.sort(key=lambda r:(r["dataset"],r["series"],r["territory"],r["period"]))
    return dict(schema=1,built=stamp,note=NOTE,inputs=inputs,rows=rows)

def quality(data,out):
    if data!=collect(out,data["built"]):raise ValueError("Нормализованный набор не совпадает с входными файлами")
    return dict(normalized_sources=len(data["inputs"]),normalized_observations=len(data["rows"]),normalized_numeric=sum(r["value"] is not None for r in data["rows"]))

def render(d):
    e=lambda v:escape(str(v),quote=True)
    body='<section class="mast"><p class="kicker">Контроль данных · этап А</p><h1>Единый формат наблюдений</h1><p>'+e(NOTE)+'</p><p><a href="'+FILE+'">Скачать нормализованные наблюдения JSON</a> · <a href="data-registry.html">Каталог показателей</a> · <a href="freshness.html">Актуальность</a> · <a href="reproducibility.html">Контрольные суммы</a></p></section>'
    body+='<section><h2>Проверенные входные наборы</h2><div class="table-scroll" tabindex="0"><table><thead><tr><th>Набор</th><th>Рядов</th><th>Наблюдений</th><th>Числовых</th><th>SHA-256 файла сайта</th></tr></thead><tbody>'
    for r in d["inputs"]:
        body+='<tr><td><a href="'+e(r["file"])+'">'+e(r["file"])+'</a></td>'+''.join('<td>'+e(r[k])+'</td>' for k in ("series","observations","numeric"))+'<td><code>'+e(r["sha256"])+'</code></td></tr>'
    return body+'</tbody></table></div><p>Схема 1: идентификатор набора и ряда, территория, период, частота, единица, точная десятичная строка или null, вид наблюдения, источник, даты и статус. Даты импорта не означают даты публикации. Записи разных наборов не складываются. Пропуск не равен нулю.</p></section>'

def publish(page,out,stamp):
    d=collect(out,stamp);quality(d,out)
    (out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
    page("normalized-data.html",render(d))
    return d
