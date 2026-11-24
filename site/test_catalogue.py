import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
import literature
import link_audit

class CatalogueTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:")
        self.db.row_factory=sqlite3.Row
        literature.sync(self.db,"2026-11-24T00:00:00+00:00",False)
    def tearDown(self):
        self.db.close()
    def test_registry(self):
        registry=literature.registry()
        self.assertEqual(set(registry),set(literature.JOURNALS.values()))
        self.assertGreaterEqual(len(registry),13)
        self.assertEqual(registry['Проблемы прогнозирования']['white_history'],{'2023':2,'2025':1})
        tags={tag for m in registry.values() for tag in m["tags"]}
        for tag in ("ВАК К1","ВАК К2","ВАК К3","РИНЦ","Scopus","RSCI","Web of Science"):
            self.assertIn(tag,tags)
        self.assertTrue(all(m["sources"] and m["verified"] for m in registry.values()))
    def test_metadata(self):
        item={"volume":"2","issue":"3","page":"10-20","is-referenced-by-count":0}
        self.assertEqual(literature.metadata(item)["pages"],"10-20")
        self.assertEqual(literature.metadata(item)["cited_by"],0)
        self.assertIsNone(literature.metadata({})["cited_by"])
        self.db.execute("insert into literature_meta values(?,?,?)",("10.1234/test",'{"volume":"2"}',"2026-11-24"))
        self.assertEqual(literature.enrich(self.db,[{"doi":"10.1234/test"}])[0]["volume"],"2")
    def test_classification_and_audit(self):
        self.db.execute("insert into literature values(?,?,?,?,?,?)",("10.1234/a?b","Вопросы экономики","2026-01","Стратегическое планирование промышленности","A",""))
        literature.reclassify(self.db)
        self.assertIn("Стратегическое планирование",self.db.execute("select topics from literature").fetchone()[0])
        self.assertEqual(literature.doi_url("10.1234/a?b"),"https://doi.org/10.1234/a%3Fb")
        with patch("literature.check_link",return_value=("10.1234/a?b","ok","https://example.com/article","200")):
            rows=literature.audit_links(self.db,"2026-11-24",True)
        self.assertEqual(rows["10.1234/a?b"]["status"],"ok")
        self.assertEqual(literature.audit_links(self.db,"2026-11-24",False),rows)
    def test_http_error(self):
        error=HTTPError("https://doi.org/10.1234/a",404,"Missing",{},None)
        with patch("literature.urlopen",side_effect=error):
            self.assertEqual(literature.check_link("10.1234/a")[1],"missing")
    def test_internal_links(self):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)
            (out/"index.html").write_text('<a href="papers.html#list">a</a><a href="missing.html">b</a><a href="papers.html#bad">c</a><a href="https://example.com/">d</a>',encoding="utf-8")
            (out/"papers.html").write_text('<div id="list"></div>',encoding="utf-8")
            errors,external=link_audit.scan(out)
            self.assertEqual(len(errors),2)
            self.assertIn("https://example.com/",external)
        self.assertTrue(link_audit.trusted("https://www.vedomosti.ru/article"))
        self.assertFalse(link_audit.trusted("https://vedomosti.ru.evil.example/"))
        self.assertFalse(link_audit.trusted("http://127.0.0.1/"))
if __name__=="__main__":
    unittest.main()
