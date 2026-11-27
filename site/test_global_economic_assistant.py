"""Browser smoke tests for the shared assistant on built canonical pages."""
import os
from playwright.sync_api import sync_playwright
def main():
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.environ.get("CHROME_BIN") or None,headless=True,args=["--no-sandbox","--disable-gpu"])
        for width in (1280,390):
            page=browser.new_page(viewport={"width":width,"height":844})
            for path in ("index.html","historical.html","papers.html","analyst-cockpit.html"):
                page.goto("http://localhost:8765/"+path,wait_until="domcontentloaded")
                page.locator("#gea-toggle").click()
                assert page.locator("#gea-panel").is_visible()
                assert page.locator("#gea-context").inner_text().startswith("Текущий раздел:")
                page.locator("#gea-question").fill("сравнение регионов")
                page.locator("#gea-search").click()
                page.wait_for_function("document.querySelector('#gea-status').textContent.includes('Поиск завершён')")
                assert page.locator("#gea-results").inner_text().find("Найдено:")>=0
                page.locator("#gea-close").click()
                assert not page.locator("#gea-panel").is_visible()
            page.goto("http://localhost:8765/scenario.html",wait_until="domcontentloaded")
            page.locator("#gea-toggle").click()
            page.locator("#gea-panel details summary").click()
            page.locator("#gea-include-context").check()
            page.locator("#gea-preview-context").click()
            assert "Целевой реальный рост ВВП" in page.locator("#gea-parameters").inner_text()
            page.goto("http://localhost:8765/analyst-cockpit.html#economic-ai",wait_until="domcontentloaded")
            page.wait_for_function("document.querySelector('#eai-question').value === 'сравнение регионов'")
            page.locator("#gea-toggle").click()
            page.locator("#gea-question").fill("динамика ВВП")
            page.locator("#gea-full").click()
            page.wait_for_function("document.querySelector('#eai-question').value === 'динамика ВВП'")
            page.goto("http://localhost:8765/economic-search.html",wait_until="domcontentloaded")
            page.locator("#es-query").fill("Сравнение показателей")
            page.locator("#es-kind").select_option("tool")
            page.locator("#es-form button[type=submit]").click()
            page.wait_for_function("document.querySelector('#es-status').textContent.includes('Найдено:')")
            assert page.locator("#es-results article h3 a").first.get_attribute("href").endswith("compare.html")
            page.reload(wait_until="domcontentloaded")
            page.wait_for_function("document.querySelector('#es-status').textContent.includes('Найдено:')")
            assert page.locator("#es-kind").input_value()=="tool"
            page.locator("#es-ask").click()
            assert page.locator("#gea-question").input_value()=="Сравнение показателей"
            page.locator("#gea-panel details").last.locator("summary").click()
            page.locator("#easc-command").fill("рост=4; горизонт=5; бюджет=25")
            page.locator("#easc-preview").click()
            page.wait_for_function("document.querySelector('#easc-status').textContent.includes('Предварительный расчёт готов')")
            assert "рост: 4" in page.locator("#easc-result").inner_text()
            page.locator("#easc-apply").click()
            page.wait_for_function("document.querySelector('#repro-growth')?.value === '4' && document.querySelector('#repro-budget')?.value === '25'")
            page.close()
        browser.close()
if __name__=="__main__":main()
