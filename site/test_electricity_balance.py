import unittest,sqlite3
from unittest.mock import patch
import electricity_balance as e

def sample():
    return ("iso_code,year,"+",".join(e.ALL_METRICS)+"\n"+"\n".join(f"RUS,{y},100,-10,90,50,60,70" for y in range(2019,2024))+"\nUSA,2020,300,0,300,0,0,0\n").encode()

class ElectricityTests(unittest.TestCase):
    def test_parse(self):
        rows=e.parse(sample(),2026)
        self.assertEqual(len(rows),5)
        self.assertEqual(rows[0]["values"][e.N],-10)
        with self.assertRaises(ValueError):e.parse(sample()+b"RUS,2020,100,-10,90,50,60,70\n",2026)
        with self.assertRaises(ValueError):e.parse(sample().replace(b"100,-10,90",b"-100,-10,90"),2026)
    def test_cache(self):
        with sqlite3.connect(":memory:") as db:
            self.assertFalse(e.sync(db,"2026-11-24T00:00:00+00:00",False)["rows"])
            with patch("electricity_balance.fetch",return_value=(e.parse(sample(),2026),"a"*64)):
                self.assertEqual(len(e.sync(db,"2026-11-24T00:00:00+00:00",True)["rows"]),5)
            with patch("electricity_balance.fetch",side_effect=OSError("offline")):
                d=e.sync(db,"2026-12-08T00:00:00+00:00",True)
                self.assertEqual(len(d["rows"]),5)
                self.assertIn("Ошибка",d["status"])

    def test_fuel_coverage(self):
        rows=e.parse(sample(),2026)
        self.assertEqual(rows[0]["values"]["coal_production_twh"],50)
        with self.assertRaises(ValueError):e.parse(sample().replace(b",50,60,70",b",50,60,"),2026)
