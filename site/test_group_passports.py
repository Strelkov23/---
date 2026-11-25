import unittest,json,copy
from pathlib import Path
import group_passports as g
class Groups(unittest.TestCase):
    def test_snapshot(self):
        d=json.loads(Path(g.__file__).with_name(g.FILE).read_text())
        self.assertEqual(g.quality(d),{"group_passports":13,"group_observations":293})
        for key,val in [("scope","legal_entity"),("standard","RAS"),("source","https://example.org/")]:
            bad=copy.deepcopy(d);bad["groups"][0][key]=val
            with self.assertRaises(ValueError):g.quality(bad)
        bad=copy.deepcopy(d);bad["groups"][0]["metrics"][0]["observations"].append(bad["groups"][0]["metrics"][0]["observations"][0])
        with self.assertRaises(ValueError):g.quality(bad)
        bad=copy.deepcopy(d);bad["groups"][1]["metrics"][0]["comparable"]="annual_consolidated_revenue_rub"
        with self.assertRaises(ValueError):g.quality(bad)
        bad=copy.deepcopy(d);grou=next(g for g in bad["groups"] if g["id"]=="rushydro")
        next(m for m in grou["metrics"] if m["id"]=="assets")["observations"][0]["value"]="1"
        with self.assertRaises(ValueError):g.quality(bad)

    def test_disclosure_basis(self):
        d=json.loads(Path(g.__file__).with_name(g.FILE).read_text())
        bad=copy.deepcopy(d);nlmk=next(x for x in bad["groups"] if x["id"]=="nlmk");nlmk["note"]=""
        with self.assertRaises(ValueError):g.quality(bad)
        bad=copy.deepcopy(d);nlmk=next(x for x in bad["groups"] if x["id"]=="nlmk");nlmk["metrics"][0]["comparable"]="annual_consolidated_revenue_rub"
        with self.assertRaises(ValueError):g.quality(bad)

    def test_transneft_exclusion(self):
        d=json.loads(Path(g.__file__).with_name(g.FILE).read_text())
        tr=next(x for x in d["groups"] if x["id"]=="transneft")
        self.assertEqual(tr["standard"],"IFRS_based_disclosure")
        self.assertFalse(any(m.get("comparable") for m in tr["metrics"]))

    def test_metric_sources(self):
        d=json.loads(Path(g.__file__).with_name(g.FILE).read_text())
        x5=next(x for x in d["groups"] if x["id"]=="x5")
        self.assertEqual(len([m for m in x5["metrics"] if m.get("source")]),2)
        bad=copy.deepcopy(d);x=next(x for x in bad["groups"] if x["id"]=="x5")
        next(m for m in x["metrics"] if m.get("source"))["source"]="https://example.org/"
        with self.assertRaises(ValueError):g.quality(bad)
