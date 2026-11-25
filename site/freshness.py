"""Distinguish source check dates, observation dates and internal refresh policy."""
import json,hashlib,re
from datetime import date,datetime,timedelta,timezone
from urllib.parse import urlsplit

def dt(value):
    try:
        v=datetime.fromisoformat(str(value).replace("Z","+00:00"))
        return v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v.astimezone(timezone.utc)
    except (TypeError,ValueError):return None

def iso(v):return v.isoformat(timespec="seconds") if v else None

def next_run(now,not_before=None):
    base=max(now,not_before or now)
    run=base.replace(hour=3,minute=17,second=0,microsecond=0)
    if run<=now or run<base:run+=timedelta(days=1)
    return run

def latest(values):
    return max((str(x) for x in values if x is not None and re.fullmatch(r"\d{4}(?:-\d{2}(?:-\d{2})?)?",str(x))),default=None)

def state(checked,success,status,now,days,archive=False,available=True):
    if archive:return "archive" if available else "unavailable"
    if not success:return "unavailable" if checked else "waiting"
    if checked and (checked>success or re.search(r"ошиб|отлож|недоступ|429|403|404|timeout|failed",status,re.I)):return "cached"
    if "частичный импорт" in status.lower():return "partial"
    if days and now-success>timedelta(days=days):return "overdue"
    return "ok"

def workbook_next(record,now,success_days=30,failure_days=7):
    checked=dt(record.get("checked"));success=dt(record.get("success"))
    if not checked:return now
    changed=record.get("attempt_url") and record.get("catalogue_url") and record["attempt_url"]!=record["catalogue_url"]
    if changed:return now
    return checked+timedelta(days=success_days if checked==success else failure_days)

def historical_latest(record,series):
    # Discovery success only means that a catalogue was read, not that its data
    # were imported. Archive import status may use the primary page as URL.
    code=record.get("code","")
    urls={record.get("url")}
    if code.startswith(("import_","budget_import_")) or re.fullmatch(r"emiss_\d+",code):
        if not record.get("success"):return None
        urls.update(f.get("url") for f in record.get("files",[]) if f.get("format") in ("xlsx","zip","parquet","csv.gz","csv","xls"))
    urls.discard(None);urls.discard("")
    return latest(x.get("last") for x in series if x.get("source") in urls)

def bank_progress(data,capital=False):
    """Check timestamps are not successful import dates; only successful attempts count."""
    rows=data.get("rows",[])
    target=set(data.get("target_cohort" if capital else "cohort",[]))
    verified={r["registration_number"] for r in rows if not capital or r.get("verification")=="html"}
    attempts=data.get("attempts",{})
    success=max((dt(v.get("checked")) for reg,v in attempts.items() if reg in verified and v.get("error") is None and dt(v.get("checked"))),default=None)
    checked=iso(max((v for v in (dt(data.get("checked")),dt(data.get("last_attempt")),*(dt(a.get("checked")) for a in attempts.values())) if v is not None),default=None))
    n=len(target&verified)
    current="waiting" if not checked and not rows else "unavailable" if not rows else "partial" if not target or n<len(target) else "ok"
    return dict(checked=checked,success=iso(success),state=current,status="Проверено в целевом перечне: "+(str(n)+" из "+str(len(target)) if target else "перечень не подтверждён")+". Дата последнего успеха только по протоколу попыток.")

def collect(out,stamp):
    now=dt(stamp)
    if not now:raise ValueError("invalid build timestamp")
    result=[]
    def read(name):return json.loads((out/name).read_text(encoding="utf-8"))
    def add(key,group,title,url,record,latest_period=None,days=None,policy="Ротация источников; срок не гарантирован",archive=False,available=True,not_before=None,href="sources.html",failure_days=1,state_override=None):
        checked=dt(record.get("checked"));success=dt(record.get("success"))
        if archive:
            success=dt(record.get("downloaded")) if available else None
        status=str(record.get("status") or "")
        if record.get("error"):status+=" · "+str(record["error"])
        current=state_override or state(checked,success,status,now,days,archive,available)
        due=None
        if days and not archive:
            delay=timedelta(days=failure_days if current in ("cached","unavailable") else days)
            due=next_run(now,max(checked+delay if checked else now,not_before or now))
        elif not_before and not archive:due=next_run(now,not_before)
        result.append(dict(id=key,group=group,title=title,url=url,href=href,checked=iso(checked),success=iso(success),observation=latest_period,state=current,status=status,policy=policy,next_check=iso(due),interval_days=days))
    status=read("status.json");archive_rows=read("archive.json")
    latest_by_url={}
    for r in archive_rows:
        if r.get("source"):latest_by_url[r["source"]]=max(latest_by_url.get(r["source"],""),str(r.get("published") or "")[:10])
    for r in status.get("checks",[]):
        url=r.get("url","")
        if not re.search(r"rss|feed|atom",url,re.I):continue
        add("feed-"+hashlib.sha256(url.encode()).hexdigest()[:16],"Новости",url,url,r,days=1,policy="Ежедневная проверка RSS при сборке",href="news-map.html")
    # The aggregate archive publication date is not the success date of every feed.
    add("archive","Новости","Общий новостной архив",None,dict(status="Собранный архив; даты источников ниже",checked=status.get("built"),success=status.get("built")),latest(latest_by_url.values()),1,"Ежедневная сборка; не гарантия получения каждого источника",href="index.html#archive")
    for k,r in read("cbr.json").items():
        add("cbr-"+k,"Банк России",r["title"],r["source"],r,latest(x.get("date") for x in r["values"]),1,"Проверка при ежедневной сборке; торговые/рабочие дни",href="national.html")
    for k,r in read("national.json").items():
        add("nat-"+k,"Банк России",r["title"],r["source"],r,latest(x.get("period") for x in r["values"]),1,"Проверка при сборке; период публикации зависит от показателя",href="national.html")
    fns=read("finance-workbooks.json")
    fns_batches={str(b["year"]):b for b in fns["years"]}
    try:fns_catalog=read("finance-data.json").get("file_check",{})
    except (OSError,ValueError):fns_catalog={}
    for y,url in fns_catalog.get("files",{}).items():
        if y not in fns_batches:fns_batches[y]=dict(year=int(y),url=url,rows=[],status="Ожидается загрузка")
    for y,b in sorted(fns_batches.items()):
        record=dict(b,catalogue_url=fns_catalog.get("files",{}).get(y))
        add("fns-profit-"+y,"Финансы организаций","Рентабельность ФНС "+y,b["url"],b,y if b["rows"] else None,policy="30 суток после успеха, 7 после ошибки; до двух файлов за сборку",not_before=workbook_next(record,now),href="finance-workbooks.html")
    rosstat=read("rosstat-workbooks.json")
    books={b["url"]:b for b in rosstat["files"]}
    for cat in rosstat["catalogs"]:
        for f in cat.get("files",[]):
            books.setdefault(f["url"],dict(url=f["url"],title=f.get("title"),group=cat["group"],rows=[],status="Ожидается загрузка"))
    for url,b in sorted(books.items()):
        add("rosstat-book-"+hashlib.sha256(url.encode()).hexdigest()[:16],"Отраслевые таблицы Росстата",b.get("title") or url.rsplit("/",1)[-1],url,b,latest(r.get("period",r["year"]) for r in b["rows"]),policy="30 суток после успеха, 7 после сбоя; до трёх файлов за сборку",not_before=workbook_next(b,now),href="rosstat-workbooks.html")
    cmp=read("compare.json")
    for k,r in read("catalog.json").items():
        add("wdi-"+k,"Всемирный банк",r["title"],r["source"],r,latest(cmp.get(k,{}).get("values",{})),policy="Ротация годовых рядов; точный день не назначен",href="statistics.html")
    rx=read("regional-mining-energy.json")
    add("regional-mining-energy","Промышленность","Отгрузка по группам добычи и энергетики",rx["source"],rx,latest(r["year"] for r in rx["rows"] if r["value"] is not None),days=30,policy="Фиксированный выпуск v20260313; повтор после ошибки через 2 суток",archive=True,available=bool(rx["rows"]),href="regional-manufacturing.html?rm-group=coal")
    rm=read("regional-manufacturing.json")
    add("regional-manufacturing","Промышленность","Региональная отраслевая структура отгрузки",rm["source"],rm,latest(r["year"] for r in rm["rows"] if r["value"] is not None),days=30,policy="Фиксированный выпуск v20260313; повтор после ошибки через 2 суток",archive=True,available=bool(rm["rows"]),href="regional-manufacturing.html")
    law=read("federal-budget.json")
    add("federal-law","Государственные финансы","Федеральный бюджет · итоговые законы",law.get("source"),dict(status="Документальный снимок; сверка текстовых копий "+law["transcribed"]),latest(r["year"] for r in law["rows"]),archive=True,available=bool(law["rows"]),policy="Фиксированные итоговые законы; новые годы требуют документальной проверки",href="federal-budget.html")
    hist=read("historical.json")
    for r in hist.get("sources",[]):
        url=r.get("url","");key=r.get("code") or hashlib.sha256(url.encode()).hexdigest()[:12]
        # The latest year is known for a series, not for every discovery endpoint.
        observation=historical_latest(r,hist["series"])
        group="Государственные финансы" if key.startswith(("budget","minfin","import_minfin")) else "Региональная статистика"
        add("hist-"+key,group,r.get("title",key),url,r,observation,policy=r.get("retry_policy","Ротация источников и повторная проверка при сборке"),not_before=dt(r.get("next_due")),href="historical.html")
    for i,r in enumerate(read("industrial.json").get("sources",[])):
        add("industrial-"+str(i),"Промышленность",r["title"],r["url"],r,policy="Проверка официальных файлов при сборке",href="industrial.html")
    lit=read("literature.json")
    cooldown=dt(lit.get("service",{}).get("retry_at")) if lit.get("service",{}).get("cooldown") else None
    for i,r in enumerate(lit.get("checks",[])):
        add("journal-"+str(r.get("issn") or i),"Научные публикации",r.get("journal") or r.get("issn") or str(i),"https://search.crossref.org/",r,days=1,policy="Проверка при сборке с учётом Retry-After; не дата выхода журнала",not_before=cooldown,href="papers.html")
    for file,ident,title,href in [("food-balance.json","food","Продовольственные балансы FAOSTAT","food-balance.html"),("electricity-balance.json","electricity","Энергетические балансы OWID","industrial.html#electricity-balance")]:
        r=read(file)
        add(ident,"Отраслевые балансы",title,r.get("source"),r,latest(x.get("year") for x in r["rows"]),14,"14 суток после успеха, 1 сутки после сбоя",href=href)
    for file,ident,title,href,year in [("facility-energy.json","wri","Архив энергетических площадок WRI","facility-map.html","2021"),("district-meta.json","district","Административные районы ADM2","district-map.html","2017")]:
        r=read(file)
        add(ident,"География",title,r.get("documentation") or r.get("source"),r,year,archive=True,available=r["status"] in ("ok","cached"),policy="Фиксированный исторический набор; актуальность не предполагается",href=href)
    r=read("regional-boundaries.json")
    add("adm1","География","Границы субъектов Natural Earth",r.get("documentation"),dict(r,success=r.get("downloaded")),policy="Проверка при смене календарного месяца; не юридический реестр",href="economic-map.html")
    projects=read("investment-projects.json")
    add("regional-investment-projects","Предприятия","Бурятия · инвестиционные проекты",projects.get("source") or projects["source_page"],projects,projects.get("edition"),days=7,available=bool(projects["rows"]),policy="Проверка каждые 7 суток; при ошибке повтор через 2 суток; HTML при недоступности книги",href="investment-projects.html",failure_days=2)
    amur=read("amur-projects.json")
    add("amur-investment-projects","Предприятия","Амурская область · инвестиционные проекты",amur.get("source") or amur["source_page"],amur,amur.get("edition"),days=7,available=bool(amur["rows"]),policy="Проверка раз в 7 суток; при ошибке через 2 суток; отдельный региональный охват",href="amur-projects.html",failure_days=2)
    kd=read("krasnodar-projects.json")
    add("krasnodar-supported-projects","Предприятия","Краснодарский край · проекты на сопровождении",kd.get("source") or kd["source_page"],kd,kd.get("edition"),days=7,available=bool(kd["rows"]),policy="Проверка раз в 7 суток; при ошибке через 2 суток; перечень сопровождения",href="krasnodar-projects.html",failure_days=2)
    frp=read("frp-snapshot.json")
    add("frp-documentary","Предприятия","ФРП · документальный снимок итогов",frp["source"],dict(status="Ручной снимок; прямой запрос HTTP 403"),None,archive=True,available=bool(frp["rows"]),policy="Дата итогов не указана; повторная документальная проверка",href="frp-snapshot.html")
    cert=read("park-certificates.json")
    add("park-certificates","Предприятия","Документы добровольной сертификации АИП",cert["source"],cert,cert.get("success","")[:10] if cert.get("success") else None,days=7,available=bool(cert["rows"]),policy="Проверка каждые 7 суток; после ошибки через 2 суток; календарный срок не подтверждает отсутствие отзыва",href="industrial-parks.html#park-certificates",failure_days=2)
    p=read("industrial-parks.json")
    add("industrial-parks","Предприятия","Каталог индустриальных парков и ОЭЗ АИП",p["source"],p,(p.get("success") or "")[:10] or None,days=7,available=bool(p["rows"]),policy="Проверка каждые 7 суток; при ошибке повтор через 2 суток; текущая работа резидентов не подтверждается",href="industrial-parks.html",failure_days=2)
    ae=read("amur-enterprises.json")
    add("amur-enterprises","Предприятия","Амурская область · каталог организаций",ae["source"],ae,None,days=7,available=bool(ae["rows"]),policy="Проверка карточек каталога; не подтверждение действующего статуса",href="facility-map.html#amur-enterprise-directory",failure_days=2)
    banks=read("bank-directory.json")
    for k,title,days in [("system","Системно значимые банки",7),("full","Кредитные организации: полный список",1)]:
        r=banks["datasets"][k]
        add("banks-"+k,"Предприятия",title,r["source"],r,r["edition"],days=days,available=bool(r["rows"]),policy="Официальный перечень ЦБ; не финансовая отчётность",href="banks.html",failure_days=2)
    for name,title,capital in (("capital","Капитал банков · форма 808",True),("balance","Балансы банков · форма 806",False),("profit","Финансовые результаты банков · форма 807",False)):
        path=out/("bank-"+name+".json")
        if not path.is_file():continue
        d=read(path.name);p=bank_progress(d,capital)
        add("bank-form-"+name,"Банк России",title,"https://www.cbr.ru/banking_sector/credit/",p,d["period"],not_before=(dt(p["checked"]).replace(hour=0,minute=0,second=0,microsecond=0)+timedelta(days=1)) if p["checked"] else now,policy="До 20 запросов за сутки; повтор недоступной записи через 14 суток; период отчёта фиксирован",href="banks.html#bank-coverage",state_override=p["state"])
    path=out/"bank-disclosure.json"
    if path.is_file():
        d=read(path.name)
        verified=sum(v["status"]=="ok" for r in d["rows"] for v in r["forms"].values())
        checked=d.get("last_attempt") or d.get("checked")
        success=d.get("checked") if verified else None
        r=dict(checked=checked,success=success,status="Доступность дат форм: "+str(verified)+". Не числовые нормативы.")
        add("bank-disclosure-pilot","Банк России","Пилот раскрытия ЦБ",d["source"],r,None,days=7,policy="Пилот раз в 7 суток; только проверка дат и идентификаторов",href="banks.html",failure_days=7,state_override=("cached" if verified and checked!=success else "partial" if verified else "unavailable" if checked else "waiting"))
    path=out/"group-passports.json"
    if path.is_file():
        d=read(path.name)
        add("corporate-documentary","Предприятия","Корпоративные группы · документальные паспорта",None,dict(checked=d.get("checked"),status="Документальный снимок: "+str(len(d["groups"]))+" групп"),latest(o["year"] for g in d["groups"] for m in g["metrics"] for o in m["observations"]),archive=True,available=bool(d["groups"]),policy="Новые отчёты требуют документальной проверки; не автоматический импорт МСФО",href="company-atlas.html#group-passports")
    path=out/"company-index.json"
    if path.is_file():
        d=read(path.name);ready=d["status"]=="ready"
        add("company-full-index","Предприятия","ФНС · полный финансовый индекс",None,dict(status="Записей: "+str(d.get("count",0))+"; не ЕГРЮЛ"),str(d["year"]) if ready else None,policy="Перестраивается при смене выпуска финансовых архивов; при сбое сохраняется совместимый снимок. Дата успешной загрузки в паспорте индекса не указана.",href="company-atlas.html#company-lookup",state_override="ok" if ready else "waiting")
    path=out/"sme-finance.json"
    if path.is_file():
        d=read(path.name);ready=d.get("status")=="diagnostic"
        paired=ready and d.get("paired_sums_version")==1
        profiles=ready and "profiles" in d
        add("sme-finance-join","Предприятия","МСП · финансово-отраслевое сопоставление",None,dict(status=("Парные суммы: "+("есть" if paired else "нет")+"; пилот паспортов: "+("есть" if profiles else "нет"))),str(d["financial_year"])+" / "+d["sme_edition"] if ready else None,policy="Полный импорт 12-го и 19-го числа; дата следующей успешной загрузки неизвестна",href="company-atlas.html#sme-finance",state_override="partial" if ready else "waiting")
    corporate=read("company-sources.json")
    for r in corporate["rows"]:
        add("company-source-"+r["kind"],"Предприятия","ФНС · "+("Доходы и расходы" if r["kind"]=="income_expense" else "Среднесписочная численность"),r["catalog"],r,str(r["report_year"]) if r["report_year"] else None,days=7,available=bool(r["archive"]),policy="Проверка паспорта и XSD; наблюдения ещё не импортированы",href="company-atlas.html#company-source-check",failure_days=2)
    ranks=read("company-rankings.json")
    add("company-rankings","Предприятия","ФНС · рейтинги полных открытых архивов",corporate["rows"][0]["catalog"],ranks,str(ranks["report"]["year"]) if ranks["report"] else None,days=7,available=bool(ranks["report"]),policy="Импорт при смене выпуска; повтор через 2 суток после ошибки",href="company-atlas.html#company-rankings",failure_days=2)
    enterprise=read("enterprise-sources.json")
    for r in enterprise["rows"]:
        title={"organizations":"Организации","entrepreneurs":"ИП"}[r["kind"]]
        add("enterprise-register-"+r["kind"],"Предприятия","Росстат · "+title+" · проверка файла (без импорта)",r.get("url") or enterprise["source"],r,None,days=7,available=bool(r["sheets"]),policy="Проверка структуры оригинала; 7 суток после успеха, 2 после ошибки. Наблюдения не импортированы.",href="facility-map.html#enterprise-source-section",failure_days=2)
    r=read("sme-regions.json")
    add("sme","Предприятия","Агрегаты реестра МСП ФНС",r.get("documentation"),dict(r,success=r.get("downloaded")),r.get("period"),policy="Ожидаемый месячный срез на 10-е; проверка при сборке",href="facility-map.html#sme-map-section")
    return dict(schema=1,built=stamp,rows=result,policy="Даты следующей проверки — расчётные сроки внутреннего процесса, не календарь публикаций ведомств. При задержке сборки могут сдвигаться.")

def quality(data):
    if data.get("schema")!=1 or not dt(data.get("built")) or not isinstance(data.get("rows"),list) or not data["rows"]:raise ValueError("invalid freshness ledger")
    ids=set();counts={}
    for r in data["rows"]:
        if not r.get("id") or r["id"] in ids:raise ValueError("duplicate source id")
        ids.add(r["id"])
        k=r["state"]
        if k not in ("ok","cached","partial","overdue","waiting","unavailable","archive"):raise ValueError("invalid freshness status")
        for field in ("checked","success","next_check"):
            if r.get(field) is not None and not dt(r[field]):raise ValueError("invalid timestamp")
        if r.get("next_check") and dt(r["next_check"])<=dt(data["built"]):raise ValueError("next check is not future")
        if k=="archive" and r.get("next_check"):raise ValueError("archive has scheduled update")
        counts[k]=counts.get(k,0)+1
    return counts

def publish(page,out,stamp):
    data=collect(out,stamp);quality(data)
    (out/"freshness.json").write_text(json.dumps(data,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    page("freshness.html",'<section class="mast"><p class="kicker">Источники · автоматизация</p><h1>Контроль обновлений</h1><p>Даты наблюдения, успешной загрузки и внутренней проверки разделены. Исторический архив не считается свежим только потому, что сайт собран сегодня. Расчётный календарь проверок — не обещание даты выпуска ведомства.</p><p><a href="sources.html">Подробные источники</a> · <a href="updates.html">Журнал изменений</a> · <a href="methodology.html#freshness-method">Методика</a> · <a href="freshness.json">JSON</a></p></section><section><h2>Состояние наборов</h2><form id="fresh-form"><label>Группа<select id="fresh-group"><option value="">Все</option></select></label><label>Состояние<select id="fresh-state"><option value="">Все</option><option value="ok">Успешная загрузка</option><option value="cached">Сохранённые данные / сбой</option><option value="partial">Частичный импорт</option><option value="overdue">Просрочена проверка</option><option value="waiting">Ожидается загрузка</option><option value="unavailable">Недоступно</option><option value="archive">Исторический архив</option></select></label><label>Поиск<input id="fresh-query" type="search"></label></form><p id="fresh-status" role="status">Загрузка…</p><div id="fresh-summary" class="metrics"></div><button id="fresh-export" disabled>Выгрузить выбранные строки CSV</button><div id="fresh-table"></div><button id="fresh-more" hidden>Показать ещё</button></section><script defer src="provenance.js"></script><script defer src="freshness.js"></script>')
