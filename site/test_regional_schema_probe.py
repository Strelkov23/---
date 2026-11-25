import io,zipfile,unittest
from urllib.error import HTTPError
import regional_schema_probe as p
class RegionalSchemaTests(unittest.TestCase):
    def archive(self,text):
        buf=io.BytesIO()
        with zipfile.ZipFile(buf,"w") as z:z.writestr("a.csv",text)
        return buf.getvalue()
    def test_metadata(self):
        r=p.inspect(self.archive("region;year;indicator;unit;value\nМосква;2024;Экспорт товаров;млн долл.;123\n"),"foreign_trade")[0]
        self.assertEqual(r["matching_labels"],1)
        self.assertEqual(r["periods"],[2024])
        self.assertEqual(r["labels"][0]["rows"],1)
        self.assertNotIn("value",r["labels"][0])
    def test_unknown_schema_remains_diagnostic(self):
        r=p.inspect(self.archive("unknown;field\nfoo;bar\n"),"agriculture")[0]
        self.assertEqual(r["distinct_labels"],0)
        self.assertEqual(r["headers"],["unknown","field"])
    def test_invalid_rows(self):
        with self.assertRaises(ValueError):p.inspect(self.archive("a;b\nx;y;z\n"),"ict")
    def test_denial(self):
        calls=[]
        def fetch(section):
            calls.append(section);raise HTTPError("https://example.com",429,"limited",{},None)
        r=p.probe(fetch)
        self.assertEqual(len(calls),1)
        self.assertEqual(r["results"][1]["status"],"skipped_access_restriction")
