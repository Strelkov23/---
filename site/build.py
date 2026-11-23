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

out = Path("public")
out.mkdir(exist_ok=True)
m.init()
if "--refresh" in sys.argv:
    m.collect_all()

def write(name, data):
    (out / name).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))

def page(name, body):
    (out / name).write_text(Path("shell.html").read_text().replace("<!--BODY-->",body))

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
        if r["code"] in comparison and int(r["year"]) >= 1991:
            comparison[r["code"]]["values"][r["year"]] = r["value"]
    write("compare.json", comparison)
    indicators.publish(page,out,latest,checks)
    write("stats.json",{"series":m.SERIES,"values":[r for r in latest if r["code"] in m.SERIES]})
    literature.sync(db,m.now(),"--refresh" in sys.argv)
    papers=[dict(r) for r in db.execute("select * from literature order by published desc,title,doi")]
    journal_counts=Counter(r["journal"] for r in papers)
    journal_checks=[dict(r,journal=literature.JOURNALS[r["issn"]],count=journal_counts[literature.JOURNALS[r["issn"]]]) for r in db.execute("select * from journal_checks")]
    write("literature.json",dict(articles=papers,checks=journal_checks))
    page("papers.html",Path("papers.html").read_text())
    active = {feed[2] for feed in m.FEEDS}
    failures=[r["url"] for r in checks if (r["url"] in active or "api.worldbank.org" in r["url"]) and r["status"].startswith("Ошибка")]
    failures.extend(r["journal"]+" · "+r["status"] for r in journal_checks if r["status"]!="Проверено")
    failures.extend("Правовой портал "+d["day"] for d in days if d["error"])
    industry_error = industry.collect(db,m.now())
    if industry_error:
        failures.append("Месячная промышленность · " + industry_error)
    months = [dict(r) for r in db.execute("select period,value,url from (select *,row_number() over(partition by period order by seen desc,rowid desc) rn from industry_month) where rn=1 order by period")]
    write("industry.json", months)
    write("status.json",dict(built=m.now(),failures=failures,checks=checks,days=days,news=news))
for name in ["desk.html","compare.html"]:
    page(name,Path(name).read_text())
for f in ["desk.js","compare.js","papers.js","sectors.json","style.css","public.js","model-check.py","model-input.csv"]:
    shutil.copy(f,out/f)
page("index.html",Path("home.html").read_text())

import atlas
atlas.publish(page, out)
page('machinery.html',Path('machinery.html').read_text())
