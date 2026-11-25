import unittest
import bank_form_queue as q
class BankQueue(unittest.TestCase):
    def test_complete_partial_first(self):
        self.assertEqual(q.plan(["1","2","3","4","5"],{"5"},{"4"},{}, "2026-11-25",{"1":0,"2":2,"3":1,"4":0},4),["4","2","3","1"])
    def test_retry_and_limit(self):
        a={"2":{"checked":"2026-11-25"},"3":{"checked":"2026-11-01"}}
        self.assertEqual(q.plan(["1","2","3","4"],set(),set(),a,"2026-11-26",{"2":2,"3":2,"4":1}),["4","1","3"])
        self.assertEqual(len(q.plan([str(i) for i in range(1,100)],set(),set(),{},"2026-11-26")),20)
    def test_missing_snapshot(self):
        import tempfile
        with tempfile.TemporaryDirectory() as path:self.assertEqual(q.coverage(path),{})
