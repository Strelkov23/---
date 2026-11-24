import json
import tempfile
import unittest
from pathlib import Path
import quality_gate as q

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
        }
        for name,value in self.data.items():self.put(name,value)
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
    def test_missing(self):
        (self.out/"cbr.json").unlink()
        self.assertTrue(self.report()["errors"])
if __name__=="__main__":unittest.main()
