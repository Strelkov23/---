import tempfile,unittest
from pathlib import Path
import project_coverage as p
class CoverageTests(unittest.TestCase):
    def test_unavailable_not_zero(self):
        with tempfile.TemporaryDirectory() as t:
            path=Path(t)
            for _,_,_,mod,_,_ in p.SPECS:mod.publish(lambda *a:None,path,path,"2026-11-25",False)
            d=p.publish(lambda *a:None,path,"2026-11-25")
            self.assertEqual(p.quality(d,path),{"project_registers_configured":3,"project_registers_available":0})
            self.assertTrue(all(r["records"] is None and r["cost_numeric"] is None for r in d["rows"]))
            d["rows"][0]["records"]=0
            with self.assertRaises(ValueError):p.quality(d,path)
    def test_breakdown_keeps_missing_and_source_categories(self):
        d=dict(edition="2026-10-01",source="https://example.com",sha256="a"*64,rows=[
            dict(status="А",location="Район"),
            dict(status="А",location=""),
            dict(status="а",location="Район"),
        ])
        groups=p.breakdown("RU-BU","Бурятия",d)
        self.assertEqual([(g["category"],g["records"]) for g in groups if g["dimension"]=="status"],[("А",2),("а",1)])
        missing=[g for g in groups if g["category_missing"]]
        self.assertEqual(len(missing),1)
        self.assertIsNone(missing[0]["category"])
        self.assertEqual(missing[0]["denominator"],3)
        for field,_ in p.DIMENSIONS["RU-BU"]:
            self.assertEqual(sum(g["records"] for g in groups if g["dimension"]==field),3)
        self.assertEqual(p.share(2,3),"2 из 3 (66,7 %)")
        self.assertEqual(p.share(0,3),"0 из 3 (0,0 %)")
        self.assertEqual(p.share(None,3),"—")
        self.assertEqual(p.share(0,0),"—")
        self.assertEqual(p.breakdown("RU-BU","Бурятия",dict(d,rows=[])),[])
    def test_csv_and_render(self):
        with tempfile.TemporaryDirectory() as t:
            path=Path(t)
            for _,_,_,mod,_,_ in p.SPECS:mod.publish(lambda *a:None,path,path,"2026-11-25",False)
            d=p.publish(lambda *a:None,path,"2026-11-25")
            self.assertIn("Краснодарский край",p.render(d))
            self.assertIn("project-breakdown.csv",p.render(d))
            p.verify_breakdown_csv(path/"project-breakdown.csv",d)
            with (path/"project-breakdown.csv").open("a",encoding="utf-8") as f:f.write("bad\n")
            with self.assertRaises(ValueError):p.verify_breakdown_csv(path/"project-breakdown.csv",d)
            with (path/"project-coverage.csv").open("a",encoding="utf-8") as f:f.write("bad\n")
            with self.assertRaises(ValueError):p.verify_csv(path/"project-coverage.csv",d)
if __name__=="__main__":unittest.main()
