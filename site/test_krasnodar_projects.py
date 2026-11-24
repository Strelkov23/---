import io,tempfile,unittest
from pathlib import Path
from datetime import date
from unittest.mock import patch
import openpyxl
import krasnodar_projects as k
def html():
    return ('<a href="'+k.BASELINE+'">Перечень инвестиционных проектов, принятых на сопровождение № 70 (по состоянию на 01 августа 2026 года)</a>').encode()
def book(n=101):
    b=openpyxl.Workbook();s=b.active;s.append(["Перечень инвестиционных проектов, принятых на сопровождение"]);s.append(["№ п/п","Наименование инвестиционного проекта","Инвестор","МО","Отрасль"])
    for i in range(1,n+1):s.append([i,"Проект "+str(i),"ООО Пример","Район","АПК"])
    f=io.BytesIO();b.save(f);return f.getvalue()
class KrasnodarTests(unittest.TestCase):
    def test_discover(self):
        self.assertEqual(k.discover(html(),date(2026,11,25)),("2026-08-01",k.BASELINE))
        with self.assertRaises(ValueError):k.discover(html(),date(2026,7,31))
        with self.assertRaises(ValueError):k.discover(html().replace(b"new.investkuban.ru",b"example.com"),date(2026,11,25))
    def test_parse(self):
        rows=k.parse(book(),k.BASELINE,"2026-08-01")
        self.assertEqual(len(rows),101);self.assertEqual(rows[0]["row"],3)
        self.assertNotIn("cost",rows[0])
        with self.assertRaises(ValueError):k.parse(book(99),k.BASELINE,"2026-08-01")
    def test_cache(self):
        with tempfile.TemporaryDirectory() as t:
            p=Path(t)
            with patch.object(k,"fetch",side_effect=[html(),book()]):d=k.publish(lambda *x:None,p,p,"2026-11-25",True)
            self.assertEqual(k.quality(d)["krasnodar_supported_project_records"],101)
            with patch.object(k,"fetch",side_effect=OSError("network")):old=k.publish(lambda *x:None,p,p,"2026-12-05",True)
            self.assertEqual(old["status"],"cached");self.assertEqual(old["rows"],d["rows"])
            with (p/"krasnodar-projects.csv").open("a",encoding="utf-8") as f:f.write("bad\n")
            with self.assertRaises(ValueError):k.verify_csv(p/"krasnodar-projects.csv",old)
    def test_empty(self):
        with tempfile.TemporaryDirectory() as t:
            p=Path(t);d=k.publish(lambda *x:None,p,p,"2026-11-25",False)
            self.assertEqual(k.quality(d)["krasnodar_supported_project_records"],0)
if __name__=="__main__":unittest.main()
