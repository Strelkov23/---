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
        for theme in ("light","dark"):
            page.locator("#theme-mode").select_option(theme)
            assert page.locator("body").evaluate("e=>e.scrollWidth<=innerWidth+2"),(width,theme)
        page.goto("http://localhost:8765/independent-statistics.html")
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
        page.goto("http://localhost:8765/iv-comparison.html")
        page.locator("#iv-audit-pair").select_option("labour")
        assert "Разные измерения" in page.locator("#iv-audit-verdict").inner_text()
        page.locator("#iv-audit-basis").select_option("yoy")
        page.locator("#iv-audit-threshold").fill("20")
        assert "Отмечено 0" in page.locator("#iv-audit-gap-status").inner_text()
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
        assert "выбранный показатель" in page.locator("#geo-insight").inner_text()
        assert not errors,errors
        page.close()
    browser.close()
print("IV browser interaction checks passed")
