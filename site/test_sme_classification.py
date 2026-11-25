import io,unittest,zipfile
import sme_classification as s
def fixture():
    return '<Файл><Документ ДатаСост="10.11.2026" КатСубМСП="1"><ОргВклМСП ИННЮЛ="7707083893" ОГРН="1027700132195"/><СведМН КодРегион="77"/><СвОКВЭД><СвОКВЭДОсн КодОКВЭД="64.19" ВерсОКВЭД="2014"/></СвОКВЭД><СвОКВЭДотч><СвОКВЭДОсн КодОКВЭД="62.01" ВерсОКВЭД="2014"/></СвОКВЭДотч></Документ><Документ ДатаСост="10.11.2026"><ИПВклМСП ИННФЛ="123456789012"/></Документ></Файл>'.encode()
class SME(unittest.TestCase):
    def test_parse(self):
        rows,c=s.parse_member(fixture(),"2026-11-10")
        self.assertEqual(c["individual_excluded"],1)
        self.assertEqual(rows[0][2:7],("77","64.19","2014","62.01","2014"))
        self.assertNotIn("123456789012",str(rows))
        with self.assertRaises(ValueError):s.parse_member(fixture(),"2026-10-10")
    def test_sample(self):
        data=io.BytesIO()
        with zipfile.ZipFile(data,"w") as z:
            z.writestr("a.xml",fixture());z.writestr("b.xml",fixture())
        with zipfile.ZipFile(data) as z:r=s.sample(z,"2026-11-10",2)
        self.assertEqual(r["unique_legal"],1);self.assertEqual(r["counts"]["exact_duplicates"],1)
        self.assertEqual(r["region_counts"],{"77":1})
        self.assertEqual(r["declared_okved2_class_counts"],{"64":1})
        self.assertEqual(r["mode"],"pilot")
    def test_quarantine_identifiers(self):
        raw=fixture().replace(b"1027700132195",b"1027700132190")
        rejected=[];rows,c=s.parse_member(raw,"2026-11-10",rejected)
        self.assertEqual(rows,[])
        self.assertEqual(c["legal"],1);self.assertEqual(c["quarantined"],1)
        self.assertEqual(rejected,[{"document":1,"reason":"ogrn"}])
        with self.assertRaises(ValueError):s.parse_member(raw,"2026-11-10")
