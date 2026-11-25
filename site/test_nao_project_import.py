import unittest
from unittest.mock import patch
import nao_project_import as p
class Import(unittest.TestCase):
    def test_units(self):
        self.assertEqual(p.amount(12345),"12.345")
        self.assertEqual(p.amount(0),"0")
        self.assertIsNone(p.amount("1000"))
        self.assertIsNone(p.amount("нет данных"))
        with self.assertRaises(ValueError):p.amount(-1)
        with self.assertRaises(ValueError):p.amount(float("inf"))
    def test_exact_edition(self):
        with self.assertRaises(ValueError):p.parse(b"not the workbook","completed")
    def test_no_followup_after_denial(self):
        from urllib.error import HTTPError
        calls=[]
        def fetch(url,**kwargs):
            calls.append(url);raise HTTPError(url,403,"Forbidden",{},None)
        with self.assertRaises(HTTPError):p.fetch_all(fetch)
        self.assertEqual(len(calls),1)

    def test_source_numbers_repeat_only_across_sections(self):
        import io,hashlib
        from openpyxl import Workbook
        from unittest.mock import patch
        wb=Workbook();s=wb.active;s.title="Лист1"
        for col,value in enumerate([None]+p.COMMON+[p.GROUPS["implementation"][4],"Поддержка","Стадия реализации проекта"],1):s.cell(5,col,value)
        s.cell(6,2,"Раздел 1");s.cell(16,2,"Раздел 2")
        for row in (7,17):
            for col,value in enumerate([None,1,"Инициатор","Отрасль","Проект","Описание","2025","Место",1000,None,"Стадия"],1):s.cell(row,col,value)
        raw=io.BytesIO();wb.save(raw);data=raw.getvalue()
        with patch.dict(p.audit.HASHES,{"implementation":hashlib.sha256(data).hexdigest()}),patch.dict(p.GROUPS,{"implementation":("Реализуемые","2025-06-04",2,2,p.GROUPS["implementation"][4])}):
            rows=p.parse(data,"implementation")
            self.assertEqual([r["source_number"] for r in rows],[1,1])
            self.assertEqual([r["section_row"] for r in rows],[6,16])
            self.assertEqual([r["record"] for r in rows],["implementation:7","implementation:17"])
