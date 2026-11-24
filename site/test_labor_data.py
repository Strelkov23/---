import unittest
import labor_data as l

class LaborDataTests(unittest.TestCase):
    def test_broad_reciprocal_and_missing(self):
        c={};meta={}
        for _,_,p,e in l.SECTORS:
            c[p]={"values":{"2020":10000,"2021":20000,"2023":40000}}
            c[e]={"values":{"2021":20,"2022":21}}
            meta[p]={"source":"https://data.worldbank.org/indicator/"+p}
            meta[e]={"source":"https://data.worldbank.org/indicator/"+e}
        rows=l.broad(c,meta)
        a=next(r for r in rows if r["sector"]=="agriculture" and r["year"]==2021)
        self.assertEqual(a["workers_per_million_usd2015_va"],50)
        self.assertEqual(a["productivity_change_pct"],100)
        self.assertEqual(a["employment_share_pct"],20)
        self.assertIsNone(next(r for r in rows if r["year"]==2022)["productivity_usd2015_per_worker"])
        self.assertIsNone(next(r for r in rows if r["year"]==2023)["productivity_change_pct"])
    def test_exact_region_join(self):
        def r(name,year,val):return dict(region=name,year=year,value=val,row=1)
        a={"unit":"млн руб.","source":"https://rosstat.gov.ru/a","values":[r("A",2021,1000),r("B",2021,100),r("C",2021,100),r("C",2021,200),r("D",2021,50)]}
        b={"unit":"Тысяч человек","source":"https://rosstat.gov.ru/b","values":[r("A",2021,2),r("B",2020,1),r("C",2021,1),r("D",2021,0)]}
        rows,c=l.regional(a,b)
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]["nominal_grp_rub_per_employed"],500000)
        self.assertEqual(c["ambiguous_grp"],1)
        self.assertEqual(c["exact_pairs"],2)
        with self.assertRaises(ValueError):l.regional(a,dict(b,unit="человек"))
