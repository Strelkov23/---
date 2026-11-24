import unittest
import tempfile
import json
from pathlib import Path
import programmes as p

class ProgrammeTests(unittest.TestCase):
    def test_filter_and_deduplicate(self):
        a={"source":"Правительство России","url":"https://government.ru/news/1/","title":"Утверждение государственной программы и федерального проекта","published":"2026-11-24"}
        rows=p.classify([a,a,dict(a,source="ТАСС"),dict(a,url="https://government.ru.evil.example/a"),dict(a,url="https://government.ru/news/2/",title="Обычная новость")])
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]["kinds"],["Государственные программы","Федеральные проекты"])
        self.assertEqual(rows[0]["actions"],["Утверждение"])
    def test_empty_build(self):
        with tempfile.TemporaryDirectory() as d:
            out=Path(d); pages={}
            p.publish(pages.__setitem__,out,[],"2026-11-24")
            self.assertEqual(json.loads((out/"programmes.json").read_text())["rows"],[])
            self.assertIn("Уникальных материалов: 0",pages["programmes.html"])
            self.assertTrue((out/"programmes.csv").is_file())
    def test_csv_injection(self):
        self.assertEqual(p.safe_csv(" =1+1"),"' =1+1")
        self.assertEqual(p.safe_csv("Обычный текст"),"Обычный текст")
