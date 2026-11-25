"""Catalogue coverage audit; publisher-deposited licensing evidence is not
an independent verification of free full-text access."""
import json,re
from collections import Counter
from datetime import date
from html import escape
from urllib.parse import urlsplit
from literature import public_link
import openalex_access

FILE="literature-quality.json"
NOTE="Охват относится только к локальному каталогу, не ко всем статьям журналов. Лицензии заявлены в Crossref; даже действующая CC-лицензия конкретной версии не доказывает доступность файла. Сохранённые библиографические поля отмечены датой последнего получения. Пропуск не означает отсутствие в оригинале."

def cc_license(url):
    if not public_link(url):return None
    u=urlsplit(url)
    if u.hostname not in ("creativecommons.org","www.creativecommons.org") or u.query or u.fragment:return None
    m=re.fullmatch(r"/licenses/(by|by-sa|by-nd|by-nc|by-nc-sa|by-nc-nd)/(1\.0|2\.0|2\.5|3\.0|4\.0)/?(?:deed(?:\.[a-zA-Z-]+)?|legalcode)?/?",u.path)
    if m:return "CC "+m[1].upper()+" "+m[2]
    if re.fullmatch(r"/publicdomain/zero/1\.0/?(?:deed(?:\.[a-zA-Z-]+)?|legalcode)?/?",u.path):return "CC0 1.0"
    return None

def license_evidence(article,as_of):
    today=date.fromisoformat(as_of)
    result=[]
    access=article.get("access",{})
    for x in access.get("licenses",[]):
        code=cc_license(x.get("url"))
        if not code or x.get("version") not in ("vor","am"):continue
        try:start=date.fromisoformat(x["start"])
        except (ValueError,TypeError,KeyError):continue
        if start>today:continue
        v=dict(code=code,url=x["url"],version=x["version"],start=x["start"])
        if v not in result:result.append(v)
    return result

def decorate(papers,stamp):
    as_of=stamp[:10]
    for p in papers:p["cc_evidence"]=license_evidence(p,as_of)

def counts(articles,audit,as_of):
    r=Counter(total=len(articles))
    for p in articles:
        for field in ("authors","volume","issue","pages","article_number","language"):
            r["with_"+field]+=bool(p.get(field))
        r["complete_bibliography"]+=bool(p.get("authors") and p.get("volume") and p.get("issue") and (p.get("pages") or p.get("article_number")))
        r["carried_bibliography"]+=bool(p.get("metadata_carried"))
        r["with_citations"]+=type(p.get("cited_by")) is int
        r["with_access_metadata"]+=bool(p.get("access_observed"))
        access=p.get("access",{})
        r["with_license"]+=bool(access.get("licenses"))
        r["with_reading_link"]+=any(x.get("application","") in ("","unspecified") for x in access.get("links",[]))
        r["with_cc_evidence"]+=bool(license_evidence(p,as_of))
        s=audit.get(p["doi"],{}).get("status","unchecked")
        r["link_"+s]+=1
        r["oa_"+openalex_access.quality(p)]+=1
    keys=("total","with_authors","with_volume","with_issue","with_pages","with_article_number","with_language","complete_bibliography","carried_bibliography","with_citations","with_access_metadata","with_license","with_reading_link","with_cc_evidence","link_ok","link_missing","link_restricted","link_error","link_unchecked","oa_reported_open","oa_reported_closed","oa_not_found","oa_error","oa_deferred","oa_unchecked")
    return {k:r[k] for k in keys}

def collect(literature,stamp):
    as_of=stamp[:10];date.fromisoformat(as_of)
    papers=literature["articles"];registry=literature["registry"];audit=literature["links"]
    grouped={}
    for p in papers:
        if p.get("cc_evidence")!=license_evidence(p,as_of):raise ValueError("Несовпадение лицензии с метаданными")
        grouped.setdefault(p["journal"],[]).append(p)
    rows=[]
    for name in sorted(set(grouped)|set(registry)):
        m=registry.get(name,{})
        rows.append(dict(journal=name,issn=m.get("issn"),counts=counts(grouped.get(name,[]),audit,as_of)))
    total=counts(papers,audit,as_of)
    if sum(v for k,v in total.items() if k.startswith("oa_"))!=total["total"]:raise ValueError("Баланс результатов OpenAlex")
    if any(sum(r["counts"][k] for r in rows)!=v for k,v in total.items()):raise ValueError("Баланс научного каталога")
    import literature_coverage as coverage
    import literature_resume as resume
    queue=resume.quality(literature["queue"],registry) if "queue" in literature else None
    return dict(schema=1,built=stamp,note=NOTE,total=total,journals=rows,coverage=coverage.collect(literature,stamp),queue=queue)

def quality(data,literature):
    if data!=collect(literature,data["built"]):raise ValueError("Сводка качества не воспроизводится")
    return {"literature_"+k:v for k,v in data["total"].items() if k in ("complete_bibliography","carried_bibliography","with_access_metadata","with_cc_evidence","with_reading_link","oa_reported_open","oa_reported_closed","oa_unchecked")}

def render(data):
    e=lambda x:escape(str(x),quote=True)
    body='<section class="mast"><p class="kicker">Научно-исследовательский центр</p><h1>Качество научного каталога</h1><p>'+e(NOTE)+'</p><p><a href="papers.html">Поиск статей</a> · <a href="journal-evidence.html">Классификация журналов</a> · <a href="'+FILE+'">Сводка JSON</a></p></section><section><h2>Полнота библиографических сведений</h2><div class="metrics">'
    for k,label in (("total","Статей"),("complete_bibliography","Авторы, том, номер и страницы / номер статьи"),("with_access_metadata","Метаданные лицензии / текста получены"),("with_cc_evidence","Заявленная действующая CC-лицензия версии"),("carried_bibliography","Ранее полученные поля"),("oa_reported_open","Свободная копия по OpenAlex"),("oa_reported_closed","Свободная копия не найдена"),("oa_unchecked","Не проверено OpenAlex"),("oa_deferred","Проверка отложена"),("oa_error","Ошибки OpenAlex"),("oa_not_found","DOI не найден OpenAlex")):
        body+='<div class="metric"><b>'+e(data["total"][k])+'</b>'+e(label)+'</div>'
    body+='</div><p>Критерий полноты — индикатор заполнения полей, а не универсальное требование к статье: у некоторых журналов нет номера или страниц.</p><div class="table-scroll" tabindex="0"><table><thead><tr><th>Журнал / ISSN</th><th>Статей</th><th>Полные сведения</th><th>Лицензии</th><th>Ссылка на текст</th><th>CC версии</th><th>Свободная копия по OpenAlex</th><th>DOI проверен HTTP</th><th>Ошибки / ограничения DOI</th></tr></thead><tbody>'
    for r in data["journals"]:
        c=r["counts"]
        body+='<tr><td>'+e(r["journal"])+' · '+e(r["issn"] or "—")+'</td>'+''.join('<td>'+e(v)+'</td>' for v in (c["total"],c["complete_bibliography"],c["with_license"],c["with_reading_link"],c["with_cc_evidence"],c["oa_reported_open"],c["link_ok"],c["link_missing"]+c["link_restricted"]+c["link_error"]))+'</tr>'
    import literature_coverage as coverage
    return body+'</tbody></table></div></section>'+coverage.render(data["coverage"])

def publish(page,out,stamp):
    lit=json.loads((out/"literature.json").read_text(encoding="utf-8"))
    d=collect(lit,stamp);quality(d,lit)
    (out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
    import literature_coverage as coverage
    for name,fields,rows in (("literature-journals.csv",coverage.REGISTRY_FIELDS,d["coverage"]["registry_journals"]),("literature-years.csv",coverage.FIELDS,d["coverage"]["rows"]),("literature-topics.csv",coverage.TOPIC_FIELDS,d["coverage"]["topics"])):
        coverage.save_csv(out/name,fields,rows);coverage.verify_csv(out/name,fields,rows)
    page("literature-quality.html",render(d))
    return d
