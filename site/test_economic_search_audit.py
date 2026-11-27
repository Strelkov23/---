import unittest
from economic_search_audit import *
class AuditTests(unittest.TestCase):
    def test_identity_change(self):
        old=identities({"docs":[{"kind":"news","href":"a"},{"kind":"news","href":"b"}]})
        new=identities({"docs":[{"kind":"news","href":"a"},{"kind":"news","href":"c"}]})
        self.assertEqual(diff(new,old)["news"],{"total":2,"added":1,"removed":1})
    def test_duplicate(self):
        with self.assertRaises(ValueError):identities({"docs":[{"kind":"news","href":"a"},{"kind":"news","href":"a"}]})
    def test_categories(self):
        with self.assertRaises(ValueError):identities({"docs":[{"kind":"bad","href":"a"}]})
    def test_no_false_growth(self):
        current=identities({"docs":[{"kind":"news","href":"a","title":"changed"}]})
        old=identities({"docs":[{"kind":"news","href":"a","title":"old"}]})
        self.assertEqual(diff(current,old)["news"]["added"],0)
if __name__=="__main__":unittest.main()
