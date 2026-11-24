"""Audit generated pages and rotate HTTP checks across the public archive."""
import json
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError

class Page(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.links=[]
        self.ids=set()
        self.feed(source)
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if a.get("id"): self.ids.add(a["id"])
        if tag=="a" and a.get("name"): self.ids.add(a["name"])
        for key in ("href","src"):
            if a.get(key): self.links.append(a[key])

# Only known public publishers and official sources are contacted automatically.
# All other external addresses are still inventoried.
TRUSTED=("gov.ru","pravo.gov.ru","cbr.ru","rosstat.gov.ru","worldbank.org","imf.org","oecd.org","un.org","unido.org","rbc.ru","tass.ru","interfax.ru","kommersant.ru","vedomosti.ru","ria.ru","1prime.ru","rg.ru","economy.gov.ru","minfin.gov.ru","nalog.gov.ru","hse.ru","rcsi.science","1economic.ru","vopreco.ru","econorus.org","economyofregion.ru","questionset.ru","asnap.ru","crossref.org","e-library.ru","elibrary.ru","scopus.com","clarivate.com","cyberleninka.ru","issn.org","doaj.org","repec.org","github.com","github.io","consultant.ru","rosspetsmash.ru","fedstat.ru","roskazna.gov.ru","customs.gov.ru")
def trusted(url):
    try:
        p=urlsplit(url)
        h=p.hostname or ""
        return p.scheme in ("http","https") and not p.username and not p.password and p.port in (None,80,443) and any(h==s or h.endswith("."+s) for s in TRUSTED)
    except ValueError:return False

def http_check(url):
    try:
        req=Request(url,headers={"User-Agent":"EconomicsMonitor/1.0","Accept":"text/html,application/pdf,*/*","Range":"bytes=0-1023"})
        with urlopen(req,timeout=8) as r:
            return url,"ok",str(r.status)
    except HTTPError as e:
        status="missing" if e.code in (404,410) else "restricted" if e.code in (401,403,429,451) else "error"
        return url,status,str(e.code)
    except Exception as e:return url,"error",type(e).__name__

def scan(out):
    pages={p.relative_to(out).as_posix():Page(p.read_text(encoding="utf-8")) for p in out.rglob("*.html")}
    files={p.relative_to(out).as_posix() for p in out.rglob("*") if p.is_file()}
    files.update({"version.txt"}) # written by publish.yml after build
    import posixpath
    issues=[]; external=set()
    for name,p in pages.items():
        for href in set(p.links):
            try: u=urlsplit(href)
            except ValueError:
                issues.append((name,href,"Некорректный URL")); continue
            if u.scheme in ("http","https"):
                external.add(href); continue
            if u.netloc or u.scheme in ("mailto","tel","data","blob"):continue
            if u.scheme:
                issues.append((name,href,"Неизвестная схема"));continue
            path=unquote(u.path)
            if path.startswith("/"):
                if path.startswith("/---/"):path=path[5:]
                else:
                    issues.append((name,href,"Абсолютный путь вне каталога GitHub Pages"));continue
            elif path:path=posixpath.normpath(posixpath.join(posixpath.dirname(name),path))
            else:path=name
            if path.endswith("/") or path in ("","."):path=posixpath.join(path,"index.html").lstrip("./")
            elif path not in files and path+"/index.html" in files:path+="/index.html"
            if path not in files:
                issues.append((name,href,"Файл не найден"))
            elif u.fragment and path in pages and unquote(u.fragment) not in pages[path].ids and not u.fragment.startswith(":~:text="):
                issues.append((name,href,"Раздел не найден"))
    return sorted(set(issues)),external

def publish(page,out,connect,stamp,refresh):
    page("links.html",'<h1>Проверка ссылок</h1><a href="links.json">Отчёт</a>')
    (out/"links.json").write_text("{}",encoding="utf-8")
    internal,external=scan(out)
    with connect() as db:
        db.execute("create table if not exists site_links(url text primary key,status text,detail text,checked text)")
        external.update(r[0] for r in db.execute("select distinct url from articles where url is not null") if r[0])
        external.update(r[0] for r in db.execute("select url from checks where url is not null") if r[0])
        catalogue=json.loads((out/"literature.json").read_text())
        for m in catalogue.get("registry",{}).values():external.update([m.get("site",""),*m.get("sources",[])])
        historical=out/"historical.json"
        if historical.exists():
            data=json.loads(historical.read_text())
            for item in data.get("sources",[]):
                external.add(item["url"])
                external.update(f["url"] for f in item.get("files",[]))
        external.discard("")
        old={r[0]:(r[1],r[2],r[3]) for r in db.execute("select url,status,detail,checked from site_links")}
        if refresh:
            pending=sorted((u for u in external if trusted(u)),key=lambda u:(u in old,old.get(u,("","",""))[2],u))[:60]
            with ThreadPoolExecutor(max_workers=8) as pool:
                results=[(*r,stamp) for r in pool.map(http_check,pending)]
            db.executemany("insert or replace into site_links values(?,?,?,?)",results)
            old.update({u:(s,d,t) for u,s,d,t in results})
    totals=Counter(old.get(u,("unchecked","",""))[0] for u in external)
    labels={"ok":"HTTP-проверка успешна","missing":"HTTP 404/410","restricted":"Ограничен доступ","error":"Ошибка сети или HTTP","unchecked":"Не проверено"}
    body='<section class="mast"><h1>Проверка ссылок</h1><p>Внутренние страницы проверяются при каждой сборке. Внешние ссылки на известные публичные источники проверяются по 60 за обновление. DOI научных статей проверяются отдельно в научном каталоге.</p><p>Сборка: '+escape(stamp)+' UTC</p></section>'
    body+='<h2>Внутренние ссылки</h2><p>Найдено проблем: '+str(len(internal))+'</p>'
    if internal:
        body+='<table><thead><tr><th>Страница</th><th>Ссылка</th><th>Проблема</th></tr></thead><tbody>'
        for name,url,error in internal:body+='<tr><td>'+escape(name)+'</td><td>'+escape(url)+'</td><td>'+escape(error)+'</td></tr>'
        body+='</tbody></table>'
    body+='<h2>Внешние ссылки (без DOI)</h2><p>Всего: '+str(len(external))+'; в очереди автоматической проверки: '+str(sum(trusted(u) for u in external))+'</p><ul>'
    for k,label in labels.items():body+='<li>'+escape(label)+': '+str(totals[k])+'</li>'
    body+='</ul><p>Проверка HTTP не гарантирует доступность полного текста или достоверность материала. Ограничения и временные ошибки не удаляют ссылку.</p>'
    errors=[(u,*old[u]) for u in sorted(external) if u in old and old[u][0]!="ok"]
    body+='<h2>Последние проблемные адреса</h2><p>Показано до 200. Полный перечень проверенных ссылок — в JSON.</p><p><a href="links.json" download>Скачать отчёт JSON</a></p><table><thead><tr><th>Адрес</th><th>Результат</th><th>Проверка</th></tr></thead><tbody>'
    for u,s,d,t in sorted(errors,key=lambda x:x[3],reverse=True)[:200]:
        body+='<tr><td>'+escape(u)+'</td><td>'+escape(labels.get(s,s)+' · '+d)+'</td><td>'+escape(t)+'</td></tr>'
    page("links.html",body+"</tbody></table>")
    (out/"links.json").write_text(json.dumps({"built":stamp,"internal_errors":internal,"external_totals":dict(totals),"external":[{"url":u,"status":old.get(u,("unchecked","",""))[0],"detail":old.get(u,("","",""))[1],"checked":old.get(u,("","",""))[2],"eligible":trusted(u)} for u in sorted(external)]},ensure_ascii=False),encoding="utf-8")
