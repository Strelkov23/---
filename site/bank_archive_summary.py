"""Public coverage only, from a successful official archive probe."""
import json,os,re,html
from pathlib import Path
from datetime import date,datetime
FILE="bank-archive-summary.json"
NOTE="Диагностика охвата централизованных архивов ЦБ. Не финансовые значения, рейтинг или оценка соблюдения нормативов."
def quality(data):
    if data["schema"]!=1 or data["note"]!=NOTE:raise ValueError("Паспорт архива")
    if data["status"]=="not_loaded":
        if data["forms"] or data["checked"] is not None:raise ValueError("Пустой архив")
        return {"bank_archive_forms":0,"bank_archive_135_observations":0,"bank_archive_135_organizations":0}
    if data["status"] not in ("verified","cached") or set(data["forms"])!={"123","135"}:raise ValueError("Комплект архивов")
    checked=datetime.fromisoformat(data["checked"])
    if checked.tzinfo is None:raise ValueError("Время проверки")
    for form,r in data["forms"].items():
        day=date.fromisoformat(r["date"])
        if day>checked.date() or day.day!=1:raise ValueError("Дата архива")
        if not re.fullmatch(r"https://www\.cbr\.ru/vfs/credit/forms/"+form+"-"+day.strftime("%Y%m%d")+r"\.(rar|zip)",r["source"]):raise ValueError("Источник архива")
        if not re.fullmatch(r"[a-f0-9]{64}",r["sha256"]):raise ValueError("Отпечаток архива")
        for k in ("directory","values","matched"):
            if type(r[k]) is not int or not 0<r[k]<=10000:raise ValueError("Охват архива")
        if r["matched"]>min(r["directory"],r["values"]):raise ValueError("Сверка номеров")
    m=data["forms"]["135"]
    for k in ("observations","organizations","codes","excluded","source_rows"):
        if type(m[k]) is not int or not 0<=m[k]<=100000:raise ValueError("Охват нормативов")
    if not 0<m["organizations"]<=min(m["matched"],m["observations"]) or not 0<m["codes"]<=m["observations"] or m["observations"]+m["excluded"]!=m["source_rows"]:raise ValueError("Баланс нормативов")
    return {"bank_archive_forms":2,"bank_archive_135_observations":m["observations"],"bank_archive_135_organizations":m["organizations"]}
def read(path):
    if not 0<path.stat().st_size<=8*1024*1024:raise ValueError("Размер артефакта")
    return json.loads(path.read_text(encoding="utf-8"))
def from_artifact(folder):
    report=read(folder/"report.json");forms={}
    for r in report["archives"]:
        f=r["form"]
        if f not in ("123","135") or f in forms or r.get("error") or not r.get("members"):raise ValueError("Архив не проверен")
        raw=read(folder/("form-"+f+"-raw.json"))
        if raw["form"]!=f or raw["date"]!=r["date"] or raw["archive_sha256"]!=r["sha256"] or raw["url"]!=r["url"]:raise ValueError("Несогласованный артефакт")
        c=raw["coverage"]
        if c!=r["raw_coverage"] or c["matched_unique_regn"]+len(c["unmatched_regn"])!=c["values_unique_regn"]:raise ValueError("Сверка охвата")
        tables=raw["tables"]
        value_key="123D" if f=="123" else "135_3"
        expected={f+"B",value_key}|({"123N"} if f=="123" else set())
        if set(tables)!=expected:raise ValueError("Состав таблиц")
        members={m["member"]:m["sha256"] for m in r["members"]}
        if len(members)!=len(r["members"]) or any(members.get(v["member"])!=v["sha256"] for v in tables.values()):raise ValueError("Отпечатки исходных таблиц")
        def numbers(table):
            if len(table["rows"])+table["deleted"]!=table["source_rows"]:raise ValueError("Баланс таблицы")
            ids=[x["source_row"] for x in table["rows"]]
            if len(set(ids))!=len(ids) or any(type(n) is not int or not 1<=n<=table["source_rows"] for n in ids):raise ValueError("Номера исходных строк")
            return {str(int(x["REGN"])) for x in table["rows"] if isinstance(x["REGN"],str) and re.fullmatch(r"\d{1,6}",x["REGN"])}
        directory_ids=numbers(tables[f+"B"]);value_ids=numbers(tables[value_key])
        if (len(directory_ids),len(value_ids),len(directory_ids&value_ids),sorted(value_ids-directory_ids,key=int))!=(c["directory_unique_regn"],c["values_unique_regn"],c["matched_unique_regn"],c["unmatched_regn"]):raise ValueError("Охват не совпадает с исходными строками")
        forms[f]=dict(date=r["date"],source=r["url"],sha256=r["sha256"],directory=c["directory_unique_regn"],values=c["values_unique_regn"],matched=c["matched_unique_regn"])
        if f=="135":
            mapped=read(folder/"form-135-documented.json");counts=mapped["counts"];rows=mapped["rows"]
            if mapped["archive_sha256"]!=r["sha256"] or mapped["date"]!=r["date"] or counts!=r["mapped_counts"]:raise ValueError("Несогласованная форма 135")
            if counts["observations"]!=len(rows) or counts["organizations"]!=len({x["registration_number"] for x in rows}) or counts["codes"]!=len({x["code"] for x in rows}) or any(x["date"]!=r["date"] for x in rows):raise ValueError("Сверка наблюдений")
            if mapped["table_sha256"]!=tables[value_key]["sha256"] or mapped["directory_sha256"]!=tables[f+"B"]["sha256"]:raise ValueError("Отпечатки формы 135")
            if counts["source_active_rows"]!=len(tables[value_key]["rows"]):raise ValueError("Исходное число наблюдений")
            value_rows={x["source_row"]:x for x in tables[value_key]["rows"]}
            directory_rows={x["source_row"]:x for x in tables[f+"B"]["rows"]}
            pairs=set()
            used=set()
            for x in rows:
                key=(x["registration_number"],x["code"])
                if key in pairs or x["source_row"] in used:raise ValueError("Дубликат наблюдения")
                pairs.add(key);used.add(x["source_row"])
                v=value_rows.get(x["source_row"],{});bank=directory_rows.get(x["directory_row"],{})
                def code(v):
                    if isinstance(v,dict) and set(v)=={"hex"}:return "hex:"+v["hex"]
                    return v
                if not v or not bank or str(int(v["REGN"]))!=key[0] or str(int(bank["REGN"]))!=key[0] or code(v["C1_3"])!=key[1] or v["C2_3"]!=x["actual_percent"] or v["C3_3"]!=x["control_percent"] or bank["DT"]!=r["date"].replace("-",""):raise ValueError("Наблюдение не совпадает с исходной строкой")
            forms[f].update(observations=counts["observations"],organizations=counts["organizations"],codes=counts["codes"],excluded=sum(counts["excluded"].values()),source_rows=counts["source_active_rows"])
    data=dict(schema=1,note=NOTE,status="verified",checked=report["checked"],forms=forms)
    quality(data);return data
def publish(out,previous,folder=None):
    data=dict(schema=1,note=NOTE,status="not_loaded",checked=None,forms={})
    try:
        old=read(previous/FILE);quality(old)
        if old["forms"]:data=dict(old,status="cached")
    except (OSError,ValueError,KeyError,TypeError,AttributeError):pass
    if folder:
        try:
            new=from_artifact(Path(folder))
            if not data["forms"] or (all(new["forms"][k]["date"]>=data["forms"][k]["date"] for k in ("123","135")) and new["checked"]>=data["checked"]):data=new
        except (OSError,ValueError,KeyError,TypeError,AttributeError) as e:print("BANK_ARCHIVE_ARTIFACT_REJECTED",str(e)[:180],flush=True)
    quality(data)
    (out/FILE).write_text(json.dumps(data,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    return data
def render(data):
    quality(data)
    if not data["forms"]:return "<p>Подтверждённый комплект архивов ещё не загружен.</p>"
    status="Проверенный комплект" if data["status"]=="verified" else "Сохранённый проверенный комплект"
    rows=[]
    for form,r in sorted(data["forms"].items()):
        rows.append("<tr><td><a href='"+html.escape(r["source"],quote=True)+"'>"+form+"</a></td><td>"+r["date"]+"</td><td>"+str(r["directory"])+"</td><td>"+str(r["matched"])+"</td></tr>")
    m=data["forms"]["135"]
    return ("<p>"+status+" · проверка "+html.escape(data["checked"])+"</p><div class='table-scroll'><table><thead><tr><th>Форма</th><th>Дата</th><th>Номеров в справочнике</th><th>Совпавших номеров</th></tr></thead><tbody>"+"".join(rows)+"</tbody></table></div><p>Форма 135: "+str(m["observations"])+" наблюдений по "+str(m["organizations"])+" организациям, "+str(m["codes"])+" исходных кодов. Исключено "+str(m["excluded"])+" строк. Названия кодов и оценка соблюдения не публикуются.</p>")
