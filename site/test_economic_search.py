import unittest
from economic_search import *
class SearchTests(unittest.TestCase):
    def test_index(self):
        r=record("news","Инвестиции","https://example.org/a","Промышленность")
        d=compile_index([r,r],"2026-11-27")
        self.assertEqual(validate(d)["documents"],1)
        self.assertEqual(d["postings"]["инвестиц"],[[0,5]])
        self.assertEqual(tokens("инвестициях"),["инвестиц"])
    def test_unsafe(self):
        self.assertIsNone(record("news","X","javascript:alert(1)"))
        self.assertFalse(safe("https://a@b.org"))
        self.assertTrue(safe("data-registry.html?id=A%3AB"))
if __name__=="__main__":unittest.main()
