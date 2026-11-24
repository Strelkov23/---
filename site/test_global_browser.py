"""Targeted browser regression for the worker, exports and parameter invalidation."""
import os
import csv
import io
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get("CHROME_BIN","/usr/bin/google-chrome"),args=["--no-sandbox","--disable-dev-shm-usage"])
    for width in (390,1440):
        page=browser.new_page(viewport={"width":width,"height":844},accept_downloads=True)
        errors=[]
        page.on("pageerror",lambda e:errors.append(str(e)))
        page.goto("http://localhost:8765/scenario.html",wait_until="load")
        page.locator("#global-run").wait_for()
        page.wait_for_function("!document.querySelector('#global-run').disabled")
        page.locator("#global-run").click()
        page.wait_for_function("document.querySelector('#global-status').textContent.includes('Оптимум проверен')",timeout=60000)
        assert page.locator("#global-results tbody tr").count()==5
        assert page.locator("#global-comparison tbody tr").count()==4
        assert page.locator("#global-detail tbody tr").count()==19
        with page.expect_download() as download:
            page.locator("#global-csv").click()
        assert download.value.suggested_filename.endswith(".csv")
        page.locator("#global-objective").select_option("terminal")
        assert page.locator("#global-csv").is_disabled()
        page.locator("#global-run").click()
        page.wait_for_function("document.querySelector('#global-status').textContent.includes('Оптимум проверен')",timeout=60000)
        page.locator("#dyn-years").fill("3")
        assert page.locator("#global-csv").is_disabled()
        assert page.locator("#global-results tbody tr").count()==0
        page.locator("#dyn-laborEnabled").check()
        assert page.locator("#global-run").is_disabled()
        page.locator("#dyn-laborCap").fill("100000")
        for field in page.locator("#dyn-controls tbody input[aria-label^='Человеко-лет']").all():field.fill("100")
        assert not page.locator("#global-run").is_disabled()
        page.locator("#global-run").click()
        page.wait_for_function("document.querySelector('#global-status').textContent.includes('Оптимум проверен')",timeout=60000)
        assert page.locator("#global-results tbody tr").count()==3
        template=Path("labor-coefficients-template.csv").read_text(encoding="utf-8-sig")
        records=list(csv.reader(io.StringIO(template)))
        for row in records[1:]:
            row[4]=str(float(row[3])/1000*110)
            row[5]="Test fixture only: not official data"
        buf=io.StringIO();csv.writer(buf).writerows(records);payload=buf.getvalue().encode()
        file=page.locator("#dyn-calibration-file")
        file.set_input_files({"name":"coefficients.csv","mimeType":"text/csv","buffer":payload})
        page.wait_for_function("document.querySelector('#dyn-calibration-status').textContent.includes('Импортировано 19')")
        fields=page.locator("#dyn-controls tbody input[aria-label^='Человеко-лет']")
        assert all(abs(float(x.input_value())-110)<1e-8 for x in fields.all())
        assert page.locator("#dyn-calibration-multipliers tbody tr").count()==19
        file.set_input_files({"name":"invalid.csv","mimeType":"text/csv","buffer":payload.replace(b",2021,",b",2022,",1)})
        page.wait_for_function("document.querySelector('#dyn-calibration-status').textContent.includes('Файл не принят')")
        assert all(abs(float(x.input_value())-110)<1e-8 for x in fields.all())
        fields.first.fill("120")
        assert "привязка к файлу снята" in page.locator("#dyn-calibration-status").inner_text()
        page.goto("http://localhost:8765/labor.html",wait_until="load")
        page.wait_for_function("document.querySelector('#labor-status').textContent.includes('Наблюдений производительности:')")
        assert page.locator("#labor-broad tbody tr").count()>=1
        assert page.locator("#labor-regional tbody tr").count()>=1
        page.goto("http://localhost:8765/prices.html",wait_until="load")
        page.wait_for_function("document.querySelector('#price-status').textContent.includes('Баланс 2021 проверен')")
        assert page.locator("#price-results tbody tr").count()==19
        page.locator("#price-import").fill("0")
        assert all(row.locator("td").nth(1).inner_text()=="100" for row in page.locator("#price-results tbody tr").all())
        page.locator("#price-import").fill("25")
        with page.expect_download() as d:
            page.locator("#price-download").click()
        assert d.value.suggested_filename=="cost-price-scenario.csv"
        assert page.locator("#price-labor-download").is_disabled()
        records=list(csv.reader(io.StringIO(Path("labor-hours-template.csv").read_text(encoding="utf-8-sig"))))
        for row in records[1:]:
            row[4]=str(float(row[3])/1000*1000)
            row[5]="Test fixture only: not official data"
        buf=io.StringIO();csv.writer(buf).writerows(records);payload=buf.getvalue().encode()
        page.locator("#price-hour-file").set_input_files({"name":"hours.csv","mimeType":"text/csv","buffer":payload})
        page.wait_for_function("document.querySelector('#price-hour-file-status').textContent.includes('Импортировано 19')")
        page.locator("#price-hour-value").fill("400")
        assert page.locator("#price-labor-results tbody tr").count()==19
        assert not page.locator("#price-labor-download").is_disabled()
        with page.expect_download() as d:
            page.locator("#price-labor-download").click()
        assert d.value.suggested_filename=="labor-hour-valuation.csv"
        page.locator("#price-hour-file").set_input_files({"name":"bad.csv","mimeType":"text/csv","buffer":payload.replace(b",2021,",b",2022,",1)})
        page.wait_for_function("document.querySelector('#price-hour-file-status').textContent.includes('Файл не принят')")
        assert page.locator("#price-labor-results tbody tr").count()==19
        page.locator("#price-labor-controls input").first.fill("1200")
        assert "привязка к файлу снята" in page.locator("#price-hour-file-status").inner_text()
        page.goto("http://localhost:8765/technology.html",wait_until="load")
        page.wait_for_function("document.querySelector('#tech-status').textContent.includes('Параметры изменены')")
        page.locator("#tech-example").click()
        page.locator("#tech-run").click()
        page.wait_for_function("document.querySelector('#tech-status').textContent.includes('Рассчитано 19')")
        assert page.locator("#tech-detail tbody tr").count()==19
        assert page.locator("#tech-alloc tbody tr").count()==2
        assert page.locator("#tech-dual tbody tr").count()==21
        assert page.locator("#tech-frontier tbody tr").count()==6
        assert page.locator("#tech-frontier-chart svg").count()==1
        with page.expect_download() as d:
            page.locator("#tech-csv").click()
        assert d.value.suggested_filename=="technology-scenario.csv"
        page.locator("#tech-budget").fill("500")
        assert page.locator("#tech-csv").is_disabled()
        page.locator("#tech-axis").select_option("budget")
        page.locator("#tech-run").click()
        page.wait_for_function("document.querySelector('#tech-status').textContent.includes('Рассчитано 19')")
        assert page.locator("#tech-frontier tbody tr").count()==6
        page.goto("http://localhost:8765/forecast.html",wait_until="load")
        page.wait_for_function("document.querySelector('#forecast-status').textContent.includes('Рассчитано')")
        assert page.locator("#forecast-methods tbody tr").count()==4
        assert page.locator("#forecast-holdout tbody tr").count()==5
        assert page.locator("#forecast-range-check tbody tr").count()==5
        assert page.locator("#forecast-board tbody tr").count()==12
        page.locator("#forecast-series").select_option("CPI_YOY")
        assert page.locator("#forecast-methods tbody tr").count()==5
        page.locator("#forecast-series").select_option("INDUSTRY_YOY")
        page.locator("#forecast-horizon").select_option("6")
        assert page.locator("#forecast-methods tbody tr").count()==5
        assert page.locator("#forecast-chart svg").count()>=1
        with page.expect_download() as d:
            page.locator("#forecast-export").click()
        assert d.value.suggested_filename=="forecast-selected.csv"
        page.locator("#forecast-board-period").select_option("monthly")
        assert page.locator("#forecast-board tbody tr").count()==5
        with page.expect_download() as d:
            page.locator("#forecast-board-export").click()
        assert d.value.suggested_filename=="forecast-overview.csv"
        page.goto("http://localhost:8765/capital.html",wait_until="load")
        page.wait_for_function("document.querySelector('#capital-status').textContent.includes('Разделов деятельности: 19')")
        assert page.locator("#capital-table tbody tr").count()==20
        assert page.locator("#capital-trend-chart tbody tr").count()==3
        assert page.locator("#capacity-trend-chart tbody tr").count()==3
        page.locator("#capital-trend").select_option("C")
        assert "54,4" in page.locator("#capital-trend-chart tbody tr").last.inner_text()
        page.locator("#capacity-trend").select_option("machine-tools")
        assert "40,5" in page.locator("#capacity-trend-chart tbody tr").last.inner_text()
        assert page.locator("#capacity-table tbody tr").count()==72
        page.locator("#capacity-query").fill("тракторы")
        assert page.locator("#capacity-table tbody tr").count()==1
        assert page.locator("#capacity-table tbody tr").inner_text().find("42,3")>=0
        page.locator("#capacity-year").select_option("2023")
        assert page.locator("#capacity-table tbody tr").inner_text().find("58,2")>=0
        page.goto("http://localhost:8765/data-registry.html",wait_until="load")
        page.wait_for_function("document.querySelector('#registry-status').textContent.includes('Найдено:')")
        assert page.locator("#registry-list article").count()==20
        page.locator("#registry-group").select_option("capital")
        page.locator("#registry-q").fill("износ")
        assert page.locator("#registry-list article").count()==20
        page.locator("#registry-list article summary").first.click()
        assert "Формула или способ получения" in page.locator("#registry-list article details").first.inner_text()
        page.locator("#registry-list article button").first.click()
        page.locator("#registry-selected").check()
        assert page.locator("#registry-list article").count()==1
        page.reload(wait_until="load")
        page.wait_for_function("document.querySelector('#registry-save-status').textContent.includes('Сохранено рядов: 1')")
        page.locator("#registry-selected").check()
        assert page.locator("#registry-list article").count()==1
        with page.expect_download() as d:
            page.locator("#registry-export-selected").click()
        assert d.value.suggested_filename=="data-registry-selection.csv"
        with page.expect_download() as d:
            page.locator("#registry-values").click()
        assert d.value.suggested_filename=="data-registry-observations.csv"
        content=d.value.path().read_text(encoding="utf-8-sig")
        assert "wear_pct" in content and "2024" in content and "Наблюдение" in content
        assert "method_formula" in content and "method_caution" in content
        assert "source_file_sha256" in content and "data_fingerprint" in content
        manifest=json.loads(Path("data-manifest.json").read_text())
        assert manifest["files"]["capital-data.json"]["sha256"] in content
        assert manifest["data_fingerprint"] in content
        # Same record count, different bytes: the browser must refuse the export.
        def corrupt(route):
            response=route.fetch()
            payload=response.json()
            payload["assets"][0]["stock_mrub"]+=1
            route.fulfill(response=response,json=payload)
        page.route("**/capital-data.json",corrupt)
        page.locator("#registry-values").click()
        page.wait_for_function("document.querySelector('#registry-values-status').textContent.includes('Контрольная сумма или размер не совпадают')")
        page.unroute("**/capital-data.json",corrupt)
        page.locator("#registry-clear").click()
        assert page.locator("#registry-list article").count()==0
        page.goto("http://localhost:8765/data-registry.html?id=wdi%3ASL.UEM.TOTL.ZS",wait_until="load")
        page.wait_for_function("document.querySelector('#registry-status').textContent.includes('Найдено: 1 из')")
        assert page.locator("#registry-list article").count()==1
        page.goto("http://localhost:8765/glossary.html",wait_until="load")
        assert page.locator("#glossary-list article").count()>=20
        page.locator("#glossary-query").fill("ВРП")
        assert page.locator("#glossary-list article:visible").count()>=1
        assert page.locator("#glossary-list article:visible").count()<20
        page.locator("#view-mode").select_option("professional")
        page.goto("http://localhost:8765/scenario.html",wait_until="load")
        assert page.locator("#view-mode").input_value()=="professional"
        assert page.locator(".section-more").evaluate("(e)=>e.open")
        assert page.locator(".page-guide a[href='methodology.html#global-plan-method']").count()==1
        page.locator("#view-mode").select_option("simple")
        assert not page.locator(".section-more").evaluate("(e)=>e.open")
        page.goto("http://localhost:8765/search.html?q=инвестиции",wait_until="load")
        page.wait_for_function("document.querySelector('#site-search-status').textContent.startsWith('Найдено записей:')",timeout=30000)
        assert page.locator("#site-search-results section").count()==4
        page.locator("#site-search-scope").select_option("tools")
        page.wait_for_function("document.querySelectorAll('#site-search-results section').length===1")
        assert page.locator("#site-search-results article a").count()>0
        page.goto("http://localhost:8765/economic-map.html",wait_until="load")
        page.wait_for_function("!document.querySelector('#geo-status').textContent.startsWith('Загрузка')")
        if page.locator("#geo-series option").count():
            page.locator("#geo-theme").select_option("industry")
            page.wait_for_function("document.querySelector('#geo-status').textContent.startsWith('Год:')")
            assert page.locator("#geo-map svg").count()==1
            page.locator("#geo-scale").select_option("growth")
            page.locator("#geo-markers").select_option("top")
            assert page.locator("#geo-map g[role=button]").count()>0
            assert page.locator("#geo-map g[role=button]").count()<=8
        page.goto("http://localhost:8765/news-map.html",wait_until="load")
        page.wait_for_function("document.querySelector('#news-geo-status').textContent.startsWith('Период до')",timeout=30000)
        assert page.locator("#news-geo-map svg").count()==1
        page.locator("#news-geo-map .map-controls button").nth(1).click()
        assert "150%" in page.locator("#news-geo-map .map-controls").inner_text()
        page.locator("#news-geo-map .map-controls button").nth(2).click()
        assert "100%" in page.locator("#news-geo-map .map-controls").inner_text()
        page.locator("#news-geo-days").select_option("90")
        if page.locator("#news-geo-region option").count()>1:
            page.locator("#news-geo-region").select_option(index=1)
            assert page.locator("#news-geo-list article a[href^='http']").count()>0
        page.goto("http://localhost:8765/method-passports.html",wait_until="load")
        methods=json.loads(Path("method-passports.json").read_text())
        assert len(methods)>=33
        assert page.locator("main .portal-grid article").count()==len(methods)
        assert page.locator("main .portal-grid a[href=\"methodology.html#metallurgy-output-method\"]").count()==1
        page.goto("http://localhost:8765/reproducibility.html",wait_until="load")
        page.wait_for_function("document.querySelector('#repro-status').textContent.includes('отпечаток проверен')")
        page.locator("#repro-verify").click()
        page.wait_for_function("document.querySelector('#repro-result').textContent.includes('Совпадает:')")
        page.goto("http://localhost:8765/index-builder.html?id=wdi%3ANY.GDP.MKTP.KD",wait_until="load")
        page.wait_for_function("!document.querySelector('#builder-run').disabled")
        page.locator("#builder-run").click()
        assert "Подтвердите" in page.locator("#builder-status").inner_text()
        page.locator("#builder-confirm").check()
        page.locator("#builder-method").select_option("base")
        page.locator("#builder-run").click()
        assert "Рассчитано" in page.locator("#builder-status").inner_text()
        with page.expect_download() as d:
            page.locator("#builder-json").click()
        report=json.loads(d.value.path().read_text())
        assert report["method"]=="base" and report["data_fingerprint"]==manifest["data_fingerprint"]
        assert any(x["period"]==report["parameters"]["base"] and x["value"]==100 for x in report["rows"])
        page.locator("#builder-method").select_option("mean")
        assert page.locator("#builder-json").is_disabled()
        page.wait_for_function("document.querySelector('#composite-status').textContent.includes('Параметры изменены')")
        selects=page.locator("#composite-components fieldset select").all()
        selects[0].select_option("wdi:NE.EXP.GNFS.ZS")
        selects[2].select_option("wdi:NE.IMP.GNFS.ZS")
        page.locator("#composite-base").fill("2020")
        page.locator("#composite-confirm").check()
        page.locator("#composite-run").click()
        page.wait_for_function("document.querySelector('#composite-status').textContent.includes('Рассчитано')")
        with page.expect_download() as d:
            page.locator("#composite-json").click()
        c=json.loads(d.value.path().read_text())
        assert page.locator('#composite-chart svg').count()==1
        assert c["weights"]==[0.5,0.5] and len(c["components"])==2
        assert abs(next(x for x in c["rows"] if x["period"]=="2020")["selected"]-100)<1e-9
        page.goto("http://localhost:8765/report-builder.html",wait_until="load")
        page.wait_for_function("document.querySelector('#report-count').textContent.includes('Найдено')")
        page.locator("#report-query").fill("NY.GDP.MKTP.KD")
        page.locator("#report-series").select_option("wdi:NY.GDP.MKTP.KD")
        page.locator("#report-add").click()
        page.locator("#report-confirm").check()
        page.locator("#report-run").click()
        page.wait_for_function("document.querySelector('#report-status').textContent.includes('Доклад сформирован')")
        assert page.locator("#report-preview .report-series").count()==1
        assert page.locator("#report-preview .report-series tbody tr").count()==5
        assert page.locator("#report-coverage tbody tr").count()==1
        assert page.locator("#report-preview svg").count()==1
        with page.expect_download() as d:
            page.locator("#report-json").click()
        report=json.loads(d.value.path().read_text())
        assert report["series"][0]["summary"]["expected"]==5
        assert report["series"][0]["summary"]["rows"][0]["change"] is None
        assert report["data_fingerprint"]==manifest["data_fingerprint"]
        with page.expect_download() as d:
            page.locator("#report-html").click()
        html=d.value.path().read_text()
        assert "<svg" in html and "<script" not in html and "SHA-256" in html
        page.locator("#report-end").fill("2023")
        assert page.locator("#report-json").is_disabled()
        page.goto("http://localhost:8765/finance.html",wait_until="load")
        page.wait_for_function("document.querySelector('#finance-status').textContent.includes('Видов деятельности')")
        assert page.locator("#finance-table tbody tr").count()==61
        assert page.locator("#finance-chart svg").count()==1
        assert "Проверка списка файлов ФНС" in page.locator("#finance-source-check").inner_text()
        page.locator("#finance-query").fill("Добыча угля")
        assert page.locator("#finance-table tbody tr").count()==1
        assert "Отр" in page.locator("#finance-table tbody tr").inner_text()
        page.locator("#finance-year").select_option("2024")
        assert "4,8" in page.locator("#finance-table tbody tr").inner_text()
        page.goto("http://localhost:8765/financial-state.html",wait_until="load")
        page.wait_for_function("document.querySelector('#state-status').textContent.includes('Выборочных строк')")
        assert page.locator("#debt-table tbody tr").count()==8
        assert page.locator("#debt-ratios tbody tr").count()==4
        assert page.locator("#results-table tbody tr").count()==14
        page.locator("#results-query").fill("Добыча угля")
        assert page.locator("#results-table tbody tr").count()==1
        assert "178,6" in page.locator("#results-table tbody tr").inner_text()
        page.goto("http://localhost:8765/data-registry.html?id=debt%3Apayable",wait_until="load")
        page.wait_for_function("document.querySelector('#registry-status').textContent.includes('Найдено: 1 из')")
        assert page.locator("#registry-list article").count()==1
        assert "Кредиторская" in page.locator("#registry-list article").inner_text()
        page.goto("http://localhost:8765/cost-structure.html",wait_until="load")
        page.wait_for_function("!document.querySelector('#cost-run').disabled")
        assert page.locator("#cost-table tbody tr").count()==16
        assert page.locator("#cost-chart svg").count()==1
        page.locator("#cost-shocks input").first.fill("10")
        page.locator("#cost-run").click()
        assert "107,52" in page.locator("#cost-result").inner_text()
        with page.expect_download() as d:
            page.locator("#cost-export").click()
        assert d.value.suggested_filename=="cost-scenario.csv"
        page.locator("#cost-mode").select_option("detailed")
        assert page.locator("#cost-export").is_disabled()
        assert page.locator("#cost-shocks input").count()==8
        page.locator("#cost-shocks input").nth(1).fill("10")
        page.locator("#cost-run").click()
        assert "100,16" in page.locator("#cost-result").inner_text()
        page.locator("#cost-year").select_option("2023")
        assert page.locator("#cost-export").is_disabled()
        page.goto("http://localhost:8765/food-balance.html",wait_until="load")
        page.wait_for_function("!document.querySelector('#fbs-run').disabled")
        page.locator("#fbs-run").click()
        assert "сальдо: 0" in page.locator("#fbs-result").inner_text()
        with page.expect_download() as d:
            page.locator("#fbs-export").click()
        assert d.value.suggested_filename=="food-scenario.csv"
        page.goto("http://localhost:8765/industrial.html#energy-output",wait_until="load")
        page.wait_for_function("document.querySelector(\'#energy-status\').textContent!==\'Загрузка…\'")
        assert "Набор не подтверждён" not in page.locator("#energy-status").inner_text()
        if page.locator("#energy-period option").count():
            assert page.locator("#energy-table tbody tr").count()>0
            with page.expect_download() as energy:
                page.locator("#energy-export").click()
            assert energy.value.suggested_filename.startswith("energy-output-")
        page.wait_for_function("document.querySelector('#electricity-status').textContent!=='Загрузка…'")
        energy_data=json.loads(Path("electricity-balance.json").read_text())
        assert "Набор не подтверждён" not in page.locator("#electricity-status").inner_text()
        if energy_data["rows"]:
            assert page.locator("#electricity-table tbody tr").count()>0
            assert page.locator("#electricity-charts svg").count()>0
        if any(any(k in r["values"] for k in energy_data["fuels"]) for r in energy_data["rows"]):
            assert page.locator("#fuel-table tbody tr").count()>0
            assert page.locator("#fuel-charts svg").count()==1
        page.wait_for_function("document.querySelector('#metal-status').textContent!=='Загрузка…'")
        assert "Набор не подтверждён" not in page.locator("#metal-status").inner_text()
        if page.locator("#metal-period option").count():
            assert page.locator("#metal-table tbody tr").count()>0
            with page.expect_download() as metal:
                page.locator("#metal-export").click()
            assert metal.value.suggested_filename.startswith("metal-output-")
        page.goto("http://localhost:8765/food-balance.html",wait_until="load")
        page.wait_for_function("!document.querySelector('#fbs-run').disabled")
        assert not errors,errors
        overflow=page.evaluate("""() => ({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll("main *")].filter(e=>!e.closest(".table-scroll")&&e.getBoundingClientRect().right>document.documentElement.clientWidth+3).slice(0,20).map(e=>[e.tagName,e.id,e.className?.baseVal||e.className,Math.round(e.getBoundingClientRect().right)])})""")
        assert overflow["scroll"]<=overflow["width"]+3,overflow
        page.close()
        print("Global worker/browser regression passed:",width,flush=True)
    browser.close()
