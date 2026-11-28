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
    def test_preflight(self):
        from pathlib import Path
        from tempfile import TemporaryDirectory
        from copy import deepcopy
        stamp='2026-11-28T03:00:00+00:00'
        agents=[dict(id=r[0],state='attention' if r[0] in ('quality','diagnostics','search') else 'ok') for r in TASK_RULES]
        q=research_queue(agents,continuity(agents,stamp))
        with TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/'freshness.json').write_text('{"rows":[]}',encoding='utf-8')
            (root/'source-pipeline.json').write_text('broken',encoding='utf-8')
            (root/'economic-search-audit.json').write_text('{"counts":{}}',encoding='utf-8')
            (root/'economic-search-index.json').write_text('{"rows":[]}',encoding='utf-8')
            p=preflight(root,q,stamp);by={r['id']:r for r in p['rows']}
            self.assertEqual(by['review-quality']['status'],'inputs_unavailable')
            self.assertEqual(by['review-quality']['files'][1]['status'],'unreadable')
            self.assertEqual(by['review-search']['status'],'inputs_readable')
            self.assertEqual(by['review-diagnostics']['status'],'deferred')
            self.assertEqual(by['review-diagnostics']['files'],[])
            self.assertEqual(by['review-search']['files'][0]['sha256'],provenance.file_info(root/'economic-search-audit.json')['sha256'])
            self.assertTrue(validate_preflight(dict(built=stamp,research_queue=q,preflight=p)))
            bad=deepcopy(p);bad['counts']['deferred']=9
            with self.assertRaises(ValueError):validate_preflight(dict(built=stamp,research_queue=q,preflight=bad))
            (root/'source-pipeline.json').unlink()
            p=preflight(root,q,stamp);by={r['id']:r for r in p['rows']}
            self.assertEqual(by['review-quality']['files'][1]['status'],'missing')
            (root/'source-pipeline.json').write_text('[]',encoding='utf-8')
            p=preflight(root,q,stamp);by={r['id']:r for r in p['rows']}
            self.assertEqual(by['review-quality']['files'][1]['status'],'empty_or_invalid')
    def test_preflight_history(self):
        from datetime import timedelta
        from copy import deepcopy
        stamp=datetime.fromisoformat('2026-10-01T03:00:00+00:00')
        prior=None
        for i in range(35):
            checked=(stamp+timedelta(days=i)).isoformat()
            row=dict(id='review-quality',status='deferred',files=[])
            current=dict(built=checked,mode='scheduled_refresh',preflight=dict(rows=[row],counts=dict(inputs_readable=0,inputs_unavailable=0,deferred=1)))
            current['preflight_history']=preflight_history(current,prior)
            prior=current
        h=current['preflight_history']
        self.assertEqual(len(h['snapshots']),30)
        self.assertEqual(h['snapshots'][0]['checked'],current['built'])
        self.assertEqual(h['snapshots'][-1]['checked'],(stamp+timedelta(days=5)).isoformat())
        self.assertTrue(validate_preflight_history(current))
        self.assertEqual(preflight_history(current,current),h)
        self.assertEqual(len(preflight_history(current,None)['snapshots']),1)
        old=deepcopy(current);old.pop('preflight_history')
        old['built']=stamp.isoformat()
        self.assertEqual(len(preflight_history(current,old)['snapshots']),2)
        for field in ('time','counts','id','files'):
            bad=deepcopy(current)
            row=bad['preflight_history']['snapshots'][1]
            if field=='time':row['checked']=current['built']
            elif field=='counts':row['counts']['deferred']=2
            elif field=='id':row['rows'][0]['id']='review-other'
            else:row['rows'][0]['files']=[dict(name='freshness.json',status='missing')]
            with self.assertRaises(ValueError):validate_preflight_history(bad)
    def test_forecast_revision_audit(self):
        def row(target,first,latest,point=10,naive=14,unit='руб.',code='GDP'):
            return dict(code=code,source='https://example.org/series',unit=unit,horizon=1,
                        target=target,first_actual=first,latest_actual=latest,point=point,naive=naive)
        d=forecast_revision_audit([row('2024',10,14),row('2025',10,14),row('2026',None,None),row('2023',8,None)])
        x=d['rows'][0]
        self.assertEqual((x['frozen'],x['first_scored'],x['paired']),(4,3,2))
        self.assertEqual((x['first_mae'],x['latest_mae']),(0,4))
        self.assertEqual((x['first_naive_mae'],x['latest_naive_mae']),(4,0))
        self.assertEqual(x['revised'],2)
        self.assertEqual(x['revision_mae'],4)
        self.assertTrue(x['advantage_changed'])
        self.assertEqual(x['status'],'small_sample')
        y=forecast_revision_audit([row('2025',None,None)])['rows'][0]
        self.assertEqual(y['status'],'waiting')
        self.assertIsNone(y['latest_mae'])
        self.assertIsNone(y['advantage_changed'])
        z=forecast_revision_audit([row('2025',0,0),row('2025',0,0)])['rows'][0]
        self.assertEqual(z['status'],'duplicate_targets')
        self.assertIsNone(z['first_mae'])
        self.assertEqual(len(forecast_revision_audit([row('2025',1,1),row('2025',1,1,unit='тонн')])['rows']),2)
        z=forecast_revision_audit([row(str(2000+i),10,10) for i in range(10)])['rows'][0]
        self.assertEqual(z['status'],'diagnostic')
        self.assertFalse(z['advantage_changed'])
        self.assertEqual(z['revision_mae'],0)
if __name__=="__main__":unittest.main()
