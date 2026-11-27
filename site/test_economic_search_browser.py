"""Offline browser regression: real IndexedDB and provenance, deterministic mocked encoder."""
import hashlib
import json
import shutil
import tempfile
import threading
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

HERE = Path(__file__).resolve().parent
def sha(data):
    return hashlib.sha256(data).hexdigest()

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    for name in ("economic-search.html", "economic-search.js", "provenance.js"):
        shutil.copy(HERE / name, root / name)
    # The production shell provides load/root/pinned; reproduce that contract here.
    html = (root / "economic-search.html").read_text()
    (root / "economic-search.html").write_text(
        '<!doctype html><meta charset="utf-8"><script>'
        'const root="", pinned="", dynamicPages=new Set();'
        'async function load(file){const r=await fetch(file);if(!r.ok)throw Error();return r.json()}'
        '</script>' + html, encoding="utf-8")
    docs = [
        {"title":"Инвестиции", "kind":"paper", "date":"2026", "href":"https://example.org/a","source":"fixture","description":"A"},
        {"title":"Промышленность", "kind":"paper", "date":"2025", "href":"https://example.org/b","source":"fixture","description":"B"},
        {"title":"Банки", "kind":"series", "date":"2026", "href":"https://example.org/c","source":"fixture","description":"C"},
    ]
    data = json.dumps({"schema":1,"docs":docs,"postings":{"инвестиц":[[0,5]],"банк":[[2,5]]}},ensure_ascii=False).encode()
    name = "economic-search-index.json"
    (root / name).write_bytes(data)
    entry = {"sha256":sha(data),"bytes":len(data)}
    fingerprint = sha(f"{name}\t{entry['sha256']}\t{entry['bytes']}\n".encode())
    (root / "data-manifest.json").write_text(json.dumps({"schema":"1","files":{name:entry},"data_fingerprint":fingerprint}))
    server = ThreadingHTTPServer(("127.0.0.1",0),partial(SimpleHTTPRequestHandler,directory=tmp))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            errors = []
            page.on("pageerror",lambda e: errors.append(str(e)))
            page.route("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2",lambda route: route.fulfill(
                content_type="application/javascript",
                headers={"access-control-allow-origin":"*"},
                body="""export const env={};export async function pipeline(){return async input=>{
                    globalThis.fixtureEncodes=(globalThis.fixtureEncodes||0)+1;
                    const data=Array(384).fill(0);data[0]=1;return {dims:[1,384],data};
                }}"""))
            url=f"http://127.0.0.1:{server.server_port}/economic-search.html"
            page.goto(url)
            page.locator("#es-semantic-build-filtered").check()
            page.locator("#es-kind").select_option("paper")
            page.locator("#es-from").fill("2026")
            page.locator("#es-semantic-build").click()
            expect(page.locator("#es-semantic-build-status")).to_contain_text("подтверждены",timeout=20000)
            expect(page.locator("#es-semantic-build-status")).to_contain_text("1 из 1")
            assert page.evaluate("globalThis.fixtureEncodes")==1
            page.locator("#es-semantic-build-filtered").uncheck()
            page.locator("#es-kind").select_option("")
            page.locator("#es-from").fill("")
            page.locator("#es-semantic-build").click()
            expect(page.locator("#es-semantic-build-status")).to_contain_text("2 из 2",timeout=20000)
            expect(page.locator("#es-semantic-build-status")).to_contain_text("подтверждены")
            assert page.evaluate("globalThis.fixtureEncodes")==2
            page.reload()
            page.locator("#es-semantic-build").click()
            expect(page.locator("#es-semantic-build-status")).to_contain_text("подтверждены",timeout=20000)
            assert page.evaluate("globalThis.fixtureEncodes||0")==0
            page.locator("#es-query").fill("инвестиции")
            page.locator("#es-form button[type=submit]").click()
            expect(page.locator("#es-results article")).to_have_count(1)
            page.locator("#es-local-semantic").click()
            expect(page.locator("#es-local-results a")).to_have_count(2)
            page.locator("#es-kind").select_option("series")
            expect(page.locator("#es-local-semantic")).to_be_disabled()
            expect(page.locator("#es-semantic")).to_be_disabled()
            expect(page.locator("#es-local-results a")).to_have_count(0)
            expect(page.locator("#es-results article")).to_have_count(0)
            expect(page.locator("#es-status")).to_contain_text("Параметры изменены")
            page.locator("#es-semantic-clear").click()
            expect(page.locator("#es-semantic-status")).to_contain_text("очищен")
            expect(page.locator("#es-semantic-build-status")).to_have_text("")
            page.locator("#es-kind").select_option("")
            page.locator("#es-form button[type=submit]").click()
            expect(page.locator("#es-local-semantic")).to_be_enabled()
            page.locator("#es-local-semantic").click()
            expect(page.locator("#es-semantic-status")).to_contain_text("Нет актуальных")
            assert not errors, errors
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
print("Economic search offline browser regression passed")
