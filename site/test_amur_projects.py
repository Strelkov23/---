import io,tempfile,unittest
from pathlib import Path
from datetime import date
from unittest.mock import patch
import openpyxl
import amur_projects as a

def book(n=101,invalid=False):
    b=openpyxl.Workbook();s=b.active;s.title="Новая версия";s.append(["Реестр"]);s.append(a.HEADERS);s.append([]);s.append([]);s.append(list(range(1,14)))
    for i in range(1,n+1):
        s.append([i,"Проект "+str(i),"Есть инвестор","Орган","АПК","Реализуемый","СМР","ТОР","Муниципалитет","Место","2026-2028", "не число" if invalid else "уточняется" if i==2 else 0 if i==1 else 12.3,0])
    b.create_sheet("Справочник");f=io.BytesIO();b.save(f);return f.getvalue()
class AmurTests(unittest.TestCase):
    def test_discovery(self):
        raw=('<a href="'+a.BASELINE+'">Реестр</a>').encode()
        self.assertEqual(a.discover(raw,date(2026,11,25)),a.BASELINE)
        with self.assertRaises(ValueError):a.discover(raw,date(2026,9,30))
        with self.assertRaises(ValueError):a.release(a.BASELINE.replace("www.invest.amurobl.ru","example.com"))
    def test_parse(self):
        rows=a.parse(book(),a.BASELINE)
        self.assertEqual(len(rows),101);self.assertEqual(rows[0]["row"],6)
        self.assertEqual(rows[0]["cost_mln_rub"],"0")
        self.assertEqual(rows[1]["cost_state"],"source_marker")
        self.assertIsNone(rows[1]["cost_mln_rub"])
        self.assertEqual(rows[0]["jobs"],0)
        self.assertEqual(rows[0]["investor_availability"],"Есть инвестор")
    def test_invalid(self):
        with self.assertRaises(ValueError):a.parse(book(99),a.BASELINE)
        with self.assertRaises(ValueError):a.parse(book(invalid=True),a.BASELINE)
    def test_cache(self):
        with tempfile.TemporaryDirectory() as t:
            path=Path(t)
            with patch.object(a,"fetch",side_effect=[OSError("catalogue"),book()]):
                d=a.publish(lambda *args:None,path,path,"2026-11-25",True)
            self.assertEqual(a.quality(d)["amur_project_records"],101)
            with patch.object(a,"fetch",side_effect=OSError("timeout")):
                cached=a.publish(lambda *args:None,path,path,"2026-12-05",True)
            self.assertEqual(cached["status"],"cached");self.assertEqual(cached["rows"],d["rows"])
            with (path/"amur-projects.csv").open("a",encoding="utf-8") as f:f.write("bad\n")
            with self.assertRaises(ValueError):a.verify_csv(path/"amur-projects.csv",cached)
    def test_empty(self):
        with tempfile.TemporaryDirectory() as t:
            path=Path(t);d=a.publish(lambda *args:None,path,path,"2026-11-25",False)
            self.assertEqual(a.quality(d)["amur_project_records"],0)
if __name__=="__main__":unittest.main()
