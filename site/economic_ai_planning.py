"""Deterministic research routes from diagnostics to planning tools.
No causal claims, no parameter changes, no automatic policy prescriptions.
"""
import json,math
from datetime import datetime
FILE="economic-ai-planning.json"
NOTE="Исследовательские маршруты, а не готовые управленческие решения. Сигнал не устанавливает причину. Параметры сценария задаёт пользователь; результаты условны."
RULES={
 "manufacturing":("Отраслевой выпуск и спрос","scenario.html#chain-stress","Сопоставить выпуск обработки, спрос и промежуточные закупки; проверить ограничения мощностей."),
 "industry-services":("Отраслевая структура","atlas.html#balance-matrix","Сопоставить структуру добавленной стоимости и промежуточные потоки; не смешивать темпы и уровни."),
 "manufacturing-share":("Структура промышленности","atlas.html#balance-matrix","Проверить структуру потоков и влияние текущих цен; доля не измеряет физический выпуск."),
 "trade":("Внешнеторговые ограничения","scenario.html#resource-plan","Проверить импортные ограничения и доступность промежуточных ресурсов; не отождествлять торговое сальдо с текущим счётом."),
 "export-cover":("Импортные ограничения","scenario.html#chain-stress","Проверить зависимость отраслей от импортных ресурсов; экспортное покрытие не доказывает доступность импорта."),
 "saving":("Инвестиционные ресурсы","scenario.html#reproduction-plan","Сопоставить сбережения, накопление и доступные инвестиционные ресурсы; не считать разрыв свободными бюджетными средствами."),
 "investment-growth":("Инвестиционная траектория","scenario.html#dynamic-plan","Проверить условные сценарии ввода мощностей, выбытия и инвестиционного лага."),
 "fixed-savings":("Финансирование накопления","scenario.html#reproduction-plan","Сопоставить ресурсы накопления и потребности капитала; не считать агрегат фактическим источником финансирования."),
 "productivity-ind":("Трудовые ресурсы промышленности","scenario.html#reproduction-plan","Сравнить сценарии производительности и потребности в труде с отраслевыми данными."),
 "productivity-agr":("Трудовые ресурсы сельского хозяйства","scenario.html#reproduction-plan","Проверить условные трудовые потребности и производительность; учитывать различия занятости и цен."),
 "employment-youth":("Рынок труда","labor.html","Проверить возрастную структуру и методику безработицы; не считать безработных готовым отраслевым резервом."),
 "age-dependency":("Доступность труда","scenario.html#reproduction-plan","Сопоставить демографическую структуру с фактической занятостью; задавать трудовые ограничения отдельно."),
 "price-gap":("Факторы цен","cost-decomposition.html","Разделить индексы с разными корзинами; исследовать затраты и цены без вывода об ошибке измерения.")
}
def finite(v):return type(v) in (int,float) and math.isfinite(v)
def build(diag,stamp):
    if diag["schema"]!=1 or datetime.fromisoformat(stamp).tzinfo is None:raise ValueError("Invalid diagnostics")
    rows=[];seen=set()
    for r in diag["rows"]:
        key=r["id"]
        if key not in RULES or key in seen:raise ValueError("Unknown or duplicate diagnostic")
        seen.add(key);title,href,action=RULES[key]
        status=r["status"]
        if status not in ("signal","ordinary","missing","short","constant","unavailable"):raise ValueError("Invalid diagnostic state")
        age=r.get("age")
        if status=="missing" or not finite(r.get("value")):priority="data_required"
        elif not isinstance(age,int) or age<0:raise ValueError("Invalid age")
        elif age>1:priority="refresh_first"
        elif status=="signal":priority="investigate"
        elif status=="ordinary":priority="monitor"
        else:priority="history_required"
        rows.append(dict(id=key,title=title,diagnostic=r["title"],year=r["year"],status=status,priority=priority,href=href,action=action,limit=r["note"],inputs=r["codes"]))
    if seen!=set(RULES):raise ValueError("Incomplete diagnostic coverage")
    order={"investigate":0,"refresh_first":1,"data_required":2,"history_required":3,"monitor":4}
    rows.sort(key=lambda r:(order[r["priority"]],r["id"]))
    return dict(schema=1,built=stamp,note=NOTE,rows=rows,counts={k:sum(r["priority"]==k for r in rows) for k in order})
def publish(out,stamp):
    data=build(json.loads((out/"economic-ai-diagnostics.json").read_text(encoding="utf-8")),stamp)
    (out/FILE).write_text(json.dumps(data,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
