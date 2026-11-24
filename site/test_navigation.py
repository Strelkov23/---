import unittest
from html.parser import HTMLParser
from urllib.parse import urlsplit
import navigation as n
class NavTests(unittest.TestCase):
    def test_sections_and_legacy(self):
        self.assertEqual(len(n.GROUPS),6)
        self.assertEqual(len({g[0] for g in n.GROUPS}),6)
        destinations={h for g in n.GROUPS for h,_,_ in g[3]}
        for h in ("week.html","desk.html","compare.html","index.html#archive","laws.html","atlas.html","sector-passports.html","industrial.html","statistics.html","national.html","historical.html","diagnostics.html","scenario.html","papers.html","directory.html","index.html#model","sources.html","links.html","methodology.html"):
            self.assertIn(h,destinations)
        self.assertIn('aria-current="page">Статистика',n.primary("historical.html"))
        self.assertIn('aria-current="page">Регионы и история',n.secondary("historical.html"))
        self.assertIn('aria-current="page">Карта России',n.primary("economic-map.html"))
        self.assertIn("section-more",n.secondary("scenario.html"))
        self.assertIn('aria-current="page">Многовариантные сценарии',n.secondary("scenario.html"))
        self.assertIn("Отрасли",n.secondary("sector-1.html"))
        self.assertIn("Статистика",n.secondary("indicator-TEST.html"))
    def test_search_entries(self):
        rows=n.search_entries()
        self.assertEqual(len(rows),len({r["href"] for r in rows}))
        self.assertIn("economic-map.html",{r["href"] for r in rows})
        self.assertIn("news-map.html",{r["href"] for r in rows})
        self.assertIn('aria-current="page">Поиск',n.primary("search.html"))
    def test_guides(self):
        self.assertIn("glossary.html#scenario",n.guide("scenario.html"))
        self.assertIn("methodology.html#global-plan-method",n.guide("scenario.html"))
        self.assertEqual(n.guide("unknown.html"),"")
    def test_hubs(self):
        pages={}
        n.publish(lambda name,body:pages.update({name:body}))
        self.assertEqual(len(pages),6)
        for key,label,_,items in n.GROUPS:
            self.assertIn("<h1>"+label+"</h1>",pages[key+".html"])
            for href,_,_ in items:self.assertIn('href="'+href+'"',pages[key+".html"])
if __name__=="__main__":unittest.main()
