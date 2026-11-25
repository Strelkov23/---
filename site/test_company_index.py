import sqlite3,tempfile,unittest
from pathlib import Path
import company_import as c
import company_index as x
class TestCompanyIndex(unittest.TestCase):
    def test_full_small(self):
        with tempfile.TemporaryDirectory() as t,sqlite3.connect(":memory:") as db:
            c.setup(db);out=Path(t)
            db.execute("INSERT INTO income VALUES(?,?,?,?,?,?,?)",("7707083893",2025,"ПАО Тест",9007199254740993,12,"a",1))
            db.execute("INSERT INTO employment VALUES(?,?,?,?,?,?)",("7707083893",2025,"ПАО Тест",0,"b",2))
            db.execute("INSERT INTO employment VALUES(?,?,?,?,?,?)",("7704211201",2025,"Другая",8,"b",3))
            ranks,paired,diff=c.rankings(db,2025)
            sources=[]
            for kind,n in [("income_expense",1),("employment",2)]:
                s=dict(kind=kind,year=2025,source="https://example.org/"+kind,sha256="a"*64,schema_sha256="b"*64,complete=True,xml_members=1,processed_members=1,unique=n,documents=n,exact_duplicates=0,conflicts=0,additional_conflict_documents=0)
                sources.append(s);db.execute("INSERT INTO releases VALUES(?,?,?,?,?,?,?)",(kind,2025,s["source"],s["sha256"],1,1,n))
            report=dict(mode="full",year=2025,note=c.NOTE,sources=sources,rankings=ranks,paired=paired,name_mismatches=diff)
            d=x.create(db,report,out)
            self.assertEqual(d["count"],2);self.assertEqual(d["paired"],1)
            self.assertEqual(x.lookup(d,out,"7707083893")["income_cents"],"9007199254740993")
            self.assertEqual(x.lookup(d,out,"7704211201")["workers"],8)
            path=out/x.filename(x.bucket("7707083893"));path.write_bytes(b"bad")
            with self.assertRaises(ValueError):x.quality(d,out)
    def test_empty(self):
        self.assertEqual(x.quality(x.empty())["company_index_records"],0)
        with self.assertRaises(ValueError):x.bucket("1234567890")
