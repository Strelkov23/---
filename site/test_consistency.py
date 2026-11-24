import unittest
import consistency as c
class ConsistencyTests(unittest.TestCase):
    def test_rules(self):
        def s(v):return {"values":[{"period":"2025-01","value":v}]}
        n={"KEY_END":s(21),"RES_TOTAL":s(100),"RES_FX":s(65),"RES_GOLD":s(35),"RES_CURRENCY":s(50),"RES_SDR":s(10),"RES_IMF":s(5),"M0":s(10),"M1":s(20),"M2":s(19)}
        d=c.create(n,{"KEY":{"values":[{"date":"2025-01-30","value":21}]}},{},"2025-02-04")
        self.assertEqual(d["counts"],{"согласовано":4,"расхождение":1})
    def test_gap(self):
        n={"KEY_END":{"values":[{"period":"2025-01","value":21}]},"RES_TOTAL":{"values":[{"period":"2025-01","value":100}]}}
        d=c.create(n,{"KEY":{"values":[{"date":"2025-01-05","value":21}]}},{},"2025-02-04")
        self.assertEqual(d["counts"],{"нет данных":2})
    def test_sme(self):
        d=c.create({}, {},dict(rows=[{}],period="2025-01-10",national=dict(total=10,legal=4,individual=6,workers=20),regional_sum=dict(total=9,legal=4,individual=5,workers=20)),"2025-02-04")
        self.assertEqual(d["counts"],{"согласовано":2,"расхождение":2})

    def test_budget_editions_and_missing_years(self):
        budget={
            "MINFIN_REV":{"2022":[(100,"minfin")],"2023":[(120,"minfin-a"),(121,"minfin-b")],"2024":[(130,"minfin")],"2025":[(140,"minfin")]},
            "BUD_REV":{"2022":[(100.05,"treasury")],"2023":[(120,"treasury")]},
            "MINFIN_EXP":{"2022":[(110,"minfin")]},
            "BUD_EXP":{"2022":[(111,"treasury")]},
            "MINFIN_BAL":{"2022":[(-10,"minfin")]},
            "BUD_BAL":{"2022":[(-10,"treasury-a"),(-10,"treasury-b")]}
        }
        d=c.create({}, {}, {},"2025-11-25",budget)
        checks={(r["rule"],r["period"]):r for r in d["rows"]}
        self.assertEqual(d["counts"],{"согласовано":2,"расхождение":1,"нет данных":2})
        self.assertAlmostEqual(checks["budget_rev","2022"]["delta"],-.05)
        self.assertIn("несколько различающихся редакций",checks["budget_rev","2023"]["note"])
        self.assertIsNone(checks["budget_rev","2024"]["second"])
        self.assertNotIn(("budget_rev","2025"),checks)
        self.assertEqual(checks["budget_bal","2022"]["first"],-10)
    def test_budget_archive_units(self):
        import tempfile,json
        from pathlib import Path
        with tempfile.TemporaryDirectory() as folder:
            out=Path(folder);catalog=[]
            for code,unit,value in [("MINFIN_REV","млрд руб.",100),("BUD_REV","руб.",100_000_000_000)]:
                name=code+".json";url="https://example.org/"+code
                (out/name).write_text(json.dumps(dict(unit=unit,source=url,values=[dict(region="Российская Федерация",year=2024,value=value),dict(region="Москва",year=2024,value=7)])),encoding="utf-8")
                catalog.append(dict(code=code+"_test",file=name,unit=unit,source=url))
            (out/"historical.json").write_text(json.dumps(dict(series=catalog)),encoding="utf-8")
            b=c.budget_observations(out)
            self.assertEqual(b["BUD_REV"]["2024"][0][0],100)
            self.assertEqual(len(b["BUD_REV"]["2024"]),1)
            self.assertEqual(c.create({}, {}, {},"2025-01-01",b)["counts"],{"согласовано":1})
            catalog[1]["unit"]="млн руб."
            (out/"historical.json").write_text(json.dumps(dict(series=catalog)),encoding="utf-8")
            with self.assertRaises(ValueError):c.budget_observations(out)
