import csv,io,zipfile,unittest,copy,tempfile
from pathlib import Path
import regional_industry_extra as x
import regional_manufacturing as m

class ExtraIndustryTests(unittest.TestCase):
    def archive(self,change=lambda rows:None):
        rows=[]
        for year,edition in x.EDITIONS.items():
            for i in range(71):
                for g in x.GROUPS.values():
                    rows.append(dict(indicator_code=g["table"],indicator_name=x.TABLES[g["table"]][2],subsection=g["subsection"],object_name="Российская Федерация" if i==0 else f"Test region {i}",object_level="Страна" if i==0 else "Регион",object_oktmo=str(i),object_okato=str(i),year=year,indicator_value="1000" if g["id"].endswith("_total") else "-99999999.0" if i==1 else "-77777777.0" if i==2 else "0" if i==3 else "20",indicator_unit=x.UNIT,comment="",source=edition,version_date=x.RELEASE))
        change(rows)
        f=io.StringIO();w=csv.DictWriter(f,fieldnames=sorted(m.FIELDS),delimiter=";");w.writeheader();w.writerows(rows)
        z=io.BytesIO()
        with zipfile.ZipFile(z,"w",compression=zipfile.ZIP_DEFLATED) as a:a.writestr("data_industry_102_v20260313.csv",f.getvalue())
        return z.getvalue()
    def test_groups(self):
        rows=x.parse(self.archive())
        self.assertEqual(len(rows),1420)
        self.assertEqual(sum(r["value"] is None for r in rows),32)
        self.assertEqual(sum(r["value"]==0 for r in rows),16)
        d={**x.empty("2026-11-25"),"rows":rows,"sha256":m.EXPECTED_SHA256,"success":"2026-11-25"}
        self.assertEqual(x.quality(d)["regional_mining_energy_groups"],10)
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/"x.csv"
            with p.open("w",encoding="utf-8-sig",newline="") as f:
                w=csv.DictWriter(f,fieldnames=x.CSV_FIELDS);w.writeheader();w.writerows(x.csv_rows(d))
            x.verify_csv(p,d)
            p.write_text(p.read_text(encoding="utf-8-sig").replace("1000.0","999.0",1),encoding="utf-8-sig")
            with self.assertRaises(ValueError):x.verify_csv(p,d)
        with self.assertRaises(ValueError):x.quality(x.empty("2026-11-25"),d)
    def test_invalid(self):
        for change in [lambda rows:rows.append(rows[0].copy()),lambda rows:rows[0].update(subsection="unknown"),lambda rows:rows[0].update(year=2023),lambda rows:rows[0].update(indicator_unit="tonnes"),lambda rows:rows[0].update(indicator_value="-1"),lambda rows:rows[0].update(indicator_value="0")]:
            with self.subTest(change=change),self.assertRaises(ValueError):x.parse(self.archive(change))
