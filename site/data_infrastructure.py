"""Stage A control centre. Summaries of validated existing published evidence,
not a declaration of completeness or an automatic acceptance of external data.
"""
import json
from collections import Counter,defaultdict
from html import escape
import source_registry as registry
import source_journal as journal
import source_pipeline as pipeline
import observation_contract as contract
import company_import,sme_matrix

FILE="data-infrastructure.json"
NOTE="Контроль инфраструктуры импорта. Доступность транспорта, разбор, запись, охват данных и публикация — разные этапы. Счётчики событий ограниченного журнала не являются числом источников или предприятий. Состояние крупного импорта относится к опубликованной редакции, а не к последней сетевой попытке."

def read(out,name):
    with (out/name).open(encoding="utf-8") as f:return json.load(f)

def collect(out,stamp):
    transport=read(out,journal.FILE);tc=journal.quality(transport)
    processing=read(out,pipeline.FILE);pc=pipeline.quality(processing)
    observations=read(out,contract.FILE);nc=contract.quality(observations,out)
    t=defaultdict(list);p=defaultdict(list)
    for e in transport["events"]:
        try:s=registry.identify(e["url"])
        except ValueError:continue
        t[s.id].append(e)
    for e in processing["events"]:p[e["source"]].append(e)
    rows=[]
    for s in registry.passports():
        ts=t[s["id"]];ps=p[s["id"]]
        latest_t=max(ts,key=lambda e:e["stamp"],default=None)
        latest_p=max(ps,key=lambda e:e["stamp"],default=None)
        rows.append(dict(id=s["id"],title=s["title"],format=s["format"],transport_attempts=len(ts),transport_failed=sum(e["status"]=="failed" for e in ts),processing_attempts=len(ps),processing_rejected=sum(e["result"]=="rejected" for e in ps),latest_transport=latest_t,latest_processing=latest_p))
    corp=read(out,"company-rankings.json");company_import.quality(corp)
    sme=read(out,"sme-matrix.json");sme_matrix.quality(sme)
    bulk=[]
    by={r["kind"]:r for r in (corp.get("report") or {}).get("sources",[])}
    for kind,title in (("income_expense","ФНС · доходы и расходы ЮЛ"),("employment","ФНС · численность работников ЮЛ")):
        x=by.get(kind)
        bulk.append(dict(id=kind,title=title,status=corp["status"],edition=x.get("release") if x else None,period=x.get("year") if x else None,records=x["unique"] if x else None,processed=x["processed_members"] if x else None,total=x["xml_members"] if x else None,sha256=x["sha256"] if x else None,note="Охват опубликованного открытого набора; не полный ЕГРЮЛ."))
    available=sme["status"]=="diagnostic"
    bulk.append(dict(id="sme",title="ФНС · реестр МСП",status=sme["status"],edition=sme["edition"] if available else None,period=None,records=sme["national_imported"] if available else None,processed=sme["xml_processed"] if available else None,total=sme["xml_total"] if available else None,sha256=sme["archive_sha256"] if available else None,note=("Диагностическая редакция; расхождение с официальным итогом: "+str(sme["national_difference"]) if available else "Нет опубликованной диагностической редакции.")))
    counts={**tc,**pc,**nc,"bulk_published":sum(x["records"] is not None for x in bulk)}
    return dict(schema=1,built=stamp,note=NOTE,counts=counts,loaders=rows,bulk=bulk,normalized_inputs=observations["inputs"],raw_archive=dict(status="not_enabled",note="Постоянное хранение исходных байтов не включено. Версии опубликованных данных и метаданные загрузок сохраняются. Для долговременного хранения нужны правила использования, срок хранения и отдельный бюджет."))

def quality(data,out):
    if data!=collect(out,data["built"]):raise ValueError("Сводка инфраструктуры не воспроизводится")
    return dict(infrastructure_loaders=len(data["loaders"]),infrastructure_bulk_published=data["counts"]["bulk_published"])

def render(d):
    e=lambda v:escape(str(v),quote=True)
    def v(x):return "—" if x is None else e(x)
    def state(x,key):
        if x is None:return "Нет событий"
        return e(x[key])+" · "+e(x["stamp"])
    body='<section class="mast"><p class="kicker">Источники и качество · этап А</p><h1>Инфраструктура экономических данных</h1><p>'+e(NOTE)+'</p><p><a href="'+FILE+'">Сводка JSON</a> · <a href="source-pipeline.html">Реестр и карантин</a> · <a href="source-journal.html">Журнал загрузок</a> · <a href="normalized-data.html">Единый формат</a> · <a href="reproducibility.html">Воспроизводимость</a></p></section>'
    body+='<section><h2>Контур обработки</h2><div class="metrics">'
    for k,label in (("pipeline_sources","Политик малых загрузок"),("normalized_observations","Нормализованных наблюдений"),("transport_events","Событий транспорта"),("pipeline_rejected","Отклонённых пакетов"),("bulk_published","Крупных наборов опубликовано")):
        body+='<div class="metric"><b>'+str(d["counts"][k])+'</b>'+e(label)+'</div>'
    body+='</div><h3>Состояние зарегистрированных загрузчиков</h3><p>Отдельные последние события могут относиться к разным запросам одного поставщика; отсутствие событий не означает отказ.</p><div class="table-scroll" tabindex="0"><table><thead><tr><th>Источник</th><th>Формат</th><th>Транспорт</th><th>Обработка</th><th>Попыток / отклонено</th></tr></thead><tbody>'
    for r in d["loaders"]:
        body+='<tr><td>'+e(r["title"])+'</td><td>'+e(r["format"])+'</td><td>'+state(r["latest_transport"],"status")+'</td><td>'+state(r["latest_processing"],"result")+'</td><td>'+str(r["processing_attempts"])+' / '+str(r["processing_rejected"])+'</td></tr>'
    body+='</tbody></table></div></section><section><h2>Опубликованные крупные наборы</h2><div class="table-scroll" tabindex="0"><table><thead><tr><th>Набор</th><th>Статус</th><th>Редакция</th><th>Записей</th><th>Файлов</th><th>Ограничение</th></tr></thead><tbody>'
    for r in d["bulk"]:
        body+='<tr><td>'+e(r["title"])+'</td><td>'+e(r["status"])+'</td><td>'+v(r["edition"])+'</td><td>'+v(r["records"])+'</td><td>'+v(r["processed"])+' / '+v(r["total"])+'</td><td>'+e(r["note"])+'</td></tr>'
    body+='</tbody></table></div><p><a href="company-atlas.html">Атлас организаций</a></p></section><section><h2>Хранение и ограничения</h2><p>'+e(d["raw_archive"]["note"])+'</p><p>Для нового источника необходимы паспорт, специализированная проверка структуры и единиц, критерии полноты, тесты отказа и документированная политика обновления.</p></section>'
    return body

def publish(page,out,stamp):
    d=collect(out,stamp);quality(d,out)
    (out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
    page("data-infrastructure.html",render(d))
    return d
