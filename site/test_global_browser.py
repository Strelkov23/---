"""Targeted browser regression for the worker, exports and parameter invalidation."""
import os
import csv
import io
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
        assert not errors,errors
        overflow=page.evaluate("""() => ({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll("main *")].filter(e=>!e.closest(".table-scroll")&&e.getBoundingClientRect().right>document.documentElement.clientWidth+3).slice(0,20).map(e=>[e.tagName,e.id,e.className?.baseVal||e.className,Math.round(e.getBoundingClientRect().right)])})""")
        assert overflow["scroll"]<=overflow["width"]+3,overflow
        page.close()
        print("Global worker/browser regression passed:",width,flush=True)
    browser.close()
