"""Exercise real IV controls against the offline archive."""
import os
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get("CHROME_BIN","/usr/bin/google-chrome"),args=["--no-sandbox","--disable-dev-shm-usage"])
    for width in (390,1440):
        page=browser.new_page(viewport={"width":width,"height":900})
        errors=[]
        page.on("pageerror",lambda e:errors.append(str(e)))
        page.goto("http://localhost:8765/index.html")
        page.wait_for_function("!document.getElementById('iv-workspace-tools').hidden")
        assert page.locator("#iv-workspace-grid article:visible").count()==5
        page.locator("#iv-workspace-query").fill("воспроизводимость")
        assert page.locator("#iv-workspace-grid article:visible").count()==1
        page.locator("#iv-workspace-query").fill("")
        page.locator("[data-pin='science']").click()
        assert page.locator("#iv-workspace-grid article").first.get_attribute("data-workspace")=="science"
        page.reload()
        page.wait_for_function("document.querySelector('#iv-workspace-grid article').dataset.workspace==='science'")
        page.locator("#iv-workspace-reset").click()
        assert page.locator("#iv-workspace-grid article").first.get_attribute("data-workspace")=="overview"
        assert page.locator("body").evaluate("e=>e.scrollWidth<=innerWidth+2"),width
        page.wait_for_function("document.querySelectorAll('#pulse-cards article').length===5")
        slider=page.locator("#pulse-year")
        maximum=int(slider.get_attribute("max"))
        minimum=int(slider.get_attribute("min"))
        assert maximum>minimum
        slider.fill(str(minimum))
        assert page.locator("#pulse-year-label").inner_text()==str(minimum)
        slider.fill(str(maximum))
        page.locator("#pulse-indicator").select_option("FP.CPI.TOTL.ZG")
        assert "Индекс" in page.locator("#pulse-meaning").inner_text() or "индекс" in page.locator("#pulse-meaning").inner_text()
        page.locator("#pulse-play").click()
        page.locator("#pulse-play").click()
        assert page.locator("#pulse-play").get_attribute("aria-pressed")=="false"
        page.wait_for_function("document.querySelectorAll('#iv-evidence-cards article').length===3")
        page.locator("#iv-evidence-month").fill("2024-05")
        page.locator("#iv-evidence-exact").check()
        assert "Точно за выбранный месяц:" in page.locator("#iv-evidence-status").inner_text()
        assert "предварительные" in page.locator("#iv-evidence-status").inner_text()
        page.locator("#iv-evidence-draft").check()
        page.locator("#iv-evidence-draft").uncheck()
        page.goto("http://localhost:8765/iv-lab.html")
        page.locator("#iv-output").fill("10")
        page.locator("#iv-productivity").fill("10")
        assert page.locator("#iv-results strong").first.inner_text()=="0%"
        page.locator("#iv-save").click()
        page.locator("#iv-output").fill("20")
        assert "Отличие" in page.locator("#iv-compare").inner_text()
        page.locator("#iv-mode").select_option("budget")
        assert "дефицит" in page.locator("#iv-explain").inner_text()
        page.locator("#policy-save").click()
        page.locator("#policy-investment").fill("20")
        assert "Разница" in page.locator("#policy-compare").inner_text()
        assert page.locator("#policy-rows tr").count()==5
        page.locator("#policy-horizon").fill("10")
        assert page.locator("#policy-rows tr").count()==10
        assert "общий горизонт (5 лет)" in page.locator("#policy-compare").inner_text()
        page.wait_for_function("!document.getElementById('allocation-budget').disabled")
        page.locator("#allocation-budget").fill("0")
        assert "0 млрд" in page.locator("#allocation-result strong").first.inner_text()
        assert page.locator("#allocation-rows tr").count()==19
        page.locator("#allocation-budget").fill("1000")
        assert "opt-budget=1000" in page.locator("#allocation-deep").get_attribute("href")
        page.wait_for_function("!document.getElementById('trajectory-run').disabled")
        page.locator("#trajectory-years").fill("2")
        page.locator("#trajectory-run").click()
        page.wait_for_function("document.querySelectorAll('#trajectory-rows tr').length===2",timeout=60000)
        assert "Оба решения" in page.locator("#trajectory-status").inner_text()
        page.locator("#trajectory-growth").fill("4")
        assert page.locator("#trajectory-export").is_disabled()
        page.locator("#trajectory-lab summary").filter(has_text="Дополнительные трудовые ограничения").click()
        page.locator("#trajectory-laborEnabled").check()
        page.locator("#trajectory-laborCap").fill("0")
        page.locator("#trajectory-run").click()
        page.wait_for_function("document.querySelectorAll('#trajectory-rows tr').length===2",timeout=60000)
        assert "лимит дополнительных человеко-лет: 0" in page.locator("#trajectory-status").inner_text()
        table_details=page.locator("#trajectory-lab details").filter(has=page.locator("#trajectory-rows"))
        if table_details.get_attribute("open") is None:
            table_details.locator("summary").click()
        assert page.locator("#trajectory-rows").is_visible()
        for row in page.locator("#trajectory-rows tr").all():
            for attr,col in (("data-labor-a",8),("data-labor-b",9)):
                raw=row.get_attribute(attr)
                shown=row.locator("td").nth(col).inner_text()
                assert raw is not None and abs(float(raw))<=1e-7,(attr,raw,shown,row.inner_text())
                assert shown.strip() in ("0","-0","−0"),(attr,raw,shown,row.inner_text())
        page.locator("#trajectory-laborEnabled").uncheck()
        assert page.locator("#trajectory-export").is_disabled()
        page.wait_for_function("!document.getElementById('iv-tech-group').disabled")
        assert page.locator("#iv-tech-rows tr").count()==19
        page.locator("#iv-tech-material").fill("20")
        assert "Баланс пересчитан" in page.locator("#iv-tech-status").inner_text()
        assert not page.locator("#iv-tech-csv").is_disabled()
        page.locator("#iv-tech-reset").click()
        page.locator("[data-lab=policy-lab]").click()
        assert page.locator("#policy-lab").is_visible()
        assert not page.locator("#allocation-lab").is_visible()
        assert page.locator("#policy-horizon").input_value()=="10"
        page.locator("[data-lab=allocation-lab]").click()
        assert page.locator("#allocation-lab").is_visible()
        assert page.locator("#allocation-budget").input_value()=="1000"
        page.locator("[data-lab=all]").click()
        assert page.locator("#policy-lab").is_visible()
        assert page.locator("#iv-technology-lab").is_visible()
        page.locator("#policy-stored-save").click()
        page.locator("#trajectory-stored-save").click()
        page.reload()
        page.wait_for_function("!document.getElementById('trajectory-stored-restore').disabled")
        page.locator("#policy-stored-restore").click()
        assert page.locator("#policy-horizon").input_value()=="10"
        assert page.locator("#policy-investment").input_value()=="20"
        page.locator("#trajectory-stored-restore").click()
        assert page.locator("#trajectory-growth").input_value()=="4"
        assert page.locator("#trajectory-export").is_disabled()
        page.locator("#policy-stored-delete").click()
        assert page.locator("#policy-stored-restore").is_disabled()
        page.locator("#trajectory-stored-delete").click()
        assert page.locator("#trajectory-stored-restore").is_disabled()
        for theme in ("light","dark"):
            page.locator("#theme-mode").select_option(theme)
            assert page.locator("body").evaluate("e=>e.scrollWidth<=innerWidth+2"),(width,theme,page.evaluate("() => [...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().right>innerWidth+2 && !e.closest('.table-scroll')).slice(0,12).map(e=>[e.tagName,e.id,e.className,e.getBoundingClientRect().right])"))
        page.goto("http://localhost:8765/independent-statistics.html")
        page.wait_for_function("!document.getElementById('iv-origin-category').disabled")
        assert page.locator("#iv-origin-rows tr").count()==10
        page.locator("#iv-origin-category").select_option("official")
        assert page.locator("#iv-origin-rows tr").count()==1
        assert "27" in page.locator("#iv-origin-rows").inner_text()
        page.locator("#iv-origin-category").select_option("")
        page.wait_for_function("!document.getElementById('iv-price-period').disabled")
        page.locator("#iv-price-period").select_option("2024-05")
        page.locator("#iv-price-share").fill("100")
        assert page.locator("#iv-price-custom").inner_text()=="1,53%"
        assert "округлённого" in page.locator("#iv-price-explain").inner_text()
        page.locator("#iv-price-basis").select_option("yoy")
        assert page.locator("#iv-price-custom").inner_text()=="8,55%"
        page.wait_for_function("!document.getElementById('physical-company').disabled")
        page.locator("#physical-metric").select_option("nickel")
        assert "198" in page.locator("#physical-value").inner_text()
        page.locator("#physical-year").fill("0")
        assert page.locator("#physical-index").inner_text()=="100"
        assert page.locator("#physical-yoy").inner_text()=="Нет данных"
        page.locator("#physical-company").select_option("rzd")
        assert "1" in page.locator("#physical-value").inner_text()
        assert "rspp.ru" in page.locator("#physical-source").get_attribute("href")
        page.locator("#physical-year").fill("0")
        assert "finolive.ru" in page.locator("#physical-source").get_attribute("href")
        page.locator("#physical-company").select_option("rosenergoatom")
        assert "218,35" in page.locator("#physical-value").inner_text()
        page.locator("#physical-company").select_option("novatek")
        assert "84,57" in page.locator("#physical-value").inner_text()
        assert page.locator("#physical-index-result").inner_text()=="Нет расчёта"
        assert page.locator("#physical-index-export").is_disabled()
        page.locator("#physical-index-verified").click()
        assert page.locator("#physical-index-weight-4").input_value()=="0"
        assert page.locator("#physical-index-export").is_enabled()
        page.locator("#physical-index-sensitivity-rows").locator("xpath=ancestor::details").locator("summary").click()
        assert page.locator("#physical-index-sensitivity-rows tr").count()==4
        page.locator("#physical-index-reset").click()
        page.locator("#physical-index-year").select_option("2024")
        assert page.locator("#physical-index-export").is_enabled()
        assert page.locator("#physical-index-sensitivity-rows tr").count()==5
        page.locator("#physical-index-year").select_option("2025")
        assert page.locator("#physical-index-export").is_disabled()
        page.locator("#physical-index-draft").check()
        page.locator("#physical-index-base").select_option("2023")
        page.locator("#physical-index-year").select_option("2023")
        assert page.locator("#physical-index-result").inner_text()=="100"
        page.locator("#physical-index-year").select_option("2020")
        assert page.locator("#physical-index-result").inner_text()=="Нет расчёта"
        page.wait_for_function("document.getElementById('energy-structure-status').textContent!=='Загрузка…'")
        if page.locator("#energy-structure-year").is_disabled():
            assert "Нет подтверждённого ряда" in page.locator("#energy-structure-status").inner_text()
            assert page.locator("#energy-structure-export").is_disabled()
        else:
            assert page.locator("#energy-structure-cards article").count()==7
            assert page.locator("#energy-structure-rows tr").count()==9
        page.locator("#iv-method-mode").select_option("industry")
        assert page.locator("#iv-method-result").inner_text()=="1%"
        page.locator("#iv-method-weight").fill("100")
        assert page.locator("#iv-method-result").inner_text()=="10%"
        page.locator("#iv-method-mode").select_option("reweight")
        assert page.locator("#iv-method-result").inner_text()=="3 п.п."
        assert "Структура 1: 1%; структура 2: 4%" in page.locator("#iv-method-detail").inner_text()
        page.locator("#iv-method-weightNew").fill("40")
        assert page.locator("#iv-method-result").inner_text()=="0 п.п."
        page.locator("#iv-method-mode").select_option("poverty")
        assert page.locator("#iv-method-result").inner_text()=="30%"
        page.goto("http://localhost:8765/iv-comparison.html")
        page.locator("#iv-audit-pair").select_option("labour")
        assert "Разные измерения" in page.locator("#iv-audit-verdict").inner_text()
        page.locator("#iv-audit-basis").select_option("yoy")
        page.locator("#iv-audit-threshold").fill("20")
        assert "Отмечено 0" in page.locator("#iv-audit-gap-status").inner_text()
        page.locator("#iv-power-period").select_option("2024-03")
        page.locator("#iv-power-wage").fill("10")
        assert page.locator("#iv-power-official").inner_text()=="2,12%"
        assert page.locator("#iv-power-panel").inner_text()=="-7,72%"
        assert page.locator("#iv-power-delta").inner_text()=="-9,84 п.п."
        assert "не оценка реальной зарплаты России" in page.locator("#iv-power-status").inner_text()
        with page.expect_download() as power:
            page.locator("#iv-power-export").click()
        with open(power.value.path(),encoding="utf-8-sig",newline="") as f:
            power_rows=list(csv.reader(f,delimiter=";"))
        assert len(power_rows)==2 and len(power_rows[0])==len(power_rows[1])
        assert power_rows[1][:3]==["2024-03","yoy","10"]
        page.locator("#iv-audit-basis").select_option("mom")
        assert page.locator("#iv-power-period").input_value()=="2024-03"
        assert page.locator("#iv-power-official").inner_text()=="9,57%"
        page.goto("http://localhost:8765/economic-map.html")
        page.wait_for_function("!document.getElementById('geo-time').disabled",timeout=45000)
        page.locator("#geo-scale").select_option("history")
        page.locator("#geo-time").fill("0")
        assert page.locator("#geo-time-label").inner_text()==page.locator("#geo-year").input_value()
        assert page.locator("#geo-scale").input_value()=="history"
        legend=page.locator("#geo-map .technical-map-intervals").inner_text()
        page.locator("#geo-time-next").click()
        assert page.locator("#geo-scale").input_value()=="history"
        assert page.locator("#geo-map .technical-map-intervals").inner_text()==legend
        assert page.locator("#geo-time-label").inner_text()==page.locator("#geo-year").input_value()
        page.locator("#geo-time").fill(page.locator("#geo-time").get_attribute("max"))
        page.locator("#geo-region").select_option(index=1)
        assert page.locator("#geo-insight").is_visible()
        page.locator("#geo-scale").select_option("difference")
        assert page.locator("#geo-diff-panel").is_visible()
        assert "Шкала изменения" in page.locator("#geo-map .technical-map-legend").inner_text()
        page.locator("#geo-diff-base").select_option(page.locator("#geo-year").input_value())
        assert "Сопоставлено" in page.locator("#geo-diff-status").inner_text()
        assert page.locator("#geo-diff-rows tr").count()>0
        assert page.locator("#geo-diff-dispersion article").count()==5
        assert "Одинаковая выборка" in page.locator("#geo-diff-dispersion-status").inner_text()
        assert not page.locator("#geo-diff-dispersion-export").is_disabled()
        assert "выбранный показатель" in page.locator("#geo-insight").inner_text()
        assert not errors,errors
        page.close()
    browser.close()
print("IV browser interaction checks passed")
