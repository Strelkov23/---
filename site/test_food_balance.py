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

    def test_parse(self):
        import io,csv,zipfile
        def make(field,duplicate=False):
            text=io.StringIO()
            writer=csv.writer(text)
            writer.writerow(["Area",field,"Element Code","Year","Unit","Value","Flag","Note"])
            for code in f.ITEMS:
                for year in range(2019,2024):
                    for elem in ("5511","5611","5911","5072","5301"):
                        row=["Russian Federation",("S"+code if field.endswith("(FBS)") else code),elem,year,"1000 t",100 if elem=="5511" or elem=="5301" else 0,"E","test"]
                        writer.writerow(row)
            if duplicate:writer.writerow(row)
            raw=io.BytesIO()
            with zipfile.ZipFile(raw,"w") as z:z.writestr("FoodBalanceSheets_E_All_Data_(Normalized).csv",text.getvalue())
            return raw.getvalue()
        for field in ("Item Code","Item Code (FBS)"):
            data=f.parse(make(field))
            self.assertEqual(len(data),35)
            self.assertEqual(data[0]["values"]["production"],100)
            self.assertEqual(data[0]["flags"]["production"],"E")
        with self.assertRaises(ValueError):f.parse(make("Item Code (FBS)",True))
