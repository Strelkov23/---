import unittest,sqlite3,tempfile,json
from pathlib import Path
from unittest.mock import patch
import food_balance as f
def full():
    return [dict(code=c,title=title,year=y,values=dict(zip(f.CORE,(100,0,0,0,100))),flags=dict.fromkeys(f.CORE,"E"),notes={},source=f.SOURCE) for c,title in f.ITEMS.items() for y in range(2019,2024)]

class FoodTests(unittest.TestCase):
    def test_seed(self):
        self.assertEqual(len(f.seed()),11)
        for r in f.seed():
            v=r["values"]
            self.assertLessEqual(abs(v["production"]+v["imports"]-v["exports"]-v["stock_change"]-v["supply"]),3)
    def test_cache(self):
        with sqlite3.connect(":memory:") as db:
            self.assertEqual(f.sync(db,"2026-11-24T00:00:00+00:00",False)["mode"],"replica_seed")
            with patch("food_balance.fetch",return_value=(full(),"a"*64)):
                self.assertEqual(f.sync(db,"2026-11-24T00:00:00+00:00",True)["mode"],"official_archive")
            with patch("food_balance.fetch",side_effect=OSError("unavailable")):
                d=f.sync(db,"2026-12-09T00:00:00+00:00",True)
                self.assertEqual(d["mode"],"official_archive")
                self.assertEqual(d["archive_sha256"],"a"*64)
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

    def test_retry_and_regression(self):
        with sqlite3.connect(":memory:") as db:
            with patch("food_balance.fetch",return_value=(full(),"a"*64)):
                f.sync(db,"2026-11-24T00:00:00+00:00",True)
            with patch("food_balance.fetch",side_effect=OSError("unavailable")) as fetch:
                f.sync(db,"2026-11-25T00:00:00+00:00",True)
                fetch.assert_not_called()
                f.sync(db,"2026-12-08T00:00:00+00:00",True)
                fetch.assert_called_once()
            changed=full()
            changed[0]["values"]["food"]=10
            changed[0]["flags"]["food"]="E"
            with patch("food_balance.fetch",return_value=(changed,"b"*64)):
                f.sync(db,"2026-12-09T00:00:00+00:00",True)
            with patch("food_balance.fetch",return_value=(full(),"c"*64)):
                d=f.sync(db,"2026-12-23T00:00:00+00:00",True)
                self.assertEqual(d["archive_sha256"],"b"*64)
                self.assertIn("review required",d["status"])
                self.assertEqual(d["rows"][0]["values"]["food"],10)

    def test_coverage(self):
        rows=full()
        f.validate_coverage(rows)
        with self.assertRaisesRegex(ValueError,"five complete"):
            f.validate_coverage(rows[1:])
        with self.assertRaisesRegex(ValueError,"five complete"):
            rows[0]["values"].pop("supply")
            f.validate_coverage(rows)

    def test_quality(self):
        with tempfile.TemporaryDirectory() as tmp,sqlite3.connect(":memory:") as db:
            out=Path(tmp);d=f.sync(db,"2026-11-24T00:00:00+00:00",False)
            f.publish(lambda *args:None,out,d)
            counts,warnings=f.quality(d,out/"food-balance.csv",2026)
            self.assertEqual(counts["fbs_product_years"],11)
            self.assertEqual(counts["fbs_observations"],55)
            self.assertEqual(counts["fbs_resource_discrepancies"],0)
            self.assertTrue(warnings)
            path=out/"food-balance.csv"
            path.write_text(path.read_text(encoding="utf-8-sig").replace("117759","117760"),encoding="utf-8-sig")
            with self.assertRaisesRegex(ValueError,"JSON/CSV mismatch"):
                f.quality(d,path,2026)
