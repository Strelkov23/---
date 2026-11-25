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
        for href in ("economic-map.html#geo-dashboard","historical.html#enterprise-diagnostics","regional-manufacturing.html#rm-concentration","regional-manufacturing.html#rm-structural-change"):
            self.assertIn(href,{r["href"] for r in rows})
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
            self.assertIn('id="hub-query"',pages[key+".html"])
            self.assertIn('id="hub-tools"',pages[key+".html"])
            for href,_,_ in items:self.assertIn('href="'+href+'"',pages[key+".html"])
    def test_atlas_task_navigation(self):
        for page,(_,tasks) in n.ATLAS_TASKS.items():
            body='<section class="mast"><h1>Title</h1></section>'+''.join('<section id="'+key+'"><h2>Target</h2></section>' for key,_,_ in tasks)
            result=n.atlas_tools(page,body)
            self.assertIn('id="atlas-tools"',result)
            self.assertEqual(result.count('class="atlas-task"'),len(tasks))
            self.assertTrue(all('href="#'+key+'"' in result for key,_,_ in tasks))
            with self.assertRaises(ValueError):n.atlas_tools(page,'<section class="mast"><h1>Title</h1></section>')
        self.assertEqual(n.atlas_tools("index.html","plain"),"plain")
if __name__=="__main__":unittest.main()
