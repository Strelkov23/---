import unittest
import financial_state as f
class FinancialStateTests(unittest.TestCase):
    def test_balances(self):
        d=f.debt();self.assertEqual(len(d),2)
        self.assertEqual(d[0]["total"],276168.3)
        self.assertAlmostEqual(d[0]["overdue_payable_pct"],100*6584/130127)
        self.assertAlmostEqual(d[1]["payable_minus_receivable"],5927.9)
        self.assertEqual(len(f.results()),14)
        coal=next(x for x in f.results() if x["code"]=="05")
        self.assertEqual(coal["balance"],-178.6)
        self.assertIsNone(coal["published_yoy_index"])
        self.assertTrue(all(abs(x["rounding_difference"])<=.1 for x in f.results()))
