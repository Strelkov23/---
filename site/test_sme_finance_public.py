import unittest,copy
import sme_finance_public as p
class Public(unittest.TestCase):
    def test_balance(self):
        idx=dict(status="ready",year=2025,fingerprint="a",sources=[],count=2)
        m=dict(status="diagnostic",edition="2026-11-10",archive_sha256="b",reference_sha256="c",national_difference=5,quarantined=1)
        m["declared"]=m["reported"]=[{"region":"77","class":"01","count":2}]
        row=dict(region="77",**{"class":"01"},sme_total=2,matched=1,income_observations=1,income_sum="9007199254740993",expense_observations=0,expense_sum=None,workers_observations=1,workers_sum="0",paired_money=0,income_workers_pair=1)
        d=dict(schema=1,status="diagnostic",note=p.NOTE,financial_year=2025,financial_fingerprint="a",financial_sources=[],sme_edition=m["edition"],sme_archive_sha256="b",reference_sha256="c",national_difference=5,quarantined=1,eligible_regions=1,counts=dict(financial_index=2,matched_sme=1,not_in_sme=1,included=1),declared=[row],reported=[copy.deepcopy(row)])
        self.assertEqual(p.quality(d,idx,m),{"sme_finance_matched":1,"sme_finance_cells":2})
        with self.assertRaises(ValueError):p.quality(d,{**idx,"fingerprint":"bad"},m)
        d["profiles"]={"limit_per_metric":500,"rows":[{"inn":"7707083893","status":"matched","ogrn":"1027700132195","region":"77","declared":"01.11","dver":"2014","reported":None,"rver":None,"member":"part.xml","sha256":"d"*64,"accepted_ordinal":1}]}
        self.assertEqual(p.quality(d,idx,m)["sme_finance_matched"],1)
        bad=copy.deepcopy(d);bad["profiles"]["rows"][0]["region"]="99"
        with self.assertRaises(ValueError):p.quality(bad,idx,m)
        bad=copy.deepcopy(d);bad["profiles"]["rows"][0]["ogrn"]="0000000000001"
        with self.assertRaises(ValueError):p.quality(bad,idx,m)
        d["paired_sums_version"]=1
        for kind in ("declared","reported"):
            d[kind][0].update(paired_income_sum=None,paired_expense_sum=None,worker_pair_income_sum="9007199254740993",worker_pair_workers_sum="0")
        self.assertEqual(p.quality(d,idx,m)["sme_finance_matched"],1)
        bad=copy.deepcopy(d);bad["declared"][0]["worker_pair_workers_sum"]="1"
        with self.assertRaises(ValueError):p.quality(bad,idx,m)
        bad=copy.deepcopy(d);bad["declared"][0]["paired_income_sum"]="0"
        with self.assertRaises(ValueError):p.quality(bad,idx,m)
        d["reported"][0]["expense_sum"]="0"
        with self.assertRaises(ValueError):p.quality(d,idx,m)

    def test_prefer_compatible_schema(self):
        old=dict(status="diagnostic")
        paired=dict(old,paired_sums_version=1)
        profiles=dict(old,profiles={"rows":[]})
        both=dict(paired,profiles={"rows":[]})
        self.assertIs(p.prefer(p.empty(),old),old)
        self.assertIs(p.prefer(old,both),both)
        self.assertIs(p.prefer(both,old),both)
        self.assertIs(p.prefer(both,paired),both)
        self.assertIs(p.prefer(both,profiles),both)
        self.assertIs(p.prefer(paired,profiles),paired)
        self.assertIs(p.prefer(both,p.empty()),both)
        new=dict(both,edition="new")
        self.assertIs(p.prefer(both,new),new)
