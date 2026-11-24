"""Lightweight metadata index of published datasets; no AI, external calls or invented observations."""
import csv
import method_passports
import json
from collections import defaultdict
from urllib.parse import urlencode

def load(out,name):
    return json.loads((out/name).read_text(encoding="utf-8"))

def bounds(values):
    periods=sorted(str(x) for x in values if x is not None and str(x))
    return (periods[0],periods[-1]) if periods else (None,None)

def route(page,**params):
    return page+("?"+urlencode(params) if params else "")

def make(out):
    rows=[]
    def add(group,code,title,unit,frequency,territory,count,first,last,source,checked,success,status,mode,page,file,note="",classification=""):
        if not source or not title or count<0:raise ValueError("Incomplete registry entry: "+str(code))
        rows.append(dict(id=group+":"+str(code),group=group,code=str(code),title=title,unit=unit,frequency=frequency,territory=territory,count=count,first=first,last=last,source=source,checked=checked,success=success,status=status or "Статус проверки не указан",mode=mode,page=page,file=file,note=note,classification=classification))
    comp,cat=load(out,"compare.json"),load(out,"catalog.json")
    for code,m in cat.items():
        v=comp.get(code,{}).get("values",{});v={k:x for k,x in v.items() if x is not None};first,last=bounds(v)
        add("wdi",code,m["title"],m["unit"],"годовая","Россия",len(v),first,last,m["source"],m.get("checked"),m.get("success"),m.get("status"),"auto","indicators.html","compare.json",m.get("theme",""),"WDI")
    for filename,group in (("national.json","national"),("cbr.json","cbr")):
        for code,m in load(out,filename).items():
            vals=[r for r in m["values"] if r.get("value") is not None];periods=[r.get("period") or r.get("date") for r in vals];first,last=bounds(periods)
            lengths={len(str(p)) for p in periods if p}
            freq={4:"годовая",7:"месячная",10:"даты наблюдений"}.get(next(iter(lengths)),"иная") if len(lengths)==1 else "см. исходный ряд"
            add(group,code,m["title"],m["unit"],freq,"Россия",len(vals),first,last,m["source"],m.get("checked"),m.get("success"),m.get("status"),"auto","national.html",filename,m.get("definition",""))
    hist=load(out,"historical.json")
    # Source catalogue checks may have a different URL than the underlying file.
    # Do not assign a check from a similar title or a parent site.
    by_source=defaultdict(list)
    for s in hist["sources"]:by_source[s["url"]].append(s)
    for m in hist["series"]:
        matches=by_source.get(m["source"],[]);s=matches[0] if len(matches)==1 else {}
        mode="manual" if m["code"].startswith("NW_") or "транскрипция" in m.get("kind","").lower() else "auto"
        status=s.get("status") or "Нет однозначно связанной проверки; см. паспорт ряда"
        add("regional",m["code"],m["title"],m["unit"],"годовая или период источника",str(m.get("regions","—"))+" территорий",m["count"],str(m["first"]),str(m["last"]),m["source"],s.get("checked"),s.get("success"),status,mode,route("historical.html",**{"hist-series":m["code"]}),m["file"],m.get("kind","")+"; проверка только при точном совпадении URL")
    ind=load(out,"industrial.json");sources={s["url"]:s for s in ind["sources"]}
    for m in ind["series"]:
        vals=[r for r in m["values"] if r.get("value") is not None];first,last=bounds(r["period"] for r in vals);s=sources.get(m["source"],{})
        add("industry",m["id"],m["title"],m["unit"],m["frequency"],m.get("territory","Россия"),len(vals),first,last,m["source"],s.get("checked"),s.get("success"),s.get("status"),"auto",route("industrial.html",**{"ind-series":m["id"]}),"industrial.json",m["kind"]+" · "+m.get("definition","")+" · Лист: "+m.get("sheet",""),m.get("classification","")+" "+m.get("code",""))
    capital=load(out,"capital-data.json")
    # A row is an indicator series, not a duplicated observation. Keep each unit separate.
    for key,group,metrics in (
        ("assets","capital",(("stock_mrub","Полная учётная стоимость фондов","млн руб."),("wear_pct","Износ","%"),("renewal_pct","Обновление","%"),("disposal_pct","Выбытие","%"),("volume_index","Индекс физического объёма","%"))),
        ("capacity","capacity",(("utilization_pct","Загрузка среднегодовой мощности","%"),))):
        grouped=defaultdict(list)
        for r in capital[key]:grouped[r["code"]].append(r)
        for code,items in grouped.items():
            for field,label,unit in metrics:
                vals=[x for x in items if x.get(field) is not None];first,last=bounds(x["year"] for x in vals)
                add(group,code+"."+field,items[0]["title"]+" — "+label,unit,"годовая","Россия",len(vals),first,last,capital["source"],None,None,"Ручная текстовая транскрипция "+capital["transcribed"]+"; визуальная сверка не подтверждена","manual","capital.html","fixed-assets.csv" if group=="capital" else "capacity-utilization.csv",items[0].get("coverage",""),"ОКВЭД2" if group=="capital" else "Продукты, наименования источника")
    fin=load(out,"finance-data.json")
    grouped=defaultdict(list)
    for r in fin["rows"]:grouped[(r["code"],r["metric"])].append(r)
    for (code,metric),items in grouped.items():
        vals=[r for r in items if r["value"] is not None];first,last=bounds(r["year"] for r in vals)
        add("finance",code+"."+metric,items[0]["title"]+" — "+fin["metrics"][metric]["title"],"%","годовая","Россия",len(vals),first,last,fin["source"],None,None,fin["status"],"manual","finance.html","finance-data.json","Отрицательные значения без величины исключены из числового ряда, сохранены в исходном наборе; "+items[0]["level"],"ОКВЭД2; локальный идентификатор")
    f=load(out,"forecast.json")
    for s in f["series"]:
        first,last=bounds(r["target"] for r in s["results"])
        add("forecast",s["code"],s["title"]+" — статистическая экстраполяция",s["unit"],"месячная" if s["monthly"] else "годовая","Россия",len(s["results"]),first,last,s["source"],None,s.get("checked"),s["status"],"derived","forecast.html","forecast.json","Целевые периоды, не факты; исходный последний факт: "+str(s["last"])+"; диапазоны описательные")
    metadata=load(out,"wdi-metadata.json")
    for r in rows:
        r.update(method_passports.describe(r))
        provider=metadata["rows"].get(r["code"],{}) if r["group"]=="wdi" else {}
        r.update(provider_definition=provider.get("sourceNote",""),provider_organization=provider.get("sourceOrganization",""),provider_metadata_seen=provider.get("seen"),provider_metadata_status=metadata["status"] if r["group"]=="wdi" else "")
        if r["mode"]=="manual":r["checked"]=None;r["success"]=None
    ids=[r["id"] for r in rows]
    if len(ids)!=len(set(ids)):raise ValueError("Duplicate data registry identifiers")
    for r in rows:
        if not (out/r["file"]).is_file():raise ValueError("Registry file missing: "+r["file"])
    return sorted(rows,key=lambda r:(r["group"],r["title"].casefold(),r["id"]))

def publish(page,out,stamp):
    rows=make(out)
    groups=defaultdict(int)
    for r in rows:groups[r["group"]]+=1
    data=dict(built=stamp,rows=rows,groups=dict(groups),note="Записи каталога — ряды и расчётные серии, не уникальные факты; наборы могут пересекаться. Дата сборки не дата наблюдения. Автоматический режим означает существующий сборщик, не гарантированное обновление.")
    (out/"data-registry.json").write_text(json.dumps(data,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
    with (out/"data-registry.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    page("data-registry.html",'<section class="mast"><p class="kicker">Статистика · единая поисковая система</p><h1>Единый каталог данных</h1><p>Поиск по опубликованным рядам, источникам, кодам, единицам и охвату. Каталог создаётся программно при каждой сборке, без ИИ. Открывайте исходные таблицы, сохраняйте список для исследования и выгружайте паспортные сведения.</p><p><a href="data-registry.csv">Полный каталог CSV</a> · <a href="data-registry.json">JSON</a> · <a href="sources.html">Состояние источников</a> · <a href="methodology.html#registry-method">Методика</a> · <a href="method-passports.html">Паспорта расчётов</a></p><p>Число записей каталога не равно числу уникальных наблюдений. Разные наборы могут пересекаться. Прогнозные целевые периоды не являются фактическими наблюдениями.</p></section><section><h2>Найти ряд</h2><form id="registry-form"><label>Поиск по словам, кодам и источникам<input id="registry-q" type="search" placeholder="Например: сталь, износ, ВРП, 28.30"></label><label>Набор<select id="registry-group"></select></label><label>Режим обновления<select id="registry-mode"><option value="">Все</option><option value="auto">Автоматический сборщик</option><option value="manual">Ручной снимок</option><option value="derived">Расчётный ряд</option></select></label><label>Описание методики<select id="registry-method-level"><option value="">Все</option><option value="explained">Есть локальное пояснение</option><option value="source">Требуется изучить методику источника</option><option value="calculated">Расчёт сайта</option></select></label><label>Наличие данных<select id="registry-availability"><option value="">Все</option><option value="present">Есть наблюдения / расчёты</option><option value="empty">Нет наблюдений / расчётов</option></select></label><label><input id="registry-selected" type="checkbox"> Только сохранённые</label><button type="button" id="registry-reset">Сбросить фильтры</button></form><p id="registry-status" role="status">Загрузка…</p><p id="registry-save-status" role="status"></p><div id="registry-list"></div><div class="actions"><button id="registry-prev" disabled>Назад</button><span id="registry-page"></span><button id="registry-next" disabled>Далее</button></div><div class="actions"><button id="registry-export" disabled>Скачать найденные ряды CSV</button><button id="registry-export-selected" disabled>Скачать сохранённые CSV</button><button id="registry-clear" disabled>Очистить сохранённые</button></div><section id="registry-export-data"><h3>Собственная таблица наблюдений</h3><p>Сохраните до 20 рядов и скачайте фактические и расчётные значения в длинном формате, по одному наблюдению в строке. Периоды, территории, единицы и происхождение остаются отдельными. Экспорт ограничен 50 000 строками; при превышении уменьшите подборку. Прогнозы отмечены отдельно, пропуски не заменяются нулями.</p><button id="registry-values" disabled>Скачать наблюдения выбранных рядов CSV</button><p id="registry-values-status" role="status"></p><p>Перед выгрузкой проверяются точные байты файлов по <a href="reproducibility.html">манифесту SHA-256</a>. В таблицу включаются отпечаток набора и хеш исходного файла; при несогласованности сборок экспорт останавливается.</p></section><p>Сохранение работает локально в браузере, без регистрации. CSV — переносимая копия списка; не синхронизируется между устройствами. При недоступности локального хранилища выбор сохраняется только в текущей вкладке.</p></section><script defer src="provenance.js"></script><script defer src="data-registry.js"></script>')
