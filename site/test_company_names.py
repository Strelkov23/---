import unittest,tempfile,sqlite3,json,gzip
from pathlib import Path
import company_names as n
import company_index as i
import company_import as c
class Names(unittest.TestCase):
    def test_normalize(self):
        self.assertEqual(n.normalize('ПАО «СБЕРБАНК»'),'сбербанк')
        self.assertEqual(n.normalize('ООО Ёлка-2026'),'ёлка 2026')
        self.assertEqual(n.bucket('сбербанк'),n.bucket('сбе'))
        self.assertEqual(n.normalize('Общество с ограниченной ответственностью «Ромашка»'),'ромашка')
    def test_build(self):
        with tempfile.TemporaryDirectory() as t,sqlite3.connect(":memory:") as db:
            root=Path(t);src=root/'src';src.mkdir();out=root/'out';out.mkdir()
            c.setup(db)
            db.execute("INSERT INTO income VALUES(?,?,?,?,?,?,?)",("7707083893",2025,"ПАО Сбербанк",100,20,"a",1))
            db.execute("INSERT INTO employment VALUES(?,?,?,?,?,?)",("7707083893",2025,"ПАО Сбербанк",2,"b",1))
            ranks,paired,diff=c.rankings(db,2025);sources=[]
            for kind in ["income_expense","employment"]:
                s=dict(kind=kind,year=2025,source="https://example.org/"+kind,sha256="a"*64,schema_sha256="b"*64,complete=True,xml_members=1,processed_members=1,unique=1,documents=1,exact_duplicates=0,conflicts=0,additional_conflict_documents=0)
                sources.append(s);db.execute("INSERT INTO releases VALUES(?,?,?,?,?,?,?)",(kind,2025,s["source"],s["sha256"],1,1,1))
            r=dict(mode="full",year=2025,note=c.NOTE,sources=sources,rankings=ranks,paired=paired,name_mismatches=diff)
            idx=i.create(db,r,src);d=n.create(src,idx,out)
            self.assertEqual(d["count"],1)
            path=out/n.filename(n.bucket("сбе"))
            self.assertEqual(json.loads(gzip.decompress(path.read_bytes())),[["7707083893","ПАО Сбербанк"]])
            from unittest.mock import patch
            with patch.object(n,"MAX_COMBINED_BYTES",1):
                with self.assertRaises(ValueError):n.quality(d,out,idx)
            path.write_bytes(b"bad")
            with self.assertRaises(ValueError):n.quality(d,out,idx)
