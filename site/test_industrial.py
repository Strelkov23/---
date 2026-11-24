import io,unittest,sqlite3,tempfile,json
from pathlib import Path
from unittest.mock import patch
import openpyxl
import industrial_data as d

def workbook(rows,title="1"):
    w=openpyxl.Workbook();s=w.active;s.title=title
    for r in rows:s.append(r)
    b=io.BytesIO();w.save(b);return b.getvalue()

class IndustrialTests(unittest.TestCase):
    def test_monthly(self):
        data=workbook([["К содержанию"],["Индексы производства по отдельным видам экономической деятельности по Российской Федерации1"],["(в % к соответствующему месяцу предыдущего года)"],["Наименование ОКВЭД2","Код ОКВЭД2","2020 год"]+[None]*11,[None,None]+d.MONTHS,["Обработка","C"]+[100]*11+["…"]])
        s=d.parse(data,"ind_baza_2023.xlsx")[0]
        self.assertEqual(s["kind"],"Индекс производства г/г")
        self.assertEqual(len(s["values"]),11)
        self.assertEqual(s["values"][-1]["period"],"2020-11")
    def test_shipments(self):
        raw=workbook([["К содержанию"],["Объем отгруженных товаров собственного производства (млн. рублей)"],[],["Наименование вида деятельности","Код ОКВЭД2","2023 год2","2024 год2","2025 год2"],["Уголь","05",10,20,30]])
        s=d.parse(raw,"otgruz_god_2025.xlsx")[0]
        self.assertEqual(s["unit"],"млн руб.")
        self.assertEqual(s["values"][-1]["value"],30)
    def test_physical(self):
        raw=workbook([["Производство продукции в натуральном выражении по полному кругу производителей в Российской Федерации за 2025 год"],[],[],[],[],["Наименование","Код","Произведено важнейших видов продукции (всего)"],[None,None,None]+[f"{i:02d}_{m}" for i,m in enumerate(d.MONTHS,1)],["A","B"],["Уголь","05.10.20.001.АГ"],["Тысяча тонн","169",500]+[40]*12])
        rows=d.parse(raw,"Proizvodstvo_god_2025.xlsx")
        self.assertEqual(len(rows),2)
        self.assertEqual(next(s for s in rows if s["frequency"]=="годовая")["values"][0]["value"],500)
        self.assertEqual(next(s for s in rows if s["frequency"]=="месячная")["values"][0]["value"],40)
    def test_aggregate_precedence(self):
        source=d.BASE+"ind_baza_2023.xlsx"
        data={"series":[{"kind":"Индекс производства г/г","code":"BCDE","source":source,"sheet":"2","values":[{"period":"2025-01","value":101.5,"row":6,"column":3,"seen":"2026-11-24"}]}],"sources":[{"url":source,"success":"2026-11-24"}]}
        legacy=[{"period":"2025-01","value":102.0,"url":"https://example.org/old"},{"period":"2019-12","value":99,"url":"https://example.org/old"}]
        rows=d.aggregate_months(data,legacy)
        self.assertEqual(len(rows),2)
        self.assertEqual(rows[1]["value"],101.5)
        self.assertEqual(rows[1]["verified"],"2026-11-24")
        self.assertEqual(rows[0],legacy[1])
        self.assertEqual(legacy[0]["value"],102.0)
        self.assertIsNone(d.aggregate_months({"series":[],"sources":[]},legacy))
    def test_persistence(self):
        raw=workbook([["К содержанию"],["Объем отгруженных товаров собственного производства (млн. рублей)"],[],["Наименование вида деятельности","Код ОКВЭД2","2023 год2","2024 год2","2025 год2"],["Уголь","05",10,20,30]])
        with tempfile.TemporaryDirectory() as folder,sqlite3.connect(":memory:") as db:
            out=Path(folder)
            with patch.dict(d.FILES,{"otgruz_god_2025.xlsx":d.FILES["otgruz_god_2025.xlsx"]},clear=True),patch("industrial_data.h.get",return_value=(raw,"")):
                d.publish(db,"2026-11-24",out,True)
                d.publish(db,"2026-11-25",out,True)
                self.assertEqual(db.execute("select count(*) from industrial_obs").fetchone()[0],3)
                self.assertEqual(len(json.loads((out/"industrial.json").read_text())["series"]),1)
if __name__=="__main__":unittest.main()
