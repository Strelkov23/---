import json
import shutil
import sys
from collections import Counter
from html import escape
from pathlib import Path
import monitor as m
import industry
import indicators
import literature
import cbr_data
import national
import historical
import industrial_data
import routes

out = Path("public")
out.mkdir(exist_ok=True)
m.init()
if "--refresh" in sys.argv:
    m.collect_all()

def write(name, data):
    (out / name).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))

def page(name, body):
    import re
    from html import unescape
    match=re.search(r"<h1[^>]*>(.*?)</h1>",body,re.S)
    title=unescape(re.sub(r"<[^>]+>","",match.group(1))) if match else "Экономический обзор России"
    shell=Path("shell.html").read_text()
    (out / name).write_text(shell.replace("<!--TITLE-->",escape(title)).replace("<!--BODY-->",body),encoding="utf-8")

with m.connect() as db:
    articles = [dict(r) for r in db.execute("""select a.title,a.url,a.published,a.seen,a.source,
        group_concat(t.topic,' · ') as topics from articles a left join topics t on t.article=a.id
        group by a.id order by a.published desc,a.id desc""")]
    for row in articles:
        if row["source"] == "Правительство РФ":
            row["source"] = "Правительство России"
    write("archive.json",articles)
    news = Counter(r["source"] for r in articles if r["source"] != m.legislation.SOURCE)
    checks = [dict(r) for r in db.execute("select * from checks order by url")]
    days = []
    if db.execute("select 1 from sqlite_master where name='legal_days'").fetchone():
        days = [dict(r) for r in db.execute("""select d.*, (select count(*) from legal l where l.day=d.day) stored
            from legal_days d order by day desc""")]
    coverage = "<h2>Сверка по дням</h2><p>Охват с 20 ноября 2026 года. Текущий день пополняется по мере публикации.</p><table><tr><th>Дата</th><th>Портал</th><th>Архив</th><th>Результат</th></tr>"
    for d in days:
        total = d["expected"] if d["expected"] is not None else "—"
        coverage += f"<tr><td>{d['day']}</td><td>{total}</td><td>{d['stored']}</td><td>{escape(d['error'] or 'Номера совпали')}</td></tr>"
    page("laws.html",m.legislation.journal(db).replace("/archive?", "index.html?").replace("<h2>История проверок",coverage+"</table><h2>История проверок"))
    sources = m.app({"PATH_INFO":"/sources"},lambda *args:None)[0].decode().split("<main>")[1].split("</main>")[0]
    table = "<h2>Охват новостного архива</h2><table><tr><th>Источник</th><th>Записей</th><th>Последняя публикация</th></tr>"
    for source,count in news.most_common():
        last = max(r["published"] or "" for r in articles if r["source"]==source)
        table += f"<tr><td>{escape(source)}</td><td>{count}</td><td>{escape(last)}</td></tr>"
    page("sources.html",sources+table+"</table>")
    latest=[dict(r) for r in db.execute("""select code,year,value,seen from
        (select *,row_number() over(partition by code,year order by seen desc) rn from annual)
        where rn=1 order by year""")]
    comparison = {code: dict(title=meta[1], unit=meta[2], values={}) for code, meta in indicators.META.items()}
    for r in latest:
        if r["code"] in comparison and int(r["year"]) >= 1991 and r["value"] is not None:
            comparison[r["code"]]["values"][r["year"]] = r["value"]
    write("compare.json", comparison)
    indicators.publish(page,out,latest,checks)
    checks_by_url={r["url"]:r for r in checks}
    withdrawn={}
    for r in latest:
        if r["value"] is None and int(r["year"])>=1991:withdrawn.setdefault(r["code"],[]).append(int(r["year"]))
    catalog={}
    for code,meta in indicators.META.items():
        url=f"https://api.worldbank.org/v2/country/RUS/indicator/{code}?format=json&per_page=200"
        c=checks_by_url.get(url,{})
        catalog[code]={"theme":meta[0],"title":meta[1],"unit":meta[2],"agency":meta[3],"source":url,"checked":c.get("checked"),"success":c.get("success"),"status":c.get("status","Ожидается загрузка"),"withdrawn":withdrawn.get(code,[])}
    write("catalog.json",catalog)
    write("stats.json",{"series":m.SERIES,"values":[r for r in latest if r["code"] in m.SERIES and r["value"] is not None]})
    literature.sync(db,m.now(),"--refresh" in sys.argv)
    literature.reclassify(db)
    papers=[dict(r) for r in db.execute("select * from literature order by published desc,title,doi")]
    journal_counts=Counter(r["journal"] for r in papers)
    journal_checks=[dict(r,journal=literature.JOURNALS.get(r["issn"],r["issn"]),count=journal_counts[literature.JOURNALS.get(r["issn"],r["issn"])]) for r in db.execute("select * from journal_checks")]
    write("literature.json",dict(articles=papers,checks=journal_checks,registry=literature.registry(),links=literature.audit_links(db,m.now(),"--refresh" in sys.argv)))
    page("papers.html",Path("papers.html").read_text())
    active = {feed[2] for feed in m.FEEDS}
    failures=[r["url"] for r in checks if (r["url"] in active or "api.worldbank.org" in r["url"]) and r["status"].startswith("Ошибка")]
    failures.extend(r["journal"]+" · "+r["status"] for r in journal_checks if r["status"]!="Проверено")
    failures.extend("Правовой портал "+d["day"] for d in days if d["error"])
    failures.extend(industrial_data.publish(db,m.now(),out,"--refresh" in sys.argv))
    industrial=json.loads((out/"industrial.json").read_text())
    aggregate=[s for s in industrial["series"] if s["kind"]=="Индекс производства г/г" and s["code"]=="BCDE" and s["source"]==industrial_data.BASE+"ind_baza_2023.xlsx"]
    # Use the official systematic workbook ahead of obsolete bulletin URLs.
    primary=aggregate[0] if len(aggregate)==1 else None
    industry_error = industry.collect(db,m.now()) if "--refresh" in sys.argv and not primary else ""
    if industry_error:
        failures.append("Месячная промышленность · " + industry_error)
    db.execute("create table if not exists industry_month(period text,value real,url text,seen text,primary key(period,value,url))")
    db.execute("create table if not exists industry_verified(period text,value real,url text,checked text,primary key(period,value,url))")
    months = [dict(r) for r in db.execute("""select m.period,m.value,m.url,v.checked as verified
        from (select *,row_number() over(partition by period order by seen desc,rowid desc) rn from industry_month) m
        left join industry_verified v on m.period=v.period and m.value=v.value and m.url=v.url
        where m.rn=1 order by m.period""")]
    if primary:
        by_period={r["period"]:r for r in months}
        check=next((x for x in industrial["sources"] if x["url"]==primary["source"]),{})
        for r in primary["values"]:
            by_period[r["period"]]=dict(period=r["period"],value=r["value"],url=primary["source"],verified=check.get("success") or r["seen"],sheet=primary["sheet"],row=r["row"],column=r["column"])
        months=sorted(by_period.values(),key=lambda r:r["period"])
    for row in months:
        alternative=industry.ALTERNATIVES.get(row["period"])
        if alternative and abs(alternative[0]-row["value"])<1e-8:
            row["alternative_url"]=alternative[1]
    write("industry.json", months)
    cbr_data.publish(db,m.now(),out,"--refresh" in sys.argv)
    for c in json.loads((out/"cbr.json").read_text()).values():
        if c["status"].startswith("Ошибка"):
            failures.append(c["title"]+" · "+c["status"])
    failures.extend(national.publish(db,m.now(),out,"--refresh" in sys.argv))
    failures.extend(historical.publish(db,m.now(),out,"--refresh" in sys.argv))
    write("status.json",dict(built=m.now(),failures=failures,checks=checks,days=days,news=news))
for name in ["desk.html","compare.html","statistics.html","diagnostics.html","scenario.html","methodology.html","national.html","historical.html","industrial.html"]:
    page(name,Path(name).read_text())
for f in ["desk.js","compare.js","papers.js","sectors.json","style.css","public.js","model-check.py","model-input.csv","research.js","national.js","historical.js","industrial.js"]:
    shutil.copy(f,out/f)
page("index.html",Path("home.html").read_text())

import atlas
atlas.publish(page, out)
page('machinery.html',Path('machinery.html').read_text())

import bulletin
bulletin.publish(page,out)
shutil.copy('chart-export.js',out)

routes.publish(out)

import link_audit
(out/"quality.json").write_text("{}",encoding="utf-8")
link_audit.publish(page,out,m.connect,m.now(),"--refresh" in sys.argv)

import quality_gate
quality_gate.publish(out, Path("../history/published"),m.now())
