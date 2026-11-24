import io,csv,zipfile,unittest
from pathlib import Path
import openpyxl
import historical
class HistoricalTests(unittest.TestCase):
    def test_discovery(self):
        links=historical.discover('<a href="/storage/mediabank/test.xlsx">ВРП</a><a href="https://evil.example/data.xlsx">Bad</a>',"https://rosstat.gov.ru/statistics/accounts")
        self.assertEqual(len(links),1)
        self.assertEqual(links[0]["url"],"https://rosstat.gov.ru/storage/mediabank/test.xlsx")
    def test_workbook(self):
        b=openpyxl.Workbook();s=b.active
        s.append(["Валовой региональный продукт в текущих основных ценах, млн руб."])
        s.append(["Территория",2019,2020,2021])
        for i in range(11):s.append(["Область "+str(i),100+i,None,120+i])
        f=io.BytesIO();b.save(f)
        spec=historical.SPECS[0]
        rows=historical.parse_xlsx(f.getvalue(),spec[0],spec[2],spec[3],spec[4])
        self.assertEqual(len(rows),22)
        self.assertEqual(rows[0]["unit"],"млн руб.")
        self.assertEqual(rows[0]["row"],3)
    def test_csv(self):
        f=io.BytesIO()
        with zipfile.ZipFile(f,"w") as z:z.writestr("data.csv","region;year;value;indicator;unit;comment\nМосква;2020;10,5;Тест;млн руб.;\nМосква;2021;—;Тест;млн руб.;\n")
        rows=historical.mirror_rows(f.getvalue(),"grp")
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]["value"],10.5)
    def test_budget(self):
        b=openpyxl.Workbook();s=b.active
        s.append(["Отчет об исполнении федерального бюджета 0503117 на 01.01.2025, рубли"])
        s.append(["Наименование","Исполнено"])
        s.append(["Доходы бюджета - всего",100])
        s.append(["Расходы бюджета - всего",110])
        s.append(["Результат исполнения бюджета",-10])
        f=io.BytesIO();b.save(f)
        rows=historical.parse_budget(f.getvalue(),"0503117.xlsx")
        self.assertEqual(len(rows),3)
        self.assertEqual(rows[0]["year"],2024)
        self.assertEqual(rows[-1]["value"],-10)
    def test_m2x(self):
        import national
        h='<table><tr><th>Дата</th><th>01.11.2026 трлн руб.</th><th>Темп прироста</th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th></tr><tr><td>Денежный агрегат М2Х (широкая денежная масса)</td><td>151,4</td><td>16</td><td>14,2</td><td>-0,1</td><td>0,1</td><td>7,8</td><td>7,9</td></tr></table>'
        self.assertEqual(national.parse_money(h)[("M2X","2026-11")],151.4)
if __name__=="__main__":unittest.main()
