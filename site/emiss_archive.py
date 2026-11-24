"""Import public annual EMISS archives from the NSSED repository.
Do not conflate dimensions (OKVED, territory definitions, etc.) or invent units.
The exact download URI is recorded and the publisher's original metadata is linked.
"""
import csv,gzip,io,re,hashlib,json
from urllib.parse import urlsplit,unquote
from datetime import date
from collections import defaultdict

BASE="https://storage.yandexcloud.net/datalakeiepru-s3-storage-public/fedstatru/csv/"
SPECS={
 "61483":("ВРП на душу населения (ОКВЭД 2)","Росстат","рубль"),
 "36057":("Доля городского населения на 1 января","Росстат","процент"),
 "60421":("Доля малого и среднего предпринимательства в ВРП","Росстат","процент"),
 "45454":("Введённые жилые помещения на 1000 человек населения","Росстат",None),
 "59049":("Индекс физического объёма инвестиций в основной капитал","Росстат","процент"),
 "58441":("Исполненные расходы консолидированного бюджета субъекта и территориального государственного внебюджетного фонда","Казначейство России","рубль"),
}
def normalize(x):return " ".join(str(x or "").lower().replace("ё","е").split())
def resource(code):return BASE+code+".csv.gz"
def card(code):return "https://repository.nsedc.ru/dataset/emiss_"+code
def primary(code):return "https://fedstat.ru/indicator/"+code
def resource_candidates(code,get):
    # Prefer exact resource URLs from the public CKAN catalogue. Fall back to the documented
    # storage paths; availability is established only by downloading a valid file.
    urls=[]
    try:
        raw,_=get("https://repository.nsedc.ru/api/3/action/package_show?id=emiss_"+code,2_000_000)
        data=json.loads(raw)
        package=data.get("result",{})
        if data.get("success") and package.get("name")=="emiss_"+code:
            for item in package.get("resources",[]):
                url=item.get("url","")
                u=urlsplit(url)
                filename=unquote(u.path.rsplit("/",1)[-1])
                if u.scheme=="https" and u.hostname in ("storage.yandexcloud.net","datalakeiepru-s3-storage-public.storage.yandexcloud.net") and filename in (code+".csv.gz",code+".parquet"):
                    urls.append(url)
    except Exception:
        pass
    urls.extend((resource(code),"https://datalakeiepru-s3-storage-public.storage.yandexcloud.net/fedstatru/data/parquet/"+code+".parquet"))
    return list(dict.fromkeys(urls))
def retrieve(code,get,numeric,year):
    errors=[]
    for url in resource_candidates(code,get):
        try:
            raw,_=get(url,24_000_000)
            rows=parse(raw,code,numeric,year)
            if raw[:4]==b"PAR1":
                for row in rows:row["sheet"]=code+".parquet";row["row"]=max(1,row["row"]-1)
            return rows,url
        except Exception as err:errors.append(url.rsplit("/",1)[-1]+": "+str(err)[:90])
    raise ValueError("; ".join(errors)[:250])

def parse(raw,code,numeric,year):
    if raw[:4]==b'PAR1':
        import pyarrow.parquet as pq
        parquet=pq.ParquetFile(io.BytesIO(raw))
        if parquet.metadata.num_rows>100000 or parquet.metadata.num_columns>100:raise ValueError('Превышен размер Parquet')
        table=parquet.read()
        buf=io.StringIO();writer=csv.DictWriter(buf,fieldnames=table.column_names,delimiter=';');writer.writeheader();writer.writerows(table.to_pylist())
        return parse(gzip.compress(buf.getvalue().encode('utf-8')),code,numeric,year)
    if raw[:2]!=b'\x1f\x8b':raise ValueError('Ответ не является CSV.GZ или Parquet')
    title,agency,expected_unit=SPECS[code]
    with gzip.GzipFile(fileobj=io.BytesIO(raw)) as stream:
        body=stream.read(40_000_001)
    if len(body)>40_000_000:raise ValueError("Превышен размер распакованных данных")
    for encoding in ("utf-8-sig","cp1251"):
        try:txt=body.decode(encoding);break
        except UnicodeDecodeError:continue
    else:raise ValueError("Неизвестная кодировка")
    try:dialect=csv.Sniffer().sniff(txt[:16000],delimiters=";,\t")
    except csv.Error:raise ValueError("Неизвестный разделитель CSV")
    reader=csv.DictReader(io.StringIO(txt),dialect=dialect)
    cols=reader.fieldnames or []
    if len(cols)!=len(set(cols)):raise ValueError("Неоднозначные заголовки")
    def field(names):
        return next((c for c in cols if normalize(c) in names),None)
    territory=field({"region","region_name","territory","territory_name","окато","окато наименование","окато (наименование)","регион","территория","наименование территории","субъект российской федерации","справочник регионов","классификатор объектов административно-территориального деления (окато)","классификатор объектов административно-территориального деления"})
    period=field({"year","год","period","период","time_period","time","date","дата","период наблюдения"})
    value=field({"value","значение","obs_value","indicator_value","data","значение показателя","obsvalue"})
    unit=field({"unit","units","unit_name","единица измерения","единицы измерения","единица"})
    if not all((territory,period,value)):raise ValueError("Не распознаны обязательные поля: "+", ".join(cols)[:200])
    if not unit and not expected_unit:raise ValueError("Отсутствует единица измерения")
    result=[]
    for r in reader:
        reg=str(r.get(territory) or "").strip()
        if not reg or not re.search(r"[А-Яа-яЁё]",reg):continue
        p=str(r.get(period) or "").strip()
        y=year(p)
        if not y:
            m=re.fullmatch(r"(19[89]\d|20[0-2]\d)(?:-01-01(?: 00:00:00)?|\.0)",p)
            y=int(m[1]) if m else None
        if not y or y>date.today().year:continue
        v=numeric(r.get(value))
        u=str(r.get(unit) or expected_unit or "").strip()
        if v is None or not u:continue
        # Keep every non-empty extra dimension separate. Never combine industries or territory codes.
        dims={c:str(r.get(c) or "").strip() for c in cols if c not in (territory,period,value,unit) and str(r.get(c) or "").strip()}
        # A separate frequency column must explicitly describe an annual observation.
        if any(normalize(k) in ("frequency","частота","периодичность","месяц","month","квартал","quarter") and normalize(val) not in ("год","годовая","годовой","annual","a","year","январь-декабрь","всего за год") for k,val in dims.items()):continue
        # Observation notes and territory IDs are retained as notes, not mistaken for economic dimensions.
        attrs={k:val for k,val in dims.items() if not re.search(r"(примечан|комментар|note|comment|окато.*код|код.*окато|region_id|region_code|territory_code|territory_id|status|статус)",normalize(k))}
        suffix=" · ".join(k+": "+val for k,val in sorted(attrs.items()))
        label=title+(" · "+suffix if suffix else "")
        key="E_"+code+"_"+hashlib.sha256((suffix+"|"+u).encode()).hexdigest()[:12]
        result.append(dict(indicator=key,title=label,region=reg,year=y,value=v,unit=u,sheet=code+".csv.gz",row=reader.line_num,column=cols.index(value)+1,note="; ".join(k+": "+val for k,val in dims.items())+" · Первоисточник: "+primary(code)+" · Карточка: "+card(code)))
        if len(result)>100000:raise ValueError("Слишком много наблюдений")
    if not result:raise ValueError("Нет однозначных годовых наблюдений")
    return result
