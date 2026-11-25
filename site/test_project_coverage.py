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
            self.assertIn("project-search.js",p.render(d))
            self.assertIn("project-region=RU-BU",p.render(d))
            p.verify_breakdown_csv(path/"project-breakdown.csv",d)
            with (path/"project-breakdown.csv").open("a",encoding="utf-8") as f:f.write("bad\n")
            with self.assertRaises(ValueError):p.verify_breakdown_csv(path/"project-breakdown.csv",d)
            with (path/"project-coverage.csv").open("a",encoding="utf-8") as f:f.write("bad\n")
            with self.assertRaises(ValueError):p.verify_csv(path/"project-coverage.csv",d)

    def test_discovery_retains_verified_links(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t)
            samples={"RU-ROS":b'<a href="/docs/register.xlsx">Download</a><a href="https://example.org/fake.xlsx">Other</a>',"RU-PER":b'<a href="/docs/register.pdf">Register</a><a href="/docs/register.xlsx">Other format</a>',"RU-NEN":'<a href="/images/Ekonom/Reestr_1_01012025.xlsx">Скачать</a>'.encode("utf-8")}
            d=p.discover(root,root,"2026-11-25T04:00:00+00:00",True,lambda k:p.discovery_parse(k,samples[k]))
            self.assertEqual(p.discovery_quality(d)["project_discovery_candidates"],3)
            self.assertIn("Ростовская область",p.discovery_render(d))
            self.assertIn("Пермский край",p.discovery_render(d))
            def fail(k):raise OSError("offline")
            d=p.discover(root,root,"2026-12-02T04:00:00+00:00",True,fail)
            self.assertEqual(p.discovery_quality(d)["project_discovery_candidates"],3)
            self.assertEqual(d["rows"]["RU-ROS"]["status"],"unavailable")
            self.assertFalse(p.discovery_allowed("RU-PER","https://example.org/a.pdf"))
            self.assertFalse(p.discovery_allowed("RU-ROS","https://user@invest-don.com/a.xlsx"))
            with self.assertRaises(ValueError):p.discovery_parse("RU-ROS",b'<a href="https://example.org/a.xlsx">Bad</a>')
    def test_discovery_migration_retains_existing_status(self):
        import json
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as t:
            root=Path(t)
            old_specs={k:v for k,v in p.DISCOVERY.items() if k!="RU-NEN"}
            with patch.object(p,"DISCOVERY",old_specs):
                old=p.discover(root,root,"2026-11-25T04:00:00+00:00",True,lambda k:p.discovery_parse(k,b'<a href="/docs/sample.xlsx">Register</a>' if k=="RU-ROS" else b'<a href="/docs/sample.pdf">Register</a>'))
            d=p.discover(root,root,"2026-11-26T04:00:00+00:00",False)
            self.assertEqual(d["rows"]["RU-ROS"],old["rows"]["RU-ROS"])
            self.assertEqual(d["rows"]["RU-PER"],old["rows"]["RU-PER"])
            self.assertEqual(d["rows"]["RU-NEN"]["status"],"waiting")
    def test_nao_registers_separate_when_unavailable(self):
        import nao_project_public as np
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            for _,_,_,mod,_,_ in p.SPECS:mod.publish(lambda *a:None,root,root,"2026-11-26",False)
            np.publish(lambda *a:None,root,root,"2026-11-26",False)
            d=p.collect(root,"2026-11-26")
            self.assertEqual(len(d["nao_registers"]),3)
            self.assertEqual(p.quality(d,root)["project_registers_configured"],6)
            self.assertTrue(all(r["records"] is None for r in d["nao_registers"]))
            self.assertIn("Ненецкий автономный округ",p.render(d))
            d=p.publish(lambda *a:None,root,"2026-11-26")
            p.verify_csv(root/"project-coverage.csv",d)
            self.assertEqual(len(p.sources(d)),6)
            self.assertIn("RU-NEN:planned",(root/"project-coverage.csv").read_text(encoding="utf-8-sig"))
            for g in np.imp.GROUPS:
                self.assertIn('id="nao-'+g+'"',np.render(np.blank()))
                self.assertIn('href="nao-projects.html#nao-'+g+'"',p.render(d))
    def test_offline_discovery_accepts_date_without_network(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            def forbidden(key):self.fail("Offline discovery must not contact sources")
            d=p.discover(root,root,"2026-11-25",False,forbidden)
            self.assertEqual(p.discovery_quality(d)["project_discovery_success"],0)
            self.assertTrue(all(r["checked"] is None for r in d["rows"].values()))
            with self.assertRaises(ValueError):p.discover(root,root,"2026-11-25",True,forbidden)
if __name__=="__main__":unittest.main()
