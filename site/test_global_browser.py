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
        page.goto("http://localhost:8765/method-passports.html",wait_until="load")
        assert page.locator("main .portal-grid article").count()==26
        page.goto("http://localhost:8765/reproducibility.html",wait_until="load")
        page.wait_for_function("document.querySelector('#repro-status').textContent.includes('отпечаток проверен')")
        page.locator("#repro-verify").click()
        page.wait_for_function("document.querySelector('#repro-result').textContent.includes('Совпадает:')")
        assert not errors,errors
        overflow=page.evaluate("""() => ({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll("main *")].filter(e=>!e.closest(".table-scroll")&&e.getBoundingClientRect().right>document.documentElement.clientWidth+3).slice(0,20).map(e=>[e.tagName,e.id,e.className?.baseVal||e.className,Math.round(e.getBoundingClientRect().right)])})""")
        assert overflow["scroll"]<=overflow["width"]+3,overflow
        page.close()
        print("Global worker/browser regression passed:",width,flush=True)
    browser.close()
