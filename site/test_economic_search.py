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
    def test_content(self):
        r=record("paper","Заголовок","https://doi.org/10.1234/test","Автор")
        r.update(abstract_license=economic_abstracts.LICENSE,abstract_text=" ".join(["инвестиции"]*201+["промышленность"]))
        d=compile_index([r],"2026-11-27")
        self.assertEqual(d["abstract_postings"]["промышленность"],[[0,1]])
        self.assertNotIn("автор",d["abstract_postings"])
        self.assertNotIn("заголовок",d["abstract_postings"])
        self.assertNotIn("abstract_text",d["docs"][0])
        validate(d)
        self.assertEqual(d["abstract_count"],1)
        self.assertGreater(d["abstract_norms"][0],0)
        old=d["abstract_norms"][0];d["abstract_norms"][0]=0
        with self.assertRaises(ValueError):validate(d)
        d["abstract_norms"][0]=old
        d["abstract_postings"]["автор"]=[[0,2]]
        with self.assertRaises(ValueError):validate(d)
    def test_unlicensed(self):
        r=record("paper","Заголовок","https://doi.org/10.1234/test")
        r["abstract_text"]="Инвестиции"
        with self.assertRaises(ValueError):compile_index([r],"2026-11-27")
if __name__=="__main__":unittest.main()
