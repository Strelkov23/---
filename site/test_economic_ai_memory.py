import unittest
from economic_ai_memory import delta,keys,validate,NOTE,STATES,FILE,MAX_HISTORY
class MemoryTests(unittest.TestCase):
    def test_delta(self):
        self.assertEqual(delta({"a","b"},{"b","c","d"}),{"added":2,"missing":1,"total":3})
    def test_duplicate(self):
        with self.assertRaises(ValueError):keys([{"id":"a"},{"id":"a"}],"id")
    def test_memory(self):
        row={"time":"2026-11-27T03:17:00+00:00","changes":{"series":{"added":1,"missing":0,"total":1}},"freshness":{k:0 for k in STATES},"recent_rejected":0,"recent_import_events":0}
        d={"schema":1,"note":NOTE,"built":row["time"],"latest":row,"history":[row],"files":{},"backlog":[]}
        self.assertEqual(validate(d)["memory_snapshots"],1)
        d["history"].append(row)
        with self.assertRaises(ValueError):validate(d)
    def test_self_reference(self):
        row={"time":"2026-11-27T03:17:00+00:00","changes":{},"freshness":{k:0 for k in STATES},"recent_rejected":0,"recent_import_events":0}
        d={"schema":1,"note":NOTE,"built":row["time"],"latest":row,"history":[row],"files":{FILE:{"sha256":"0"*64,"bytes":1}},"backlog":[]}
        with self.assertRaises(ValueError):validate(d)
if __name__=="__main__":unittest.main()
