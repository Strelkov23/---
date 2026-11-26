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
        page.goto("http://localhost:8765/iv-lab.html")
        page.locator("#iv-output").fill("10")
        page.locator("#iv-productivity").fill("10")
        assert page.locator("#iv-results strong").first.inner_text()=="0%"
        page.locator("#iv-save").click()
        page.locator("#iv-output").fill("20")
        assert "Отличие" in page.locator("#iv-compare").inner_text()
        page.locator("#iv-mode").select_option("budget")
        assert "дефицит" in page.locator("#iv-explain").inner_text()
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
        page.wait_for_function("!document.getElementById('evidence-a').disabled")
        assert "Только содержательное" in page.locator("#evidence-verdict").inner_text()
        page.locator("#evidence-b").select_option("romir-mom")
        assert page.locator("#evidence-verdict").inner_text()=="Один показатель"
        page.locator("#evidence-b").select_option("hh-index")
        assert page.locator("#evidence-verdict").inner_text()=="Разные темы"
        page.wait_for_function("document.querySelectorAll('#evidence-coverage article strong').length===3")
        assert not errors,errors
        page.close()
    browser.close()
print("IV browser interaction checks passed")
