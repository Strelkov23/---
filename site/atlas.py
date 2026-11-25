"""Build product profiles from the same detailed matrix as the scenario calculator."""
import csv
import json
from html import escape
from pathlib import Path


SOURCE = 'https://rosstat.gov.ru/storage/mediabank/baz_tzv-2021.xlsx'

def number(value, digits=2):
    return f'{value:,.{digits}f}'.replace(',', ' ').replace('.', ',')

def table(headers, rows):
    head = ''.join(f'<th scope="col">{h}</th>' for h in headers)
    body = ''.join('<tr>'+''.join(f'<td>{cell}</td>' for cell in row)+'</tr>' for row in rows)
    return f'<div class="atlas-table"><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>'

MATRIX_SECTION='<section id="balance-matrix"><h2>Матрица связей всей экономики</h2><p>Строка — поставщик, столбец — покупатель. Нажмите на ячейку, чтобы увидеть исходный поток и оба знаменателя. Номера столбцов соответствуют номерам групп в строках. Данные: отечественные промежуточные потоки, 2021 г. <a href="methodology.html#balance-matrix-method">Методика</a>.</p><div class="project-controls"><label>Показатель<select id="bm-metric"><option value="value">Поток, млрд руб.</option><option value="inputs">Доля закупок покупателя, %</option><option value="outputs">Доля поставок поставщика, %</option></select></label><label>Выделить группу<select id="bm-focus"></select></label><label><input type="checkbox" id="bm-self" checked> Включать внутригрупповые потоки</label><label><input type="checkbox" id="bm-log" checked> Логарифмическая окраска сумм</label></div><p id="bm-status" role="status">Проверка матрицы…</p><div id="bm-legend" class="bm-legend"></div><div id="bm-table" class="table-scroll"></div><h3>Подробности потока</h3><div class="project-controls"><label>Поставщик<select id="bm-supplier"></select></label><label>Покупатель<select id="bm-buyer"></select></label></div><div id="bm-detail" aria-live="polite"></div><button id="bm-export" type="button" disabled>Скачать все потоки CSV</button></section><script defer src="provenance.js"></script><script defer src="balance-matrix.js"></script>'

def publish(page, out):
    sectors = json.loads(Path('sectors.json').read_text())
    with open('model-input.csv') as f:
        matrix = list(csv.DictReader(f))
    with open('products.csv') as f:
        products = {r['code']: r for r in csv.DictReader(f)}
    groups = {}
    directory = []
    exports = []
    for i, row in enumerate(matrix, 1):
        code = row['code']
        product = products[code]
        group = int(row['group'])
        column = [float(r[f'L{i}']) for r in matrix]
        multiplier = sum(column)
        imported = sum(v * float(r['import_ratio']) for r,v in zip(matrix,column))
        output = float(product['output_mln'])
        demand = float(row['domestic_final_demand'])
        groups.setdefault(group, []).append((code, escape(product['name']), number(output/1000), number(demand/1000),number(multiplier,4),number(imported*100,2)))
        exports.append([group,code,product['name'],output,demand,multiplier,imported,SOURCE])
    with (out/'product-balance.csv').open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f,delimiter=';')
        writer.writerow(['Группа','ОКПД 2','Продукт','Выпуск, млн руб.','Конечный спрос, млн руб.','Полный выпуск, руб./руб.','Импортные затраты, руб./руб.','Источник 2021'])
        writer.writerows(exports)
    dependency_rows=[]
    dependency_data=[]
    for i,name in enumerate(sectors["names"]):
        flows=[r[i] for r in sectors["flows"]]
        total=sum(flows)
        if total<=0 or any(v<0 for v in flows):
            hhi=top3=top1=None
        else:
            shares=sorted((v/total for v in flows),reverse=True)
            hhi=sum(v*v for v in shares);top3=sum(shares[:3]);top1=shares[0]
        largest=max(range(len(flows)),key=lambda j:flows[j]) if total>0 else None
        supplier=sectors["names"][largest] if largest is not None else ""
        demand=sectors["demand"][i]
        multiplier=sum(r[i] for r in sectors["effects"])/demand if demand>0 else None
        import_effect=sectors["imports"][i]/demand if demand>0 else None
        show=lambda v,digits=2:number(v,digits) if v is not None else "—"
        dependency_rows.append([f'<a href="sector-{i+1}.html">{escape(name)}</a>',show(total/1000),escape(supplier),show(top1*100 if top1 is not None else None),show(top3*100 if top3 is not None else None),show(hhi,4),show(multiplier,4),show(import_effect,4)])
        dependency_data.append([name,total,supplier,top1,top3,hhi,multiplier,import_effect,SOURCE])
    with (out/"supplier-dependencies.csv").open("w",encoding="utf-8-sig",newline="") as f:
        writer=csv.writer(f,delimiter=";")
        writer.writerow(["Группа покупателя","Отечественные промежуточные поставки, млн руб.","Крупнейшая группа поставщика","Доля крупнейшей группы, 0–1","Доля трёх групп, 0–1","HHI, 0–1","Полный выпуск на рубль спроса","Импортные затраты на рубль спроса","Источник"])
        writer.writerows(dependency_data)
    for g,name in enumerate(sectors['names'],1):
        i=g-1
        rows=groups[g]
        title=escape(name)
        url=f'sector-{g}.html'
        directory.append([f'<a href="{url}">{title}</a>',str(len(rows)),number(sectors['output'][i]/1000),number(sectors['demand'][i]/1000)])
        body=f'<p><a href="atlas.html">Отраслевой атлас</a> / Россия, 2021</p><h1>{title}</h1>'
        body+=f'<p>Валовой выпуск группы — <strong>{number(sectors["output"][i]/1000)} млрд ₽</strong>. Конечный спрос на отечественную продукцию — <strong>{number(sectors["demand"][i]/1000)} млрд ₽</strong>.</p>'
        body+='<h2>Продукты и их место в балансе</h2>'+table(['Код ОКПД 2','Продукт','Выпуск, млрд ₽','Конечный спрос, млрд ₽','Полный выпуск, ₽/₽ спроса','Импортные затраты, коп./₽ спроса'],rows)
        body+='<p>При дополнительном рубле спроса на продукт полный выпуск равен сумме соответствующего столбца матрицы полных затрат L. Для импортных затрат каждый элемент столбца умножен на импортные промежуточные затраты на рубль выпуска соответствующего поставщика. Для перевода в копейки сумма умножена на 100.</p>'
        suppliers=sorted(enumerate(sectors['flows']),key=lambda pair:pair[1][i],reverse=True)[:5]
        body+='<h2>Крупнейшие поставщики отечественных промежуточных продуктов</h2>'+table(['Группа поставщика','Поставки группе, млрд ₽','На 100 ₽ выпуска группы, ₽'],[(f'<a href="sector-{j+1}.html">{escape(sectors["names"][j])}</a>',number(flow[i]/1000),number(100*flow[i]/sectors['output'][i])) for j,flow in suppliers])
        body+='<p>В числителе — поставки группы по строке баланса, в знаменателе — выпуск группы-покупателя. Внутриотраслевые поставки тоже входят в расчёт. В таблице приведены пять крупнейших потоков.</p>'
        body+=f'<p><a href="index.html?industry={i}&amp;shock=10#model">Рассчитать сценарий для группы</a> · <a href="product-balance.csv" download>Все продукты в CSV</a> · <a href="{SOURCE}">Исходная таблица Росстата, лист «Симм отеч»</a></p>'
        buyers=sorted(enumerate(sectors['flows'][i]),key=lambda pair:pair[1],reverse=True)[:5]
        body+='<h2>Крупнейшие потребители промежуточной продукции</h2>'+table(['Группа покупателя','Поставки, млрд ₽'],[(f'<a href="sector-{j+1}.html">{escape(sectors["names"][j])}</a>',number(v/1000)) for j,v in buyers])
        body+='<p>Это промежуточные потоки, а не конечные продажи; данные относятся только к 2021 году. <a href="scenario.html">Проверить многовариантный сценарий</a> · <a href="statistics.html">Актуальные годовые показатели</a> · <a href="sector-passports.html">Тематические паспорта отраслей</a>.</p>'
        page(url,body)
    page('atlas.html','<h1>Отраслевой атлас России</h1><p>Баланс за 2021 год в ценах базового периода. Выберите отрасль, чтобы увидеть её продукты, поставщиков и потребность в импортных ресурсах.</p><p><a href="sector-passports.html">Тематические паспорта и актуальные показатели</a> · <a href="industrial.html">Индексы по ОКВЭД2, отгрузка и натуральный выпуск</a> · <a href="machinery.html">Разбор рынка сельхозтехники</a> · <a href="product-balance.csv" download>Скачать данные по 113 продуктам</a></p>'+MATRIX_SECTION+table(['Отрасль','Продуктовых позиций','Валовой выпуск, млрд ₽','Конечный спрос, млрд ₽'],directory)+'<section id="supplier-dependencies"><h2>Концентрация отечественных поставок</h2><p>HHI = сумма квадратов долей 19 групп поставщиков в отечественных промежуточных закупках группы-покупателя. Внутригрупповые потоки включены. Это концентрация продуктовых групп, не фирм, и не оценка риска остановки. Мультипликаторы — на рубль пропорционального изменения конечного спроса группы в балансе 2021 года. Импортные затраты включают прямой и косвенный эффект, а не долю импортных товаров в выпуске.</p>'+table(['Группа покупателя','Поставки, млрд ₽','Крупнейшая группа','Доля крупнейшей, %','Три крупнейшие, %','HHI','Полный выпуск, ₽/₽','Импортные затраты, ₽/₽'],dependency_rows)+'<p><a href="supplier-dependencies.csv" download>Скачать расчёты CSV</a> · <a href="scenario.html#chain-stress">Стресс-тест цепочек</a> · <a href="methodology.html#chain-stress-method">Методика</a></p></section>')
