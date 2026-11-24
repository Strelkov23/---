"""Rosstat yearbook 2025 table 15.8, exact printed percentages, selected sections."""
import csv,json
from decimal import Decimal as D
SOURCE="https://rosstat.gov.ru/storage/mediabank/Ejegodnik_2025.pdf"
METHOD="https://rosstat.gov.ru/storage/mediabank/met_struc.htm"
FIELDS=("materials","raw","fuel","energy","labor","insurance","depreciation","other")
LABELS=("Материальные затраты","Сырьё и материалы (в составе материальных)","Топливо (в составе материальных)","Энергия (в составе материальных)","Оплата труда","Страховые взносы","Амортизация","Прочие затраты")
PRIMARY=("materials","labor","insurance","depreciation","other")
# each year: materials, raw, fuel, energy, labor, insurance, depreciation, other
RAW=[
("A","Сельское, лесное хозяйство, рыболовство",330,"64.8 52.2 6.3 2.1 14.1 3.8 10.1 7.2","64.2 51 6 2.1 14.2 4 9.8 7.8","64.2 51.2 5.8 2.1 15.1 4.2 9.1 7.4"),
("B","Добыча полезных ископаемых",330,"29.1 10.2 2.5 2.1 7 1.9 9.2 52.8","29.4 10.4 2.4 2.2 7.6 2.1 9.2 51.7","28.8 10.3 2.5 1.8 7.9 2.2 8.3 52.8"),
("C","Обрабатывающие производства",330,"75.6 61.3 1.9 2.2 9 2.4 3.7 9.3","75 61.8 1.7 2.1 9.3 2.5 3.5 9.8","75.2 62.2 1.6 1.9 9.6 2.6 3.1 9.5"),
("D","Электроэнергия, газ, пар",330,"63.8 6.8 18.9 10 13.4 3.8 9.4 9.6","64.3 6.7 18.8 9.6 13.7 3.9 8.8 9.3","64.1 6.5 19.5 9.2 14.2 4.1 8.5 9.1"),
("E","Водоснабжение и отходы",330,"59 40.4 2.4 5.5 15.9 4.5 6.9 13.8","57.5 38 2.2 5.3 15.5 4.4 7.5 15.1","54.9 34.8 2.4 5.3 16.9 4.9 7 16.3"),
("F","Строительство",331,"57.3 49.9 3.8 .5 19.4 4.8 3.2 15.3","58.8 50.3 3.6 .6 19.4 4.9 3.2 13.7","55.9 44.2 3.3 1 20.3 5.2 3.7 14.9"),
("G","Торговля и ремонт транспорта",331,"45.2 20 .5 .7 15 3.8 8 28.1","40.5 13.5 .5 .8 17.7 4.8 8.5 28.5","41.6 15.1 .5 .8 17.9 4.7 7.1 28.7"),
("H","Транспортировка и хранение",331,"44.9 7.4 7.7 1.4 17.3 4.7 10.2 22.8","46.5 7.7 7.6 1.4 17.1 4.7 9.4 22.3","47 7.9 7.9 1.2 17.3 4.8 8.9 22"),
("I","Гостиницы и общественное питание",331,"45.1 40.1 .4 1.6 22 5.8 5.7 21.5","47.6 41.6 .3 1.7 20.4 5.4 4.8 21.8","45.5 40.2 .3 1.7 21.9 5.9 4.3 22.4"),
("J","Информация и связь",331,"20.1 5.4 .1 1.2 28.5 4.3 9.1 38","19.2 5.9 .1 1.1 26.9 4 6.8 43.1","18.1 5.5 .1 1 28.4 3.7 6.4 43.4"),
("L","Операции с недвижимостью","331–332","30.5 10.2 1 8.3 17.2 4.3 17.4 30.6","30.9 12.1 .8 7.7 17.3 4.4 15.9 31.5","29.6 8.8 .7 7.9 23.7 4 14.2 28.5"),
("O","Госуправление и социальное обеспечение",332,"5.2 2.9 .9 .7 66.1 17.8 2.1 8.8","9.6 7.2 .8 .6 60.7 17.2 2.8 9.7","14.1 12 .7 .7 57.9 16.7 3 8.3"),
("P","Образование",332,"12.7 7.3 .6 1.1 39.9 9.7 2.6 35.2","11.7 6.3 .6 1.4 42.7 9.1 2.2 34.3","11.8 7.9 .5 .8 39.2 8.5 2.1 38.4"),
("Q","Здравоохранение и социальные услуги",332,"30.5 24.6 .7 1.6 32.9 8.5 6.1 22","30 23.1 .6 1.5 33.5 8.6 6.2 21.7","29.6 22.5 .6 1.7 35.2 8.8 6.1 20.3"),
("R","Культура, спорт и досуг",332,"8.6 5 .2 1.3 31.6 5.9 6.7 47.2","17.7 7 .2 1 24.5 4.7 5.8 47.3","14.8 5.3 .2 1.1 27.3 5.2 5.8 46.9"),
("S","Прочие услуги",332,"16.6 9.5 .6 1.2 36.6 7.5 6.9 32.4","20.9 9.7 .9 2.2 42.8 8.6 6.4 21.3","24 13.6 .7 1.7 34.9 7.8 4.3 29"),
]
def records():
    rows=[]
    for code,title,page,*years in RAW:
        for year,raw in zip((2022,2023,2024),years):
            values=list(map(D,raw.split()))
            if len(values)!=len(FIELDS) or any(v<0 or v>100 for v in values):raise ValueError("Invalid shares")
            v=dict(zip(FIELDS,values));total=sum(v[k] for k in PRIMARY)
            if abs(total-100)>D(".3") or sum(v[k] for k in ("raw","fuel","energy"))>v["materials"]:raise ValueError("Inconsistent cost structure "+code)
            rows.append(dict(code=code,title=title,year=year,**{k:float(x) for k,x in v.items()},sum_primary=float(total),rounding_difference=float(total-100),source=SOURCE,table="15.8",page=str(page)))
    return rows
def publish(page,out):
    rows=records()
    data=dict(rows=rows,labels=dict(zip(FIELDS,LABELS)),primary=PRIMARY,source=SOURCE,method=METHOD,coverage="Разделы, представленные в таблице 15.8; без субъектов малого предпринимательства. Названия сокращены. Уточнять охват по примечаниям ежегодника.",verification="Ручная транскрипция текстовых таблиц; скриншоты PDF недоступны из-за тайм-аута. Не автоматическое обновление; суммы долей не исправляются принудительно.")
    (out/"cost-structure.json").write_text(json.dumps(data,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"cost-structure.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    page("cost-structure.html",'<section class="mast"><h1>Структура затрат на производство и продажу</h1><p>Росстат, ежегодник 2025, таблица 15.8, 2022–2024, 16 разделов. Доли в общих затратах, не доли выручки или валового выпуска. <a href="'+SOURCE+'">Первоисточник</a> · <a href="'+METHOD+'">Определения Росстата</a> · <a href="cost-structure.csv">CSV</a> · <a href="cost-structure.json">JSON</a> · <a href="methodology.html#cost-structure-method">Методика</a>.</p><p>Ручная текстовая транскрипция, визуальная сверка недоступна. Сырьё, топливо и энергия входят в материальные затраты; не складывать со всеми пятью основными элементами.</p></section><section><h2>Сравнение по годам</h2><label class="builder-control">Год<select id="cost-year"><option>2024</option><option>2023</option><option>2022</option></select></label><div id="cost-table" class="table-scroll" tabindex="0" role="region" aria-label="Структура затрат"></div><p id="cost-status" role="status">Загрузка…</p></section><section><h2>Динамика выбранного раздела</h2><label class="builder-control">Раздел<select id="cost-sector"></select></label><div id="cost-trend"></div><div id="cost-chart"></div></section><section><h2>Сценарий прямого изменения затрат</h2><p>Для выбранных раздела и года задайте изменение каждого из пяти непересекающихся элементов расходов. Доли нормируются на их опубликованную сумму только внутри калькулятора, чтобы нулевые изменения давали ровно 100. Исходные доли остаются неизменными. Объём и структура производства фиксированы. Результат не прогноз цены, прибыли или инфляции.</p><label class="builder-control">Детализация<select id="cost-mode"><option value="aggregate">Пять основных элементов</option><option value="detailed">Восемь непересекающихся элементов: сырьё, топливо, энергия, остаток материалов и прочие четыре</option></select></label><p>Остаток материалов = материальные затраты − сырьё − топливо − энергия. Это расчётная категория, не отдельная строка Росстата. При смене режима параметры сбрасываются.</p><div id="cost-shocks"></div><button id="cost-run" disabled>Рассчитать</button><p id="cost-result" role="status"></p><div id="cost-detail" class="table-scroll" tabindex="0" role="region" aria-label="Вклады затрат"></div><button id="cost-export" disabled>Скачать расчёт CSV</button><p><a href="prices.html">Межотраслевая модель цен</a> — другой расчёт, по таблицам затрат-выпуска 2021, на рубль выпуска. Не подставлять туда эти доли без согласования классификаций и знаменателей.</p></section><script defer src="provenance.js"></script><script defer src="cost-structure.js"></script>')
