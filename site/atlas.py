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
    page('atlas.html','<h1>Отраслевой атлас России</h1><p>Баланс за 2021 год в ценах базового периода. Выберите отрасль, чтобы увидеть её продукты, поставщиков и потребность в импортных ресурсах.</p><p><a href="sector-passports.html">Тематические паспорта и актуальные показатели</a> · <a href="industrial.html">Индексы по ОКВЭД2, отгрузка и натуральный выпуск</a> · <a href="machinery.html">Разбор рынка сельхозтехники</a> · <a href="product-balance.csv" download>Скачать данные по 113 продуктам</a></p>'+table(['Отрасль','Продуктовых позиций','Валовой выпуск, млрд ₽','Конечный спрос, млрд ₽'],directory))
