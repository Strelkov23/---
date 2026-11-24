"""Compare published snapshots, not inferred official revision dates."""
import json,math,hashlib
from collections import Counter
from pathlib import Path
MAX_EVENTS=20000
MAX_BUILDS=90
TYPES=("revised","added","missing","definition")
def read(folder,name):return json.loads((folder/name).read_text(encoding="utf-8"))
def number(v):return type(v) in (int,float) and math.isfinite(v)
def series(title,unit,source,values,definition=""):
    return dict(title=title,unit=unit,source=source,definition=definition,values=values)
def points(rows,key):
    values={}
    for r in rows:
        k=key(r)
        if k in values:raise ValueError("duplicate observation "+str(k))
        if number(r.get("value")):values[k]=r["value"]
    return values

def inventory(folder):
    result={}
    for file,group,period in [("compare.json","WDI",None),("cbr.json","Банк России (дни)","date"),("national.json","Российская статистика","period")]:
        data=read(folder,file)
        catalog=read(folder,"catalog.json") if not period else {}
        for code,r in data.items():
            values=points(r["values"],lambda x:("",str(x[period]))) if period else {("",str(y)):v for y,v in r["values"].items() if number(v)}
            result[(group,code)]=series(r["title"],r["unit"],r.get("source") or catalog.get(code,{}).get("source"),values,r.get("definition",""))
    for r in read(folder,"historical.json")["series"]:
        data=read(folder,r["file"])
        values=data["values"]
        # Reserved missing markers were mistakenly stored in some earlier snapshots.
        # Exclude them on both sides: correcting a parser is not a statistical revision.
        if "tochno-st-catalog/Rosstat/" in data["source"]:
            values=[x for x in values if x["value"] not in (-77777777,-99999999)]
        result[("Регионы",r["code"])]=series(data["title"],data["unit"],data["source"],points(values,lambda x:(x["region"],str(x["year"]))),data.get("kind",""))
    for r in read(folder,"industrial.json")["series"]:
        result[("Промышленность",r["id"])]=series(r["title"],r["unit"],r["source"],points(r["values"],lambda x:("",str(x["period"])))," | ".join(str(r.get(k,"")) for k in ("classification","kind","frequency","definition")))
    for filename,group,unit in [("food-balance.json","Продовольственные балансы","тыс. т"),("electricity-balance.json","Энергетические балансы","ТВт·ч")]:
        data=read(folder,filename)
        for r in data["rows"]:
            for metric,value in r["values"].items():
                if not number(value):continue
                code=str(r.get("code",""))+":"+metric
                title=(str(r.get("title",""))+" · "+metric).strip(" ·")
                ident=(group,code)
                item=result.setdefault(ident,series(title,data.get("unit",unit),data.get("source"),{},str(data.get("mode",""))))
                item["values"][("",str(r["year"]))]=value
    return result

def compare(old,new,stamp,base):
    counts=Counter();events=[]
    def emit(group,code,meta,kind,region="",period="",before=None,after=None):
        counts[kind]+=1
        events.append(dict(group=group,code=code,title=meta["title"],unit=meta["unit"],source=meta["source"],kind=kind,region=region,period=period,before=before,after=after,time=stamp,base=base))
    new_series=len(new.keys()-old.keys());lost_series=len(old.keys()-new.keys())
    for group,code in sorted(old.keys()&new.keys()):
        a,b=old[(group,code)],new[(group,code)]
        # Never report a change of definition or unit as a numerical revision.
        if any(a[k]!=b[k] for k in ("title","unit","source","definition")):
            emit(group,code,b,"definition",before={k:a[k] for k in ("title","unit","source","definition")},after={k:b[k] for k in ("title","unit","source","definition")})
            continue
        av,bv=a["values"],b["values"]
        for region,period in sorted(av.keys()|bv.keys()):
            k=(region,period)
            if k not in av:emit(group,code,b,"added",region,period,None,bv[k])
            elif k not in bv:emit(group,code,b,"missing",region,period,av[k],None)
            elif av[k]!=bv[k]:emit(group,code,b,"revised",region,period,av[k],bv[k])
    # Keep revisions and definition changes first when the public journal reaches its limit.
    events.sort(key=lambda r:({"revised":0,"definition":1,"missing":2,"added":3}[r["kind"]],r["group"],r["code"],r["region"],r["period"]))
    return dict(time=stamp,base=base,counts={k:counts[k] for k in TYPES},new_series=new_series,missing_series=lost_series,events=events)

def quality(data):
    if data.get("schema")!=1 or not isinstance(data.get("builds"),list) or len(data["builds"])>MAX_BUILDS:raise ValueError("invalid revision journal")
    total=0;times=set()
    for b in data["builds"]:
        if b["time"] in times:raise ValueError("duplicate build")
        times.add(b["time"]);counts=b["counts"]
        if set(counts)!=set(TYPES) or any(type(v) is not int or v<0 for v in counts.values()):raise ValueError("invalid revision counts")
        if type(b["omitted"]) is not int or b["omitted"]<0 or sum(counts.values())!=len(b["events"])+b["omitted"]:raise ValueError("revision totals do not reconcile")
        seen=set();retained=Counter()
        for r in b["events"]:
            key=(r["group"],r["code"],r["region"],r["period"],r["kind"])
            if key in seen or r["time"]!=b["time"] or r["kind"] not in TYPES:raise ValueError("invalid revision event")
            seen.add(key);retained[r["kind"]]+=1
            a,z=r["before"],r["after"]
            if r["kind"]=="revised" and (not number(a) or not number(z) or a==z):raise ValueError("invalid revised value")
            if r["kind"]=="added" and (a is not None or not number(z)):raise ValueError("invalid added value")
            if r["kind"]=="missing" and (not number(a) or z is not None):raise ValueError("invalid missing value")
            if r["kind"]=="definition" and (not isinstance(a,dict) or not isinstance(z,dict) or a==z):raise ValueError("invalid definition change")
        if any(retained[k]>counts[k] for k in TYPES):raise ValueError("retained exceeds count")
        total+=len(b["events"])
    if total>MAX_EVENTS:raise ValueError("journal limit exceeded")
    return {"revision_builds":len(data["builds"]),"revision_events":total}

def publish(page,out,previous,stamp):
    current=inventory(out)
    manifest=previous/"data-manifest.json"
    if manifest.exists():
        base=read(previous,"data-manifest.json")["data_fingerprint"]
        old=inventory(previous)
        batch=compare(old,current,stamp,base)
    else:
        batch=dict(time=stamp,base=None,counts={k:0 for k in TYPES},new_series=len(current),missing_series=0,events=[])
    oldjournal=read(previous,"stat-revisions.json") if (previous/"stat-revisions.json").exists() else {"builds":[]}
    remaining=MAX_EVENTS;builds=[]
    for b in [batch]+[b for b in oldjournal["builds"] if b["time"]!=stamp][:MAX_BUILDS-1]:
        b=dict(b);b["events"]=b["events"][:remaining];b["omitted"]=sum(b["counts"].values())-len(b["events"]);remaining-=len(b["events"]);builds.append(b)
    data=dict(schema=1,built=stamp,builds=builds,limits=dict(builds=MAX_BUILDS,events=MAX_EVENTS))
    quality(data)
    (out/"stat-revisions.json").write_text(json.dumps(data,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
    page("stat-revisions.html",'<section class="mast"><h1>Пересмотры статистики</h1><p>Сравнение двух последовательных сохранённых снимков одного ряда. Изменение в архиве не доказывает официальную дату пересмотра. Исчезновение наблюдения может быть следствием скользящего окна, изменения охвата или сбоя.</p><p><a href="updates.html">Общий журнал сайта</a> · <a href="freshness.html">Контроль обновлений</a> · <a href="methodology.html#stat-revisions-method">Методика</a> · <a href="stat-revisions.json">JSON</a></p></section><section><h2>Изменения наблюдений</h2><form id="rev-form"><label>Сборка<select id="rev-build"></select></label><label>Группа<select id="rev-group"><option value="">Все группы</option></select></label><label>Изменение<select id="rev-kind"><option value="">Все</option><option value="revised">Числовой пересмотр</option><option value="added">Новое наблюдение</option><option value="missing">Исчезновение из снимка</option><option value="definition">Изменение определения</option></select></label><label>Поиск<input id="rev-query" type="search" placeholder="Показатель или регион"></label></form><p id="rev-status" role="status">Загрузка…</p><div id="rev-summary"></div><button id="rev-export" disabled>Скачать выборку CSV</button><div id="rev-table"></div><button id="rev-more" hidden>Ещё результаты</button></section><script defer src="provenance.js"></script><script defer src="stat-revisions.js"></script>')
