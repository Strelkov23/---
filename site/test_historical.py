import io,csv,zipfile,unittest
from pathlib import Path
import openpyxl
import historical
class HistoricalTests(unittest.TestCase):
    def test_minfin_annual(self):
        book=openpyxl.Workbook();s=book.active;s.title="год"
        s.append(["Приложение 3.1"]);s.append(["Краткая информация об исполнении федерального бюджета (млрд руб.)"])
        s.append([None,None,2020,2021,2022,2023,2024])
        s.append([1,"Доходы, всего",100,101,102,103,104])
        s.append([2,"Расходы, всего",110,111,112,113,114])
        s.append([3,"Дефицит (-)/Профицит (+)",-10,-10,-10,-10,-10])
        def blob():
            b=io.BytesIO();book.save(b);return b.getvalue()
        rows=historical.parse_minfin_annual(blob())
        self.assertEqual(len(rows),15)
        self.assertEqual(rows[2]["value"],-10)
        self.assertEqual(rows[0]["unit"],"млрд руб.")
        s["C6"]=-9
        with self.assertRaises(ValueError):historical.parse_minfin_annual(blob())
    def test_minfin_discovery(self):
        base="https://minfin.gov.ru/ru/statistics/fedbud/execute/"
        links=historical.discover('<a href="/common/Prilozhenie_3_dannye_109-111_—_god.xlsx">Год</a><a href="/common/Prilozhenie_3_dannye_109-111_—_mes.xlsx">Месяц</a>',base)
        self.assertEqual(len(historical.minfin_annual_candidates(links)),1)
        self.assertEqual(historical.year(2024.0),2024)
    def test_discovery(self):
        links=historical.discover('<a href="/storage/mediabank/test.xlsx">ВРП</a><a href="https://evil.example/data.xlsx">Bad</a>',"https://rosstat.gov.ru/statistics/accounts")
        self.assertEqual(len(links),1)
        self.assertEqual(links[0]["url"],"https://rosstat.gov.ru/storage/mediabank/test.xlsx")
    def test_retry_policy(self):
        self.assertEqual(historical.due_date("2026-11-24","2026-11-24","2026-11-24",7,2),"2026-12-01")
        self.assertEqual(historical.due_date("2026-11-24","2026-11-23","2026-11-24",7,2),"2026-11-26")
        self.assertEqual(historical.due_date(None,None,"2026-11-24"),"2026-11-24")
    def test_queue(self):
        import sqlite3
        with sqlite3.connect(":memory:") as db:
            db.execute("create table hist_sources(code text primary key,checked text,success text,status text,files text)")
            first=historical.choose_sections(db,"2026-11-24")
            self.assertEqual(len(first),3)
            for s in first:
                code="mirror_industry_activity_v2" if s=="industry" else "mirror_"+s
                db.execute("insert into hist_sources values(?,?,null,?,?)",(code,"2026-11-24","Ошибка","[]"))
            second=historical.choose_sections(db,"2026-11-24")
            self.assertFalse(set(first)&set(second))
    def test_budget_queue_fairness(self):
        import sqlite3
        with sqlite3.connect(":memory:") as db:
            db.execute("create table hist_sources(code text primary key,checked text,success text,status text,files text)")
            files=[dict(url=f"https://roskazna.gov.ru/report-{i}.xlsx",title=str(i),format="xlsx") for i in range(6)]
            stamp="2026-11-24"
            first=historical.choose_budget_files(db,files+[files[0]],stamp)
            self.assertEqual(len(first),3)
            self.assertEqual(len({f["url"] for f in first}),3)
            for f in first:
                historical.import_status(db,historical.budget_import_code(f["url"]),f["title"],f["url"],stamp,"Ошибка",False)
            second=historical.choose_budget_files(db,files,stamp)
            self.assertEqual(len(second),3)
            self.assertFalse({f["url"] for f in first}&{f["url"] for f in second})
            for f in second:
                historical.import_status(db,historical.budget_import_code(f["url"]),f["title"],f["url"],stamp,"OK",True,[f])
            self.assertEqual(historical.choose_budget_files(db,files,"2026-11-25"),[])
            self.assertEqual(historical.choose_budget_files(db,files,"2026-11-26"),first)
            self.assertEqual(historical.choose_budget_files(db,files,"2026-11-26",limit=1),first[:1])
    def test_import_fallback(self):
        from unittest.mock import patch
        spec=historical.SPECS[1]
        url="https://rosstat.gov.ru/storage/mediabank/current.xlsx"
        sources=[dict(files=[dict(url=url,title="Инвестиции в основной капитал",format="xlsx")])]
        calls=[]
        def fetch(u,limit):
            calls.append(u)
            if u!=url:raise ValueError("404")
            return b"workbook",""
        with patch.object(historical,"parse_xlsx",return_value=[{"value":10}]):
            rows,used,errors=historical.import_candidates(spec[0],spec[2],spec[3],spec[4],sources,fetch)
        self.assertEqual(used,url)
        self.assertEqual(len(calls),2)
        self.assertEqual(len(errors),1)
    def test_import_status_preserves_success(self):
        import sqlite3
        with sqlite3.connect(":memory:") as db:
            db.execute("create table hist_sources(code text primary key,checked text,success text,status text,files text)")
            f=dict(url="https://rosstat.gov.ru/a.xlsx",title="Таблица",format="xlsx")
            historical.import_status(db,"test","A",f["url"],"2026-11-23","ok",True,[f])
            r=historical.import_status(db,"test","A",f["url"],"2026-11-24","Ошибка",False)
            self.assertEqual(r["success"],"2026-11-23")
            self.assertEqual(r["files"],[f])
            self.assertEqual(r["checked"],"2026-11-24")
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
    def test_industrial_activity_selection(self):
        rows=[dict(indicator="A",title="Индексы промышленного производства: ОКВЭД2",unit="%"),dict(indicator="B",title="Индексы производства: производство текстильных изделий",unit="%"),dict(indicator="C",title="Объем отгруженных товаров: производство химических веществ",unit="млн руб.")]
        self.assertEqual({r["indicator"] for r in historical.select_mirror(rows,"industry")},{"A","B","C"})
    def test_specialized_sources(self):
        self.assertTrue(historical.mirror_url("farming").endswith("data_farming_102_v20260313.zip"))
        self.assertTrue(historical.mirror_url("manufacturing").endswith("data_industry_102_v20260313.zip"))
        rows=[dict(indicator="A",title="Индексы производства: производство текстильных изделий",unit="%"),dict(indicator="B",title="Производство химических веществ",unit="тонн")]
        self.assertEqual({r["indicator"] for r in historical.select_mirror(rows,"manufacturing")},{"A"})
    def test_new_sector_selection(self):
        rows=[dict(indicator="A",title="Оборот розничной торговли",unit="млн руб."),dict(indicator="B",title="Иной показатель",unit="человек")]
        self.assertEqual([r["indicator"] for r in historical.select_mirror(rows,"trade")],["A"])
        self.assertEqual(historical.select_mirror(rows,"transport"),[])
        self.assertEqual(historical.REGIONAL_ZIPS["agriculture"],"13")
        self.assertEqual(historical.REGIONAL_ZIPS["innovation"],"18")
    def test_observed_vrp_layout(self):
        b=openpyxl.Workbook()
        for i,header in enumerate(("Валовой региональный продукт по субъектам Российской Федерации в 2016-2024 гг.1)2)\n(в текущих  ценах; миллионов рублей)","Валовой региональный продукт на душу населения по субъектам Российской Федерации в 2016-2024 гг.1)2)\n(рублей)","Индексы физического объема валового регионального продукта в 2017-2024 гг.\n(в постоянных ценах; в процентах к предыдущему году)")):
            s=b.active if i==0 else b.create_sheet()
            s.append(["К содержанию"]);s.append([header]);s.append([None,"20223)","20233)","20244)"])
            for n in range(11):s.append(["Область "+str(n),100+n,110+n,120+n])
        f=io.BytesIO();b.save(f)
        rows=historical.parse_vrp(f.getvalue())
        self.assertEqual(len(rows),99)
        self.assertEqual({x["indicator"] for x in rows},{"GRP","GRP_PC","GRP_VOLUME"})
        self.assertEqual({x["year"] for x in rows},{2022,2023,2024})
        self.assertTrue(any("20244)" in x["note"] for x in rows))
        self.assertEqual({r["unit"] for r in rows if r["indicator"]=="GRP_PC"},{"руб."})
    def test_observed_csv_layout(self):
        f=io.BytesIO()
        with zipfile.ZipFile(f,"w") as z:z.writestr("data.csv","section;indicator_code;indicator_name;subsection;object_name;object_level;object_oktmo;object_okato;year;indicator_value;indicator_unit;comment;source;version_date\nФинансы;Y1;Доходы консолидированных бюджетов субъектов РФ;CD;Москва;Регион;45000000;45000000;2020;10.5;млн руб.;По данным ведомства;Регионы России 2024;v20260313\n")
        rows=historical.mirror_rows(f.getvalue(),"finance",selected=True)
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]["value"],10.5)
        self.assertEqual(rows[0]["region"],"Москва")
        self.assertIn("45000000",rows[0]["note"])
        self.assertIn("Регионы России 2024",rows[0]["note"])
    def test_budget_mixed_units(self):
        f=io.BytesIO()
        with zipfile.ZipFile(f,"w") as z:z.writestr("data.csv","indicator_code;indicator_name;object_name;object_level;year;indicator_value;indicator_unit\nB1;Доходы консолидированных бюджетов субъектов РФ;Российская Федерация;Страна;2020;100;Миллионов рублей; для значений в целом по России: млрд руб\n".replace("100;Миллионов рублей; для значений в целом по России: млрд руб","100;\"Миллионов рублей; для значений в целом по России: млрд руб\"")+"B1;Доходы консолидированных бюджетов субъектов РФ;Москва;Регион;2020;10;\"Миллионов рублей; для значений в целом по России: млрд руб\"\n")
        rows=historical.mirror_rows(f.getvalue(),"finance",selected=True)
        self.assertEqual({(r["region"],r["unit"],r["value"]) for r in rows},{("Российская Федерация","млрд руб.",100),("Москва","млн руб.",10)})
        self.assertEqual(len({r["indicator"] for r in rows}),2)
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
    def test_budget_strict_dates_units_and_duplicates(self):
        def blob(header,duplicates=()):
            b=openpyxl.Workbook();s=b.active
            s.append([header]);s.append(["Наименование","Исполнено"])
            s.append(["Доходы бюджета - всего",100])
            for x in duplicates:s.append(["Доходы бюджета - всего",x])
            s.append(["Расходы бюджета - всего",110])
            s.append(["Результат исполнения бюджета",-10])
            f=io.BytesIO();b.save(f);return f.getvalue()
        base="Отчет об исполнении федерального бюджета 0503117 на "
        self.assertEqual(len(historical.parse_budget(blob(base+"2025-01-01, рубли"),"0503117.xlsx")),3)
        self.assertEqual(historical.parse_budget(blob(base+"01.02.2025, рубли"),"0503117_01.01.2025.xlsx"),[])
        self.assertEqual(historical.parse_budget(blob(base+"01.01.2025, млн рублей"),"0503117.xlsx"),[])
        self.assertEqual(historical.parse_budget(blob(base+"01.01.2025, миллионах рублей"),"0503117.xlsx"),[])
        self.assertEqual(historical.parse_budget(blob(base+"01.01.2025, рубли",(120,100)),"0503117.xlsx"),[])
        self.assertEqual(historical.parse_budget(blob(base+"01.01.2025 и 01.02.2025, рубли"),"0503117.xlsx"),[])
    def test_emiss_catalogue_html_and_validation(self):
        import emiss_archive
        valid="https://storage.yandexcloud.net/example/61483.parquet"
        def get(url,limit):
            if "/api/" in url:raise ValueError("API unavailable")
            return ('<a href="'+valid+'">Data</a><a href="https://evil.example/61483.parquet">Bad</a><a href="https://storage.yandexcloud.net/example/12345.parquet">Wrong code</a><a href="https://user@storage.yandexcloud.net/example/61483.parquet">Credentials</a>').encode(),"utf-8"
        errors=[]
        urls=emiss_archive.resource_candidates("61483",get,errors)
        self.assertEqual(urls[0],valid)
        self.assertEqual(len(errors),1)
        self.assertTrue(all(emiss_archive.valid_resource("61483",u) for u in urls))
        self.assertIn("https://storage.yandexcloud.net/datalakeiepru-s3-storage-public/fedstatru/parquet/61483.parquet",urls)
    def test_emiss_reject_ambiguous_observations(self):
        import emiss_archive,gzip
        def parse(body):
            return emiss_archive.parse(gzip.compress(body.encode()),"61483",historical.numeric,historical.year)
        header="region;year;value;unit\n"
        row="Москва;2020;100;рубль\n"
        self.assertEqual(len(parse(header+row+row)),1)
        with self.assertRaises(ValueError):parse(header+row+"Москва;2020;101;рубль\n")
        with self.assertRaises(ValueError):parse("region;territory;year;value;unit\nМосква;Томск;2020;100;рубль\n")
        with self.assertRaises(ValueError):parse("region; year;year;value;unit\nМосква;2020;2020;100;рубль\n")
        with self.assertRaises(ValueError):parse(header+row+"Москва;2021;100;рубль;unexpected\n")
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
    def test_direct_files_and_emiss_fallback(self):
        import emiss_archive,gzip
        from unittest.mock import patch
        self.assertIn("VRP_s1998.xlsx",historical.candidates_for("GRP","grp","bad",[])[0]["url"])
        links=historical.discover('<a href="/storage/mediabank/VRP_s1998.xlsx"> XLSX</a>',"https://rosstat.gov.ru/statistics/accounts")
        self.assertEqual(links[0]["title"],"VRP_s1998.xlsx")
        self.assertTrue(historical.allowed("https://datalakeiepru-s3-storage-public.storage.yandexcloud.net/fedstatru/data/parquet/61483.parquet"))
        import pyarrow as pa, pyarrow.parquet as pq
        table=pa.table({"region":["Москва"],"year":[2020],"value":[100.0],"unit":["рубль"]})
        buf=io.BytesIO();pq.write_table(table,buf)
        def get(url,limit):
            if url.endswith(".parquet"):return buf.getvalue(),""
            raise ValueError("Unavailable")
        rows,url=emiss_archive.retrieve("61483",get,historical.numeric,historical.year)
        self.assertTrue(url.endswith(".parquet"))
        self.assertEqual(rows[0]["value"],100)
        self.assertEqual(rows[0]["sheet"],"61483.parquet")
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
