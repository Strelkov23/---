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
    def test_emiss_archive(self):
        import emiss_archive,gzip
        raw=gzip.compress(("region;year;value;unit;ОКВЭД2\nМосква;2020;100;рубль;Всего\nМосква;2020;30;рубль;Обработка\nМосква;2021;—;рубль;Всего\n").encode())
        r=emiss_archive.parse(raw,"61483",historical.numeric,historical.year)
        self.assertEqual(len(r),2)
        self.assertEqual(len({x["indicator"] for x in r}),2)
        self.assertEqual({x["value"] for x in r},{100,30})
        self.assertTrue(all("fedstat.ru/indicator/61483" in x["note"] for x in r))
        with self.assertRaises(ValueError):
            emiss_archive.parse(gzip.compress(b"unknown;foo\n1;2\n"),"61483",historical.numeric,historical.year)
    def test_seed(self):
        import regional_seed
        rows=list(regional_seed.rows())
        self.assertEqual(len(rows),52)
        self.assertEqual(len({(r["indicator"],r["region"],r["year"]) for r in rows}),52)
        self.assertEqual({r["unit"] for r in rows},{"млрд руб.","тыс. руб."})
        self.assertEqual({r["year"] for r in rows},{2023,2024})
    def test_offline_publish(self):
        import tempfile,sqlite3,json
        with tempfile.TemporaryDirectory() as folder, sqlite3.connect(":memory:") as db:
            out=Path(folder)
            historical.publish(db,"2026-11-24T00:00:00+00:00",out,False)
            catalog=json.loads((out/"historical.json").read_text())
            self.assertEqual(sum(s["count"] for s in catalog["series"]),52)
            self.assertEqual(len(catalog["series"]),2)
            historical.publish(db,"2026-11-25T00:00:00+00:00",out,False)
            self.assertEqual(db.execute("select count(*) from hist_values").fetchone()[0],52)
    def test_industry_bulletin(self):
        import industry
        body="Индекс промышленного производства составил: – в январе-июле 2026 г. по сравнению с январем-июлем 2025 г. – 100,1%; – в июле 2026 г. по сравнению с июлем 2025 г. – 100,4%, по сравнению с июнем 2026 г. – 101,4%. Индексы промышленного производства"
        self.assertEqual(industry.parse_months(body),{"2026-07":100.4})
if __name__=="__main__":unittest.main()
