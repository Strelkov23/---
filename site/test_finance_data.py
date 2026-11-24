import unittest
import finance_data as f
class FinanceTests(unittest.TestCase):
    def test_sign_and_totals(self):
        r=f.records();self.assertEqual(len(r),61*3*2)
        a={(x["code"],x["year"],x["metric"]):x for x in r}
        self.assertEqual(a["total",2025,"sales"]["value"],10.9)
        self.assertEqual(a["05",2025,"sales"]["sign"],"negative_unspecified")
        self.assertIsNone(a["05",2025,"sales"]["value"])
        self.assertEqual(a["51",2023,"sales"]["value"],0)
        self.assertEqual(a["29",2025,"sales"]["value"],2.9)
        self.assertEqual(a["C",2024,"assets"]["value"],7.7)
