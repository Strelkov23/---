"""Visual regression captures of actual built pages; not a substitute for human review."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path("../visual-system-artifacts")
out.mkdir(exist_ok=True)
routes=("index.html","analyst-cockpit.html","economic-map.html","diagnostics.html","scenario.html","regional-manufacturing.html","planning-centre.html")
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get("CHROME_BIN","/usr/bin/google-chrome"),args=["--no-sandbox","--disable-dev-shm-usage"])
    for width in (390,768,1440):
        page=browser.new_page(viewport={"width":width,"height":900})
        for route in routes:
            page.goto("http://localhost:8765/"+route,wait_until="load")
            page.wait_for_function("document.documentElement.dataset.theme !== undefined")
            if route=="economic-map.html":
                page.wait_for_function("document.querySelectorAll('#geo-map .technical-map-intervals > span').length>=2",timeout=45000)
            if route=="regional-manufacturing.html":
                page.wait_for_function("document.querySelectorAll('#rm-map .technical-map-intervals > span').length>=2",timeout=45000)
                page.wait_for_function("!!document.querySelector('#rm-map .map-viewport')")
                page.locator("#rm-map button[aria-label='Увеличить масштаб карты']").click()
                assert "150%" in page.locator("#rm-map .map-controls span").inner_text()
                page.locator("#rm-map button[aria-label='Сбросить масштаб карты']").click()
            if width==390:
                toggle=page.locator("#mobile-nav-toggle")
                nav=page.locator("#primary-navigation")
                assert toggle.is_visible() and not nav.is_visible()
                toggle.click()
                assert nav.is_visible() and toggle.get_attribute("aria-expanded")=="true"
                nav.locator("a").first.focus()
                page.keyboard.press("Escape")
                assert not nav.is_visible() and toggle.get_attribute("aria-expanded")=="false"
                assert toggle.evaluate("e=>document.activeElement===e")
            else:
                assert not page.locator("#mobile-nav-toggle").is_visible()
                assert page.locator("#primary-navigation").is_visible()
            for theme in ("light","dark"):
                page.locator("#theme-mode").select_option(theme)
                assert page.locator("html").get_attribute("data-theme")==theme
                assert page.locator("body").evaluate("(e)=>e.scrollWidth<=innerWidth+2"),(route,width,theme)
                assert page.locator(".system-cockpit").is_visible()
                assert page.locator("h1").first.is_visible()
                # Test contrast of the shared header's brand link; actual chart colors are unchanged.
                contrast=page.locator(".site-brand a").evaluate("""e=>{const rgb=s=>s.match(/\\d+(?:\\.\\d+)?/g).slice(0,3).map(Number);const L=a=>a.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);const a=L(rgb(getComputedStyle(e).color)),b=L(rgb(getComputedStyle(e.closest('header')).backgroundColor));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)}""")
                assert contrast>=4.5,(route,width,theme,contrast)
                if route=="planning-centre.html":
                    assert page.locator(".flow-stage a").count()==4
                if route in ("economic-map.html","regional-manufacturing.html"):
                    assert page.locator(".technical-map-legend").first.is_visible()
                    assert page.locator(".technical-map-legend").first.evaluate("(e)=>e.scrollWidth<=e.clientWidth+2")
                page.evaluate("window.scrollTo(0,0)")
                page.wait_for_function("window.scrollY===0")
                page.screenshot(path=str(out/f"{route[:-5]}-{width}-{theme}.png"),animations="disabled",timeout=30000)
                target={"economic-map.html":"#geo-map","regional-manufacturing.html":"#rm-map","diagnostics.html":"#diag-overview","planning-centre.html":".planning-flow","analyst-cockpit.html":"#analyst-cockpit"}.get(route)
                if target:
                    page.locator(target).screenshot(path=str(out/f"{route[:-5]}-detail-{width}-{theme}.png"),animations="disabled",timeout=30000)
            page.reload(wait_until="load")
            page.wait_for_function("document.documentElement.dataset.theme==='dark'")
            assert page.locator("#theme-mode").input_value()=="dark"
        page.close()
    # The production audit includes 320px, which the prior visual matrix missed.
    for route,control in (("scenario.html","#dyn-calibration-file"),("desk.html","#project-restore"),("prices.html","#price-hour-file")):
        page=browser.new_page(viewport={"width":320,"height":800})
        page.goto("http://localhost:8765/"+route,wait_until="load")
        page.wait_for_function("document.documentElement.dataset.theme !== undefined")
        for theme in ("light","dark"):
            page.locator("#theme-mode").select_option(theme)
            field=page.locator(control)
            assert field.count()==1 and field.get_attribute("type")=="file",(route,control)
            assert field.evaluate("e=>e.getBoundingClientRect().right<=innerWidth+2"),(route,control,theme)
            assert page.evaluate("document.documentElement.scrollWidth<=innerWidth+2"),(route,theme)
        page.close()
    page=browser.new_page(viewport={"width":390,"height":844})
    page.goto("http://localhost:8765/economic-map.html#geo-dashboard",wait_until="load")
    assert page.locator("#geo-dashboard").evaluate("e=>e.open")
    page.wait_for_function("document.querySelector('#gd-status').textContent.startsWith('Год:')",timeout=45000)
    page.goto("http://localhost:8765/economic-map.html",wait_until="load")
    assert not page.locator("#geo-dashboard").evaluate("e=>e.open")
    page.evaluate("location.hash='gd-signals'")
    assert page.locator("#geo-dashboard").evaluate("e=>e.open")
    page.wait_for_function("document.querySelectorAll('#gd-sig-table tbody tr').length>0",timeout=45000)
    page.close()
    browser.close()
print("Visual system: 72 captures, 3 widths, 2 themes, shared header contrast, persistence and 320px file inputs OK")
