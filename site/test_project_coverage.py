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
    def test_csv_and_render(self):
        with tempfile.TemporaryDirectory() as t:
            path=Path(t)
            for _,_,_,mod,_,_ in p.SPECS:mod.publish(lambda *a:None,path,path,"2026-11-25",False)
            d=p.publish(lambda *a:None,path,"2026-11-25")
            self.assertIn("Краснодарский край",p.render(d))
            with (path/"project-coverage.csv").open("a",encoding="utf-8") as f:f.write("bad\n")
            with self.assertRaises(ValueError):p.verify_csv(path/"project-coverage.csv",d)
if __name__=="__main__":unittest.main()
