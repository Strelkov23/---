"""Economic Monitor. Runtime dependencies: Python standard library and SQLite FTS5."""
import legislation
import teams
from analytics import dashboard, compare
from series import SERIES, refresh
import csv
import io
import json
import os
import re
import sqlite3
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html import escape
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit, urljoin
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent
DB = Path(os.environ.get("MONITOR_DB", str(ROOT / "data" / "monitor.db")))
FEEDS = json.loads((ROOT / "feeds.json").read_text())
MODEL = json.loads((ROOT / "sectors.json").read_text())
def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
def connect():
    DB.parent.mkdir(exist_ok=True, parents=True)
    conn = sqlite3.connect(DB, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn
def safe_url(url):
    return urlsplit(url).scheme in ("http", "https") and bool(urlsplit(url).netloc)
def put(db, title, url, published, source, sector, stamp, update=True):
    if not title or not safe_url(url):
        return
    db.execute("insert or ignore into articles(title,url,published,source,seen) values(?,?,?,?,?)",(title,url,published,source,stamp))
    idx = db.execute("select id from articles where url=?", (url,)).fetchone()[0]
    last = db.execute("select title,published from revision_events where article=? order by id desc limit 1",(idx,)).fetchone()
    if update:
        original=db.execute("select title,published from articles where id=?",(idx,)).fetchone()
        published=published or original["published"]
        if (title,published)!=tuple(original):
            db.execute("update articles set title=?,published=? where id=?",(title,published,idx))
            db.execute("update search set title=? where rowid=?",(title,idx))
    if (update or last is None) and (last is None or tuple(last)!=(title,published)):
        db.execute("insert into revision_events(article,title,published,seen) values(?,?,?,?)",(idx,title,published,stamp))
    db.execute("insert or ignore into topics values(?,?)",(idx,sector))
    db.execute("insert or ignore into revisions values(?,?,?,?)",(idx,title,published,stamp))
def init():
    with connect() as db:
        db.executescript("""
        pragma journal_mode=WAL;
        create table if not exists articles(id integer primary key,title text,url text unique,published text,source text,seen text);
        create virtual table if not exists search using fts5(title,source,tokenize='unicode61');
        create trigger if not exists index_article after insert on articles begin
          insert into search(rowid,title,source) values(new.id,new.title,new.source);
        end;
        create table if not exists topics(article integer,topic text,primary key(article,topic));
        create table if not exists revisions(article integer,title text,published text,seen text,primary key(article,title,published));
        create table if not exists annual(code text,year text,value real,seen text,primary key(code,year,seen));
        create table if not exists checks(url text primary key,checked text,success text,status text);
        """)
        db.executescript("create table if not exists teams(token text primary key,rev integer,title text,owner text,body text,stage text); create table if not exists teamlog(token text,rev integer,stamp text,stage text,body text,primary key(token,rev));")
        if not db.execute("select 1 from sqlite_master where name='revision_events'").fetchone():
            db.execute("create table revision_events(id integer primary key,article integer,title text,published text,seen text)")
            db.execute("create index revision_article on revision_events(article,id)")
            db.execute("insert into revision_events(article,title,published,seen) select article,title,published,seen from revisions order by seen,rowid")
        legislation.setup(db)
        for row in json.loads((ROOT/"initial.json").read_text()):
            put(db,*row,now(),update=False)
ECONOMIC_RUBRICS = {
    "https://tass.ru/rss/v2.xml": {"Экономика и бизнес"},
    "https://www.pnp.ru/rss/index.xml": {"Экономика"},
    "https://www.interfax.ru/rss.asp": {"Экономика", "Бизнес"},
}

def items(xml, base):
    root = ET.fromstring(xml)
    for el in root.iter():
        el.tag = el.tag.split("}")[-1]
    if root.tag.lower() not in ("rss","rdf","feed"):
        raise ValueError("Ответ источника не является RSS/Atom")
    for entry in root.iter():
        if entry.tag not in ("item","entry"):
            continue
        allowed = ECONOMIC_RUBRICS.get(base)
        if allowed and not any(tag.text in allowed for tag in entry.findall("category")):
            continue
        link = next((x.get("href") or x.text for x in entry.findall("link") if x.get("rel","alternate")=="alternate"),"")
        title = (entry.findtext("title") or "").strip()
        date = entry.findtext("pubDate") or entry.findtext("published") or entry.findtext("updated") or entry.findtext("date") or ""
        try:
            dt = datetime.fromisoformat(date.replace("Z","+00:00")) if re.match(r"\d{4}-",date) else parsedate_to_datetime(date)
            date = dt.astimezone(timezone.utc).date().isoformat()
        except (ValueError,TypeError,OverflowError):
            date = ""
        if title and link:
            yield title,urljoin(base,link.strip()).split("#")[0],date
def collect(feed):
    sector,source,url,_ = feed
    stamp=now()
    try:
        with urlopen(Request(url,headers={"User-Agent":"EconomicsMonitor/1.0 (RSS reader)"}), timeout=15) as response:
            xml=response.read(4_000_001)
        if len(xml)>4_000_000:
            raise ValueError("Лента превышает лимит размера")
        rows=list(items(xml,url))
        with connect() as db:
            for title,link,date in rows:
                put(db,title,link,date,source,sector,stamp)
            db.execute("insert or replace into checks values(?,?,?,?)",(url,stamp,stamp,f"Получено записей: {len(rows)}"))
    except Exception as err:
        with connect() as db:
            db.execute("insert into checks values(?,?,null,?) on conflict(url) do update set checked=excluded.checked,status=excluded.status",(url,stamp,"Ошибка: "+str(err)[:180]))
def collect_all():
    with ThreadPoolExecutor(max_workers=4) as workers:
        list(workers.map(collect,FEEDS))
    with connect() as db:
        legislation.sync(db,put)
        refresh(db,now())
def query(db, p):
    terms=re.findall(r"[^\W_]+",p.get("q","")[:240],re.UNICODE)
    sql="select a.*, (select group_concat(topic, ', ') from topics where article=a.id) sectors from articles a where 1"
    args=[]
    if terms:
        sql+=" and id in (select rowid from search where search match ?)"
        args.append(" AND ".join('"'+word+'"*' for word in terms))
    if p.get("publisher"):
        sql+=" and source=?"
        args.append(p["publisher"])
    if p.get("sector"):
        sql+=" and exists(select 1 from topics where article=a.id and topic=?)"
        args.append(p["sector"])
    for key,op in [("start",">="),("end","<=")]:
        if p.get(key):
            sql+=" and published "+op+" ? and published<>''"
            args.append(p[key])
    return sql+" order by published desc,id desc",args

def h(x): return escape(str(x or ""),quote=True)
def page(body):
    return ('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Экономический обзор</title><link rel="stylesheet" href="/style.css"><header><strong>Экономический обзор</strong><nav><a href="/team">Работа отдела</a><a href="/laws">Законодательство</a><a href="/watch">Мониторинг</a><a href="/overview">Обзор</a><a href="/compare">Сравнение</a><a href="/archive">Архив</a><a href="/stats">Статистика</a><a href="/model">Модель отраслей</a><a href="/sources">Источники</a><a href="/desk">Моя подборка</a></nav></header><main>'+body+'</main><script defer src="/desk.js"></script></html>').encode()
def archive(db,p):
    sql,args=query(db,p)
    try: offset=max(0,int(p.get("page","1"))-1)*40
    except ValueError: offset=0
    offset=min(offset,10**8)
    rows=db.execute(sql+" limit 41 offset ?",[*args,offset]).fetchall()
    opts_set=set(x[0] for x in FEEDS)|{r[0] for r in db.execute("select distinct topic from topics")}
    opts=''.join('<option '+('selected' if t==p.get("sector") else '')+'>'+h(t)+'</option>' for t in sorted(opts_set))
    body=f'<p class="kicker">Исследовательская база</p><h1>Архив экономики</h1><form><label>Поиск по заголовку и источнику<input type="search" name="q" value="{h(p.get("q"))}" placeholder="Например, промышленное производство"></label><label>Отрасль<select name="sector"><option value="">Все отрасли</option>{opts}</select></label>'
    publishers=sorted(row[0] for row in db.execute("select distinct source from articles"))
    body+='<label>Источник<select name="publisher"><option value="">Все источники</option>'+''.join('<option '+('selected' if v==p.get("publisher") else '')+'>'+h(v)+'</option>' for v in publishers)+'</select></label>'
    for key,label in [("start","Публикации с"),("end","По дату")]:
        body+=f'<label>{label}<input type="date" name="{key}" value="{h(p.get(key))}"></label>'
    body+='<button>Найти</button></form>'
    total=db.execute("select count(*) from ("+sql+")",args).fetchone()[0]
    body+=f'<p>Найдено материалов: {total} · <a href="/export?{h(urlencode(p))}">Скачать выборку CSV</a></p>'
    params=h(urlencode({k:v for k,v in p.items() if k!="page"}))
    body+=f'<button id="savewatch" data-path="/archive?{params}">Сохранить этот поиск</button> · <a href="/rss?{params}">RSS по запросу</a> · <a href="/brief?{params}">Сводка за неделю</a>'
    for r in rows[:40]:
        body+=f'<article><small>{h(r["published"]) or "Дата публикации не указана"} · {h(r["source"])}</small><h2><a href="{h(r["url"])}">{h(r["title"])}</a></h2><p>{h(r["sectors"])}</p><button class="save" data-title="{h(r["title"])}" data-source="{h(r["source"])}" data-date="{h(r["published"])}" data-url="{h(r["url"])}">В подборку</button></article>'
    for n,label in [(offset//40,"Предыдущие"),(offset//40+2,"Следующие")]:
        if (n==offset//40 and offset) or (n>offset//40 and len(rows)>40):
            body+=f'<a href="/?{h(urlencode(dict(p,page=n)))}">{label}</a> '
    return body
def model(p):
    names=MODEL["names"]
    try: i=max(0,min(len(names)-1,int(p.get("i","8")))); shock=max(-20,min(20,int(p.get("shock","10"))))
    except ValueError: i,shock=8,10
    try: alternative=max(-20,min(20,int(p.get('alternative','5'))))
    except ValueError: alternative=5
    options=''.join(f'<option value="{n}" {"selected" if n==i else ""}>{h(s)}</option>' for n,s in enumerate(names))
    changes=[row[i]*shock/100000 for row in MODEL["effects"]]
    body=f'<p class="kicker">Межотраслевой баланс · 2021</p><h1>Сценарий конечного спроса</h1><form><label>Отраслевая группа<select name="i">{options}</select></label><label>Изменение спроса, %<input name="shock" type="number" min="-20" max="20" value="{shock}" required></label><label>Альтернативный спрос, %<input name="alternative" type="number" min="-20" max="20" value="{alternative}" required></label><button>Рассчитать</button></form><article><small>Изменение валового выпуска по стране</small><h2>{sum(changes):+,.2f} млрд ₽</h2><p>Спрос на отечественную продукцию выбранной группы меняется на {shock}%. Расчёт Леонтьева учитывает прямые и косвенные потребности при фиксированных коэффициентах затрат и ценах 2021 года. Валовой выпуск включает промежуточную продукцию.</p></article><h2>Кто поставлял ресурсы этой группе</h2>'
    flows=sorted([(row[i],j) for j,row in enumerate(MODEL["flows"]) if j!=i and row[i]>0],reverse=True)[:5]
    for val,j in flows:
        body+=f'<p>{h(names[j])} · {val/1000:,.1f} млрд ₽<br><meter min="0" max="{flows[0][0]}" value="{val}"></meter></p>'
    body+='<h2>Изменения выпуска по отраслям</h2><table><tr><th>Группа</th><th>Основной сценарий, млрд ₽</th><th>Альтернатива, млрд ₽</th></tr>'
    for j in sorted(range(len(names)),key=lambda j:abs(changes[j]),reverse=True):
        body+=f'<tr><td>{h(names[j])}</td><td>{changes[j]:+,.2f}</td><td>{MODEL["effects"][j][i]*alternative/100000:+,.2f}</td></tr>'
    body+=f'</table><button id="savewatch" data-path="/model?i={i}&amp;shock={shock}&amp;alternative={alternative}">Сохранить сценарии</button> <button id="tablecsv">Скачать расчёт CSV</button>'
    return body+'<p>113 продуктовых позиций объединены в 19 групп. Источник: <a href="https://rosstat.gov.ru/storage/mediabank/baz_tzv-2021.xlsx">базовые таблицы Росстата за 2021 год</a>.</p>'
def app(env,start):
    path=env["PATH_INFO"]
    p={k:v[0] for k,v in parse_qs(env.get("QUERY_STRING","")[:4000]).items()}
    mime="text/html; charset=utf-8"
    status="200 OK"
    with connect() as db:
        if path=="/overview" or (path=="/" and not p): content=page(dashboard(db,p))
        elif path=="/team" or path.startswith("/team/"):
            status,body=teams.route(db,env,path); content=page(body)
        elif path in ("/robots.txt","/sitemap.xml"):
            domain=os.environ.get("PUBLIC_DOMAIN","").strip()
            origin="https://"+domain if domain else ""
            if path=="/robots.txt":
                mime="text/plain; charset=utf-8"
                content=("User-agent: *\nAllow: /\n"+("Sitemap: "+origin+"/sitemap.xml\n" if origin else "")).encode()
            elif origin:
                mime="application/xml; charset=utf-8"
                urls=ET.Element("urlset",xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
                for route in ("/","/archive","/laws","/stats","/model","/compare","/sources"):
                    ET.SubElement(ET.SubElement(urls,"url"),"loc").text=origin+route
                content=ET.tostring(urls,encoding="utf-8",xml_declaration=True)
            else:
                status="503 Service Unavailable";content=page("Для карты сайта укажите PUBLIC_DOMAIN.")
        elif path=="/laws": content=page(legislation.journal(db))
        elif path=="/watch": content=page('<h1>Мой мониторинг</h1><p>Выберите тему, дату и источник в архиве, затем сохраните поиск. Для уведомлений подключите его RSS в своей программе чтения лент.</p><a href="/archive">Настроить поиск</a><div id="watches"></div>')
        elif path=="/brief":
            from datetime import date,timedelta
            today=date.today()
            filt=dict(p,start=max(p.get("start",""),str(today-timedelta(days=6))),end=min(p.get("end",str(today)),str(today)))
            sql,args=query(db,filt)
            rows=db.execute(sql,args).fetchall()
            body=f'<h1>Тематическая сводка</h1><p>{h(filt["start"])} — {h(filt["end"])} · Материалов: {len(rows)}</p><button id="print">Печать / PDF</button>'
            for row in rows: body+=f'<p>{h(row["published"])} · {h(row["source"])}<br><a href="{h(row["url"])}">{h(row["title"])}</a></p>'
            content=page(body)
        elif path=="/rss":
            sql,args=query(db,p)
            rss=ET.Element("rss",version="2.0"); channel=ET.SubElement(rss,"channel")
            for k,v in [("title","Экономический мониторинг"),("description","Последние материалы выбранной темы"),("link","/archive?"+urlencode(p))]: ET.SubElement(channel,k).text=v
            for r in db.execute(sql+" limit 80",args):
                item=ET.SubElement(channel,"item")
                for k in ["title","link","guid"]: ET.SubElement(item,k).text=r["title"] if k=="title" else r["url"]
            content=ET.tostring(rss,encoding="utf-8",xml_declaration=True); mime="application/rss+xml; charset=utf-8"
        elif path=="/compare": content=page(compare(db,p))
        elif path in ("/","/archive"): content=page(archive(db,p))
        elif path=="/stats":
            body='<p class="kicker">Наблюдения из рабочей базы</p><h1>Промышленная статистика</h1><p>Архивный срез. Значения относятся к указанному месяцу. Новые числовые ряды в этот раздел автоматически не загружаются.</p>'
            for obs in sorted(json.loads((ROOT/"observations.json").read_text()),key=lambda x:x["period"],reverse=True):
                body+=f'<article><small>{h(obs["period"])}</small><h2>{h(obs["series"])} · {h(obs["value"])} {h(obs["unit"])}</h2><p>{h(obs["basis"])}</p><a href="{h(obs["url"])}">Публикация источника</a></article>'
            body+='<h2>Добавленная стоимость по отраслям, % ВВП России</h2><p>Сборщик запрашивает годовые ряды Всемирного банка ежедневно и сохраняет опубликованные значения. Обработка входит в промышленность.</p>'
            for code,name in SERIES.items():
                url=f"https://api.worldbank.org/v2/country/RUS/indicator/{code}?format=json&per_page=200"
                log=db.execute("select * from checks where url=?",(url,)).fetchone()
                body+=f'<article><h2>{h(name)}</h2><small>{h(log["status"]) if log else "Ожидает загрузки"} · Успешная проверка: {h(log["success"]) if log and log["success"] else "—"}</small><p>'
                for row in db.execute("select year,value,max(seen) from annual where code=? group by year order by year desc limit 10",(code,)):
                    body+=f'{h(row[0])}: {row[1]:.2f}%<br>'
                body+=f'</p><a href="https://data.worldbank.org/indicator/{code}?locations=RU">Исходный ряд</a></article>'
            content=page(body)
        elif path=="/model": content=page(model(p))
        elif path=="/desk": content=page('<p class="kicker">Для статей и обзоров</p><h1>Моя подборка</h1><p>Материалы и заметки сохраняются в этом браузере. Скачайте подборку для работы на другом устройстве.</p><button id="download">Скачать в Markdown</button><div id="desk"></div>')
        elif path=="/sources":
            body='<h1>Состояние источников</h1><p>Время указано в UTC. Плановая проверка на GitHub запускается ежедневно в 06:17 по Москве. Издания сами определяют время публикации.</p>'
            for sector,name,url,_ in FEEDS:
                r=db.execute("select * from checks where url=?",(url,)).fetchone()
                body+=f'<article><small>{h(name)}</small><h2><a href="{h(url)}">{h(sector)}</a></h2><p>{h(r["status"]) if r else "Ожидает проверки"}</p><small>Проверка: {h(r["checked"]) if r else "—"} · Последний успех: {h(r["success"]) if r and r["success"] else "—"}</small></article>'
            content=page(body)
        elif path=="/export":
            sql,args=query(db,p)
            out=io.StringIO(); writer=csv.writer(out); writer.writerow(["Дата публикации","Заголовок","Источник","Отрасли","Ссылка"])
            for r in db.execute(sql,args):
                writer.writerow([("'"+v if v.lstrip().startswith(("=","+","-","@")) else v) for v in [r["published"],r["title"],r["source"],r["sectors"] or "",r["url"]]])
            content=out.getvalue().encode("utf-8-sig"); mime="text/csv; charset=utf-8"
        elif path in ("/style.css","/desk.js"):
            content=(ROOT/path[1:]).read_bytes(); mime="text/css" if path.endswith("css") else "text/javascript"
        else: status="404 Not Found"; content=page("<h1>Страница не найдена</h1>")
    headers=[("Content-Type",mime),("X-Content-Type-Options","nosniff"),("Content-Security-Policy","default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")]
    if path=="/export": headers.append(("Content-Disposition",'attachment; filename="economy.csv"'))
    if path.startswith("/team"): headers.extend([("Cache-Control","no-store"),("Referrer-Policy","no-referrer"),("X-Robots-Tag","noindex")])
    if path in ("/desk","/watch","/brief","/export","/rss"): headers.append(("X-Robots-Tag","noindex"))
    start(status,headers)
    return [content]
if __name__=="__main__":
    init()
    cmd=sys.argv[1] if len(sys.argv)>1 else "serve"
    if cmd=="collect": collect_all()
    elif cmd=="worker":
        while True:
            collect_all()
            time.sleep(1800)
    elif cmd=="serve":
        from wsgiref.simple_server import make_server
        make_server("127.0.0.1",8000,app).serve_forever()
