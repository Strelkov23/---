import unittest,sqlite3
from unittest.mock import patch
import food_balance as f
class FoodTests(unittest.TestCase):
    def test_seed(self):
        self.assertEqual(len(f.seed()),11)
        for r in f.seed():
            v=r["values"]
            self.assertLessEqual(abs(v["production"]+v["imports"]-v["exports"]-v["stock_change"]-v["supply"]),3)
    def test_cache(self):
        with sqlite3.connect(":memory:") as db:
            self.assertEqual(f.sync(db,"2026-11-24T00:00:00+00:00",False)["mode"],"replica_seed")
            with patch("food_balance.fetch",return_value=(f.seed(),"abc")):
                self.assertEqual(f.sync(db,"2026-11-24T00:00:00+00:00",True)["mode"],"official_archive")
            with patch("food_balance.fetch",side_effect=OSError("unavailable")):
                d=f.sync(db,"2026-12-09T00:00:00+00:00",True)
                self.assertEqual(d["mode"],"official_archive")
                self.assertEqual(d["archive_sha256"],"abc")
                self.assertIn("Ошибка",d["status"])
