import unittest,json,copy
from pathlib import Path
import group_passports as g
class Groups(unittest.TestCase):
    def test_snapshot(self):
        d=json.loads(Path(g.__file__).with_name(g.FILE).read_text())
        self.assertEqual(g.quality(d),{"group_passports":18,"group_observations":518})
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

    def test_mmk_identities(self):
        d=json.loads(Path(g.__file__).with_name(g.FILE).read_text())
        mmk=next(x for x in d["groups"] if x["id"]=="mmk")
        self.assertEqual(len(mmk["metrics"]),24)
        for field in ("current_assets","noncurrent_liabilities","cost_of_sales","cash_fx"):
            bad=copy.deepcopy(d);group=next(x for x in bad["groups"] if x["id"]=="mmk")
            next(m for m in group["metrics"] if m["id"]==field)["observations"][0]["value"]="1"
            with self.subTest(field=field),self.assertRaises(ValueError):g.quality(bad)
        bad=copy.deepcopy(d);group=next(x for x in bad["groups"] if x["id"]=="mmk")
        next(m for m in group["metrics"] if m["id"]=="cash_fx")["observations"].pop()
        with self.assertRaises(ValueError):g.quality(bad)

    def test_currency_and_gri_disclosures(self):
        d=json.loads(Path(g.__file__).with_name(g.FILE).read_text())
        for ident,number in (("nornickel",23),("lenta",11)):
            group=next(x for x in d["groups"] if x["id"]==ident)
            self.assertEqual(group["standard"],"IFRS_based_disclosure")
            self.assertEqual(len(group["metrics"]),number)
            self.assertFalse(any(m.get("comparable") for m in group["metrics"]))
        bad=copy.deepcopy(d);nn=next(x for x in bad["groups"] if x["id"]=="nornickel")
        nn["standard"]="IFRS"
        next(m for m in nn["metrics"] if m["id"]=="revenue")["comparable"]="annual_consolidated_revenue_rub"
        with self.assertRaises(ValueError):g.quality(bad)

    def test_platform_disclosures(self):
        d=json.loads(Path(g.__file__).with_name(g.FILE).read_text())
        for ident,count in (("yandex",23),("ozon",26)):
            group=next(x for x in d["groups"] if x["id"]==ident)
            self.assertEqual(group["standard"],"IFRS_based_disclosure")
            self.assertEqual(len(group["metrics"]),count)
            self.assertFalse(any(m.get("comparable") for m in group["metrics"]))
        oz=next(x for x in d["groups"] if x["id"]=="ozon")
        values={m["id"]:{r["year"]:int(r["value"]) for r in m["observations"]} for m in oz["metrics"] if m["unit"]=="млн руб."}
        for year in (2024,2025):
            v=lambda k:values[k][year]
            self.assertEqual(v("revenue"),v("services_revenue")+v("goods_sales_revenue")+v("interest_revenue"))
            self.assertEqual(v("gross_profit"),v("revenue")+v("cost_of_sales"))
            self.assertEqual(v("cost_of_sales"),v("goods_cost")+v("marketplace_cost")+v("fintech_cost"))
            self.assertEqual(v("operating_expenses"),sum(v(k) for k in ("sales_marketing_expenses","technology_content_expenses","administrative_expenses","fintech_credit_losses")))
