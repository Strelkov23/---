import csv,io,zipfile,unittest,copy
import regional_manufacturing as m
import historical

class ManufacturingTests(unittest.TestCase):
    def archive(self,modify=lambda rows:None):
        rows=[]
        for y,edition in m.EDITIONS.items():
            for i in range(71):
                for g in m.GROUPS:
                    rows.append(dict(indicator_code=m.CODE,indicator_name=m.TITLE,subsection=g[3][0],object_name="Российская Федерация" if i==0 else f"Test region {i}",object_level="Страна" if i==0 else "Регион",object_oktmo=str(i),object_okato=str(i),year=y,indicator_value="1000" if g[0]=="total" else "-77777777.0" if i==1 and g[0]=="light" else "0" if i==2 and g[0]=="light" else "25",indicator_unit=m.UNIT,comment="",source=edition,version_date=m.RELEASE))
        modify(rows)
        f=io.StringIO();w=csv.DictWriter(f,fieldnames=sorted(m.FIELDS),delimiter=";");w.writeheader();w.writerows(rows)
        z=io.BytesIO()
        with zipfile.ZipFile(z,"w",compression=zipfile.ZIP_DEFLATED) as a:a.writestr("data_industry_102_v20260313.csv",f.getvalue())
        return z.getvalue()
    def test_exact_groups_and_missing(self):
        rows=m.parse(self.archive())
        self.assertEqual(len(rows),1988)
        self.assertEqual(len({r["group"] for r in rows}),14)
        suppressed=[r for r in rows if r["raw_value"]=="-77777777.0"]
        self.assertEqual(len(suppressed),2)
        self.assertTrue(all(r["value"] is None for r in suppressed))
        self.assertEqual(sum(r["value"]==0 for r in rows),2)
        d={**m.empty("2026-11-25"),"rows":rows,"sha256":m.EXPECTED_SHA256,"success":"2026-11-25"}
        self.assertEqual(m.quality(d)["regional_manufacturing_groups"],13)
        bad=copy.deepcopy(d);bad["rows"][0]["value"]=-1
        with self.assertRaises(ValueError):m.quality(bad)
        with self.assertRaises(ValueError):m.quality(m.empty("2026-11-25"),d)
    def test_invalid_rows(self):
        for modify in [lambda rows:rows.append(rows[0].copy()),lambda rows:rows[0].update(subsection="unknown"),lambda rows:rows[0].update(year=2023),lambda rows:rows[0].update(indicator_unit="tons")]:
            with self.subTest(modify=modify),self.assertRaises(ValueError):m.parse(self.archive(modify))
    def test_values_and_legacy(self):
        self.assertEqual(m.number(0),0)
        self.assertIsNone(m.number("-77777777.0"))
        with self.assertRaises(ValueError):m.number("-1")
        self.assertIn("Мебель",m.legacy_title("R_f55cefbbeba36842",m.SOURCE,m.TITLE))
        self.assertEqual(m.legacy_title("R_f55cefbbeba36842","other",m.TITLE),m.TITLE)
        self.assertEqual(historical.MIRROR_MISSING_MARKERS,{-77777777,-99999999})
