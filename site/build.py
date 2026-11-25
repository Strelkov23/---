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
import sector_passports
import routes
import navigation
import regional_geo
import facility_data
import enterprise_sources
import amur_enterprises
import bank_registry
import company_sources
import company_import
import company_index
import industrial_parks
import park_certificates
import sme_regions
import district_geo
import programmes
import budget_diagnostics
import programme_evidence
import labor_data
import price_data
import forecast
import capital_data
import finance_data
import financial_state
import cost_structure
import food_balance
import electricity_balance
import data_registry
import method_passports
import wdi_metadata
import provenance

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
    body=method_passports.links(body,name)
    match=re.search(r"<h1[^>]*>(.*?)</h1>",body,re.S)
    title=unescape(re.sub(r"<[^>]+>","",match.group(1))) if match else "Экономический обзор России"
    shell=Path("shell.html").read_text()
    (out / name).write_text(shell.replace("<!--TITLE-->",escape(title)).replace("<!--NAV-->",navigation.primary(name)).replace("<!--SECTION-NAV-->",navigation.secondary(name)).replace("<!--PAGE-GUIDE-->",navigation.guide(name)).replace("<!--BODY-->",body),encoding="utf-8")

with m.connect() as db:
    articles = [dict(r) for r in db.execute("""select a.title,a.url,a.published,a.seen,a.source,
        group_concat(t.topic,' · ') as topics from articles a left join topics t on t.article=a.id
        group by a.id order by a.published desc,a.id desc""")]
    for row in articles:
        if row["source"] == "Правительство РФ":
            row["source"] = "Правительство России"
    write("archive.json",articles)
    programmes.publish(page,out,articles,m.now())
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
    page("sources.html",'<p><a href="freshness.html">Календарь и контроль обновлений всех наборов</a></p>'+sources+table+"</table>")
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
    wdi_metadata.sync(db,set(catalog),m.now(),"--refresh" in sys.argv,out)
    write("stats.json",{"series":m.SERIES,"values":[r for r in latest if r["code"] in m.SERIES and r["value"] is not None]})
    literature.sync(db,m.now(),"--refresh" in sys.argv)
    literature.reclassify(db)
    papers=[dict(r) for r in db.execute("select * from literature order by published desc,title,doi")]
    literature.enrich(db,papers)
    journal_counts=Counter(r["journal"] for r in papers)
    journal_checks=[dict(r,journal=literature.JOURNALS.get(r["issn"],r["issn"]),count=journal_counts[literature.JOURNALS.get(r["issn"],r["issn"])]) for r in db.execute("select * from journal_checks")]
    write("literature.json",dict(articles=papers,checks=journal_checks,registry=literature.registry(),service=literature.service_status(db,m.now()),links=literature.audit_links(db,m.now(),"--refresh" in sys.argv)))
    page("papers.html",Path("papers.html").read_text())
    active = {feed[2] for feed in m.FEEDS}
    failures=[r["url"] for r in checks if (r["url"] in active or "api.worldbank.org" in r["url"]) and r["status"].startswith("Ошибка")]
    failures.extend(r["journal"]+" · "+r["status"] for r in journal_checks if r["status"]!="Проверено")
    failures.extend("Правовой портал "+d["day"] for d in days if d["error"])
    failures.extend(industrial_data.publish(db,m.now(),out,"--refresh" in sys.argv))
    industrial=json.loads((out/"industrial.json").read_text())
    # Use the official systematic workbook ahead of obsolete bulletin URLs.
    primary=industrial_data.aggregate_months(industrial,[])
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
        months=industrial_data.aggregate_months(industrial,months)
    for row in months:
        alternative=industry.ALTERNATIVES.get(row["period"])
        if not row.get("sheet") and alternative and abs(alternative[0]-row["value"])<1e-8:
            row["alternative_url"]=alternative[1]
    write("industry.json", months)
    cbr_data.publish(db,m.now(),out,"--refresh" in sys.argv)
    for c in json.loads((out/"cbr.json").read_text()).values():
        if c["status"].startswith("Ошибка"):
            failures.append(c["title"]+" · "+c["status"])
    failures.extend(national.publish(db,m.now(),out,"--refresh" in sys.argv))
    import regional_manufacturing
    manufacturing=regional_manufacturing.publish(out,Path("../history/published"),m.now(),"--refresh" in sys.argv)
    if manufacturing["status"].startswith("Ошибка"):failures.append("Отраслевая структура регионов · "+manufacturing["status"])
    import regional_industry_extra
    mining_energy=regional_industry_extra.publish(out,Path("../history/published"),m.now(),"--refresh" in sys.argv)
    if mining_energy["status"].startswith("Ошибка"):failures.append("Добыча и энергетика регионов · "+mining_energy["status"])
    failures.extend(historical.publish(db,m.now(),out,"--refresh" in sys.argv))
    write("status.json",dict(built=m.now(),failures=failures,checks=checks,days=days,news=news))
regional_geo.publish(out,Path("../history/published"),m.now(),"--refresh" in sys.argv)
facility_data.publish(out,Path("../history/published"),m.now(),"--refresh" in sys.argv)
enterprise_sources.publish(out,Path("../history/published"),m.now(),"--refresh" in sys.argv)
amur_enterprises.publish(out,Path("../history/published"),m.now(),"--refresh" in sys.argv)
bank_directory=bank_registry.publish(out,Path("../history/published"),m.now(),"--refresh" in sys.argv)
import bank_disclosure
bank_disclosure.publish(out,Path("../history/published"),m.now(),"--refresh" in sys.argv,bank_directory)
import bank_capital
bank_capital_snapshot=bank_capital.publish(out,Path("../history/published"),m.now(),"--refresh" in sys.argv,bank_directory)
import bank_capital_history
bank_capital_history.publish(out,Path("../history/published"),m.now(),"--refresh" in sys.argv,bank_directory,bank_capital_snapshot)
import bank_balance
bank_balance.publish(out,Path("../history/published"),m.now(),"--refresh" in sys.argv,bank_directory)
company_sources.publish(out,Path("../history/published"),m.now(),"--refresh" in sys.argv)
company_import.publish(out,Path("../history/published"),m.now(),"--refresh" in sys.argv)
import company_names
company_names.publish(out,Path("../history/published"))
import group_passports
group_passports.publish(out)
industrial_parks.publish(out,Path("../history/published"),m.now(),"--refresh" in sys.argv)
park_certificates.publish(out,Path("../history/published"),m.now(),"--refresh" in sys.argv)
sme_regions.publish(out,Path("../history/published"),m.now(),"--refresh" in sys.argv)
import sme_matrix
sme_matrix.publish(out,Path("../history/published"))
import sme_finance_public
sme_finance_public.publish(out,Path("../history/published"))
district_geo.publish(out,Path("../history/published"),m.now(),"--refresh" in sys.argv)
for name in ["banks.html","company-atlas.html","desk.html","compare.html","statistics.html","diagnostics.html","scenario.html","methodology.html","national.html","historical.html","economic-map.html","news-map.html","facility-map.html","industrial-parks.html","district-map.html","search.html","glossary.html","industrial.html","sector-passports.html","regional-manufacturing.html","prices.html","technology.html","forecast.html","index-builder.html","report-builder.html"]:
    page(name,Path(name).read_text())
for f in ["bank-balance.js","sme-finance.js","bank-capital-history.js","sme-matrix.js","bank-capital.js","group-passports.js","company-lookup.js","bank-directory.js","programmes.js","desk.js","compare.js","papers.js","sectors.json","style.css","interface.js","layout.js","public.js","model-check.py","model-input.csv","research.js","macro-diagnostics.js","chain-stress.js","reproduction-plan.js","resource-plan.js","dynamic-plan.js","labor-data.js","labor-calibration.js","price-model.js","technology.js","forecast.js","capital-data.js","finance-data.js","financial-state.js","cost-structure.js","food-balance.js","data-registry.js","index-builder.js","composite-index.js","report-builder.js","provenance.js","reproducibility.js","global-plan.js","global-plan-worker.js","national.js","historical.js","enterprise-diagnostics.js","regional-disparities.js","regional-map.js","regional-dashboard.js","news-map.js","facility-map.js","industrial-parks.js","park-certificates.js","investment-projects.js","amur-projects.js","sme-map.js","district-map.js","freshness.js","stat-revisions.js","site-search.js","industrial.js","energy-output.js","electricity-balance.js","sector-passports.js","balance-matrix.js","regional-manufacturing.js"]:
    shutil.copy(f,out/f)
page("index.html",Path("home.html").read_text().replace("<!--DIRECTORY-->",navigation.cards()))
navigation.publish(page)
write('site-search.json',navigation.search_entries())
budget_diagnostics.publish(page,out)
import federal_budget
federal_budget.publish(page,out,m.now())
programme_evidence.publish(page,out,m.now())
labor_data.publish(page,out,m.now())
price_data.publish(out)
forecast.publish(out,m.now())
capital_data.publish(page,out)
import frp_snapshot
frp_snapshot.publish(page,out)
import investment_projects
investment_projects.publish(page,out,Path("../history/published"),m.now(),"--refresh" in sys.argv)
import amur_projects
amur_projects.publish(page,out,Path("../history/published"),m.now(),"--refresh" in sys.argv)
import krasnodar_projects
krasnodar_projects.publish(page,out,Path("../history/published"),m.now(),"--refresh" in sys.argv)
import project_coverage
project_coverage.publish(page,out,m.now())
with m.connect() as finance_db:
    finance_check=finance_data.check_files(finance_db,m.now(),"--refresh" in sys.argv)
    finance_data.publish(page,out,finance_check)
    import finance_workbooks
    finance_workbooks.publish(page,out,finance_workbooks.sync(finance_db,m.now(),"--refresh" in sys.argv,finance_check["files"]))
sector_passports.publish(out)
financial_state.publish(page,out)
cost_structure.publish(page,out)
import rosstat_workbooks
with m.connect() as workbook_db:
    rosstat_workbooks.publish(page,out,rosstat_workbooks.sync(workbook_db,m.now(),"--refresh" in sys.argv,out))
with m.connect() as food_db:
    food_balance.publish(page,out,food_balance.sync(food_db,m.now(),"--refresh" in sys.argv))
with m.connect() as electricity_db:
    electricity_balance.publish(out,electricity_balance.sync(electricity_db,m.now(),"--refresh" in sys.argv))
data_registry.publish(page,out,m.now())

import atlas
atlas.publish(page, out)
page('machinery.html',Path('machinery.html').read_text())

import bulletin
bulletin.publish(page,out)
shutil.copy('chart-export.js',out)

method_passports.publish(page,out)
import freshness
freshness.publish(page,out,m.now())
import stat_revisions
stat_revisions.publish(page,out,Path('../history/published'),m.now())
import consistency
consistency.publish(page,out,m.now())
provenance.publish(page,out,m.now())
routes.publish(out)

import link_audit
(out/"quality.json").write_text("{}",encoding="utf-8")
link_audit.publish(page,out,m.connect,m.now(),"--refresh" in sys.argv)

import quality_gate
quality_gate.publish(out, Path("../history/published"),m.now())
