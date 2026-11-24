import unittest
import forecast as f
class ForecastTests(unittest.TestCase):
    def test_trend_and_seasonal(self):
        y=list(range(1,25))
        self.assertAlmostEqual(f.predict(y,3,"trend8",None),27)
        self.assertEqual(f.predict(y,1,"seasonal",None),13)
        self.assertEqual(f.predict(y,6,"seasonal",None),18)
        self.assertEqual(f.predict(y,3,"trend8",(0,25)),25)
    def test_gap_and_no_leakage(self):
        self.assertEqual(f.tail({2000:1,2002:2,2003:3}),[(2002,2),(2003,3)])
        values=[(2000+i,2*i+1) for i in range(30)]
        r=f.evaluate(values,3,False,None)
        self.assertEqual(r["selected"],"drift5")
        self.assertEqual(r["point"],65)
        self.assertEqual(r["holdout"][r["selected"]]["mae"],0)
        self.assertEqual(r["holdout"][r["selected"]]["n"],5)
        self.assertEqual(r["skill_vs_last_pct"],100)
        flat=f.evaluate([(2000+i,1) for i in range(30)],1,False,None)
        self.assertIsNone(flat["skill_vs_last_pct"])
        self.assertTrue(all(x["target"]<=r["selection_cutoff"] for rows in r["development_folds"].values() for x in rows))
        self.assertTrue(all(x["target"]>=r["holdout_start"] for rows in r["holdout_folds"].values() for x in rows))
        changed=values[:-3]+[(t,100000) for t,_ in values[-3:]]
        self.assertEqual(f.evaluate(changed,3,False,None)["selected"],r["selected"])
    def test_insufficient(self):
        self.assertIsNone(f.evaluate([(i,float(i)) for i in range(10)],1,False,None))
    def test_month(self):
        self.assertEqual(f.period_name(f.month_index("2026-12")+1,True),"2027-01")
