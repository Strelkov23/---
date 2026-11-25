import unittest,json,copy
from pathlib import Path
import group_passports as g
class Groups(unittest.TestCase):
    def test_snapshot(self):
        d=json.loads(Path(g.__file__).with_name(g.FILE).read_text())
        self.assertEqual(g.quality(d),{"group_passports":5,"group_observations":61})
        for key,val in [("scope","legal_entity"),("standard","RAS"),("source","https://example.org/")]:
            bad=copy.deepcopy(d);bad["groups"][0][key]=val
            with self.assertRaises(ValueError):g.quality(bad)
        bad=copy.deepcopy(d);bad["groups"][0]["metrics"][0]["observations"].append(bad["groups"][0]["metrics"][0]["observations"][0])
        with self.assertRaises(ValueError):g.quality(bad)
        bad=copy.deepcopy(d);bad["groups"][1]["metrics"][0]["comparable"]="annual_consolidated_revenue_rub"
        with self.assertRaises(ValueError):g.quality(bad)
