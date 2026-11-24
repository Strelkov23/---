"""Federal projects in the health programme: 2025 committee report, not outcomes."""
import csv
import json
from decimal import Decimal
from html import escape
from budget_programmes import q, ratio

SOURCE="https://base.garant.ru/411685113/"
# Row numbers in federal-projects block; amounts in million nominal RUB.
# Labels are shortened for readability; the source row identifies the full official title.
DATA=[
("Инфраструктура здравоохранения","46205.7","44529.8","43924.2"),
("Поддержка Российского Красного Креста","508.9","554.7","554.7"),
("Расширенный неонатальный скрининг","2845.7","2924.9","2917.4"),
("Санитарный щит","9507.1","10665.7","10648.2"),
("Модернизация первичного звена","122223.2","122470.9","116359.3"),
("Сердечно-сосудистые заболевания","11591.9","11840.6","11787.6"),
("Онкологические заболевания","149121.2","148457.0","148457.0"),
("Сахарный диабет","9541.0","9371.5","8546.7"),
("Гепатит С","4500.0","4500.0","4495.1"),
("Экстренная медицинская помощь","19727.7","19561.0","19376.5"),
("Медицинская реабилитация","19259.8","18295.0","18218.4"),
("Цифровая платформа «Здоровье»","4753.9","4791.1","4790.8"),
("Федеральные медицинские организации","27200.1","26052.2","25547.3"),
("Здоровье для каждого","947.7","636.3","590.8"),
("Медицинские кадры","724.6","724.6","724.6"),
("Управление медицинской наукой","430.3","2812.0","2812.0"),
("Технологии медицинских изделий и лекарств","164.8","976.8","976.8"),
("Биомедицинские и когнитивные технологии","3.7","683.7","683.7"),
("Регенеративная биомедицина и профилактика","1.5","317.9","317.9"),
("Производство востребованных лекарств и медизделий","900.0","50.0","50.0"),
("Охрана материнства и детства","25600.0","25942.8","25704.5"),
]
TOTAL=tuple(map(Decimal,("460016.1","456158.4","447483.4")))
RESERVE=tuple(map(Decimal,("4257.5","0","0")))
def records():
    result=[]
    for n,(title,law,appropriation,actual) in enumerate(DATA,1):
        l,p,a=map(Decimal,(law,appropriation,actual))
        result.append(dict(row=n,year=2025,title=title,unit="млн руб.",amended_law=float(l),appropriation=float(p),actual=float(a),
          ratio_appropriation=ratio(a,p),ratio_amended=ratio(a,l),unspent=q(p-a),change=q(p-l),source=SOURCE))
    return result
def reconciliation():
    sums=[sum((Decimal(r[i]) for r in DATA),Decimal(0))+RESERVE[i-1] for i in (1,2,3)]
    diff=[s-t for s,t in zip(sums,TOTAL)]
    # 21 rounded rows, one reserve row and a rounded total; 0.05m each.
    tolerance=Decimal("0.05")*(len(DATA)+2)
    return dict(total=list(map(float,TOTAL)),reserve=list(map(float,RESERVE)),difference=list(map(float,diff)),
      tolerance=float(tolerance),within_rounding=all(abs(x)<=tolerance for x in diff))
def fmt(v):
    return "—" if v is None else f"{v:,.2f}".replace(","," ").replace(".",",")
def publish(out):
    rows=records();check=reconciliation()
    (out/"health-projects.json").write_text(json.dumps(dict(rows=rows,reconciliation=check,reviewed="2026-11-24"),ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"health-projects.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    body='<section id="health-projects"><h3>Детализация: 21 федеральный проект здравоохранения</h3><p>2025 год. Суммы в млн рублей. <a href="'+SOURCE+'">Заключение профильного комитета Госдумы</a>, строки 1–21 блока федеральных проектов. Названия сокращены; номер строки позволяет сверить оригинал. Первоначальные назначения по этим проектам не представлены в данной таблице.</p><p><a href="health-projects.csv">CSV</a> · <a href="health-projects.json">JSON</a></p>'
    body+='<p>Контроль суммы строк с учётом резерва: '+("расхождение в пределах округления" if check["within_rounding"] else "расхождение требует сверки")+'. Резерв показан отдельно в JSON; он не является 22-м проектом.</p>'
    body+='<div class="table-scroll" tabindex="0" role="region" aria-label="Финансирование федеральных проектов здравоохранения"><table><thead><tr><th>№ / проект</th><th>Закон с изменениями</th><th>Роспись</th><th>Факт</th><th>Исполнение к росписи, %</th><th>Остаток</th><th>Роспись − закон</th></tr></thead><tbody>'
    for r in sorted(rows,key=lambda r:-r["unspent"]):
        body+='<tr><th scope="row">'+str(r["row"])+'. '+escape(r["title"])+'</th>'+''.join('<td>'+fmt(r[k])+'</td>' for k in ("amended_law","appropriation","actual","ratio_appropriation","unspent","change"))+'</tr>'
    body+='</tbody></table></div><p>Сортировка по абсолютному остатку к росписи. Высокий процент исполнения не гарантирует достижение результатов. Сокращение назначения и неисполнение назначения — разные явления. Не складывать проекты с родительской программой.</p></section>'
    return body
