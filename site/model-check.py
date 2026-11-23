"""python3 model-check.py [group 1..19] [shock in percent]
Input: model-input.csv, stored alongside this script. Units: million rubles, 2021.
Matrix L is the detailed domestic Leontief inverse. Source worksheet: Симм отеч.
"""
import csv
import sys
from pathlib import Path

group = int(sys.argv[1]) if len(sys.argv)>1 else 9
shock = float(sys.argv[2]) if len(sys.argv)>2 else 10
with Path(__file__).with_name("model-input.csv").open() as f:
    rows = list(csv.DictReader(f))
dy = [float(r["domestic_final_demand"])*shock/100 if int(r["group"])==group else 0 for r in rows]
result = [sum(float(row["L"+str(i+1)])*v for i,v in enumerate(dy))/1000 for row in rows]
print("Группа;Изменение валового выпуска, млрд руб.")
for g in range(1,20):
    print(g,round(sum(v for v,r in zip(result,rows) if int(r["group"])==g),4),sep=";")
print("Всего", round(sum(result),4),sep=";")
print("Импортные промежуточные затраты",round(sum(v*float(r["import_ratio"]) for v,r in zip(result,rows)),4),sep=";")
