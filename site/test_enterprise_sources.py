import io,json,tempfile,unittest
from pathlib import Path
import openpyxl
import enterprise_sources as e
class SourceTests(unittest.TestCase):
    def test_discovery(self):
        html='<div>Количество организаций по данным государственной регистрации с 2017 г. <a href="/storage/a.xlsx">XLSX</a></div><div>Количество индивидуальных предпринимателей по данным государственной регистрации с 2017 г. <a href="/storage/b.xlsx">XLSX</a></div><a href="https://example.org/a.xlsx">Количество организаций по данным государственной регистрации с 2017</a>'
        self.assertEqual(e.candidates(html),{"organizations":["https://www.rosstat.gov.ru/storage/a.xlsx"],"entrepreneurs":["https://www.rosstat.gov.ru/storage/b.xlsx"]})
    def test_inspect_and_cache(self):
        b=openpyxl.Workbook();b.active.append(["Header",2024]);raw=io.BytesIO();b.save(raw)
        html='<a href="/storage/a.xlsx">Количество организаций по данным государственной регистрации с 2017</a><a href="/storage/b.xlsx">Количество индивидуальных предпринимателей по данным государственной регистрации с 2017</a>'
        def get(url,limit):return (html.encode(),"utf-8") if url==e.SOURCE else (raw.getvalue(),"utf-8")
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp);d=e.publish(path,path,"2026-11-25",True,get)
            self.assertEqual(e.quality(d)["enterprise_source_workbooks_checked"],2)
            self.assertEqual(d["rows"][0]["sheets"][0]["columns"],2)
            def fail(*args):raise ValueError("offline")
            next=e.publish(path,path,"2026-12-03",True,fail)
            self.assertEqual(next["rows"][0]["status"],"cached")
            self.assertEqual(next["rows"][0]["sha256"],d["rows"][0]["sha256"])
    def test_catalogue_fallback(self):
        html='<a href="/storage/a.xlsx">Количество организаций по данным государственной регистрации с 2017</a><a href="/storage/b.xlsx">Количество индивидуальных предпринимателей по данным государственной регистрации с 2017</a>'
        def get(url,limit):
            if url==e.SOURCE:raise ValueError("404")
            return html.encode(),"utf-8"
        found,attempts=e.discover_catalogs(get)
        self.assertEqual([a["status"] for a in attempts],["unavailable","ok"])
        self.assertEqual(found["organizations"],["https://rosstat.gov.ru/storage/a.xlsx"])
    def test_missing_is_not_success(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp);d=e.publish(path,path,"2026-11-25",False)
            self.assertEqual(e.quality(d)["enterprise_source_workbooks_checked"],0)
            self.assertIsNone(d["rows"][0]["url"])
