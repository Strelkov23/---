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
    def test_continuity(self):
        from copy import deepcopy
        s1='2026-11-25T03:00:00+00:00';s2='2026-11-26T03:00:00+00:00';s3='2026-11-27T03:00:00+00:00'
        a=[dict(id='quality',state='attention'),dict(id='search',state='ok')]
        b=[dict(id='quality',state='attention'),dict(id='search',state='waiting')]
        c=continuity(a,s1)
        self.assertEqual(c['rows'][0]['transition'],'initial')
        self.assertEqual(c['rows'][0]['consecutive'],1)
        self.assertTrue(validate_continuity(dict(agents=a,built=s1,continuity=c)))
        prior=dict(built=s1,agents=a)
        c=continuity(b,s2,prior,'verified')
        self.assertEqual(c['rows'][0]['consecutive'],2)
        self.assertEqual(c['rows'][0]['since'],s1)
        self.assertEqual(c['rows'][1]['transition'],'changed')
        self.assertEqual(c['rows'][1]['since'],s2)
        self.assertTrue(validate_continuity(dict(agents=b,built=s2,continuity=c)))
        prior=dict(built=s2,agents=[dict(x,continuity=y) for x,y in zip(b,c['rows'])])
        c=continuity(b,s3,prior,'verified')
        self.assertEqual(c['rows'][0]['consecutive'],3)
        self.assertEqual(c['rows'][1]['consecutive'],2)
        self.assertEqual(continuity(b,s2,prior,'verified')['rows'][0]['consecutive'],2)
        self.assertEqual(continuity(b,s3,None,'unverified')['rows'][0]['consecutive'],1)
        bad=deepcopy(c);bad['rows'][0]['consecutive']=0
        with self.assertRaises(ValueError):validate_continuity(dict(agents=b,built=s3,continuity=bad))
    def test_prior_agent_report(self):
        from pathlib import Path
        from tempfile import TemporaryDirectory
        with TemporaryDirectory() as tmp:
            root=Path(tmp);stamp='2026-11-27T03:00:00+00:00'
            self.assertEqual(prior_agent_report(root,stamp),(None,'missing'))
            (root/FILE).write_text('{}',encoding='utf-8')
            self.assertEqual(prior_agent_report(root,stamp),(None,'unverified'))
    def test_research_queue(self):
        stamp='2026-11-28T03:00:00+00:00'
        ids=[r[0] for r in TASK_RULES]
        def make(**states):
            agents=[dict(id=k,state=states.get(k,'ok')) for k in ids]
            return research_queue(agents,continuity(agents,stamp))
        self.assertEqual(make()['tasks'],[])
        q=make(quality='attention',planning='attention',forecast='waiting',research='waiting')
        self.assertEqual(q['counts'],dict(ready_for_review=1,blocked=2,needs_data=1))
        by={r['owner']:r for r in q['tasks']}
        self.assertEqual(by['quality']['state'],'ready_for_review')
        self.assertEqual(by['planning']['blockers'],['quality'])
        self.assertEqual(by['forecast']['state'],'blocked')
        self.assertEqual(by['research']['state'],'needs_data')
        self.assertEqual(q['tasks'][0]['owner'],'quality')
        self.assertEqual(q['mode'],'recommendations_only')
        self.assertEqual(by['quality']['consecutive'],1)
        self.assertEqual(make(planning='attention')['tasks'][0]['state'],'ready_for_review')
        self.assertEqual(make(coverage='waiting',diagnostics='attention')['tasks'][1]['blockers'],['coverage'])
if __name__=="__main__":unittest.main()
