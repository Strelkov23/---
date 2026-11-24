import unittest,sqlite3,tempfile
from pathlib import Path
from unittest.mock import patch
import wdi_metadata as w
class WdiTests(unittest.TestCase):
    def test_parse_and_pagination(self):
        def page(p):
            return [{"page":p,"pages":2},[{"id":"A" if p==1 else "B","source":{"id":"2"},"sourceNote":"Definition","sourceOrganization":"Provider"},{"id":"X","source":{"id":"1"}}]]
        self.assertEqual(set(w.collect({"A","B","X"},page)),{"A","B"})
        with self.assertRaises(ValueError):w.collect({"A"},lambda p:[{"page":p,"pages":2},[{"id":"A","source":{"id":"2"}}]])
    def test_cache_offline_and_failure(self):
        with tempfile.TemporaryDirectory() as tmp,sqlite3.connect(":memory:") as db:
            path=Path(tmp)
            with patch("wdi_metadata.collect",return_value={"A":{"sourceNote":"Original"}}) as get:
                x=w.sync(db,{"A"},"2026-11-01T00:00:00+00:00",True,path)
                self.assertEqual(x["rows"]["A"]["sourceNote"],"Original")
                w.sync(db,{"A"},"2026-11-02T00:00:00+00:00",True,path)
                self.assertEqual(get.call_count,1)
            with patch("wdi_metadata.collect",side_effect=ValueError("network")) as get:
                x=w.sync(db,{"A"},"2026-11-08T00:00:00+00:00",True,path)
                self.assertIn("Ошибка",x["status"])
                self.assertEqual(x["rows"]["A"]["seen"],"2026-11-01T00:00:00+00:00")
                w.sync(db,{"A"},"2026-11-09T00:00:00+00:00",False,path)
                self.assertEqual(get.call_count,1)
