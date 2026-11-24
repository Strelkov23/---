import unittest
import cost_structure as c
class CostStructureTests(unittest.TestCase):
    def test_observations(self):
        r=c.records()
        self.assertEqual(len(r),48)
        self.assertEqual(len({(x["code"],x["year"]) for x in r}),48)
        a=next(x for x in r if x["code"]=="C" and x["year"]==2024)
        self.assertEqual(a["materials"],75.2)
        self.assertEqual(a["labor"],9.6)
        self.assertEqual(a["sum_primary"],100)
        self.assertTrue(all(abs(x["rounding_difference"])<=.3 for x in r))
