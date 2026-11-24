"""Reproducible checks of published tables, not independent source verification."""
import calendar,csv,json,math
from datetime import date
from html import escape
from collections import Counter

RULES={
 "rate":("Ключевая ставка: две таблицы ЦБ","п. п.",0.000001,"Ставка на конец завершённого месяца минус последнее дневное наблюдение не ранее чем за четыре дня до конца месяца."),
 "reserves":("Международные резервы","млн долл. США",3,"Общие резервы минус валютные резервы и монетарное золото; допуск округления."),
 "currency":("Валютные резервы","млн долл. США",3,"Валютные резервы минус иностранная валюта, СДР и резервная позиция в МВФ."),
 "money01":("Вложенность М0 и М1","трлн руб.",0.0001,"М1 минус М0 не должно быть отрицательным сверх допуска округления."),
 "money12":("Вложенность М1 и М2","трлн руб.",0.0001,"М2 минус М1 не должно быть отрицательным сверх допуска округления."),
 "sme":("МСП: охват региональных данных","единиц",0,"Итог РФ минус сумма региональных строк; ненулевой остаток требует объяснения, не является доказательством ошибки ведомства."),
 "budget_rev":("Федеральный бюджет: доходы Минфина и Казначейства","млрд руб.",0.2,"Годовой итог Минфина минус итог формы 0503117 Казначейства, делённый на 1 млрд. Сопоставляются завершённые годы; разные редакции не усредняются."),
 "budget_exp":("Федеральный бюджет: расходы Минфина и Казначейства","млрд руб.",0.2,"Тот же год, фактические федеральные расходы; Казначейство в рублях переводится в млрд руб. Различия могут отражать уточнения отчётности."),
 "budget_bal":("Федеральный бюджет: сальдо Минфина и Казначейства","млрд руб.",0.2,"Годовой дефицит/профицит, доходы минус расходы, без смены знака. Две публикации не обязательно независимы.")
}
def finite(v):return type(v) in (int,float) and math.isfinite(v)
def vals(s,k):return {r[k]:r["value"] for r in (s or {}).get("values",[]) if finite(r.get("value"))}
BUDGET_METRICS=("REV","EXP","BAL")
def budget_observations(out):
    """Read only known concepts, original units and exact national territory from the archive."""
    catalog=json.loads((out/"historical.json").read_text(encoding="utf-8"))
    result={}
    for series in catalog.get("series",[]):
        code=next((k for k in ("MINFIN_"+m for m in BUDGET_METRICS) if series["code"].startswith(k+"_")),None)
        if code is None:code=next((k for k in ("BUD_"+m for m in BUDGET_METRICS) if series["code"].startswith(k+"_")),None)
        if code is None:continue
        unit="млрд руб." if code.startswith("MINFIN_") else "руб."
        if series.get("unit")!=unit:raise ValueError("Неожиданная единица бюджета "+series["code"])
        doc=json.loads((out/series["file"]).read_text(encoding="utf-8"))
        if doc.get("unit")!=unit or doc.get("source")!=series.get("source"):raise ValueError("Метаданные бюджетного ряда не совпадают")
        for row in doc["values"]:
            if row["region"]!="Российская Федерация" or not finite(row["value"]):continue
            v=row["value"] if code.startswith("MINFIN_") else row["value"]/1_000_000_000
            result.setdefault(code,{}).setdefault(str(row["year"]),[]).append((v,series["source"]))
    return result

def budget_value(entries):
    if not entries:return None,"нет опубликованного ряда"
    values={v for v,_ in entries};sources=" | ".join(sorted({s for _,s in entries}))
    if len(values)!=1:return None,"несколько различающихся редакций: "+sources
    return next(iter(values)),sources

def create(national,cbr,sme,stamp,budget=None):
    rows=[]
    def emit(rule,period,a,b,note):
        d=a-b if finite(a) and finite(b) else None
        tol=RULES[rule][2]
        state="нет данных" if d is None else "согласовано" if (d>=-tol if rule.startswith("money") else abs(d)<=tol) else "расхождение"
        rows.append(dict(rule=rule,period=period,first=a,second=b,delta=d,status=state,note=note))
    daily=vals(cbr.get("KEY"),"date")
    last={}
    for day,v in sorted(daily.items()):last[day[:7]]=(day,v)
    for month,v in sorted(vals(national.get("KEY_END"),"period").items()):
        if not daily or month<min(daily)[:7] or month>=stamp[:7]:continue
        y,m=map(int,month.split("-"));end=date(y,m,calendar.monthrange(y,m)[1])
        pair=last.get(month)
        if pair and 0<=(end-date.fromisoformat(pair[0])).days<=4:emit("rate",month,v,pair[1],pair[0])
        else:emit("rate",month,v,None,"Нет близкой к концу месяца дневной записи")
    for rule,total,parts in [("reserves","RES_TOTAL",["RES_FX","RES_GOLD"]),("currency","RES_FX",["RES_CURRENCY","RES_SDR","RES_IMF"]),("money01","M1",["M0"]),("money12","M2",["M1"])]:
        a=vals(national.get(total),"period");bs=[vals(national.get(k),"period") for k in parts]
        for period,v in sorted(a.items()):
            components=[b.get(period) for b in bs]
            emit(rule,period,v,sum(components) if all(finite(x) for x in components) else None,total+" / "+" + ".join(parts))
    if sme.get("rows") and sme.get("period"):
        for k,label in [("total","Всего МСП"),("legal","ЮЛ"),("individual","ИП"),("workers","Работники")]:
            emit("sme",sme["period"]+" · "+label,sme.get("national",{}).get(k),sme.get("regional_sum",{}).get(k),"Итог / региональная сумма")
    budget=budget or {}
    for metric in BUDGET_METRICS:
        a=budget.get("MINFIN_"+metric,{});b=budget.get("BUD_"+metric,{})
        for period in sorted(set(a)|set(b)):
            if not period.isdigit() or int(period)>=int(stamp[:4]):continue
            va,sa=budget_value(a.get(period,[]));vb,sb=budget_value(b.get(period,[]))
            emit("budget_"+metric.lower(),period,va,vb,"Минфин: "+sa+"; Казначейство: "+sb)
    return dict(schema=1,built=stamp,rules={k:list(v) for k,v in RULES.items()},rows=rows,counts=dict(Counter(r["status"] for r in rows)))
def publish(page,out,stamp):
    def read(n):return json.loads((out/n).read_text(encoding="utf-8"))
    d=create(read("national.json"),read("cbr.json"),read("sme-regions.json"),stamp,budget_observations(out))
    (out/"consistency.json").write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"consistency.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.writer(f);w.writerow(["Правило","Период","Первое","Второе","Разность","Единица","Допуск","Результат","Методика","Примечание"])
        for r in d["rows"]:
            title,unit,tol,method=RULES[r["rule"]];w.writerow([title,r["period"],r["first"],r["second"],r["delta"],unit,tol,r["status"],method,r["note"]])
    body="<h1>Сверка экономических данных</h1><p>Совпадение означает согласованность опубликованных таблиц, а не независимую достоверность первоисточника. Расхождения не исправляются автоматически.</p><p><a href='consistency.csv'>Все проверки CSV</a> · <a href='consistency.json'>JSON</a> · <a href='freshness.html'>Контроль обновлений</a> · <a href='methodology.html#consistency-method'>Методика</a></p>"
    def fmt(v):return "—" if v is None else f"{v:.12g}" if finite(v) else str(v)
    for key,(title,unit,tol,method) in RULES.items():
        rows=[r for r in d["rows"] if r["rule"]==key];counts=Counter(r["status"] for r in rows)
        body+="<section><h2>"+escape(title)+"</h2><p>"+escape(method)+" Допуск: "+str(tol)+" "+escape(unit)+".</p><p>Согласовано: "+str(counts["согласовано"])+" · Расхождения: "+str(counts["расхождение"])+" · Пропуски: "+str(counts["нет данных"])+"</p>"
        if not rows:body+="<p>Нет наблюдений для проверки.</p>"
        else:
            ordered=sorted(rows,key=lambda r:(r["status"]=="согласовано",r["period"]),reverse=False)
            body+="<details><summary>Показать таблицу (до 30 строк; полный CSV выше)</summary><table><tr><th>Период</th><th>Первое</th><th>Второе</th><th>Разность</th><th>Результат</th></tr>"
            for r in ordered[:30]:body+="<tr>"+"".join("<td>"+escape(fmt(r[k]))+"</td>" for k in ("period","first","second","delta","status"))+"</tr>"
            body+="</table></details>"
        body+="</section>"
    page("consistency.html",body)
