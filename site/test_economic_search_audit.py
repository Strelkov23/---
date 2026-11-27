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
    def test_abstract_coverage(self):
        stamp="2026-11-27T15:00:00+00:00";license=economic_abstracts.LICENSE
        p={"doi":"10.1234/test","authors":"Example","licensed_abstract":{"license":license,"text":"Text"},"access":{"licenses":[{"url":license,"version":"vor","start":"2025-01-01"}]}}
        index={"docs":[{"kind":"paper","code":p["doi"],"abstract_license":license}]}
        self.assertEqual(abstract_coverage(index,[p],None,stamp)["indexed"],1)
        self.assertEqual(abstract_coverage(index,[p],index,stamp)["added"],0)
        self.assertEqual(abstract_coverage({"docs":[]},[p],index,stamp)["removed"],1)
        with self.assertRaises(ValueError):abstract_coverage(index,[],None,stamp)
if __name__=="__main__":unittest.main()
