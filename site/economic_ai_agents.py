"""Deterministic agent coordinator for every scheduled economic build.
Agents are bounded analytical routines, not autonomous LLM processes.
"""
import json,math,re
import provenance
from collections import Counter
from datetime import datetime
from urllib.parse import urlsplit
FILE="economic-ai-agents.json"
NOTE="Автоматический обзор по опубликованным наборам. Агенты — проверяемые программные модули, не фоновые языковые модели. Статус сборки не подтверждает истинность источника."

def read(out,name):
    return json.loads((out/name).read_text(encoding="utf-8"))
def finite(x):return type(x) in (float,int) and math.isfinite(x)
def safe_url(v):
    try:
        p=urlsplit(v)
        return p.scheme in ("https","http") and bool(p.hostname) and p.username is None and p.password is None
    except (ValueError,TypeError):return False
def doc(r,kind):
    title=r.get("title");date=r.get("published")
    url=r.get("url") if kind=="news" else "https://doi.org/"+str(r.get("doi",""))
    if not isinstance(title,str) or not title.strip() or not safe_url(url) or kind=="papers" and not str(r.get("doi","")).startswith("10."):return None
    return dict(title=title[:350],date=str(date or "")[:10],source=str(r.get("source") if kind=="news" else r.get("journal") or "")[:200],url=url,kind=kind)
def latest(rows,kind,old,limit=8):
    key="url" if kind=="news" else "doi"
    result=[]
    for r in sorted(rows,key=lambda x:(str(x.get("published") or ""),str(x.get(key) or "")),reverse=True):
        if r.get(key) in old:continue
        d=doc(r,kind)
        if d:result.append(d)
        if len(result)==limit:break
    return result
def agent(name,state,metrics,links,items=None):
    return dict(id=name,state=state,metrics=metrics,links=links,items=items or [])
STATES = ('ok','attention','waiting')
def continuity(agents, stamp, prior=None, baseline='missing'):
    old = {r['id']:r for r in prior['agents']} if prior else {}
    same = prior is not None and prior['built'] == stamp
    result = []
    for a in agents:
        previous = old.get(a['id'])
        previous_state = previous['state'] if previous else None
        old_run = previous.get('continuity', {}) if previous else {}
        unchanged = previous_state == a['state']
        if unchanged:
            count = old_run.get('consecutive', 1) + (0 if same else 1)
            since = old_run.get('since', prior['built'])
        else:
            count, since = 1, stamp
        result.append(dict(id=a['id'], state=a['state'], previous_state=previous_state,
                           consecutive=count, since=since,
                           transition='initial' if previous is None else 'unchanged' if unchanged else 'changed'))
    return dict(baseline=baseline, previous_built=prior['built'] if prior else None, rows=result)

def validate_continuity(d):
    c=d['continuity']
    if c['baseline'] not in ('verified','missing','unverified') or (c['baseline']=='verified') != bool(c['previous_built']):
        raise ValueError('Invalid continuity baseline')
    if [r['id'] for r in c['rows']] != [a['id'] for a in d['agents']]:
        raise ValueError('Invalid continuity registry')
    if c['previous_built'] and datetime.fromisoformat(c['previous_built']).tzinfo is None:
        raise ValueError('Invalid previous time')
    for r,a in zip(c['rows'],d['agents']):
        if r['state']!=a['state'] or type(r['consecutive']) is not int or r['consecutive']<1 or r['previous_state'] not in (*STATES,None) or datetime.fromisoformat(r['since']).tzinfo is None:
            raise ValueError('Invalid continuity row')
        expected='initial' if r['previous_state'] is None else 'unchanged' if r['previous_state']==r['state'] else 'changed'
        if r['transition']!=expected or (expected!='unchanged' and (r['consecutive']!=1 or r['since']!=d['built'])) or (c['baseline']!='verified' and expected!='initial'):
            raise ValueError('Invalid continuity transition')
    return True

def prior_agent_report(previous, stamp):
    if not (previous/FILE).is_file():
        return None, 'missing'
    try:
        manifest=read(previous,'data-manifest.json')
        if manifest.get('schema')!=provenance.SCHEMA or provenance.fingerprint(manifest['files'])!=manifest.get('data_fingerprint') or provenance.file_info(previous/FILE)!=manifest['files'].get(FILE):
            raise ValueError('Previous report checksum mismatch')
        prior=read(previous,FILE)
        validate(prior)
        if datetime.fromisoformat(prior['built'])>datetime.fromisoformat(stamp):
            raise ValueError('Previous report is newer')
        if 'continuity' in prior:
            prior['agents']=[dict(a,continuity=r) for a,r in zip(prior['agents'],prior['continuity']['rows'])]
        return prior,'verified'
    except (OSError,ValueError,TypeError,KeyError,AttributeError):
        return None,'unverified'

# Fixed, read-only coordination policy. A dependency is a prerequisite for
# interpreting a downstream report, not a command to modify the source.
TASK_RULES = (
    ('quality', 1, 'Проверить качество и свежесть источников', 'freshness.html', ()),
    ('discovery', 1, 'Проверить доступность новых показателей', 'economic-ai-discovery.json', ()),
    ('search', 1, 'Проверить покрытие и источники поиска', 'economic-search-audit.json', ()),
    ('coverage', 1, 'Проверить статистическое покрытие', 'data-registry.html', ('quality',)),
    ('diagnostics', 2, 'Исследовать макроэкономические сигналы', 'diagnostics.html', ('quality','coverage')),
    ('forecast', 2, 'Проверить качество прогнозов', 'forecast.html', ('quality',)),
    ('planning', 2, 'Проверить предпосылки экономических сценариев', 'planning-centre.html', ('quality','coverage','diagnostics')),
    ('research', 3, 'Проверить доступность научных материалов', 'papers.html', ('search',)),
)
def research_queue(agents, continuity_report):
    states = {a['id']:a['state'] for a in agents}
    runs = {r['id']:r for r in continuity_report['rows']}
    tasks = []
    for owner,priority,title,href,dependencies in TASK_RULES:
        if states[owner]=='ok':
            continue
        run = runs[owner]
        blockers = [d for d in dependencies if states[d]!='ok']
        # A waiting agent needs data, not a premature analytical conclusion.
        status = 'blocked' if blockers else 'needs_data' if states[owner]=='waiting' else 'ready_for_review'
        tasks.append(dict(id='review-'+owner,owner=owner,priority=priority,title=title,href=href,
                          state=status,source_state=states[owner],blockers=blockers,
                          consecutive=run['consecutive'],since=run['since']))
    tasks.sort(key=lambda t:(t['priority'], t['state']=='blocked', -t['consecutive'], t['id']))
    return dict(schema=1, mode='recommendations_only', tasks=tasks,
                counts={k:sum(t['state']==k for t in tasks) for k in ('ready_for_review','blocked','needs_data')})

# Automatic local preflight: measure actual availability of the fixed inputs.
# A successful check is not the completion of a substantive research task.
PREFLIGHT_INPUTS = {
    'quality': ('freshness.json','source-pipeline.json'),
    'discovery': ('economic-ai-discovery.json','economic-corporate-discovery.json'),
    'search': ('economic-search-audit.json','economic-search-index.json'),
    'coverage': ('data-registry.json','economic-ai-physical.json'),
    'diagnostics': ('economic-ai-diagnostics.json',),
    'forecast': ('economic-ai-forecast-memory.json','economic-ai-forecast-tournament.json'),
    'planning': ('economic-ai-planning.json',),
    'research': ('archive.json','literature.json'),
}
def preflight(out, queue, stamp):
    rows=[]
    for task in queue['tasks']:
        if task['state']=='blocked':
            rows.append(dict(id=task['id'],status='deferred',files=[]))
            continue
        files=[]
        for name in PREFLIGHT_INPUTS[task['owner']]:
            try:
                path=out/name
                if not path.is_file():
                    files.append(dict(name=name,status='missing'));continue
                raw=path.read_bytes()
                value=json.loads(raw)
                if not isinstance(value,(dict,list)) or not value:
                    files.append(dict(name=name,status='empty_or_invalid'));continue
                files.append(dict(name=name,status='readable',bytes=len(raw),sha256=provenance.sha(raw)))
            except (OSError,ValueError,TypeError):
                files.append(dict(name=name,status='unreadable'))
        rows.append(dict(id=task['id'],status='inputs_readable' if all(f['status']=='readable' for f in files) else 'inputs_unavailable',files=files))
    return dict(schema=1, mode='local_preflight_only', checked=stamp, rows=rows,
                counts={k:sum(r['status']==k for r in rows) for k in ('inputs_readable','inputs_unavailable','deferred')})

def validate_preflight(d):
    p=d['preflight'];q=d['research_queue']
    if p['schema']!=1 or p['mode']!='local_preflight_only' or p['checked']!=d['built'] or [r['id'] for r in p['rows']]!=[t['id'] for t in q['tasks']]:
        raise ValueError('Invalid preflight report')
    for row,task in zip(p['rows'],q['tasks']):
        if task['state']=='blocked':
            if row['status']!='deferred' or row['files']:raise ValueError('Blocked preflight')
            continue
        if [f['name'] for f in row['files']]!=list(PREFLIGHT_INPUTS[task['owner']]):raise ValueError('Invalid preflight inputs')
        for f in row['files']:
            if f['status']=='readable':
                if type(f['bytes']) is not int or f['bytes']<1 or not re.fullmatch(r'[a-f0-9]{64}',f['sha256']):raise ValueError('Invalid preflight hash')
            elif f['status'] not in ('missing','empty_or_invalid','unreadable'):raise ValueError('Invalid preflight state')
        expected='inputs_readable' if all(f['status']=='readable' for f in row['files']) else 'inputs_unavailable'
        if row['status']!=expected:raise ValueError('Invalid preflight result')
    if p['counts']!={k:sum(r['status']==k for r in p['rows']) for k in ('inputs_readable','inputs_unavailable','deferred')}:raise ValueError('Invalid preflight counts')
    return True

# Bounded history of actual local checks, not a memory of economic conclusions.
HISTORY_LIMIT=30
def preflight_snapshot(data):
    return dict(checked=data['built'], mode=data['mode'], rows=data['preflight']['rows'],
                counts=data['preflight']['counts'])

def preflight_history(data, prior):
    current=preflight_snapshot(data)
    older=[]
    if prior and 'preflight' in prior:
        older=prior.get('preflight_history',{}).get('snapshots',[preflight_snapshot(prior)])
    now=datetime.fromisoformat(current['checked'])
    older=[r for r in older if datetime.fromisoformat(r['checked'])<now]
    return dict(schema=1, limit=HISTORY_LIMIT, snapshots=[current]+older[:HISTORY_LIMIT-1])

def validate_preflight_history(data):
    h=data['preflight_history']
    if h['schema']!=1 or h['limit']!=HISTORY_LIMIT or not 1<=len(h['snapshots'])<=HISTORY_LIMIT or h['snapshots'][0]!=preflight_snapshot(data):
        raise ValueError('Invalid preflight history')
    previous=None
    for snap in h['snapshots']:
        stamp=datetime.fromisoformat(snap['checked'])
        if stamp.tzinfo is None or previous is not None and stamp>=previous or snap['mode'] not in ('scheduled_refresh','offline_build'):
            raise ValueError('Invalid history time')
        previous=stamp
        ids=set()
        for row in snap['rows']:
            owner=row['id'].removeprefix('review-')
            if owner not in PREFLIGHT_INPUTS or row['id']!='review-'+owner or row['id'] in ids:
                raise ValueError('Invalid history task')
            ids.add(row['id'])
            if row['status']=='deferred':
                if row['files']:raise ValueError('Deferred history files')
                continue
            if [f['name'] for f in row['files']]!=list(PREFLIGHT_INPUTS[owner]):raise ValueError('Invalid history inputs')
            for f in row['files']:
                if f['status']=='readable':
                    if type(f['bytes']) is not int or f['bytes']<1 or not re.fullmatch(r'[a-f0-9]{64}',f['sha256']):raise ValueError('Invalid history checksum')
                elif f['status'] not in ('missing','empty_or_invalid','unreadable'):raise ValueError('Invalid history file state')
            if row['status']!=('inputs_readable' if all(f['status']=='readable' for f in row['files']) else 'inputs_unavailable'):
                raise ValueError('Invalid history status')
        if snap['counts']!={k:sum(r['status']==k for r in snap['rows']) for k in ('inputs_readable','inputs_unavailable','deferred')}:
            raise ValueError('Invalid history counts')
    return True

# Matched-sample sensitivity to statistical revisions, not retrospective tuning.
def forecast_revision_audit(rows):
    groups={}
    for r in rows:
        key=(r['code'],r['source'],r['unit'],r['horizon'])
        groups.setdefault(key,[]).append(r)
    result=[]
    for (code,source,unit,horizon),xs in sorted(groups.items()):
        first=[r for r in xs if finite(r.get('first_actual'))]
        paired=[r for r in first if finite(r.get('latest_actual'))]
        if len({r['target'] for r in paired})!=len(paired):
            # Repeated targets must not masquerade as independent observations.
            result.append(dict(code=code,source=source,unit=unit,horizon=horizon,
                               frozen=len(xs),first_scored=len(first),paired=len(paired),status='duplicate_targets',
                               first_mae=None,latest_mae=None,first_naive_mae=None,latest_naive_mae=None,
                               revised=None,revision_mae=None,advantage_changed=None))
            continue
        def mae(actual,forecast):
            return sum(abs(r[forecast]-r[actual]) for r in paired)/len(paired) if paired else None
        a,b=mae('first_actual','point'),mae('latest_actual','point')
        c,d=mae('first_actual','naive'),mae('latest_actual','naive')
        result.append(dict(code=code,source=source,unit=unit,horizon=horizon,
                           frozen=len(xs),first_scored=len(first),paired=len(paired),
                           status='waiting' if not paired else 'small_sample' if len(paired)<10 else 'diagnostic',
                           first_mae=a,latest_mae=b,first_naive_mae=c,latest_naive_mae=d,
                           revised=sum(r['first_actual']!=r['latest_actual'] for r in paired),
                           revision_mae=mae('first_actual','latest_actual'),
                           advantage_changed=(a<c)!=(b<d) if paired else None))
    return dict(schema=1,method='matched_first_latest',rows=result,
                note='MAE на одной выборке целевых периодов. Пересмотр факта не означает ошибку источника; преимущество перед наивным прогнозом не является статистически доказанным. При выборке менее 10 вывод предварительный. Методы прогнозирования не меняются.')

def build(out,previous,stamp,refresh):
    if datetime.fromisoformat(stamp).tzinfo is None:raise ValueError("Invalid build time")
    memory=read(out,"economic-ai-memory.json");m=memory["latest"]
    discovery=read(out,"economic-ai-discovery.json");dr=discovery["rows"]
    ready=[r for r in dr.values() if r["values"] and r["status"] in ("ok","error")]
    forecast=read(out,"economic-ai-forecast-memory.json")
    from economic_ai_forecast_memory import validate as validate_forecast
    validate_forecast(forecast)
    revision_audit=forecast_revision_audit(forecast["rows"])
    fs=forecast["summary"]
    assessed=[r for r in fs if r["n"]>=10]
    # Diagnostics only: no tuning against the future evaluation set.
    flags=[{"code":r["code"],"horizon":r["horizon"],"n":r["n"],"mae":r["mae"],"naive_mae":r["naive_mae"],"unit":r["unit"],"action":"review_model" if r["mae"]>=r["naive_mae"] else "continue_evaluation"} for r in assessed if finite(r["mae"]) and finite(r["naive_mae"])]
    news=read(out,"archive.json");papers=read(out,"literature.json")["articles"]
    baseline=not m["initial"]
    old_news=set();old_papers=set()
    if baseline:
        old_news={r["url"] for r in read(previous,"archive.json")}
        old_papers={r["doi"] for r in read(previous,"literature.json")["articles"]}
    report_items=latest(news,"news",old_news)+latest(papers,"papers",old_papers)
    groups=Counter(r["group"] for r in read(out,"data-registry.json")["rows"] if r["count"]>0)
    agents=[
      agent("coverage","attention" if memory["backlog"] else "ok",{"series_with_values":sum(groups.values()),"groups":dict(groups),"catalogue_changes":m["changes"]["series"],"observation_changes":m["observation_changes"]},["data-registry.html","stat-revisions.html"]),
      agent("discovery","attention" if discovery["catalog_status"]=="error" else "ok" if ready else "waiting",{"candidates":len(dr),"available":len(ready),"observations":sum(len(r["values"]) for r in ready),"cached_after_error":sum(r["status"]=="error" for r in ready)},["economic-ai-discovery.json"]),
      agent("quality","attention" if memory["backlog"] or m["recent_rejected"] else "ok",{"freshness":m["freshness"],"backlog":len(memory["backlog"]),"recent_rejected":m["recent_rejected"]},["freshness.html","source-pipeline.html"],[{k:r.get(k) for k in ("id","title","state","next_check")} for r in memory["backlog"][:10]]),
      agent("research","ok" if news or papers else "waiting",{"news":m["changes"]["news"],"papers":m["changes"]["papers"],"baseline_available":baseline},["index.html","papers.html"],report_items),
      agent("forecast","attention" if any(r["action"]=="review_model" for r in flags) else "ok" if assessed else "waiting",{"frozen":len(forecast["rows"]),"scored":sum(r["first_actual"] is not None for r in forecast["rows"]),"adequate_sample_groups":len(assessed)},["forecast.html","economic-ai-forecast-memory.json"],flags[:30])]
    eurostat=read(out,"economic-eurostat-trade.json")
    agents[1]["metrics"]["eurostat"]=[dict(code=k,title=r["title"],status=r["status"],checked=r["checked"],success=r["success"],count=len(r["rows"]),latest=r["rows"][-1] if r["rows"] else None) for k,r in eurostat["series"].items()]
    agents[1]["metrics"]["eurostat_note"]=eurostat["note"]
    c=eurostat["comparison"]
    agents[1]["metrics"]["eurostat_comparison"]={**{k:c[k] for k in ("note","counts","retrieved","source_status")},"latest":c["rows"][-1] if c["rows"] else None}
    if c["counts"]["review"]:agents[1]["state"]="attention"
    agents[1]["links"].append("economic-eurostat-trade.json")
    if any(r["status"]=="error" for r in eurostat["series"].values()):agents[1]["state"]="attention"
    physical=read(out,"economic-ai-physical.json")
    agents[0]["metrics"]["physical"]={k:physical[k] for k in ("note","counts","rows","closed_year")}
    agents[0]["links"].append("economic-ai-physical.json")
    corporate=read(out,"economic-corporate-monitor.json")
    agents[2]["metrics"]["corporate"]={"note":corporate["note"],"rows":list(corporate["rows"].values()),"review":sum(r["review"] for r in corporate["rows"].values())}
    agents[2]["links"].append("economic-corporate-monitor.json")
    if any(r["review"] or r["status"] in ("error","blocked") for r in corporate["rows"].values()):agents[2]["state"]="attention"
    corporate_discovery=read(out,"economic-corporate-discovery.json")
    agents[1]["metrics"]["corporate_discovery"]={"note":corporate_discovery["note"],"sources":list(corporate_discovery["sources"].values()),"count":len(corporate_discovery["rows"]),"recent":sorted(corporate_discovery["rows"].values(),key=lambda r:(r["first_seen"],r["url"]),reverse=True)[:15]}
    agents[1]["links"].append("economic-corporate-discovery.json")
    if any(r["status"] in ("error","blocked") for r in corporate_discovery["sources"].values()):agents[1]["state"]="attention"
    pdf=read(out,"economic-corporate-pdf.json")
    agents[2]["metrics"]["corporate_pdf"]=pdf
    agents[2]["links"].append("economic-corporate-pdf.json")
    if pdf["status"] in ("error","blocked") or any(r["status"]!="match" for r in pdf["comparison"]):agents[2]["state"]="attention"
    review=read(out,"economic-corporate-review.json")
    agents[2]["metrics"]["corporate_review"]={"note":review["note"],"counts":review["counts"],"rows":[dict(id=k,**r) for k,r in review["rows"].items() if r["active"]]}
    agents[2]["links"].append("economic-corporate-review.json")
    if any(review["counts"].get(k,0) for k in ("review_difference","missing_archive","cached")):agents[2]["state"]="attention"
    comp=read(out,"economic-ai-comparability.json")
    agents[2]["metrics"]["comparability"]=comp
    agents[2]["links"].append("economic-ai-comparability.json")
    if comp["counts"]["unknown"]:agents[2]["state"]="attention"
    agents[4]["metrics"]["revision_audit"]=revision_audit
    tournament=read(out,"economic-ai-forecast-tournament.json")
    agents[4]["metrics"]["tournament"]={"frozen":len(tournament["rows"]),"scored":sum(r["actual"] is not None for r in tournament["rows"]),"candidates":sum(r["recommendation"] is not None for r in tournament["summary"])}
    agents[4]["links"].append("economic-ai-forecast-tournament.json")
    agents[4]["metrics"]["tournament_results"]=tournament["summary"]
    trials=read(out,"economic-ai-forecast-trials.json")["trials"]
    agents[4]["metrics"]["trials"]=[dict(code=r["code"],unit=r["unit"],horizon=r["horizon"],candidate=r["candidate"],selected=r["selected"],**r["result"]) for r in trials]
    agents[4]["links"].append("economic-ai-forecast-trials.json")
    search=read(out,"economic-search-audit.json")
    agents.append(agent("search","attention" if any(r["status"] in ("error","blocked") for r in search["sources"]) else "waiting" if any(r["status"]=="waiting" for r in search["sources"]) else "ok",{"counts":search["counts"],"terms":search["terms"],"index_bytes":search["index_bytes"],"baseline_available":search["baseline_available"],"abstracts":search["abstracts"]},["economic-search.html","economic-search-audit.json"],search["sources"]))
    diag=read(out,"economic-ai-diagnostics.json")
    signals=[r for r in diag["rows"] if r["status"]=="signal"]
    assessed=diag["counts"]["signal"]+diag["counts"]["ordinary"]
    agents.append(agent("diagnostics","attention" if signals else "ok" if assessed else "waiting",{"counts":diag["counts"],"closed_year":diag["closed_year"],"stale":sum(r["age"] is not None and r["age"]>1 for r in diag["rows"]),"note":diag["note"]},["diagnostics.html","economic-ai-diagnostics.json"],diag["rows"]))
    planning=read(out,"economic-ai-planning.json")
    agents.append(agent("planning","attention" if planning["counts"]["investigate"] else "waiting" if planning["counts"]["data_required"]+planning["counts"]["refresh_first"]+planning["counts"]["history_required"] else "ok",{"counts":planning["counts"],"note":planning["note"]},["planning-centre.html","economic-ai-planning.json"],planning["rows"]))
    data=dict(schema=1,built=stamp,mode="scheduled_refresh" if refresh else "offline_build",note=NOTE,agents=agents)
    prior,baseline=prior_agent_report(previous,stamp)
    data['continuity']=continuity(agents,stamp,prior,baseline)
    data['research_queue']=research_queue(agents,data['continuity'])
    data['preflight']=preflight(out,data['research_queue'],stamp)
    data['preflight_history']=preflight_history(data,prior)
    validate(data)
    return data
def validate(d):
    if d["schema"]!=1 or d["note"]!=NOTE or d["mode"] not in ("scheduled_refresh","offline_build") or datetime.fromisoformat(d["built"]).tzinfo is None:raise ValueError("Invalid agent report")
    if [r["id"] for r in d["agents"]]!=["coverage","discovery","quality","research","forecast","search","diagnostics","planning"]:raise ValueError("Agent registry")
    for a in d["agents"]:
        if a["state"] not in ("ok","attention","waiting") or not isinstance(a["metrics"],dict) or not isinstance(a["items"],list):raise ValueError("Agent result")
    if 'continuity' in d:validate_continuity(d)
    if 'research_queue' in d:
        if 'continuity' not in d or d['research_queue']!=research_queue(d['agents'],d['continuity']):raise ValueError('Invalid research queue')
    if 'preflight' in d:validate_preflight(d)
    if 'preflight_history' in d:
        if 'preflight' not in d:raise ValueError('History without current check')
        validate_preflight_history(d)
    for d in d["agents"][3]["items"]:
        if not safe_url(d["url"]) or d["kind"] not in ("news","papers"):raise ValueError("Unsafe document")
    return True
def publish(out,previous,stamp,refresh):
    data=build(out,previous,stamp,refresh)
    (out/FILE).write_text(json.dumps(data,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
    return data
