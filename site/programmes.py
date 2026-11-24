"""Traceable official mentions, not an execution register or KPI estimate."""
import csv
import goals
import annual_goals
import json
import re
from collections import Counter
from html import escape
from urllib.parse import urlsplit

KINDS={
    "Национальные проекты":r"\bнацпроект\w*|\bнациональн\w+\s+проект\w*",
    "Государственные программы":r"\bгоспрограмм\w*|\bгосударственн\w+\s+программ\w*",
    "Федеральные проекты":r"\bфедеральн\w+\s+проект\w*",
    "Стратегии и планы":r"\bстратеги\w+\s+(?:социально-экономическ\w+|пространственн\w+|развити\w+)|\bплан\w*\s+(?:реализаци\w+|мероприяти\w+)",
}
SOURCES={"Правительство России","Правительство РФ","Официальное опубликование правовых актов","ФНС России","Банк России"}
ACTIONS={
    "Финансирование":r"\bфинансирован\w*|\bсубсиди\w*|\bассигнован\w*|\bбюджет\w*",
    "Изменение документов":r"\bвнесен\w+\s+изменени\w*|\bизменени\w+|\bкорректиров\w*",
    "Отчётность и контроль":r"\bотч[её]т\w*|\bмониторинг\w*|\bконтрол\w*",
    "Утверждение":r"\bутвержд\w*|\bутверд\w*",
}
def safe_url(url):
    try:
        p=urlsplit(url)
        return p.scheme in ("http","https") and not p.username and not p.password and p.port in (80,443,None) and any(p.hostname==h or (p.hostname or "").endswith("."+h) for h in ("government.ru","pravo.gov.ru","nalog.gov.ru","cbr.ru"))
    except (ValueError,TypeError):return False

def classify(articles):
    found={}
    for a in articles:
        title=a.get("title") or ""
        url=a.get("url") or ""
        source=a.get("source") or ""
        if source not in SOURCES or not safe_url(url):continue
        kinds=[k for k,p in KINDS.items() if re.search(p,title,re.I)]
        if not kinds:continue
        actions=[k for k,p in ACTIONS.items() if re.search(p,title,re.I)]
        row={"title":title,"url":url,"source":source,"published":a.get("published") or "", "seen":a.get("seen") or "", "kinds":kinds,"actions":actions,"topics":a.get("topics") or ""}
        if url not in found or (row["published"],row["seen"],row["title"])>(found[url]["published"],found[url]["seen"],found[url]["title"]):found[url]=row
    return sorted(found.values(),key=lambda r:(r["published"],r["url"]),reverse=True)

def safe_csv(v):
    s=str(v)
    return "'"+s if s.lstrip().startswith(("=","+","-","@")) or s.startswith(("\t","\r","\n")) else s

def publish(page,out,articles,stamp):
    rows=classify(articles)
    counts=Counter(k for r in rows for k in r["kinds"])
    (out/"programmes.json").write_text(json.dumps({"built":stamp,"kinds":list(KINDS),"actions":list(ACTIONS),"rows":rows},ensure_ascii=False),encoding="utf-8")
    with (out/"programmes.csv").open("w",encoding="utf-8-sig",newline="") as f:
        writer=csv.writer(f)
        writer.writerow(["Дата публикации","Источник","Заголовок","Тип упоминания","Признаки действия","Темы архива","URL","Обнаружено"])
        for r in rows:writer.writerow([safe_csv(v) for v in [r["published"],r["source"],r["title"]," · ".join(r["kinds"])," · ".join(r["actions"]),r["topics"],r["url"],r["seen"]]])
    body='<section class="mast"><p class="kicker">Мониторинг · официальные материалы</p><h1>Государственные программы и проекты</h1><p>Поиск решений и сообщений в накопленном архиве официальных источников. Это тематическая выборка по заголовкам, а не реестр всех программ и не оценка исполнения.</p><p>Сформировано: '+escape(stamp)+' · Уникальных материалов: '+str(len(rows))+'</p><p><a href="programmes.csv">Скачать всю выборку CSV</a> · <a href="programmes.json">Данные JSON</a> · <a href="methodology.html#programme-method">Методика</a> · <a href="sources.html">Состояние источников</a></p></section>'
    body+='<section class="portal-grid" aria-label="Типы упоминаний">'+''.join('<article><h2>'+escape(k)+'</h2><p><strong>'+str(counts[k])+'</strong> материалов</p></article>' for k in KINDS)+'</section><p>Категории пересекаются. Нулевое число означает отсутствие совпадений в архиве, а не отсутствие программ.</p>'
    body+='<section><h2>Реестр обнаруженных публикаций</h2><form id="pg-filter"><label>Поиск по заголовку и темам <input id="pg-query" type="search"></label> <label>Тип <select id="pg-kind"><option value="">Все</option>'+''.join('<option>'+escape(k)+'</option>' for k in KINDS)+'</select></label> <label>Признак действия <select id="pg-action"><option value="">Все</option>'+''.join('<option>'+escape(k)+'</option>' for k in ACTIONS)+'</select></label> <label>С даты <input id="pg-from" type="date"></label> <label>По дату <input id="pg-to" type="date"></label> <button type="reset">Сбросить</button></form><p id="pg-status" role="status">Загрузка выборки…</p><div id="pg-results"></div><p><button type="button" id="pg-prev" disabled>Назад</button> <button type="button" id="pg-next" disabled>Далее</button></p><noscript>Для фильтрации требуется JavaScript; полная выборка доступна в CSV выше.</noscript></section><script defer src="programmes.js"></script>'
    page("programmes.html",body.replace("</section>","</section>"+goals.publish(out)+annual_goals.publish(out),1))
