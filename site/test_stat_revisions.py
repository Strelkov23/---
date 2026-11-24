import unittest
import stat_revisions as r
class RevisionTests(unittest.TestCase):
    def test_compare(self):
        a=r.series("X","руб.","https://example.org",{("A","2020"):1,("A","2021"):0,("A","2023"):4})
        b=r.series("X","руб.","https://example.org",{("A","2020"):2,("A","2021"):0,("A","2022"):3})
        batch=r.compare({("g","x"):a},{("g","x"):b,("g","new"):b},"2026-11-24","a"*64)
        self.assertEqual(batch["counts"],dict(revised=1,added=1,missing=1,definition=0))
        self.assertEqual(batch["new_series"],1)
        batch["omitted"]=0
        self.assertEqual(r.quality(dict(schema=1,builds=[batch]))["revision_events"],3)
        batch["omitted"]=1
        with self.assertRaises(ValueError):r.quality(dict(schema=1,builds=[batch]))
    def test_definition(self):
        a=r.series("X","руб.","https://example.org",{("","2020"):1})
        b=r.series("X","тыс. руб.","https://example.org",{("","2020"):2})
        batch=r.compare({("g","x"):a},{("g","x"):b},"2026-11-24",None)
        self.assertEqual(batch["counts"]["definition"],1)
        self.assertEqual(batch["counts"]["revised"],0)
    def test_zero(self):
        a=r.series("X","руб.",None,{("","2020"):0})
        self.assertEqual(sum(r.compare({("g","x"):a},{("g","x"):a},"t",None)["counts"].values()),0)
