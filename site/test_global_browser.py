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
        page.goto("http://localhost:8765/index.html",wait_until="load")
        assert page.locator(".route-grid article").count()==3
        assert page.locator(".route-steps a").count()==12
        assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2")
        for route,target in (("company-atlas.html","company-lookup"),("banks.html","bank-capital"),("economic-map.html","regional-map"),("regional-manufacturing.html","rm-ranking"),("project-coverage.html","project-search")):
            page.goto("http://localhost:8765/"+route,wait_until="load")
            assert page.locator(".atlas-task-grid a").count()>=2
            page.locator(".atlas-task-grid a[href='#"+target+"']").click()
            assert page.url.endswith("#"+target)
            assert page.locator("#"+target).count()==1
            assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2")
            assert page.locator(".atlas-back").count()>0
        page.goto("http://localhost:8765/analysis-centre.html",wait_until="load")
        page.locator("#hub-query").fill("финансовая диагностика регионов")
        assert page.locator("#hub-tools article:visible").count()==1
        assert page.locator("#hub-tools article:visible a").get_attribute("href")=="historical.html#enterprise-diagnostics"
        page.locator("#hub-query").fill("no_such_tool")
        assert page.locator("#hub-tools article:visible").count()==0
        page.locator("#hub-query").fill("")
        assert page.locator("#hub-tools article:visible").count()>20
        assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2")
        page.goto("http://localhost:8765/research-projects.html",wait_until="load")
        page.locator("#rp-title").fill("Тестовый проект")
        page.locator("#rp-note").fill("Проверка библиографии")
        page.locator("#rp-create").click()
        project_id=page.locator("#rp-select").input_value()
        assert project_id and page.locator("#rp-save").is_enabled()
        page.goto("http://localhost:8765/papers.html",wait_until="load")
        page.wait_for_function("document.querySelectorAll('#paper-project option').length>1",timeout=30000)
        assert "Записей с заявленной лицензией:" in page.locator("#paper-access-summary").inner_text()
        assert page.locator("#paper-access option").count()==8
        assert "OpenAlex · получены сведения:" in page.locator("#paper-oa-summary").inner_text()
        assert page.locator("#papers details").count()>0
        page.locator("#paper-project").select_option(project_id)
        page.locator("#papers .paper-project-add").first.click()
        assert "Сохранено в проекте: 1" in page.locator("#paper-project-status").inner_text()
        page.locator("#papers .paper-project-add").first.click()
        assert "Сохранено в проекте: 1" in page.locator("#paper-project-status").inner_text()
        page.goto("http://localhost:8765/research-projects.html",wait_until="load")
        page.locator("#rp-select").select_option(project_id)
        assert page.locator("#rp-items tbody tr").count()==1
        assert page.locator("#rp-note").input_value()=="Проверка библиографии"
        for button,filename,signature in (("rp-bibtex","research-project.bib","@article"),("rp-ris","research-project.ris","TY  - JOUR"),("rp-csv","research-project-bibliography.csv","Название проекта")):
            with page.expect_download() as bib:
                page.locator("#"+button).click()
            assert bib.value.suggested_filename==filename
            assert signature in bib.value.path().read_text(encoding="utf-8-sig")
        with page.expect_download() as backup:
            page.locator("#rp-export").click()
        page.locator("#rp-import").set_input_files(str(backup.value.path()))
        page.wait_for_function("document.querySelectorAll('#rp-select option').length===3")
        assert page.locator("#rp-items tbody tr").count()==1
        assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2")
        page.goto("http://localhost:8765/literature-quality.html",wait_until="load")
        assert page.locator("h1").inner_text()=="Качество научного каталога"
        assert page.locator("main table tbody tr").count()>=13
        assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2")
        page.goto("http://localhost:8765/journal-evidence.html",wait_until="load")
        assert page.locator("main article").count()>=13
        page.goto("http://localhost:8765/diagnostics.html#diag-overview",wait_until="load")
        page.wait_for_function("document.querySelectorAll('#diag-overview-cards article').length===6",timeout=45000)
        assert page.locator("#diag-overview-export").is_enabled()
        with page.expect_download() as overview:
            page.locator("#diag-overview-export").click()
        assert overview.value.suggested_filename.startswith("economic-diagnostic-overview-")
        page.wait_for_function("document.querySelectorAll('#diag-signals-table tbody tr').length===13",timeout=30000)
        page.locator("#diag-signals-rule").select_option("manufacturing")
        assert page.locator("#diag-signals-table tbody tr").count()==1
        with page.expect_download() as signal:
            page.locator("#diag-signals-csv").click()
        assert signal.value.suggested_filename.startswith("economic-change-signals-")
        page.locator("#diag-signals-rule").select_option("")
        assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2")
        page.goto("http://localhost:8765/diagnostic-backtest.html",wait_until="load")
        page.wait_for_function("document.querySelectorAll('#db-configs tbody tr').length===9",timeout=30000)
        assert page.locator("#db-grid tbody tr").count()==26
        page.locator("#db-start").fill("2010")
        assert page.locator("#db-grid tbody tr").count()==16
        with page.expect_download() as backtest:
            page.locator("#db-export").click()
        assert backtest.value.suggested_filename=="diagnostic-sensitivity.csv"
        assert len(list(csv.reader(io.StringIO(backtest.value.path().read_text(encoding="utf-8-sig")))))==145
        assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2")
        page.goto("http://localhost:8765/scenario.html",wait_until="load")
        page.wait_for_function("document.querySelectorAll('#stress-controls tbody tr').length===19",timeout=30000)
        page.wait_for_function("document.querySelector('#stress-limit-chart svg')!==null",timeout=30000)
        assert page.locator("#stress-decomp-chart .stress-signed-row").count()==19
        page.locator("#stress-controls input[aria-label^='Изменение спроса:']").nth(8).fill("10")
        assert page.locator("#stress-decomp-csv").is_enabled()
        page.locator("#stress-decomp-group").select_option("0")
        with page.expect_download() as decomp:
            page.locator("#stress-decomp-csv").click()
        assert decomp.value.suggested_filename=="chain-group-contributions-1-2021.csv"
        page.locator("#stress-reset").click()
        page.locator("#global-run").wait_for()
        page.wait_for_function("!document.querySelector('#global-run').disabled")
        page.locator("#global-run").click()
        page.wait_for_function("document.querySelector('#global-status').textContent.includes('Оптимум проверен')",timeout=60000)
        assert page.locator("#global-results tbody tr").count()==5
        assert page.locator("#global-comparison tbody tr").count()==4
        assert page.locator("#global-detail tbody tr").count()==19
        assert page.locator("#global-timeline svg").count()==1
        assert page.locator("#global-investment-heat tbody tr").count()==21
        page.locator("#global-investment-focus").select_option("0")
        assert page.locator("#global-investment-heat tbody tr").count()==3
        with page.expect_download() as calendar:
            page.locator("#global-investment-csv").click()
        assert calendar.value.suggested_filename=="global-investment-calendar.csv"
        page.locator("#global-investment-focus").select_option("")
        page.locator("#global-sens-run").click()
        page.wait_for_function("document.querySelectorAll('#global-sens-table tbody tr').length===3",timeout=90000)
        assert page.locator("#global-results tbody tr").count()==5
        with page.expect_download() as sensitivity:
            page.locator("#global-sens-csv").click()
        assert sensitivity.value.suggested_filename=="global-plan-sensitivity.csv"
        page.locator("#global-joint-run").click()
        page.wait_for_function("document.querySelectorAll('#global-joint-table tbody tr').length===9",timeout=120000)
        assert page.locator("#global-joint-grid tbody td").count()==9
        assert page.locator("#global-robustness-table tbody tr").count()==9
        assert page.locator("#global-robustness .stress-decomp-summary > div").count()==3
        with page.expect_download() as joint:
            page.locator("#global-joint-csv").click()
        assert joint.value.suggested_filename=="global-joint-sensitivity.csv"
        assert page.locator("#global-robust-period-table tbody tr").count()==5
        with page.expect_download() as periods:
            page.locator("#global-robust-period-csv").click()
        assert periods.value.suggested_filename=="global-fixed-calendar-periods.csv"
        assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2"), page.evaluate("Array.from(document.querySelectorAll('main *')).filter(e=>{const r=e.getBoundingClientRect();return r.right>innerWidth+2&&!e.closest('.table-scroll,.atlas-table,.regional-figure-scroll')}).slice(0,20).map(e=>[e.tagName,e.id,e.className,e.getBoundingClientRect().right])")
        with page.expect_download() as download:
            page.locator("#global-csv").click()
        assert download.value.suggested_filename.endswith(".csv")
        page.locator("#global-objective").select_option("terminal")
        assert page.locator("#global-csv").is_disabled()
        assert page.locator("#global-investment-csv").is_disabled()
        assert page.locator("#global-sens-csv").is_disabled()
        assert page.locator("#global-joint-csv").is_disabled()
        assert page.locator("#global-robust-period-csv").is_disabled()
        assert page.locator("#global-robust-period-table tbody tr").count()==0
        assert page.locator("#global-joint-table tbody tr").count()==0
        assert page.locator("#global-robustness-table tbody tr").count()==0
        assert page.locator("#global-sens-table tbody tr").count()==0
        assert page.locator("#global-investment-heat tbody tr").count()==0
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
        assert page.locator("#labor-decomp-start option").count()>1
        if page.locator("#labor-decomp-export").is_enabled():
            assert page.locator("#labor-decomp-table tbody tr").count()==3
            with page.expect_download() as labor_decomp:
                page.locator("#labor-decomp-export").click()
            with open(labor_decomp.value.path(),encoding="utf-8-sig",newline="") as f:
                labor_rows=list(csv.reader(f,delimiter=";"))
            assert len(labor_rows)==4 and len({len(r) for r in labor_rows})==1
        else:
            assert "Нет двух" in page.locator("#labor-decomp-status").inner_text()
        assert "Выборка:" in page.locator("#labor-gap-status").inner_text()
        page.locator("#labor-gap-query").fill("zzzz_no_region")
        assert page.locator("#labor-gap-export").is_disabled()
        page.locator("#labor-gap-query").fill("")
        if page.locator("#labor-gap-table tbody tr").count():
            with page.expect_download() as labor_gap:
                page.locator("#labor-gap-export").click()
            with open(labor_gap.value.path(),encoding="utf-8-sig",newline="") as f:
                gap_rows=list(csv.reader(f,delimiter=";"))
            assert len(gap_rows)>1 and len({len(r) for r in gap_rows})==1
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
        assert page.locator("#cap-signal-table tbody tr").count()==72
        assert "71 из 72" in page.locator("#cap-signal-status").inner_text()
        page.locator("#cap-signal-filter").select_option("incomplete")
        assert page.locator("#cap-signal-table tbody tr").count()==1
        assert "Сгущённые" in page.locator("#cap-signal-table").inner_text()
        with page.expect_download() as cap_signal:
            page.locator("#cap-signal-export").click()
        with open(cap_signal.value.path(),encoding="utf-8-sig",newline="") as f:
            cap_signal_rows=list(csv.reader(f,delimiter=";"))
        assert len(cap_signal_rows)==4 and len({len(r) for r in cap_signal_rows})==1
        page.locator("#cap-signal-span").select_option("2")
        assert page.locator("#cap-signal-export").is_disabled()
        page.locator("#cap-signal-filter").select_option("")
        assert page.locator("#cap-signal-table tbody tr").count()==72
        assert page.locator("#capacity-distribution progress").count()==5
        page.locator("#capacity-sort").select_option("low")
        vals=page.locator("#capacity-table tbody tr td:nth-child(3)").all_text_contents()
        nums=[float(v.replace(",", ".")) for v in vals]
        assert nums==sorted(nums)
        page.locator("#capacity-trend").select_option("condensed")
        assert page.locator("#capacity-trend-chart svg").count()==0
        assert "изменилась формулировка" in page.locator("#capacity-trend-chart").inner_text()
        page.locator("#capacity-query").fill("тракторы")
        assert page.locator("#capacity-table tbody tr").count()==1
        assert page.locator("#capacity-table tbody tr").inner_text().find("42,3")>=0
        with page.expect_download() as cap:
            page.locator("#capacity-export").click()
        assert cap.value.suggested_filename=="capacity-selection.csv"
        page.locator("#capacity-query").fill("zzzz_no_such_product")
        assert page.locator("#capacity-export").is_disabled()
        assert page.locator("#capacity-distribution progress").count()==0
        page.locator("#capacity-query").fill("тракторы")
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
        historical=json.loads(Path("historical.json").read_text())
        debts=[s for s in historical["series"] if s["title"] in ("Кредиторская задолженность организаций: Всего","Кредиторская задолженность организаций: Просроченная") and s["source"].endswith("/data_11_socio_economic_102_v20260313.zip")]
        if len(debts)==2:
            page.goto("http://localhost:8765/historical.html#enterprise-diagnostics",wait_until="load")
            page.wait_for_function("document.querySelector('#ed-status').textContent.startsWith('Год:')",timeout=45000)
            assert page.locator("#ed-table tbody tr").count()>60
            assert page.locator("#ed-table tbody tr").filter(has_text="Сопоставимо").count()>0
            page.locator("#ed-region").select_option("москва")
            assert page.locator("#ed-trend-table tbody tr").count()>=20
            assert page.locator("#ed-trend svg").count()>=1
            with page.expect_download() as debt:
                page.locator("#ed-trend-export").click()
            assert debt.value.suggested_filename=="enterprise-debt-trend-payable.csv"
        page.goto("http://localhost:8765/company-atlas.html",wait_until="load")
        page.wait_for_function("!document.querySelector('#company-source-status').textContent.startsWith('Проверка')",timeout=30000)
        assert page.locator("#company-source-table tbody tr").count()==2
        page.wait_for_function("!document.querySelector('#company-lookup-status').textContent.startsWith('Проверка')",timeout=30000)
        page.locator("#company-lookup-inn").fill("7707083894")
        page.locator("#company-lookup-submit").click()
        assert "корректный" in page.locator("#company-lookup-result").inner_text()
        page.wait_for_function("!document.querySelector('#company-rank-status').textContent.startsWith('Проверка')",timeout=30000)
        if page.locator("#company-rank-export").is_enabled():
            assert page.locator("#company-rank-table tbody tr").count()>0
            page.locator("#company-rank-kind").select_option("employment")
            with page.expect_download() as rankcsv:
                page.locator("#company-rank-export").click()
            assert rankcsv.value.suggested_filename.startswith("company-ranking-employment-")
        finance=json.loads(Path("sme-finance.json").read_text())
        if finance.get("status")=="diagnostic" and finance.get("paired_sums_version")==1:
            page.wait_for_function("!document.querySelector('#sme-pair-export').disabled",timeout=45000)
            page.locator("#sme-pair-metric").select_option("income_worker")
            assert page.locator("#sme-pair-table tbody tr").count()>0
            with page.expect_download() as pair_csv:
                page.locator("#sme-pair-export").click()
            with open(pair_csv.value.path(),encoding="utf-8-sig",newline="") as f:
                pair_rows=list(csv.reader(f,delimiter=";"))
            assert len(pair_rows)>1 and len({len(r) for r in pair_rows})==1
        else:
            assert page.locator("#sme-pair-export").is_disabled()
        groups=json.loads(Path("group-passports.json").read_text())
        page.wait_for_function("document.querySelector('#group-observation-status').textContent.startsWith('Наблюдений:')",timeout=45000)
        obs_total=sum(len(m["observations"]) for g in groups["groups"] for m in g["metrics"])
        assert page.locator("#group-observation-table tbody tr").count()==min(40,obs_total)
        if obs_total>40:
            page.locator("#group-observation-more").click()
            assert page.locator("#group-observation-table tbody tr").count()==min(80,obs_total)
        page.locator("#group-observation-year").select_option("2025")
        page.locator("#group-observation-group").select_option("x5")
        expected_obs=sum(o["year"]==2025 for g in groups["groups"] if g["id"]=="x5" for m in g["metrics"] for o in m["observations"])
        assert page.locator("#group-observation-table tbody tr").count()==min(40,expected_obs)
        if expected_obs:
            with page.expect_download() as obs_csv:
                page.locator("#group-observation-export").click()
            with open(obs_csv.value.path(),encoding="utf-8-sig",newline="") as f:
                obs_rows=list(csv.reader(f,delimiter=";"))
            assert len(obs_rows)==expected_obs+1 and len({len(r) for r in obs_rows})==1
        expected_pairs=sum(any(p["year"]==2024 for p in m["observations"]) and any(p["year"]==2025 for p in m["observations"]) for g in groups["groups"] if g["id"]=="x5" for m in g["metrics"])
        page.locator("#group-observation-paired").check()
        assert page.locator("#group-observation-table tbody tr").count()==min(40,expected_pairs)
        if expected_pairs:
            with page.expect_download() as pair_csv:
                page.locator("#group-observation-export").click()
            with open(pair_csv.value.path(),encoding="utf-8-sig",newline="") as f:
                pair_rows=list(csv.reader(f,delimiter=";"))
            assert len(pair_rows)==expected_pairs+1 and len({len(r) for r in pair_rows})==1
            prior_col=pair_rows[0].index("Предыдущий год")
            assert all(r[prior_col]=="2024" for r in pair_rows[1:])
        page.locator("#group-observation-paired").uncheck()
        page.locator("#group-observation-query").fill("zzzz_no_observation")
        assert page.locator("#group-observation-export").is_disabled()
        page.locator("#group-observation-query").fill("")
        page.locator("#group-observation-group").select_option("")
        page.locator("#group-observation-year").select_option("")
        assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2")

        page.wait_for_function("!document.querySelector('#group-coverage-export').disabled",timeout=45000)
        assert page.locator("#group-coverage-table tbody tr").count()==len(groups["groups"])
        assert page.locator("#group-cross-table tbody tr").count()==len(groups["groups"])
        assert page.locator("#group-coverage-summary .metric").count()==6
        with page.expect_download() as groups_csv:
            page.locator("#group-coverage-export").click()
        with open(groups_csv.value.path(),encoding="utf-8-sig",newline="") as f:
            coverage=list(csv.reader(f,delimiter=";"))
        assert len(coverage)==len(groups["groups"])+1
        assert len({len(r) for r in coverage})==1
        page.wait_for_function("!document.querySelector('#group-level-export').disabled",timeout=30000)
        page.locator("#group-level-metric").select_option("assets")
        assert page.locator("#group-level-table tbody tr").count()==len(groups["groups"])
        with page.expect_download() as level_csv:
            page.locator("#group-level-export").click()
        assert level_csv.value.suggested_filename.startswith("group-levels-assets-")
        with open(level_csv.value.path(),encoding="utf-8-sig",newline="") as f:
            level_rows=list(csv.reader(f,delimiter=";"))
        assert len(level_rows)==len(groups["groups"])+1 and len({len(r) for r in level_rows})==1
        page.locator("#group-cross-metric").select_option("equity_share")
        assert page.locator("#group-cross-table tbody tr").count()==len(groups["groups"])
        x5=next((g for g in groups["groups"] if g["id"]=="x5"),None)
        if x5 and any(m.get("source") for m in x5["metrics"]):
            page.locator("#group-pick").select_option("x5")
            metric=next(m for m in x5["metrics"] if m.get("source"))
            page.locator("#group-metric").select_option(metric["id"])
            assert page.locator("#group-chart a").get_attribute("href")==metric["source"]
            with page.expect_download() as x5csv:
                page.locator("#group-export").click()
            with open(x5csv.value.path(),encoding="utf-8-sig",newline="") as f:
                x5rows=list(csv.reader(f,delimiter=";"))
            source_col=x5rows[0].index("Источник")
            code_col=x5rows[0].index("Код")
            assert all(row[source_col]==metric["source"] for row in x5rows[1:] if row[code_col]==metric["id"])
        if any(g["id"]=="mmk" for g in groups["groups"]):
            page.locator("#group-pick").select_option("mmk")
            page.locator("#group-metric").select_option("profit")
            assert "14" in page.locator("#group-chart").inner_text()
            assert page.locator("#group-ratio-export").is_enabled()
            page.locator("#group-level-sector").select_option(label="Чёрная металлургия")
            page.locator("#group-level-metric").select_option("revenue")
            assert page.locator("#group-level-table tbody tr").count()==sum(g["sector"]=="Чёрная металлургия" for g in groups["groups"])
            page.locator("#group-level-sector").select_option("")
        if any(g["id"]=="nlmk" for g in groups["groups"]):
            page.locator("#group-pick").select_option("nlmk")
            assert "не полный комплект" in page.locator("#group-detail").inner_text()
            assert page.locator("#group-ratio-export").is_disabled()
        page.locator("#group-query").fill("zzzz_no_such_group")
        assert page.locator("#group-export").is_disabled()
        page.locator("#group-query").fill("")
        assert page.locator("#group-export").is_enabled()
        assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2")
        page.goto("http://localhost:8765/banks.html",wait_until="load")
        page.wait_for_function("!document.querySelector('#bank-source-status').textContent.startsWith('Проверка')",timeout=30000)
        assert page.locator("#bank-metrics .metric").count()==3
        if page.locator("#bank-export").is_enabled():
            assert page.locator("#bank-table tbody tr").count()>0
            page.locator("#bank-query").fill("zzzz_no_bank")
            assert page.locator("#bank-table tbody tr").count()==0
        page.wait_for_function("document.querySelectorAll('#bank-coverage-table tbody tr').length===3",timeout=45000)
        if page.locator("#bank-coverage-export").is_enabled():
            with page.expect_download() as bank_cov:
                page.locator("#bank-coverage-export").click()
            with open(bank_cov.value.path(),encoding="utf-8-sig",newline="") as f:
                coverage=list(csv.reader(f,delimiter=";"))
            assert len(coverage)==4 and len({len(r) for r in coverage})==1
        assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2")
        page.wait_for_function("document.querySelector('#bank-ratio-status').textContent.startsWith('Сопоставимых значений:')",timeout=45000)
        bank_balance=json.loads(Path("bank-balance.json").read_text())
        target=set(bank_balance["cohort"])
        expected=sum(r["registration_number"] in target for r in bank_balance["rows"])
        assert page.locator("#bank-ratio-table tbody tr").count()==expected
        page.locator("#bank-ratio-metric").select_option("retail_client")
        if expected:
            with page.expect_download() as ratios_csv:
                page.locator("#bank-ratio-export").click()
            with open(ratios_csv.value.path(),encoding="utf-8-sig",newline="") as f:
                ratio_rows=list(csv.reader(f,delimiter=";"))
            assert len(ratio_rows)==expected+1 and len({len(r) for r in ratio_rows})==1
        assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2")
        page.wait_for_function("document.querySelector('#bank-profit-ratio-status').textContent.startsWith('Сопоставимых отношений:')",timeout=45000)
        profit_data=json.loads(Path("bank-profit.json").read_text())
        profit_target=set(profit_data["cohort"])
        profit_expected=sum(r["registration_number"] in profit_target for r in profit_data["rows"])
        assert page.locator("#bank-profit-ratio-table tbody tr").count()==profit_expected
        page.locator("#bank-profit-ratio-metric").select_option("fee_cost")
        assert page.locator("#bank-profit-paired .metric").count()>=4
        if profit_expected:
            for selector in ("#bank-profit-ratio-export","#bank-profit-paired-export"):
                with page.expect_download() as profit_csv:
                    page.locator(selector).click()
                with open(profit_csv.value.path(),encoding="utf-8-sig",newline="") as f:
                    profit_rows=list(csv.reader(f,delimiter=";"))
                assert len(profit_rows)==profit_expected+1 and len({len(r) for r in profit_rows})==1
        assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2")
        page.goto("http://localhost:8765/facility-map.html",wait_until="load")
        page.wait_for_function("!document.querySelector('#amur-ent-status').textContent.startsWith('Проверка')",timeout=30000)
        if page.locator("#amur-ent-export").is_enabled():
            assert page.locator("#amur-ent-table tbody tr").count()>=20
            assert page.locator("#amur-ent-metrics .metric").count()==3
            page.locator("#amur-ent-group").select_option("category")
            assert page.locator("#amur-ent-chart .rm-composition-row").count()>0
            page.locator("#amur-ent-query").fill("zzzz_no_such_company")
            assert page.locator("#amur-ent-table tbody tr").count()==0
            page.locator("#amur-ent-query").fill("")
        page.wait_for_function("!document.querySelector('#enterprise-source-status').textContent.startsWith('Загрузка')",timeout=30000)
        assert page.locator("#enterprise-source-status article").count()==2
        page.wait_for_function("!document.querySelector('#facility-status').textContent.startsWith('Загрузка')",timeout=30000)
        if page.locator("#facility-status").inner_text().startswith("Архивных записей:"):
            assert page.locator("#facility-map svg").count()==1
            assert page.locator("#facility-list article").count()>0
            page.locator("#facility-query").fill("zzzz_no_such_facility")
            assert page.locator("#facility-list article").count()==0
        page.wait_for_function("!document.querySelector('#sme-status').textContent.startsWith('Загрузка')",timeout=30000)
        if page.locator("#sme-status").inner_text().startswith("Срез:"):
            assert page.locator("#sme-map svg").count()==1
            page.locator("#sme-metric").select_option("workers")
            assert "Работники" in page.locator("#sme-map svg").text_content()
            page.locator("#sme-metric").select_option("ipShare")
            assert "Доля ИП" in page.locator("#sme-map svg").text_content()
            page.locator("#sme-map-section details summary").click()
            page.locator("#sme-query").fill("77")
            assert page.locator("#sme-table tbody tr").count()==1
            with page.expect_download() as sme_export:
                page.locator("#sme-selection-export").click()
            assert sme_export.value.suggested_filename.startswith("sme-selection-")
            page.locator("#sme-query").fill("no_such_region")
            assert page.locator("#sme-selection-export").is_disabled()
            assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2")
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
        assert "недоступных наборов" not in page.locator("#site-search-status").inner_text()
        page.locator("#site-search-scope").select_option("tools")
        page.wait_for_function("document.querySelectorAll('#site-search-results section').length===1")
        assert page.locator("#site-search-results article a").count()>0
        page.goto("http://localhost:8765/economic-map.html",wait_until="load")
        page.wait_for_function("!document.querySelector('#geo-status').textContent.startsWith('Загрузка')")
        if page.locator("#geo-series option").count():
            page.locator("#geo-theme").select_option("industry")
            page.wait_for_function("document.querySelector('#geo-status').textContent.startsWith('Год:')")
            assert page.locator("#geo-map svg").count()==1
            assert page.locator("#geo-coverage-current progress").count()==1
            theme_values=page.locator("#geo-theme option").evaluate_all("(options) => options.map(o => o.value)")
            assert set(("living","capital","ict","prices","foreign_trade")).issubset(theme_values)
            assert page.locator("#geo-coverage-list button").count()==len(set(theme_values)-{"all"})
            page.locator("#geo-coverage summary").click()
            assert page.locator("#geo-coverage-list button").first.is_visible()
            page.locator("#geo-coverage summary").click()
            page.locator("#geo-comparison summary").click()
            page.locator("#geo-compare-a").select_option("RU-MOW")
            page.locator("#geo-compare-b").select_option("RU-SPE")
            assert page.locator("#geo-compare-result tbody tr").count()==2
            with page.expect_download() as comparison:
                page.locator("#geo-compare-export").click()
            assert comparison.value.suggested_filename.startswith("regional-comparison-")
            page.locator("#geo-comparison summary").click()
            page.locator("#geo-dashboard > summary").click()
            page.wait_for_function("document.querySelector('#gd-status').textContent.startsWith('Год:')",timeout=45000)
            assert page.locator("#gd-table tbody tr").count()>70
            page.locator("#gd-signals summary").click()
            page.wait_for_function("document.querySelectorAll('#gd-sig-table tbody tr').length>70",timeout=30000)
            page.wait_for_function("document.querySelectorAll('#gd-sig-map path[data-signal-category]').length>70",timeout=30000)
            assert page.locator("#gd-sig-map path[data-signal-category=unmatched]").count()>0
            with page.expect_download() as signalmap:
                page.locator("#gd-sig-map-export").click()
            assert signalmap.value.suggested_filename.endswith(".svg")
            page.locator("#gd-sig-query").fill("RU-MOW")
            assert page.locator("#gd-sig-table tbody tr").count()==1
            with page.expect_download() as regional_signal:
                page.locator("#gd-sig-csv").click()
            assert regional_signal.value.suggested_filename.startswith("regional-change-signals-")
            page.locator("#gd-sig-query").fill("")
            page.locator("#gd-signals summary").click()
            page.locator("#gd-query").fill("RU-MOW")
            assert page.locator("#gd-table tbody tr").count()==1
            page.locator("#gd-query").fill("")
            page.locator("#gd-sort").select_option("0")
            page.locator("#gd-view").select_option("rank")
            page.locator("#gd-view").select_option("percentile")
            assert page.locator("#gd-table td[data-gd-band]").count()>0
            page.locator("#gd-heat").uncheck()
            assert page.locator("#gd-table td[data-gd-band]").count()==0
            page.locator("#gd-heat").check()
            page.locator("#gd-pair-a").select_option("3")
            page.locator("#gd-pair-b").select_option("5")
            if page.locator("#gd-pair-export").is_enabled():
                assert page.locator("#gd-pair-chart svg").count()==1
                with page.expect_download() as pair:
                    page.locator("#gd-pair-export").click()
                assert pair.value.suggested_filename.startswith("regional-pairs-")
            with page.expect_download() as wide:
                page.locator("#gd-wide-export").click()
            assert wide.value.suggested_filename.startswith("regional-multivariate-matrix-")
            page.locator("#gd-mode").select_option("selected")
            assert page.locator("#gd-table tbody tr").count()==8
            page.locator("#gd-scope").check()
            assert "общая выборка" in page.locator("#gd-status").inner_text()
            with page.expect_download() as gd:
                page.locator("#gd-export").click()
            assert gd.value.suggested_filename.startswith("regional-multivariate-")
            page.locator("#geo-dashboard > summary").click()
            page.locator("#geo-scale").select_option("growth")
            page.locator("#geo-markers").select_option("top")
            assert page.locator("#geo-map g[role=button]").count()>0
            assert page.locator("#geo-map g[role=button]").count()<=8
            page.locator("#geo-scale").select_option("quantile")
            page.locator("#geo-palette").select_option("contrast")
            assert page.locator("#geo-map svg").count()==1
            page.locator("#geo-region").select_option("RU-MOW")
            page.wait_for_function("document.querySelector('.geo-brief [role=status]').textContent.startsWith('Доступно')",timeout=30000)
            assert page.locator(".geo-brief-item").count()==10
            assert page.locator(".geo-brief-item .geo-trend").count()>0
            assert page.locator(".geo-brief-item a").count()>0
            page.wait_for_function("!document.querySelector('.geo-business p').textContent.startsWith('Проверка')")
            sme=json.loads(Path("sme-regions.json").read_text())
            if any(r["code"]=="77" for r in sme["rows"]):
                assert page.locator(".geo-business dd").count()==4
            page.locator("#geo-detail .geo-profile summary").click()
            page.wait_for_function("document.querySelector('#geo-detail .geo-profile [role=status]').textContent.startsWith('Доступно:')",timeout=30000)
            assert page.locator("#geo-detail .geo-profile-observations tbody tr").count()==43
            assert page.locator("#geo-detail .geo-profile select option").count()==13
            assert "ошибок загрузки" not in page.locator("#geo-detail .geo-profile [role=status]").inner_text()
            with page.expect_download() as profile:
                page.get_by_role("button",name="Скачать досье CSV",exact=True).click()
            assert profile.value.suggested_filename.startswith("regional-profile-")
            with open(profile.value.path(),encoding="utf-8-sig",newline="") as f:
                profile_rows=list(csv.reader(f,delimiter=";"))
            assert len(profile_rows)==44
            assert len({len(r) for r in profile_rows})==1
            assert "SHA-256 JSON" in profile_rows[0]
            page.locator("#geo-detail .geo-profile select").select_option("Инвестиции и фонды")
            assert page.locator("#geo-detail .geo-profile-observations tbody tr").count()==4
            page.locator("#geo-detail .geo-profile input[type=checkbox]").check()
            assert page.locator("#geo-detail .geo-profile-observations tbody tr").count()<=4
            with page.expect_download() as filtered:
                page.get_by_role("button",name="Скачать досье CSV",exact=True).click()
            with open(filtered.value.path(),encoding="utf-8-sig",newline="") as f:
                filtered_rows=list(csv.reader(f,delimiter=";"))
            assert all(r[3]=="Инвестиции и фонды" for r in filtered_rows[1:])
            assert len(filtered_rows)==page.locator("#geo-detail .geo-profile-observations tbody tr").count()+1
            assert page.locator("#geo-detail .geo-derived tbody tr").count()==4
            with page.expect_download() as calculated:
                page.get_by_role("button",name="Скачать расчётные показатели CSV",exact=True).click()
            with open(calculated.value.path(),encoding="utf-8-sig",newline="") as f:
                calc_rows=list(csv.reader(f,delimiter=";"))
            assert len(calc_rows)==5
            assert len({len(r) for r in calc_rows})==1
            assert "Первый SHA-256 JSON" in calc_rows[0]
            page.locator("#geo-theme").select_option("agriculture")
            page.wait_for_function("document.querySelector('#geo-status').textContent.startsWith('Год:') || document.querySelector('#geo-status').textContent.includes('нет загруженных рядов')")
        page.goto("http://localhost:8765/district-map.html",wait_until="load")
        page.wait_for_function("!document.querySelector('#district-status').textContent.startsWith('Загрузка')",timeout=45000)
        if page.locator("#district-status").inner_text().startswith("2017 год"):
            assert page.locator("#district-map svg path").count()==2327
        page.goto("http://localhost:8765/news-map.html",wait_until="load")
        page.wait_for_function("document.querySelector('#news-geo-status').textContent.startsWith('Период до')",timeout=30000)
        assert page.locator("#news-geo-map svg").count()==1
        assert "Сборка архива:" in page.locator("#news-geo-freshness").inner_text()
        page.locator("#news-geo-update").click()
        page.wait_for_function("document.querySelector('#news-geo-freshness').textContent.includes('новых сборок нет')")
        assert page.locator("#news-geo-map svg").count()==1
        page.route("**/data-manifest.json",lambda route:route.abort())
        page.locator("#news-geo-update").click()
        page.wait_for_function("document.querySelector('#news-geo-freshness').textContent.includes('сохранена предыдущая версия')")
        assert page.locator("#news-geo-map svg").count()==1
        page.unroute("**/data-manifest.json")
        page.locator("#news-geo-map .map-controls button").nth(1).click()
        assert "150%" in page.locator("#news-geo-map .map-controls").inner_text()
        viewport=page.locator("#news-geo-map .map-viewport")
        viewport.focus()
        viewport.press("+")
        assert "200%" in page.locator("#news-geo-map .map-controls").inner_text()
        viewport.press("-")
        assert "150%" in page.locator("#news-geo-map .map-controls").inner_text()

        page.locator("#news-geo-map .map-controls button").nth(2).click()
        assert "100%" in page.locator("#news-geo-map .map-controls").inner_text()
        page.locator("#news-geo-days").select_option("1")
        assert "1 дней" in page.locator("#news-geo-map svg").text_content()
        page.locator("#news-geo-rule").select_option("region")
        assert "только города: 0" in page.locator("#news-geo-status").inner_text()
        page.locator("#news-geo-rule").select_option("all")
        page.locator("#news-geo-days").select_option("90")
        if page.locator("#news-geo-region option").count()>1:
            page.locator("#news-geo-region").select_option(index=1)
            assert page.locator("#news-geo-list article a[href^='http']").count()>0
        page.goto("http://localhost:8765/method-passports.html",wait_until="load")
        methods=json.loads(Path("method-passports.json").read_text())
        assert len(methods)>=33
        assert page.locator("main .portal-grid article").count()==len(methods)
        assert page.locator("main .portal-grid a[href=\"methodology.html#metallurgy-output-method\"]").count()==1
        for route,title in (("data-infrastructure.html","Инфраструктура экономических данных"),("normalized-data.html","Единый формат наблюдений"),("source-journal.html","Журнал загрузок и редакций"),("source-pipeline.html","Реестр загрузчиков и карантин")):
            page.goto("http://localhost:8765/"+route,wait_until="load")
            assert page.locator("h1").inner_text()==title
            assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2")
            assert page.locator("main table").count()>=1
        page.goto("http://localhost:8765/reproducibility.html",wait_until="load")
        page.wait_for_function("!document.querySelector('#repro-verify').disabled",timeout=30000)
        page.locator("#repro-file").select_option("federal-budget.csv")
        page.locator("#repro-verify").click()
        page.wait_for_function("document.querySelector('#repro-result').textContent.includes('Совпадает: federal-budget.csv')",timeout=30000)
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
        page.goto("http://localhost:8765/atlas.html#balance-matrix",wait_until="load")
        page.wait_for_function("document.querySelectorAll('#bm-network path[data-bm-edge]').length>0",timeout=30000)
        assert page.locator("#bm-network path[data-bm-edge]").count()==20
        page.locator("#bm-network-limit").select_option("10")
        assert page.locator("#bm-network path[data-bm-edge]").count()==10
        with page.expect_download() as network:
            page.locator("#bm-network-export").click()
        assert network.value.suggested_filename=="domestic-intermediate-network-2021.csv"
        assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2")
        page.wait_for_function("document.querySelector('#bm-status').textContent.startsWith('19 × 19')",timeout=30000)
        assert page.locator("#bm-table td button").count()==361
        page.locator("#bm-metric").select_option("inputs")
        assert page.locator("#bm-log").is_disabled()
        page.locator("#bm-self").uncheck()
        assert page.locator("#bm-table button[data-band=missing]").count()>=19
        page.locator("#bm-focus").select_option("0")
        assert page.locator("#bm-table button[data-dim=true]").count()==324
        page.locator("#bm-table td button").nth(1).click()
        assert page.locator("#bm-detail .metric").count()==3
        with page.expect_download() as matrix:
            page.locator("#bm-export").click()
        assert matrix.value.suggested_filename=="domestic-intermediate-matrix-2021.csv"
        with open(matrix.value.path(),encoding="utf-8-sig",newline="") as f:
            matrix_rows=list(csv.reader(f,delimiter=";"))
        assert len(matrix_rows)==362 and len({len(r) for r in matrix_rows})==1
        assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2")
        page.goto("http://localhost:8765/sector-passports.html?sp-sector=chemical",wait_until="load")
        page.wait_for_function("document.querySelector('#sp-status').textContent.startsWith('Показателей в выборке:')",timeout=30000)
        assert page.locator("#sp-sector").input_value()=="chemical"
        assert page.locator("#sp-sector option").count()==20
        assert "Химическая промышленность" in page.locator("#sp-scope").inner_text()
        assert page.locator("#sp-chain-table tbody tr").count()==19
        assert page.locator("#sp-chain-diagram .sp-flow-side").count()==2
        assert page.locator("#sp-chain-diagram .sp-flow-center").count()==1
        assert page.locator("#sp-chain-diagram .sp-flow-item").count()>0
        page.locator("#sp-chain-limit").select_option("3")
        assert page.locator("#sp-chain-diagram .sp-flow-item").count()<=8
        assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2")
        page.locator("#sp-chain-direction").select_option("outputs")
        page.locator("#sp-chain-self").select_option("no")
        assert page.locator("#sp-chain-table tbody tr").count()==18
        with page.expect_download() as chain:
            page.locator("#sp-chain-export").click()
        assert chain.value.suggested_filename.endswith("-outputs-2021.csv")
        assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2")
        passports=json.loads(Path("sector-passports.json").read_text())["profiles"]
        chemical=next(p for p in passports if p["id"]=="chemical")
        if chemical["finance"]:
            assert page.locator("#sp-finance-year option").count()>0
            year=int(page.locator("#sp-finance-year").input_value())
            assert page.locator("#sp-finance-table tbody tr").count()==sum(x["year"]==year for x in chemical["finance"])
            assert all(x["local_code"]=="20" for x in chemical["finance"])
            with page.expect_download() as download:
                page.locator("#sp-finance-export").click()
            assert download.value.suggested_filename=="sector-finance-chemical-"+str(year)+".csv"
        else:
            assert page.locator("#sp-finance-export").is_disabled()
        page.wait_for_function("document.querySelector('#sp-capital-status').textContent.includes('продуктов:')",timeout=30000)
        assert page.locator("#sp-capacity-table tbody tr").count()==6
        assert page.locator("#sp-capital-assets tbody tr").count()==0
        with page.expect_download() as cexp:
            page.locator("#sp-capital-export").click()
        assert cexp.value.suggested_filename.startswith("sector-capital-chemical-")
        page.locator("#sp-sector").select_option("pharma")
        assert page.locator("#sp-capital-export").is_disabled()
        page.locator("#sp-sector").select_option("light")
        assert page.locator("#sp-capacity-table tbody tr").count()==6
        page.locator("#sp-capital-year").select_option("2022")
        assert page.locator("#sp-capital-status").inner_text().startswith("2022")

        assert "Лёгкая промышленность" in page.locator("#sp-scope").inner_text()
        page.goto("http://localhost:8765/investment-projects.html",wait_until="load")
        projects=json.loads(Path("investment-projects.json").read_text())
        assert page.locator("#project-rows tr").count()==len(projects["rows"])
        assert "из "+str(len(projects["rows"])) in page.locator("#project-count").inner_text()
        page.locator("#project-query").fill("несуществующий-запрос-987654321")
        assert "Записей в выборке: 0 из " in page.locator("#project-count").inner_text()
        assert page.locator("#project-rows tr:visible").count()==0
        page.locator("#project-query").fill("")
        assert page.locator("#project-rows tr:visible").count()==len(projects["rows"])
        if projects["rows"]:
            status=projects["rows"][0]["status"]
            page.locator("#project-status").select_option(status)
            assert page.locator("#project-rows tr:visible").count()==sum(r["status"]==status for r in projects["rows"])
        assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2")
        page.goto("http://localhost:8765/amur-projects.html",wait_until="load")
        amur=json.loads(Path("amur-projects.json").read_text())
        assert page.locator("#amur-rows tr").count()==len(amur["rows"])
        page.locator("#amur-query").fill("несуществующий-запрос-987654321")
        assert page.locator("#amur-rows tr:visible").count()==0
        page.locator("#amur-query").fill("")
        assert page.locator("#amur-rows tr:visible").count()==len(amur["rows"])
        if amur["rows"]:
            sector=amur["rows"][0]["sector"]
            page.locator("#amur-sector").select_option(sector)
            assert page.locator("#amur-rows tr:visible").count()==sum(r["sector"]==sector for r in amur["rows"])
        assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2")
        page.goto("http://localhost:8765/krasnodar-projects.html",wait_until="load")
        kd=json.loads(Path("krasnodar-projects.json").read_text())
        assert page.locator("#amur-rows tr").count()==len(kd["rows"])
        page.locator("#amur-query").fill("несуществующий-запрос-987654321")
        assert page.locator("#amur-rows tr:visible").count()==0
        page.locator("#amur-query").fill("")
        assert page.locator("#amur-rows tr:visible").count()==len(kd["rows"])
        if kd["rows"]:
            sector=kd["rows"][0]["sector"]
            page.locator("#amur-sector").select_option(sector)
            assert page.locator("#amur-rows tr:visible").count()==sum(r["sector"]==sector for r in kd["rows"])
        assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2")
        page.goto("http://localhost:8765/project-coverage.html",wait_until="load")
        coverage=json.loads(Path("project-coverage.json").read_text())
        assert page.locator("#project-coverage-cards article").count()==len(coverage["rows"])==3
        assert page.locator("#project-coverage-rows tr").count()==3
        assert page.locator("[data-project-breakdown]").count()==len(coverage["breakdown"])
        page.wait_for_function("document.querySelector('#project-search-status').textContent.startsWith('Записи источников:')",timeout=45000)
        count=sum(r["records"] or 0 for r in coverage["rows"])
        assert page.locator("#project-search-table tbody tr").count()==min(count,40)
        page.locator("#project-search-region").select_option("RU-BU")
        page.locator("#project-search-numeric").select_option("both")
        if page.locator("#project-search-export").is_enabled():
            with page.expect_download() as project_csv:
                page.locator("#project-search-export").click()
            with open(project_csv.value.path(),encoding="utf-8-sig",newline="") as f:
                project_rows=list(csv.reader(f,delimiter=";"))
            assert len(project_rows)>1 and len({len(r) for r in project_rows})==1
            assert all(r[0]=="RU-BU" for r in project_rows[1:])
        if page.locator("#project-search-totals-export").is_enabled():
            assert page.locator("#project-search-totals .metric").count()==6
            with page.expect_download() as totals_csv:
                page.locator("#project-search-totals-export").click()
            with open(totals_csv.value.path(),encoding="utf-8-sig",newline="") as f:
                totals=list(csv.reader(f,delimiter=";"))
            assert len(totals)==2 and len(totals[0])==len(totals[1])
            assert totals[1][0]=="RU-BU"
        page.locator("#project-search-query").fill("zzzz_no_project_987654")
        assert page.locator("#project-search-table tbody tr").count()==0
        assert page.locator("#project-search-export").is_disabled()
        page.locator("#project-search-query").fill("")
        if coverage["breakdown"]:
            group=page.locator("details").filter(has=page.locator("[data-project-breakdown]")).first
            group.locator("summary").click()
            assert group.locator("[data-project-breakdown]:visible").count()>0
            assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2")
        assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2")
        page.goto("http://localhost:8765/industrial-parks.html?park-iso=RU-MOS",wait_until="load")
        parks=json.loads(Path("industrial-parks.json").read_text())
        if parks["rows"]:
            page.wait_for_function("document.querySelector('#park-status').textContent.startsWith('Каталог:')",timeout=30000)
            assert page.locator("#park-map svg").count()==1
            assert page.locator("#park-region").input_value()=="Московская область"
            assert page.locator("#park-regional-table tbody tr").count()==len({r["region"] for r in parks["rows"]})
            page.locator("#park-region").select_option("")
            page.locator("#park-type").select_option("Гринфилд")
            count=sum(r["type"]=="Гринфилд" for r in parks["rows"])
            assert "выборка: "+str(count) in page.locator("#park-status").inner_text()
            if count:
                with page.expect_download() as park:
                    page.locator("#park-export").click()
                assert park.value.suggested_filename=="industrial-park-catalogue.csv"
            page.locator("#park-query").fill("unlikely name 123456789")
            assert page.locator("#park-export").is_disabled()
        else:
            page.wait_for_function("document.querySelector('#park-status').textContent.startsWith('Каталог ещё не загружен')",timeout=30000)
            assert page.locator("#park-export").is_disabled()
        certs=json.loads(Path("park-certificates.json").read_text())
        if certs["rows"]:
            page.wait_for_function("document.querySelector('#cert-status').textContent.startsWith('Документы:')",timeout=30000)
            assert page.locator("#cert-table tbody tr").count()==len(certs["rows"])
            page.locator("#cert-query").fill(certs["rows"][0]["number"])
            assert page.locator("#cert-table tbody tr").count()>=1
            with page.expect_download() as cd:
                page.locator("#cert-export").click()
            assert cd.value.suggested_filename=="industrial-park-certificates.csv"
            page.locator("#cert-query").fill("unlikely certificate 999999999")
            assert page.locator("#cert-export").is_disabled()
        else:
            page.wait_for_function("document.querySelector('#cert-status').textContent.startsWith('Список документов не загружен')",timeout=30000)
            assert page.locator("#cert-export").is_disabled()
        page.goto("http://localhost:8765/regional-manufacturing.html?rm-group=light&rm-year=2024&rm-region=RU-MOS",wait_until="load")
        manufacturing=json.loads(Path("regional-manufacturing.json").read_text())
        if manufacturing["rows"]:
            page.wait_for_function("document.querySelector('#rm-status').textContent.startsWith('Отрасль:')",timeout=30000)
            assert page.locator("#rm-group option").count()==14
            assert page.locator("#rm-group").input_value()=="light"
            assert page.locator("#rm-year").input_value()=="2024"
            assert page.locator("#rm-map svg path[data-region]").count()>70
            assert page.locator("#rm-table tbody tr").count()>65
            assert page.locator(".rm-quick-nav a").count()==7
            assert page.locator("#rm-conc-table tbody tr").count()>65
            assert page.locator("#rm-shift-table tbody tr").count()>65
            assert page.locator("#rm-geoconc-table tbody tr").count()==14
            page.locator("#rm-geoconc-group").select_option("light")
            with page.expect_download() as geoconc:
                page.locator("#rm-geoconc-export").click()
            assert geoconc.value.suggested_filename.startswith("industry-geographic-concentration-")
            with page.expect_download() as shift:
                page.locator("#rm-shift-export").click()
            assert shift.value.suggested_filename.startswith("regional-structural-shift-")
            assert page.locator("#rm-conc-region").input_value()=="RU-MOS"
            with page.expect_download() as concentration:
                page.locator("#rm-conc-export").click()
            assert concentration.value.suggested_filename=="regional-concentration-C-2024.csv"
            with open(concentration.value.path(),encoding="utf-8-sig",newline="") as f:
                concentration_rows=list(csv.reader(f,delimiter=";"))
            assert len(concentration_rows)>65 and len({len(r) for r in concentration_rows})==1
            assert page.locator(".rm-formula-diagram > div").count()==3
            assert "Московская" in page.locator("#rm-detail").inner_text()
            page.locator("#rm-all-profile summary").click()
            extra_profile=json.loads(Path("regional-mining-energy.json").read_text())
            expected_groups=len(manufacturing["groups"])+len(extra_profile["groups"])
            assert page.locator("#rm-profile-table tbody tr").count()==expected_groups
            page.locator("#rm-profile-section").select_option("C")
            assert page.locator("#rm-profile-table tbody tr").count()==14
            page.locator("#rm-profile-mode").select_option("specialized")
            for tr in page.locator("#rm-profile-table tbody tr").all():
                assert float(tr.locator("td").nth(4).inner_text().replace(",","."))>=1
            page.locator("#rm-profile-mode").select_option("all")
            with page.expect_download() as profile_export:
                page.locator("#rm-profile-export").click()
            assert profile_export.value.suggested_filename=="regional-industry-profile-RU-MOS-2024.csv"
            with open(profile_export.value.path(),encoding="utf-8-sig",newline="") as f:
                profile_csv=list(csv.reader(f,delimiter=";"))
            assert len(profile_csv)==15 and len({len(r) for r in profile_csv})==1
            assert "SHA-256 ZIP" in profile_csv[0]
            assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2")
            if len({r["year"] for r in manufacturing["rows"]})>=2:
                assert page.locator("#rm-delta-table tbody tr").count()>65
                page.locator("#rm-delta-query").fill("RU-MOS")
                assert page.locator("#rm-delta-table tbody tr").count()==1
                assert page.locator("#rm-shift-share tbody tr").count()==1
                page.locator("#rm-shift-share summary").click()
                with page.expect_download() as ss_export:
                    page.locator("#rm-shift-share-export").click()
                with open(ss_export.value.path(),encoding="utf-8-sig",newline="") as f:
                    ss_rows=list(csv.reader(f,delimiter=";"))
                assert len(ss_rows)==2 and len(ss_rows[0])==len(ss_rows[1])
                assert page.locator("#rm-signal-map svg path[data-region]").count()>65
                page.locator("#rm-signal-threshold").select_option("20")
                page.locator("#rm-signal-map path[data-region='RU-MOS']").evaluate("(el)=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))")
                assert "Московская" in page.locator("#rm-signal-detail").inner_text()
                with page.expect_download() as sig_export:
                    page.locator("#rm-signal-export").click()
                with open(sig_export.value.path(),encoding="utf-8-sig",newline="") as f:
                    sig_rows=list(csv.reader(f,delimiter=";"))
                assert len(sig_rows)>65 and len({len(r) for r in sig_rows})==1
                assert page.locator("body").evaluate("(el)=>el.scrollWidth <= window.innerWidth+2")
                page.locator("#rm-delta-metric").select_option("localizationDelta")
                with page.expect_download() as regional_delta:
                    page.locator("#rm-delta-export").click()
                assert regional_delta.value.suggested_filename=="regional-structure-all-light-2022-2024.csv"
                with open(regional_delta.value.path(),encoding="utf-8-sig",newline="") as f:
                    all_delta=list(csv.reader(f,delimiter=";"))
                assert len(all_delta)==2 and len(all_delta[0])==len(all_delta[1])
                page.locator("#rm-delta-query").fill("")
                page.locator("#rm-delta-start").select_option("2024")
                assert page.locator("#rm-delta-export").is_disabled()
                page.locator("#rm-delta-start").select_option("2022")
                assert page.locator("#rm-delta-export").is_enabled()
                assert page.locator("#rm-change-table tbody tr").count()==14
                assert "Изменение доли" in page.locator("#rm-change-table").inner_text()
                with page.expect_download() as delta:
                    page.locator("#rm-change-export").click()
                assert delta.value.suggested_filename=="regional-industry-change-RU-MOS-C-2022-2024.csv"
                with open(delta.value.path(),encoding="utf-8-sig",newline="") as f:
                    rows=list(csv.reader(f,delimiter=";"))
                assert len(rows)==15
                assert len({len(r) for r in rows})==1
                assert "SHA-256 ZIP" in rows[0]
            page.locator("#rm-group").select_option("chemical")
            assert "фармацевтика" in page.locator("#rm-status").inner_text()
            with page.expect_download() as rm:
                page.locator("#rm-export").click()
            assert rm.value.suggested_filename=="regional-manufacturing-chemical-2024.csv"
        extra=json.loads(Path("regional-mining-energy.json").read_text())
        if extra["rows"]:
            page.goto("http://localhost:8765/regional-manufacturing.html?rm-group=coal&rm-year=2024&rm-region=RU-MOS",wait_until="load")
            page.wait_for_function("document.querySelector('#rm-status').textContent.startsWith('Отрасль:')",timeout=30000)
            assert page.locator("#rm-section").input_value()=="B"
            assert page.locator("#rm-group").input_value()=="coal"
            assert page.locator("#rm-group option").count()==6
            assert "раздел B" in page.locator("#rm-status").inner_text()
            assert "Итог раздела B" in page.locator("#rm-table").inner_text()
            assert page.locator("#rm-detail > .table-scroll").first.locator("tbody tr").count()==6
            with page.expect_download() as rm:
                page.locator("#rm-export").click()
            assert rm.value.suggested_filename=="regional-manufacturing-coal-2024.csv"
            page.locator("#rm-section").select_option("D")
            assert page.locator("#rm-group option").count()==4
            page.locator("#rm-group").select_option("heat")
            assert "раздел D" in page.locator("#rm-status").inner_text()
            assert "Итог раздела D" in page.locator("#rm-table").inner_text()
            assert page.locator("#rm-detail > .table-scroll").first.locator("tbody tr").count()==4
        elif not manufacturing["rows"]:
            page.wait_for_function("document.querySelector('#rm-status').textContent.startsWith('Нет загруженных наблюдений')",timeout=30000)
            assert page.locator("#rm-export").is_disabled()
        page.goto("http://localhost:8765/stat-revisions.html",wait_until="load")
        page.wait_for_function("document.querySelector('#rev-status').textContent.startsWith('Снимок')",timeout=30000)
        assert page.locator("#rev-build option").count()>0
        page.locator("#rev-kind").select_option("revised")
        assert "найдено" in page.locator("#rev-status").inner_text()
        page.goto("http://localhost:8765/freshness.html",wait_until="load")
        page.wait_for_function("document.querySelector('#fresh-status').textContent.startsWith('Срез контроля:')",timeout=30000)
        assert page.locator("#fresh-table tbody tr").count()>0
        page.locator("#fresh-group").select_option("Всемирный банк")
        assert page.locator("#fresh-table tbody tr").count()>0
        with page.expect_download() as fresh:
            page.locator("#fresh-export").click()
        assert fresh.value.suggested_filename=="source-freshness.csv"
        page.goto("http://localhost:8765/food-balance.html",wait_until="load")
        page.wait_for_function("!document.querySelector('#fbs-run').disabled")
        assert not errors,errors
        overflow=page.evaluate("""() => ({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll("main *")].filter(e=>!e.closest(".table-scroll")&&e.getBoundingClientRect().right>document.documentElement.clientWidth+3).slice(0,20).map(e=>[e.tagName,e.id,e.className?.baseVal||e.className,Math.round(e.getBoundingClientRect().right)])})""")
        assert overflow["scroll"]<=overflow["width"]+3,overflow
        page.close()
        print("Global worker/browser regression passed:",width,flush=True)
    browser.close()
