import tempfile,unittest
from pathlib import Path
import literature_coverage as p
class Coverage(unittest.TestCase):
    def test_multilabel_and_missing(self):
        lit=dict(registry={"Журнал":{"issn":"1234-5678"}},articles=[dict(doi="10.1234/a",journal="Журнал",published="2025",topics="Модели и методы · Стратегическое планирование",authors="А",volume="1",issue="2",pages="3"),dict(doi="10.1234/b",journal="Журнал",published="2025",topics="Модели и методы"),dict(doi="10.1234/c",journal="Журнал",published="",topics="")])
        d=p.collect(lit,"2026-11-26")
        self.assertEqual(d["records"],3)
        self.assertEqual(d["years"],{"2025":2,"unknown":1})
        self.assertEqual(sum(r["records"] for r in d["topics"]),4)
        self.assertEqual(d["rows"][0]["complete_bibliography"],1)
        with tempfile.TemporaryDirectory() as t:
            path=Path(t)/"rows.csv";p.save_csv(path,p.FIELDS,d["rows"]);p.verify_csv(path,p.FIELDS,d["rows"])
            self.assertIn("literature-years.csv",p.render(d))
        lit["articles"].append(lit["articles"][0])
        with self.assertRaises(ValueError):p.collect(lit,"2026-11-26")

    def test_search_links_and_topic_rows(self):
        from urllib.parse import urlsplit,parse_qs
        url=p.search_link("2025",journal="Журнал & экономика",metadata="complete")
        q=parse_qs(urlsplit(url).query)
        self.assertEqual(q["journal"],["Журнал & экономика"])
        self.assertEqual(q["from"],["2025"])
        self.assertEqual(q["paper-meta"],["complete"])
        self.assertIsNone(p.search_link("unknown"))
        d=p.collect(dict(registry={"Ж":{"issn":"1234-5678"}},articles=[dict(doi="10.1234/a",journal="Ж",published="2025",topics="Стратегическое планирование")]),"2026-11-26")
        html=p.render(d)
        self.assertIn("Тематические разрезы",html)
        self.assertIn("100,0 %",html)
        self.assertIn("catalogue-view=coverage",html)
