import json
import tempfile
import unittest
from pathlib import Path
import quality_gate as q
import consistency as cs
import food_balance as f
import electricity_balance as e
import facility_data as fd
import sme_regions as sr
import district_geo as dg
import sqlite3

class QualityTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.out=Path(self.tmp.name)/"public"
        self.prev=Path(self.tmp.name)/"prev"
        self.out.mkdir();self.prev.mkdir()
        self.data={
            "archive.json":[{"url":"https://example.org/a"}],
            "literature.json":{"articles":[{"doi":"10.1000/a"}]},
            "compare.json":{"X":{"values":{"2020":2}}},
            "catalog.json":{"X":{}},
            "stats.json":{"series":{},"values":[]},
            "industry.json":[{"period":"2026-01","value":99,"url":"https://example.org/a"}],
            "cbr.json":{"KEY":{"values":[]}},
            "sectors.json":{},
            "status.json":{"days":[],"failures":[]},
            "links.json":{},
            "national.json":{},
            "industrial.json":{"series":[],"sources":[]},
            "historical.json":{"series":[],"sources":[]},
            "sector-passports.json":{"profiles":[]},
            "regional-boundaries.json":{"status":"unavailable"},
            "stat-revisions.json":{"schema":1,"builds":[]},
            "freshness.json":{"schema":1,"built":"2026-11-24","rows":[{"id":"fixture","state":"waiting"}]},
        }
        for name,value in self.data.items():self.put(name,value)
        fd.publish(self.out,self.prev,"2026-11-24",False)
        sr.publish(self.out,self.prev,"2026-11-24",False)
        import enterprise_sources
        enterprise_sources.publish(self.out,self.prev,"2026-11-24",False)
        import amur_enterprises
        amur_enterprises.publish(self.out,self.prev,"2026-11-24",False)
        import bank_registry
        bank_registry.publish(self.out,self.prev,"2026-11-24",False)
        import company_sources
        company_sources.publish(self.out,self.prev,"2026-11-24",False)
        dg.publish(self.out,self.prev,"2026-11-24",False)
        self.put("rosstat-workbooks.json",{"schema":1,"catalogs":[],"files":[]})
        self.put("finance-workbooks.json",{"schema":1,"years":[]})
        import krasnodar_projects
        krasnodar_projects.publish(lambda *args:None,self.out,self.prev,"2026-11-24",False)
        import amur_projects
        amur_projects.publish(lambda *args:None,self.out,self.prev,"2026-11-24",False)
        import investment_projects
        investment_projects.publish(lambda *args:None,self.out,self.prev,"2026-11-24",False)
        import project_coverage
        project_coverage.publish(lambda *args:None,self.out,"2026-11-24")
        import frp_snapshot
        frp_snapshot.publish(lambda *args:None,self.out)
        import park_certificates
        park_certificates.publish(self.out,self.prev,"2026-11-24",False)
        import industrial_parks
        industrial_parks.publish(self.out,self.prev,"2026-11-24",False)
        import regional_manufacturing
        regional_manufacturing.publish(self.out,self.prev,"2026-11-24",False)
        import regional_industry_extra
        regional_industry_extra.publish(self.out,self.prev,"2026-11-24",False)
        import federal_budget
        federal_budget.publish(lambda *args:None,self.out,"2026-11-25")
        self.put("consistency.json",cs.create(self.data["national.json"],self.data["cbr.json"],json.loads((self.out/"sme-regions.json").read_text()),"2026-11-24",cs.budget_observations(self.out)))
        with sqlite3.connect(":memory:") as db:
            f.publish(lambda *args:None,self.out,f.sync(db,"2026-11-24T00:00:00+00:00",False))
            e.publish(self.out,e.sync(db,"2026-11-24T00:00:00+00:00",False))
    def put(self,name,value):
        (self.out/name).write_text(json.dumps(value),encoding="utf-8")
    def report(self):return q.check(self.out,self.prev,"2026-11-24")
    def test_valid(self):
        r=self.report()
        self.assertFalse(r["errors"])
        self.assertEqual(r["counts"]["indicators_with_data"],1)
        self.assertTrue(r["warnings"])
        self.assertEqual(len(r["files"]["archive.json"]["sha256"]),64)
    def test_regression(self):
        (self.prev/"archive.json").write_text('[{"url":"https://example.org/lost"}]')
        self.assertTrue(any("исчезло" in e for e in self.report()["errors"]))
    def test_bad_value(self):
        self.put("compare.json",{"X":{"values":{"2020":float("nan")}}})
        self.assertTrue(any("нечисловые" in e for e in self.report()["errors"]))
    def test_bad_link(self):
        (self.out/"index.html").write_text('<a href="missing.html">missing</a>')
        self.assertEqual(self.report()["counts"]["internal_link_errors"],1)
    def test_fbs_csv_mismatch(self):
        p=self.out/"food-balance.csv"
        p.write_text(p.read_text(encoding="utf-8-sig").replace("117759","117760"),encoding="utf-8-sig")
        self.assertTrue(any("JSON/CSV mismatch" in e for e in self.report()["errors"]))
    def test_energy_csv_mismatch(self):
        p=self.out/"electricity-balance.csv"
        with p.open("a",encoding="utf-8") as fh:fh.write("2024,"+e.G+",1,TWh,"+e.SOURCE+",abc\n")
        self.assertTrue(any("Energy JSON/CSV mismatch" in x for x in self.report()["errors"]))
    def test_facility_bad_metadata(self):
        data=json.loads((self.out/"facility-energy.json").read_text())
        data["release"]="unknown"
        self.put("facility-energy.json",data)
        self.assertTrue(any("Производственные площадки" in x for x in self.report()["errors"]))
    def test_historical_catalogue_metadata(self):
        (self.out/"regional-data").mkdir()
        meta=dict(title="Показатель",unit="руб.",kind="test",source="https://example.org/data.xlsx")
        rows=[dict(region="Москва",year=2024,value=100)]
        file="regional-data/TEST.json"
        self.put(file,dict(meta,values=rows))
        series=dict(meta,code="TEST",file=file,count=1,regions=1,first=2024,last=2024)
        self.put("historical.json",dict(series=[series],sources=[]))
        self.assertFalse(any("Исторический ряд" in x for x in self.report()["errors"]))
        self.put(file,dict(meta,unit="млн руб.",values=rows))
        self.assertTrue(any("Метаданные ряда" in x for x in self.report()["errors"]))
        self.put(file,dict(meta,values=rows))
        self.put("historical.json",dict(series=[dict(series,last=2025)],sources=[]))
        self.assertTrue(any("Охват ряда" in x for x in self.report()["errors"]))
    def test_federal_budget_csv_mismatch(self):
        p=self.out/"federal-budget.csv"
        with p.open("a",encoding="utf-8") as f:f.write("2025,fake\n")
        self.assertTrue(any("Документальный федеральный бюджет" in e for e in self.report()["errors"]))
    def test_amur_catalog_bad_metadata(self):
        d=json.loads((self.out/"amur-enterprises.json").read_text())
        self.put("amur-enterprises.json",dict(d,status="ok"))
        self.assertTrue(any("Амурский каталог" in x for x in self.report()["errors"]))
    def test_missing(self):
        (self.out/"cbr.json").unlink()
        self.assertTrue(self.report()["errors"])
if __name__=="__main__":unittest.main()
