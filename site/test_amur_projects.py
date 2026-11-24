import io,tempfile,unittest
from pathlib import Path
from datetime import date
from unittest.mock import patch
import openpyxl
import amur_projects as a

TEST_URL=a.BASELINE.replace("01.10.2026","01.11.2026")
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
        rows=a.parse(book(),TEST_URL)
        self.assertEqual(len(rows),101);self.assertEqual(rows[0]["row"],6)
        self.assertEqual(rows[0]["cost_mln_rub"],"0")
        self.assertEqual(rows[1]["cost_state"],"source_marker")
        self.assertIsNone(rows[1]["cost_mln_rub"])
        self.assertEqual(rows[0]["jobs"],0)
        self.assertEqual(rows[0]["investor_availability"],"Есть инвестор")
    def test_groups_and_markers(self):
        b=openpyxl.load_workbook(io.BytesIO(book()));ws=b.active
        for i in range(56,107):
            ws.cell(i,1,i-55);ws.cell(i,6,"Перспективный")
        ws.cell(56,13,3.61);ws.cell(57,13,"В проработке")
        f=io.BytesIO();b.save(f)
        rows=a.parse(f.getvalue(),TEST_URL)
        self.assertEqual(rows[50]["source_number"],1)
        self.assertEqual(rows[50]["record"],51)
        self.assertEqual(rows[50]["jobs_state"],"noninteger_source")
        self.assertIsNone(rows[50]["jobs"]);self.assertEqual(rows[51]["jobs_state"],"source_marker")
        with self.assertRaises(ValueError):a.parse(f.getvalue(),a.BASELINE)
    def test_invalid(self):
        with self.assertRaises(ValueError):a.parse(book(99),TEST_URL)
        with self.assertRaises(ValueError):a.parse(book(invalid=True),TEST_URL)
    def test_cache(self):
        with tempfile.TemporaryDirectory() as t:
            path=Path(t)
            with patch.object(a,"fetch",side_effect=[('<a href="'+TEST_URL+'">Реестр</a>').encode(),book()]):
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
