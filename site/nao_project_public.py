"""Publish reviewed NAO editions separately; preserve the last verified snapshot."""
import csv,json
from datetime import datetime,timedelta
from html import escape
from pathlib import Path
import nao_project_import as imp
import investment_projects as common
FILE="nao-projects.json"
CSV="nao-projects.csv"
SOURCE="https://adm-nmar.ru/deyatelnost/ekonomika/malyy-i-sredniy-biznes/podderzhka/investitsionnaya-deyatelnost/"
FIELDS=["group","region","status","edition","record","source_number","section_row","name","sector","location","period","stage","cost_mln_rub","cost_status","jobs","source","sha256","sheet","row"]
NOTE=imp.NOTE
def blank():return dict(schema=1,note=NOTE,status="not_loaded",checked=None,success=None,error=None,report=None,source=SOURCE)
def time(s):
    d=datetime.fromisoformat(s.replace("Z","+00:00"))
    if d.tzinfo is None:raise ValueError("Дата без часового пояса")
    return d
def quality(d):
    if d.get("schema")!=1 or d.get("note")!=NOTE or d.get("source")!=SOURCE or d.get("status") not in ("not_loaded","ok","cached","unavailable"):raise ValueError("Паспорт")
    if d["status"]=="not_loaded":
        if d!=blank():raise ValueError("Пустой паспорт")
    else:
        checked=time(d["checked"])
        if d["report"] is not None:
            if not d["success"] or time(d["success"])>checked or d["status"] not in ("ok","cached"):raise ValueError("Дата успеха")
            if d["status"]=="ok" and (d["success"]!=d["checked"] or d["error"] is not None):raise ValueError("Статус успеха")
        elif d["success"] or d["status"]!="unavailable":raise ValueError("Статус отсутствия")
        if d["status"]=="unavailable" and not d["error"]:raise ValueError("Нет причины отказа")
    q=imp.quality(d["report"]) if d["report"] is not None else dict(records=0,cost_numeric=0,jobs_numeric=0)
    return {"nao_project_"+k:v for k,v in q.items()}
def sync(previous,stamp,refresh,fetcher=imp.fetch_all):
    d=blank()
    try:
        old=json.loads((previous/FILE).read_text(encoding="utf-8"));quality(old);d=old
    except (OSError,ValueError,TypeError,KeyError,AttributeError):pass
    if not refresh:return d
    now=time(stamp)
    if d["checked"] and now<time(d["checked"])+timedelta(days=2 if d["error"] else 7):return d
    try:
        report=fetcher();imp.quality(report)
        d=dict(blank(),status="ok",checked=stamp,success=stamp,report=report)
    except Exception as e:
        d=dict(d,checked=stamp,status="cached" if d["report"] else "unavailable",error=(str(e) or type(e).__name__)[:200])
    quality(d);return d
def rows(d):
    return [r for g in imp.GROUPS for r in d["report"]["groups"][g]] if d["report"] else []
def verify_csv(path,d):
    with path.open(encoding="utf-8-sig",newline="") as f:
        reader=csv.DictReader(f)
        if reader.fieldnames!=FIELDS or list(reader)!=[{k:common.csv_cell(r[k]) for k in FIELDS} for r in rows(d)]:raise ValueError("CSV/JSON")
def render(d):
    e=lambda v:escape(str(v if v is not None else "—"),quote=True)
    body='<section class="mast"><p class="kicker">Инвестиции · региональные реестры</p><h1>Инвестиционные проекты Ненецкого автономного округа</h1><p>'+e(NOTE)+'</p><p><a href="project-coverage.html">Охват региональных реестров</a> · <a href="'+e(SOURCE)+'">Официальный источник</a> · <a href="'+CSV+'">CSV</a> · <a href="'+FILE+'">JSON</a> · <a href="freshness.html">Актуальность</a></p></section>'
    body+='<section><h2>Состояние загрузки</h2><p>Последняя проверка: '+e(d["checked"])+' · последняя успешная: '+e(d["success"])+'</p>'
    if d["error"]:body+='<p>Ошибка обновления: '+e(d["error"])+'</p>'
    if not d["report"]:return body+'<p>Подтверждённая редакция пока отсутствует. Это не означает отсутствие проектов.</p></section>'+''.join('<section id="nao-'+g+'"><h2>'+e(v[0])+'</h2><p>Нет подтверждённой редакции.</p></section>' for g,v in imp.GROUPS.items())
    body+='</section>'
    for g,(status,edition,_,_,heading) in imp.GROUPS.items():
        rs=d["report"]["groups"][g];n=sum(r["cost_mln_rub"] is not None for r in rs)
        body+='<section id="nao-'+g+'"><h2>'+e(status)+'</h2><p>Дата по имени файла: '+e(edition)+' · '+str(len(rs))+' записей; финансирование: '+str(n)+' числовых ячеек. '+e(heading)+'.</p><div class="table-scroll" tabindex="0" role="region" aria-label="'+e(status)+'"><table><thead><tr>'+''.join('<th scope="col">'+e(h)+'</th>' for h in ["Проект","Отрасль","Место","Период","Стадия","Финансирование, млн руб.","Источник"])+'</tr></thead><tbody>'
        for r in rs:
            body+='<tr>'+''.join('<td>'+e(r[k])+'</td>' for k in ("name","sector","location","period","stage","cost_mln_rub"))+'<td><a href="'+e(r["source"])+'">XLSX</a> · строка '+e(r["row"])+' · № '+e(r["source_number"])+'</td></tr>'
        body+='</tbody></table></div></section>'
    return body
def publish(page,out,previous,stamp,refresh):
    d=sync(previous,stamp,refresh);quality(d)
    (out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/CSV).open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=FIELDS);w.writeheader();w.writerows({k:common.csv_cell(r[k]) for k in FIELDS} for r in rows(d))
    verify_csv(out/CSV,d);page("nao-projects.html",render(d));return d
