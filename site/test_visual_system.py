"""Visual regression captures of actual built pages; not a substitute for human review."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path("../visual-system-artifacts")
out.mkdir(exist_ok=True)
routes=("index.html","analyst-cockpit.html","economic-map.html","diagnostics.html","scenario.html")
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get("CHROME_BIN","/usr/bin/google-chrome"),args=["--no-sandbox","--disable-dev-shm-usage"])
    for width in (390,768,1440):
        page=browser.new_page(viewport={"width":width,"height":900})
        for route in routes:
            page.goto("http://localhost:8765/"+route,wait_until="load")
            page.wait_for_function("document.documentElement.dataset.theme !== undefined")
            for theme in ("light","dark"):
                page.locator("#theme-mode").select_option(theme)
                assert page.locator("html").get_attribute("data-theme")==theme
                assert page.locator("body").evaluate("(e)=>e.scrollWidth<=innerWidth+2"),(route,width,theme)
                assert page.locator(".system-cockpit").is_visible()
                assert page.locator("h1").first.is_visible()
                # Test contrast of the shared header's brand link; actual chart colors are unchanged.
                contrast=page.locator(".site-brand a").evaluate("""e=>{const rgb=s=>s.match(/\\d+(?:\\.\\d+)?/g).slice(0,3).map(Number);const L=a=>a.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);const a=L(rgb(getComputedStyle(e).color)),b=L(rgb(getComputedStyle(e.closest('header')).backgroundColor));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)}""")
                assert contrast>=4.5,(route,width,theme,contrast)
                page.screenshot(path=str(out/f"{route[:-5]}-{width}-{theme}.png"),animations="disabled",timeout=30000)
            page.reload(wait_until="load")
            page.wait_for_function("document.documentElement.dataset.theme==='dark'")
            assert page.locator("#theme-mode").input_value()=="dark"
        page.close()
    browser.close()
print("Visual system: 30 captures, 3 widths, 2 themes, shared header contrast and persistence OK")
