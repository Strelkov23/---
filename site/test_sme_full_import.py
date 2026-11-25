import io,sqlite3,unittest,zipfile
import sme_full_import as f
from test_sme_classification import fixture
class Full(unittest.TestCase):
    def test_complete(self):
        data=io.BytesIO()
        with zipfile.ZipFile(data,"w") as z:z.writestr("a.xml",fixture());z.writestr("b.xml",fixture())
        with sqlite3.connect(":memory:") as db,zipfile.ZipFile(data) as z:
            f.setup(db);r=f.full(db,z,"2026-11-10")
        self.assertEqual(r["unique_legal"],1)
        self.assertEqual(r["counts"]["individual_excluded"],2)
        self.assertEqual(r["counts"]["exact_duplicates"],1)
        self.assertEqual(r["declared_matrix"],[{"region":"77","class":"64","count":1}])
        self.assertEqual(r["reported_matrix"],[{"region":"77","class":"62","count":1}])
    def test_unexpected_member(self):
        data=io.BytesIO()
        with zipfile.ZipFile(data,"w") as z:z.writestr("a.xml",fixture());z.writestr("other.txt","x")
        with sqlite3.connect(":memory:") as db,zipfile.ZipFile(data) as z:
            f.setup(db)
            with self.assertRaises(ValueError):f.full(db,z,"2026-11-10")
    def test_quarantine_balance(self):
        data=io.BytesIO()
        with zipfile.ZipFile(data,"w") as z:
            z.writestr("a.xml",fixture());z.writestr("b.xml",fixture().replace(b"1027700132195",b"1027700132190"))
        with sqlite3.connect(":memory:") as db,zipfile.ZipFile(data) as z:
            f.setup(db);r=f.full(db,z,"2026-11-10")
        self.assertEqual(r["unique_legal"],1)
        self.assertEqual(r["counts"]["legal"],2)
        self.assertEqual(r["counts"]["quarantined"],1)
        self.assertEqual(r["quarantine"],[{"member":"b.xml","document":1,"reason":"ogrn"}])
        self.assertEqual(sum(x["count"] for x in r["declared_matrix"]),1)
