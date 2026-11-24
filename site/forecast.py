"""Transparent univariate forecasts, fixed holdout and horizon-specific model selection.
Historical values are latest-vintage, not a real-time vintage backtest."""
import csv
import json
import math
from statistics import mean
from pathlib import Path

ANNUAL={
 "NY.GDP.MKTP.KD.ZG":None,
 "NY.GDP.MKTP.KD":(0,None),
 "FP.CPI.TOTL.ZG":None,
 "SL.UEM.TOTL.ZS":(0,100),
 "NE.GDI.FTOT.ZS":(0,None),
 "NV.AGR.TOTL.KD.ZG":None,
 "NV.IND.MANF.KD.ZG":None,
 "NV.SRV.TOTL.KD.ZG":None,
 "SP.POP.TOTL":(0,None),
 "SP.DYN.LE00.IN":(0,None),
 "NE.EXP.GNFS.ZS":(0,None),
 "NE.IMP.GNFS.ZS":(0,None),
}
MONTHLY={"CPI_YOY":None,"RES_TOTAL":(0,None),"M2":(0,None),"M2X":(0,None)}
LABELS={"last":"Последнее значение","mean3":"Среднее трёх периодов","drift5":"Дрейф за пять периодов","trend8":"Линейный тренд восьми периодов","seasonal":"Тот же месяц прошлого года"}
MIN_TRAIN=8
HOLDOUT=5
MIN_DEVELOPMENT=5
def valid(v):return type(v) in (int,float) and math.isfinite(v)
def month_index(s):
    y,m=map(int,s.split("-"))
    if not 1<=m<=12:raise ValueError("Invalid month")
    return 12*y+m-1
def period_name(t,monthly):return f"{t//12:04d}-{t%12+1:02d}" if monthly else str(t)
def tail(values):
    """Use latest contiguous observed block; never fill gaps."""
    if not values:return []
    end=max(values);start=end
    while start-1 in values:start-=1
    return [(t,values[t]) for t in range(start,end+1)]
def predict(train,h,method,bounds):
    if h<1 or len(train)<MIN_TRAIN:raise ValueError("Insufficient training")
    if method=="last":v=train[-1]
    elif method=="mean3":v=mean(train[-3:])
    elif method=="drift5":v=train[-1]+h*(train[-1]-train[-5])/4
    elif method=="trend8":
        y=train[-8:];center=3.5;avg=mean(y)
        slope=sum((i-center)*(x-avg) for i,x in enumerate(y))/42
        v=avg+slope*(7+h-center)
    elif method=="seasonal":
        if len(train)<12 or h>12:raise ValueError("Seasonal method unavailable")
        v=train[h-13]
        # Forecast at t+h: observation at t+h-12, with t at index len(train)-1.
    else:raise ValueError("Unknown method")
    if bounds:
        lo,hi=bounds
        if lo is not None:v=max(lo,v)
        if hi is not None:v=min(hi,v)
    if not valid(v):raise ValueError("Nonfinite forecast")
    return v
def metrics(rows):
    e=[r["error"] for r in rows]
    return dict(n=len(e),mae=mean(abs(v) for v in e),rmse=math.sqrt(mean(v*v for v in e)),bias=mean(e))
def evaluate(values,h,monthly,bounds):
    methods=["last","mean3","drift5","trend8"]+(["seasonal"] if monthly else [])
    n=len(values);minimum=12 if monthly else MIN_TRAIN
    origins=list(range(minimum-1,n-h))
    if len(origins)<HOLDOUT+MIN_DEVELOPMENT:return None
    test=origins[-HOLDOUT:]
    # Training for each holdout origin may use observations known at that origin;
    # method selection must use only targets available at first holdout origin.
    dev=[i for i in origins if i+h<=test[0]]
    if len(dev)<MIN_DEVELOPMENT:return None
    y=[v for _,v in values]
    def folds(method,indices):
        out=[]
        for i in indices:
            pred=predict(y[:i+1],h,method,bounds);actual=y[i+h]
            out.append(dict(origin=period_name(values[i][0],monthly),target=period_name(values[i+h][0],monthly),prediction=pred,actual=actual,error=pred-actual))
        return out
    dev_results={m:folds(m,dev) for m in methods}
    scores={m:metrics(dev_results[m]) for m in methods}
    winner=min(methods,key=lambda m:scores[m]["mae"])
    test_results={m:folds(m,test) for m in methods}
    test_scores={m:metrics(test_results[m]) for m in methods}
    naive=test_scores['last']['mae']
    skill=100*(1-test_scores[winner]['mae']/naive) if naive>0 else None
    # Exploratory independent-on-holdout range diagnostic: the radius is frozen
    # using development errors, before inspecting any control outcomes.
    development_errors=sorted(abs(r["error"]) for r in dev_results[winner])
    early_radius=development_errors[math.ceil(.8*len(development_errors))-1]
    def interval(point,radius):
        lo,hi=point-radius,point+radius
        if bounds:
            if bounds[0] is not None:lo=max(lo,bounds[0])
            if bounds[1] is not None:hi=min(hi,bounds[1])
        return lo,hi
    interval_checks=[]
    for fold in test_results[winner]:
        lo,hi=interval(fold["prediction"],early_radius)
        interval_checks.append(dict(origin=fold["origin"],target=fold["target"],low=lo,high=hi,actual=fold["actual"],covered=lo<=fold["actual"]<=hi))
    calibration=dict(radius=early_radius,n=len(interval_checks),covered=sum(x["covered"] for x in interval_checks),folds=interval_checks,
        development_n=len(development_errors),note="Описательная проверка диапазона по ранним ошибкам; не вероятностная калибровка.")
    errs=sorted(abs(r["error"]) for r in test_results[winner])
    # Descriptive range based on the held-out errors, not a calibrated prediction interval.
    # With five errors the 80th nearest-rank absolute error is the fourth.
    radius=errs[math.ceil(.8*len(errs))-1]
    point=predict(y,h,winner,bounds)
    lo,hi=interval(point,radius)
    return dict(horizon=h,selected=winner,origin=period_name(values[-1][0],monthly),
      target=period_name(values[-1][0]+h,monthly),point=point,low=lo,high=hi,error_radius=radius,
      development=scores,holdout=test_scores,skill_vs_last_pct=skill,range_check=calibration,development_folds=dev_results,holdout_folds=test_results,
      selection_cutoff=period_name(values[test[0]][0],monthly),holdout_start=period_name(values[test[0]+h][0],monthly))
def series(code,title,unit,raw,monthly,bounds,source,checked,stamp):
    block=tail(raw)
    runs=[evaluate(block,h,monthly,bounds) for h in range(1,7 if monthly else 4)]
    results=[r for r in runs if r is not None]
    return dict(code=code,title=title,unit=unit,monthly=monthly,source=source,checked=checked,built=stamp,
      input_count=len(raw),used_count=len(block),first=period_name(block[0][0],monthly) if block else None,
      last=period_name(block[-1][0],monthly) if block else None,
      history=[dict(period=period_name(t,monthly),value=v) for t,v in sorted(raw.items())],results=results,
      status="Рассчитано" if results else "Недостаточно непрерывных наблюдений")
def publish(out,stamp):
    compare=json.loads((out/"compare.json").read_text());catalog=json.loads((out/"catalog.json").read_text())
    current_year=int(stamp[:4]);rows=[]
    for code,bounds in ANNUAL.items():
        if code not in compare:continue
        s=compare[code];meta=catalog[code]
        raw={int(k):v for k,v in s["values"].items() if k.isdigit() and int(k)<current_year and valid(v)}
        rows.append(series(code,s["title"],s["unit"],raw,False,bounds,meta["source"],meta.get("success"),stamp))
    # Closed calendar months only; even beginning-of-month stock series
    # use the same conservative cutoff. A target may already be historical.
    current_month=month_index(stamp[:7])
    national=json.loads((out/"national.json").read_text())
    for code,bounds in MONTHLY.items():
        if code not in national:continue
        s=national[code];raw={}
        for r in s["values"]:
            t=month_index(r["period"])
            if t>=current_month or not valid(r.get("value")):continue
            if t in raw:raise ValueError("Duplicate national month")
            raw[t]=r["value"]
        rows.append(series(code,s["title"],s["unit"],raw,True,bounds,s["source"],s.get("success"),stamp))
    industry=json.loads((out/"industry.json").read_text())
    # Only verified observations from one homogeneous systematic workbook.
    primary="https://www.rosstat.gov.ru/storage/mediabank/ind_baza_2023.xlsx"
    eligible=[r for r in industry if r.get("url")==primary and r.get("sheet") and r.get("verified") and valid(r.get("value"))]
    raw={}
    for r in eligible:
        t=month_index(r["period"])
        if t>=current_month:continue
        if t in raw:raise ValueError("Duplicate monthly observation")
        raw[t]=r["value"]
    rows.append(series("INDUSTRY_YOY","Индекс промышленного производства к тому же месяцу предыдущего года","% (прошлый год = 100)",raw,True,(0,None),primary,min((r["verified"] for r in eligible),default=None),stamp))
    data=dict(built=stamp,methods=LABELS,series=rows,notice="Последние редакции исторических наблюдений; не реальное историческое наличие данных. Диапазон — описательный по пяти контрольным ошибкам, не вероятностный интервал.")
    (out/"forecast.json").write_text(json.dumps(data,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"forecast.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.writer(f);w.writerow(["code","title","unit","source","last_observation","horizon","target","method","point","descriptive_low","descriptive_high","holdout_mae","holdout_rmse","holdout_bias","holdout_n","skill_vs_last_pct","early_range_radius","early_range_covered","early_range_n","selection_cutoff","built"])
        for s in rows:
            for r in s["results"]:
                score=r["holdout"][r["selected"]]
                w.writerow([s["code"],s["title"],s["unit"],s["source"],s["last"],r["horizon"],r["target"],r["selected"],r["point"],r["low"],r["high"],score["mae"],score["rmse"],score["bias"],score["n"],r["skill_vs_last_pct"],r["range_check"]["radius"],r["range_check"]["covered"],r["range_check"]["n"],r["selection_cutoff"],stamp])
    with (out/"forecast-backtests.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.writer(f);w.writerow(["code","unit","horizon","split","method","selected","origin","target","prediction","actual","error","source","built"])
        for s in rows:
            for r in s["results"]:
                for split in ("development","holdout"):
                    for method,folds in r[split+"_folds"].items():
                        for x in folds:w.writerow([s["code"],s["unit"],r["horizon"],split,method,method==r["selected"],x["origin"],x["target"],x["prediction"],x["actual"],x["error"],s["source"],stamp])
