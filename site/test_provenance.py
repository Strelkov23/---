import unittest,tempfile,json
from pathlib import Path
import provenance as p
class ProvenanceTests(unittest.TestCase):
    def test_hash_and_tamper(self):
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)
            for name in ("data-registry.json","method-passports.json","compare.json","capital-data.json","forecast.json","price-data.json","sectors.json","quality.json"):
                (out/name).write_text("{}")
            (out/"regional-data").mkdir()
            (out/"regional-data"/"row.json").write_text('{"value":1}')
            (out/"federal-budget.csv").write_text("year,value\n2025,1\n")
            m=p.create(out,"2026-11-24")
            self.assertIn("federal-budget.csv",m["files"])
            self.assertNotIn("quality.json",m["files"])
            self.assertIn("regional-data/row.json",m["files"])
            p.validate(out,m)
            (out/"regional-data"/"row.json").write_text('{"value":2}')
            with self.assertRaises(ValueError):p.validate(out,m)
    def test_stable_order(self):
        a={"a.json":{"sha256":"a"*64,"bytes":1},"b.json":{"sha256":"b"*64,"bytes":2}}
        self.assertEqual(p.fingerprint(a),p.fingerprint(dict(reversed(list(a.items())))))
