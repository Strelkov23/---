import unittest,tempfile,sqlite3
from pathlib import Path
import independent_ember as E
def fixture():
    return ("Area,Year,Electricity source,Generation (TWh),Country code\n"+"".join(f"Russia,{y},Total generation,100,RUS\nRussia,{y},Nuclear,20,RUS\n" for y in range(2020,2025))).encode()
class Ember(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(len(E.parse(fixture(),2025)),5)
        self.assertEqual(E.parse(fixture(),2025)[0]["values"],{"total":100,"nuclear":20})
    def test_reject(self):
        for raw in [fixture().replace(b"Generation (TWh)",b"Generation (GWh)"),fixture().replace(b"RUS",b"USA"),fixture()+b"Russia,2020,Nuclear,21,RUS\n",fixture().replace(b",100,",b",-100,"),fixture()+b"Russia,2027,Total generation,100,RUS\n"]:
            with self.assertRaises(ValueError):E.parse(raw,2025)
    def test_cache(self):
        with tempfile.TemporaryDirectory() as d:
            db=sqlite3.connect(":memory:")
            a=E.publish(db,Path(d),"2026-11-01",False)
            self.assertEqual(a["rows"],[])
            a=E.publish(db,Path(d),"2026-11-01",True,lambda y:(E.parse(fixture(),y),"a"*64))
            self.assertEqual(len(a["rows"]),5)
            def fail(y):raise OSError("offline")
            b=E.publish(db,Path(d),"2026-11-20",True,fail)
            self.assertEqual(b["rows"],a["rows"])
            self.assertEqual(b["success"],a["success"])
            self.assertIn("offline",b["error"])
