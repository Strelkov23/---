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
        assert not errors,errors
        assert page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth+3")
        page.close()
        print("Global worker/browser regression passed:",width,flush=True)
    browser.close()
