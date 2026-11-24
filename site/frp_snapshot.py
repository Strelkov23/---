"""Documentary reading of FRP public home page; not a live registry or verified project inventory."""
import csv,json
from html import escape
from decimal import Decimal
SOURCE="https://www.frprf.ru/?a=2"
OBSERVED="2026-11-25"
NOTE="Документальный снимок доступного индексированного текста главной страницы ФРП, просмотрен 25.11.2026. Дата самих итогов не указана. Прямая повторная загрузка официального сайта из сборщика вернула HTTP 403. Это агрегаты ФРП, не полный перечень проектов, предприятий или заводов. Плановые результаты не считаются фактически достигнутыми."
# Source numbers, not calculated or combined.
ROWS=[
 ("opened","Открытые или увеличившие выпуск производства","1260","ед.","сообщённый итог"),
 ("opened_regions","Регионы открытых или увеличивших выпуск производств","74","ед.","сообщённый итог"),
 ("loans","Выданные займы","2239","ед.","сообщённый итог"),
 ("loan_regions","Регионы выданных займов","80","ед.","сообщённый итог"),
 ("loan_amount","Общая сумма займов","762.3","млрд руб.","сообщённый итог"),
 ("investment","Инвестиции предприятий помимо займов ФРП","638","млрд руб.","ожидаемая величина"),
 ("revenue","Выручка от реализации проектов","18088","млрд руб.","ожидаемая величина"),
 ("tax","Будущие налоговые поступления","1493","млрд руб.","ожидаемая величина"),
 ("ip","Заявки на интеллектуальную собственность","1482","ед.","ожидаемая величина"),
 ("jobs","Новые высокопроизводительные рабочие места","57287","ед.","ожидаемая величина"),
]
def create():
    return dict(schema=1,mode="documentary",observed=OBSERVED,period=None,source=SOURCE,note=NOTE,rows=[dict(code=c,title=t,original=v,value=float(Decimal(v)),unit=u,status=s) for c,t,v,u,s in ROWS])
FIELDS=["code","title","original","value","unit","status","observed","period","source","note"]
def csv_rows(d):
    return [{**r,"observed":d["observed"],"period":d["period"],"source":d["source"],"note":d["note"]} for r in d["rows"]]
def quality(d,path=None):
    if d!=create():raise ValueError("Документальный снимок ФРП не соответствует проверенным исходным значениям")
    if path is not None:
        with path.open(encoding="utf-8-sig",newline="") as f:
            rd=csv.DictReader(f)
            if rd.fieldnames!=FIELDS:raise ValueError("Неверные поля ФРП CSV")
            actual=list(rd)
        expected=[{k:"" if r[k] is None else str(r[k]) for k in FIELDS} for r in csv_rows(d)]
        if actual!=expected:raise ValueError("ФРП CSV/JSON mismatch")
    return dict(frp_documentary_indicators=len(d["rows"]),frp_reported_indicators=sum(r["status"]=="сообщённый итог" for r in d["rows"]),frp_expected_indicators=sum(r["status"]=="ожидаемая величина" for r in d["rows"]))
def publish(page,out):
    d=create();(out/"frp-snapshot.json").write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"frp-snapshot.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=FIELDS);w.writeheader();w.writerows(csv_rows(d))
    quality(d,out/"frp-snapshot.csv")
    body='<section class="mast"><p class="kicker">Инвестиции и промышленная политика</p><h1>Фонд развития промышленности: опубликованные итоги и ожидаемые результаты</h1><p>'+escape(NOTE)+'</p><p><a href="'+SOURCE+'">Источник ФРП</a> · <a href="frp-snapshot.csv">CSV</a> · <a href="frp-snapshot.json">JSON</a> · <a href="methodology.html#frp-snapshot-method">Методика</a></p></section>'
    for status,title in (("сообщённый итог","Сообщённые результаты"),("ожидаемая величина","Ожидаемые результаты — не фактическое исполнение")):
        body+='<section><h2>'+title+'</h2><div class="table-scroll"><table><thead><tr><th>Показатель</th><th>Значение</th><th>Единица</th></tr></thead><tbody>'
        for r in d["rows"]:
            if r["status"]==status:body+="<tr><td>"+escape(r["title"])+"</td><td>"+escape(r["original"].replace(".",","))+"</td><td>"+escape(r["unit"])+"</td></tr>"
        body+="</tbody></table></div></section>"
    body+='<section><h2>Ограничения</h2><p>Не рассчитываются средняя сумма займа на предприятие, исполнение инвестиционных планов или отраслевые и региональные доли: неизвестны сопоставимый охват, дата итогов и первичный реестр. Количество производств и количество займов — разные объекты учёта. <a href="industrial-parks.html">Каталог инфраструктуры</a> · <a href="regional-manufacturing.html">Региональная специализация</a> · <a href="capital.html">Фонды и загрузка мощностей</a>.</p></section>'
    page("frp-snapshot.html",body)
