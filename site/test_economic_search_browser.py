"""Offline browser regression: real IndexedDB and provenance, deterministic mocked encoder."""
import hashlib
import io
import zipfile
import base64
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
    for name in ("economic-search.html", "economic-search.js", "provenance.js", "global-economic-assistant.js"):
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

    # Construct standards-shaped OOXML fixtures using Python's real ZIP implementation.
    def package(parts, compression=zipfile.ZIP_DEFLATED):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w", compression=compression) as z:
            for name, value in parts.items():
                z.writestr(name, value)
        return base64.b64encode(stream.getvalue()).decode("ascii")

    ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    pkg = "http://schemas.openxmlformats.org/package/2006/relationships"
    workbook = {
        "xl/workbook.xml": f'<workbook xmlns="{ns}" xmlns:r="{rel}"><sheets><sheet name="Первый" sheetId="1" r:id="rId1"/><sheet name="Второй" sheetId="2" r:id="rId2"/></sheets></workbook>',
        "xl/_rels/workbook.xml.rels": f'<Relationships xmlns="{pkg}"><Relationship Id="rId1" Type="{rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="{rel}/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
        "xl/sharedStrings.xml": f'<sst xmlns="{ns}"><si><t>Год</t></si><si><t>Выпуск</t></si></sst>',
        "xl/worksheets/sheet1.xml": f'<worksheet xmlns="{ns}"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>2024</v></c><c r="B2"><v>125</v></c></row><row r="4"><c r="A4"><v>2026</v></c><c r="B4"><f>1+2</f><v>3</v></c></row></sheetData></worksheet>',
        "xl/worksheets/sheet2.xml": f'<worksheet xmlns="{ns}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Индекс</t></is></c></row><row r="2"><c r="A2"><v>0.25</v></c></row></sheetData></worksheet>',
    }
    wordns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    docx = {"word/document.xml": f'<w:document xmlns:w="{wordns}"><w:body><w:p><w:r><w:t>Экономика</w:t></w:r></w:p><w:p><w:r><w:t>Данные</w:t></w:r><w:del><w:r><w:t>Удалено</w:t></w:r></w:del></w:p></w:body></w:document>'}
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
            page.locator("summary").filter(has_text="Паспорт охвата поисковика").click()
            page.locator("#es-coverage-refresh").click()
            expect(page.locator("#es-coverage")).to_contain_text("Всего записей: 3")
            expect(page.locator("#es-coverage")).to_contain_text("научных материалов: 2")
            expect(page.locator("#es-coverage")).to_contain_text("отчёт об обновлении источников недоступен")
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

            # Actual Chromium DOMParser and deflate-raw, using byte fixtures.
            page.add_script_tag(url=f"http://127.0.0.1:{server.server_port}/global-economic-assistant.js")
            parse = """async ({data, sheet, kind}) => {
                const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
                return kind==="docx"?await GlobalEconomicAssistant.parseLocalDocx(bytes.buffer):await GlobalEconomicAssistant.parseLocalXlsx(bytes.buffer,sheet);
            }"""
            for compression in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                data = package(workbook, compression)
                result = page.evaluate(parse, {"data":data, "sheet":1, "kind":"xlsx"})
                assert result == {"headers":["Год","Выпуск"],"rows":[["2024","125"],["",""],["2026","[формула не вычислена]"]]}, result
                result = page.evaluate(parse, {"data":data, "sheet":2, "kind":"xlsx"})
                assert result == {"headers":["Индекс"],"rows":[["0.25"]]}, result
                result = page.evaluate(parse, {"data":package(docx,compression), "sheet":1,"kind":"docx"})
                assert result == "Экономика\nДанные", result
            bad = dict(workbook)
            bad["xl/worksheets/sheet1.xml"] = workbook["xl/worksheets/sheet1.xml"].replace("</worksheet>",'<mergeCells><mergeCell ref="A1:B1"/></mergeCells></worksheet>')
            for invalid in [{"data":package(bad),"sheet":1,"kind":"xlsx"},{"data":package(workbook),"sheet":3,"kind":"xlsx"},{"data":package({"word/document.xml":"<!DOCTYPE x><x/>"}),"sheet":1,"kind":"docx"}]:
                rejected = page.evaluate("""async ({data,sheet,kind})=>{try{const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));if(kind==="docx")await GlobalEconomicAssistant.parseLocalDocx(bytes.buffer);else await GlobalEconomicAssistant.parseLocalXlsx(bytes.buffer,sheet);return false}catch{return true}}""",invalid)
                assert rejected, invalid["kind"]
            assert not errors, errors
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
print("Economic search offline browser regression passed")
