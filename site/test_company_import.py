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
