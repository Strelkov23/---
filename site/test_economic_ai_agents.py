import unittest
from economic_ai_agents import *
class AgentTests(unittest.TestCase):
    def test_links(self):
        self.assertTrue(safe_url("https://example.org/a"))
        self.assertFalse(safe_url("javascript:alert(1)"))
        self.assertFalse(safe_url("https://a@b.org"))
    def test_new_documents(self):
        rows=[{"title":"old","url":"https://example.org/1","published":"2025-01-01"},{"title":"new","url":"https://example.org/2","published":"2026-01-01"}]
        self.assertEqual([x["title"] for x in latest(rows,"news",{"https://example.org/1"})],["new"])
    def test_paper(self):
        self.assertIsNone(doc({"title":"test","doi":"x"},"papers"))
        self.assertEqual(doc({"title":"test","doi":"10.1234/abc","journal":"J"},"papers")["url"],"https://doi.org/10.1234/abc")
    def test_cap(self):
        rows=[{"title":str(i),"url":"https://example.org/"+str(i),"published":"2026-01-01"} for i in range(20)]
        self.assertEqual(len(latest(rows,"news",set())),8)
if __name__=="__main__":unittest.main()
