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
            page.goto("http://localhost:8765/analyst-cockpit.html#economic-ai",wait_until="domcontentloaded")
            assert page.locator("#eai-question").input_value()=="сравнение регионов"
            page.close()
        browser.close()
if __name__=="__main__":main()
