import unittest,io
from urllib.error import HTTPError
from openpyxl import Workbook
import nao_project_schema as p
class SchemaTest(unittest.TestCase):
    def test_header(self):
        w=Workbook();s=w.active;s.append(["Наименование проекта","Объем инвестиций, млн руб.","Рабочих мест"]);s.append(["Пример",1,2]);b=io.BytesIO();w.save(b)
        r=p.inspect(b.getvalue())[0]
        self.assertEqual(r["rows"],2)
        self.assertEqual(len(r["header_candidates"]),1)
        self.assertEqual(len(r["header_candidates"][0]["fields"]),3)
    def test_denial(self):
        calls=[]
        def fetch(url,**kw):
            calls.append(url);raise HTTPError(url,403,"Forbidden",{},None)
        self.assertEqual([r["status"] for r in p.probe(fetch)["rows"]],["failed","skipped","skipped"])
        self.assertEqual(len(calls),1)
