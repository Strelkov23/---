import io,sqlite3,tempfile,unittest,zipfile
from pathlib import Path
import company_import as c
def xml(income="100.25",expense="90",inn="7707083893"):
    return f'<Файл><Документ><СведНП ИННЮЛ="{inn}" НаимОрг="ПАО Тест"/><СведДохРасх СумДоход="{income}" СумРасход="{expense}"/></Документ></Файл>'.encode()
class TestImport(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(list(c.parse_xml(xml(),"income_expense")), [("7707083893","ПАО Тест",10025,9000)])
        self.assertEqual(c.amount("0"),0);self.assertIsNone(c.amount(None));self.assertFalse(c.inn_valid("7707083894"))
        with self.assertRaises(ValueError):list(c.parse_xml(xml(inn="7707083894"),"income_expense"))
    def test_duplicates(self):
        with tempfile.TemporaryDirectory() as t,sqlite3.connect(":memory:") as db:
            p=Path(t)/"data.zip";c.setup(db)
            with zipfile.ZipFile(p,"w") as z:
                z.writestr("1.xml",xml());z.writestr("2.xml",xml());z.writestr("3.xml",xml(income="200"))
            d=c.import_zip(db,p,"income_expense",2025)
            self.assertEqual(d["documents"],3);self.assertEqual(d["exact_duplicates"],1);self.assertEqual(d["conflicts"],1);self.assertEqual(d["unique"],0)
    def test_employment(self):
        raw='<Файл><Документ><СведНП ИННЮЛ="7707083893" НаимОрг="ПАО Тест"/><СведССЧР КолРаб="0"/></Документ></Файл>'.encode()
        self.assertEqual(list(c.parse_xml(raw,"employment")),[("7707083893","ПАО Тест",0)])

    def test_rankings(self):
        with sqlite3.connect(":memory:") as db:
            c.setup(db)
            db.execute("INSERT INTO income VALUES(?,?,?,?,?,?,?)",("7707083893",2025,"ПАО Тест",9007199254740993,100,"a",1))
            db.execute("INSERT INTO employment VALUES(?,?,?,?,?,?)",("7707083893",2025,"ПАО Другое",3,"b",1))
            db.execute("INSERT INTO employment VALUES(?,?,?,?,?,?)",("7704211201",2025,"Другая",8,"b",2))
            ranks,paired,diff=c.rankings(db,2025)
            self.assertEqual(ranks["income"]["rows"][0]["income_cents"],"9007199254740993")
            self.assertEqual(ranks["employment"]["rows"][0]["workers"],8)
            self.assertEqual(paired,1);self.assertEqual(diff,1)
    def test_empty_quality(self):
        self.assertEqual(c.quality(c.empty())["corporate_income_records"],0)
        with self.assertRaises(ValueError):c.quality(dict(c.empty(),status="ok"))

    def test_index_retry_independent(self):
        release={"income_expense":"a","employment":"b"}
        d={"checked":"2026-11-25T11:00:00Z"}
        self.assertTrue(c.refresh_due(d,"2026-11-25",release,release,None))
        self.assertFalse(c.refresh_due(d,"2026-11-25",release,release,True))
        d.update(index_attempt="2026-11-25",index_retry_revision=c.INDEX_RETRY_REVISION)
        self.assertFalse(c.refresh_due(d,"2026-11-26",release,release,None))
        self.assertTrue(c.refresh_due(d,"2026-11-27",release,release,None))
        new={**release,"employment":"c"}
        self.assertTrue(c.refresh_due(d,"2026-11-25",new,release,True))
        d.update(import_attempt="2026-11-25",import_attempt_release=new)
        self.assertFalse(c.refresh_due(d,"2026-11-25",new,release,True))
        self.assertTrue(c.refresh_due(d,"2026-11-26",new,release,True))
